import {
  deleteField,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { defaultRetroFdlData } from "../retroDefaults";
import type {
  RetroFdlNote,
  RetroFdlTag,
  RetroHappinessNote,
  RetroNote,
  RetroSession,
  RetroThankYouNote,
} from "../types";
import { getFirestoreDb } from "./client";
import { stripUndefined } from "./mappers";
import {
  retroFdlNoteDoc,
  retroFdlNotesCollection,
  retroFdlThankYouNoteDoc,
  retroFdlThankYouNotesCollection,
  retroHappinessImprovementNoteDoc,
  retroHappinessImprovementNotesCollection,
  retroHappinessReasonNoteDoc,
  retroHappinessReasonNotesCollection,
  retroSessionDoc,
} from "./paths";

type RetroNoteLike = { id: string; createdAt?: number };

const BATCH_LIMIT = 450;

function sortNotesByOrder<T extends RetroNoteLike>(notes: T[]): T[] {
  return [...notes].sort((a, b) => {
    const ca = a.createdAt ?? 0;
    const cb = b.createdAt ?? 0;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });
}

function noteToDoc<T extends RetroNoteLike>(note: T): Record<string, unknown> {
  const { id: _id, ...rest } = note;
  return stripUndefined(rest as Record<string, unknown>);
}

function docsToNotes<T extends RetroNoteLike>(
  docs: { id: string; data: () => DocumentData }[],
): T[] {
  return sortNotesByOrder(
    docs.map((d) => ({ id: d.id, ...d.data() }) as T),
  );
}

function notesEqual(a: RetroNoteLike, b: RetroNoteLike): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function commitBatches(
  ops: Array<{ type: "set" | "delete"; ref: ReturnType<typeof retroFdlNoteDoc>; data?: Record<string, unknown> }>,
): Promise<void> {
  if (ops.length === 0) return;
  const db = getFirestoreDb();
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) {
      if (op.type === "set" && op.data) {
        batch.set(op.ref, op.data, { merge: true });
      } else if (op.type === "delete") {
        batch.delete(op.ref);
      }
    }
    await batch.commit();
  }
}

async function syncNoteCollection<T extends RetroNoteLike>(
  sprintKey: string,
  collectionKind: "fdl" | "thankYou" | "happinessReason" | "happinessImprovement",
  prev: T[],
  next: T[],
): Promise<void> {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  const nextById = new Map(next.map((n) => [n.id, n]));
  const ops: Array<{
    type: "set" | "delete";
    ref: ReturnType<typeof retroFdlNoteDoc>;
    data?: Record<string, unknown>;
  }> = [];

  const docRef = (noteId: string) => {
    switch (collectionKind) {
      case "fdl":
        return retroFdlNoteDoc(sprintKey, noteId);
      case "thankYou":
        return retroFdlThankYouNoteDoc(sprintKey, noteId);
      case "happinessReason":
        return retroHappinessReasonNoteDoc(sprintKey, noteId);
      case "happinessImprovement":
        return retroHappinessImprovementNoteDoc(sprintKey, noteId);
    }
  };

  for (const [id, note] of nextById) {
    const before = prevById.get(id);
    if (!before || !notesEqual(before, note)) {
      ops.push({ type: "set", ref: docRef(id), data: noteToDoc(note) });
    }
  }
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) {
      ops.push({ type: "delete", ref: docRef(id) });
    }
  }
  await commitBatches(ops);
}

export function readFdlNotesFromSessionData(
  data: Partial<RetroSession> | undefined,
): RetroFdlNote[] {
  const notes = data?.fdl?.notes;
  return Array.isArray(notes) ? [...notes] : [];
}

export function readFdlThankYouNotesFromSessionData(
  data: Partial<RetroSession> | undefined,
): RetroThankYouNote[] {
  const notes = data?.fdl?.thankYouNotes;
  return Array.isArray(notes) ? [...notes] : [];
}

export function readHappinessNotesFromSessionData(
  data: Partial<RetroSession> | undefined,
  field: "reasons" | "improvements",
): RetroHappinessNote[] {
  const list = data?.happiness?.[field];
  return Array.isArray(list) ? [...list] : [];
}

/** legacy fun/done/learn 配列から FDL 付箋を抽出（移行用） */
function readLegacyFdlNotesFromSessionData(
  data: Partial<RetroSession> | undefined,
): RetroFdlNote[] {
  const fdl = data?.fdl;
  if (!fdl) return [];
  const v2 = readFdlNotesFromSessionData(data);
  if (v2.length > 0) return v2;

  const out = new Map<string, RetroFdlNote>();
  const push = (note: RetroNote, tags: RetroFdlTag[]) => {
    const cur = out.get(note.id);
    if (!cur) {
      out.set(note.id, { ...note, tags });
      return;
    }
    const merged = Array.from(new Set([...cur.tags, ...tags]));
    out.set(note.id, { ...cur, tags: merged });
  };
  for (const n of fdl.fun ?? []) push(n, ["fun"]);
  for (const n of fdl.done ?? []) push(n, ["done"]);
  for (const n of fdl.learn ?? []) push(n, ["learn"]);
  return Array.from(out.values());
}

export async function fetchRetroFdlNotes(
  sprintKey: string,
): Promise<RetroFdlNote[]> {
  const snap = await getDocs(retroFdlNotesCollection(sprintKey));
  if (!snap.empty) return docsToNotes<RetroFdlNote>(snap.docs);
  const sessionSnap = await getDoc(retroSessionDoc(sprintKey));
  if (!sessionSnap.exists()) return [];
  return readLegacyFdlNotesFromSessionData(
    sessionSnap.data() as Partial<RetroSession>,
  );
}

export async function fetchRetroFdlThankYouNotes(
  sprintKey: string,
): Promise<RetroThankYouNote[]> {
  const snap = await getDocs(retroFdlThankYouNotesCollection(sprintKey));
  if (!snap.empty) return docsToNotes<RetroThankYouNote>(snap.docs);
  const sessionSnap = await getDoc(retroSessionDoc(sprintKey));
  if (!sessionSnap.exists()) return [];
  return readFdlThankYouNotesFromSessionData(
    sessionSnap.data() as Partial<RetroSession>,
  );
}

export async function fetchRetroHappinessNotes(
  sprintKey: string,
  field: "reasons" | "improvements",
): Promise<RetroHappinessNote[]> {
  const collection =
    field === "reasons"
      ? retroHappinessReasonNotesCollection(sprintKey)
      : retroHappinessImprovementNotesCollection(sprintKey);
  const snap = await getDocs(collection);
  if (!snap.empty) return docsToNotes<RetroHappinessNote>(snap.docs);
  const sessionSnap = await getDoc(retroSessionDoc(sprintKey));
  if (!sessionSnap.exists()) return [];
  return readHappinessNotesFromSessionData(
    sessionSnap.data() as Partial<RetroSession>,
    field,
  );
}

export function patchContainsEmbeddedNotes(
  patch: Partial<RetroSession>,
): boolean {
  return (
    patch.fdl?.notes !== undefined ||
    patch.fdl?.thankYouNotes !== undefined ||
    patch.happiness?.reasons !== undefined ||
    patch.happiness?.improvements !== undefined
  );
}

/** サブコレクション保存時にセッション doc へ書かない付箋配列を除去する */
export function stripEmbeddedNotesFromSessionPatch(
  patch: Partial<RetroSession>,
): Partial<RetroSession> {
  const next: Partial<RetroSession> = {
    ...patch,
    notesInSubcollections: true,
  };
  if (next.fdl) {
    const {
      notes: _notes,
      thankYouNotes: _thankYou,
      fun: _fun,
      done: _done,
      learn: _learn,
      ...fdlRest
    } = next.fdl;
    next.fdl = fdlRest;
  }
  if (next.happiness) {
    const { reasons: _reasons, improvements: _improvements, ...rest } =
      next.happiness;
    next.happiness = rest as RetroSession["happiness"];
  }
  return next;
}

async function touchRetroSessionUpdatedAt(sprintKey: string): Promise<void> {
  const db = getFirestoreDb();
  const batch = writeBatch(db);
  batch.set(
    retroSessionDoc(sprintKey),
    { updatedAt: new Date().toISOString() },
    { merge: true },
  );
  await batch.commit();
}

export async function patchRetroFdlNotesMerged(
  sprintKey: string,
  merge: (serverNotes: RetroFdlNote[]) => RetroFdlNote[],
): Promise<RetroFdlNote[]> {
  const current = await fetchRetroFdlNotes(sprintKey);
  const next = merge(current);
  await syncNoteCollection(sprintKey, "fdl", current, next);
  await touchRetroSessionUpdatedAt(sprintKey);
  return next;
}

export async function patchRetroFdlThankYouNotesMerged(
  sprintKey: string,
  merge: (serverNotes: RetroThankYouNote[]) => RetroThankYouNote[],
): Promise<RetroThankYouNote[]> {
  const current = await fetchRetroFdlThankYouNotes(sprintKey);
  const next = merge(current);
  await syncNoteCollection(sprintKey, "thankYou", current, next);
  await touchRetroSessionUpdatedAt(sprintKey);
  return next;
}

export async function patchRetroHappinessNotesMerged(
  sprintKey: string,
  field: "reasons" | "improvements",
  merge: (serverNotes: RetroHappinessNote[]) => RetroHappinessNote[],
): Promise<RetroHappinessNote[]> {
  const current = await fetchRetroHappinessNotes(sprintKey, field);
  const next = merge(current);
  const kind =
    field === "reasons" ? "happinessReason" : "happinessImprovement";
  await syncNoteCollection(sprintKey, kind, current, next);
  await touchRetroSessionUpdatedAt(sprintKey);
  return next;
}

function retroHappinessNoteDocRef(
  sprintKey: string,
  field: "reasons" | "improvements",
  noteId: string,
) {
  return field === "reasons"
    ? retroHappinessReasonNoteDoc(sprintKey, noteId)
    : retroHappinessImprovementNoteDoc(sprintKey, noteId);
}

/** 幸福指標付箋を1件だけ更新（テキスト・サイズなど。同時編集時の競合を減らす） */
export async function patchRetroHappinessNoteDoc(
  sprintKey: string,
  field: "reasons" | "improvements",
  noteId: string,
  patch: Partial<Omit<RetroHappinessNote, "id">>,
): Promise<void> {
  const data = stripUndefined(patch as Record<string, unknown>);
  if (Object.keys(data).length === 0) return;
  const db = getFirestoreDb();
  await setDoc(retroHappinessNoteDocRef(sprintKey, field, noteId), data, {
    merge: true,
  });
  await touchRetroSessionUpdatedAt(sprintKey);
}

function sessionHasEmbeddedNotes(data: Partial<RetroSession>): boolean {
  const fdl = data.fdl;
  const happiness = data.happiness;
  if (readLegacyFdlNotesFromSessionData(data).length > 0) return true;
  if (readFdlThankYouNotesFromSessionData(data).length > 0) return true;
  if (readHappinessNotesFromSessionData(data, "reasons").length > 0) return true;
  if (readHappinessNotesFromSessionData(data, "improvements").length > 0) {
    return true;
  }
  if (fdl?.fun?.length || fdl?.done?.length || fdl?.learn?.length) return true;
  if (happiness?.reasons?.length || happiness?.improvements?.length) return true;
  return false;
}

/** embedded 配列の付箋をサブコレクションへ移行し、セッションから配列を除去する */
export async function migrateRetroSessionNotesToSubcollections(
  sprintKey: string,
  session: Partial<RetroSession>,
): Promise<void> {
  if (session.notesInSubcollections) return;
  if (!sessionHasEmbeddedNotes(session)) {
    const db = getFirestoreDb();
    const batch = writeBatch(db);
    batch.set(
      retroSessionDoc(sprintKey),
      { notesInSubcollections: true, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    await batch.commit();
    return;
  }

  const fdlNotes = readLegacyFdlNotesFromSessionData(session);
  const thankYouNotes = readFdlThankYouNotesFromSessionData(session);
  const reasons = readHappinessNotesFromSessionData(session, "reasons");
  const improvements = readHappinessNotesFromSessionData(
    session,
    "improvements",
  );

  const [existingFdl, existingThankYou, existingReasons, existingImprovements] =
    await Promise.all([
      fetchRetroFdlNotes(sprintKey),
      fetchRetroFdlThankYouNotes(sprintKey),
      fetchRetroHappinessNotes(sprintKey, "reasons"),
      fetchRetroHappinessNotes(sprintKey, "improvements"),
    ]);

  await syncNoteCollection(sprintKey, "fdl", existingFdl, fdlNotes);
  await syncNoteCollection(sprintKey, "thankYou", existingThankYou, thankYouNotes);
  await syncNoteCollection(
    sprintKey,
    "happinessReason",
    existingReasons,
    reasons,
  );
  await syncNoteCollection(
    sprintKey,
    "happinessImprovement",
    existingImprovements,
    improvements,
  );

  const fdl = session.fdl ?? defaultRetroFdlData();
  const happiness = session.happiness ?? {
    scoresByParticipant: {},
    reasons: [],
    improvements: [],
  };

  const db = getFirestoreDb();
  const batch = writeBatch(db);
  batch.set(
    retroSessionDoc(sprintKey),
    {
      notesInSubcollections: true,
      updatedAt: new Date().toISOString(),
      fdl: {
        nextActionsByParticipant: fdl.nextActionsByParticipant ?? {},
        notes: deleteField(),
        thankYouNotes: deleteField(),
        fun: deleteField(),
        done: deleteField(),
        learn: deleteField(),
      },
      happiness: {
        scoresByParticipant: happiness.scoresByParticipant ?? {},
        reasons: deleteField(),
        improvements: deleteField(),
      },
    },
    { merge: true },
  );
  await batch.commit();
}

/** フレームワーク切替の undo 等: セッション内の付箋データでサブコレクションを全置換 */
export async function replaceRetroNotesFromSessionData(
  sprintKey: string,
  session: Partial<RetroSession>,
): Promise<void> {
  const fdlNotes = readLegacyFdlNotesFromSessionData(session);
  const thankYouNotes = readFdlThankYouNotesFromSessionData(session);
  const reasons = readHappinessNotesFromSessionData(session, "reasons");
  const improvements = readHappinessNotesFromSessionData(
    session,
    "improvements",
  );

  const [existingFdl, existingThankYou, existingReasons, existingImprovements] =
    await Promise.all([
      fetchRetroFdlNotes(sprintKey),
      fetchRetroFdlThankYouNotes(sprintKey),
      fetchRetroHappinessNotes(sprintKey, "reasons"),
      fetchRetroHappinessNotes(sprintKey, "improvements"),
    ]);

  await syncNoteCollection(sprintKey, "fdl", existingFdl, fdlNotes);
  await syncNoteCollection(sprintKey, "thankYou", existingThankYou, thankYouNotes);
  await syncNoteCollection(
    sprintKey,
    "happinessReason",
    existingReasons,
    reasons,
  );
  await syncNoteCollection(
    sprintKey,
    "happinessImprovement",
    existingImprovements,
    improvements,
  );
}

async function deleteAllDocsInCollection(
  getCollection: () => ReturnType<typeof retroFdlNotesCollection>,
): Promise<void> {
  const snap = await getDocs(getCollection());
  if (snap.empty) return;
  const db = getFirestoreDb();
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

export async function deleteAllRetroNotesForSession(
  sprintKey: string,
): Promise<void> {
  await Promise.all([
    deleteAllDocsInCollection(() => retroFdlNotesCollection(sprintKey)),
    deleteAllDocsInCollection(() => retroFdlThankYouNotesCollection(sprintKey)),
    deleteAllDocsInCollection(() =>
      retroHappinessReasonNotesCollection(sprintKey),
    ),
    deleteAllDocsInCollection(() =>
      retroHappinessImprovementNotesCollection(sprintKey),
    ),
  ]);
}

export async function copyRetroNotesSubcollections(
  fromSprintKey: string,
  toSprintKey: string,
): Promise<void> {
  const copyWithRefs = async (
    fromSprint: string,
    toSprint: string,
    kind: "fdl" | "thankYou" | "happinessReason" | "happinessImprovement",
  ) => {
    const fromSnap = await getDocs(
      kind === "fdl"
        ? retroFdlNotesCollection(fromSprint)
        : kind === "thankYou"
          ? retroFdlThankYouNotesCollection(fromSprint)
          : kind === "happinessReason"
            ? retroHappinessReasonNotesCollection(fromSprint)
            : retroHappinessImprovementNotesCollection(fromSprint),
    );
    if (fromSnap.empty) return;
    const db = getFirestoreDb();
    for (let i = 0; i < fromSnap.docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const d of fromSnap.docs.slice(i, i + BATCH_LIMIT)) {
        const toRef =
          kind === "fdl"
            ? retroFdlNoteDoc(toSprint, d.id)
            : kind === "thankYou"
              ? retroFdlThankYouNoteDoc(toSprint, d.id)
              : kind === "happinessReason"
                ? retroHappinessReasonNoteDoc(toSprint, d.id)
                : retroHappinessImprovementNoteDoc(toSprint, d.id);
        batch.set(toRef, d.data(), { merge: true });
      }
      await batch.commit();
    }
  };

  await Promise.all([
    copyWithRefs(fromSprintKey, toSprintKey, "fdl"),
    copyWithRefs(fromSprintKey, toSprintKey, "thankYou"),
    copyWithRefs(fromSprintKey, toSprintKey, "happinessReason"),
    copyWithRefs(fromSprintKey, toSprintKey, "happinessImprovement"),
  ]);
}

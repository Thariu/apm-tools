import { deleteDoc, getDoc, setDoc } from "firebase/firestore";
import { BOARD_ORDER } from "../boardConfig";
import { buildDefaultBusinessDayIsos } from "../burndown";
import type {
  RetroDraft,
  RetroFacilitation,
  RetroSession,
} from "../types";
import {
  retroDraftDoc,
  retroFacilitationDoc,
  retroSessionDoc,
} from "./paths";
import {
  copyRetroNotesSubcollections,
  migrateRetroSessionNotesToSubcollections,
  stripEmbeddedNotesFromSessionPatch,
} from "./retroNotesRepository";
import { deleteRetroSession, setRetroSession } from "./planningRepository";

/**
 * 振り返りデータを別スプリント週（sprintKey）へ移行する。
 * セッション本文・ファシリテーション・ドラフトを移し、移行元を削除する。
 */
export async function migrateRetroSprintKey(
  fromSprintKey: string,
  toSprintKey: string,
): Promise<void> {
  if (fromSprintKey === toSprintKey) return;

  const sessionSnap = await getDoc(retroSessionDoc(fromSprintKey));
  if (!sessionSnap.exists()) {
    throw new Error(
      `移行元の振り返り（${fromSprintKey}）が見つかりません`,
    );
  }

  const toSessionSnap = await getDoc(retroSessionDoc(toSprintKey));
  if (toSessionSnap.exists()) {
    const existing = toSessionSnap.data() as RetroSession;
    if (existing.framework) {
      throw new Error(
        `移行先（${toSprintKey}）に既に振り返りがあります`,
      );
    }
  }

  const now = new Date().toISOString();
  const source = sessionSnap.data() as RetroSession;
  if (!source.notesInSubcollections) {
    await migrateRetroSessionNotesToSubcollections(fromSprintKey, source);
  }

  const migrated: RetroSession = {
    ...source,
    sprintKey: toSprintKey,
    businessDayIsos: buildDefaultBusinessDayIsos(toSprintKey),
    notesInSubcollections: true,
    updatedAt: now,
  };
  await copyRetroNotesSubcollections(fromSprintKey, toSprintKey);
  await setRetroSession(
    stripEmbeddedNotesFromSessionPatch(migrated) as RetroSession,
  );

  const facSnap = await getDoc(retroFacilitationDoc(fromSprintKey));
  if (facSnap.exists()) {
    const fac = facSnap.data() as RetroFacilitation;
    await setDoc(
      retroFacilitationDoc(toSprintKey),
      {
        ...fac,
        sprintKey: toSprintKey,
        updatedAt: now,
      },
      { merge: true },
    );
    await deleteDoc(retroFacilitationDoc(fromSprintKey));
  }

  for (const boardId of BOARD_ORDER) {
    const draftSnap = await getDoc(retroDraftDoc(boardId, fromSprintKey));
    if (!draftSnap.exists()) continue;
    const draft = draftSnap.data() as RetroDraft;
    await setDoc(
      retroDraftDoc(boardId, toSprintKey),
      { ...draft, sprintKey: toSprintKey, updatedAt: now },
      { merge: true },
    );
    await deleteDoc(retroDraftDoc(boardId, fromSprintKey));
  }

  await deleteRetroSession(null, fromSprintKey);
}

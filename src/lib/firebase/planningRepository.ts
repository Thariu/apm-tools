import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import type { FinalizedSprintBurnup } from "../releaseBurnup";
import {
  BOARD_ORDER,
  defaultBoardLabels,
  defaultLegacyRegistryEntries,
  labelsFromRegistry,
  nextBoardOrder,
  parseBoardLabelsDoc,
  parseBoardsRegistryDoc,
  activeBoardIdsFromRegistry,
} from "../boardConfig";
import type { BurndownSprintState } from "../burndownSprintStorage";
import type { ReleaseBurnupBoardState } from "../releaseBurnupStorage";
import type {
  BoardId,
  BoardRegistryEntry,
  ProductBacklogItem,
  RetroDraft,
  RetroFacilitation,
  RetroSession,
  SprintSchedule,
  Task,
  TaskPatch,
  TaskTemplate,
  TaskTemplateSet,
  WeekdayKey,
} from "../types";
import { createId } from "../id";
import { getFirestoreDb } from "./client";
import {
  burndownSprintToFirestore,
  docToProductBacklog,
  docToTask,
  emptySchedule,
  productBacklogToDoc,
  releaseBurnupToFirestore,
  retroSessionToFirestore,
  scheduleToFirestore,
  stripUndefined,
  taskToFirestore,
  type ProductBacklogDoc,
} from "./mappers";
import {
  appMetaDoc,
  assigneeColorDoc,
  assigneeDirectoryDoc,
  boardLabelsDoc,
  boardsRegistryDoc,
  boardReleaseBurnupDoc,
  boardScheduleDoc,
  burndownSnapshotDoc,
  burndownSnapshotsCollection,
  burndownSprintDoc,
  finalizedSprintDoc,
  finalizedSprintsCollection,
  goalTextDirectoryDoc,
  productBacklogCollection,
  productBacklogDoc,
  retroDoc,
  retroDraftDoc,
  retroDraftsCollection,
  retroSessionDoc,
  retroSessionsCollection,
  retrosCollection,
  retroFacilitationDoc,
  taskTemplateDoc,
  taskTemplateSetDoc,
  taskDoc,
  tasksCollection,
} from "./paths";
import {
  getSeedBurndownSprintState,
  getSeedProductBacklogDocs,
  getSeedReleaseBurnupByBoard,
  getSeedSchedulesByBoard,
  getSeedTasks,
} from "./seedData";
import { DEFAULT_GOAL_TEXT_CANDIDATES } from "../goalTextCandidates";
import { defaultReleaseBurnupBoardState } from "../planningDefaults";

const META_SEEDED = "seeded";

export async function isDatabaseSeeded(): Promise<boolean> {
  const snap = await getDoc(appMetaDoc());
  return snap.exists() && snap.data()?.[META_SEEDED] === true;
}

export async function seedDatabaseIfEmpty(): Promise<void> {
  if (await isDatabaseSeeded()) return;

  const db = getFirestoreDb();
  const batch = writeBatch(db);

  const burndownSprint = getSeedBurndownSprintState();
  batch.set(burndownSprintDoc(), burndownSprintToFirestore(burndownSprint));

  const schedules = getSeedSchedulesByBoard();
  const releaseByBoard = getSeedReleaseBurnupByBoard();

  for (const boardId of BOARD_ORDER) {
    batch.set(boardScheduleDoc(boardId), scheduleToFirestore(schedules[boardId]));
    batch.set(
      boardReleaseBurnupDoc(boardId),
      {
        releaseStartTuesdayIso:
          releaseByBoard[boardId].releaseStartTuesdayIso,
      },
      { merge: true },
    );

    for (const pbDoc of getSeedProductBacklogDocs(boardId)) {
      batch.set(productBacklogDoc(boardId, pbDoc.id), pbDoc);
    }
  }

  for (const task of getSeedTasks()) {
    // merge なしの set では deleteField() を使えない
    batch.set(
      taskDoc(task.boardId, task.id),
      taskToFirestore(task, { clearMissingProgress: false }),
    );
  }

  for (const text of DEFAULT_GOAL_TEXT_CANDIDATES) {
    batch.set(goalTextDirectoryDoc(text), { text }, { merge: true });
  }

  batch.set(boardsRegistryDoc(), {
    boards: defaultLegacyRegistryEntries(),
    updatedAt: new Date().toISOString(),
  });

  batch.set(appMetaDoc(), { [META_SEEDED]: true, seededAt: new Date().toISOString() });

  await batch.commit();
}

async function writeBoardsRegistry(
  entries: BoardRegistryEntry[],
): Promise<void> {
  await setDoc(boardsRegistryDoc(), {
    boards: entries,
    updatedAt: new Date().toISOString(),
  });
}

/** レジストリが無ければレガシー3件＋board_labels から作成 */
export async function ensureBoardsRegistry(): Promise<BoardRegistryEntry[]> {
  const snap = await getDoc(boardsRegistryDoc());
  if (snap.exists()) {
    const data = snap.data() as Record<string, unknown>;
    if (Array.isArray(data.boards) && data.boards.length > 0) {
      return parseBoardsRegistryDoc(data);
    }
  }

  const labelsSnap = await getDoc(boardLabelsDoc());
  const labels = parseBoardLabelsDoc(
    labelsSnap.exists()
      ? (labelsSnap.data() as Record<string, unknown>)
      : null,
  );
  const entries = defaultLegacyRegistryEntries().map((e) => ({
    ...e,
    label: labels[e.id] ?? e.label,
  }));
  await writeBoardsRegistry(entries);
  return entries;
}

export async function fetchBoardsRegistry(): Promise<BoardRegistryEntry[]> {
  return ensureBoardsRegistry();
}

export async function addBoardCategory(
  label: string,
): Promise<BoardRegistryEntry> {
  const entries = await ensureBoardsRegistry();
  const trimmed = label.trim() || "新しいカテゴリ";
  const entry: BoardRegistryEntry = {
    id: createId("board"),
    label: trimmed,
    order: nextBoardOrder(entries),
  };
  await writeBoardsRegistry([...entries, entry]);

  await setDoc(boardScheduleDoc(entry.id), {
    ...scheduleToFirestore(emptySchedule()),
    sprintGoal: "",
  });
  const release = defaultReleaseBurnupBoardState();
  await setDoc(
    boardReleaseBurnupDoc(entry.id),
    { releaseStartTuesdayIso: release.releaseStartTuesdayIso },
    { merge: true },
  );

  return entry;
}

export async function archiveBoardCategory(boardId: BoardId): Promise<void> {
  const entries = await ensureBoardsRegistry();
  const active = activeBoardIdsFromRegistry(entries);
  if (active.length <= 1 && active.includes(boardId)) {
    throw new Error("最後のカテゴリはアーカイブできません。");
  }
  const now = new Date().toISOString();
  const next = entries.map((e) =>
    e.id === boardId ? { ...e, archivedAt: now } : e,
  );
  if (!next.some((e) => e.id === boardId)) {
    throw new Error("カテゴリが見つかりません。");
  }
  await writeBoardsRegistry(next);
}

export async function restoreBoardCategory(boardId: BoardId): Promise<void> {
  const entries = await ensureBoardsRegistry();
  const next = entries.map((e) => {
    if (e.id !== boardId) return e;
    const { archivedAt: _a, ...rest } = e;
    return rest;
  });
  if (!entries.some((e) => e.id === boardId && e.archivedAt)) {
    throw new Error("アーカイブ済みカテゴリが見つかりません。");
  }
  await writeBoardsRegistry(next);
}

/** アクティブなカテゴリの表示順を更新（アーカイブ済みは order を維持） */
export async function reorderBoardCategories(
  orderedActiveIds: BoardId[],
): Promise<void> {
  const entries = await ensureBoardsRegistry();
  const activeIds = activeBoardIdsFromRegistry(entries);
  if (
    orderedActiveIds.length !== activeIds.length ||
    !orderedActiveIds.every((id) => activeIds.includes(id)) ||
    new Set(orderedActiveIds).size !== orderedActiveIds.length
  ) {
    throw new Error("並び替え対象が不正です。");
  }
  const orderById = new Map(
    orderedActiveIds.map((id, index) => [id, index] as const),
  );
  const next = entries.map((e) => {
    if (e.archivedAt) return e;
    const order = orderById.get(e.id);
    return order === undefined ? e : { ...e, order };
  });
  await writeBoardsRegistry(next);
}

async function deleteCollectionDocs(
  coll: ReturnType<typeof productBacklogCollection>,
): Promise<void> {
  const snap = await getDocs(coll);
  if (snap.empty) return;
  const db = getFirestoreDb();
  let batch = writeBatch(db);
  let count = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    count += 1;
    if (count >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

/** ボード配下のサブコレクションを削除（完全削除用） */
export async function deleteBoardData(boardId: BoardId): Promise<void> {
  await Promise.all([
    deleteCollectionDocs(productBacklogCollection(boardId)),
    deleteCollectionDocs(tasksCollection(boardId)),
    deleteCollectionDocs(burndownSnapshotsCollection(boardId)),
    deleteCollectionDocs(finalizedSprintsCollection(boardId)),
    deleteCollectionDocs(retrosCollection(boardId)),
    deleteCollectionDocs(retroDraftsCollection(boardId)),
  ]);
  await deleteDoc(boardScheduleDoc(boardId)).catch(() => undefined);
  await deleteDoc(boardReleaseBurnupDoc(boardId)).catch(() => undefined);
}

/** アーカイブ済みカテゴリを完全削除（データも消去） */
export async function permanentlyDeleteBoardCategory(
  boardId: BoardId,
): Promise<void> {
  const entries = await ensureBoardsRegistry();
  const target = entries.find((e) => e.id === boardId);
  if (!target) throw new Error("カテゴリが見つかりません。");
  if (!target.archivedAt) {
    throw new Error("完全削除はアーカイブ済みカテゴリのみ可能です。");
  }
  await deleteBoardData(boardId);
  await writeBoardsRegistry(entries.filter((e) => e.id !== boardId));
  await setDoc(boardLabelsDoc(), { [boardId]: deleteField() }, { merge: true });
}

export async function setTask(task: Task): Promise<void> {
  await setDoc(taskDoc(task.boardId, task.id), taskToFirestore(task), {
    merge: true,
  });
}

export async function patchTask(
  boardId: BoardId,
  taskId: string,
  patch: TaskPatch,
): Promise<void> {
  const data = stripUndefined(patch as Record<string, unknown>) as Record<
    string,
    unknown
  >;

  const clearPercent =
    patch.progressPercent === null ||
    patch.lane === "done" ||
    patch.lane === "todo" ||
    patch.lane === "cant";

  if (clearPercent) {
    data.progressPercent = deleteField();
  } else if (
    patch.progressPercent === 25 ||
    patch.progressPercent === 50 ||
    patch.progressPercent === 75
  ) {
    data.progressPercent = patch.progressPercent;
  }

  if (Object.keys(data).length === 0) return;
  await setDoc(taskDoc(boardId, taskId), data, { merge: true });
}

function retroSessionPayload(
  value: Partial<RetroSession>,
): Record<string, unknown> {
  const { boardId: _boardId, ...rest } = value;
  return retroSessionToFirestore(rest as Partial<RetroSession>);
}

export async function setRetroSession(
  session: RetroSession,
): Promise<void> {
  const data = retroSessionPayload(session);
  await setDoc(retroSessionDoc(session.sprintKey), data, {
    merge: true,
  });
}

export async function patchRetroSession(
  _boardId: BoardId | null,
  sprintKey: string,
  patch: Partial<RetroSession>,
): Promise<void> {
  const data = retroSessionPayload(patch);
  if (Object.keys(data).length === 0) return;
  await setDoc(retroSessionDoc(sprintKey), data, { merge: true });
}

import { deleteAllRetroNotesForSession } from "./retroNotesRepository";

export {
  patchRetroFdlNotesMerged,
  patchRetroFdlThankYouNotesMerged,
  patchRetroHappinessNotesMerged,
  patchRetroHappinessNoteDoc,
} from "./retroNotesRepository";

export async function patchRetroDraft(
  boardId: BoardId,
  sprintKey: string,
  patch: Partial<RetroDraft>,
): Promise<void> {
  const data = stripUndefined(patch as Record<string, unknown>);
  if (Object.keys(data).length === 0) return;
  await setDoc(retroDraftDoc(boardId, sprintKey), data, { merge: true });
}

export async function fetchRetroFacilitationDoc(
  sprintKey: string,
): Promise<RetroFacilitation | null> {
  const snap = await getDoc(retroFacilitationDoc(sprintKey));
  if (!snap.exists()) return null;
  return snap.data() as RetroFacilitation;
}

export async function patchRetroFacilitation(
  sprintKey: string,
  patch: Partial<RetroFacilitation>,
): Promise<void> {
  const data = stripUndefined(patch as Record<string, unknown>);
  if (Object.keys(data).length === 0) return;
  await setDoc(retroFacilitationDoc(sprintKey), data, { merge: true });
}

export async function deleteRetroSession(
  _boardId: BoardId | null,
  sprintKey: string,
): Promise<void> {
  await deleteAllRetroNotesForSession(sprintKey);
  await deleteDoc(retroSessionDoc(sprintKey));
}

/** 過去振り返りを最新 keepCount 件だけ残し、それより古いアーカイブを削除（全ボード共通） */
export async function pruneArchivedRetroSessions(
  _boardId: BoardId | null,
  keepCount: number,
): Promise<void> {
  const snap = await getDocs(retroSessionsCollection());
  const archived = snap.docs
    .map((d) => ({ ...(d.data() as RetroSession), sprintKey: d.id }))
    .filter((s) => s.archivedAt)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));

  const toRemove = archived.slice(keepCount);
  if (toRemove.length === 0) return;

  const db = getFirestoreDb();
  for (const s of toRemove) {
    await deleteAllRetroNotesForSession(s.sprintKey);
    const batch = writeBatch(db);
    batch.delete(retroSessionDoc(s.sprintKey));
    await batch.commit();
  }
}

export async function deleteTaskRecord(
  boardId: BoardId,
  taskId: string,
): Promise<void> {
  await deleteDoc(taskDoc(boardId, taskId));
}

export async function deleteTasksForParent(
  boardId: BoardId,
  parentIssueId: string,
): Promise<void> {
  const q = query(
    tasksCollection(boardId),
    where("parentIssueId", "==", parentIssueId),
  );
  const snap = await getDocs(q);
  const db = getFirestoreDb();
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  if (snap.docs.length > 0) await batch.commit();
}

export async function setAssigneeColor(
  assigneeName: string,
  colorId: string,
): Promise<void> {
  await setDoc(
    assigneeColorDoc(assigneeName),
    { name: assigneeName, colorId },
    { merge: true },
  );
}

export async function upsertAssigneeDirectoryEntry(
  assigneeName: string,
  colorId: string,
): Promise<void> {
  await setDoc(
    assigneeDirectoryDoc(assigneeName),
    { name: assigneeName, colorId },
    { merge: true },
  );
}

export async function deleteAssigneeDirectoryEntry(
  assigneeName: string,
): Promise<void> {
  await deleteDoc(assigneeDirectoryDoc(assigneeName));
}

export async function upsertGoalTextDirectoryEntry(goalText: string): Promise<void> {
  await setDoc(
    goalTextDirectoryDoc(goalText),
    { text: goalText },
    { merge: true },
  );
}

export async function deleteGoalTextDirectoryEntry(goalText: string): Promise<void> {
  await deleteDoc(goalTextDirectoryDoc(goalText));
}

export async function setTaskTemplate(template: TaskTemplate): Promise<void> {
  await setDoc(
    taskTemplateDoc(template.id),
    stripUndefined(template as Record<string, unknown>),
    { merge: true },
  );
}

export async function deleteTaskTemplate(templateId: string): Promise<void> {
  await deleteDoc(taskTemplateDoc(templateId));
}

export async function reorderTaskTemplatesFirestore(
  templates: TaskTemplate[],
): Promise<void> {
  const db = getFirestoreDb();
  const batch = writeBatch(db);
  templates.forEach((t, index) => {
    batch.update(taskTemplateDoc(t.id), { sortOrder: index, updatedAt: new Date().toISOString() });
  });
  await batch.commit();
}

export async function setTaskTemplateSet(set: TaskTemplateSet): Promise<void> {
  await setDoc(
    taskTemplateSetDoc(set.id),
    stripUndefined(set as Record<string, unknown>),
    { merge: true },
  );
}

export async function deleteTaskTemplateSet(setId: string): Promise<void> {
  await deleteDoc(taskTemplateSetDoc(setId));
}

export async function setProductBacklogItem(
  boardId: BoardId,
  item: ProductBacklogItem,
  sortOrder: number,
): Promise<void> {
  await setDoc(
    productBacklogDoc(boardId, item.id),
    productBacklogToDoc(item, sortOrder),
  );
}

export async function patchProductBacklogItem(
  boardId: BoardId,
  itemId: string,
  patch: Partial<ProductBacklogItem>,
): Promise<void> {
  const data = stripUndefined(patch as Record<string, unknown>);
  if (Object.keys(data).length === 0) return;
  await setDoc(productBacklogDoc(boardId, itemId), data, { merge: true });
}

export async function deleteProductBacklogItem(
  boardId: BoardId,
  itemId: string,
): Promise<void> {
  await deleteDoc(productBacklogDoc(boardId, itemId));
  await deleteTasksForParent(boardId, itemId);
}

export async function reorderProductBacklogFirestore(
  boardId: BoardId,
  items: ProductBacklogItem[],
): Promise<void> {
  const db = getFirestoreDb();
  const batch = writeBatch(db);
  items.forEach((item, index) => {
    batch.update(productBacklogDoc(boardId, item.id), { sortOrder: index });
  });
  await batch.commit();
}

export async function setSchedule(
  boardId: BoardId,
  schedule: SprintSchedule,
): Promise<void> {
  await setDoc(boardScheduleDoc(boardId), scheduleToFirestore(schedule));
}

export async function patchScheduleDay(
  boardId: BoardId,
  day: WeekdayKey,
  name: string,
): Promise<void> {
  await setDoc(boardScheduleDoc(boardId), { [day]: name }, { merge: true });
}

export async function patchSprintGoal(
  boardId: BoardId,
  sprintGoal: string,
): Promise<void> {
  await setDoc(boardScheduleDoc(boardId), { sprintGoal }, { merge: true });
}

export async function fetchBoardLabels(): Promise<Record<BoardId, string>> {
  const entries = await ensureBoardsRegistry();
  return labelsFromRegistry(entries);
}

export async function patchBoardLabel(
  boardId: BoardId,
  label: string,
): Promise<void> {
  const trimmed = label.trim();
  const entries = await ensureBoardsRegistry();
  const fallback =
    entries.find((e) => e.id === boardId)?.label ||
    defaultBoardLabels()[boardId] ||
    "カテゴリ";
  const value = trimmed || fallback;
  const next = entries.map((e) =>
    e.id === boardId ? { ...e, label: value } : e,
  );
  if (!entries.some((e) => e.id === boardId)) {
    next.push({ id: boardId, label: value, order: nextBoardOrder(entries) });
  }
  await writeBoardsRegistry(next);
  await setDoc(boardLabelsDoc(), { [boardId]: value }, { merge: true });
}

export async function setBurndownSprint(
  state: BurndownSprintState,
): Promise<void> {
  await setDoc(burndownSprintDoc(), burndownSprintToFirestore(state));
}

export async function setBurndownSnapshot(
  boardId: BoardId,
  dayIso: string,
  wip: number,
): Promise<void> {
  await setDoc(burndownSnapshotDoc(boardId, dayIso), { wip });
}

export async function setReleaseBurnupConfig(
  boardId: BoardId,
  releaseStartTuesdayIso: string,
): Promise<void> {
  await setDoc(
    boardReleaseBurnupDoc(boardId),
    { releaseStartTuesdayIso },
    { merge: true },
  );
}

export async function upsertFinalizedSprint(
  boardId: BoardId,
  sprint: FinalizedSprintBurnup,
): Promise<void> {
  await setDoc(finalizedSprintDoc(boardId, sprint.sprintTuesdayIso), sprint);
}

export async function fetchAllProductBacklog(): Promise<
  Record<BoardId, ProductBacklogItem[]>
> {
  const entries = await ensureBoardsRegistry();
  const boardIds = activeBoardIdsFromRegistry(entries);
  const out = {} as Record<BoardId, ProductBacklogItem[]>;
  for (const boardId of boardIds) {
    const q = query(
      productBacklogCollection(boardId),
      orderBy("sortOrder"),
    );
    const snap = await getDocs(q);
    out[boardId] = snap.docs.map((d) =>
      docToProductBacklog(d.data() as ProductBacklogDoc),
    );
  }
  return out;
}

export async function fetchAllTasks(): Promise<Record<BoardId, Task[]>> {
  const entries = await ensureBoardsRegistry();
  const boardIds = activeBoardIdsFromRegistry(entries);
  const out = {} as Record<BoardId, Task[]>;
  for (const boardId of boardIds) {
    const snap = await getDocs(tasksCollection(boardId));
    out[boardId] = snap.docs.map((d) => {
      const data = d.data() as Task;
      return docToTask({ ...data, id: data.id || d.id });
    });
  }
  return out;
}

export function mapSnapshotDocs<T>(
  docs: { data: () => DocumentData }[],
  mapper: (data: DocumentData) => T,
): T[] {
  return docs.map((d) => mapper(d.data()));
}

export async function replaceReleaseBurnupFinalized(
  boardId: BoardId,
  state: ReleaseBurnupBoardState,
): Promise<void> {
  const db = getFirestoreDb();
  const existing = await getDocs(finalizedSprintsCollection(boardId));
  const batch = writeBatch(db);
  existing.docs.forEach((d) => batch.delete(d.ref));
  for (const sprint of state.finalizedSprints) {
    batch.set(finalizedSprintDoc(boardId, sprint.sprintTuesdayIso), sprint);
  }
  await batch.commit();
}

export async function saveReleaseBurnupBoardState(
  boardId: BoardId,
  state: ReleaseBurnupBoardState,
): Promise<void> {
  await setDoc(
    boardReleaseBurnupDoc(boardId),
    { releaseStartTuesdayIso: state.releaseStartTuesdayIso },
    { merge: true },
  );
  await replaceReleaseBurnupFinalized(boardId, state);
}

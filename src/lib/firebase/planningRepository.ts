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
import { BOARD_ORDER } from "../boardConfig";
import type { BurndownSprintState } from "../burndownSprintStorage";
import type { ReleaseBurnupBoardState } from "../releaseBurnupStorage";
import type {
  BoardId,
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
import { getFirestoreDb } from "./client";
import {
  burndownSprintToFirestore,
  docToProductBacklog,
  docToTask,
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
  boardReleaseBurnupDoc,
  boardScheduleDoc,
  burndownSnapshotDoc,
  burndownSprintDoc,
  finalizedSprintDoc,
  finalizedSprintsCollection,
  goalTextDirectoryDoc,
  productBacklogCollection,
  productBacklogDoc,
  retroDoc,
  retroDraftDoc,
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
    batch.set(taskDoc(task.boardId, task.id), taskToFirestore(task));
  }

  for (const text of DEFAULT_GOAL_TEXT_CANDIDATES) {
    batch.set(goalTextDirectoryDoc(text), { text }, { merge: true });
  }

  batch.set(appMetaDoc(), { [META_SEEDED]: true, seededAt: new Date().toISOString() });

  await batch.commit();
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
  const out = {} as Record<BoardId, ProductBacklogItem[]>;
  for (const boardId of BOARD_ORDER) {
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
  const out = {} as Record<BoardId, Task[]>;
  for (const boardId of BOARD_ORDER) {
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

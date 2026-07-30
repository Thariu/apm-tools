import { deleteField } from "firebase/firestore";
import type { FinalizedSprintBurnup } from "../releaseBurnup";
import type { BurndownSprintState } from "../burndownSprintStorage";
import type {
  BoardId,
  ProductBacklogItem,
  RetroSession,
  SprintSchedule,
  Task,
  WeekdayKey,
} from "../types";
import type { ReleaseBurnupBoardState } from "../releaseBurnupStorage";
import { isStoredProgressPercent } from "../chat/progress";

/** Firestore は undefined を受け付けないため、書き込み前に除去する */
export function stripUndefined<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** ネストしたオブジェクト・配列から undefined を再帰的に除去する */
export function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const cleaned = stripUndefinedDeep(val);
      if (cleaned !== undefined) {
        out[key] = cleaned;
      }
    }
    return out;
  }
  return value;
}

export function retroSessionToFirestore(
  value: Partial<RetroSession>,
): Record<string, unknown> {
  const cleaned = stripUndefinedDeep(value);
  if (
    cleaned === null ||
    typeof cleaned !== "object" ||
    Array.isArray(cleaned)
  ) {
    return {};
  }
  return cleaned as Record<string, unknown>;
}

export type ProductBacklogDoc = ProductBacklogItem & {
  sortOrder: number;
};

export function productBacklogToDoc(
  item: ProductBacklogItem,
  sortOrder: number,
): ProductBacklogDoc {
  return stripUndefined({ ...item, sortOrder }) as ProductBacklogDoc;
}

export function docToProductBacklog(doc: ProductBacklogDoc): ProductBacklogItem {
  const { sortOrder: _sortOrder, ...raw } = doc;
  const item: ProductBacklogItem = {
    id: raw.id,
    boardId: raw.boardId,
    title: raw.title,
    goalText: raw.goalText,
  };
  if (raw.requestUrl) item.requestUrl = raw.requestUrl;
  if (raw.points != null) item.points = raw.points;
  if (raw.assignees != null) item.assignees = raw.assignees;
  return item;
}

export function taskToFirestore(task: Task): Record<string, unknown> {
  const data = stripUndefined({
    ...task,
    assignees: task.assignees ?? [],
    startDate: task.startDate ?? "",
    dueDate: task.dueDate ?? "",
  }) as Record<string, unknown>;

  const storePercent =
    task.lane === "doing" && isStoredProgressPercent(task.progressPercent);
  if (storePercent) {
    data.progressPercent = task.progressPercent;
  } else {
    // merge でも % 表記を確実に消す
    data.progressPercent = deleteField();
  }
  return data;
}

export function docToTask(data: Task): Task {
  const task: Task = {
    id: data.id,
    boardId: data.boardId,
    parentIssueId: data.parentIssueId,
    title: data.title,
    backlogCategoryId: data.backlogCategoryId,
    lane: data.lane,
    assignees: data.assignees ?? [],
  };
  if (data.issueKey) task.issueKey = data.issueKey;
  if (data.issueType) task.issueType = data.issueType;
  if (data.startDate) task.startDate = data.startDate;
  if (data.dueDate) task.dueDate = data.dueDate;
  if (data.points != null) task.points = data.points;
  if (data.estimatedHours != null) task.estimatedHours = data.estimatedHours;
  if (data.createdAt != null) task.createdAt = data.createdAt;
  if (data.sortOrder != null) task.sortOrder = data.sortOrder;
  if (
    data.lane === "doing" &&
    isStoredProgressPercent(data.progressPercent)
  ) {
    task.progressPercent = data.progressPercent;
  }
  return task;
}

export function scheduleToFirestore(schedule: SprintSchedule): SprintSchedule {
  return { ...schedule };
}

export function parseBoardScheduleDoc(
  raw: Record<string, unknown> | undefined,
  fallback: SprintSchedule,
): { schedule: SprintSchedule; sprintGoal: string } {
  const schedule = { ...fallback };
  for (const key of WEEKDAY_KEYS) {
    const v = raw?.[key];
    if (typeof v === "string") schedule[key] = v;
  }
  const goal = raw?.sprintGoal;
  const sprintGoal = typeof goal === "string" ? goal : "";
  return { schedule, sprintGoal };
}

export function burndownSprintToFirestore(
  state: BurndownSprintState,
): BurndownSprintState {
  const retroKey = state.retroActiveSprintKey?.trim();
  return {
    activeSprintTuesdayIso: state.activeSprintTuesdayIso,
    businessDayIsos: [...state.businessDayIsos],
    ...(retroKey ? { retroActiveSprintKey: retroKey } : {}),
  };
}

export function releaseBurnupToFirestore(
  state: ReleaseBurnupBoardState,
): ReleaseBurnupBoardState {
  return {
    releaseStartTuesdayIso: state.releaseStartTuesdayIso,
    finalizedSprints: state.finalizedSprints.map((s) => ({ ...s })),
  };
}

export function finalizedSprintFromFirestore(
  data: FinalizedSprintBurnup,
): FinalizedSprintBurnup {
  return { ...data };
}

export const WEEKDAY_KEYS: WeekdayKey[] = [
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "monday",
];

export function emptySchedule(): SprintSchedule {
  return {
    tuesday: "",
    wednesday: "",
    thursday: "",
    friday: "",
    monday: "",
  };
}

export function parseBurndownSnapshots(
  docs: { id: string; wip: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of docs) {
    out[d.id] = d.wip;
  }
  return out;
}

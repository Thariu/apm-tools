import { arrayMove } from "@dnd-kit/sortable";
import { createId } from "./id";
import {
  nextSortOrderInLane,
  repositionTaskInList,
  repositionTasksInList,
} from "./taskOrder";
import type {
  ProductBacklogItem,
  SprintSchedule,
  Task,
  TaskPatch,
  WeekdayKey,
} from "./types";

export { createProductBacklogItem, createTask } from "./taskFactory";

export function addProductBacklogToBoard(
  items: ProductBacklogItem[],
  item: ProductBacklogItem,
): ProductBacklogItem[] {
  return [...items, item];
}

/** 親Backlog行を複製（新しい id を付与） */
export function cloneProductBacklogItem(
  source: ProductBacklogItem,
): ProductBacklogItem {
  const cloned: ProductBacklogItem = {
    id: createId("pb"),
    boardId: source.boardId,
    title: source.title,
    goalText: source.goalText,
    assignees: source.assignees ? [...source.assignees] : [],
  };
  if (source.requestUrl) cloned.requestUrl = source.requestUrl;
  if (source.points != null) cloned.points = source.points;
  return cloned;
}

/** 元タスクを複製。issueKey は引き継がない */
export function cloneTask(
  source: Task,
  existingTasks: Task[] = [],
  overrides?: { parentIssueId?: string },
): Task {
  const parentIssueId = overrides?.parentIssueId ?? source.parentIssueId;
  const now = Date.now();
  const sortOrder = nextSortOrderInLane(existingTasks, {
    parentIssueId,
    lane: source.lane,
  });
  const cloned: Task = {
    id: createId("task"),
    boardId: source.boardId,
    parentIssueId,
    title: source.title,
    backlogCategoryId: source.backlogCategoryId,
    lane: source.lane,
    assignees: source.assignees ? [...source.assignees] : [],
    startDate: source.startDate ?? "",
    dueDate: source.dueDate ?? "",
    createdAt: now,
    sortOrder,
  };
  if (source.issueType) cloned.issueType = source.issueType;
  if (source.points != null) cloned.points = source.points;
  if (source.estimatedHours != null) cloned.estimatedHours = source.estimatedHours;
  if (
    source.lane === "doing" &&
    (source.progressPercent === 25 ||
      source.progressPercent === 50 ||
      source.progressPercent === 75)
  ) {
    cloned.progressPercent = source.progressPercent;
  }
  return cloned;
}

export function deleteTaskInList(tasks: Task[], taskId: string): Task[] {
  return tasks.filter((t) => t.id !== taskId);
}

export function deleteTasksByParentIssueId(
  tasks: Task[],
  parentIssueId: string,
): Task[] {
  return tasks.filter((t) => t.parentIssueId !== parentIssueId);
}

export function deleteProductBacklogInBoard(
  items: ProductBacklogItem[],
  itemId: string,
): ProductBacklogItem[] {
  return items.filter((item) => item.id !== itemId);
}

export function reorderProductBacklog(
  items: ProductBacklogItem[],
  activeItemId: string,
  overItemId: string,
): ProductBacklogItem[] {
  const oldIndex = items.findIndex((i) => i.id === activeItemId);
  const newIndex = items.findIndex((i) => i.id === overItemId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return items;
  }
  return arrayMove(items, oldIndex, newIndex);
}

export { repositionTaskInList, repositionTasksInList };

export function updateTaskInList(
  tasks: Task[],
  taskId: string,
  patch: TaskPatch,
): Task[] {
  return tasks.map((t) => {
    if (t.id !== taskId) return t;
    const next: Task = { ...t, ...(patch as Partial<Task>) };
    if (
      patch.progressPercent === null ||
      patch.lane === "done" ||
      patch.lane === "todo" ||
      patch.lane === "cant"
    ) {
      delete next.progressPercent;
    }
    return next;
  });
}

export function updateProductBacklogInBoard(
  items: ProductBacklogItem[],
  itemId: string,
  patch: Partial<ProductBacklogItem>,
): ProductBacklogItem[] {
  return items.map((item) =>
    item.id === itemId ? { ...item, ...patch } : item,
  );
}

export function updateScheduleDay(
  schedule: SprintSchedule,
  day: WeekdayKey,
  name: string,
): SprintSchedule {
  return { ...schedule, [day]: name };
}


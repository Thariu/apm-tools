import { resolveBacklogCategoryId } from "./boardConfig";
import { createId } from "./id";
import type { BoardId, ProductBacklogItem, Task, TaskLane } from "./types";

/** UI（@dnd-kit）に依存しないタスク／Backlog 工場。サーバー API からも安全に import できる。 */

export function createProductBacklogItem(boardId: BoardId): ProductBacklogItem {
  return {
    id: createId("pb"),
    boardId,
    title: "",
    goalText: "",
    assignees: [],
  };
}

function nextSortOrderInLaneLocal(
  existingTasks: Task[],
  parentIssueId: string,
  lane: TaskLane,
): number {
  const laneTasks = existingTasks.filter(
    (t) => t.parentIssueId === parentIssueId && t.lane === lane,
  );
  if (laneTasks.length === 0) return 0;
  return Math.max(...laneTasks.map((t) => t.sortOrder ?? t.createdAt ?? 0)) + 1;
}

export function createTask(
  boardId: BoardId,
  parentIssueId: string,
  lane: TaskLane,
  existingTasks: Task[] = [],
): Task {
  const issueType = "その他";
  const now = Date.now();
  const sortOrder = nextSortOrderInLaneLocal(
    existingTasks,
    parentIssueId,
    lane,
  );
  return {
    id: createId("task"),
    boardId,
    parentIssueId,
    title: "",
    issueType,
    backlogCategoryId: resolveBacklogCategoryId(boardId, issueType),
    lane,
    assignees: [],
    startDate: "",
    dueDate: "",
    createdAt: now,
    sortOrder,
  };
}

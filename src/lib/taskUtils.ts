import { getTaskDueStatus } from "./dateUtils";
import type { BoardId, Task, TaskLane } from "./types";

export type TaskDueStatusCounts = {
  dueToday: number;
  overdue: number;
};

export function countDueStatusInLane(
  tasks: Task[],
  lane: TaskLane,
): TaskDueStatusCounts {
  let dueToday = 0;
  let overdue = 0;
  for (const task of tasks) {
    if (task.lane !== lane) continue;
    const status = getTaskDueStatus(task.dueDate, task.lane);
    if (status === "dueToday") dueToday++;
    else if (status === "overdue") overdue++;
  }
  return { dueToday, overdue };
}

export function getTasksForParent(tasks: Task[], parentIssueId: string): Task[] {
  return tasks.filter((t) => t.parentIssueId === parentIssueId);
}

/** onSnapshot 反映時: 他ボードは維持し、対象ボードは ID 重複なく差し替え */
export function mergeBoardTasks(
  prev: Task[],
  boardId: BoardId,
  boardTasks: Task[],
): Task[] {
  const otherBoardTasks = prev.filter((t) => t.boardId !== boardId);
  const byId = new Map<string, Task>();
  for (const t of otherBoardTasks) byId.set(t.id, t);
  for (const t of boardTasks) byId.set(t.id, t);
  return [...byId.values()];
}

export function countTasksByLane(tasks: Task[], lane: TaskLane): number {
  return tasks.filter((t) => t.lane === lane).length;
}

export { sortTasksByOrder as sortTasksByCreatedAt } from "./taskOrder";

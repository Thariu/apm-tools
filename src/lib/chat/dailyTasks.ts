import { BOARD_ORDER } from "@/lib/boardConfig";
import { toDateInputValue } from "@/lib/dateUtils";
import type { BoardId, ProductBacklogItem, Task } from "@/lib/types";

function boardRank(boardId: BoardId): number {
  const index = BOARD_ORDER.indexOf(boardId);
  return index === -1 ? BOARD_ORDER.length : index;
}

export type DailyTaskView = {
  task: Task;
  backlogTitle: string;
  boardId: BoardId;
};

/** ボード順 → sortOrder → createdAt → id（レーンは使わない） */
function compareDailyTaskViews(a: DailyTaskView, b: DailyTaskView): number {
  const byBoard = boardRank(a.boardId) - boardRank(b.boardId);
  if (byBoard !== 0) return byBoard;

  const oa = a.task.sortOrder ?? a.task.createdAt ?? 0;
  const ob = b.task.sortOrder ?? b.task.createdAt ?? 0;
  if (oa !== ob) return oa - ob;

  const ca = a.task.createdAt ?? 0;
  const cb = b.task.createdAt ?? 0;
  if (ca !== cb) return ca - cb;

  return a.task.id.localeCompare(b.task.id);
}

/** startDate〜dueDate の両方があり、当日を含む（cant 除外） */
export function isTaskActiveOnDate(task: Task, dateIso: string): boolean {
  if (task.lane === "cant") return false;
  const start = toDateInputValue(task.startDate);
  const due = toDateInputValue(task.dueDate);
  if (!start || !due) return false;
  return start <= dateIso && dateIso <= due;
}

export function taskAssignedTo(task: Task, assigneeName: string): boolean {
  const name = assigneeName.trim();
  if (!name) return false;
  return (task.assignees ?? []).some((a) => a.trim() === name);
}

export function collectDailyTasks(params: {
  tasksByBoard: Record<BoardId, Task[]>;
  backlogByBoard: Record<BoardId, ProductBacklogItem[]>;
  assigneeName: string;
  dateIso: string;
}): DailyTaskView[] {
  const { tasksByBoard, backlogByBoard, assigneeName, dateIso } = params;
  const backlogTitleById = new Map<string, string>();
  for (const items of Object.values(backlogByBoard)) {
    for (const item of items) {
      backlogTitleById.set(item.id, item.title?.trim() || "(無題 Backlog)");
    }
  }

  const out: DailyTaskView[] = [];
  for (const [boardId, tasks] of Object.entries(tasksByBoard) as [
    BoardId,
    Task[],
  ][]) {
    for (const task of tasks) {
      if (!taskAssignedTo(task, assigneeName)) continue;
      if (!isTaskActiveOnDate(task, dateIso)) continue;
      out.push({
        task,
        boardId,
        backlogTitle:
          backlogTitleById.get(task.parentIssueId) ?? "(不明な Backlog)",
      });
    }
  }

  // レーン変更で並びが動かないよう、ボード順 + sortOrder で固定
  out.sort(compareDailyTaskViews);

  return out;
}

export function incompleteDailyTasks(views: DailyTaskView[]): DailyTaskView[] {
  return views.filter((v) => v.task.lane !== "done");
}

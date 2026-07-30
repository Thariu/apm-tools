import { BOARD_CONFIGS, BOARD_ORDER } from "@/lib/boardConfig";
import {
  fetchAllProductBacklog,
  patchTask,
  setProductBacklogItem,
  setTask,
} from "@/lib/firebase/planningRepository";
import { getJstIsoDate } from "@/lib/jstDate";
import { createProductBacklogItem, createTask } from "@/lib/taskFactory";
import type { BoardId, ProductBacklogItem, Task } from "@/lib/types";
import {
  parseProgressPercent,
  patchForProgress,
  type ProgressPercent,
} from "./progress";

export type ApplyProgressResult =
  | { ok: true; lane: Task["lane"]; progress: ProgressPercent }
  | { ok: false; error: string };

export async function applyTaskProgress(params: {
  boardId: BoardId;
  taskId: string;
  progressRaw: string;
}): Promise<ApplyProgressResult> {
  const progress = parseProgressPercent(params.progressRaw);
  if (progress == null) {
    return { ok: false, error: "進捗値が不正です。" };
  }
  const patch = patchForProgress(progress);
  await patchTask(params.boardId, params.taskId, patch);
  return { ok: true, lane: patch.lane, progress };
}

export async function addTaskToExistingBacklog(params: {
  boardId: BoardId;
  parentIssueId: string;
  title: string;
  assigneeName: string;
  dateIso?: string;
}): Promise<{ task: Task } | { error: string }> {
  const title = params.title.trim();
  if (!title) return { error: "タスク名を入力してください。" };

  const dateIso = params.dateIso ?? getJstIsoDate();
  const backlogByBoard = await fetchAllProductBacklog();
  const parent = backlogByBoard[params.boardId]?.find(
    (p) => p.id === params.parentIssueId,
  );
  if (!parent) return { error: "指定の Backlog が見つかりません。" };

  // 既存タスクは sortOrder 計算用に空でも可（同レーン先頭扱い）
  const task = createTask(params.boardId, params.parentIssueId, "todo", []);
  task.title = title;
  task.assignees = [params.assigneeName];
  task.startDate = dateIso;
  task.dueDate = dateIso;

  await setTask(task);
  return { task };
}

export async function addNewBacklogWithTask(params: {
  boardId?: BoardId;
  backlogTitle: string;
  taskTitle: string;
  assigneeName: string;
  dateIso?: string;
}): Promise<
  | { backlog: ProductBacklogItem; task: Task }
  | { error: string }
> {
  const backlogTitle = params.backlogTitle.trim();
  const taskTitle = params.taskTitle.trim();
  if (!backlogTitle) return { error: "Backlog 名を入力してください。" };
  if (!taskTitle) return { error: "タスク名を入力してください。" };

  const boardId = params.boardId ?? "ad_hoc";
  if (!BOARD_ORDER.includes(boardId)) {
    return { error: "ボード ID が不正です。" };
  }

  const dateIso = params.dateIso ?? getJstIsoDate();
  const backlogByBoard = await fetchAllProductBacklog();
  const existing = backlogByBoard[boardId] ?? [];
  const sortOrder = existing.length;

  const backlog = createProductBacklogItem(boardId);
  backlog.title = backlogTitle;
  backlog.assignees = [params.assigneeName];
  const category =
    BOARD_CONFIGS[boardId].backlogCategories[
      BOARD_CONFIGS[boardId].backlogCategories.length - 1
    ];

  const task = createTask(boardId, backlog.id, "todo", []);
  task.title = taskTitle;
  task.assignees = [params.assigneeName];
  task.startDate = dateIso;
  task.dueDate = dateIso;
  task.backlogCategoryId = category.id;

  await setProductBacklogItem(boardId, backlog, sortOrder);
  await setTask(task);
  return { backlog, task };
}

export async function addMtgTask(params: {
  title: string;
  assigneeName: string;
  dateIso?: string;
}): Promise<{ task: Task; backlog: ProductBacklogItem } | { error: string }> {
  const label = params.title.trim();
  if (!label) return { error: "MTG 名を入力してください。" };
  const mtgTitle = label.startsWith("MTG:") ? label : `MTG: ${label}`;
  const result = await addNewBacklogWithTask({
    boardId: "ad_hoc",
    backlogTitle: mtgTitle,
    taskTitle: mtgTitle,
    assigneeName: params.assigneeName,
    dateIso: params.dateIso,
  });
  if ("error" in result) return result;
  return { task: result.task, backlog: result.backlog };
}

export function backlogOptionValue(boardId: BoardId, parentId: string): string {
  return `${boardId}::${parentId}`;
}

export function parseBacklogOptionValue(
  raw: string,
): { boardId: BoardId; parentIssueId: string } | null {
  const [boardId, parentIssueId] = raw.split("::");
  if (!boardId || !parentIssueId) return null;
  if (!BOARD_ORDER.includes(boardId as BoardId)) return null;
  return { boardId: boardId as BoardId, parentIssueId };
}

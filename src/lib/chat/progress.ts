import type { Task, TaskLane, TaskPatch } from "@/lib/types";
import type { DailyTaskView } from "./dailyTasks";
import { incompleteDailyTasks } from "./dailyTasks";

export type ProgressPercent = 0 | 25 | 50 | 75 | 100;

/** ボード表示用（Doing の 25/50/75 のみ） */
export type StoredProgressPercent = 25 | 50 | 75;

export function parseProgressPercent(raw: string): ProgressPercent | null {
  if (
    raw === "0" ||
    raw === "25" ||
    raw === "50" ||
    raw === "75" ||
    raw === "100"
  ) {
    return Number(raw) as ProgressPercent;
  }
  return null;
}

export function progressToLane(progress: ProgressPercent): TaskLane {
  if (progress === 0) return "todo";
  if (progress === 100) return "done";
  return "doing";
}

export function laneToProgressHint(lane: TaskLane): string {
  switch (lane) {
    case "todo":
      return "未着手";
    case "doing":
      return "Doing";
    case "done":
      return "完了";
    case "cant":
      return "Cant";
    default:
      return lane;
  }
}

/** 進捗ボタン → レーン + 保存する％（0/100 は％をクリア） */
export function patchForProgress(progress: ProgressPercent): {
  lane: TaskLane;
  progressPercent: StoredProgressPercent | null;
} {
  const lane = progressToLane(progress);
  if (progress === 25 || progress === 50 || progress === 75) {
    return { lane, progressPercent: progress };
  }
  return { lane, progressPercent: null };
}

export function isStoredProgressPercent(
  value: unknown,
): value is StoredProgressPercent {
  return value === 25 || value === 50 || value === 75;
}

/** タスクの現在状態から、進捗ボタン群のアクティブ値を解決 */
export function activeProgressFromTask(task: {
  lane: TaskLane;
  progressPercent?: number;
}): ProgressPercent | null {
  if (task.lane === "done") return 100;
  if (task.lane === "todo") return 0;
  if (task.lane === "doing" && isStoredProgressPercent(task.progressPercent)) {
    return task.progressPercent;
  }
  return null;
}

export const PROGRESS_OPTIONS: { value: ProgressPercent; label: string }[] = [
  { value: 0, label: "未着手" },
  { value: 25, label: "25%" },
  { value: 50, label: "50%" },
  { value: 75, label: "75%" },
  { value: 100, label: "完了" },
];

/** 画面の下書き → 既存状態 → 未着手 */
export function resolveDeclaredProgress(
  task: Pick<Task, "lane" | "progressPercent">,
  draft?: ProgressPercent,
): ProgressPercent {
  if (draft !== undefined) return draft;
  const current = activeProgressFromTask(task);
  if (current !== null) return current;
  return 0;
}

/** 申告完了時に未完了タスクへ適用するパッチ一覧 */
export function patchesForIncompleteDailyTasks(
  views: DailyTaskView[],
  draftByTaskId: Record<string, ProgressPercent>,
): { taskId: string; patch: TaskPatch }[] {
  return incompleteDailyTasks(views).map((view) => {
    const progress = resolveDeclaredProgress(
      view.task,
      draftByTaskId[view.task.id],
    );
    return { taskId: view.task.id, patch: patchForProgress(progress) };
  });
}

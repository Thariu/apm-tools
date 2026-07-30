import { getJstIsoDate } from "@/lib/jstDate";
import type { TaskLane } from "@/lib/types";

export type TaskDueStatus = "none" | "dueToday" | "overdue";

/** 未完了タスクの完了期限ステータス（JST 基準） */
export function getTaskDueStatus(
  dueDate: string | undefined,
  lane: TaskLane,
  now: Date = new Date(),
): TaskDueStatus {
  if (!dueDate?.trim()) return "none";
  if (lane === "done" || lane === "cant") return "none";

  const normalized = toDateInputValue(dueDate);
  if (!normalized) return "none";

  const today = getJstIsoDate(now);
  if (normalized < today) return "overdue";
  if (normalized === today) return "dueToday";
  return "none";
}

export const TASK_DUE_STATUS_LABEL: Record<Exclude<TaskDueStatus, "none">, string> =
  {
    dueToday: "本日中",
    overdue: "期限切れ",
  };

/** 表示用: 5/18 */
export function formatDueDateDisplay(value: string | undefined): string {
  if (!value) return "";
  const date = parseDueDate(value);
  if (!date) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 保存用: YYYY-MM-DD */
export function toIsoDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDueDate(value: string): Date | null {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

export function toDateInputValue(value: string | undefined): string {
  if (!value) return "";
  const date = parseDueDate(value);
  return date ? toIsoDateString(date) : "";
}

/** 着手日〜完了期限の表示（例: 5/14 ～ 5/18）。未設定のみなら null */
export function formatTaskDateRange(
  startDate?: string,
  dueDate?: string,
): string | null {
  const start = formatDueDateDisplay(startDate);
  const due = formatDueDateDisplay(dueDate);
  if (start && due) return `${start} ～ ${due}`;
  if (start) return `${start} ～`;
  if (due) return `～ ${due}`;
  return null;
}

/** 着手日が完了期限より後なら true（ISO 文字列比較） */
export function isTaskDateRangeInvalid(
  startDate?: string,
  dueDate?: string,
): boolean {
  if (!startDate || !dueDate) return false;
  return startDate > dueDate;
}

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

export function parseIsoYearMonth(iso: string): { year: number; month: number } | null {
  const date = parseDueDate(iso);
  if (!date) return null;
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** 月初の YYYY-MM-DD。month は 1–12 */
export function startOfMonthIso(year: number, month: number): string {
  return toIsoDateString(new Date(year, month - 1, 1));
}

export function addCalendarMonths(year: number, month: number, delta: number): {
  year: number;
  month: number;
} {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export type MonthGridCell = {
  iso: string;
  inMonth: boolean;
};

/** 日曜始まりの月グリッド（前後月のパディング含む） */
export function monthGridCells(year: number, month: number): MonthGridCell[] {
  const first = new Date(year, month - 1, 1);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: MonthGridCell[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    const d = new Date(year, month - 1, 1 - (firstWeekday - i));
    cells.push({ iso: toIsoDateString(d), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      iso: toIsoDateString(new Date(year, month - 1, day)),
      inMonth: true,
    });
  }
  while (cells.length % 7 !== 0) {
    const last = parseDueDate(cells[cells.length - 1].iso);
    const next = last
      ? new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)
      : new Date(year, month, 1);
    cells.push({ iso: toIsoDateString(next), inMonth: false });
  }
  return cells;
}

export function isIsoInInclusiveRange(
  iso: string,
  start?: string,
  end?: string,
): boolean {
  if (!start || !end) return false;
  return iso >= start && iso <= end;
}

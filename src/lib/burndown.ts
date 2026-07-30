import { getJstIsoDate, getJstWeekday } from "./jstDate";
import { toIsoDateString } from "./dateUtils";
import type { BurndownPoint, Task, WeekdayKey } from "./types";

/** スプリントの曜日順（火〜月）— デフォルト営業日生成用 */
export const SPRINT_DAYS: { key: WeekdayKey; label: string }[] = [
  { key: "tuesday", label: "火" },
  { key: "wednesday", label: "水" },
  { key: "thursday", label: "木" },
  { key: "friday", label: "金" },
  { key: "monday", label: "月" },
];

const SPRINT_DAY_OFFSET: Record<WeekdayKey, number> = {
  tuesday: 0,
  wednesday: 1,
  thursday: 2,
  friday: 3,
  monday: 6,
};

const WEEKDAY_LABELS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** ToDo + Doing のタスク件数（実績線用） */
export function countTodoDoing(tasks: Task[]): number {
  return tasks.filter((t) => t.lane === "todo" || t.lane === "doing").length;
}

/** 当該スプリント週の火曜日（0:00） */
export function getSprintTuesday(reference: Date): Date {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  let daysFromTuesday: number;
  if (dow === 1) daysFromTuesday = 6;
  else if (dow === 0) daysFromTuesday = 5;
  else if (dow >= 2) daysFromTuesday = dow - 2;
  else daysFromTuesday = dow + 5;
  d.setDate(d.getDate() - daysFromTuesday);
  return d;
}

export function getSprintDayIso(reference: Date, weekday: WeekdayKey): string {
  const tuesday = getSprintTuesday(reference);
  const day = new Date(tuesday);
  day.setDate(tuesday.getDate() + SPRINT_DAY_OFFSET[weekday]);
  return toIsoDateString(day);
}

/** スプリント開始火曜から標準5営業日（火〜金・月） */
export function buildDefaultBusinessDayIsos(sprintTuesdayIso: string): string[] {
  const start = new Date(`${sprintTuesdayIso}T00:00:00`);
  return SPRINT_DAYS.map(({ key }) => {
    const day = new Date(start);
    day.setDate(start.getDate() + SPRINT_DAY_OFFSET[key]);
    return toIsoDateString(day);
  });
}

/** 営業日リストからスプリント開始火曜（ISO）を推定。空なら fallback を返す */
export function deriveSprintTuesdayIsoFromBusinessDays(
  businessDayIsos: string[],
  fallbackTuesdayIso: string,
): string {
  const days = normalizeBusinessDayIsos(businessDayIsos);
  if (days.length === 0) return fallbackTuesdayIso;
  const ref = new Date(`${days[0]}T00:00:00`);
  return toIsoDateString(getSprintTuesday(ref));
}

/** 次スプリントの開始火曜 */
export function getNextSprintTuesdayIso(sprintTuesdayIso: string): string {
  const d = new Date(`${sprintTuesdayIso}T00:00:00`);
  d.setDate(d.getDate() + 7);
  return toIsoDateString(d);
}

/** チャートX軸ラベル（例: 5/19(火)）— 曜日は JST */
export function formatBurndownDayLabel(dayIso: string): string {
  const [, month, day] = dayIso.split("-").map(Number);
  const w = WEEKDAY_LABELS_JA[getJstWeekday(dayIso)];
  return `${month}/${day}(${w})`;
}

/** 理想線: 全タスク数 → 最終営業日 0 の直線 */
export function computeIdealValue(
  totalTasks: number,
  dayIndex: number,
  dayCount: number,
): number {
  if (dayCount <= 1) return dayIndex === dayCount - 1 ? 0 : totalTasks;
  const remainingDays = dayCount - 1 - dayIndex;
  return (totalTasks * remainingDays) / (dayCount - 1);
}

export type BurndownSnapshots = Record<string, number>;

/**
 * バーンダウンデータを組み立てる。
 * - ideal: ボード上の全タスク数から最終営業日で 0
 * - actual: 各日 23:59 相当のスナップショット（無い日は当日のみライブ集計）
 */
export function buildBurndownData(
  tasks: Task[],
  snapshots: BurndownSnapshots,
  businessDayIsos: string[],
  referenceDate: Date = new Date(),
): BurndownPoint[] {
  const totalTasks = tasks.length;
  const todayIso = getJstIsoDate(referenceDate);
  const liveCount = countTodoDoing(tasks);
  const dayCount = businessDayIsos.length;

  return businessDayIsos.map((dayIso, index) => {
    const ideal = computeIdealValue(totalTasks, index, dayCount);

    let actual: number | null = null;
    if (dayIso > todayIso) {
      actual = null;
    } else if (dayIso === todayIso) {
      actual = liveCount;
    } else if (snapshots[dayIso] !== undefined) {
      actual = snapshots[dayIso];
    }

    return {
      day: formatBurndownDayLabel(dayIso),
      dayIso,
      ideal,
      actual,
    };
  });
}

/** 営業日リストを昇順・重複なしで正規化 */
export function normalizeBusinessDayIsos(isos: string[]): string[] {
  return [...new Set(isos)].sort();
}

/** 営業日調整の先頭〜末尾を表示用ラベルに整形 */
export function formatBusinessDayRange(businessDayIsos: string[]): string | null {
  const days = normalizeBusinessDayIsos(businessDayIsos);
  if (days.length === 0) return null;
  const first = formatBurndownDayLabel(days[0]);
  const last = formatBurndownDayLabel(days[days.length - 1]);
  return first === last ? first : `${first}～${last}`;
}

/** 参照日が営業日調整で設定した期間（先頭〜末尾の営業日）に含まれるか */
export function isWithinBusinessDayPeriod(
  dayIso: string,
  businessDayIsos: string[],
): boolean {
  const days = normalizeBusinessDayIsos(businessDayIsos);
  if (days.length === 0) return false;
  return dayIso >= days[0] && dayIso <= days[days.length - 1];
}

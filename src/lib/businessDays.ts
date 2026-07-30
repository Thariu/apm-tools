import {
  addJstCalendarDays,
  getJstIsoDate,
  getJstWeekday,
} from "./jstDate";
import { isJapaneseHolidayIso } from "./japaneseHolidays";

/** 土日祝を除く営業日か（JST カレンダー日） */
export function isBusinessDayIso(iso: string): boolean {
  const dow = getJstWeekday(iso);
  if (dow === 0 || dow === 6) return false;
  if (isJapaneseHolidayIso(iso)) return false;
  return true;
}

/**
 * JST の今日を含む、今日から先の標準5営業日（土日祝を除く）。
 * 例: 今日が 6/2（営業日）なら 6/2, 6/3, 6/4, 6/5, 6/8 …
 */
export function buildStandardBusinessDayIsos(
  reference: Date = new Date(),
): string[] {
  const todayIso = getJstIsoDate(reference);
  let cursor = todayIso;
  const days: string[] = [];

  for (let guard = 0; days.length < 5 && guard < 366; guard++) {
    if (isBusinessDayIso(cursor)) {
      days.push(cursor);
    }
    cursor = addJstCalendarDays(cursor, 1);
  }

  if (days.length < 5) {
    throw new Error("標準5営業日を生成できませんでした");
  }

  return days;
}

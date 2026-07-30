const JST_TIME_ZONE = "Asia/Tokyo";

/** 任意の瞬間を JST のカレンダー日（YYYY-MM-DD）に変換 */
export function getJstIsoDate(reference: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

/** ISO 日付の曜日（0=日 … 6=土）— JST 基準 */
export function getJstWeekday(iso: string): number {
  const noonJst = new Date(`${iso}T12:00:00+09:00`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: JST_TIME_ZONE,
    weekday: "short",
  }).format(noonJst);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

/** JST カレンダー上で ISO 日付に日数を加算 */
export function addJstCalendarDays(iso: string, delta: number): string {
  const noonJst = new Date(`${iso}T12:00:00+09:00`);
  noonJst.setUTCDate(noonJst.getUTCDate() + delta);
  return getJstIsoDate(noonJst);
}

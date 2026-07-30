import holiday_jp from "@holiday-jp/holiday_jp";

/** 日本の祝日か（内閣府データ @holiday-jp/holiday_jp） */
export function isJapaneseHolidayIso(iso: string): boolean {
  return iso in holiday_jp.holidays;
}

/** 予定工数（時間）の表示用フォーマット。未設定は null */
export function formatEstimatedHours(hours?: number): string | null {
  if (hours == null || Number.isNaN(hours)) return null;
  const display = Number.isInteger(hours)
    ? String(hours)
    : String(parseFloat(hours.toFixed(2)));
  return `${display}h`;
}

/** 入力文字列を予定工数（時間）に変換。空・不正値は undefined */
export function parseEstimatedHours(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/h$/i, "").trim();
  if (!normalized) return undefined;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** 編集欄に表示する生の数値文字列 */
export function toEstimatedHoursInputValue(hours?: number): string {
  if (hours == null || Number.isNaN(hours)) return "";
  return Number.isInteger(hours) ? String(hours) : String(parseFloat(hours.toFixed(2)));
}

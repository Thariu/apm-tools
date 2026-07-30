import type { DailyProgressSlot } from "@/lib/dailyProgressSlot";

export type DailyCheckinSlotState = {
  /** ISO 8601 */
  completedAt: string;
};

export type DailyCheckinRecord = {
  assigneeName: string;
  dateIso: string;
  morning: DailyCheckinSlotState | null;
  midday: DailyCheckinSlotState | null;
  evening: DailyCheckinSlotState | null;
  updatedAt: string;
};

export function emptyDailyCheckin(
  dateIso: string,
  assigneeName: string,
): DailyCheckinRecord {
  return {
    assigneeName: assigneeName.trim(),
    dateIso,
    morning: null,
    midday: null,
    evening: null,
    updatedAt: new Date().toISOString(),
  };
}

export function isSlotCompleted(
  record: DailyCheckinRecord | undefined,
  slot: DailyProgressSlot,
): boolean {
  return Boolean(record?.[slot]?.completedAt);
}

export function slotCompletedAt(
  record: DailyCheckinRecord | undefined,
  slot: DailyProgressSlot,
): string | null {
  return record?.[slot]?.completedAt ?? null;
}

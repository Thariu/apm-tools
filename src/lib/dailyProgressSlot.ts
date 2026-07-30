export type DailyProgressSlot = "midday" | "evening";

export const DAILY_PROGRESS_SLOTS: {
  id: DailyProgressSlot;
  label: string;
  hint: string;
}[] = [
  {
    id: "midday",
    label: "途中",
    hint: "未完了タスクの進捗更新と追加タスク",
  },
  {
    id: "evening",
    label: "夕",
    hint: "進捗の最終回答と追加タスク",
  },
];

export function parseDailyProgressSlot(
  raw: string | null | undefined,
): DailyProgressSlot | null {
  if (raw === "midday" || raw === "evening") return raw;
  // 旧 URL（朝枠）は途中へ
  if (raw === "morning") return "midday";
  return null;
}

/** slot 未指定時の既定（17時以降は夕、それ以外は途中） */
export function defaultSlotForNow(now: Date = new Date()): DailyProgressSlot {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  if (hour >= 17) return "evening";
  return "midday";
}

export function slotLabel(slot: DailyProgressSlot): string {
  return DAILY_PROGRESS_SLOTS.find((s) => s.id === slot)?.label ?? slot;
}

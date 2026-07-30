import { getDoc, setDoc } from "firebase/firestore";
import {
  emptyDailyCheckin,
  type DailyCheckinRecord,
  type DailyCheckinSlotState,
} from "@/lib/dailyCheckin";
import type { DailyProgressSlot } from "@/lib/dailyProgressSlot";
import { dailyCheckinDoc } from "@/lib/firebase/paths";
import { stripUndefined } from "@/lib/firebase/mappers";

function normalizeRecord(
  raw: Partial<DailyCheckinRecord> | undefined,
  dateIso: string,
  assigneeName: string,
): DailyCheckinRecord {
  const base = emptyDailyCheckin(dateIso, assigneeName);
  if (!raw) return base;
  return {
    assigneeName: raw.assigneeName?.trim() || assigneeName.trim(),
    dateIso: raw.dateIso || dateIso,
    morning: raw.morning?.completedAt
      ? { completedAt: raw.morning.completedAt }
      : null,
    midday: raw.midday?.completedAt
      ? { completedAt: raw.midday.completedAt }
      : null,
    evening: raw.evening?.completedAt
      ? { completedAt: raw.evening.completedAt }
      : null,
    updatedAt: raw.updatedAt || base.updatedAt,
  };
}

export async function setDailyCheckinSlotComplete(params: {
  dateIso: string;
  assigneeName: string;
  slot: DailyProgressSlot;
  completed: boolean;
}): Promise<DailyCheckinRecord> {
  const name = params.assigneeName.trim();
  if (!name) throw new Error("担当者名が空です。");

  const ref = dailyCheckinDoc(params.dateIso, name);
  const snap = await getDoc(ref);
  const current = normalizeRecord(
    snap.exists() ? (snap.data() as DailyCheckinRecord) : undefined,
    params.dateIso,
    name,
  );

  const slotState: DailyCheckinSlotState | null = params.completed
    ? { completedAt: new Date().toISOString() }
    : null;

  const next: DailyCheckinRecord = {
    ...current,
    assigneeName: name,
    dateIso: params.dateIso,
    [params.slot]: slotState,
    updatedAt: new Date().toISOString(),
  };

  await setDoc(ref, stripUndefined(next as unknown as Record<string, unknown>), {
    merge: true,
  });
  return next;
}

export function parseDailyCheckinDoc(
  data: Record<string, unknown>,
): DailyCheckinRecord | null {
  const assigneeName =
    typeof data.assigneeName === "string" ? data.assigneeName.trim() : "";
  const dateIso = typeof data.dateIso === "string" ? data.dateIso : "";
  if (!assigneeName || !dateIso) return null;
  return normalizeRecord(data as Partial<DailyCheckinRecord>, dateIso, assigneeName);
}

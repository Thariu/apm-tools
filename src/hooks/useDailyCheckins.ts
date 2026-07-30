"use client";

import { onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  isSlotCompleted,
  type DailyCheckinRecord,
} from "@/lib/dailyCheckin";
import type { DailyProgressSlot } from "@/lib/dailyProgressSlot";
import { parseDailyCheckinDoc } from "@/lib/firebase/dailyCheckinRepository";
import { dailyCheckinsCollection } from "@/lib/firebase/paths";

/** dateIso 当日の申告完了状況を購読（assigneeName → record） */
export function useDailyCheckins(dateIso: string) {
  const [byAssignee, setByAssignee] = useState<
    Record<string, DailyCheckinRecord>
  >({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const q = query(
      dailyCheckinsCollection(),
      where("dateIso", "==", dateIso),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Record<string, DailyCheckinRecord> = {};
        for (const docSnap of snap.docs) {
          const parsed = parseDailyCheckinDoc(
            docSnap.data() as Record<string, unknown>,
          );
          if (parsed) next[parsed.assigneeName] = parsed;
        }
        setByAssignee(next);
        setReady(true);
      },
      (err) => {
        console.error("[useDailyCheckins]", err);
        setReady(true);
      },
    );
    return () => unsub();
  }, [dateIso]);

  const completedCountBySlot = useMemo(() => {
    const out: Record<DailyProgressSlot, number> = {
      midday: 0,
      evening: 0,
    };
    for (const record of Object.values(byAssignee)) {
      if (isSlotCompleted(record, "midday")) out.midday += 1;
      if (isSlotCompleted(record, "evening")) out.evening += 1;
    }
    return out;
  }, [byAssignee]);

  return { byAssignee, ready, completedCountBySlot };
}

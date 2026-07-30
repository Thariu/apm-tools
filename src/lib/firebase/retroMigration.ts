import { getDoc, getDocs } from "firebase/firestore";
import { BOARD_ORDER } from "@/lib/boardConfig";
import type { RetroSession } from "@/lib/types";
import { retroDoc, retrosCollection, retroSessionDoc } from "./paths";
import { setRetroSession } from "./planningRepository";

let legacyMigrationPromise: Promise<void> | null = null;

/** 旧 boards/{boardId}/retros を共有 retro_sessions へ1回だけ取り込む */
export function migrateLegacyBoardRetrosToSharedOnce(): Promise<void> {
  if (legacyMigrationPromise) return legacyMigrationPromise;

  legacyMigrationPromise = (async () => {
    const bySprint = new Map<string, RetroSession>();

    for (const boardId of BOARD_ORDER) {
      const snap = await getDocs(retrosCollection(boardId));
      for (const d of snap.docs) {
        const sprintKey = d.id;
        const data = d.data() as RetroSession;
        const candidate: RetroSession = {
          ...data,
          sprintKey,
          updatedAt: data.updatedAt ?? "",
        };
        const existing = bySprint.get(sprintKey);
        if (
          !existing ||
          (candidate.updatedAt ?? "") > (existing.updatedAt ?? "")
        ) {
          bySprint.set(sprintKey, candidate);
        }
      }
    }

    for (const [sprintKey, session] of bySprint) {
      const shared = await getDoc(retroSessionDoc(sprintKey));
      if (shared.exists()) continue;
      await setRetroSession({ ...session, sprintKey });
    }
  })().catch((err) => {
    legacyMigrationPromise = null;
    console.error("legacy retro migration failed", err);
    throw err;
  });

  return legacyMigrationPromise;
}

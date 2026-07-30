import type { BoardId } from "./types";

const STORAGE_KEY = "planning-burndown-sprint";

/** 全ボード共通のスプリントバーンダウン表示設定 */
export type BurndownSprintState = {
  /** 表示中スプリントの開始火曜（ISO）— 確定までカレンダー週で進まない */
  activeSprintTuesdayIso: string;
  /** バーンダウンX軸の営業日（ISO、昇順） */
  businessDayIsos: string[];
  /** 手動指定した振り返り対象スプリント（火曜 ISO）。未設定時は自動判定 */
  retroActiveSprintKey?: string;
};

const BOARD_IDS: BoardId[] = [
  "ad_hoc",
  "baseball_board",
  "proposal_improvement",
];

import { defaultBurndownSprintState as defaultBurndownSprintStateImpl } from "./planningDefaults";

function defaultBurndownSprintState(
  reference: Date = new Date(),
): BurndownSprintState {
  return defaultBurndownSprintStateImpl(reference);
}

function normalizeState(raw: {
  activeSprintTuesdayIso?: string;
  businessDayIsos?: string[];
}): BurndownSprintState | null {
  if (
    !raw.activeSprintTuesdayIso ||
    !Array.isArray(raw.businessDayIsos) ||
    raw.businessDayIsos.length === 0
  ) {
    return null;
  }
  return {
    activeSprintTuesdayIso: raw.activeSprintTuesdayIso,
    businessDayIsos: [...raw.businessDayIsos].sort(),
  };
}

/** 旧形式（ボード別）から共通設定へ移行 */
function migrateFromPerBoardFormat(
  parsed: Record<string, unknown>,
): BurndownSprintState | null {
  for (const id of BOARD_IDS) {
    const board = parsed[id];
    if (board && typeof board === "object" && board !== null) {
      const migrated = normalizeState(board as BurndownSprintState);
      if (migrated) return migrated;
    }
  }
  return null;
}

export function loadBurndownSprintState(): BurndownSprintState {
  if (typeof window === "undefined") {
    return defaultBurndownSprintState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultBurndownSprintState();

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const global = normalizeState(parsed as BurndownSprintState);
    if (global) return global;

    const migrated = migrateFromPerBoardFormat(parsed);
    if (migrated) {
      saveBurndownSprintState(migrated);
      return migrated;
    }

    return defaultBurndownSprintState();
  } catch {
    return defaultBurndownSprintState();
  }
}

export function saveBurndownSprintState(data: BurndownSprintState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

export { defaultBurndownSprintState } from "./planningDefaults";

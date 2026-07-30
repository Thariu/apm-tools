import { BOARD_ORDER } from "./boardConfig";
import {
  buildDefaultBusinessDayIsos,
  deriveSprintTuesdayIsoFromBusinessDays,
  formatBurndownDayLabel,
  formatBusinessDayRange,
} from "./burndown";
import type { BurndownSprintState } from "./burndownSprintStorage";
import { isRetroSessionArchived } from "./retroArchive";
import { getPreviousSprintTuesdayIso } from "./releaseBurnup";
import type { ReleaseBurnupByBoard } from "./releaseBurnupStorage";
import type { RetroSession } from "./types";

/** バーンダウン（計画）上の現在スプリント週（火曜 ISO） */
export function getPlanningSprintKey(
  burndownSprint: BurndownSprintState,
): string {
  return deriveSprintTuesdayIsoFromBusinessDays(
    burndownSprint.businessDayIsos,
    burndownSprint.activeSprintTuesdayIso,
  );
}

/** 全ボードで指定スプリント週の実績が確定済みか */
export function areAllBoardsFinalizedForSprint(
  releaseBurnupByBoard: ReleaseBurnupByBoard,
  sprintTuesdayIso: string,
): boolean {
  return BOARD_ORDER.every((boardId) =>
    (releaseBurnupByBoard[boardId]?.finalizedSprints ?? []).some(
      (s) => s.sprintTuesdayIso === sprintTuesdayIso,
    ),
  );
}

/**
 * 計画週より前で、全ボード確定済み・振り返り未アーカイブの最古スプリント。
 * なければ null。
 */
export function findOldestPendingRetroSprintKey(
  planningSprintKey: string,
  releaseBurnupByBoard: ReleaseBurnupByBoard,
  retroBySprint: Record<string, RetroSession | null | undefined>,
): string | null {
  let key = getPreviousSprintTuesdayIso(
    new Date(`${planningSprintKey}T00:00:00`),
  );
  let oldestPending: string | null = null;

  for (let i = 0; i < 52 && key < planningSprintKey; i++) {
    if (
      !areAllBoardsFinalizedForSprint(releaseBurnupByBoard, key)
    ) {
      break;
    }

    const session = retroBySprint[key];
    if (isRetroSessionArchived(session)) break;

    oldestPending = key;
    key = getPreviousSprintTuesdayIso(new Date(`${key}T00:00:00`));
  }

  return oldestPending;
}

/** 手動未指定時: 未完了の前スプリント振り返りがあればそちら、なければ計画週 */
export function resolveAutoRetroSprintKey(options: {
  burndownSprint: BurndownSprintState;
  releaseBurnupByBoard: ReleaseBurnupByBoard;
  retroBySprint: Record<string, RetroSession | null | undefined>;
}): string {
  const planningKey = getPlanningSprintKey(options.burndownSprint);
  const pending = findOldestPendingRetroSprintKey(
    planningKey,
    options.releaseBurnupByBoard,
    options.retroBySprint,
  );
  return pending ?? planningKey;
}

/** 手動指定が有効ならそれを、無ければ自動判定 */
export function resolveCurrentRetroSprintKey(options: {
  burndownSprint: BurndownSprintState;
  releaseBurnupByBoard: ReleaseBurnupByBoard;
  retroBySprint: Record<string, RetroSession | null | undefined>;
}): string {
  const autoKey = resolveAutoRetroSprintKey(options);
  const manual = options.burndownSprint.retroActiveSprintKey?.trim();
  if (!manual) return autoKey;

  const session = options.retroBySprint[manual];
  if (isRetroSessionArchived(session)) return autoKey;

  return manual;
}

/** 振り返り期間の表示ラベル（セッション未作成時も sprintKey 基準） */
export function retroPeriodLabelFromSprintKey(
  sprintKey: string,
  session?: RetroSession | null,
): string {
  const isos =
    session?.businessDayIsos?.length
      ? session.businessDayIsos
      : buildDefaultBusinessDayIsos(sprintKey);
  return formatBusinessDayRange(isos) ?? formatBurndownDayLabel(sprintKey);
}

/**
 * 計画週に誤って保存された振り返りを、自動判定の正しい週へ移行できるか。
 * 例: 6/9 週キーに保存済み → 6/2 週へ移行。
 */
export function detectRetroSprintKeyMigration(options: {
  planningSprintKey: string;
  autoRetroSprintKey: string;
  retroBySprint: Record<string, RetroSession | null | undefined>;
}): { fromSprintKey: string; toSprintKey: string } | null {
  const { planningSprintKey, autoRetroSprintKey, retroBySprint } = options;
  if (autoRetroSprintKey === planningSprintKey) return null;

  const misplaced = retroBySprint[planningSprintKey];
  if (!misplaced?.framework) return null;

  const target = retroBySprint[autoRetroSprintKey];
  if (target?.framework) return null;

  return {
    fromSprintKey: planningSprintKey,
    toSprintKey: autoRetroSprintKey,
  };
}

/** 手動選択用: 計画週から過去方向に sprintKey 一覧 */
export function buildRetroSprintKeyOptions(
  planningSprintKey: string,
  count = 12,
): string[] {
  const keys: string[] = [];
  let key = planningSprintKey;
  for (let i = 0; i < count; i++) {
    keys.push(key);
    key = getPreviousSprintTuesdayIso(new Date(`${key}T00:00:00`));
  }
  return keys;
}

import { BOARD_ORDER } from "./boardConfig";
import { getSprintTuesday } from "./burndown";
import { toIsoDateString } from "./dateUtils";
import type { BoardId, ProductBacklogItem, Task } from "./types";

export const RELEASE_TARGET_POINTS = 200;
/** リリース計画のスプリント数（理想線の算出に使用） */
export const PLANNED_SPRINT_COUNT = 20;
/** Firestore に保持する確定スプリントの上限 */
export const MAX_STORED_FINALIZED_SPRINTS = 50;
/** チャートに表示するスプリント数（直近） */
export const DISPLAY_SPRINT_COUNT = 20;

export type FinalizedSprintBurnup = {
  sprintTuesdayIso: string;
  sprintIndex: number;
  pointsCompleted: number;
  finalizedAt: string;
};

export type ReleaseBurnupChartPoint = {
  sprintLabel: string;
  sprintIndex: number;
  /** そのスプリントで確定した増分ポイント（棒グラフ） */
  increment: number | null;
  idealCumulative: number;
  /** 直近3スプリント平均ベロシティ（未確定スプリントの予測週次増分） */
  avgVelocity: number | null;
};

/** 子タスクがすべて Done または Can't の親 Backlog を完了扱い */
export function isParentResolved(tasks: Task[], parentIssueId: string): boolean {
  const children = tasks.filter((t) => t.parentIssueId === parentIssueId);
  if (children.length === 0) return false;
  return children.every((t) => t.lane === "done" || t.lane === "cant");
}

/** 完了扱いの親 Backlog のポイント合計 */
export function computeCompletedBacklogPoints(
  backlog: ProductBacklogItem[],
  tasks: Task[],
): number {
  return backlog.reduce((sum, item) => {
    if (!isParentResolved(tasks, item.id)) return sum;
    return sum + (item.points ?? 0);
  }, 0);
}

export function getResolvedBacklogItems(
  backlog: ProductBacklogItem[],
  tasks: Task[],
): ProductBacklogItem[] {
  return backlog.filter((item) => isParentResolved(tasks, item.id));
}

/** 直前に完了したスプリント（火曜始まり）の火曜日 */
export function getPreviousSprintTuesdayIso(reference: Date = new Date()): string {
  const prev = getSprintTuesday(reference);
  prev.setDate(prev.getDate() - 7);
  return toIsoDateString(prev);
}

export function getSprintIndex(
  sprintTuesdayIso: string,
  releaseStartTuesdayIso: string,
): number {
  const start = new Date(`${releaseStartTuesdayIso}T00:00:00`);
  const sprint = new Date(`${sprintTuesdayIso}T00:00:00`);
  const diffMs = sprint.getTime() - start.getTime();
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
}

export function getSprintTuesdayIsoForIndex(
  releaseStartTuesdayIso: string,
  sprintIndex: number,
): string {
  const start = new Date(`${releaseStartTuesdayIso}T00:00:00`);
  start.setDate(start.getDate() + (sprintIndex - 1) * 7);
  return toIsoDateString(start);
}

function averageLastN(values: number[], n: number): number | null {
  if (values.length === 0) return null;
  const slice = values.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function sortFinalizedSprints(
  sprints: FinalizedSprintBurnup[],
): FinalizedSprintBurnup[] {
  return [...sprints].sort((a, b) => a.sprintIndex - b.sprintIndex);
}

/** 古い確定スプリントから削除し、最大 maxCount 件を残す */
export function trimFinalizedSprints(
  sprints: FinalizedSprintBurnup[],
  maxCount = MAX_STORED_FINALIZED_SPRINTS,
): FinalizedSprintBurnup[] {
  const sorted = sortFinalizedSprints(sprints);
  return sorted.length <= maxCount ? sorted : sorted.slice(-maxCount);
}

/** 今回の確定後、全ボードで同一スプリント週が確定済みになるか */
export function willAllBoardsFinalizeSprint(
  finalizedByBoard: Record<BoardId, FinalizedSprintBurnup[]>,
  activeBoardId: BoardId,
  sprintTuesdayIso: string,
): boolean {
  return BOARD_ORDER.every((boardId) => {
    if (boardId === activeBoardId) return true;
    return finalizedByBoard[boardId]?.some(
      (s) => s.sprintTuesdayIso === sprintTuesdayIso,
    );
  });
}

export type BuildReleaseBurnupChartOptions = {
  /** 未確定の現在スプリント番号（表示ウィンドウの右端に含める） */
  currentSprintIndex?: number;
};

export function buildReleaseBurnupChartData(
  finalizedSprints: FinalizedSprintBurnup[],
  options?: BuildReleaseBurnupChartOptions,
): ReleaseBurnupChartPoint[] {
  const sorted = sortFinalizedSprints(finalizedSprints);
  const byIndex = new Map(
    sorted.map((s) => [s.sprintIndex, s.pointsCompleted]),
  );

  const increments = sorted.map((s) => s.pointsCompleted);
  let lastFinalizedIndex = 0;
  for (const sprint of sorted) {
    lastFinalizedIndex = sprint.sprintIndex;
  }

  const maxFinalizedIndex =
    sorted.length > 0 ? sorted[sorted.length - 1].sprintIndex : 0;
  const currentIndex = options?.currentSprintIndex ?? 1;
  const windowEnd = Math.max(
    DISPLAY_SPRINT_COUNT,
    maxFinalizedIndex,
    currentIndex,
  );
  const windowStart = Math.max(1, windowEnd - DISPLAY_SPRINT_COUNT + 1);

  const rows: ReleaseBurnupChartPoint[] = [];
  for (let i = windowStart; i <= windowEnd; i++) {
    const idealCumulative = Math.round(
      (RELEASE_TARGET_POINTS * i) / PLANNED_SPRINT_COUNT,
    );
    const increment = byIndex.get(i) ?? null;

    rows.push({
      sprintLabel: `Sprint${i}`,
      sprintIndex: i,
      increment,
      idealCumulative,
      avgVelocity: null,
    });
  }

  const avgVelocity = averageLastN(increments, 3);
  if (avgVelocity != null && increments.length > 0) {
    const roundedVelocity = Math.round(avgVelocity * 10) / 10;
    const velocityLineEnd = Math.max(lastFinalizedIndex + 1, currentIndex);
    for (let i = lastFinalizedIndex + 1; i <= velocityLineEnd; i++) {
      const rowIdx = rows.findIndex((r) => r.sprintIndex === i);
      if (rowIdx >= 0) {
        rows[rowIdx].avgVelocity = roundedVelocity;
      }
    }
  }

  return rows;
}

/** リリース第1スプリント = 直前に完了した週の火曜 */
export function getDefaultReleaseStartTuesday(reference: Date = new Date()): string {
  return getPreviousSprintTuesdayIso(reference);
}

/** リリースバーンアップの Y 軸（低ポイントでも読みやすい目盛り間隔） */
export function buildReleaseBurnupYAxis(peakValue: number): {
  domain: [number, number];
  ticks: number[];
} {
  const domainMax = Math.max(
    RELEASE_TARGET_POINTS,
    peakValue,
    10,
  );
  const paddedMax =
    domainMax <= RELEASE_TARGET_POINTS
      ? RELEASE_TARGET_POINTS
      : Math.ceil((domainMax + 5) / 10) * 10;
  const step =
    paddedMax <= 40 ? 5 : paddedMax <= 200 ? 10 : 20;

  const ticks: number[] = [];
  for (let v = 0; v <= paddedMax; v += step) {
    ticks.push(v);
  }

  return { domain: [0, paddedMax], ticks };
}

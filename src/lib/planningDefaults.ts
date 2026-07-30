import { buildStandardBusinessDayIsos } from "./businessDays";
import { getSprintTuesday } from "./burndown";
import { toIsoDateString } from "./dateUtils";
import { getDefaultReleaseStartTuesday } from "./releaseBurnup";
import type { BoardId } from "./types";
import type { BurndownSprintState } from "./burndownSprintStorage";
import type { ReleaseBurnupBoardState } from "./releaseBurnupStorage";

export function defaultBurndownSprintState(
  reference: Date = new Date(),
): BurndownSprintState {
  const thisWeekTuesday = getSprintTuesday(reference);
  const activeTuesday = new Date(thisWeekTuesday);
  if (reference.getDay() === 2) {
    activeTuesday.setDate(activeTuesday.getDate() - 7);
  }
  const activeSprintTuesdayIso = toIsoDateString(activeTuesday);
  return {
    activeSprintTuesdayIso,
    businessDayIsos: buildStandardBusinessDayIsos(reference),
  };
}

export function defaultReleaseBurnupBoardState(): ReleaseBurnupBoardState {
  return {
    releaseStartTuesdayIso: getDefaultReleaseStartTuesday(),
    finalizedSprints: [],
  };
}

export const EMPTY_BURNDOWN_SNAPSHOTS: Record<BoardId, Record<string, number>> =
  {
    baseball_board: {},
    proposal_improvement: {},
    ad_hoc: {},
  };

import type { BoardId } from "./types";
import type { FinalizedSprintBurnup } from "./releaseBurnup";
import { getDefaultReleaseStartTuesday } from "./releaseBurnup";

const STORAGE_KEY = "planning-release-burnup";

export type ReleaseBurnupBoardState = {
  releaseStartTuesdayIso: string;
  finalizedSprints: FinalizedSprintBurnup[];
};

export type ReleaseBurnupByBoard = Record<BoardId, ReleaseBurnupBoardState>;

function defaultBoardState(): ReleaseBurnupBoardState {
  return {
    releaseStartTuesdayIso: getDefaultReleaseStartTuesday(),
    finalizedSprints: [],
  };
}

export function loadReleaseBurnupState(): ReleaseBurnupByBoard {
  if (typeof window === "undefined") {
    return {
      baseball_board: defaultBoardState(),
      proposal_improvement: defaultBoardState(),
      ad_hoc: defaultBoardState(),
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        baseball_board: defaultBoardState(),
        proposal_improvement: defaultBoardState(),
        ad_hoc: defaultBoardState(),
      };
    }
    const parsed = JSON.parse(raw) as Partial<ReleaseBurnupByBoard>;
    return {
      baseball_board: parsed.baseball_board ?? defaultBoardState(),
      proposal_improvement:
        parsed.proposal_improvement ?? defaultBoardState(),
      ad_hoc: parsed.ad_hoc ?? defaultBoardState(),
    };
  } catch {
    return {
      baseball_board: defaultBoardState(),
      proposal_improvement: defaultBoardState(),
      ad_hoc: defaultBoardState(),
    };
  }
}

export function saveReleaseBurnupState(data: ReleaseBurnupByBoard): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

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
    return {};
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ReleaseBurnupByBoard;
  } catch {
    return {};
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

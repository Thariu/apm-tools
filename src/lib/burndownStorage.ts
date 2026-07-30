import type { BoardId } from "./types";

const STORAGE_KEY = "planning-burndown-snapshots";

export type BurndownSnapshotsByBoard = Record<
  BoardId,
  Record<string, number>
>;

export function loadBurndownSnapshots(): BurndownSnapshotsByBoard {
  if (typeof window === "undefined") return {} as BurndownSnapshotsByBoard;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {} as BurndownSnapshotsByBoard;
    return JSON.parse(raw) as BurndownSnapshotsByBoard;
  } catch {
    return {} as BurndownSnapshotsByBoard;
  }
}

export function saveBurndownSnapshots(data: BurndownSnapshotsByBoard): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

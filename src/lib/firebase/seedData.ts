import { BOARD_ORDER } from "../boardConfig";
import {
  MOCK_PRODUCT_BACKLOG_BY_BOARD,
  MOCK_SPRINT_SCHEDULE_BY_BOARD,
  MOCK_TASKS,
} from "../mockData";
import { defaultBurndownSprintState } from "../planningDefaults";
import { defaultReleaseBurnupBoardState } from "../planningDefaults";
import type { BoardId, ProductBacklogItem, Task } from "../types";
import { productBacklogToDoc } from "./mappers";

export function getSeedProductBacklogByBoard(): Record<
  BoardId,
  ProductBacklogItem[]
> {
  const out = {} as Record<BoardId, ProductBacklogItem[]>;
  for (const boardId of BOARD_ORDER) {
    out[boardId] = [...MOCK_PRODUCT_BACKLOG_BY_BOARD[boardId]];
  }
  return out;
}

export function getSeedSchedulesByBoard() {
  return { ...MOCK_SPRINT_SCHEDULE_BY_BOARD };
}

export function getSeedTasks(): Task[] {
  return [...MOCK_TASKS];
}

export function getSeedProductBacklogDocs(boardId: BoardId) {
  return MOCK_PRODUCT_BACKLOG_BY_BOARD[boardId].map((item, index) =>
    productBacklogToDoc(item, index),
  );
}

export function getSeedBurndownSprintState() {
  return defaultBurndownSprintState();
}

export function getSeedReleaseBurnupByBoard(): Record<
  BoardId,
  ReturnType<typeof defaultReleaseBurnupBoardState>
> {
  const out = {} as Record<
    BoardId,
    ReturnType<typeof defaultReleaseBurnupBoardState>
  >;
  for (const boardId of BOARD_ORDER) {
    out[boardId] = defaultReleaseBurnupBoardState();
  }
  return out;
}

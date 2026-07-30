import {
  fetchAllProductBacklog,
  fetchAllTasks,
  fetchBoardLabels,
} from "@/lib/firebase/planningRepository";
import { BOARD_ORDER } from "@/lib/boardConfig";
import type { BoardId, ProductBacklogItem, Task } from "@/lib/types";

export async function loadBoardSnapshot(): Promise<{
  tasksByBoard: Record<BoardId, Task[]>;
  backlogByBoard: Record<BoardId, ProductBacklogItem[]>;
  boardLabels: Record<BoardId, string>;
}> {
  const [tasksByBoard, backlogByBoard, boardLabels] = await Promise.all([
    fetchAllTasks(),
    fetchAllProductBacklog(),
    fetchBoardLabels(),
  ]);
  return { tasksByBoard, backlogByBoard, boardLabels };
}

export function flattenBacklogOptions(
  backlogByBoard: Record<BoardId, ProductBacklogItem[]>,
): { boardId: BoardId; item: ProductBacklogItem }[] {
  const out: { boardId: BoardId; item: ProductBacklogItem }[] = [];
  for (const boardId of BOARD_ORDER) {
    for (const item of backlogByBoard[boardId] ?? []) {
      out.push({ boardId, item });
    }
  }
  return out;
}

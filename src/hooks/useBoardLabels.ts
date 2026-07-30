"use client";

import { onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import {
  BOARD_CONFIGS,
  defaultBoardLabels,
  parseBoardLabelsDoc,
} from "@/lib/boardConfig";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { boardLabelsDoc } from "@/lib/firebase/paths";
import { patchBoardLabel } from "@/lib/firebase/planningRepository";
import type { BoardId } from "@/lib/types";

export function useBoardLabels() {
  const [boardLabelsByBoard, setBoardLabelsByBoard] =
    useState<Record<BoardId, string>>(defaultBoardLabels);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const unsub = onSnapshot(boardLabelsDoc(), (snap) => {
      setBoardLabelsByBoard(
        parseBoardLabelsDoc(
          snap.exists() ? (snap.data() as Record<string, unknown>) : null,
        ),
      );
    });
    return () => unsub();
  }, []);

  const updateBoardLabel = useCallback((boardId: BoardId, label: string) => {
    const trimmed = label.trim() || BOARD_CONFIGS[boardId].label;
    setBoardLabelsByBoard((prev) => ({ ...prev, [boardId]: trimmed }));
    if (!isFirebaseConfigured()) return;
    void patchBoardLabel(boardId, trimmed).catch(console.error);
  }, []);

  return { boardLabelsByBoard, updateBoardLabel };
}

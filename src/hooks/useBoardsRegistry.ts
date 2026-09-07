"use client";

import { onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activeBoardIdsFromRegistry,
  archivedBoardEntries,
  defaultLegacyRegistryEntries,
  getBoardConfig,
  labelsFromRegistry,
  parseBoardsRegistryDoc,
} from "@/lib/boardConfig";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { boardsRegistryDoc } from "@/lib/firebase/paths";
import {
  addBoardCategory,
  archiveBoardCategory,
  ensureBoardsRegistry,
  permanentlyDeleteBoardCategory,
  patchBoardLabel,
  reorderBoardCategories,
  restoreBoardCategory,
} from "@/lib/firebase/planningRepository";
import type { BoardId, BoardRegistryEntry } from "@/lib/types";

export function useBoardsRegistry() {
  const [entries, setEntries] = useState<BoardRegistryEntry[]>(
    defaultLegacyRegistryEntries,
  );
  const [ready, setReady] = useState(!isFirebaseConfigured());

  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    let cancelled = false;
    void ensureBoardsRegistry()
      .then((initial) => {
        if (!cancelled) {
          setEntries(initial);
          setReady(true);
        }
      })
      .catch(console.error);

    const unsub = onSnapshot(boardsRegistryDoc(), (snap) => {
      if (!snap.exists()) return;
      setEntries(
        parseBoardsRegistryDoc(snap.data() as Record<string, unknown>),
      );
      setReady(true);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const activeBoardIds = useMemo(
    () => activeBoardIdsFromRegistry(entries),
    [entries],
  );

  const archivedEntries = useMemo(
    () => archivedBoardEntries(entries),
    [entries],
  );

  const boardLabelsByBoard = useMemo(
    () => labelsFromRegistry(entries),
    [entries],
  );

  const updateBoardLabel = useCallback((boardId: BoardId, label: string) => {
    const trimmed =
      label.trim() || getBoardConfig(boardId).label;
    setEntries((prev) =>
      prev.map((e) => (e.id === boardId ? { ...e, label: trimmed } : e)),
    );
    if (!isFirebaseConfigured()) return;
    void patchBoardLabel(boardId, trimmed).catch(console.error);
  }, []);

  const addBoard = useCallback(async (label: string) => {
    if (!isFirebaseConfigured()) {
      const id = `local-${Date.now()}`;
      const entry: BoardRegistryEntry = {
        id,
        label: label.trim() || "新しいカテゴリ",
        order: entries.length,
      };
      setEntries((prev) => [...prev, entry]);
      return entry;
    }
    return addBoardCategory(label);
  }, [entries.length]);

  const archiveBoard = useCallback(async (boardId: BoardId) => {
    if (!isFirebaseConfigured()) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === boardId
            ? { ...e, archivedAt: new Date().toISOString() }
            : e,
        ),
      );
      return;
    }
    await archiveBoardCategory(boardId);
  }, []);

  const restoreBoard = useCallback(async (boardId: BoardId) => {
    if (!isFirebaseConfigured()) {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id !== boardId) return e;
          const { archivedAt: _a, ...rest } = e;
          return rest;
        }),
      );
      return;
    }
    await restoreBoardCategory(boardId);
  }, []);

  const permanentlyDeleteBoard = useCallback(async (boardId: BoardId) => {
    if (!isFirebaseConfigured()) {
      setEntries((prev) => prev.filter((e) => e.id !== boardId));
      return;
    }
    await permanentlyDeleteBoardCategory(boardId);
  }, []);

  const reorderBoards = useCallback(async (orderedActiveIds: BoardId[]) => {
    setEntries((prev) => {
      const orderById = new Map(
        orderedActiveIds.map((id, index) => [id, index] as const),
      );
      return prev.map((e) => {
        if (e.archivedAt) return e;
        const order = orderById.get(e.id);
        return order === undefined ? e : { ...e, order };
      });
    });
    if (!isFirebaseConfigured()) return;
    await reorderBoardCategories(orderedActiveIds);
  }, []);

  return {
    ready,
    entries,
    activeBoardIds,
    archivedEntries,
    boardLabelsByBoard,
    updateBoardLabel,
    addBoard,
    archiveBoard,
    restoreBoard,
    permanentlyDeleteBoard,
    reorderBoards,
  };
}

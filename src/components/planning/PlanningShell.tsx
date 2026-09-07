"use client";

import { useEffect, useState } from "react";
import { BoardSwitcher } from "@/components/board/BoardSwitcher";
import { PlanningCanvas } from "@/components/canvas/PlanningCanvas";
import { useBoardsRegistry } from "@/hooks/useBoardsRegistry";
import {
  parseDailyProgressSlot,
  type DailyProgressSlot,
} from "@/lib/dailyProgressSlot";
import type { BoardId, AppView } from "@/lib/types";

function parseViewParam(raw: string | null): AppView | null {
  if (
    raw === "planning" ||
    raw === "memberTasks" ||
    raw === "retro" ||
    raw === "dailyProgress"
  ) {
    return raw;
  }
  return null;
}

export function PlanningShell() {
  const {
    activeBoardIds,
    archivedEntries,
    boardLabelsByBoard,
    updateBoardLabel,
    addBoard,
    archiveBoard,
    restoreBoard,
    permanentlyDeleteBoard,
    reorderBoards,
  } = useBoardsRegistry();

  const [activeBoardId, setActiveBoardId] = useState<BoardId>("ad_hoc");
  const [activeView, setActiveView] = useState<AppView>("planning");
  const [activeSprintLabel, setActiveSprintLabel] = useState<string | null>(
    null,
  );
  const [initialAssignee, setInitialAssignee] = useState<string | undefined>();
  const [initialSlot, setInitialSlot] = useState<
    DailyProgressSlot | undefined
  >();

  useEffect(() => {
    if (activeBoardIds.length === 0) return;
    if (!activeBoardIds.includes(activeBoardId)) {
      setActiveBoardId(activeBoardIds[0]);
    }
  }, [activeBoardIds, activeBoardId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = parseViewParam(params.get("view"));
    if (view) setActiveView(view);
    const assignee = params.get("assignee")?.trim();
    if (assignee) setInitialAssignee(assignee);
    const slot = parseDailyProgressSlot(params.get("slot"));
    if (slot) setInitialSlot(slot);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeView === "planning") {
      url.searchParams.delete("view");
      url.searchParams.delete("slot");
    } else {
      url.searchParams.set("view", activeView);
      if (activeView !== "dailyProgress") {
        url.searchParams.delete("slot");
      }
    }
    window.history.replaceState({}, "", url.toString());
  }, [activeView]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-white px-4 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-sm font-bold text-gray-800">
            アジャイルプランニングボード
          </h1>
          <BoardSwitcher
            activeBoardId={activeBoardId}
            onChange={setActiveBoardId}
            activeView={activeView}
            onChangeView={setActiveView}
            activeBoardIds={activeBoardIds}
            archivedEntries={archivedEntries}
            boardLabelsByBoard={boardLabelsByBoard}
            onUpdateBoardLabel={updateBoardLabel}
            onAddBoard={addBoard}
            onArchiveBoard={archiveBoard}
            onRestoreBoard={restoreBoard}
            onPermanentlyDeleteBoard={permanentlyDeleteBoard}
            onReorderBoards={reorderBoards}
          />
        </div>
        {activeView === "planning" && activeSprintLabel ? (
          <div className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700">
            Sprint: {activeSprintLabel}
          </div>
        ) : null}
      </header>
      <div className="min-h-0 flex-1">
        <PlanningCanvas
          activeBoardId={activeBoardId}
          activeView={activeView}
          activeBoardIds={activeBoardIds}
          boardLabelsByBoard={boardLabelsByBoard}
          initialDailyAssignee={initialAssignee}
          initialDailySlot={initialSlot}
          onActiveSprintLabelChange={setActiveSprintLabel}
        />
      </div>
    </div>
  );
}

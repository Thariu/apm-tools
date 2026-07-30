"use client";

import { BOARD_CONFIGS, BOARD_ORDER, resolveBoardLabel } from "@/lib/boardConfig";
import type { BoardId, AppView } from "@/lib/types";
import { InlineEdit } from "@/components/ui/InlineEdit";

type BoardSwitcherProps = {
  activeBoardId: BoardId;
  onChange: (boardId: BoardId) => void;
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  boardLabelsByBoard: Record<BoardId, string>;
  onUpdateBoardLabel: (boardId: BoardId, label: string) => void;
};

export function BoardSwitcher({
  activeBoardId,
  onChange,
  activeView,
  onChangeView,
  boardLabelsByBoard,
  onUpdateBoardLabel,
}: BoardSwitcherProps) {
  return (
    <nav
      className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1"
      aria-label="ボード切り替え"
    >
      {BOARD_ORDER.map((boardId) => {
        const config = BOARD_CONFIGS[boardId];
        const label = resolveBoardLabel(boardId, boardLabelsByBoard);
        const isActive = activeView === "planning" && boardId === activeBoardId;
        const tabClassName = [
          "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
          isActive
            ? config.activeTabClassName
            : "bg-white text-gray-900 hover:bg-gray-100",
        ].join(" ");

        if (isActive) {
          return (
            <div
              key={boardId}
              className={tabClassName}
              aria-current="page"
              title="クリックしてボード名を編集"
            >
              <InlineEdit
                value={label}
                onChange={(next) => onUpdateBoardLabel(boardId, next)}
                layout="inline"
                placeholder="ボード名"
                className="text-inherit"
                inputClassName="min-w-[4.5rem] text-xs font-semibold !text-gray-900"
              />
            </div>
          );
        }

        return (
          <button
            key={boardId}
            type="button"
            onClick={() => {
              onChange(boardId);
              onChangeView("planning");
            }}
            className={tabClassName}
          >
            {label}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onChangeView("memberTasks")}
        className={[
          "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
          activeView === "memberTasks"
            ? "bg-indigo-700 text-white shadow-sm"
            : "bg-white text-gray-900 hover:bg-gray-100",
        ].join(" ")}
        aria-current={activeView === "memberTasks" ? "page" : undefined}
      >
        メンバー別タスク
      </button>

      <button
        type="button"
        onClick={() => onChangeView("dailyProgress")}
        className={[
          "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
          activeView === "dailyProgress"
            ? "bg-teal-700 text-white shadow-sm"
            : "bg-white text-gray-900 hover:bg-gray-100",
        ].join(" ")}
        aria-current={activeView === "dailyProgress" ? "page" : undefined}
      >
        今日の進捗
      </button>

      <div className="mx-0.5 w-px self-stretch bg-gray-200" aria-hidden />

      <button
        type="button"
        onClick={() => onChangeView("retro")}
        className={[
          "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
          activeView === "retro"
            ? "bg-blue-900 text-white shadow-sm"
            : "bg-white text-gray-900 hover:bg-gray-100",
        ].join(" ")}
        aria-current={activeView === "retro" ? "page" : undefined}
      >
        振り返り
      </button>
    </nav>
  );
}

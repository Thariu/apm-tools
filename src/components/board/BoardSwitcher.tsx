"use client";

import { BOARD_CONFIGS, BOARD_ORDER } from "@/lib/boardConfig";
import type { BoardId, AppView } from "@/lib/types";

type BoardSwitcherProps = {
  activeBoardId: BoardId;
  onChange: (boardId: BoardId) => void;
  activeView: AppView;
  onChangeView: (view: AppView) => void;
};

export function BoardSwitcher({
  activeBoardId,
  onChange,
  activeView,
  onChangeView,
}: BoardSwitcherProps) {
  return (
    <nav
      className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1"
      aria-label="ボード切り替え"
    >
      {BOARD_ORDER.map((boardId) => {
        const config = BOARD_CONFIGS[boardId];
        const isActive = activeView === "planning" && boardId === activeBoardId;
        return (
          <button
            key={boardId}
            type="button"
            onClick={() => {
              onChange(boardId);
              onChangeView("planning");
            }}
            className={[
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              isActive
                ? config.activeTabClassName
                : "bg-white text-gray-900 hover:bg-gray-100",
            ].join(" ")}
            aria-current={isActive ? "page" : undefined}
          >
            {config.label}
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

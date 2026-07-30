"use client";

import { InlineEdit } from "@/components/ui/InlineEdit";
import type { BoardId } from "@/lib/types";

type SprintGoalsRowProps = {
  boardId: BoardId;
  goal: string;
  onUpdateGoal: (goal: string) => void;
};

export function SprintGoalsRow({
  boardId,
  goal,
  onUpdateGoal,
}: SprintGoalsRowProps) {
  const isEmpty = !goal.trim();
  const isMultiLine = !isEmpty && goal.includes("\n");
  const isCompact = isEmpty || !isMultiLine;
  const lineCount = goal ? goal.split("\n").length : 1;

  return (
    <section
      className={[
        "flex w-full gap-2 rounded-lg border border-gray-300/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm",
        isCompact ? "min-h-9 items-center" : "items-start",
      ].join(" ")}
    >
      <span
        className={[
          "flex shrink-0 items-center text-xs font-bold leading-normal text-blue-800",
          isCompact ? "h-6" : "pt-0.5",
        ].join(" ")}
      >
        スプリントゴール：
      </span>
      <div
        className={
          isCompact
            ? "flex min-w-0 flex-1 items-center"
            : "min-w-0 flex-1"
        }
      >
        <InlineEdit
          value={goal}
          onChange={onUpdateGoal}
          layout="inline"
          className={
            isEmpty
              ? "text-xs font-normal leading-normal text-gray-400 italic"
              : "text-xs font-medium leading-normal text-blue-900"
          }
          inputClassName="text-xs leading-normal text-blue-950"
          placeholder="スプリントゴールを入力"
          multiline={isMultiLine}
          rows={Math.max(2, lineCount)}
        />
      </div>
    </section>
  );
}

"use client";

import { AssigneeTags } from "@/components/ui/AssigneeTags";
import { BacklogTitleWithLink } from "@/components/ui/BacklogTitleWithLink";
import { GoalTextField } from "@/components/ui/GoalTextField";
import { StoryPointSelect } from "@/components/ui/StoryPointSelect";
import type { ProductBacklogItem } from "@/lib/types";
import type { AssigneeColorId } from "@/lib/assigneeColors";

type ProductBacklogCellProps = {
  item: ProductBacklogItem;
  onUpdate: (patch: Partial<ProductBacklogItem>) => void;
  candidates: string[];
  goalTextCandidates: string[];
  colorByName: Record<string, AssigneeColorId>;
  onSetAssigneeColor: (assigneeName: string, colorId: AssigneeColorId) => void;
  onAddAssigneeCandidate: (name: string) => void;
  onDeleteAssigneeCandidate: (name: string) => void;
  onRenameAssigneeCandidate: (fromName: string, toName: string) => void;
  onAddGoalTextCandidate: (text: string) => void;
  onDeleteGoalTextCandidate: (text: string) => void;
};

export function ProductBacklogCell({
  item,
  onUpdate,
  candidates,
  goalTextCandidates,
  colorByName,
  onSetAssigneeColor,
  onAddAssigneeCandidate,
  onDeleteAssigneeCandidate,
  onRenameAssigneeCandidate,
  onAddGoalTextCandidate,
  onDeleteGoalTextCandidate,
}: ProductBacklogCellProps) {
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="rounded border-2 border-red-400 bg-white p-2 shadow-sm">
        <BacklogTitleWithLink
          title={item.title}
          requestUrl={item.requestUrl}
          onChange={({ title, requestUrl }) => onUpdate({ title, requestUrl })}
        />
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <StoryPointSelect
            value={item.points}
            onChange={(points) => onUpdate({ points })}
          />
        </div>
        <div className="mt-2">
          <AssigneeTags
            assignees={item.assignees ?? []}
            onChange={(assignees) => onUpdate({ assignees })}
            variant="backlog"
            candidates={candidates}
            colorByName={colorByName}
            onSetAssigneeColor={onSetAssigneeColor}
            onAddCandidate={onAddAssigneeCandidate}
            onDeleteCandidate={onDeleteAssigneeCandidate}
            onRenameCandidate={onRenameAssigneeCandidate}
          />
        </div>
      </div>
      <div className="rounded border-2 border-pink-300 bg-pink-50/80 p-2 shadow-sm">
        <GoalTextField
          value={item.goalText}
          onChange={(goalText) => onUpdate({ goalText })}
          candidates={goalTextCandidates}
          onAddCandidate={onAddGoalTextCandidate}
          onDeleteCandidate={onDeleteGoalTextCandidate}
          className="block text-xs text-gray-800"
          inputClassName="text-xs"
          placeholder="ゴール"
        />
        <span className="mt-1.5 block w-fit rounded bg-red-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
          ゴール
        </span>
      </div>
    </div>
  );
}

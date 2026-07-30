"use client";

import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import { sortTasksByOrder } from "@/lib/taskOrder";
import type { BoardId, DropZoneId, Task, TaskLane, TaskPatch, TaskTemplateSet } from "@/lib/types";
import { makeDropZoneId } from "@/lib/types";
import { DroppableZone } from "./DroppableZone";
import { TaskCard } from "./TaskCard";
import type { AssigneeColorId } from "@/lib/assigneeColors";
import { TaskTemplatePickerModal } from "@/components/ui/TaskTemplatePickerModal";

type SwimlaneLaneCellProps = {
  boardId: BoardId;
  lane: TaskLane;
  parentIssueId: string;
  tasks: Task[];
  onAddTask: (parentIssueId: string, lane: TaskLane) => void;
  onAddTasksFromTemplateSet: (
    parentIssueId: string,
    lane: TaskLane,
    setId: string,
  ) => void;
  onUpdateTask: (taskId: string, patch: TaskPatch) => void;
  onDeleteTask: (taskId: string) => void;
  taskTemplateSets: TaskTemplateSet[];
  onAddTaskTemplateSet: (name: string) => string | undefined;
  onDeleteTaskTemplateSet: (setId: string) => void;
  onRenameTaskTemplateSet: (setId: string, name: string) => void;
  onAddItemToTaskTemplateSet: (setId: string, title: string) => void;
  onRemoveItemFromTaskTemplateSet: (setId: string, itemId: string) => void;
  onReorderItemsInTaskTemplateSet: (setId: string, orderedItemIds: string[]) => void;
  selectedTaskIdSet: ReadonlySet<string>;
  onSelectTask: (params: {
    taskId: string;
    lane: TaskLane;
    ctrlOrMeta: boolean;
    shift: boolean;
  }) => void;
  onDuplicateTask: (taskId: string) => void;
  groupDragPreview?: { insertIndex: number; count: number } | null;
  groupDraggingIdSet?: ReadonlySet<string> | null;
  assigneeCandidates: string[];
  assigneeColorByName: Record<string, AssigneeColorId>;
  onSetAssigneeColor: (assigneeName: string, colorId: AssigneeColorId) => void;
  onAddAssigneeCandidate: (name: string) => void;
  onDeleteAssigneeCandidate: (name: string) => void;
  onRenameAssigneeCandidate: (fromName: string, toName: string) => void;
};

export function SwimlaneLaneCell({
  boardId,
  lane,
  parentIssueId,
  tasks,
  onAddTask,
  onAddTasksFromTemplateSet,
  onUpdateTask,
  onDeleteTask,
  taskTemplateSets,
  onAddTaskTemplateSet,
  onDeleteTaskTemplateSet,
  onRenameTaskTemplateSet,
  onAddItemToTaskTemplateSet,
  onRemoveItemFromTaskTemplateSet,
  onReorderItemsInTaskTemplateSet,
  selectedTaskIdSet,
  onSelectTask,
  onDuplicateTask,
  groupDragPreview,
  groupDraggingIdSet,
  assigneeCandidates,
  assigneeColorByName,
  onSetAssigneeColor,
  onAddAssigneeCandidate,
  onDeleteAssigneeCandidate,
  onRenameAssigneeCandidate,
}: SwimlaneLaneCellProps) {
  const zoneId: DropZoneId = makeDropZoneId(lane, parentIssueId);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const laneTasks = useMemo(
    () => sortTasksByOrder(tasks.filter((t) => t.lane === lane)),
    [tasks, lane],
  );

  const sortableIds = useMemo(
    () => laneTasks.map((t) => t.id),
    [laneTasks],
  );

  return (
    <div className="flex min-h-[140px] min-w-[130px] flex-1 flex-col border-l border-gray-200">
      <SortableContext
        id={zoneId}
        items={sortableIds}
        strategy={verticalListSortingStrategy}
      >
        <DroppableZone
          id={zoneId}
          className="min-h-[140px] flex-1 rounded-none border-transparent bg-transparent"
          isEmpty={laneTasks.length === 0}
        >
          {(() => {
            const nodes: React.ReactNode[] = [];
            const activeIdSet = groupDraggingIdSet;

            // groupDragPreview.insertIndex は「active を除いた並び」上の index なので、
            // laneTasks（active 含む）上の index に変換する。
            const insertAt = (() => {
              if (!groupDragPreview || groupDragPreview.count <= 0) return null;
              const targetIndex = groupDragPreview.insertIndex;
              let nonActiveSeen = 0;
              for (let i = 0; i < laneTasks.length; i++) {
                const isActive = activeIdSet?.has(laneTasks[i].id) ?? false;
                if (isActive) continue;
                if (nonActiveSeen === targetIndex) return i;
                nonActiveSeen++;
              }
              // 末尾（非選択の最後の後ろ）
              return laneTasks.length;
            })();

            const placeholder =
              groupDragPreview && groupDragPreview.count > 0 ? (
                <div
                  key="__group_drag_placeholder__"
                  className="mx-1 my-1 rounded border-2 border-dashed border-blue-300 bg-blue-50/50 px-2 py-2 text-xs font-semibold text-blue-700"
                >
                  {groupDragPreview.count} 件を移動
                </div>
              ) : null;

            laneTasks.forEach((task, index) => {
              if (insertAt !== null && placeholder && index === insertAt) {
                nodes.push(placeholder);
              }
              nodes.push(
                <div
                  key={task.id}
                  className={
                    activeIdSet?.has(task.id)
                      ? "opacity-0 pointer-events-none select-none"
                      : ""
                  }
                >
                  <TaskCard
                    task={task}
                    isSelected={selectedTaskIdSet.has(task.id)}
                    onSelect={(e) =>
                      onSelectTask({
                        taskId: task.id,
                        lane,
                        ctrlOrMeta: e.ctrlKey || e.metaKey,
                        shift: e.shiftKey,
                      })
                    }
                    onUpdate={(patch) => onUpdateTask(task.id, patch)}
                    onDelete={() => onDeleteTask(task.id)}
                    onDuplicate={() => onDuplicateTask(task.id)}
                    assigneeCandidates={assigneeCandidates}
                    assigneeColorByName={assigneeColorByName}
                    onSetAssigneeColor={onSetAssigneeColor}
                    onAddAssigneeCandidate={onAddAssigneeCandidate}
                    onDeleteAssigneeCandidate={onDeleteAssigneeCandidate}
                    onRenameAssigneeCandidate={onRenameAssigneeCandidate}
                  />
                </div>,
              );
            });

            if (insertAt !== null && placeholder && insertAt === laneTasks.length) {
              nodes.push(placeholder);
            }

            return nodes;
          })()}
          <div className="flex items-center gap-1 p-1">
            <button
              type="button"
              onClick={() => onAddTask(parentIssueId, lane)}
              className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
              aria-label="タスクを追加"
              title="新規タスクを追加"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setIsTemplateOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 hover:border-orange-500 hover:bg-orange-50/50 hover:text-orange-700"
              aria-label="テンプレから追加"
              title="テンプレから追加"
            >
              📋
            </button>
          </div>
        </DroppableZone>
      </SortableContext>
      <TaskTemplatePickerModal
        isOpen={isTemplateOpen}
        onClose={() => setIsTemplateOpen(false)}
        sets={taskTemplateSets}
        onAddSet={onAddTaskTemplateSet}
        onDeleteSet={onDeleteTaskTemplateSet}
        onRenameSet={onRenameTaskTemplateSet}
        onAddItemToSet={onAddItemToTaskTemplateSet}
        onRemoveItemFromSet={onRemoveItemFromTaskTemplateSet}
        onReorderItemsInSet={onReorderItemsInTaskTemplateSet}
        onAddFromSet={(setId) =>
          onAddTasksFromTemplateSet(parentIssueId, lane, setId)
        }
      />
    </div>
  );
}

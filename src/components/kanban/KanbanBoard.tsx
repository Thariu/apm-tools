"use client";

import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMemo } from "react";
import { makeSwimlaneDragId } from "@/lib/swimlaneDnD";
import type { ProductBacklogItem, Task, TaskLane, TaskPatch, TaskTemplateSet } from "@/lib/types";
import { KANBAN_COLUMN_HEADER_STYLES, KANBAN_COLUMNS } from "@/lib/types";
import { countDueStatusInLane, countTasksByLane } from "@/lib/taskUtils";
import { TaskDueStatusCountBadges } from "@/components/ui/TaskDueStatusCountBadges";
import { SwimlaneRow } from "./SwimlaneRow";
import type { AssigneeColorId } from "@/lib/assigneeColors";

type KanbanBoardProps = {
  productBacklog: ProductBacklogItem[];
  tasks: Task[];
  onUpdateProductBacklog: (
    itemId: string,
    patch: Partial<ProductBacklogItem>,
  ) => void;
  onDeleteSwimlane: (itemId: string) => void;
  onDuplicateSwimlane: (itemId: string) => void;
  onAddProductBacklog: () => void;
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
  onClearSelection: () => void;
  groupDragPreview?: {
    container: { parentIssueId: string; lane: TaskLane };
    insertIndex: number;
    count: number;
  } | null;
  groupDraggingIdSet?: ReadonlySet<string> | null;
  assigneeCandidates: string[];
  goalTextCandidates: string[];
  assigneeColorByName: Record<string, AssigneeColorId>;
  onSetAssigneeColor: (assigneeName: string, colorId: AssigneeColorId) => void;
  onAddAssigneeCandidate: (name: string) => void;
  onDeleteAssigneeCandidate: (name: string) => void;
  onRenameAssigneeCandidate: (fromName: string, toName: string) => void;
  onAddGoalTextCandidate: (text: string) => void;
  onDeleteGoalTextCandidate: (text: string) => void;
};

export function KanbanBoard({
  productBacklog,
  tasks,
  onUpdateProductBacklog,
  onDeleteSwimlane,
  onDuplicateSwimlane,
  onAddProductBacklog,
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
  onClearSelection,
  groupDragPreview,
  groupDraggingIdSet,
  assigneeCandidates,
  goalTextCandidates,
  assigneeColorByName,
  onSetAssigneeColor,
  onAddAssigneeCandidate,
  onDeleteAssigneeCandidate,
  onRenameAssigneeCandidate,
  onAddGoalTextCandidate,
  onDeleteGoalTextCandidate,
}: KanbanBoardProps) {
  const swimlaneSortableIds = useMemo(
    () => productBacklog.map((item) => makeSwimlaneDragId(item.id)),
    [productBacklog],
  );

  const backlogCount = productBacklog.length;
  const laneCounts = KANBAN_COLUMNS.reduce(
    (acc, col) => {
      if (col.key === "backlog") {
        acc.backlog = backlogCount;
      } else {
        acc[col.key] = countTasksByLane(tasks, col.key);
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  const laneDueCounts = useMemo(() => {
    const lanes: TaskLane[] = ["todo", "doing"];
    return Object.fromEntries(
      lanes.map((lane) => [lane, countDueStatusInLane(tasks, lane)]),
    ) as Record<"todo" | "doing", ReturnType<typeof countDueStatusInLane>>;
  }, [tasks]);

  return (
    <section
      className="min-w-[900px] rounded-lg border border-gray-300/80 bg-white/90 shadow-sm backdrop-blur-sm"
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.closest("button,a,input,textarea,select,[contenteditable='true']")) {
          return;
        }
        onClearSelection();
      }}
    >
      <div className="sticky top-0 z-40 flex shadow-sm">
        {KANBAN_COLUMNS.map((col) => {
          const dueCounts =
            col.key === "todo" || col.key === "doing"
              ? laneDueCounts[col.key]
              : null;

          return (
          <div
            key={col.key}
            className={[
              "flex items-center justify-between gap-2 px-3 py-2",
              KANBAN_COLUMN_HEADER_STYLES[col.key],
              col.key === "backlog"
                ? "w-[260px] shrink-0"
                : "min-w-[130px] flex-1 border-l border-gray-300/60",
            ].join(" ")}
          >
            <span className="text-sm font-bold text-gray-800">
              {col.label}
            </span>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 tabular-nums ring-1 ring-gray-400 shadow-sm">
                {laneCounts[col.key] ?? 0}
              </span>
              {dueCounts && (
                <TaskDueStatusCountBadges
                  dueToday={dueCounts.dueToday}
                  overdue={dueCounts.overdue}
                />
              )}
            </div>
          </div>
          );
        })}
      </div>
      <SortableContext
        items={swimlaneSortableIds}
        strategy={verticalListSortingStrategy}
      >
        {productBacklog.map((item) => (
          <SwimlaneRow
            key={item.id}
            item={item}
            tasks={tasks}
            onUpdateProductBacklog={onUpdateProductBacklog}
            onDeleteSwimlane={onDeleteSwimlane}
            onDuplicateSwimlane={onDuplicateSwimlane}
            onAddTask={onAddTask}
            onAddTasksFromTemplateSet={onAddTasksFromTemplateSet}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
            taskTemplateSets={taskTemplateSets}
            onAddTaskTemplateSet={onAddTaskTemplateSet}
            onDeleteTaskTemplateSet={onDeleteTaskTemplateSet}
            onRenameTaskTemplateSet={onRenameTaskTemplateSet}
            onAddItemToTaskTemplateSet={onAddItemToTaskTemplateSet}
            onRemoveItemFromTaskTemplateSet={onRemoveItemFromTaskTemplateSet}
            onReorderItemsInTaskTemplateSet={onReorderItemsInTaskTemplateSet}
            selectedTaskIdSet={selectedTaskIdSet}
            onSelectTask={onSelectTask}
            onDuplicateTask={onDuplicateTask}
            groupDragPreview={groupDragPreview}
            groupDraggingIdSet={groupDraggingIdSet}
            assigneeCandidates={assigneeCandidates}
            goalTextCandidates={goalTextCandidates}
            assigneeColorByName={assigneeColorByName}
            onSetAssigneeColor={onSetAssigneeColor}
            onAddAssigneeCandidate={onAddAssigneeCandidate}
            onDeleteAssigneeCandidate={onDeleteAssigneeCandidate}
            onRenameAssigneeCandidate={onRenameAssigneeCandidate}
            onAddGoalTextCandidate={onAddGoalTextCandidate}
            onDeleteGoalTextCandidate={onDeleteGoalTextCandidate}
          />
        ))}
      </SortableContext>
      <div className="flex border-t border-gray-200">
        <div className="flex w-[260px] shrink-0 items-center border-r border-gray-200 bg-gray-50/50 p-2">
          <button
            type="button"
            onClick={onAddProductBacklog}
            className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 hover:border-orange-500 hover:bg-orange-50/50 hover:text-orange-600"
            aria-label="親Backlogを追加"
            title="親Backlogを追加"
          >
            +
          </button>
        </div>
        {KANBAN_COLUMNS.filter((col) => col.key !== "backlog").map((col) => (
          <div
            key={col.key}
            className="min-h-[48px] min-w-[130px] flex-1 border-l border-gray-200"
          />
        ))}
      </div>
    </section>
  );
}

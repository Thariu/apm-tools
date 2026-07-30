"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { makeSwimlaneDragId } from "@/lib/swimlaneDnD";
import type { ProductBacklogItem, Task, TaskLane, TaskPatch, TaskTemplateSet } from "@/lib/types";
import { ProductBacklogCell } from "./ProductBacklogCell";
import { SwimlaneLaneCell } from "./SwimlaneLaneCell";
import type { AssigneeColorId } from "@/lib/assigneeColors";

const TASK_LANES: TaskLane[] = ["todo", "doing", "done", "cant"];

type SwimlaneRowProps = {
  item: ProductBacklogItem;
  tasks: Task[];
  onUpdateProductBacklog: (
    itemId: string,
    patch: Partial<ProductBacklogItem>,
  ) => void;
  onDeleteSwimlane: (itemId: string) => void;
  onDuplicateSwimlane: (itemId: string) => void;
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

export function SwimlaneRow({
  item,
  tasks,
  onUpdateProductBacklog,
  onDeleteSwimlane,
  onDuplicateSwimlane,
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
  goalTextCandidates,
  assigneeColorByName,
  onSetAssigneeColor,
  onAddAssigneeCandidate,
  onDeleteAssigneeCandidate,
  onRenameAssigneeCandidate,
  onAddGoalTextCandidate,
  onDeleteGoalTextCandidate,
}: SwimlaneRowProps) {
  const rowTasks = tasks.filter((t) => t.parentIssueId === item.id);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: makeSwimlaneDragId(item.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleDeleteSwimlane = () => {
    const taskCount = rowTasks.length;
    const message =
      taskCount > 0
        ? `この行を削除しますか？\n紐づくタスク ${taskCount} 件もすべて削除されます。`
        : "この行を削除しますか？";
    if (!window.confirm(message)) return;
    onDeleteSwimlane(item.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "flex border-b border-gray-200 last:border-b-0",
        isDragging ? "relative z-10 bg-white shadow-md ring-2 ring-blue-200" : "",
      ].join(" ")}
    >
      <div className="w-[260px] shrink-0 border-r border-gray-200 bg-gray-50/50">
        <div className="flex items-center justify-between gap-1 border-b border-gray-200/80 bg-gray-100/70 px-1.5 py-1">
          <button
            type="button"
            className="flex cursor-grab touch-none items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-gray-500 hover:bg-white hover:text-gray-700 active:cursor-grabbing"
            aria-label="ドラッグして並べ替え"
            title="ドラッグして優先度を変更"
            {...listeners}
            {...attributes}
          >
            <span aria-hidden>⋮⋮</span>
            <span className="font-medium">並べ替え</span>
          </button>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onDuplicateSwimlane(item.id)}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
            >
              行ごと複製
            </button>
            <button
              type="button"
              onClick={handleDeleteSwimlane}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50"
            >
              行ごと削除
            </button>
          </div>
        </div>
        <ProductBacklogCell
          item={item}
          onUpdate={(patch) => onUpdateProductBacklog(item.id, patch)}
          candidates={assigneeCandidates}
          goalTextCandidates={goalTextCandidates}
          colorByName={assigneeColorByName}
          onSetAssigneeColor={onSetAssigneeColor}
          onAddAssigneeCandidate={onAddAssigneeCandidate}
          onDeleteAssigneeCandidate={onDeleteAssigneeCandidate}
          onRenameAssigneeCandidate={onRenameAssigneeCandidate}
          onAddGoalTextCandidate={onAddGoalTextCandidate}
          onDeleteGoalTextCandidate={onDeleteGoalTextCandidate}
        />
      </div>
      {TASK_LANES.map((lane) => (
        <SwimlaneLaneCell
          key={lane}
          boardId={item.boardId}
          lane={lane}
          parentIssueId={item.id}
          tasks={rowTasks}
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
          groupDragPreview={
            groupDragPreview &&
            groupDragPreview.container.parentIssueId === item.id &&
            groupDragPreview.container.lane === lane
              ? { insertIndex: groupDragPreview.insertIndex, count: groupDragPreview.count }
              : null
          }
          groupDraggingIdSet={groupDraggingIdSet}
          assigneeCandidates={assigneeCandidates}
          assigneeColorByName={assigneeColorByName}
          onSetAssigneeColor={onSetAssigneeColor}
          onAddAssigneeCandidate={onAddAssigneeCandidate}
          onDeleteAssigneeCandidate={onDeleteAssigneeCandidate}
          onRenameAssigneeCandidate={onRenameAssigneeCandidate}
        />
      ))}
    </div>
  );
}

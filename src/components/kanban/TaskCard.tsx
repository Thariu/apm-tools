"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { AssigneeTags } from "@/components/ui/AssigneeTags";
import { TaskDateRangePicker } from "@/components/ui/TaskDateRangePicker";
import { EstimatedHoursInput } from "@/components/ui/EstimatedHoursInput";
import { ProgressPercentSelect } from "@/components/ui/ProgressPercentSelect";
import { InlineEdit } from "@/components/ui/InlineEdit";
import {
  formatTaskDateRange,
  getTaskDueStatus,
  TASK_DUE_STATUS_LABEL,
} from "@/lib/dateUtils";
import { isStoredProgressPercent } from "@/lib/chat/progress";
import { TASK_LANE_BORDER_CLASS, type Task, type TaskPatch } from "@/lib/types";
import type { AssigneeColorId } from "@/lib/assigneeColors";

type TaskCardProps = {
  task: Task;
  isOverlay?: boolean;
  isSelected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  onUpdate?: (patch: TaskPatch) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  assigneeCandidates: string[];
  assigneeColorByName: Record<string, AssigneeColorId>;
  onSetAssigneeColor: (assigneeName: string, colorId: AssigneeColorId) => void;
  onAddAssigneeCandidate: (name: string) => void;
  onDeleteAssigneeCandidate: (name: string) => void;
  onRenameAssigneeCandidate: (fromName: string, toName: string) => void;
};

export function TaskCard({
  task,
  isOverlay,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onDuplicate,
  assigneeCandidates,
  assigneeColorByName,
  onSetAssigneeColor,
  onAddAssigneeCandidate,
  onDeleteAssigneeCandidate,
  onRenameAssigneeCandidate,
}: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const laneBorderClass = TASK_LANE_BORDER_CLASS[task.lane];

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { task },
      disabled: isOverlay || isEditing,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dueStatus = getTaskDueStatus(task.dueDate, task.lane);
  const dueStatusLabel =
    dueStatus === "none" ? null : TASK_DUE_STATUS_LABEL[dueStatus];
  const showProgress = task.lane === "doing";
  const progressLabel =
    showProgress && isStoredProgressPercent(task.progressPercent)
      ? `${task.progressPercent}%`
      : null;

  if (isOverlay) {
    const dateRange = formatTaskDateRange(task.startDate, task.dueDate);
    return (
      <div
        className={`rotate-1 rounded border-2 bg-white px-2 py-2 shadow-lg ring-2 ring-blue-300 ${laneBorderClass}`}
      >
        <p className="whitespace-pre-wrap text-xs font-medium text-gray-900">
          {task.title}
          {progressLabel ? (
            <span className="ml-1 rounded bg-sky-100 px-1 py-px text-[10px] font-bold text-sky-800">
              {progressLabel}
            </span>
          ) : null}
        </p>
        {(dateRange || dueStatusLabel) && (
          <div className="text-[10px] text-gray-500">
            {dateRange && <p>📅 {dateRange}</p>}
            {dueStatusLabel && (
              <p className="mt-0.5">
                <span
                  className={[
                    "rounded px-1 py-px text-[9px] font-bold",
                    dueStatus === "overdue"
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800",
                  ].join(" ")}
                >
                  {dueStatusLabel}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(e);
      }}
      className={[
        "group relative flex cursor-pointer select-none gap-1 rounded border-2 bg-white py-1.5 pl-1 pr-12 shadow-sm",
        laneBorderClass,
        isDragging ? "opacity-40" : "",
        isSelected ? "ring-2 ring-blue-400 ring-offset-1" : "",
      ].join(" ")}
    >
      {onDuplicate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="absolute right-6 top-1 flex h-4 w-4 items-center justify-center rounded text-gray-400 opacity-50 hover:bg-blue-100 hover:text-blue-600 hover:opacity-100"
          aria-label="タスクを複製"
          title="複製 (Ctrl+D)"
        >
          ⧉
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.();
        }}
        className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded text-gray-400 opacity-50 hover:bg-red-100 hover:text-red-600 hover:opacity-100"
        aria-label="タスクを削除"
        title="削除 (Delete / Backspace)"
      >
        ×
      </button>
      <button
        type="button"
        className="mt-0.5 shrink-0 cursor-grab touch-none px-0.5 text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        aria-label="ドラッグして移動"
        onClick={(e) => e.stopPropagation()}
        {...listeners}
        {...attributes}
      >
        ⋮⋮
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-1">
          <InlineEdit
            value={task.title}
            onChange={(title) => onUpdate?.({ title })}
            onEditingChange={setIsEditing}
            className="min-w-0 flex-1 text-xs font-medium leading-snug text-gray-900"
            inputClassName="text-xs"
            placeholder="タスク名"
            multiline
          />
          {showProgress ? (
            <ProgressPercentSelect
              value={task.progressPercent}
              onChange={(progressPercent) => onUpdate?.({ progressPercent })}
              onEditingChange={setIsEditing}
            />
          ) : null}
        </div>
        <div className="mt-1.5 space-y-1">
          <AssigneeTags
            assignees={task.assignees ?? []}
            onChange={(assignees) => onUpdate?.({ assignees })}
            variant="task"
            onEditingChange={setIsEditing}
            candidates={assigneeCandidates}
            colorByName={assigneeColorByName}
            onSetAssigneeColor={onSetAssigneeColor}
            onAddCandidate={onAddAssigneeCandidate}
            onDeleteCandidate={onDeleteAssigneeCandidate}
            onRenameCandidate={onRenameAssigneeCandidate}
          />
          <TaskDateRangePicker
            startDate={task.startDate}
            dueDate={task.dueDate}
            lane={task.lane}
            onChange={(patch) => onUpdate?.(patch)}
            onEditingChange={setIsEditing}
          />
          <EstimatedHoursInput
            value={task.estimatedHours}
            onChange={(estimatedHours) => onUpdate?.({ estimatedHours })}
            onEditingChange={setIsEditing}
          />
        </div>
      </div>
    </div>
  );
}

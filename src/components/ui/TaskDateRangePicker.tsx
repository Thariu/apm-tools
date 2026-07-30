"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  formatDueDateDisplay,
  formatTaskDateRange,
  getTaskDueStatus,
  isTaskDateRangeInvalid,
  TASK_DUE_STATUS_LABEL,
  toDateInputValue,
  type TaskDueStatus,
} from "@/lib/dateUtils";
import type { TaskLane } from "@/lib/types";

type TaskDateRangePickerProps = {
  startDate?: string;
  dueDate?: string;
  lane?: TaskLane;
  onChange: (patch: { startDate?: string; dueDate?: string }) => void;
  onEditingChange?: (editing: boolean) => void;
};

function TaskDueStatusBadge({ status }: { status: TaskDueStatus }) {
  if (status === "none") return null;
  const label = TASK_DUE_STATUS_LABEL[status];
  const className =
    status === "overdue"
      ? "bg-red-100 text-red-800 ring-red-200"
      : "bg-amber-100 text-amber-800 ring-amber-200";
  return (
    <span
      className={`inline-flex shrink-0 rounded px-1.5 py-px text-[9px] font-bold leading-tight ring-1 ${className}`}
    >
      {label}
    </span>
  );
}

function DateField({
  label,
  value,
  onChange,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const display = formatDueDateDisplay(value) || "—";

  const openPicker = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (typeof el.showPicker === "function") {
      void el.showPicker();
    } else {
      el.click();
    }
  };

  return (
    <label
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openPicker();
      }}
      className="relative inline-flex min-h-6 cursor-pointer select-none items-center gap-1 rounded px-1.5 py-0.5 text-[10px] hover:bg-gray-100"
    >
      <span className="shrink-0 font-medium text-gray-500">{label}</span>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        aria-label={label}
      />
    </label>
  );
}

export function TaskDateRangePicker({
  startDate,
  dueDate,
  lane,
  onChange,
  onEditingChange,
}: TaskDateRangePickerProps) {
  const [editing, setEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const display = formatTaskDateRange(startDate, dueDate);
  const invalid = isTaskDateRangeInvalid(startDate, dueDate);
  const hasAnyDate = Boolean(startDate || dueDate);
  const dueStatus = lane ? getTaskDueStatus(dueDate, lane) : "none";
  const dueStatusLabel =
    dueStatus === "none" ? null : TASK_DUE_STATUS_LABEL[dueStatus];

  const setEditingState = (next: boolean) => {
    setEditing(next);
    onEditingChange?.(next);
  };

  useEffect(() => {
    if (editing) startInputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setEditingState(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingState(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [editing]);

  if (editing) {
    return (
      <div
        ref={rootRef}
        id={panelId}
        className="max-w-max space-y-1 rounded border border-blue-200 bg-blue-50/50 px-2 py-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <DateField
            label="着手"
            value={toDateInputValue(startDate)}
            onChange={(iso) => onChange({ startDate: iso, dueDate })}
            inputRef={startInputRef}
          />
          <span className="text-[10px] text-gray-400" aria-hidden>
            ～
          </span>
          <DateField
            label="完了"
            value={toDateInputValue(dueDate)}
            onChange={(iso) => onChange({ startDate, dueDate: iso })}
          />
        </div>
        {invalid && (
          <p className="text-[10px] font-medium text-amber-700" role="alert">
            着手日が期限より後です
          </p>
        )}
        {dueStatusLabel && (
          <p className="flex items-center gap-1">
            <TaskDueStatusBadge status={dueStatus} />
          </p>
        )}
      </div>
    );
  }

  const dateButtonClass = (() => {
    if (invalid) return "ring-1 ring-amber-400";
    if (dueStatus === "overdue") return "font-medium text-red-700 ring-1 ring-red-300";
    if (dueStatus === "dueToday") return "font-medium text-amber-800 ring-1 ring-amber-300";
    if (display) return "font-medium text-gray-700";
    return "italic text-gray-400";
  })();

  return (
    <div ref={rootRef} className="inline-flex flex-col gap-0.5">
      <div className="inline-flex items-center gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditingState(true);
          }}
          className={[
            "inline-flex min-h-6 items-center gap-1 rounded px-2 py-1 text-[10px] hover:bg-gray-100",
            dateButtonClass,
          ].join(" ")}
          aria-label={
            display
              ? dueStatusLabel
                ? `対応期間 ${display}（${dueStatusLabel}）`
                : `対応期間 ${display}`
              : "対応期間を入力"
          }
          aria-expanded={false}
          aria-controls={panelId}
          title={invalid ? "着手日が期限より後です" : dueStatusLabel ?? undefined}
        >
          <span aria-hidden>📅</span>
          <span>{display ?? "期間"}</span>
        </button>
        {hasAnyDate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ startDate: "", dueDate: "" });
            }}
            className="min-h-6 rounded px-1 text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="対応期間をクリア"
            title="対応期間をクリア"
          >
            ×
          </button>
        )}
      </div>
      {dueStatusLabel && (
        <p>
          <TaskDueStatusBadge status={dueStatus} />
        </p>
      )}
      {invalid && (
        <p className="px-2 text-[10px] font-medium text-amber-700" role="alert">
          着手日が期限より後です
        </p>
      )}
    </div>
  );
}

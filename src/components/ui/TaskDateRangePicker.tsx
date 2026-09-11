"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addCalendarMonths,
  formatTaskDateRange,
  getTaskDueStatus,
  isIsoInInclusiveRange,
  isTaskDateRangeInvalid,
  monthGridCells,
  parseIsoYearMonth,
  TASK_DUE_STATUS_LABEL,
  type TaskDueStatus,
} from "@/lib/dateUtils";
import { getJstIsoDate, getJstWeekday } from "@/lib/jstDate";
import { isJapaneseHolidayIso } from "@/lib/japaneseHolidays";
import type { TaskLane } from "@/lib/types";

type TaskDateRangePickerProps = {
  startDate?: string;
  dueDate?: string;
  lane?: TaskLane;
  onChange: (patch: { startDate?: string; dueDate?: string }) => void;
  onEditingChange?: (editing: boolean) => void;
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

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

function initialViewMonth(startDate?: string, dueDate?: string) {
  return (
    parseIsoYearMonth(startDate ?? "") ??
    parseIsoYearMonth(dueDate ?? "") ??
    parseIsoYearMonth(getJstIsoDate()) ?? { year: 2026, month: 9 }
  );
}

function orderedRange(a: string, b: string): { start: string; due: string } {
  return a <= b ? { start: a, due: b } : { start: b, due: a };
}

export function TaskDateRangePicker({
  startDate,
  dueDate,
  lane,
  onChange,
  onEditingChange,
}: TaskDateRangePickerProps) {
  const [editing, setEditing] = useState(false);
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [draftDue, setDraftDue] = useState<string | null>(null);
  const [view, setView] = useState(() => initialViewMonth(startDate, dueDate));
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const display = formatTaskDateRange(startDate, dueDate);
  const invalid = isTaskDateRangeInvalid(startDate, dueDate);
  const hasAnyDate = Boolean(startDate || dueDate);
  const dueStatus = lane ? getTaskDueStatus(dueDate, lane) : "none";
  const dueStatusLabel =
    dueStatus === "none" ? null : TASK_DUE_STATUS_LABEL[dueStatus];
  const todayIso = getJstIsoDate();
  const cells = monthGridCells(view.year, view.month);
  const canConfirm = Boolean(draftStart && draftDue);

  const setEditingState = (next: boolean) => {
    setEditing(next);
    onEditingChange?.(next);
  };

  const resetDraft = () => {
    setDraftStart(null);
    setDraftDue(null);
  };

  const closePicker = () => {
    resetDraft();
    setEditingState(false);
  };

  const confirmDraft = () => {
    if (!draftStart || !draftDue) return;
    onChange({
      startDate: draftStart,
      dueDate: draftDue,
    });
    closePicker();
  };

  useLayoutEffect(() => {
    if (!editing) return;
    const updatePos = () => {
      const trigger = rootRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = 232;
      const panelHeight = panelRef.current?.offsetHeight ?? 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow >= panelHeight + 8
          ? rect.bottom + 4
          : Math.max(8, rect.top - panelHeight - 4);
      const left = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - panelWidth - 8,
      );
      setPanelPos({ top, left });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [editing, view, draftStart, draftDue]);

  useEffect(() => {
    if (!editing) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      resetDraft();
      setEditing(false);
      onEditingChange?.(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      resetDraft();
      setEditing(false);
      onEditingChange?.(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [editing, onEditingChange]);

  const openPicker = () => {
    resetDraft();
    setView(initialViewMonth(startDate, dueDate));
    setEditingState(true);
  };

  const selectDay = (iso: string) => {
    if (!draftStart || !draftDue || draftStart !== draftDue) {
      setDraftStart(iso);
      setDraftDue(iso);
      return;
    }
    if (iso === draftStart) return;
    const { start, due } = orderedRange(draftStart, iso);
    setDraftStart(start);
    setDraftDue(due);
  };

  const highlightStart = draftStart ?? startDate;
  const highlightDue = draftDue ?? dueDate;

  const dateButtonClass = (() => {
    if (invalid) return "ring-1 ring-amber-400";
    if (dueStatus === "overdue") return "font-medium text-red-700 ring-1 ring-red-300";
    if (dueStatus === "dueToday") return "font-medium text-amber-800 ring-1 ring-amber-300";
    if (display) return "font-medium text-gray-700";
    return "italic text-gray-400";
  })();

  const panel =
    editing && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="対応期間を選択"
            className="fixed z-[80] w-[232px] rounded border border-blue-200 bg-white p-2 shadow-lg"
            style={{ top: panelPos.top, left: panelPos.left }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
                aria-label="前の月"
                onClick={() => setView((v) => addCalendarMonths(v.year, v.month, -1))}
              >
                ‹
              </button>
              <p className="text-[11px] font-medium text-gray-800">
                {view.year}年{view.month}月
              </p>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
                aria-label="次の月"
                onClick={() => setView((v) => addCalendarMonths(v.year, v.month, 1))}
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-px text-center">
              {WEEKDAY_LABELS.map((label, index) => (
                <span
                  key={label}
                  className={[
                    "text-[9px] font-medium",
                    index === 0 ? "text-red-500" : "text-gray-500",
                  ].join(" ")}
                >
                  {label}
                </span>
              ))}
              {cells.map((cell) => {
                const inRange = isIsoInInclusiveRange(
                  cell.iso,
                  highlightStart,
                  highlightDue,
                );
                const isStart = cell.iso === highlightStart;
                const isDue = cell.iso === highlightDue;
                const isToday = cell.iso === todayIso;
                const holiday = isJapaneseHolidayIso(cell.iso);
                const sunday = getJstWeekday(cell.iso) === 0;
                const selected = isStart || isDue;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => selectDay(cell.iso)}
                    aria-label={cell.iso}
                    aria-pressed={selected}
                    className={[
                      "h-7 rounded text-[11px] leading-none",
                      cell.inMonth ? "" : "opacity-40",
                      selected
                        ? "bg-blue-600 font-semibold text-white"
                        : inRange
                          ? "bg-blue-100 text-blue-900"
                          : "hover:bg-gray-100",
                      !selected && (sunday || holiday) ? "text-red-600" : "",
                      isToday && !selected ? "ring-1 ring-blue-400" : "",
                    ].join(" ")}
                  >
                    {Number(cell.iso.slice(8, 10))}
                  </button>
                );
              })}
            </div>
            {draftStart && draftDue && (
              <p className="mt-1.5 text-[10px] text-gray-600">
                {formatTaskDateRange(draftStart, draftDue)}
              </p>
            )}
            <div className="mt-2 flex justify-end gap-1">
              <button
                type="button"
                onClick={closePicker}
                className="rounded px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmDraft}
                disabled={!canConfirm}
                className={[
                  "rounded px-2 py-0.5 text-[10px] font-medium",
                  canConfirm
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "cursor-not-allowed bg-gray-200 text-gray-400",
                ].join(" ")}
              >
                確定
              </button>
            </div>
            {invalid && (
              <p className="mt-1 text-[10px] font-medium text-amber-700" role="alert">
                着手日が期限より後です
              </p>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative inline-flex flex-col gap-0.5">
      <div className="inline-flex items-center gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (editing) closePicker();
            else openPicker();
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
          aria-expanded={editing}
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
              resetDraft();
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
      {panel}
    </div>
  );
}

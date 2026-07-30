"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatEstimatedHours,
  parseEstimatedHours,
  toEstimatedHoursInputValue,
} from "@/lib/estimatedHours";

type EstimatedHoursInputProps = {
  value?: number;
  onChange: (hours: number | undefined) => void;
  onEditingChange?: (editing: boolean) => void;
  /** タスクバー等の狭い領域向け */
  compact?: boolean;
};

export function EstimatedHoursInput({
  value,
  onChange,
  onEditingChange,
  compact = false,
}: EstimatedHoursInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const display = formatEstimatedHours(value);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    setDraft(toEstimatedHoursInputValue(value));
    setEditing(true);
    onEditingChange?.(true);
  };

  const commit = () => {
    setEditing(false);
    onEditingChange?.(false);
    onChange(parseEstimatedHours(draft));
  };

  const cancel = () => {
    setDraft(toEstimatedHoursInputValue(value));
    setEditing(false);
    onEditingChange?.(false);
  };

  if (editing) {
    return (
      <div className="inline-flex items-center gap-0.5">
        <span
          className={compact ? "text-[8px] text-gray-500" : "text-[10px] text-gray-500"}
          aria-hidden
        >
          ⏱
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder="時間"
          className={
            compact
              ? "w-10 rounded border border-blue-300 bg-white px-1 py-px text-[9px] tabular-nums text-gray-900 outline-none ring-1 ring-blue-200"
              : "w-14 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[10px] tabular-nums text-gray-900 outline-none ring-1 ring-blue-200"
          }
          aria-label="予定工数（時間）"
        />
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          startEdit();
        }}
        className={[
          "inline-flex items-center gap-0.5 rounded hover:bg-gray-100",
          compact
            ? "min-h-0 px-0.5 py-px text-[9px]"
            : "min-h-6 gap-1 px-2 py-1 text-[10px]",
          display ? "font-medium text-gray-700" : "italic text-gray-400",
        ].join(" ")}
        aria-label={display ? `予定工数 ${display}` : "予定工数を入力"}
      >
        <span className={compact ? "text-[8px]" : ""} aria-hidden>
          ⏱
        </span>
        <span>{display ?? (compact ? "工数" : "工数")}</span>
      </button>
      {display && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(undefined);
          }}
          className={
            compact
              ? "rounded px-0.5 text-[8px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              : "min-h-6 rounded px-1 text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          }
          aria-label="予定工数をクリア"
          title="予定工数をクリア"
        >
          ×
        </button>
      )}
    </div>
  );
}

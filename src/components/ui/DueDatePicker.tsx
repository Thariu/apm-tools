"use client";

import { useRef } from "react";
import {
  formatDueDateDisplay,
  toDateInputValue,
} from "@/lib/dateUtils";

type DueDatePickerProps = {
  value?: string;
  onChange: (isoDate: string) => void;
  onEditingChange?: (editing: boolean) => void;
};

export function DueDatePicker({
  value,
  onChange,
  onEditingChange,
}: DueDatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const display = formatDueDateDisplay(value);
  const inputValue = toDateInputValue(value);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (typeof el.showPicker === "function") {
      void el.showPicker();
    } else {
      el.click();
    }
  };

  return (
    <div className="inline-flex items-center gap-0.5">
      <label
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openPicker();
        }}
        className={[
          "relative inline-flex min-h-6 cursor-pointer select-none items-center gap-1 rounded px-2 py-1 text-[10px] hover:bg-gray-100",
          display ? "font-medium text-gray-700" : "italic text-gray-400",
        ].join(" ")}
      >
        <span className="pointer-events-none" aria-hidden>
          📅
        </span>
        <span className="pointer-events-none">{display || "期限"}</span>
        <input
          ref={inputRef}
          type="date"
          value={inputValue}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onEditingChange?.(true)}
          onBlur={() => onEditingChange?.(false)}
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          aria-label="期限を選択"
        />
      </label>
      {display && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          className="min-h-6 rounded px-1 text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="期限をクリア"
          title="期限をクリア"
        >
          ×
        </button>
      )}
    </div>
  );
}

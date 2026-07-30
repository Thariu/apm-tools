"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  isStoredProgressPercent,
  type StoredProgressPercent,
} from "@/lib/chat/progress";

const OPTIONS: StoredProgressPercent[] = [25, 50, 75];

type ProgressPercentSelectProps = {
  value?: number;
  onChange: (progressPercent: StoredProgressPercent | null) => void;
  onEditingChange?: (editing: boolean) => void;
  className?: string;
};

export function ProgressPercentSelect({
  value,
  onChange,
  onEditingChange,
  className = "",
}: ProgressPercentSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = isStoredProgressPercent(value) ? value : null;
  const label = current != null ? `${current}%` : "%";

  useEffect(() => {
    onEditingChange?.(open);
  }, [open, onEditingChange]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const pick = (next: StoredProgressPercent | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`relative inline-block shrink-0 ${className}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label="進捗パーセント"
        className={[
          "inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums transition-colors",
          current != null
            ? "border-sky-300 bg-sky-100 text-sky-800 hover:border-sky-400 hover:bg-sky-200"
            : "border-dashed border-gray-300 bg-white text-gray-500 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700",
          open ? "ring-2 ring-sky-200" : "",
        ].join(" ")}
      >
        <span>{label}</span>
        <span
          className={[
            "text-[8px] leading-none opacity-70 transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        >
          ▼
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-[7.5rem] rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
          <p className="mb-1 px-0.5 text-[10px] font-medium text-gray-500">
            進捗
          </p>
          <div
            id={listId}
            role="listbox"
            aria-label="進捗パーセント"
            className="grid grid-cols-3 gap-1"
          >
            {OPTIONS.map((p) => {
              const selected = current === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(p)}
                  className={[
                    "rounded-md border px-0 py-1.5 text-center text-[11px] font-bold tabular-nums leading-none transition-colors",
                    selected
                      ? "border-sky-600 bg-sky-600 text-white shadow-sm"
                      : "border-gray-200 bg-gray-50 text-gray-800 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800",
                  ].join(" ")}
                >
                  {p}%
                </button>
              );
            })}
          </div>
          <button
            type="button"
            role="option"
            aria-selected={current == null}
            onClick={() => pick(null)}
            className={[
              "mt-1.5 w-full rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
              current == null
                ? "border-gray-400 bg-gray-100 text-gray-700"
                : "border-gray-200 text-gray-500 hover:bg-gray-50",
            ].join(" ")}
          >
            未設定
          </button>
        </div>
      ) : null}
    </div>
  );
}

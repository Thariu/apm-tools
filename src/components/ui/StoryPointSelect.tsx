"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  FIBONACCI_STORY_POINTS,
  formatStoryPoints,
  normalizeStoryPoint,
} from "@/lib/storyPoints";

type StoryPointSelectProps = {
  value?: number;
  onChange: (points: number | undefined) => void;
  className?: string;
};

export function StoryPointSelect({
  value,
  onChange,
  className = "",
}: StoryPointSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const normalized = normalizeStoryPoint(value);
  const label = formatStoryPoints(value);

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

  const pick = (points: number | undefined) => {
    onChange(points);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        className={[
          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold leading-none tabular-nums transition-colors",
          open
            ? "border-red-400 bg-red-50 text-red-800 ring-2 ring-red-200"
            : "border-red-300 bg-red-50 text-red-700 hover:border-red-400 hover:bg-red-100",
        ].join(" ")}
      >
        <span>{label}</span>
        <span
          className={[
            "text-[9px] leading-none text-red-500 transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        >
          ▼
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-[168px] rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <p className="mb-1.5 px-0.5 text-[10px] font-medium text-gray-500">
            ポイントを選択
          </p>
          <div
            id={listId}
            role="listbox"
            aria-label="ストーリーポイント"
            className="grid grid-cols-3 gap-1"
          >
            {FIBONACCI_STORY_POINTS.map((p) => {
              const selected = normalized === p;
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
                      ? "border-red-500 bg-red-600 text-white shadow-sm"
                      : "border-gray-200 bg-gray-50 text-gray-800 hover:border-red-300 hover:bg-red-50 hover:text-red-700",
                  ].join(" ")}
                >
                  {p}P
                </button>
              );
            })}
          </div>
          <button
            type="button"
            role="option"
            aria-selected={normalized == null}
            onClick={() => pick(undefined)}
            className={[
              "mt-1.5 w-full rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
              normalized == null
                ? "border-gray-400 bg-gray-100 text-gray-700"
                : "border-gray-200 text-gray-500 hover:bg-gray-50",
            ].join(" ")}
          >
            未設定（—）
          </button>
        </div>
      )}
    </div>
  );
}


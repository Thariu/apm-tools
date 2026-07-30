"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { GOAL_TEXT_CUSTOM_OPTION } from "@/lib/goalTextCandidates";

type GoalTextFieldProps = {
  value: string;
  onChange: (next: string) => void;
  candidates: string[];
  onAddCandidate?: (text: string) => void;
  onDeleteCandidate?: (text: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  rows?: number;
};

const INPUT_PLACEHOLDER_CLASS = "placeholder:text-gray-400 placeholder:italic";
const MIN_HEIGHT_ONE_LINE = "min-h-6";

export function GoalTextField({
  value,
  onChange,
  candidates,
  onAddCandidate,
  onDeleteCandidate,
  className = "",
  inputClassName = "",
  placeholder = "ゴール",
  rows = 3,
}: GoalTextFieldProps) {
  const [editing, setEditing] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [draftText, setDraftText] = useState(value);
  const [addDraft, setAddDraft] = useState("");
  const isKnownCandidate = useMemo(() => {
    const set = new Set(
      candidates
        .map((x) => x.trim())
        .filter(Boolean),
    );
    return (v: string) => set.has(v);
  }, [candidates]);
  const [draftMode, setDraftMode] = useState<string>(() =>
    candidates.includes(value) ? value : GOAL_TEXT_CUSTOM_OPTION,
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const textId = useId();
  const pickerLabelId = useId();
  const addCandidateId = useId();

  const isEmpty = !value.trim();

  useEffect(() => {
    if (!editing) return;
    // 編集開始時は候補ピッカーを優先してフォーカス
    anchorRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    setDraftText(value);
    setAddDraft("");
    setDraftMode(isKnownCandidate(value) ? value : GOAL_TEXT_CUSTOM_OPTION);
    setIsPickerOpen(false);
    setEditing(true);
  };

  const cancel = () => {
    setDraftText(value);
    setAddDraft("");
    setDraftMode(isKnownCandidate(value) ? value : GOAL_TEXT_CUSTOM_OPTION);
    setIsPickerOpen(false);
    setEditing(false);
  };

  const commit = () => {
    setIsPickerOpen(false);
    setEditing(false);
    onChange(draftText.trim());
  };

  const selectOptions = useMemo(() => {
    const normalized = candidates.map((x) => x.trim()).filter(Boolean);
    return [
      ...normalized.map((x) => ({ value: x, label: x })),
      { value: GOAL_TEXT_CUSTOM_OPTION, label: "その他（自由入力）" },
    ];
  }, [candidates]);

  const showTextarea = draftMode === GOAL_TEXT_CUSTOM_OPTION;

  const closePicker = useCallback(() => setIsPickerOpen(false), []);

  useEffect(() => {
    if (!editing) return;
    if (!isPickerOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      closePicker();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [closePicker, editing, isPickerOpen]);

  const onRootBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    commit();
  };

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={startEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") startEdit();
        }}
        className={[
          "block cursor-text whitespace-pre-wrap rounded px-0.5 hover:bg-black/5",
          MIN_HEIGHT_ONE_LINE,
          isEmpty
            ? "text-xs font-medium leading-snug text-gray-400 italic"
            : className,
        ].join(" ")}
      >
        {isEmpty ? placeholder : value}
      </span>
    );
  }

  return (
    <div
      ref={rootRef}
      className="space-y-1.5 rounded border border-blue-400 bg-white p-1.5 ring-1 ring-blue-200"
      onBlur={onRootBlur}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          if (isPickerOpen) closePicker();
          else cancel();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
    >
      <div>
        <label
          id={pickerLabelId}
          className="mb-0.5 block text-[10px] font-medium text-gray-500"
        >
          ゴール（候補）
        </label>
        <div className="relative">
          <button
            ref={anchorRef}
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded border border-gray-200 bg-white px-1.5 py-1 text-left text-xs font-medium text-gray-900 outline-none focus:border-blue-400"
            aria-haspopup="listbox"
            aria-expanded={isPickerOpen}
            onClick={() => setIsPickerOpen((o) => !o)}
          >
            <span className="min-w-0 flex-1 truncate">
              {draftMode === GOAL_TEXT_CUSTOM_OPTION ? "その他（自由入力）" : draftMode}
            </span>
            <span aria-hidden className="text-[10px] font-black text-gray-500">
              ▾
            </span>
          </button>

          {isPickerOpen ? (
            <div
              ref={pickerRef}
              role="listbox"
              aria-labelledby={pickerLabelId}
              className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-auto rounded border border-gray-200 bg-white p-1 shadow-lg"
            >
              {selectOptions.map((opt) => {
                const selected = draftMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={[
                      "block w-full truncate rounded px-1 py-0.5 text-left text-xs font-medium text-gray-900",
                      selected ? "bg-blue-50" : "hover:bg-gray-50",
                    ].join(" ")}
                    onClick={() => {
                      const next = opt.value;
                      setDraftMode(next);
                      closePicker();
                      if (next !== GOAL_TEXT_CUSTOM_OPTION) {
                        setDraftText(next);
                        setEditing(false);
                        onChange(next.trim());
                      } else {
                        setTimeout(() => {
                          textRef.current?.focus();
                        }, 0);
                      }
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {onAddCandidate ? (
        <div>
          <label
            htmlFor={addCandidateId}
            className="mb-0.5 block text-[10px] font-medium text-gray-500"
          >
            候補を追加
          </label>
          <div className="flex gap-1">
            <input
              id={addCandidateId}
              type="text"
              value={addDraft}
              onChange={(e) => setAddDraft(e.target.value)}
              placeholder="例: 公開できている状態"
              className={[
                "min-w-0 flex-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs font-medium text-gray-900 outline-none focus:border-blue-400",
                INPUT_PLACEHOLDER_CLASS,
              ].join(" ")}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const t = addDraft.trim();
                if (!t) return;
                onAddCandidate(t);
                setDraftMode(t);
                setDraftText(t);
                setAddDraft("");
                setEditing(false);
                onChange(t);
              }}
            />
            <button
              type="button"
              className="shrink-0 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-bold text-gray-700 hover:bg-gray-100"
              onClick={() => {
                const t = addDraft.trim();
                if (!t) return;
                onAddCandidate(t);
                setDraftMode(t);
                setDraftText(t);
                setAddDraft("");
                setEditing(false);
                onChange(t);
              }}
            >
              追加
            </button>
          </div>
        </div>
      ) : null}

      {showTextarea ? (
        <div>
          <label
            htmlFor={textId}
            className="mb-0.5 block text-[10px] font-medium text-gray-500"
          >
            ゴール（自由入力）
          </label>
          <textarea
            ref={textRef}
            id={textId}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className={[
              "w-full resize-y rounded border border-gray-200 bg-white px-1 py-0.5 text-xs font-medium text-gray-900 outline-none focus:border-blue-400",
              INPUT_PLACEHOLDER_CLASS,
              MIN_HEIGHT_ONE_LINE,
              inputClassName,
            ].join(" ")}
          />
        </div>
      ) : null}
    </div>
  );
}


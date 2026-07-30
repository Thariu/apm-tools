"use client";

import { useEffect, useRef, useState } from "react";

type InlineEditProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  /** 表示時のレイアウト。inline はラベル横並びで縦中央揃え向け */
  layout?: "block" | "inline";
  onEditingChange?: (editing: boolean) => void;
};

const INPUT_PLACEHOLDER_CLASS = "placeholder:text-gray-400 placeholder:italic";
/** 空表示・入力欄とも最小高さは1行分 */
const MIN_HEIGHT_ONE_LINE = "min-h-6";

export function InlineEdit({
  value,
  onChange,
  className = "",
  inputClassName = "",
  placeholder = "クリックして編集",
  multiline = false,
  rows = 3,
  layout = "block",
  onEditingChange,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const isEmpty = !value.trim();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    onEditingChange?.(true);
  };

  const commit = () => {
    setEditing(false);
    onEditingChange?.(false);
    onChange(draft.trim());
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
    onEditingChange?.(false);
  };

  if (editing) {
    const baseClassName = [
      "w-full rounded border border-blue-400 bg-white px-1 py-0.5 text-inherit text-gray-900 outline-none ring-1 ring-blue-200",
      INPUT_PLACEHOLDER_CLASS,
      inputClassName,
    ].join(" ");
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !multiline) {
        e.preventDefault();
        commit();
      }
      if (multiline && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commit();
      }
      if (e.key === "Escape") cancel();
    };

    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          rows={rows}
          placeholder={placeholder}
          className={[baseClassName, "resize-y", MIN_HEIGHT_ONE_LINE].join(" ")}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={[baseClassName, MIN_HEIGHT_ONE_LINE].join(" ")}
      />
    );
  }

  const useInlineDisplay = layout === "inline" && (!multiline || isEmpty);
  const displayLayoutClass = useInlineDisplay
    ? "inline-flex max-w-full items-center leading-normal"
    : `block w-full ${MIN_HEIGHT_ONE_LINE}`;

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") startEdit();
      }}
      className={[
        "cursor-text whitespace-pre-wrap rounded px-0.5 hover:bg-black/5",
        displayLayoutClass,
        isEmpty
          ? "text-xs font-medium leading-normal text-gray-400 italic"
          : className,
      ].join(" ")}
    >
      {isEmpty ? placeholder : value}
    </span>
  );
}

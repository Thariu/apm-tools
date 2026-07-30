"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ASSIGNEE_COLOR_PALETTE,
  getAssigneeColorById,
  getFallbackAssigneeColorId,
  type AssigneeColorId,
} from "@/lib/assigneeColors";

const PICKER_WIDTH_PX = 288;
const VIEWPORT_MARGIN_PX = 8;
const PICKER_GAP_PX = 4;

type PickerPlacement = {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

function computePickerPlacement(anchor: HTMLElement): PickerPlacement {
  const rect = anchor.getBoundingClientRect();
  let left = rect.left;
  left = Math.max(
    VIEWPORT_MARGIN_PX,
    Math.min(left, window.innerWidth - PICKER_WIDTH_PX - VIEWPORT_MARGIN_PX),
  );

  const spaceBelow =
    window.innerHeight - rect.bottom - VIEWPORT_MARGIN_PX - PICKER_GAP_PX;
  const spaceAbove = rect.top - VIEWPORT_MARGIN_PX - PICKER_GAP_PX;
  const openAbove = spaceBelow < 280 && spaceAbove > spaceBelow;

  if (openAbove) {
    return {
      left,
      bottom: window.innerHeight - rect.top + PICKER_GAP_PX,
      maxHeight: Math.max(160, Math.min(400, spaceAbove)),
    };
  }

  return {
    left,
    top: rect.bottom + PICKER_GAP_PX,
    maxHeight: Math.max(160, Math.min(400, spaceBelow)),
  };
}

export type AssigneeSinglePickerProps = {
  value: string | undefined;
  onChange: (name: string | undefined) => void;
  candidates: string[];
  /** 選択できない候補（表示はするが選択操作を無効化） */
  disabledCandidates?: string[];
  colorByName: Record<string, AssigneeColorId>;
  onSetAssigneeColor: (assigneeName: string, colorId: AssigneeColorId) => void;
  onAddCandidate?: (name: string) => void;
  onDeleteCandidate?: (name: string) => void;
  onRenameCandidate?: (fromName: string, toName: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  allowClear?: boolean;
  /** 同じ候補を再クリックしたら解除（undefined）にする */
  toggleClearOnReselect?: boolean;
  readOnly?: boolean;
  /** 外部で開閉を制御する場合 */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderCandidateSuffix?: (name: string) => React.ReactNode;
  className?: string;
};

export function AssigneeSinglePicker({
  value,
  onChange,
  candidates,
  disabledCandidates,
  colorByName,
  onSetAssigneeColor,
  onAddCandidate,
  onDeleteCandidate,
  onRenameCandidate,
  placeholder = "担当を選択",
  emptyMessage = "担当者一覧が空です。「担当者を追加」から登録できます。",
  allowClear = true,
  toggleClearOnReselect = false,
  readOnly = false,
  isOpen: isOpenControlled,
  onOpenChange,
  renderCandidateSuffix,
  className = "",
}: AssigneeSinglePickerProps) {
  const normalizedCandidates = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const c of candidates) {
      const name = c.trim();
      if (!name) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    if (value?.trim() && !seen.has(value.trim())) {
      out.push(value.trim());
      out.sort((a, b) => a.localeCompare(b, "ja-JP"));
    }
    return out;
  }, [candidates, value]);

  const disabledSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of disabledCandidates ?? []) {
      const n = c.trim();
      if (n) set.add(n);
    }
    return set;
  }, [disabledCandidates]);

  const resolveColorId = (name: string): AssigneeColorId => {
    return colorByName[name] ?? getFallbackAssigneeColorId(name);
  };

  const resolveColor = (name: string) => {
    return getAssigneeColorById(resolveColorId(name));
  };

  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const isOpen = isOpenControlled ?? isOpenInternal;

  const setOpen = useCallback(
    (next: boolean) => {
      if (isOpenControlled === undefined) {
        setIsOpenInternal(next);
      }
      onOpenChange?.(next);
    },
    [isOpenControlled, onOpenChange],
  );

  const [search, setSearch] = useState("");
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [editingNameFor, setEditingNameFor] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [newCandidateDraft, setNewCandidateDraft] = useState("");
  const [pickerPlacement, setPickerPlacement] = useState<PickerPlacement | null>(
    null,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const mounted = typeof window !== "undefined";

  const updatePickerPlacement = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    setPickerPlacement(computePickerPlacement(anchor));
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPickerPlacement(null);
      return;
    }
    updatePickerPlacement();
    const onReposition = () => updatePickerPlacement();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [isOpen, updatePickerPlacement]);

  const closePicker = useCallback(() => {
    setOpen(false);
    setColorPickerFor(null);
    setEditingNameFor(null);
    setPickerPlacement(null);
  }, [setOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      if (pickerRef.current?.contains(target)) return;
      closePicker();
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [closePicker, isOpen]);

  const commitRename = (from: string) => {
    const next = editingDraft.trim();
    if (!next || next === from) {
      setEditingNameFor(null);
      setEditingDraft("");
      return;
    }
    onRenameCandidate?.(from, next);
    if (value === from) {
      onChange(next);
    }
    setEditingNameFor(null);
    setEditingDraft("");
  };

  const handleDeleteFromDirectory = (name: string) => {
    if (
      !window.confirm(
        `「${name}」を担当者一覧から削除しますか？\n\n既存のタスク・Backlogからも担当が外れます。この操作は取り消せません。`,
      )
    ) {
      return;
    }
    onDeleteCandidate?.(name);
    if (value === name) onChange(undefined);
    if (colorPickerFor === name) setColorPickerFor(null);
    if (editingNameFor === name) setEditingNameFor(null);
  };

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return normalizedCandidates;
    return normalizedCandidates.filter((name) =>
      name.toLowerCase().includes(q),
    );
  }, [normalizedCandidates, search]);

  const openPicker = () => {
    if (readOnly) return;
    setSearch("");
    setColorPickerFor(null);
    setEditingNameFor(null);
    setOpen(true);
    if (anchorRef.current) {
      setPickerPlacement(computePickerPlacement(anchorRef.current));
    }
  };

  const commitNewCandidate = () => {
    const n = newCandidateDraft.trim();
    if (!n || !onAddCandidate) return;
    onAddCandidate(n);
    onChange(n);
    setNewCandidateDraft("");
    closePicker();
  };

  const selectName = (name: string) => {
    if (disabledSet.has(name)) return;
    if (toggleClearOnReselect && value?.trim() === name) {
      onChange(undefined);
    } else {
      onChange(name);
    }
    closePicker();
  };

  const selectedColor = value?.trim() ? resolveColor(value.trim()) : null;

  const pickerPanel =
    isOpen && pickerPlacement ? (
      <div
        ref={pickerRef}
        role="dialog"
        aria-label="担当者を選択"
        className="fixed z-[9999] flex flex-col rounded border border-gray-200 bg-white p-2 shadow-xl"
        style={{
          left: pickerPlacement.left,
          top: pickerPlacement.top,
          bottom: pickerPlacement.bottom,
          maxHeight: pickerPlacement.maxHeight,
          width: PICKER_WIDTH_PX,
        }}
      >
        {onAddCandidate ? (
          <div className="mb-2 flex shrink-0 items-center gap-2">
            <input
              value={newCandidateDraft}
              onChange={(e) => setNewCandidateDraft(e.target.value)}
              placeholder="担当者を追加"
              className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-400"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitNewCandidate();
                }
              }}
            />
            <button
              type="button"
              className="shrink-0 rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-black/5"
              onClick={commitNewCandidate}
            >
              登録
            </button>
          </div>
        ) : null}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="担当者を検索"
          className="w-full shrink-0 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-400"
        />

        {allowClear && value?.trim() ? (
          <button
            type="button"
            className="mt-2 shrink-0 rounded px-1.5 py-1 text-left text-[11px] text-gray-500 hover:bg-gray-50"
            onClick={() => {
              onChange(undefined);
              closePicker();
            }}
          >
            選択を解除
          </button>
        ) : null}

        <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {filteredCandidates.map((name) => {
            const isSelected = value?.trim() === name;
            const isDisabled = disabledSet.has(name);
            const color = resolveColor(name);
            const isEditing = editingNameFor === name;
            const isColorOpen = colorPickerFor === name;

            return (
              <div key={name} className="rounded">
                <div
                  className={[
                    "flex items-center gap-1.5 rounded px-1.5 py-1",
                    isSelected ? "bg-sky-50/80" : "hover:bg-black/[0.03]",
                    isDisabled ? "opacity-60" : "",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    title="色を変更"
                    aria-label={`${name} の色を変更`}
                    aria-expanded={isColorOpen}
                    onClick={() =>
                      setColorPickerFor((prev) => (prev === name ? null : name))
                    }
                    className={[
                      "h-4 w-4 shrink-0 rounded-full border border-black/10 ring-offset-1 hover:ring-2 hover:ring-gray-300",
                      color.bgClass,
                    ].join(" ")}
                  />

                  {isEditing ? (
                    <input
                      value={editingDraft}
                      onChange={(e) => setEditingDraft(e.target.value)}
                      className="min-w-0 flex-1 rounded border border-blue-400 px-1.5 py-0.5 text-xs outline-none"
                      onBlur={() => commitRename(name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename(name);
                        }
                        if (e.key === "Escape") {
                          setEditingNameFor(null);
                          setEditingDraft("");
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-xs text-gray-900"
                      title={
                        onRenameCandidate
                          ? "ダブルクリックで名前を変更"
                          : undefined
                      }
                      onClick={() => selectName(name)}
                      onDoubleClick={() => {
                        if (!onRenameCandidate) return;
                        setEditingNameFor(name);
                        setEditingDraft(name);
                      }}
                    >
                      {name}
                    </button>
                  )}

                  {renderCandidateSuffix?.(name)}

                  <button
                    type="button"
                    title={
                      isDisabled
                        ? "他ユーザーが入力中のため選択できません"
                        : isSelected
                          ? "選択中"
                          : "この担当を選択"
                    }
                    aria-label={
                      isSelected ? `${name} を選択中` : `${name} を選択`
                    }
                    onClick={() => selectName(name)}
                    disabled={isDisabled}
                    className={[
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm font-bold leading-none",
                      isSelected
                        ? "border-sky-300 bg-sky-100 text-sky-700"
                        : isDisabled
                          ? "border-gray-200 bg-gray-50 text-gray-400"
                          : "border-gray-300 bg-white text-gray-500 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-600",
                    ].join(" ")}
                  >
                    {isSelected ? "✓" : "+"}
                  </button>

                  {onDeleteCandidate ? (
                    <button
                      type="button"
                      title="担当者一覧から削除"
                      aria-label={`${name} を担当者一覧から削除`}
                      onClick={() => handleDeleteFromDirectory(name)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                    >
                      削除
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {filteredCandidates.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-gray-500">
              {normalizedCandidates.length === 0 ? emptyMessage : "該当なし"}
            </div>
          ) : null}
        </div>

        {colorPickerFor ? (
          <div className="mt-2 shrink-0 rounded border border-gray-200 bg-gray-50/90 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-800">
                {colorPickerFor} の色
              </span>
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-black/10 hover:text-gray-800"
                aria-label="色の選択を閉じる"
                title="閉じる"
                onClick={() => setColorPickerFor(null)}
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {ASSIGNEE_COLOR_PALETTE.map((c) => {
                const isActive = resolveColorId(colorPickerFor) === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={`${colorPickerFor} を ${c.id} にする`}
                    aria-pressed={isActive}
                    className={[
                      "h-7 w-7 rounded-full border-2",
                      c.bgClass,
                      isActive
                        ? "border-gray-900"
                        : "border-transparent hover:border-gray-400",
                    ].join(" ")}
                    onClick={() => {
                      onSetAssigneeColor(colorPickerFor, c.id);
                      setColorPickerFor(null);
                    }}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex shrink-0 justify-end">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-black/5"
            onClick={closePicker}
          >
            閉じる
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div ref={containerRef} className={`relative inline-flex max-w-full ${className}`}>
      <button
        ref={anchorRef}
        type="button"
        disabled={readOnly}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) closePicker();
          else openPicker();
        }}
        className={
          selectedColor
            ? `block max-w-full truncate rounded border border-black/15 px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-sm ${selectedColor.bgClass} ${selectedColor.textClass}`
            : "block max-w-full truncate rounded border border-dashed border-sky-200 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 hover:bg-sky-50"
        }
      >
        {value?.trim() || placeholder}
      </button>

      {mounted && pickerPanel ? createPortal(pickerPanel, document.body) : null}
    </div>
  );
}

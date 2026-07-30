"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ASSIGNEE_COLOR_PALETTE,
  getAssigneeColorById,
  getFallbackAssigneeColorId,
  type AssigneeColorId,
} from "@/lib/assigneeColors";

type AssigneeTagsProps = {
  assignees: string[];
  onChange: (assignees: string[]) => void;
  candidates: string[];
  colorByName: Record<string, AssigneeColorId>;
  onSetAssigneeColor: (
    assigneeName: string,
    colorId: AssigneeColorId,
  ) => void;
  onAddCandidate?: (name: string) => void;
  onDeleteCandidate?: (name: string) => void;
  onRenameCandidate?: (fromName: string, toName: string) => void;
  variant?: "task" | "backlog";
  onEditingChange?: (editing: boolean) => void;
};

const ADD_BUTTON_STYLES = {
  task: "border-sky-300 text-sky-700 hover:bg-sky-50",
  backlog: "border-blue-200 text-blue-600 hover:bg-blue-50",
} as const;

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

export function AssigneeTags({
  assignees,
  onChange,
  candidates,
  colorByName,
  onSetAssigneeColor,
  onAddCandidate,
  onDeleteCandidate,
  onRenameCandidate,
  variant = "task",
  onEditingChange,
}: AssigneeTagsProps) {
  const normalizedAssignees = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const a of assignees) {
      const name = a.trim();
      if (!name) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  }, [assignees]);

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
    return out;
  }, [candidates]);

  const resolveColorId = (name: string): AssigneeColorId => {
    return colorByName[name] ?? getFallbackAssigneeColorId(name);
  };

  const resolveColor = (name: string) => {
    return getAssigneeColorById(resolveColorId(name));
  };

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [editingNameFor, setEditingNameFor] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [newCandidateDraft, setNewCandidateDraft] = useState("");
  const [pickerPlacement, setPickerPlacement] = useState<PickerPlacement | null>(null);
  const mounted = typeof window !== "undefined";

  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const isOverlayOpen =
    isPickerOpen || colorPickerFor !== null || editingNameFor !== null;

  useEffect(() => {
    onEditingChange?.(isOverlayOpen);
  }, [isOverlayOpen, onEditingChange]);

  const updatePickerPlacement = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    setPickerPlacement(computePickerPlacement(anchor));
  }, []);

  useEffect(() => {
    if (!isPickerOpen) return;

    const onReposition = () => updatePickerPlacement();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [isPickerOpen, updatePickerPlacement]);

  const closePicker = useCallback(() => {
    setIsPickerOpen(false);
    setColorPickerFor(null);
    setEditingNameFor(null);
    setPickerPlacement(null);
  }, []);

  useEffect(() => {
    if (!isOverlayOpen) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      if (pickerRef.current?.contains(target)) return;
      closePicker();
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [closePicker, isOverlayOpen]);

  const addToCurrentItem = (name: string) => {
    if (normalizedAssignees.includes(name)) return;
    onChange([...normalizedAssignees, name]);
  };

  const removeFromCurrentItem = (name: string) => {
    onChange(normalizedAssignees.filter((a) => a !== name));
  };

  const commitRename = (from: string) => {
    const next = editingDraft.trim();
    if (!next || next === from) {
      setEditingNameFor(null);
      setEditingDraft("");
      return;
    }
    onRenameCandidate?.(from, next);
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
    setSearch("");
    setColorPickerFor(null);
    setEditingNameFor(null);
    setIsPickerOpen(true);
    if (anchorRef.current) {
      setPickerPlacement(computePickerPlacement(anchorRef.current));
    }
  };

  const commitNewCandidate = () => {
    const n = newCandidateDraft.trim();
    if (!n || !onAddCandidate) return;
    onAddCandidate(n);
    setNewCandidateDraft("");
  };

  const pickerPanel =
    isPickerOpen && pickerPlacement ? (
      <div
        ref={pickerRef}
        role="dialog"
        aria-label="担当者を選択"
        className="fixed z-[9999] flex w-72 flex-col rounded border border-gray-200 bg-white p-2 shadow-xl"
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

        <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {filteredCandidates.map((name) => {
            const isAssigned = normalizedAssignees.includes(name);
            const color = resolveColor(name);
            const isEditing = editingNameFor === name;
            const isColorOpen = colorPickerFor === name;

            return (
              <div key={name} className="rounded">
                <div
                  className={[
                    "flex items-center gap-1.5 rounded px-1.5 py-1",
                    isAssigned ? "bg-sky-50/80" : "hover:bg-black/[0.03]",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    title="色を変更"
                    aria-label={`${name} の色を変更`}
                    aria-expanded={isColorOpen}
                    onClick={() =>
                      setColorPickerFor((prev) =>
                        prev === name ? null : name,
                      )
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
                    <span
                      className="min-w-0 flex-1 truncate text-xs text-gray-900"
                      title={
                        onRenameCandidate
                          ? "ダブルクリックで名前を変更"
                          : undefined
                      }
                      onDoubleClick={() => {
                        if (!onRenameCandidate) return;
                        setEditingNameFor(name);
                        setEditingDraft(name);
                      }}
                    >
                      {name}
                    </span>
                  )}

                  <button
                    type="button"
                    title={
                      isAssigned
                        ? "この項目の担当から外す"
                        : "この項目の担当に追加"
                    }
                    aria-label={
                      isAssigned
                        ? `${name} をこの項目の担当から外す`
                        : `${name} をこの項目の担当に追加`
                    }
                    onClick={() =>
                      isAssigned
                        ? removeFromCurrentItem(name)
                        : addToCurrentItem(name)
                    }
                    className={[
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm font-bold leading-none",
                      isAssigned
                        ? "border-sky-300 bg-sky-100 text-sky-700"
                        : "border-gray-300 bg-white text-gray-500 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-600",
                    ].join(" ")}
                  >
                    {isAssigned ? "✓" : "+"}
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
              該当なし
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
    <div
      ref={containerRef}
      className="relative flex flex-wrap items-center gap-1"
    >
      {normalizedAssignees.map((name) => {
        const color = resolveColor(name);
        return (
          <span
            key={name}
            className={[
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
              color.bgClass,
              color.textClass,
            ].join(" ")}
          >
            <span
              aria-hidden
              className={["h-2.5 w-2.5 rounded-full", color.bgClass].join(" ")}
            />
            {name}
            <button
              type="button"
              onClick={() => removeFromCurrentItem(name)}
              className="rounded px-0.5 leading-none opacity-60 hover:bg-black/10 hover:opacity-100"
              aria-label={`${name} をこの項目から外す`}
            >
              ×
            </button>
          </span>
        );
      })}

      <button
        ref={anchorRef}
        type="button"
        onClick={openPicker}
        className={[
          "rounded border border-dashed px-1.5 py-0.5 text-[10px] font-medium",
          ADD_BUTTON_STYLES[variant],
        ].join(" ")}
      >
        + 担当
      </button>

      {mounted && pickerPanel
        ? createPortal(pickerPanel, document.body)
        : null}
    </div>
  );
}

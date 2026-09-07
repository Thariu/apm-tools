"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import {
  getBoardConfig,
  resolveBoardLabel,
} from "@/lib/boardConfig";
import type { BoardId, AppView, BoardRegistryEntry } from "@/lib/types";
import { InlineEdit } from "@/components/ui/InlineEdit";

type BoardSwitcherProps = {
  activeBoardId: BoardId;
  onChange: (boardId: BoardId) => void;
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  activeBoardIds: BoardId[];
  archivedEntries: BoardRegistryEntry[];
  boardLabelsByBoard: Record<BoardId, string>;
  onUpdateBoardLabel: (boardId: BoardId, label: string) => void;
  onAddBoard: (label: string) => Promise<unknown>;
  onArchiveBoard: (boardId: BoardId) => Promise<void>;
  onRestoreBoard: (boardId: BoardId) => Promise<void>;
  onPermanentlyDeleteBoard: (boardId: BoardId) => Promise<void>;
  onReorderBoards: (orderedActiveIds: BoardId[]) => Promise<void>;
};

function SortableCategoryRow({
  boardId,
  label,
  busy,
  canArchive,
  onArchive,
  onUpdateLabel,
}: {
  boardId: BoardId;
  label: string;
  busy: boolean;
  canArchive: boolean;
  onArchive: () => void;
  onUpdateLabel: (label: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: boardId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center justify-between gap-2 rounded border border-transparent px-1 py-1 text-xs text-gray-800",
        isDragging
          ? "z-10 border-gray-200 bg-white shadow-md"
          : "bg-transparent",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none rounded px-1 py-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
          aria-label={`${label}をドラッグして並び替え`}
          disabled={busy}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <div className="min-w-0 flex-1" title="クリックして名前を編集">
          <InlineEdit
            value={label}
            onChange={onUpdateLabel}
            layout="inline"
            placeholder="カテゴリ名"
            className="block w-full truncate text-xs font-medium text-gray-800"
            inputClassName="min-w-0 text-xs font-medium !text-gray-900"
          />
        </div>
      </div>
      <button
        type="button"
        disabled={busy || !canArchive}
        onClick={onArchive}
        className="shrink-0 text-[11px] font-medium text-amber-800 hover:underline disabled:opacity-40"
      >
        アーカイブ
      </button>
    </li>
  );
}

export function BoardSwitcher({
  activeBoardId,
  onChange,
  activeView,
  onChangeView,
  activeBoardIds,
  archivedEntries,
  boardLabelsByBoard,
  onUpdateBoardLabel,
  onAddBoard,
  onArchiveBoard,
  onRestoreBoard,
  onPermanentlyDeleteBoard,
  onReorderBoards,
}: BoardSwitcherProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (dragging) return;
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setAdding(false);
        setError(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen, dragging]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeBoardIds.indexOf(String(active.id));
    const newIndex = activeBoardIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(activeBoardIds, oldIndex, newIndex);
    void run(async () => {
      await onReorderBoards(next);
    });
  };

  return (
    <div className="relative flex flex-wrap items-center gap-1">
      <nav
        className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1"
        aria-label="ボード切り替え"
      >
        {activeBoardIds.map((boardId) => {
          const config = getBoardConfig(
            boardId,
            boardLabelsByBoard[boardId],
          );
          const label = resolveBoardLabel(boardId, boardLabelsByBoard);
          const isActive =
            activeView === "planning" && boardId === activeBoardId;
          const tabClassName = [
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            isActive
              ? config.activeTabClassName
              : "bg-white text-gray-900 hover:bg-gray-100",
          ].join(" ");

          if (isActive) {
            return (
              <div
                key={boardId}
                className={tabClassName}
                aria-current="page"
                title="クリックしてボード名を編集"
              >
                <InlineEdit
                  value={label}
                  onChange={(next) => onUpdateBoardLabel(boardId, next)}
                  layout="inline"
                  placeholder="ボード名"
                  className="text-inherit"
                  inputClassName="min-w-[4.5rem] text-xs font-semibold !text-gray-900"
                />
              </div>
            );
          }

          return (
            <button
              key={boardId}
              type="button"
              onClick={() => {
                onChange(boardId);
                onChangeView("planning");
              }}
              className={tabClassName}
            >
              {label}
            </button>
          );
        })}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen((o) => !o);
              setError(null);
            }}
            className={[
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              menuOpen
                ? "bg-gray-800 text-white shadow-sm"
                : "bg-white text-gray-900 hover:bg-gray-100",
            ].join(" ")}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="カテゴリの管理"
          >
            カテゴリ管理
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute left-0 z-40 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
            >
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                カテゴリ
              </p>
              <p className="mb-2 text-[10px] text-gray-500">
                名前をクリックして編集 / ⠿ をドラッグして並び替え
              </p>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={() => setDragging(true)}
                onDragCancel={() => setDragging(false)}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={activeBoardIds}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto">
                    {activeBoardIds.map((boardId) => {
                      const label = resolveBoardLabel(
                        boardId,
                        boardLabelsByBoard,
                      );
                      return (
                        <SortableCategoryRow
                          key={boardId}
                          boardId={boardId}
                          label={label}
                          busy={busy}
                          canArchive={activeBoardIds.length > 1}
                          onUpdateLabel={(next) =>
                            onUpdateBoardLabel(boardId, next)
                          }
                          onArchive={() =>
                            void run(async () => {
                              if (
                                !window.confirm(
                                  `「${label}」をアーカイブしますか？\n一覧から非表示になりますが、後から復元できます。`,
                                )
                              ) {
                                return;
                              }
                              await onArchiveBoard(boardId);
                              if (boardId === activeBoardId) {
                                const nextId = activeBoardIds.find(
                                  (id) => id !== boardId,
                                );
                                if (nextId) onChange(nextId);
                              }
                            })
                          }
                        />
                      );
                    })}
                  </ul>
                </SortableContext>
              </DndContext>

              {adding ? (
                <div className="mb-3 space-y-2">
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="新しいカテゴリ名"
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void run(async () => {
                          const entry = (await onAddBoard(newLabel)) as
                            | { id: string }
                            | undefined;
                          setNewLabel("");
                          setAdding(false);
                          if (entry?.id) {
                            onChange(entry.id);
                            onChangeView("planning");
                          }
                        });
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const entry = (await onAddBoard(newLabel)) as
                            | { id: string }
                            | undefined;
                          setNewLabel("");
                          setAdding(false);
                          if (entry?.id) {
                            onChange(entry.id);
                            onChangeView("planning");
                          }
                        })
                      }
                      className="rounded bg-gray-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                    >
                      追加
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(false);
                        setNewLabel("");
                      }}
                      className="rounded px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAdding(true)}
                  className="mb-3 w-full rounded border border-dashed border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  ＋ カテゴリを追加
                </button>
              )}

              {archivedEntries.length > 0 ? (
                <div className="border-t border-gray-100 pt-2">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    アーカイブ
                  </p>
                  <ul className="max-h-36 space-y-2 overflow-y-auto">
                    {archivedEntries.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded bg-gray-50 px-2 py-1.5 text-xs text-gray-700"
                      >
                        <div className="mb-1 truncate font-medium">
                          {entry.label}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await onRestoreBoard(entry.id);
                                onChange(entry.id);
                                onChangeView("planning");
                              })
                            }
                            className="text-[11px] font-medium text-blue-700 hover:underline disabled:opacity-40"
                          >
                            復元
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                if (
                                  !window.confirm(
                                    `「${entry.label}」を完全削除しますか？\nボード内のタスク・バックログ等も削除され、元に戻せません。`,
                                  )
                                ) {
                                  return;
                                }
                                await onPermanentlyDeleteBoard(entry.id);
                              })
                            }
                            className="text-[11px] font-medium text-red-700 hover:underline disabled:opacity-40"
                          >
                            完全削除
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {error ? (
                <p className="mt-2 text-[11px] text-red-600">{error}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onChangeView("memberTasks")}
          className={[
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            activeView === "memberTasks"
              ? "bg-indigo-700 text-white shadow-sm"
              : "bg-white text-gray-900 hover:bg-gray-100",
          ].join(" ")}
          aria-current={activeView === "memberTasks" ? "page" : undefined}
        >
          メンバー別タスク
        </button>

        <button
          type="button"
          onClick={() => onChangeView("dailyProgress")}
          className={[
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            activeView === "dailyProgress"
              ? "bg-teal-700 text-white shadow-sm"
              : "bg-white text-gray-900 hover:bg-gray-100",
          ].join(" ")}
          aria-current={activeView === "dailyProgress" ? "page" : undefined}
        >
          今日の進捗
        </button>

        <div className="mx-0.5 w-px self-stretch bg-gray-200" aria-hidden />

        <button
          type="button"
          onClick={() => onChangeView("retro")}
          className={[
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            activeView === "retro"
              ? "bg-blue-900 text-white shadow-sm"
              : "bg-white text-gray-900 hover:bg-gray-100",
          ].join(" ")}
          aria-current={activeView === "retro" ? "page" : undefined}
        >
          振り返り
        </button>
      </nav>
    </div>
  );
}

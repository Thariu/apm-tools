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
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TaskTemplateItem, TaskTemplateSet } from "@/lib/types";
import { sortTemplateItems } from "@/lib/taskTemplateSetUtils";
import { SmallModal } from "./SmallModal";

type TabId = "add" | "manage";

function SortableSetItemRow(props: {
  item: TaskTemplateItem;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.item.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={[
        "flex items-center gap-2 p-2",
        isDragging ? "bg-orange-50" : "",
      ].join(" ")}
    >
      <button
        type="button"
        className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded border border-gray-200 bg-gray-50 text-[11px] text-gray-500 active:cursor-grabbing"
        aria-label="ドラッグして並び替え"
        title="ドラッグして並び替え"
        {...listeners}
        {...attributes}
        onClick={(e) => e.preventDefault()}
      >
        ⋮⋮
      </button>
      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
        {props.item.title}
      </span>
      <button
        type="button"
        className="shrink-0 rounded px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-700"
        onClick={props.onDelete}
      >
        削除
      </button>
    </li>
  );
}

export function TaskTemplatePickerModal(props: {
  isOpen: boolean;
  onClose: () => void;
  sets: TaskTemplateSet[];
  onAddSet: (name: string) => string | undefined;
  onDeleteSet: (setId: string) => void;
  onRenameSet: (setId: string, name: string) => void;
  onAddItemToSet: (setId: string, title: string) => void;
  onRemoveItemFromSet: (setId: string, itemId: string) => void;
  onReorderItemsInSet: (setId: string, orderedItemIds: string[]) => void;
  onAddFromSet: (setId: string) => void;
}) {
  const { sets } = props;
  const [tab, setTab] = useState<TabId>("add");
  const [selectedSetId, setSelectedSetId] = useState<string>("");
  const [newSetName, setNewSetName] = useState("");
  const [newSetTaskLines, setNewSetTaskLines] = useState("");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [bulkItemLines, setBulkItemLines] = useState("");
  const [manageSetName, setManageSetName] = useState("");
  const wasOpenRef = useRef(false);
  const [orderedItemIds, setOrderedItemIds] = useState<string[]>([]);

  const setIdList = useMemo(() => sets.map((s) => s.id), [sets]);

  const selectedSet = useMemo(
    () => sets.find((s) => s.id === selectedSetId) ?? null,
    [sets, selectedSetId],
  );

  const previewItems = useMemo(
    () => (selectedSet ? sortTemplateItems(selectedSet.items) : []),
    [selectedSet],
  );

  const itemIdSet = useMemo(
    () => new Set(previewItems.map((i) => i.id)),
    [previewItems],
  );

  const orderedManageItems = useMemo(() => {
    const map = new Map(previewItems.map((i) => [i.id, i]));
    const ordered = orderedItemIds
      .map((id) => map.get(id))
      .filter((x): x is TaskTemplateItem => Boolean(x));
    const rest = previewItems.filter((i) => !new Set(orderedItemIds).has(i.id));
    return [...ordered, ...rest];
  }, [orderedItemIds, previewItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  useEffect(() => {
    if (!props.isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    setTab("add");
    const firstId = sets[0]?.id ?? "";
    setSelectedSetId((prev) => (setIdList.includes(prev) ? prev : firstId));
    setNewSetName("");
    setNewSetTaskLines("");
    setNewItemTitle("");
    setBulkItemLines("");
  }, [props.isOpen, sets, setIdList]);

  const parseTaskLines = (text: string) =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  const addItemsToSelectedSet = (titles: string[]) => {
    if (!selectedSet || titles.length === 0) return;
    for (const title of titles) {
      props.onAddItemToSet(selectedSet.id, title);
    }
  };

  const handleCreateSet = () => {
    const n = newSetName.trim();
    if (!n) return;
    const newId = props.onAddSet(n);
    const taskTitles = parseTaskLines(newSetTaskLines);
    setNewSetName("");
    setNewSetTaskLines("");
    if (newId) {
      setSelectedSetId(newId);
      setTab("manage");
      for (const title of taskTitles) {
        props.onAddItemToSet(newId, title);
      }
    }
  };

  useEffect(() => {
    if (!selectedSet) {
      setManageSetName("");
      setOrderedItemIds([]);
      return;
    }
    setManageSetName(selectedSet.name);
    setOrderedItemIds(sortTemplateItems(selectedSet.items).map((i) => i.id));
  }, [selectedSet?.id, selectedSet?.items, selectedSet?.name]);

  const handleItemDragEnd = (event: DragEndEvent) => {
    if (!selectedSet) return;
    const { active, over } = event;
    if (!over) return;
    const a = String(active.id);
    const b = String(over.id);
    if (a === b) return;
    setOrderedItemIds((prev) => {
      const current = prev.length
        ? prev.filter((x) => itemIdSet.has(x))
        : previewItems.map((i) => i.id);
      const oldIndex = current.indexOf(a);
      const newIndex = current.indexOf(b);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return current;
      const next = arrayMove(current, oldIndex, newIndex);
      props.onReorderItemsInSet(selectedSet.id, next);
      return next;
    });
  };

  const canAddFromSet = Boolean(selectedSet && previewItems.length > 0);

  return (
    <SmallModal
      title="テンプレから追加"
      isOpen={props.isOpen}
      onClose={props.onClose}
    >
      <div className="space-y-3">
        <div className="flex gap-1 rounded border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            className={[
              "flex-1 rounded px-2 py-1.5 text-xs font-semibold",
              tab === "add" ? "bg-white text-orange-700 shadow-sm" : "text-gray-600 hover:text-gray-900",
            ].join(" ")}
            onClick={() => setTab("add")}
          >
            タスクを追加
          </button>
          <button
            type="button"
            className={[
              "flex-1 rounded px-2 py-1.5 text-xs font-semibold",
              tab === "manage" ? "bg-white text-orange-700 shadow-sm" : "text-gray-600 hover:text-gray-900",
            ].join(" ")}
            onClick={() => setTab("manage")}
          >
            テンプレ管理
          </button>
        </div>

        {tab === "add" ? (
          <>
            <div className="text-xs text-gray-600">
              テンプレを選ぶと、その中のタスクをすべて追加します。
            </div>

            <div className="max-h-[200px] overflow-auto rounded border border-gray-200">
              {sets.length === 0 ? (
                <div className="p-3 text-sm text-gray-600">
                  セットがありません。「セット管理」で作成してください。
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {sets.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-2 p-2 hover:bg-gray-50">
                        <input
                          type="radio"
                          name="template-set"
                          checked={selectedSetId === s.id}
                          onChange={() => setSelectedSetId(s.id)}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                          {s.name}
                        </span>
                        <span className="shrink-0 text-xs text-gray-500">
                          {s.items.length}件
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedSet ? (
              <div className="rounded border border-gray-200 bg-gray-50 p-2">
                <div className="mb-1 text-xs font-semibold text-gray-700">含まれるタスク</div>
                {previewItems.length === 0 ? (
                  <div className="text-xs text-gray-500">タスクが登録されていません。</div>
                ) : (
                  <ol className="list-decimal space-y-0.5 pl-4 text-sm text-gray-800">
                    {previewItems.map((item) => (
                      <li key={item.id} className="truncate">
                        {item.title}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-9 rounded border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50"
                onClick={props.onClose}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="h-9 rounded bg-orange-700 px-3 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50"
                disabled={!canAddFromSet}
                onClick={() => {
                  if (!selectedSetId) return;
                  props.onAddFromSet(selectedSetId);
                  props.onClose();
                }}
              >
                追加
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2 rounded border border-gray-200 bg-gray-50 p-2">
              <div className="text-xs font-semibold text-gray-700">新しいテンプレを作成</div>
              <input
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                aria-label="新しいテンプレ名"
                className="h-8 w-full min-w-0 rounded border border-gray-300 bg-white px-2 text-sm"
                placeholder="例: A用 / B用"
              />
              <div>
                <div className="mb-1 text-xs text-gray-600">
                  タスク（任意・1行に1件。作成後も続けて登録できます）
                </div>
                <textarea
                  value={newSetTaskLines}
                  onChange={(e) => setNewSetTaskLines(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  placeholder={"例:\nDir確認\nSTGアップ"}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="h-8 rounded bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    onClick={handleCreateSet}
                    disabled={!newSetName.trim()}
                  >
                    作成
                  </button>
                </div>
              </div>
            </div>

            {sets.length === 0 ? (
              <div className="text-sm text-gray-600">テンプレを作成してください。</div>
            ) : (
              <>
                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-700">編集するテンプレを選択</div>
                  <select
                    value={selectedSetId}
                    onChange={(e) => setSelectedSetId(e.target.value)}
                    aria-label="編集するテンプレを選択"
                    className="h-9 w-full rounded border border-gray-300 bg-white px-2 text-sm"
                  >
                    {sets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedSet ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold text-gray-700">選択中のテンプレ名を編集</div>
                      <div className="flex items-center gap-2">
                        <input
                          value={manageSetName}
                          onChange={(e) => setManageSetName(e.target.value)}
                          aria-label="選択中のテンプレ名"
                          className="h-8 w-full min-w-0 rounded border border-gray-300 bg-white px-2 text-sm"
                        />
                        <button
                          type="button"
                          className="h-8 shrink-0 rounded border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50 disabled:opacity-50"
                          disabled={
                            !manageSetName.trim() ||
                            manageSetName.trim() === selectedSet.name
                          }
                          onClick={() => {
                            const n = manageSetName.trim();
                            if (!n) return;
                            props.onRenameSet(selectedSet.id, n);
                          }}
                        >
                          保存
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-xs text-gray-600">
                        ⋮⋮ をドラッグしてタスクの順番を入れ替えられます。
                      </div>
                      <div className="max-h-[160px] overflow-auto rounded border border-gray-200">
                        {orderedManageItems.length === 0 ? (
                          <div className="p-3 text-sm text-gray-600">タスクがありません。</div>
                        ) : (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleItemDragEnd}
                          >
                            <SortableContext
                              items={orderedManageItems.map((i) => i.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              <ul className="divide-y divide-gray-100">
                                {orderedManageItems.map((item) => (
                                  <SortableSetItemRow
                                    key={item.id}
                                    item={item}
                                    onDelete={() => {
                                      if (
                                        !window.confirm(
                                          `「${item.title}」をセットから削除しますか？`,
                                        )
                                      ) {
                                        return;
                                      }
                                      props.onRemoveItemFromSet(selectedSet.id, item.id);
                                      setOrderedItemIds((prev) =>
                                        prev.filter((x) => x !== item.id),
                                      );
                                    }}
                                  />
                                ))}
                              </ul>
                            </SortableContext>
                          </DndContext>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 rounded border border-gray-200 bg-gray-50 p-2">
                      <div className="text-xs font-semibold text-gray-700">タスクを登録</div>
                      <div className="flex items-center gap-2">
                        <input
                          value={newItemTitle}
                          onChange={(e) => setNewItemTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && newItemTitle.trim()) {
                              e.preventDefault();
                              addItemsToSelectedSet([newItemTitle.trim()]);
                              setNewItemTitle("");
                            }
                          }}
                          className="h-8 w-full min-w-0 rounded border border-gray-300 bg-white px-2 text-sm"
                          placeholder="例: Dir確認（Enterで追加）"
                        />
                        <button
                          type="button"
                          className="h-8 shrink-0 rounded bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          onClick={() => {
                            const t = newItemTitle.trim();
                            if (!t) return;
                            addItemsToSelectedSet([t]);
                            setNewItemTitle("");
                          }}
                          disabled={!newItemTitle.trim()}
                        >
                          追加
                        </button>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-gray-600">
                          複数まとめて（1行に1件）
                        </div>
                        <textarea
                          value={bulkItemLines}
                          onChange={(e) => setBulkItemLines(e.target.value)}
                          rows={3}
                          className="w-full resize-y rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                          placeholder={"例:\nDir確認\nSTGアップ"}
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            className="h-8 rounded bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            onClick={() => {
                              const titles = parseTaskLines(bulkItemLines);
                              if (titles.length === 0) return;
                              addItemsToSelectedSet(titles);
                              setBulkItemLines("");
                            }}
                            disabled={!bulkItemLines.trim()}
                          >
                            一括追加
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `セット「${selectedSet.name}」を削除しますか？`,
                            )
                          ) {
                            return;
                          }
                          const deletedId = selectedSet.id;
                          props.onDeleteSet(deletedId);
                          const remaining = sets.filter((s) => s.id !== deletedId);
                          setSelectedSetId(remaining[0]?.id ?? "");
                        }}
                      >
                        このテンプレを削除
                      </button>
                    </div>
                  </>
                ) : null}
              </>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                className="h-9 rounded border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50"
                onClick={props.onClose}
              >
                閉じる
              </button>
            </div>
          </>
        )}
      </div>
    </SmallModal>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { BOARD_ORDER, resolveBoardLabel } from "@/lib/boardConfig";
import {
  addNewBacklogWithTask,
  addTaskToExistingBacklog,
  backlogOptionValue,
  parseBacklogOptionValue,
} from "@/lib/chat/boardOps";
import {
  collectDailyTasks,
  incompleteDailyTasks,
  type DailyTaskView,
} from "@/lib/chat/dailyTasks";
import {
  activeProgressFromTask,
  patchesForIncompleteDailyTasks,
  PROGRESS_OPTIONS,
  type ProgressPercent,
} from "@/lib/chat/progress";
import {
  DAILY_PROGRESS_SLOTS,
  defaultSlotForNow,
  slotLabel,
  type DailyProgressSlot,
} from "@/lib/dailyProgressSlot";
import { isSlotCompleted, slotCompletedAt } from "@/lib/dailyCheckin";
import { setDailyCheckinSlotComplete } from "@/lib/firebase/dailyCheckinRepository";
import { useDailyCheckins } from "@/hooks/useDailyCheckins";
import { getJstIsoDate } from "@/lib/jstDate";
import type { BoardId, ProductBacklogItem, Task, TaskPatch } from "@/lib/types";

const ASSIGNEE_STORAGE_KEY = "daily-progress-assignee";

function formatCompletedAtJst(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
      month: "numeric",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type DailyProgressPanelProps = {
  tasks: Task[];
  productBacklogByBoard: Record<BoardId, ProductBacklogItem[]>;
  boardLabelsByBoard: Record<BoardId, string>;
  assigneeCandidates: string[];
  initialAssignee?: string;
  initialSlot?: DailyProgressSlot;
  onUpdateTask: (taskId: string, patch: TaskPatch) => void;
};

function groupTasksByBoard(tasks: Task[]): Record<BoardId, Task[]> {
  const out = {} as Record<BoardId, Task[]>;
  for (const boardId of BOARD_ORDER) out[boardId] = [];
  for (const task of tasks) {
    if (!out[task.boardId]) out[task.boardId] = [];
    out[task.boardId].push(task);
  }
  return out;
}

function syncSlotToUrl(slot: DailyProgressSlot) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "dailyProgress");
  url.searchParams.set("slot", slot);
  window.history.replaceState({}, "", url.toString());
}

export function DailyProgressPanel({
  tasks,
  productBacklogByBoard,
  boardLabelsByBoard,
  assigneeCandidates,
  initialAssignee,
  initialSlot,
  onUpdateTask,
}: DailyProgressPanelProps) {
  const dateIso = getJstIsoDate();
  const { byAssignee: checkinsByAssignee } = useDailyCheckins(dateIso);
  const [slot, setSlot] = useState<DailyProgressSlot>(
    () => initialSlot ?? defaultSlotForNow(),
  );
  const [assigneeName, setAssigneeName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [existingBacklogValue, setExistingBacklogValue] = useState("");
  const [existingTaskTitle, setExistingTaskTitle] = useState("");
  const [newBoardId, setNewBoardId] = useState<BoardId>("ad_hoc");
  const [newBacklogTitle, setNewBacklogTitle] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  /** 進捗ボタンの下書き（申告完了でボードへ反映） */
  const [draftProgress, setDraftProgress] = useState<
    Record<string, ProgressPercent>
  >({});

  useEffect(() => {
    if (initialSlot) setSlot(initialSlot);
  }, [initialSlot]);

  useEffect(() => {
    syncSlotToUrl(slot);
  }, [slot]);

  useEffect(() => {
    if (initialAssignee?.trim()) {
      setAssigneeName(initialAssignee.trim());
      return;
    }
    try {
      const saved = localStorage.getItem(ASSIGNEE_STORAGE_KEY)?.trim() ?? "";
      if (saved) setAssigneeName(saved);
    } catch {
      // ignore
    }
  }, [initialAssignee]);

  useEffect(() => {
    if (!assigneeName.trim()) return;
    try {
      localStorage.setItem(ASSIGNEE_STORAGE_KEY, assigneeName.trim());
    } catch {
      // ignore
    }
  }, [assigneeName]);

  useEffect(() => {
    setDraftProgress({});
  }, [assigneeName, dateIso, slot]);

  const allDailyTasks = useMemo(() => {
    if (!assigneeName.trim()) return [] as DailyTaskView[];
    return collectDailyTasks({
      tasksByBoard: groupTasksByBoard(tasks),
      backlogByBoard: productBacklogByBoard,
      assigneeName: assigneeName.trim(),
      dateIso,
    });
  }, [tasks, productBacklogByBoard, assigneeName, dateIso]);

  const displayedTasks = useMemo(() => {
    if (slot === "midday") return incompleteDailyTasks(allDailyTasks);
    return allDailyTasks;
  }, [allDailyTasks, slot]);

  const showAddTasks = slot === "midday" || slot === "evening";

  const backlogOptions = useMemo(() => {
    const out: { value: string; label: string; boardId: BoardId }[] = [];
    for (const boardId of BOARD_ORDER) {
      for (const item of productBacklogByBoard[boardId] ?? []) {
        out.push({
          value: backlogOptionValue(boardId, item.id),
          label: item.title || "(無題)",
          boardId,
        });
      }
    }
    return out;
  }, [productBacklogByBoard]);

  const backlogOptionsByBoard = useMemo(() => {
    return BOARD_ORDER.map((boardId) => ({
      boardId,
      label: resolveBoardLabel(boardId, boardLabelsByBoard),
      options: backlogOptions.filter((o) => o.boardId === boardId),
    })).filter((group) => group.options.length > 0);
  }, [backlogOptions, boardLabelsByBoard]);

  useEffect(() => {
    if (
      backlogOptions.length > 0 &&
      !backlogOptions.some((o) => o.value === existingBacklogValue)
    ) {
      setExistingBacklogValue(backlogOptions[0].value);
    }
  }, [backlogOptions, existingBacklogValue]);

  const setProgress = useCallback((view: DailyTaskView, progress: ProgressPercent) => {
    setDraftProgress((prev) => ({ ...prev, [view.task.id]: progress }));
    setError(null);
  }, []);

  const runAsync = useCallback((fn: () => Promise<void>) => {
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          await fn();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })();
    });
  }, []);

  const handleAddExisting = () => {
    const name = assigneeName.trim();
    if (!name) {
      setError("担当者を選択してください。");
      return;
    }
    const parsed = parseBacklogOptionValue(existingBacklogValue);
    if (!parsed) {
      setError("Backlog を選択してください。");
      return;
    }
    runAsync(async () => {
      const result = await addTaskToExistingBacklog({
        boardId: parsed.boardId,
        parentIssueId: parsed.parentIssueId,
        title: existingTaskTitle,
        assigneeName: name,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setExistingTaskTitle("");
      setNotice(`タスクを追加しました: ${result.task.title}`);
    });
  };

  const handleAddNew = () => {
    const name = assigneeName.trim();
    if (!name) {
      setError("担当者を選択してください。");
      return;
    }
    runAsync(async () => {
      const result = await addNewBacklogWithTask({
        boardId: newBoardId,
        backlogTitle: newBacklogTitle,
        taskTitle: newTaskTitle,
        assigneeName: name,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setNewBacklogTitle("");
      setNewTaskTitle("");
      const boardLabel = resolveBoardLabel(newBoardId, boardLabelsByBoard);
      setNotice(
        `新規 Backlog とタスクを追加しました（${boardLabel}）: ${result.task.title}`,
      );
    });
  };

  const myCheckin = assigneeName.trim()
    ? checkinsByAssignee[assigneeName.trim()]
    : undefined;
  const currentSlotDone = isSlotCompleted(myCheckin, slot);
  const currentSlotAt = slotCompletedAt(myCheckin, slot);

  const handleToggleCheckin = (completed: boolean) => {
    const name = assigneeName.trim();
    if (!name) {
      setError("担当者を選択してください。");
      return;
    }
    runAsync(async () => {
      if (completed) {
        const patches = patchesForIncompleteDailyTasks(
          allDailyTasks,
          draftProgress,
        );
        for (const { taskId, patch } of patches) {
          onUpdateTask(taskId, patch);
        }
        setDraftProgress({});
      }

      await setDailyCheckinSlotComplete({
        dateIso,
        assigneeName: name,
        slot,
        completed,
      });
    });
  };

  const incompleteCount = allDailyTasks.filter(
    (v) => v.task.lane !== "done",
  ).length;
  const slotMeta = DAILY_PROGRESS_SLOTS.find((s) => s.id === slot);

  const summaryMembers = useMemo(() => {
    const names = new Set<string>(assigneeCandidates);
    for (const name of Object.keys(checkinsByAssignee)) names.add(name);
    return [...names].sort((a, b) => a.localeCompare(b, "ja"));
  }, [assigneeCandidates, checkinsByAssignee]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-4">
      <header className="space-y-1">
        <h2 className="text-lg font-bold text-gray-900">今日の進捗</h2>
        <p className="text-sm text-gray-600">
          {dateIso}の担当タスクを回答し、ボードのレーンを更新します。
        </p>
      </header>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-800">
          メンバー別・申告状況（{dateIso}）
        </h3>
        {summaryMembers.length === 0 ? (
          <p className="text-sm text-gray-500">
            担当者ディレクトリにメンバーがいません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-600">
                  <th className="px-2 py-1.5 font-semibold">担当者</th>
                  {DAILY_PROGRESS_SLOTS.map((s) => (
                    <th key={s.id} className="px-2 py-1.5 text-center font-semibold">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaryMembers.map((name) => {
                  const record = checkinsByAssignee[name];
                  const isMe = name === assigneeName.trim();
                  return (
                    <tr
                      key={name}
                      className={[
                        "border-b border-gray-100",
                        isMe ? "bg-teal-50/80" : "",
                      ].join(" ")}
                    >
                      <td className="px-2 py-1.5 font-medium text-gray-900">
                        {name}
                        {isMe ? (
                          <span className="ml-1 text-xs text-teal-700">（自分）</span>
                        ) : null}
                      </td>
                      {DAILY_PROGRESS_SLOTS.map((s) => {
                        const done = isSlotCompleted(record, s.id);
                        const at = slotCompletedAt(record, s.id);
                        return (
                          <td
                            key={s.id}
                            className="px-2 py-1.5 text-center tabular-nums"
                            title={at ? formatCompletedAtJst(at) : "未申告"}
                          >
                            {done ? (
                              <span className="font-semibold text-emerald-700">済</span>
                            ) : (
                              <span className="text-gray-400">未</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <nav
        className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1"
        aria-label="時間帯"
      >
            {DAILY_PROGRESS_SLOTS.map((s) => {
          const active = slot === s.id;
          const mineDone =
            assigneeName.trim() &&
            isSlotCompleted(checkinsByAssignee[assigneeName.trim()], s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSlot(s.id)}
              className={[
                "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none",
                active
                  ? "bg-teal-700 text-white shadow-sm"
                  : "bg-white text-gray-900 hover:bg-gray-100",
              ].join(" ")}
              aria-current={active ? "page" : undefined}
            >
              {s.label}
              {mineDone ? " ✓" : ""}
            </button>
          );
        })}
      </nav>
      {slotMeta ? (
        <p className="text-xs text-gray-500">{slotMeta.hint}</p>
      ) : null}

      <section className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block text-xs font-semibold text-gray-700">
          担当者（自分）
          <select
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={assigneeName}
            onChange={(e) => setAssigneeName(e.target.value)}
          >
            <option value="">選択してください</option>
            {assigneeCandidates.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {assigneeName ? (
          <p className="text-xs text-gray-500">
            当日タスク {allDailyTasks.length} 件（未完了 {incompleteCount} 件）
            {slot === "midday"
              ? ` · 表示中 ${displayedTasks.length} 件（未完了のみ）`
              : null}
          </p>
        ) : null}
      </section>

      {notice ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-gray-800">
          {slot === "midday" ? "未完了の当日タスク" : "当日タスク"}
        </h3>
        {!assigneeName.trim() ? (
          <p className="text-sm text-gray-500">担当者を選ぶと一覧が表示されます。</p>
        ) : displayedTasks.length === 0 ? (
          <p className="text-sm text-gray-500">
            {slot === "midday"
              ? "未完了の当日タスクはありません。"
              : "条件に合う当日タスクはありません（担当・着手日〜期限に当日を含む）。"}
          </p>
        ) : (
          <ul className="space-y-3">
            {displayedTasks.map((view) => {
              const activeProgress =
                draftProgress[view.task.id] ??
                activeProgressFromTask(view.task);
              return (
              <li
                key={`${view.boardId}:${view.task.id}`}
                className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
              >
                <div className="mb-2">
                  <p className="font-semibold text-gray-900">
                    {view.task.title || "(無題)"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {view.backlogTitle} · {resolveBoardLabel(view.boardId, boardLabelsByBoard)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PROGRESS_OPTIONS.map((opt) => {
                    const isActive = activeProgress === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={pending}
                        onClick={() => setProgress(view, opt.value)}
                        aria-pressed={isActive}
                        className={[
                          "rounded border px-2.5 py-1 text-xs font-semibold disabled:opacity-50",
                          isActive
                            ? "border-teal-700 bg-teal-700 text-white"
                            : "border-gray-300 bg-gray-50 text-gray-800 hover:bg-gray-100",
                        ].join(" ")}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      {showAddTasks ? (
        <>
          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800">
              追加タスク（既存 Backlog）
            </h3>
            <select
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={existingBacklogValue}
              onChange={(e) => setExistingBacklogValue(e.target.value)}
            >
              {backlogOptionsByBoard.length === 0 ? (
                <option value="">（Backlog なし）</option>
              ) : (
                backlogOptionsByBoard.map((group) => (
                  <optgroup key={group.boardId} label={group.label}>
                    {group.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ))
              )}
            </select>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={existingTaskTitle}
                onChange={(e) => setExistingTaskTitle(e.target.value)}
                placeholder="タスク名"
                className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={pending}
                onClick={handleAddExisting}
                className="rounded bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
              >
                既存に追加
              </button>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800">
              追加タスク（新規 Backlog）
            </h3>
            <label className="block text-xs font-semibold text-gray-700">
              ボード
              <select
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm font-normal"
                value={newBoardId}
                onChange={(e) => setNewBoardId(e.target.value as BoardId)}
              >
                {BOARD_ORDER.map((boardId) => (
                  <option key={boardId} value={boardId}>
                    {resolveBoardLabel(boardId, boardLabelsByBoard)}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="text"
              value={newBacklogTitle}
              onChange={(e) => setNewBacklogTitle(e.target.value)}
              placeholder="Backlog 名"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="タスク名"
                className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={pending}
                onClick={handleAddNew}
                className="rounded bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
              >
                新規追加
              </button>
            </div>
          </section>
        </>
      ) : null}

      <section className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/60 p-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-800">
          【{slotLabel(slot)}】の申告完了
        </h3>
        {currentSlotDone && currentSlotAt ? (
          <p className="text-sm text-teal-900">
            申告済み（{formatCompletedAtJst(currentSlotAt)}）
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            進捗を選び終えたら「完了」を押してください。未完了タスクの状態がボードに反映され、チーム一覧にも記録されます。
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!currentSlotDone ? (
            <button
              type="button"
              disabled={pending || !assigneeName.trim()}
              onClick={() => handleToggleCheckin(true)}
              className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              完了
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || !assigneeName.trim()}
              onClick={() => handleToggleCheckin(false)}
              className="rounded border border-gray-400 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              完了を取り消す
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

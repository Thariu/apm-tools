"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasBackground } from "@/components/canvas/CanvasBackground";
import { BurndownPanel } from "@/components/charts/BurndownPanel";
import { ReleaseBurnupPanel } from "@/components/charts/ReleaseBurnupPanel";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskCard } from "@/components/kanban/TaskCard";
import { SprintGoalsRow } from "@/components/schedule/SprintGoalsRow";
import { WeekdayAssignRow } from "@/components/schedule/WeekdayAssignRow";
import { RetrospectivePanel } from "@/components/retro/RetrospectivePanel";
import { MemberTaskSchedulePanel } from "@/components/member/MemberTaskSchedulePanel";
import { DailyProgressPanel } from "@/components/daily/DailyProgressPanel";
import { usePlanningData } from "@/hooks/usePlanningData";
import { sortTasksByOrder } from "@/lib/taskOrder";
import { resolveLaneContainer } from "@/lib/taskOrder";
import { computeGroupDragPreview } from "@/lib/taskOrder";
import { parseSwimlaneDragId } from "@/lib/swimlaneDnD";
import { buildStandardBusinessDayIsos } from "@/lib/businessDays";
import {
  buildBurndownData,
  countTodoDoing,
  formatBusinessDayRange,
  getNextSprintTuesdayIso,
  isWithinBusinessDayPeriod,
  normalizeBusinessDayIsos,
} from "@/lib/burndown";
import { getJstIsoDate } from "@/lib/jstDate";
import type { BurndownSprintState } from "@/lib/burndownSprintStorage";
import { defaultReleaseBurnupBoardState } from "@/lib/planningDefaults";
import {
  buildReleaseBurnupChartData,
  computeCompletedBacklogPoints,
  getPreviousSprintTuesdayIso,
  getResolvedBacklogItems,
  getSprintIndex,
  trimFinalizedSprints,
  willAllBoardsFinalizeSprint,
} from "@/lib/releaseBurnup";
import type { AppView, BoardId, Task, TaskLane, WeekdayKey } from "@/lib/types";
import type { DailyProgressSlot } from "@/lib/dailyProgressSlot";

const TASK_LANES: TaskLane[] = ["todo", "doing", "done", "cant"];

function isEditableTargetFocused(): boolean {
  const el = document.activeElement;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return true;
  }
  return el?.getAttribute("contenteditable") === "true";
}

type PlanningCanvasProps = {
  activeBoardId: BoardId;
  activeView: AppView;
  activeBoardIds: BoardId[];
  boardLabelsByBoard: Record<BoardId, string>;
  initialDailyAssignee?: string;
  initialDailySlot?: DailyProgressSlot;
  onActiveSprintLabelChange?: (label: string) => void;
};

export function PlanningCanvas({
  activeBoardId,
  activeView,
  activeBoardIds,
  boardLabelsByBoard,
  initialDailyAssignee,
  initialDailySlot,
  onActiveSprintLabelChange,
}: PlanningCanvasProps) {
  const {
    status,
    errorMessage,
    tasks,
    productBacklogByBoard,
    schedulesByBoard,
    sprintGoalsByBoard,
    burndownSnapshotsByBoard,
    releaseBurnupByBoard,
    burndownSprint,
    persistBurndownSnapshot,
    assigneeCandidates,
    goalTextCandidates,
    taskTemplateSets,
    assigneeColorByName,
    setAssigneeColorForName,
    addAssigneeCandidate,
    deleteAssigneeCandidate,
    renameAssigneeCandidate,
    addGoalTextCandidate,
    deleteGoalTextCandidate,
    addTaskTemplateSetEntry,
    removeTaskTemplateSetEntry,
    addItemToTaskTemplateSet,
    removeItemFromTaskTemplateSet,
    reorderItemsInTaskTemplateSet,
    renameTaskTemplateSet,
    updateTask,
    addTask,
    addTasksFromTemplateSet,
    duplicateTask,
    removeTask,
    beginTaskDrag,
    repositionTaskDuringDrag,
    repositionTasksDuringDrag,
    finalizeTaskReposition,
    finalizeTasksReposition,
    cancelTaskDrag,
    addProductBacklog,
    updateProductBacklog,
    duplicateSwimlane,
    removeSwimlane,
    reorderBacklog,
    updateSchedule,
    updateSprintGoal,
    saveBurndownSprintState,
    saveReleaseBurnup,
  } = usePlanningData();

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectionAnchorByLane, setSelectionAnchorByLane] = useState<
    Partial<Record<TaskLane, string>>
  >({});
  const draggingTaskIdsRef = useRef<string[] | null>(null);
  const [groupDraggingIds, setGroupDraggingIds] = useState<string[] | null>(null);
  const [groupDragPreview, setGroupDragPreview] = useState<{
    container: { parentIssueId: string; lane: TaskLane };
    insertIndex: number;
    count: number;
  } | null>(null);

  const productBacklog = useMemo(
    () => productBacklogByBoard[activeBoardId] ?? [],
    [productBacklogByBoard, activeBoardId],
  );
  const schedule = schedulesByBoard[activeBoardId] ?? {
    tuesday: "",
    wednesday: "",
    thursday: "",
    friday: "",
    monday: "",
  };

  const boardTasks = useMemo(
    () => tasks.filter((t) => t.boardId === activeBoardId),
    [tasks, activeBoardId],
  );

  const effectiveSelectedTaskIds = useMemo(() => {
    if (selectedTaskIds.length === 0) return selectedTaskIds;
    const existing = new Set(boardTasks.map((t) => t.id));
    return selectedTaskIds.filter((id) => existing.has(id));
  }, [boardTasks, selectedTaskIds]);

  const selectedTaskIdSet = useMemo(
    () => new Set(effectiveSelectedTaskIds),
    [effectiveSelectedTaskIds],
  );

  const orderedIdsByLane = useMemo(() => {
    const byLane: Record<TaskLane, string[]> = {
      todo: [],
      doing: [],
      done: [],
      cant: [],
    };
    const tasksByParent = new Map<string, Task[]>();
    for (const t of boardTasks) {
      const arr = tasksByParent.get(t.parentIssueId) ?? [];
      arr.push(t);
      tasksByParent.set(t.parentIssueId, arr);
    }

    for (const item of productBacklog) {
      const rowTasks = tasksByParent.get(item.id) ?? [];
      for (const lane of TASK_LANES) {
        const laneTasks = sortTasksByOrder(rowTasks.filter((t) => t.lane === lane));
        byLane[lane].push(...laneTasks.map((t) => t.id));
      }
    }

    return byLane;
  }, [boardTasks, productBacklog]);

  const orderedSelectedTaskIds = useMemo(() => {
    const result: string[] = [];
    for (const lane of TASK_LANES) {
      for (const id of orderedIdsByLane[lane]) {
        if (selectedTaskIdSet.has(id)) result.push(id);
      }
    }
    return result;
  }, [orderedIdsByLane, selectedTaskIdSet]);

  const handleSelectTask = useCallback(
    (params: {
      taskId: string;
      lane: TaskLane;
      ctrlOrMeta: boolean;
      shift: boolean;
    }) => {
      const { taskId, lane, ctrlOrMeta, shift } = params;
      const anchor = selectionAnchorByLane[lane];

      setSelectedTaskIds((prev) => {
        const prevSet = new Set(prev);
        const ordered = orderedIdsByLane[lane];

        const selectSingle = () => [taskId];
        const toggleOne = () => {
          if (prevSet.has(taskId)) prevSet.delete(taskId);
          else prevSet.add(taskId);
          return Array.from(prevSet);
        };

        if (shift && anchor) {
          const a = ordered.indexOf(anchor);
          const b = ordered.indexOf(taskId);
          if (a !== -1 && b !== -1) {
            const [from, to] = a < b ? [a, b] : [b, a];
            const rangeIds = ordered.slice(from, to + 1);
            if (ctrlOrMeta) {
              // Ctrl+Shift: 既存選択に範囲を追加
              for (const id of rangeIds) prevSet.add(id);
              return Array.from(prevSet);
            }
            // Shift: 範囲で置き換え
            return rangeIds;
          }
          // フォールバック（anchor が見つからない等）
          return ctrlOrMeta ? toggleOne() : selectSingle();
        }

        if (ctrlOrMeta) return toggleOne();
        return selectSingle();
      });

      setSelectionAnchorByLane((prev) => ({ ...prev, [lane]: taskId }));
    },
    [orderedIdsByLane, selectionAnchorByLane],
  );

  const clearSelection = useCallback(() => {
    setSelectedTaskIds([]);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeView !== "planning") return;
      if (orderedSelectedTaskIds.length === 0) return;
      if (isEditableTargetFocused()) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        for (const id of orderedSelectedTaskIds) {
          duplicateTask(id);
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        for (const id of orderedSelectedTaskIds) {
          removeTask(id);
        }
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeView,
    orderedSelectedTaskIds,
    duplicateTask,
    removeTask,
    clearSelection,
  ]);

  const boardSnapshots = burndownSnapshotsByBoard[activeBoardId] ?? {};
  const { activeSprintTuesdayIso, businessDayIsos } = burndownSprint;

  const activeSprintLabel = useMemo(
    () => formatBusinessDayRange(businessDayIsos),
    [businessDayIsos],
  );

  useEffect(() => {
    if (activeSprintLabel) {
      onActiveSprintLabelChange?.(activeSprintLabel);
    }
  }, [activeSprintLabel, onActiveSprintLabelChange]);

  const burndownData = useMemo(
    () =>
      buildBurndownData(
        boardTasks,
        boardSnapshots,
        businessDayIsos,
        new Date(),
      ),
    [boardTasks, boardSnapshots, businessDayIsos],
  );

  const currentWip = countTodoDoing(boardTasks);

  const releaseBurnupState =
    releaseBurnupByBoard[activeBoardId] ?? defaultReleaseBurnupBoardState();

  const sprintToFinalizeTuesdayIso = getPreviousSprintTuesdayIso(new Date());
  const sprintToFinalizeIndex = getSprintIndex(
    sprintToFinalizeTuesdayIso,
    releaseBurnupState.releaseStartTuesdayIso,
  );

  const burnupChartData = useMemo(
    () =>
      buildReleaseBurnupChartData(releaseBurnupState.finalizedSprints, {
        currentSprintIndex: sprintToFinalizeIndex,
      }),
    [releaseBurnupState.finalizedSprints, sprintToFinalizeIndex],
  );
  const draftBurnupPoints = useMemo(
    () => computeCompletedBacklogPoints(productBacklog, boardTasks),
    [productBacklog, boardTasks],
  );
  const resolvedBacklogItems = useMemo(
    () => getResolvedBacklogItems(productBacklog, boardTasks),
    [productBacklog, boardTasks],
  );
  const isSprintAlreadyFinalized = releaseBurnupState.finalizedSprints.some(
    (s) => s.sprintTuesdayIso === sprintToFinalizeTuesdayIso,
  );

  const todayIso = getJstIsoDate();
  const isWithinSprintBusinessDays = isWithinBusinessDayPeriod(
    todayIso,
    businessDayIsos,
  );
  const finalizeDisabledReason =
    "営業日期間中は確定できません。最終営業日の翌日以降に操作してください。";

  const handleFinalizeSprintBurnup = useCallback(() => {
    if (isWithinBusinessDayPeriod(todayIso, businessDayIsos)) return;
    const points = computeCompletedBacklogPoints(productBacklog, boardTasks);

    const finalizedByBoard = Object.fromEntries(
      activeBoardIds.map((boardId) => [
        boardId,
        releaseBurnupByBoard[boardId]?.finalizedSprints ?? [],
      ]),
    ) as Record<BoardId, typeof releaseBurnupState.finalizedSprints>;

    const willAdvanceBurndown =
      !isSprintAlreadyFinalized &&
      willAllBoardsFinalizeSprint(
        finalizedByBoard,
        activeBoardId,
        sprintToFinalizeTuesdayIso,
        activeBoardIds,
      );

    const burndownAdvanceNote = isSprintAlreadyFinalized
      ? ""
      : willAdvanceBurndown
        ? "\n\nバーンダウンチャートは次のスプリント週に進みます。"
        : "\n\n他ボードも確定後に、営業日が次週に進みます。";
    const message = `Sprint${sprintToFinalizeIndex}（${sprintToFinalizeTuesdayIso} 週）を ${points}P で確定しますか？\n\nDone/Can't 完了の親Backlogポイントを集計します。${burndownAdvanceNote}`;
    if (!window.confirm(message)) return;

    const nextSprintTuesdayIso = getNextSprintTuesdayIso(
      sprintToFinalizeTuesdayIso,
    );

    const board =
      releaseBurnupByBoard[activeBoardId] ?? defaultReleaseBurnupBoardState();
    const withoutDuplicate = board.finalizedSprints.filter(
      (s) => s.sprintTuesdayIso !== sprintToFinalizeTuesdayIso,
    );
    const nextBoardState = {
      ...board,
      finalizedSprints: trimFinalizedSprints([
        ...withoutDuplicate,
        {
          sprintTuesdayIso: sprintToFinalizeTuesdayIso,
          sprintIndex: sprintToFinalizeIndex,
          pointsCompleted: points,
          finalizedAt: new Date().toISOString(),
        },
      ]),
    };
    saveReleaseBurnup(activeBoardId, nextBoardState);

    if (willAdvanceBurndown) {
      const nextSprint: BurndownSprintState = {
        activeSprintTuesdayIso: nextSprintTuesdayIso,
        businessDayIsos: buildStandardBusinessDayIsos(),
      };
      saveBurndownSprintState(nextSprint);
    }
  }, [
    activeBoardId,
    activeBoardIds,
    boardTasks,
    businessDayIsos,
    isSprintAlreadyFinalized,
    productBacklog,
    releaseBurnupByBoard,
    saveBurndownSprintState,
    saveReleaseBurnup,
    sprintToFinalizeIndex,
    sprintToFinalizeTuesdayIso,
    todayIso,
  ]);

  const updateBurndownSprint = useCallback(
    (patch: Partial<{
      activeSprintTuesdayIso: string;
      businessDayIsos: string[];
    }>) => {
      const next: BurndownSprintState = {
        activeSprintTuesdayIso:
          patch.activeSprintTuesdayIso ?? burndownSprint.activeSprintTuesdayIso,
        businessDayIsos: normalizeBusinessDayIsos(
          patch.businessDayIsos ?? burndownSprint.businessDayIsos,
        ),
      };
      saveBurndownSprintState(next);
    },
    [burndownSprint, saveBurndownSprintState],
  );

  const handleBusinessDayIsosChange = useCallback(
    (isos: string[]) => {
      updateBurndownSprint({ businessDayIsos: isos });
    },
    [updateBurndownSprint],
  );

  const handleResetBusinessDays = useCallback(() => {
    updateBurndownSprint({
      businessDayIsos: buildStandardBusinessDayIsos(),
    });
  }, [updateBurndownSprint]);

  useEffect(() => {
    if (status !== "ready") return;
    const today = getJstIsoDate();
    if (!businessDayIsos.includes(today)) return;
    persistBurndownSnapshot(activeBoardId, today, currentWip);
  }, [
    activeBoardId,
    businessDayIsos,
    currentWip,
    persistBurndownSnapshot,
    status,
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
    // 途中挿入を安定させるため、まず「ポインタ直下の droppable」を優先する。
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return closestCorners(args);
  }, []);

  const activeTaskResolved = useMemo(
    () => tasks.find((t) => t.id === activeTask?.id) ?? activeTask,
    [tasks, activeTask],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeId = String(event.active.id);
      if (parseSwimlaneDragId(activeId)) {
        setActiveTask(null);
        return;
      }
      beginTaskDrag();
      const task = event.active.data.current?.task as Task | undefined;
      if (task) setActiveTask(task);

      // ドラッグ開始時に「まとめて動かす対象」を確定
      if (selectedTaskIdSet.has(activeId)) {
        draggingTaskIdsRef.current = orderedSelectedTaskIds;
        setGroupDraggingIds(orderedSelectedTaskIds);
        setGroupDragPreview(null);
      } else {
        // 未選択のタスクを掴んだ場合は単独選択に切り替える
        draggingTaskIdsRef.current = [activeId];
        setGroupDraggingIds(null);
        setSelectedTaskIds([activeId]);
        setSelectionAnchorByLane((prev) => ({ ...prev, [task?.lane ?? "todo"]: activeId }));
        setGroupDragPreview(null);
      }
    },
    [beginTaskDrag, orderedSelectedTaskIds, selectedTaskIdSet],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      if (parseSwimlaneDragId(activeId)) return;
      if (activeId === overId) return;
      const draggingIds = draggingTaskIdsRef.current;
      if (draggingIds && draggingIds.length > 1) {
        const preview = computeGroupDragPreview(boardTasks, draggingIds, overId);
        setGroupDragPreview((prev) => {
          const next = preview
            ? {
                container: preview.container,
                insertIndex: preview.insertIndex,
                count: draggingIds.length,
              }
            : null;
          if (!prev && !next) return prev;
          if (!prev || !next) return next;
          if (
            prev.count === next.count &&
            prev.insertIndex === next.insertIndex &&
            prev.container.lane === next.container.lane &&
            prev.container.parentIssueId === next.container.parentIssueId
          ) {
            return prev;
          }
          return next;
        });
      } else {
        setGroupDragPreview((prev) => (prev ? null : prev));
        repositionTaskDuringDrag(activeId, overId);
      }
    },
    [repositionTaskDuringDrag, tasks],
  );

  const handleDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      setActiveTask(null);
      draggingTaskIdsRef.current = null;
      setGroupDraggingIds(null);
      setGroupDragPreview(null);
      cancelTaskDrag();
    },
    [cancelTaskDrag],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTask(null);

      const activeId = String(active.id);
      const swimlaneActiveId = parseSwimlaneDragId(activeId);

      if (!over) {
        if (!swimlaneActiveId) cancelTaskDrag();
        setGroupDragPreview(null);
        setGroupDraggingIds(null);
        return;
      }

      const overId = String(over.id);

      if (swimlaneActiveId) {
        const swimlaneOverId = parseSwimlaneDragId(overId);
        if (!swimlaneOverId) return;
        reorderBacklog(activeBoardId, swimlaneActiveId, swimlaneOverId);
        setGroupDragPreview(null);
        setGroupDraggingIds(null);
        return;
      }

      if (!resolveLaneContainer(tasks, overId)) {
        cancelTaskDrag();
        setGroupDragPreview(null);
        setGroupDraggingIds(null);
        return;
      }

      const draggingIds = draggingTaskIdsRef.current;
      draggingTaskIdsRef.current = null;
      setGroupDragPreview(null);
      setGroupDraggingIds(null);
      if (draggingIds && draggingIds.length > 1) {
        finalizeTasksReposition(draggingIds, overId);
      } else {
        finalizeTaskReposition(activeId, overId);
      }
    },
    [
      activeBoardId,
      cancelTaskDrag,
      finalizeTaskReposition,
      finalizeTasksReposition,
      reorderBacklog,
      tasks,
    ],
  );

  const groupDraggingIdSet = useMemo(
    () => (groupDraggingIds ? new Set(groupDraggingIds) : null),
    [groupDraggingIds],
  );

  if (status === "no_config") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-700">
        <div className="max-w-lg space-y-2">
          <p className="font-semibold">Firebase が未設定です</p>
          <p>
            <code className="text-xs">docs/SETUP.md</code>{" "}
            の手順に従い、Firebase の設定値を Netlify（公開時）または{" "}
            <code className="text-xs">.env.local</code>
            （ローカル開発時）に入れてください。
          </p>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-gray-600">
        データを読み込んでいます…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-red-700">
        <div className="max-w-lg space-y-2">
          <p className="font-semibold">データの読み込みに失敗しました</p>
          <p>{errorMessage}</p>
          <p className="text-gray-600">
            Firestore のルール公開やネットワーク接続を確認してください。
          </p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <CanvasBackground>
        <div
          className={[
            "flex min-h-0 flex-1 flex-col gap-4 p-1 pb-4",
            activeView === "memberTasks"
              ? "overflow-hidden"
              : "overflow-y-auto overflow-x-auto",
          ].join(" ")}
        >
          <div className={activeView === "retro" ? "" : "hidden"}>
            <RetrospectivePanel boardId={activeBoardId} />
          </div>

          <div
            className={
              activeView === "memberTasks"
                ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                : "hidden"
            }
          >
            <MemberTaskSchedulePanel
              tasks={tasks}
              productBacklogByBoard={productBacklogByBoard}
              assigneeCandidates={assigneeCandidates}
              onUpdateTask={updateTask}
            />
          </div>

          <div className={activeView === "dailyProgress" ? "" : "hidden"}>
            <DailyProgressPanel
              tasks={tasks}
              productBacklogByBoard={productBacklogByBoard}
              activeBoardIds={activeBoardIds}
              boardLabelsByBoard={boardLabelsByBoard}
              assigneeCandidates={assigneeCandidates}
              initialAssignee={initialDailyAssignee}
              initialSlot={initialDailySlot}
              onUpdateTask={updateTask}
            />
          </div>

          {activeView === "planning" ? (
            <>
              <WeekdayAssignRow
                schedule={schedule}
                onUpdateDay={(day, name) =>
                  updateSchedule(activeBoardId, day as WeekdayKey, name)
                }
              />
              <SprintGoalsRow
                boardId={activeBoardId}
                goal={sprintGoalsByBoard[activeBoardId] ?? ""}
                onUpdateGoal={(goal) => updateSprintGoal(activeBoardId, goal)}
              />
              <KanbanBoard
                productBacklog={productBacklog}
                tasks={boardTasks}
                onUpdateProductBacklog={(itemId, patch) =>
                  updateProductBacklog(activeBoardId, itemId, patch)
                }
                onDeleteSwimlane={(itemId) => removeSwimlane(activeBoardId, itemId)}
                onDuplicateSwimlane={(itemId) =>
                  duplicateSwimlane(activeBoardId, itemId)
                }
                onAddProductBacklog={() => addProductBacklog(activeBoardId)}
                onAddTask={(parentIssueId, lane) =>
                  addTask(activeBoardId, parentIssueId, lane)
                }
                onAddTasksFromTemplateSet={(parentIssueId, lane, setId) =>
                  addTasksFromTemplateSet(activeBoardId, parentIssueId, lane, setId)
                }
                onUpdateTask={updateTask}
                onDeleteTask={removeTask}
                selectedTaskIdSet={selectedTaskIdSet}
                onSelectTask={handleSelectTask}
                onDuplicateTask={duplicateTask}
                onClearSelection={clearSelection}
                groupDragPreview={groupDragPreview}
                groupDraggingIdSet={groupDraggingIdSet}
                assigneeCandidates={assigneeCandidates}
                goalTextCandidates={goalTextCandidates}
                taskTemplateSets={taskTemplateSets}
                onAddTaskTemplateSet={addTaskTemplateSetEntry}
                onDeleteTaskTemplateSet={removeTaskTemplateSetEntry}
                onRenameTaskTemplateSet={renameTaskTemplateSet}
                onAddItemToTaskTemplateSet={addItemToTaskTemplateSet}
                onRemoveItemFromTaskTemplateSet={removeItemFromTaskTemplateSet}
                onReorderItemsInTaskTemplateSet={reorderItemsInTaskTemplateSet}
                assigneeColorByName={assigneeColorByName}
                onSetAssigneeColor={setAssigneeColorForName}
                onAddAssigneeCandidate={addAssigneeCandidate}
                onDeleteAssigneeCandidate={deleteAssigneeCandidate}
                onRenameAssigneeCandidate={renameAssigneeCandidate}
                onAddGoalTextCandidate={addGoalTextCandidate}
                onDeleteGoalTextCandidate={deleteGoalTextCandidate}
              />
              <div className="mb-8 flex w-full shrink-0 flex-row flex-wrap items-start justify-start gap-4 px-2 pb-6">
                <div className="w-full shrink-0 lg:max-w-[560px] lg:flex-none">
                  <BurndownPanel
                    data={burndownData}
                    totalTasks={boardTasks.length}
                    currentWip={currentWip}
                    businessDayIsos={businessDayIsos}
                    onBusinessDayIsosChange={handleBusinessDayIsosChange}
                    onResetBusinessDays={handleResetBusinessDays}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <ReleaseBurnupPanel
                    data={burnupChartData}
                    draftPoints={draftBurnupPoints}
                    resolvedItems={resolvedBacklogItems}
                    isAlreadyFinalized={isSprintAlreadyFinalized}
                    isFinalizeDisabled={isWithinSprintBusinessDays}
                    finalizeDisabledReason={
                      isWithinSprintBusinessDays ? finalizeDisabledReason : undefined
                    }
                    onFinalize={handleFinalizeSprintBurnup}
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>
      </CanvasBackground>

      <DragOverlay dropAnimation={null}>
        {activeTaskResolved ? (() => {
          const draggingIds = draggingTaskIdsRef.current;
          if (draggingIds && draggingIds.length > 1) {
            return (
              <div className="relative">
                <TaskCard
                  task={activeTaskResolved}
                  isOverlay
                  assigneeCandidates={assigneeCandidates}
                  assigneeColorByName={assigneeColorByName}
                  onSetAssigneeColor={setAssigneeColorForName}
                  onAddAssigneeCandidate={addAssigneeCandidate}
                  onDeleteAssigneeCandidate={deleteAssigneeCandidate}
                  onRenameAssigneeCandidate={renameAssigneeCandidate}
                />
                <div className="absolute -right-2 -top-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                  {draggingIds.length}
                </div>
              </div>
            );
          }
          return (
            <TaskCard
              task={activeTaskResolved}
              isOverlay
              assigneeCandidates={assigneeCandidates}
              assigneeColorByName={assigneeColorByName}
              onSetAssigneeColor={setAssigneeColorForName}
              onAddAssigneeCandidate={addAssigneeCandidate}
              onDeleteAssigneeCandidate={deleteAssigneeCandidate}
              onRenameAssigneeCandidate={renameAssigneeCandidate}
            />
          );
        })() : null}
      </DragOverlay>
    </DndContext>
  );
}

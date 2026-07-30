import { arrayMove } from "@dnd-kit/sortable";
import { parseDropZoneId } from "./types";
import type { DropZoneId, Task, TaskLane } from "./types";

export type LaneContainer = {
  parentIssueId: string;
  lane: TaskLane;
};

/** レーン変更時、Doing 以外では進捗％を落とす */
function taskWithLane(
  task: Task,
  lane: TaskLane,
  parentIssueId: string,
): Task {
  const next: Task = {
    ...task,
    lane,
    parentIssueId,
  };
  if (lane !== "doing") {
    delete next.progressPercent;
  }
  return next;
}

export function laneContainerId(
  parentIssueId: string,
  lane: TaskLane,
): DropZoneId {
  return `${lane}:${parentIssueId}`;
}

export function resolveLaneContainer(
  tasks: Task[],
  id: string,
): LaneContainer | null {
  const zone = parseDropZoneId(id);
  if (zone) return zone;

  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  return { parentIssueId: task.parentIssueId, lane: task.lane };
}

/** 表示順（sortOrder → createdAt → id）。欠損 sortOrder は createdAt から補完 */
export function sortTasksByOrder(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const oa = a.sortOrder ?? a.createdAt ?? 0;
    const ob = b.sortOrder ?? b.createdAt ?? 0;
    if (oa !== ob) return oa - ob;
    const ca = a.createdAt ?? 0;
    const cb = b.createdAt ?? 0;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });
}

export function tasksInLane(
  tasks: Task[],
  container: LaneContainer,
): Task[] {
  return sortTasksByOrder(
    tasks.filter(
      (t) =>
        t.parentIssueId === container.parentIssueId && t.lane === container.lane,
    ),
  );
}

export function nextSortOrderInLane(
  tasks: Task[],
  container: LaneContainer,
): number {
  const lane = tasksInLane(tasks, container);
  if (lane.length === 0) return 0;
  return Math.max(...lane.map((t) => t.sortOrder ?? t.createdAt ?? 0)) + 1;
}

function applyLaneSortOrders(
  laneTasks: Task[],
  container: LaneContainer,
): Map<string, Task> {
  const updates = new Map<string, Task>();
  laneTasks.forEach((t, index) => {
    updates.set(t.id, {
      ...t,
      lane: container.lane,
      parentIssueId: container.parentIssueId,
      sortOrder: index,
    });
  });
  return updates;
}

/**
 * ドラッグ中・ドロップ時にタスク位置を更新する。
 * overId はタスク ID またはレーンコンテナ ID（`lane:parentIssueId`）。
 */
export function repositionTaskInList(
  tasks: Task[],
  activeTaskId: string,
  overId: string,
): Task[] {
  const active = tasks.find((t) => t.id === activeTaskId);
  if (!active) return tasks;

  const overContainer = resolveLaneContainer(tasks, overId);
  if (!overContainer) return tasks;

  const activeContainer = laneContainerId(active.parentIssueId, active.lane);
  const targetContainerId = laneContainerId(
    overContainer.parentIssueId,
    overContainer.lane,
  );

  const targetLaneTasks = tasksInLane(tasks, overContainer);
  const activeIndex = targetLaneTasks.findIndex((t) => t.id === activeTaskId);

  let overIndex: number;
  if (overId === targetContainerId || parseDropZoneId(overId)) {
    overIndex =
      activeContainer === targetContainerId && activeIndex >= 0
        ? targetLaneTasks.length - 1
        : targetLaneTasks.length;
  } else {
    overIndex = targetLaneTasks.findIndex((t) => t.id === overId);
    if (overIndex === -1) overIndex = targetLaneTasks.length;
  }

  const updates = new Map<string, Task>();

  if (activeContainer === targetContainerId && activeIndex >= 0) {
    if (activeIndex === overIndex) return tasks;
    const reordered = arrayMove(targetLaneTasks, activeIndex, overIndex);
    applyLaneSortOrders(reordered, overContainer).forEach((t, id) =>
      updates.set(id, t),
    );
  } else {
    const withoutActive = targetLaneTasks.filter((t) => t.id !== activeTaskId);
    let insertIndex = overIndex;
    if (overId !== targetContainerId && !parseDropZoneId(overId)) {
      insertIndex = withoutActive.findIndex((t) => t.id === overId);
      if (insertIndex === -1) insertIndex = withoutActive.length;
    } else {
      insertIndex = withoutActive.length;
    }

    const moved = taskWithLane(
      active,
      overContainer.lane,
      overContainer.parentIssueId,
    );
    const reordered = [...withoutActive];
    reordered.splice(insertIndex, 0, moved);
    applyLaneSortOrders(reordered, overContainer).forEach((t, id) =>
      updates.set(id, t),
    );

    if (activeContainer !== targetContainerId) {
      const sourceContainer: LaneContainer = {
        parentIssueId: active.parentIssueId,
        lane: active.lane,
      };
      const sourceTasks = tasksInLane(tasks, sourceContainer).filter(
        (t) => t.id !== activeTaskId,
      );
      applyLaneSortOrders(sourceTasks, sourceContainer).forEach((t, id) =>
        updates.set(id, t),
      );
    }
  }

  if (updates.size === 0) return tasks;

  let changed = false;
  const next = tasks.map((t) => {
    const updated = updates.get(t.id);
    if (!updated) return t;
    if (
      updated.lane !== t.lane ||
      updated.parentIssueId !== t.parentIssueId ||
      updated.sortOrder !== t.sortOrder
    ) {
      changed = true;
    }
    return updated;
  });
  return changed ? next : tasks;
}

/**
 * 複数選択タスクをまとめて移動/並べ替えする。
 * - activeTaskIds は「移動対象の順序」を表す（この順序を保って挿入する）
 * - overId はタスク ID またはレーンコンテナ ID（`lane:parentIssueId`）。
 */
export function repositionTasksInList(
  tasks: Task[],
  activeTaskIds: string[],
  overId: string,
): Task[] {
  if (activeTaskIds.length === 0) return tasks;

  const overContainer = resolveLaneContainer(tasks, overId);
  if (!overContainer) return tasks;

  const activeTasks: Task[] = [];
  const activeIdSet = new Set(activeTaskIds);
  for (const id of activeTaskIds) {
    const t = tasks.find((x) => x.id === id);
    if (t) activeTasks.push(t);
  }
  if (activeTasks.length === 0) return tasks;

  const targetContainerId = laneContainerId(
    overContainer.parentIssueId,
    overContainer.lane,
  );

  // ターゲットレーンの現在の並び（移動対象は一旦除外）
  const targetLaneTasks = tasksInLane(tasks, overContainer);
  const targetWithoutActive = targetLaneTasks.filter((t) => !activeIdSet.has(t.id));

  // 挿入位置を決める（overId がレーンコンテナなら末尾）
  const overContainerId = laneContainerId(
    overContainer.parentIssueId,
    overContainer.lane,
  );
  let insertIndex = targetWithoutActive.length;
  if (overId !== overContainerId && !parseDropZoneId(overId)) {
    // overId が「選択中タスク」の場合でも滑らかに並べ替えられるよう、
    // フル配列上の index から「非選択要素だけ数えた index」に変換する。
    const overIndexFull = targetLaneTasks.findIndex((t) => t.id === overId);
    if (overIndexFull === -1) {
      insertIndex = targetWithoutActive.length;
    } else {
      let nonActiveBefore = 0;
      for (let i = 0; i < overIndexFull; i++) {
        if (!activeIdSet.has(targetLaneTasks[i].id)) nonActiveBefore++;
      }
      insertIndex = nonActiveBefore;
    }
  }

  const movedTasks: Task[] = [];
  for (const t of activeTasks) {
    movedTasks.push(
      taskWithLane(t, overContainer.lane, overContainer.parentIssueId),
    );
  }

  const reorderedTarget = [...targetWithoutActive];
  reorderedTarget.splice(insertIndex, 0, ...movedTasks);

  const updates = new Map<string, Task>();
  applyLaneSortOrders(reorderedTarget, overContainer).forEach((t, id) =>
    updates.set(id, t),
  );

  // 移動元レーンの sortOrder を詰め直す（ターゲットと違うコンテナだけ）
  const sourceContainers = new Map<string, LaneContainer>();
  for (const t of activeTasks) {
    const cid = laneContainerId(t.parentIssueId, t.lane);
    if (cid === targetContainerId) continue;
    if (!sourceContainers.has(cid)) {
      sourceContainers.set(cid, { parentIssueId: t.parentIssueId, lane: t.lane });
    }
  }

  for (const container of sourceContainers.values()) {
    const sourceTasks = tasksInLane(tasks, container).filter(
      (t) => !activeIdSet.has(t.id),
    );
    applyLaneSortOrders(sourceTasks, container).forEach((t, id) =>
      updates.set(id, t),
    );
  }

  if (updates.size === 0) return tasks;

  let changed = false;
  const next = tasks.map((t) => {
    const updated = updates.get(t.id);
    if (!updated) return t;
    if (
      updated.lane !== t.lane ||
      updated.parentIssueId !== t.parentIssueId ||
      updated.sortOrder !== t.sortOrder
    ) {
      changed = true;
    }
    return updated;
  });
  return changed ? next : tasks;
}

export type GroupDragPreview = {
  container: LaneContainer;
  insertIndex: number;
};

/**
 * グループドラッグの「候補位置」だけを計算する（tasks は更新しない）。
 * overId はタスク ID またはレーンコンテナ ID（`lane:parentIssueId`）。
 */
export function computeGroupDragPreview(
  tasks: Task[],
  activeTaskIds: string[],
  overId: string,
): GroupDragPreview | null {
  if (activeTaskIds.length === 0) return null;
  const overContainer = resolveLaneContainer(tasks, overId);
  if (!overContainer) return null;

  const activeIdSet = new Set(activeTaskIds);
  const targetLaneTasks = tasksInLane(tasks, overContainer);
  const targetWithoutActive = targetLaneTasks.filter((t) => !activeIdSet.has(t.id));

  const overContainerId = laneContainerId(
    overContainer.parentIssueId,
    overContainer.lane,
  );
  let insertIndex = targetWithoutActive.length;
  if (overId !== overContainerId && !parseDropZoneId(overId)) {
    const overIndexFull = targetLaneTasks.findIndex((t) => t.id === overId);
    if (overIndexFull === -1) {
      insertIndex = targetWithoutActive.length;
    } else {
      let nonActiveBefore = 0;
      for (let i = 0; i < overIndexFull; i++) {
        if (!activeIdSet.has(targetLaneTasks[i].id)) nonActiveBefore++;
      }
      insertIndex = nonActiveBefore;
    }
  }

  return { container: overContainer, insertIndex };
}

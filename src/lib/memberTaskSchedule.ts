import { buildStandardBusinessDayIsos, isBusinessDayIso } from "./businessDays";
import { formatDueDateDisplay } from "./dateUtils";
import { addJstCalendarDays, getJstIsoDate } from "./jstDate";
import type { BoardId, ProductBacklogItem, Task, TaskLane } from "./types";

export type MemberTaskBar = {
  taskId: string;
  title: string;
  lane: TaskLane;
  estimatedHours?: number;
  /** Doing 時のみ。今日の進捗などで設定された 25 / 50 / 75 */
  progressPercent?: 25 | 50 | 75;
  /** CSS grid-column 開始（1-based） */
  gridColumnStart: number;
  /** CSS grid-column 終了（exclusive, 1-based） */
  gridColumnEnd: number;
};

export type MemberCategorySchedule = {
  categoryTitle: string;
  parentIssueId: string;
  boardId: BoardId;
  /** 重なり回避のためのサブ行ごとのタスクバー */
  subRows: MemberTaskBar[][];
  rowCount: number;
};

export type MemberScheduleGroup = {
  memberName: string;
  categories: MemberCategorySchedule[];
  /** タスク行 + 日別合計行 */
  rowCount: number;
  /** 日付 ISO → その日の合計工数（営業日均等割り・担当者フル） */
  dailyHourTotals: Record<string, number>;
};

export type MemberScheduleModel = {
  dateColumns: string[];
  todayIso: string;
  members: MemberScheduleGroup[];
};

type TaskDateRange = {
  effectiveStart: string;
  effectiveEnd: string;
};

export function getTaskDateRange(task: Task): TaskDateRange | null {
  const start = task.startDate?.trim();
  const due = task.dueDate?.trim();
  if (!start && !due) return null;
  const effectiveStart = start || due!;
  const effectiveEnd = due || start!;
  return { effectiveStart, effectiveEnd };
}

function isSchedulableTask(task: Task): boolean {
  if (task.lane !== "todo" && task.lane !== "doing" && task.lane !== "done") {
    return false;
  }
  if (!getTaskDateRange(task)) return false;
  const assignees = (task.assignees ?? []).map((a) => a.trim()).filter(Boolean);
  return assignees.length > 0;
}

/** 範囲内の営業日を昇順で列挙 */
export function buildBusinessDaysBetween(minIso: string, maxIso: string): string[] {
  const days: string[] = [];
  let cursor = minIso;
  for (let guard = 0; cursor <= maxIso && guard < 400; guard++) {
    if (isBusinessDayIso(cursor)) {
      days.push(cursor);
    }
    cursor = addJstCalendarDays(cursor, 1);
  }
  return days;
}

function getBarGridSpan(
  dateColumns: string[],
  range: TaskDateRange,
): { gridColumnStart: number; gridColumnEnd: number } | null {
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < dateColumns.length; i++) {
    const d = dateColumns[i];
    if (d >= range.effectiveStart && d <= range.effectiveEnd) {
      if (startIdx === -1) startIdx = i;
      endIdx = i;
    }
  }
  if (startIdx === -1) return null;
  return {
    gridColumnStart: startIdx + 1,
    gridColumnEnd: endIdx + 2,
  };
}

function barsOverlap(a: MemberTaskBar, b: MemberTaskBar): boolean {
  return (
    a.gridColumnStart < b.gridColumnEnd && a.gridColumnEnd > b.gridColumnStart
  );
}

function packBarsIntoSubRows(bars: MemberTaskBar[]): MemberTaskBar[][] {
  const sorted = [...bars].sort(
    (a, b) =>
      a.gridColumnStart - b.gridColumnStart ||
      a.gridColumnEnd - b.gridColumnEnd ||
      a.title.localeCompare(b.title, "ja-JP"),
  );
  const subRows: MemberTaskBar[][] = [];
  for (const bar of sorted) {
    let placed = false;
    for (const row of subRows) {
      if (!row.some((existing) => barsOverlap(existing, bar))) {
        row.push(bar);
        placed = true;
        break;
      }
    }
    if (!placed) subRows.push([bar]);
  }
  return subRows;
}

function buildBacklogTitleMap(
  productBacklogByBoard: Record<BoardId, ProductBacklogItem[]>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const items of Object.values(productBacklogByBoard)) {
    for (const item of items) {
      map.set(item.id, item.title.trim() || "(無題)");
    }
  }
  return map;
}

/** タスク工数を対応期間の営業日で均等割り（1日あたりの時間） */
export function allocateTaskHoursPerBusinessDay(task: Task): Map<string, number> {
  if (task.estimatedHours == null) return new Map();
  const range = getTaskDateRange(task);
  if (!range) return new Map();
  const days = buildBusinessDaysBetween(range.effectiveStart, range.effectiveEnd);
  if (days.length === 0) return new Map();
  const perDay = task.estimatedHours / days.length;
  return new Map(days.map((d) => [d, perDay]));
}

export function buildMemberDailyHourTotals(
  memberTasks: Task[],
  dateColumns: string[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  const columnSet = new Set(dateColumns);
  for (const task of memberTasks) {
    for (const [day, hours] of allocateTaskHoursPerBusinessDay(task)) {
      if (!columnSet.has(day)) continue;
      totals[day] = (totals[day] ?? 0) + hours;
    }
  }
  return totals;
}

function sortMemberNames(
  names: Set<string>,
  assigneeCandidates: string[],
): string[] {
  const candidateOrder = new Map(
    assigneeCandidates.map((name, index) => [name, index]),
  );
  return [...names].sort((a, b) => {
    const ai = candidateOrder.get(a);
    const bi = candidateOrder.get(b);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.localeCompare(b, "ja-JP");
  });
}

export function buildMemberScheduleModel(args: {
  tasks: Task[];
  productBacklogByBoard: Record<BoardId, ProductBacklogItem[]>;
  assigneeCandidates: string[];
  /** false のとき Done レーンを除外（デフォルト true） */
  includeDone?: boolean;
  referenceDate?: Date;
}): MemberScheduleModel {
  const todayIso = getJstIsoDate(args.referenceDate);
  const includeDone = args.includeDone !== false;
  const schedulable = args.tasks
    .filter(isSchedulableTask)
    .filter((task) => includeDone || task.lane !== "done");
  const backlogTitles = buildBacklogTitleMap(args.productBacklogByBoard);

  let rangeMin = todayIso;
  let rangeMax = todayIso;

  for (const task of schedulable) {
    const range = getTaskDateRange(task)!;
    if (range.effectiveStart < rangeMin) rangeMin = range.effectiveStart;
    if (range.effectiveEnd > rangeMax) rangeMax = range.effectiveEnd;
  }

  const dateColumns =
    schedulable.length > 0
      ? buildBusinessDaysBetween(rangeMin, rangeMax)
      : buildStandardBusinessDayIsos(args.referenceDate);

  /** メンバー → カテゴリキー → タスク一覧 */
  const byMember = new Map<string, Map<string, Task[]>>();

  for (const task of schedulable) {
    const assignees = (task.assignees ?? []).map((a) => a.trim()).filter(Boolean);
    const categoryKey = `${task.boardId}:${task.parentIssueId}`;
    for (const memberName of assignees) {
      if (!byMember.has(memberName)) {
        byMember.set(memberName, new Map());
      }
      const byCategory = byMember.get(memberName)!;
      if (!byCategory.has(categoryKey)) {
        byCategory.set(categoryKey, []);
      }
      byCategory.get(categoryKey)!.push(task);
    }
  }

  const members: MemberScheduleGroup[] = sortMemberNames(
    new Set(byMember.keys()),
    args.assigneeCandidates,
  ).map((memberName) => {
    const byCategory = byMember.get(memberName)!;
    const categoryKeys = [...byCategory.keys()].sort((a, b) => {
      const titleA = backlogTitles.get(a.split(":")[1]!) ?? a;
      const titleB = backlogTitles.get(b.split(":")[1]!) ?? b;
      return titleA.localeCompare(titleB, "ja-JP");
    });

    const categories: MemberCategorySchedule[] = categoryKeys
      .map((categoryKey) => {
      const [boardId, parentIssueId] = categoryKey.split(":") as [BoardId, string];
      const categoryTasks = byCategory.get(categoryKey)!;
      const bars: MemberTaskBar[] = [];

      for (const task of categoryTasks) {
        const range = getTaskDateRange(task)!;
        const span = getBarGridSpan(dateColumns, range);
        if (!span) continue;
        bars.push({
          taskId: task.id,
          title: task.title.trim() || "(無題)",
          lane: task.lane,
          estimatedHours: task.estimatedHours,
          progressPercent:
            task.lane === "doing" &&
            (task.progressPercent === 25 ||
              task.progressPercent === 50 ||
              task.progressPercent === 75)
              ? task.progressPercent
              : undefined,
          gridColumnStart: span.gridColumnStart,
          gridColumnEnd: span.gridColumnEnd,
        });
      }

      const subRows = packBarsIntoSubRows(bars);
      return {
        categoryTitle: backlogTitles.get(parentIssueId) ?? "(無題)",
        parentIssueId,
        boardId,
        subRows,
        rowCount: Math.max(subRows.length, 1),
      };
    })
      .filter((category) => category.subRows.length > 0);

    const memberTasks = categoryKeys.flatMap(
      (key) => byCategory.get(key)!,
    );
    const dailyHourTotals = buildMemberDailyHourTotals(memberTasks, dateColumns);
    const taskRowCount = categories.reduce((sum, c) => sum + c.rowCount, 0);
    const rowCount = taskRowCount + 1;
    return { memberName, categories, rowCount, dailyHourTotals };
  })
    .filter((member) => member.categories.length > 0);

  return { dateColumns, todayIso, members };
}

export function formatScheduleColumnLabel(iso: string): string {
  return formatDueDateDisplay(iso);
}

import { resolveTaskPlacement } from "./boardConfig";
import { getSprintTuesday } from "./burndown";
import { toIsoDateString } from "./dateUtils";
import { getJstIsoDate } from "./jstDate";
import type {
  BoardId,
  ProductBacklogItem,
  SprintSchedule,
  Task,
} from "./types";

const ASSIGNEE_SATO = "佐藤";
const ASSIGNEE_TANAKA = "田中";
const ASSIGNEE_HARYU = "針生";

let mockTaskCreatedAt = 1_700_000_000_000;

function sprintDayIso(offsetFromTuesday: number): string {
  const tuesday = getSprintTuesday(new Date(`${getJstIsoDate()}T12:00:00+09:00`));
  const day = new Date(tuesday);
  day.setDate(day.getDate() + offsetFromTuesday);
  return toIsoDateString(day);
}

function task(
  partial: Omit<Task, "boardId" | "backlogCategoryId" | "createdAt" | "sortOrder"> & {
    issueType: string;
    createdAt?: number;
    sortOrder?: number;
  },
): Task {
  const placement = resolveTaskPlacement(partial.issueType);
  const { issueType, createdAt, sortOrder, ...rest } = partial;
  const ts = createdAt ?? mockTaskCreatedAt++;
  return {
    ...rest,
    issueType,
    ...placement,
    createdAt: ts,
    sortOrder: sortOrder ?? ts,
  };
}

export const MOCK_PRODUCT_BACKLOG_BY_BOARD: Record<
  BoardId,
  ProductBacklogItem[]
> = {
  baseball_board: [
    {
      id: "bb-p1",
      boardId: "baseball_board",
      title: "ダッシュボード画面の改善",
      requestUrl: "https://example.com/request/bb-p1",
      goalText: "制作できている状態",
      points: 3,
      assignees: [ASSIGNEE_HARYU, ASSIGNEE_TANAKA],
    },
    {
      id: "bb-p2",
      boardId: "baseball_board",
      title: "お知らせ配信の追加",
      goalText: "公開できている状態",
      points: 5,
      assignees: [ASSIGNEE_SATO],
    },
  ],
  proposal_improvement: [
    {
      id: "pi-p1",
      boardId: "proposal_improvement",
      title: "会員登録フローの改善",
      goalText: "制作できている状態",
      points: 5,
      assignees: [ASSIGNEE_HARYU],
    },
    {
      id: "pi-p2",
      boardId: "proposal_improvement",
      title: "監視・運用の見直し",
      goalText: "公開できている状態",
      points: 5,
      assignees: [ASSIGNEE_SATO, ASSIGNEE_TANAKA],
    },
  ],
  ad_hoc: [
    {
      id: "ah-p1",
      boardId: "ad_hoc",
      title: "公式サイト TOP リニューアル",
      goalText: "公開できている状態",
      points: 8,
      assignees: [ASSIGNEE_SATO],
    },
    {
      id: "ah-p2",
      boardId: "ad_hoc",
      title: "キャンペーン LP 制作",
      goalText: "制作できている状態",
      points: 2,
      assignees: [ASSIGNEE_TANAKA],
    },
  ],
};

export const MOCK_SPRINT_SCHEDULE_BY_BOARD: Record<BoardId, SprintSchedule> = {
  baseball_board: {
    tuesday: ASSIGNEE_HARYU,
    wednesday: ASSIGNEE_SATO,
    thursday: ASSIGNEE_TANAKA,
    friday: ASSIGNEE_HARYU,
    monday: ASSIGNEE_SATO,
  },
  proposal_improvement: {
    tuesday: ASSIGNEE_SATO,
    wednesday: ASSIGNEE_TANAKA,
    thursday: ASSIGNEE_HARYU,
    friday: ASSIGNEE_SATO,
    monday: ASSIGNEE_TANAKA,
  },
  ad_hoc: {
    tuesday: ASSIGNEE_TANAKA,
    wednesday: ASSIGNEE_HARYU,
    thursday: ASSIGNEE_SATO,
    friday: ASSIGNEE_TANAKA,
    monday: ASSIGNEE_HARYU,
  },
};

export const MOCK_TASKS: Task[] = [
  task({
    id: "t1",
    parentIssueId: "bb-p1",
    issueKey: "MOCK-1",
    title: "画面レイアウト作成",
    issueType: "プロ野球",
    lane: "todo",
    assignees: [ASSIGNEE_HARYU],
    startDate: sprintDayIso(1),
    dueDate: sprintDayIso(3),
    points: 1,
    estimatedHours: 3,
  }),
  task({
    id: "t2",
    parentIssueId: "bb-p1",
    issueKey: "MOCK-2",
    title: "デザイン確認",
    issueType: "プロ野球",
    lane: "doing",
    assignees: [ASSIGNEE_TANAKA],
    startDate: sprintDayIso(0),
    dueDate: sprintDayIso(2),
    points: 2,
    estimatedHours: 1.5,
  }),
  task({
    id: "t7",
    parentIssueId: "bb-p1",
    issueKey: "MOCK-3",
    title: "要件の整理",
    issueType: "プロ野球",
    lane: "done",
    assignees: [ASSIGNEE_SATO],
    startDate: sprintDayIso(-7),
    dueDate: sprintDayIso(-4),
    points: 2,
  }),
  task({
    id: "t2b",
    parentIssueId: "bb-p2",
    issueKey: "MOCK-4",
    title: "API 連携",
    issueType: "プロ野球",
    lane: "todo",
    assignees: [ASSIGNEE_TANAKA],
    startDate: sprintDayIso(2),
    dueDate: sprintDayIso(6),
  }),
  task({
    id: "t3",
    parentIssueId: "ah-p1",
    issueKey: "MOCK-5",
    title: "バナー差し替え",
    issueType: "公式",
    lane: "todo",
    assignees: [ASSIGNEE_SATO],
    startDate: sprintDayIso(1),
    dueDate: sprintDayIso(3),
    points: 2,
  }),
  task({
    id: "t4",
    parentIssueId: "ah-p2",
    issueKey: "MOCK-6",
    title: "LP 公開",
    issueType: "promo",
    lane: "doing",
    assignees: [ASSIGNEE_HARYU],
    startDate: sprintDayIso(0),
    dueDate: sprintDayIso(3),
    points: 8,
  }),
  task({
    id: "t5",
    parentIssueId: "pi-p1",
    issueKey: "MOCK-7",
    title: "入力エラーの調査",
    issueType: "バグ",
    lane: "todo",
    assignees: [ASSIGNEE_HARYU],
    startDate: sprintDayIso(2),
    dueDate: sprintDayIso(6),
    points: 5,
  }),
  task({
    id: "t6",
    parentIssueId: "pi-p2",
    issueKey: "MOCK-8",
    title: "アラート閾値の見直し",
    issueType: "運用",
    lane: "doing",
    assignees: [ASSIGNEE_TANAKA],
    startDate: sprintDayIso(0),
    dueDate: sprintDayIso(2),
    points: 3,
  }),
  task({
    id: "t8",
    parentIssueId: "pi-p1",
    issueKey: "MOCK-9",
    title: "フッター文言の更新",
    issueType: "その他",
    lane: "done",
    assignees: [ASSIGNEE_SATO],
    startDate: sprintDayIso(-7),
    dueDate: sprintDayIso(-5),
    points: 1,
  }),
  task({
    id: "t9",
    parentIssueId: "pi-p1",
    issueKey: "MOCK-10",
    title: "パフォーマンス改善",
    issueType: "改善",
    lane: "todo",
    assignees: [ASSIGNEE_HARYU],
    startDate: sprintDayIso(3),
    dueDate: sprintDayIso(6),
    points: 5,
  }),
];

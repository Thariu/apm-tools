import { resolveTaskPlacement } from "./boardConfig";
import type {
  BoardId,
  ProductBacklogItem,
  SprintSchedule,
  Task,
} from "./types";

let mockTaskCreatedAt = 1_700_000_000_000;

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
      title: "【更新】watchページ_POINT5追加対応、ABテスト",
      requestUrl: "https://example.com/request/bb-p1",
      goalText: "制作できている状態",
      points: 3,
      assignees: ["針生", "芹田"],
    },
    {
      id: "bb-p2",
      boardId: "baseball_board",
      title: "プロ野球 試合速報ウィジェット改善",
      goalText: "公開できている状態",
      points: 5,
      assignees: ["須藤"],
    },
  ],
  proposal_improvement: [
    {
      id: "pi-p1",
      boardId: "proposal_improvement",
      title: "会員登録フロー UX 改善",
      goalText: "制作できている状態",
      points: 5,
      assignees: ["針生"],
    },
    {
      id: "pi-p2",
      boardId: "proposal_improvement",
      title: "インフラ監視・運用改善",
      goalText: "公開できている状態",
      assignees: ["芹田", "須藤"],
    },
  ],
  ad_hoc: [
    {
      id: "ah-p1",
      boardId: "ad_hoc",
      title: "公式サイト TOP リニューアル",
      goalText: "公開できている状態",
      points: 8,
      assignees: ["加藤"],
    },
    {
      id: "ah-p2",
      boardId: "ad_hoc",
      title: "promo キャンペーン施策",
      goalText: "制作できている状態",
      assignees: [""],
    },
  ],
};

export const MOCK_SPRINT_SCHEDULE_BY_BOARD: Record<BoardId, SprintSchedule> = {
  baseball_board: {
    tuesday: "芹田",
    wednesday: "針生",
    thursday: "須藤",
    friday: "芹田",
    monday: "針生",
  },
  proposal_improvement: {
    tuesday: "針生",
    wednesday: "須藤",
    thursday: "芹田",
    friday: "針生",
    monday: "須藤",
  },
  ad_hoc: {
    tuesday: "須藤",
    wednesday: "芹田",
    thursday: "針生",
    friday: "須藤",
    monday: "芹田",
  },
};

export const MOCK_TASKS: Task[] = [
  task({
    id: "t1",
    parentIssueId: "bb-p1",
    issueKey: "SPTVMEM-22486",
    title: "git",
    issueType: "プロ野球",
    lane: "todo",
    assignees: ["針生"],
    startDate: "2026-05-14",
    dueDate: "2026-05-18",
    points: 1,
    estimatedHours: 3,
  }),
  task({
    id: "t2",
    parentIssueId: "bb-p1",
    issueKey: "SPTVMEM-22490",
    title: "Design CK",
    issueType: "プロ野球",
    lane: "doing",
    assignees: ["芹田"],
    startDate: "2026-05-12",
    dueDate: "2026-05-14",
    points: 2,
    estimatedHours: 1.5,
  }),
  task({
    id: "t7",
    parentIssueId: "bb-p1",
    issueKey: "SPTVMEM-22525",
    title: "Dir check",
    issueType: "プロ野球",
    lane: "done",
    assignees: ["針生"],
    dueDate: "2026-05-12",
    points: 2,
  }),
  task({
    id: "t2b",
    parentIssueId: "bb-p2",
    issueKey: "SPTVMEM-22491",
    title: "API 連携",
    issueType: "プロ野球",
    lane: "todo",
    assignees: ["須藤"],
    dueDate: "2026-05-20",
  }),
  task({
    id: "t3",
    parentIssueId: "ah-p1",
    issueKey: "SPTVMEM-22501",
    title: "バナー差し替え",
    issueType: "公式",
    lane: "todo",
    assignees: ["加藤"],
    dueDate: "2026-05-18",
    points: 2,
  }),
  task({
    id: "t4",
    parentIssueId: "ah-p2",
    issueKey: "SPTVMEM-22510",
    title: "LP 公開",
    issueType: "promo",
    lane: "doing",
    assignees: [""],
    dueDate: "2026-05-16",
    points: 8,
  }),
  task({
    id: "t5",
    parentIssueId: "pi-p1",
    issueKey: "SPTVMEM-22515",
    title: "API エラー調査",
    issueType: "バグ",
    lane: "todo",
    assignees: ["針生"],
    dueDate: "2026-05-19",
    points: 5,
  }),
  task({
    id: "t6",
    parentIssueId: "pi-p2",
    issueKey: "SPTVMEM-22520",
    title: "アラート閾値見直し",
    issueType: "運用",
    lane: "doing",
    assignees: ["芹田"],
    dueDate: "2026-05-17",
    points: 3,
  }),
  task({
    id: "t8",
    parentIssueId: "pi-p1",
    issueKey: "SPTVMEM-22530",
    title: "フッター文言更新",
    issueType: "その他",
    lane: "done",
    assignees: ["須藤"],
    dueDate: "2026-05-10",
    points: 1,
  }),
  task({
    id: "t9",
    parentIssueId: "pi-p1",
    issueKey: "SPTVMEM-22535",
    title: "パフォーマンス改善",
    issueType: "改善",
    lane: "todo",
    assignees: ["針生"],
    dueDate: "2026-05-21",
    points: 5,
  }),
];

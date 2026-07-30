import type { BoardId, Task, TaskLane } from "./types";
import { parseDropZoneId } from "./types";

export type BacklogCategory = {
  id: string;
  label: string;
  accentColor: string;
};

export type BoardConfig = {
  id: BoardId;
  label: string;
  backlogCategories: BacklogCategory[];
  issueTypeToCategory: Record<string, string>;
  /** アクティブタブ用 Tailwind クラス */
  activeTabClassName: string;
};

export const BOARD_ORDER: BoardId[] = [
  "ad_hoc",
  "baseball_board",
  "proposal_improvement",
];

export const BOARD_CONFIGS: Record<BoardId, BoardConfig> = {
  baseball_board: {
    id: "baseball_board",
    label: "野球",
    activeTabClassName: "bg-yellow-400 text-gray-900 shadow-sm",
    backlogCategories: [
      { id: "pro_baseball", label: "プロ野球", accentColor: "#3b82f6" },
      { id: "other", label: "その他", accentColor: "#f59e0b" },
    ],
    issueTypeToCategory: {
      プロ野球: "pro_baseball",
      野球: "pro_baseball",
    },
  },
  proposal_improvement: {
    id: "proposal_improvement",
    label: "提案業務改善",
    activeTabClassName: "bg-green-800 text-white shadow-sm",
    backlogCategories: [
      { id: "default", label: "その他", accentColor: "#10b981" },
    ],
    issueTypeToCategory: {},
  },
  ad_hoc: {
    id: "ad_hoc",
    label: "都度案件",
    activeTabClassName: "bg-blue-700 text-white shadow-sm",
    backlogCategories: [
      { id: "ad_hoc_all", label: "都度案件", accentColor: "#ef4444" },
    ],
    issueTypeToCategory: {
      公式: "ad_hoc_all",
      promo: "ad_hoc_all",
    },
  },
};

/** コード上のデフォルト表示名（Firestore 未設定時のフォールバック） */
export function defaultBoardLabels(): Record<BoardId, string> {
  return Object.fromEntries(
    BOARD_ORDER.map((id) => [id, BOARD_CONFIGS[id].label]),
  ) as Record<BoardId, string>;
}

/** カスタム表示名があればそれを、なければデフォルトを返す */
export function resolveBoardLabel(
  boardId: BoardId,
  labelsByBoard?: Partial<Record<BoardId, string>> | null,
): string {
  const custom = labelsByBoard?.[boardId]?.trim();
  if (custom) return custom;
  return BOARD_CONFIGS[boardId]?.label ?? boardId;
}

/** Firestore planning_meta/board_labels のドキュメントを正規化 */
export function parseBoardLabelsDoc(
  raw: Record<string, unknown> | undefined | null,
): Record<BoardId, string> {
  const out = defaultBoardLabels();
  if (!raw) return out;
  for (const boardId of BOARD_ORDER) {
    const value = raw[boardId];
    if (typeof value === "string" && value.trim()) {
      out[boardId] = value.trim();
    }
  }
  return out;
}

const BASEBALL_ISSUE_TYPES = new Set(["野球", "プロ野球"]);
const AD_HOC_ISSUE_TYPES = new Set(["公式", "promo"]);

export function resolveBoardId(issueType: string): BoardId {
  if (AD_HOC_ISSUE_TYPES.has(issueType)) return "ad_hoc";
  if (BASEBALL_ISSUE_TYPES.has(issueType)) return "baseball_board";
  return "proposal_improvement";
}

export function resolveBacklogCategoryId(
  boardId: BoardId,
  issueType: string,
): string {
  const config = BOARD_CONFIGS[boardId];
  const mapped = config.issueTypeToCategory[issueType];
  if (mapped) return mapped;
  return config.backlogCategories[config.backlogCategories.length - 1].id;
}

export function resolveTaskPlacement(issueType: string): Pick<
  Task,
  "boardId" | "backlogCategoryId"
> {
  const boardId = resolveBoardId(issueType);
  return {
    boardId,
    backlogCategoryId: resolveBacklogCategoryId(boardId, issueType),
  };
}

export function parseDropZone(
  zoneId: string,
): { lane: TaskLane; parentIssueId: string } | null {
  return parseDropZoneId(zoneId);
}

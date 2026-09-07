import type { BoardId, BoardRegistryEntry, Task, TaskLane } from "./types";
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

/** 初期シード・レガシー互換用の固定3ボード（順序はタブ初期順） */
export const LEGACY_BOARD_ORDER: BoardId[] = [
  "ad_hoc",
  "baseball_board",
  "proposal_improvement",
];

/** @deprecated LEGACY_BOARD_ORDER を使用。動的レジストリ導入後は activeBoardIds を優先 */
export const BOARD_ORDER = LEGACY_BOARD_ORDER;

const TAB_PALETTE = [
  "bg-blue-700 text-white shadow-sm",
  "bg-yellow-400 text-gray-900 shadow-sm",
  "bg-green-800 text-white shadow-sm",
  "bg-purple-700 text-white shadow-sm",
  "bg-rose-700 text-white shadow-sm",
  "bg-cyan-700 text-white shadow-sm",
  "bg-orange-600 text-white shadow-sm",
  "bg-teal-700 text-white shadow-sm",
] as const;

export const LEGACY_BOARD_CONFIGS: Record<string, BoardConfig> = {
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

/** @deprecated LEGACY_BOARD_CONFIGS を使用 */
export const BOARD_CONFIGS = LEGACY_BOARD_CONFIGS;

export function defaultBoardConfig(boardId: BoardId, label?: string): BoardConfig {
  const legacy = LEGACY_BOARD_CONFIGS[boardId];
  if (legacy) return legacy;
  const paletteIndex = Math.abs(hashString(boardId)) % TAB_PALETTE.length;
  return {
    id: boardId,
    label: label?.trim() || "新しいカテゴリ",
    activeTabClassName: TAB_PALETTE[paletteIndex],
    backlogCategories: [
      { id: "default", label: "その他", accentColor: "#6366f1" },
    ],
    issueTypeToCategory: {},
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function getBoardConfig(
  boardId: BoardId,
  label?: string,
): BoardConfig {
  return defaultBoardConfig(boardId, label);
}

export function defaultLegacyRegistryEntries(): BoardRegistryEntry[] {
  return LEGACY_BOARD_ORDER.map((id, index) => ({
    id,
    label: LEGACY_BOARD_CONFIGS[id].label,
    order: index,
  }));
}

export function activeBoardIdsFromRegistry(
  entries: BoardRegistryEntry[],
): BoardId[] {
  return [...entries]
    .filter((e) => !e.archivedAt)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((e) => e.id);
}

export function archivedBoardEntries(
  entries: BoardRegistryEntry[],
): BoardRegistryEntry[] {
  return [...entries]
    .filter((e) => Boolean(e.archivedAt))
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
}

export function labelsFromRegistry(
  entries: BoardRegistryEntry[],
): Record<BoardId, string> {
  const out: Record<BoardId, string> = {};
  for (const e of entries) {
    out[e.id] = e.label.trim() || defaultBoardConfig(e.id).label;
  }
  return out;
}

/** コード上のデフォルト表示名（Firestore 未設定時のフォールバック） */
export function defaultBoardLabels(): Record<BoardId, string> {
  return Object.fromEntries(
    LEGACY_BOARD_ORDER.map((id) => [id, LEGACY_BOARD_CONFIGS[id].label]),
  );
}

/** カスタム表示名があればそれを、なければデフォルトを返す */
export function resolveBoardLabel(
  boardId: BoardId,
  labelsByBoard?: Partial<Record<BoardId, string>> | null,
): string {
  const custom = labelsByBoard?.[boardId]?.trim();
  if (custom) return custom;
  return (
    LEGACY_BOARD_CONFIGS[boardId]?.label ??
    defaultBoardConfig(boardId).label
  );
}

/** Firestore planning_meta/board_labels のドキュメントを正規化（レガシー互換） */
export function parseBoardLabelsDoc(
  raw: Record<string, unknown> | undefined | null,
  knownIds: BoardId[] = LEGACY_BOARD_ORDER,
): Record<BoardId, string> {
  const out: Record<BoardId, string> = {};
  for (const boardId of knownIds) {
    out[boardId] = resolveBoardLabel(boardId, null);
  }
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

export function parseBoardsRegistryDoc(
  raw: Record<string, unknown> | undefined | null,
): BoardRegistryEntry[] {
  if (!raw || !Array.isArray(raw.boards)) {
    return defaultLegacyRegistryEntries();
  }
  const entries: BoardRegistryEntry[] = [];
  for (const item of raw.boards) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id.trim()) continue;
    const id = o.id.trim();
    const label =
      typeof o.label === "string" && o.label.trim()
        ? o.label.trim()
        : defaultBoardConfig(id).label;
    const order = typeof o.order === "number" && Number.isFinite(o.order)
      ? o.order
      : entries.length;
    const entry: BoardRegistryEntry = { id, label, order };
    if (typeof o.accentKey === "string" && o.accentKey.trim()) {
      entry.accentKey = o.accentKey.trim();
    }
    if (typeof o.archivedAt === "string" && o.archivedAt.trim()) {
      entry.archivedAt = o.archivedAt.trim();
    }
    entries.push(entry);
  }
  if (entries.length === 0) return defaultLegacyRegistryEntries();
  return entries;
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
  const config = getBoardConfig(boardId);
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

export function nextBoardOrder(entries: BoardRegistryEntry[]): number {
  if (entries.length === 0) return 0;
  return Math.max(...entries.map((e) => e.order)) + 1;
}

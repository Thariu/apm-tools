export type BoardId = "baseball_board" | "proposal_improvement" | "ad_hoc";

export type AppView = "planning" | "memberTasks" | "retro" | "dailyProgress";

export type TaskLane = "todo" | "doing" | "done" | "cant";

/** @deprecated 互換用。子タスクは TaskLane を使用 */
export type Lane = "backlog" | TaskLane;

export type ProductBacklogItem = {
  id: string;
  boardId: BoardId;
  title: string;
  /** 依頼内容など外部ページへの URL（http/https のみ） */
  requestUrl?: string;
  goalText: string;
  points?: number;
  assignees?: string[];
};

export type Task = {
  id: string;
  boardId: BoardId;
  parentIssueId: string;
  issueKey?: string;
  title: string;
  issueType?: string;
  backlogCategoryId: string;
  lane: TaskLane;
  /** 同一レーン内の表示順（昇順＝上から下） */
  sortOrder?: number;
  /** 作成日時（並びのフォールバック・表示用） */
  createdAt?: number;
  points?: number;
  /** 予定工数（時間）。表示は Nh（例: 3h, 1.5h） */
  estimatedHours?: number;
  /**
   * Doing レーン時の進捗（25 / 50 / 75）。
   * Done 等では未設定。ボード上もこのときだけ表示する。
   */
  progressPercent?: 25 | 50 | 75;
  assignees?: string[];
  /** ISO形式 YYYY-MM-DD。表示は M/D（例: 5/14） */
  startDate?: string;
  /** ISO形式 YYYY-MM-DD。表示は M/D（例: 5/18） */
  dueDate?: string;
};

/** タスク部分更新。progressPercent: null で Firestore から削除 */
export type TaskPatch = Omit<Partial<Task>, "progressPercent"> & {
  progressPercent?: Task["progressPercent"] | null;
};

/** @deprecated レガシー移行用。新規は TaskTemplateSet を使用 */
export type TaskTemplate = {
  id: string;
  title: string;
  /** 一覧の表示順（昇順） */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskTemplateItem = {
  id: string;
  title: string;
  /** セット内の表示順（昇順） */
  sortOrder: number;
};

/** チーム共有のタスクテンプレセット（例: A用 / B用） */
export type TaskTemplateSet = {
  id: string;
  name: string;
  /** セット一覧の表示順（昇順） */
  sortOrder: number;
  items: TaskTemplateItem[];
  createdAt: string;
  updatedAt: string;
};

export type WeekdayKey =
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "monday";

export type SprintSchedule = Record<WeekdayKey, string>;

/** boards/{boardId}/schedule/default（曜日担当 + スプリントゴール） */
export type BoardScheduleDoc = SprintSchedule & {
  sprintGoal?: string;
};

export type RetroFramework = "fdl" | "happiness";

export type RetroDraft = {
  boardId: BoardId;
  sprintKey: string;
  participants: string[];
  updatedAt: string;
};

/** 全ボード共通のファシリテーション担当者順（スプリント単位） */
export type RetroFacilitation = {
  sprintKey: string;
  participants: string[];
  updatedAt: string;
  /**
   * 幸福指標の入力者ロック（ソフトロック/TTL、担当者ごと）
   * - キー: 担当者名
   * - 値: ロック情報 or null（解除）
   * - expiresAt を過ぎたロックはクライアント側で無視する
   */
  happinessLocks?: Record<
    string,
    | {
        /** ロックを保持するクライアント（ブラウザ）識別子 */
        clientId: string;
        updatedAt: string;
        expiresAt: string;
      }
    | null
  >;
};

export type RetroNote = {
  id: string;
  text: string;
  createdAt: number;
};

export type RetroFdlTag = "fun" | "done" | "learn";

export type RetroFdlNote = RetroNote & {
  /**
   * 付箋の所属カテゴリ（複数可）
   * 例: ["done","learn"] = DONE∩LEARN
   */
  tags: RetroFdlTag[];
  /** ベン図キャンバス上の位置（0〜1 の相対座標） */
  x?: number;
  y?: number;
  /** 付箋の幅（px） */
  width?: number;
  /** 付箋の高さ（px） */
  height?: number;
  /** 付箋の投稿者（1名） */
  author?: string;
};

export type RetroFdlData = {
  /** v2: 単一リスト＋複数タグ */
  notes?: RetroFdlNote[];
  /** 担当者名 → ネクストアクション */
  nextActionsByParticipant?: Record<string, string>;
  /** チェックイン：感謝（Thank you）の付箋 */
  thankYouNotes?: RetroThankYouNote[];
  /** legacy: 以前の3配列（読み込み互換のため残す） */
  fun?: RetroNote[];
  done?: RetroNote[];
  learn?: RetroNote[];
};

export type RetroHappinessScores = {
  role: number | null;
  team: number | null;
  company: number | null;
};

export type RetroHappinessNote = RetroNote & {
  /** 付箋の投稿者（入力者から自動設定） */
  author?: string;
  /** 付箋の幅（px）。未設定時はテキスト量から自動 */
  width?: number;
  /** 付箋の高さ（px）。未設定時はテキスト量から自動 */
  height?: number;
};

/** 感謝（Thank you）チェックイン用付箋（幸福指標付箋と同形状） */
export type RetroThankYouNote = RetroHappinessNote;

export type RetroHappinessData = {
  /** 参加者名 → 役割/チーム/会社 の 1〜5 スコア */
  scoresByParticipant: Record<string, RetroHappinessScores>;
  reasons: RetroHappinessNote[];
  improvements: RetroHappinessNote[];
};

export type RetroSession = {
  /** @deprecated 共有振り返りでは未使用（移行データにのみ残る場合あり） */
  boardId?: BoardId;
  sprintKey: string;
  /** 付箋がサブコレクションに保存済み（embedded 配列は使わない） */
  notesInSubcollections?: boolean;
  framework: RetroFramework;
  participants: string[];
  facilitatorIndex: number;
  /** スプリント営業日（アーカイブ判定・表示用スナップショット） */
  businessDayIsos?: string[];
  /** 過去振り返りへ移した日時（ISO） */
  archivedAt?: string;
  /** アーカイブ時点の参加者順（読み取り専用表示用） */
  archivedParticipants?: string[];
  fdl?: RetroFdlData;
  happiness?: RetroHappinessData;
  createdAt: string;
  updatedAt: string;
  previous?: {
    framework: RetroFramework;
    participants: string[];
    facilitatorIndex: number;
    fdl?: RetroFdlData;
    happiness?: RetroHappinessData;
    savedAt: string;
  };
};

export type BurndownPoint = {
  day: string;
  /** ISO YYYY-MM-DD（営業日編集用） */
  dayIso?: string;
  ideal: number;
  /** 未計測・未来日は null */
  actual: number | null;
};

/** 形式: `{lane}:{parentIssueId}` 例: `todo:bb-p1` */
export type DropZoneId = `${TaskLane}:${string}`;

export const TASK_LANE_LABELS: Record<TaskLane, string> = {
  todo: "ToDo",
  doing: "Doing",
  done: "Done",
  cant: "Can't",
};

export type KanbanColumnKey = "backlog" | TaskLane;

export const KANBAN_COLUMNS: { key: KanbanColumnKey; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "ToDo" },
  { key: "doing", label: "Doing" },
  { key: "done", label: "Done" },
  { key: "cant", label: "Can't" },
];

/** 列のアクセント色（ヘッダー下線・タスク枠で共通） */
export const KANBAN_COLUMN_ACCENT_BORDER: Record<KanbanColumnKey, string> = {
  backlog: "border-orange-600",
  todo: "border-yellow-500",
  doing: "border-green-400",
  done: "border-gray-400",
  cant: "border-purple-500",
};

/** タスクカード枠線（ToDo / Doing / Done / Can't） */
export const TASK_LANE_BORDER_CLASS: Record<TaskLane, string> = {
  todo: KANBAN_COLUMN_ACCENT_BORDER.todo,
  doing: KANBAN_COLUMN_ACCENT_BORDER.doing,
  done: KANBAN_COLUMN_ACCENT_BORDER.done,
  cant: KANBAN_COLUMN_ACCENT_BORDER.cant,
};

/** カンバン列ヘッダーの背景・下線 */
export const KANBAN_COLUMN_HEADER_STYLES: Record<KanbanColumnKey, string> = {
  backlog: `bg-orange-100 border-b-4 ${KANBAN_COLUMN_ACCENT_BORDER.backlog}`,
  todo: `bg-amber-100 border-b-4 ${KANBAN_COLUMN_ACCENT_BORDER.todo}`,
  doing: `bg-green-100 border-b-4 ${KANBAN_COLUMN_ACCENT_BORDER.doing}`,
  done: `bg-gray-200 border-b-4 ${KANBAN_COLUMN_ACCENT_BORDER.done}`,
  cant: `bg-purple-100 border-b-4 ${KANBAN_COLUMN_ACCENT_BORDER.cant}`,
};

export function makeDropZoneId(lane: TaskLane, parentIssueId: string): DropZoneId {
  return `${lane}:${parentIssueId}`;
}

export function parseDropZoneId(zoneId: string): {
  lane: TaskLane;
  parentIssueId: string;
} | null {
  const sep = zoneId.indexOf(":");
  if (sep === -1) return null;
  const lane = zoneId.slice(0, sep) as TaskLane;
  const parentIssueId = zoneId.slice(sep + 1);
  if (!["todo", "doing", "done", "cant"].includes(lane)) return null;
  return { lane, parentIssueId };
}

/**
 * 初期投入用のゴール候補。
 * 現在の候補表示は Firestore（goal_text_directory）のみを参照し、
 * ここはシード・初期化用途に限定する（= 後から削除可能にするため）。
 */
export const DEFAULT_GOAL_TEXT_CANDIDATES = [
  "制作できている状態",
  "公開できている状態",
] as const;

export const GOAL_TEXT_CUSTOM_OPTION = "__custom__";


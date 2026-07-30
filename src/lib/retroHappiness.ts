import type {
  RetroHappinessData,
  RetroHappinessNote,
  RetroHappinessScores,
} from "@/lib/types";

export function emptyRetroHappinessScores(): RetroHappinessScores {
  return { role: null, team: null, company: null };
}

export function isRetroHappinessScoresComplete(
  scores: RetroHappinessScores | undefined,
): boolean {
  if (!scores) return false;
  return scores.role != null && scores.team != null && scores.company != null;
}

type LegacyHappinessShape = RetroHappinessData & {
  /** 旧: セッション共有の1セット */
  scores?: RetroHappinessScores;
};

/** Firestore / 旧データを個人別 scoresByParticipant に正規化 */
export function normalizeRetroHappinessData(
  raw: RetroHappinessData | LegacyHappinessShape | undefined,
  options?: { legacyAssignTo?: string },
): RetroHappinessData {
  const reasons = raw?.reasons ?? [];
  const improvements = raw?.improvements ?? [];
  let scoresByParticipant = { ...(raw?.scoresByParticipant ?? {}) };

  const legacy = (raw as LegacyHappinessShape | undefined)?.scores;
  const legacyHasValue =
    legacy &&
    (legacy.role != null || legacy.team != null || legacy.company != null);
  const mapEmpty = Object.keys(scoresByParticipant).length === 0;

  if (legacyHasValue && mapEmpty && options?.legacyAssignTo) {
    scoresByParticipant = {
      [options.legacyAssignTo]: {
        role: legacy.role ?? null,
        team: legacy.team ?? null,
        company: legacy.company ?? null,
      },
    };
  }

  return { scoresByParticipant, reasons, improvements };
}

export function renameHappinessParticipantKey(
  map: Record<string, RetroHappinessScores>,
  fromName: string,
  toName: string,
): Record<string, RetroHappinessScores> {
  const from = fromName.trim();
  const to = toName.trim();
  if (!from || !to || from === to) return map;
  const next = { ...map };
  const existing = next[from];
  if (existing !== undefined) {
    delete next[from];
    next[to] = next[to] ?? existing;
  }
  return next;
}

export function deleteHappinessParticipantKey(
  map: Record<string, RetroHappinessScores>,
  name: string,
): Record<string, RetroHappinessScores> {
  const key = name.trim();
  if (!key || !(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

export type HappinessCellLabels = Record<
  keyof RetroHappinessScores,
  Record<number, string[]>
>;

const HAPPINESS_SCORE_KEYS: (keyof RetroHappinessScores)[] = [
  "role",
  "team",
  "company",
];

function newColumnLabelBuckets(): Record<number, string[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [] };
}

function emptyHappinessCellLabels(): HappinessCellLabels {
  // 行・列ごとに別配列が必要（共有すると他行の選択が同じ列に漏れる）
  return {
    role: newColumnLabelBuckets(),
    team: newColumnLabelBuckets(),
    company: newColumnLabelBuckets(),
  };
}

/** 3×5 マトリクス各セルに表示する参加者名一覧 */
export function buildHappinessCellLabels(
  scoresByParticipant: Record<string, RetroHappinessScores>,
): HappinessCellLabels {
  const out = emptyHappinessCellLabels();
  for (const [rawName, scores] of Object.entries(scoresByParticipant)) {
    const name = rawName.trim();
    if (!name) continue;
    for (const row of HAPPINESS_SCORE_KEYS) {
      const value = scores[row];
      if (value == null || value < 1 || value > 5) continue;
      out[row][value].push(name);
    }
  }
  for (const row of HAPPINESS_SCORE_KEYS) {
    for (let v = 1; v <= 5; v++) {
      out[row][v].sort((a, b) => a.localeCompare(b, "ja-JP"));
    }
  }
  return out;
}

/** FDL 付箋と同じ基準サイズ */
export const HAPPINESS_NOTE_BASE_WIDTH = 118;
export const HAPPINESS_NOTE_BASE_HEIGHT = 96;
export const HAPPINESS_NOTE_MIN_WIDTH = 80;
export const HAPPINESS_NOTE_MIN_HEIGHT = 64;
export const HAPPINESS_NOTE_MAX_WIDTH = 520;
export const HAPPINESS_NOTE_MAX_HEIGHT = 420;
const HAPPINESS_NOTE_CHARS_PER_LINE = 12;
const HAPPINESS_NOTE_LINE_HEIGHT_PX = 18;
const HAPPINESS_NOTE_WIDTH_PER_CHAR_PX = 9;
const HAPPINESS_NOTE_CHROME_HEIGHT_PX = 52;

function clampHappinessNoteSize(v: number, min: number, max: number) {
  return Math.round(Math.max(min, Math.min(max, v)));
}

/** 入力テキストから付箋の表示サイズ（px）を算出 */
export function computeHappinessNoteSize(text: string): {
  width: number;
  height: number;
} {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.length === 0 ? [""] : normalized.split("\n");
  let maxLineChars = 0;
  for (const line of lines) {
    maxLineChars = Math.max(maxLineChars, line.length);
  }
  const wrappedLines = lines.reduce(
    (sum, line) =>
      sum + Math.max(1, Math.ceil(line.length / HAPPINESS_NOTE_CHARS_PER_LINE)),
    0,
  );
  const lineCount = Math.max(1, wrappedLines);

  const width = clampHappinessNoteSize(
    Math.max(
      HAPPINESS_NOTE_BASE_WIDTH,
      maxLineChars * HAPPINESS_NOTE_WIDTH_PER_CHAR_PX + 24,
    ),
    HAPPINESS_NOTE_BASE_WIDTH,
    HAPPINESS_NOTE_MAX_WIDTH,
  );
  const height = clampHappinessNoteSize(
    Math.max(
      HAPPINESS_NOTE_BASE_HEIGHT,
      lineCount * HAPPINESS_NOTE_LINE_HEIGHT_PX + HAPPINESS_NOTE_CHROME_HEIGHT_PX,
    ),
    HAPPINESS_NOTE_BASE_HEIGHT,
    HAPPINESS_NOTE_MAX_HEIGHT,
  );

  return { width, height };
}

export function happinessNoteWidth(
  note: Pick<RetroHappinessNote, "width">,
  text = "",
): number {
  if (typeof note.width === "number") {
    return clampHappinessNoteSize(
      note.width,
      HAPPINESS_NOTE_MIN_WIDTH,
      HAPPINESS_NOTE_MAX_WIDTH,
    );
  }
  return computeHappinessNoteSize(text).width;
}

export function happinessNoteHeight(
  note: Pick<RetroHappinessNote, "height">,
  text = "",
): number {
  if (typeof note.height === "number") {
    return clampHappinessNoteSize(
      note.height,
      HAPPINESS_NOTE_MIN_HEIGHT,
      HAPPINESS_NOTE_MAX_HEIGHT,
    );
  }
  return computeHappinessNoteSize(text).height;
}

export type HappinessNotesAuthorGroup = {
  /** 空文字 = 担当者未設定 */
  authorKey: string;
  displayName: string;
  notes: RetroHappinessNote[];
};

function happinessScoresHasAnyValue(scores: RetroHappinessScores): boolean {
  return scores.role != null || scores.team != null || scores.company != null;
}

/** 3×5 マトリクスに名前が載っている人（1点でも入力済み） */
export function collectHappinessMatrixParticipantNames(
  scoresByParticipant: Record<string, RetroHappinessScores>,
  participants: string[],
): string[] {
  const scorerKeys = new Set<string>();
  for (const [raw, scores] of Object.entries(scoresByParticipant)) {
    const name = raw.trim();
    if (!name || !happinessScoresHasAnyValue(scores)) continue;
    scorerKeys.add(name);
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of participants) {
    const name = raw.trim();
    if (!name || !scorerKeys.has(name) || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  const extras = Array.from(scorerKeys)
    .filter((n) => !seen.has(n))
    .sort((a, b) => a.localeCompare(b, "ja-JP"));
  for (const name of extras) {
    seen.add(name);
    result.push(name);
  }
  return result;
}

/** 付箋列のブロック順（マトリクス掲載者を優先） */
export function resolveHappinessNoteSectionNames(
  scoresByParticipant: Record<string, RetroHappinessScores>,
  participants: string[],
  notes: RetroHappinessNote[],
  activeParticipant?: string,
): string[] {
  const result = collectHappinessMatrixParticipantNames(
    scoresByParticipant,
    participants,
  );
  const seen = new Set(result);

  const active = activeParticipant?.trim();
  if (active && !seen.has(active)) {
    result.push(active);
    seen.add(active);
  }

  for (const note of notes) {
    const author = note.author?.trim();
    if (!author || seen.has(author)) continue;
    result.push(author);
    seen.add(author);
  }

  return result;
}

/** 参加者順で付箋を担当者ブロックにまとめる */
export function groupHappinessNotesByAuthor(
  notes: RetroHappinessNote[],
  sectionNames: string[],
): HappinessNotesAuthorGroup[] {
  const buckets = new Map<string, RetroHappinessNote[]>();

  for (const note of notes) {
    const key = note.author?.trim() ?? "";
    const list = buckets.get(key) ?? [];
    list.push(note);
    buckets.set(key, list);
  }

  const sortNotes = (arr: RetroHappinessNote[]) =>
    [...arr].sort((a, b) => a.createdAt - b.createdAt);

  const groups: HappinessNotesAuthorGroup[] = [];
  const seen = new Set<string>();

  for (const raw of sectionNames) {
    const key = raw.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    groups.push({
      authorKey: key,
      displayName: key,
      notes: sortNotes(buckets.get(key) ?? []),
    });
  }

  const extraAuthors = Array.from(buckets.keys())
    .filter((key) => key !== "" && !seen.has(key))
    .sort((a, b) => a.localeCompare(b, "ja-JP"));

  for (const key of extraAuthors) {
    groups.push({
      authorKey: key,
      displayName: key,
      notes: sortNotes(buckets.get(key) ?? []),
    });
  }

  const unassigned = buckets.get("");
  if (unassigned?.length) {
    groups.push({
      authorKey: "",
      displayName: "担当者未設定",
      notes: sortNotes(unassigned),
    });
  }

  return groups;
}

/** 1軸の点数を更新。value が null のときは解除。 */
export function patchHappinessParticipantScore(
  scoresByParticipant: Record<string, RetroHappinessScores>,
  participantName: string,
  row: keyof RetroHappinessScores,
  value: number | null,
): Record<string, RetroHappinessScores> {
  const name = participantName.trim();
  if (!name) return scoresByParticipant;

  const current = scoresByParticipant[name] ?? emptyRetroHappinessScores();
  const nextScores: RetroHappinessScores = { ...current, [row]: value };
  return { ...scoresByParticipant, [name]: nextScores };
}

export function renameHappinessNoteAuthors(
  notes: RetroHappinessNote[],
  fromName: string,
  toName: string,
): RetroHappinessNote[] {
  const from = fromName.trim();
  const to = toName.trim();
  if (!from || !to || from === to) return notes;
  return notes.map((n) => (n.author?.trim() === from ? { ...n, author: to } : n));
}

export const RETRO_HAPPINESS_ACTIVE_STORAGE_PREFIX = "retroHappinessActive:";

export function retroHappinessActiveStorageKey(sprintKey: string): string {
  return `${RETRO_HAPPINESS_ACTIVE_STORAGE_PREFIX}${sprintKey}`;
}

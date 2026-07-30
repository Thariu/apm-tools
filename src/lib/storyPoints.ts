/** プランニングポーカーで使うフィボナッチ系ストーリーポイント（最大 55） */
export const FIBONACCI_STORY_POINTS = [1, 2, 3, 5, 8, 13, 21, 34, 55] as const;

export function formatStoryPoints(points?: number): string {
  const n = normalizeStoryPoint(points);
  return n != null ? `${n}P` : "—";
}

export type StoryPoint = (typeof FIBONACCI_STORY_POINTS)[number];

const STORY_POINT_SET = new Set<number>(FIBONACCI_STORY_POINTS);

export function isStoryPoint(value: number): value is StoryPoint {
  return STORY_POINT_SET.has(value);
}

export function normalizeStoryPoint(value?: number): StoryPoint | undefined {
  if (value == null) return undefined;
  return isStoryPoint(value) ? value : undefined;
}

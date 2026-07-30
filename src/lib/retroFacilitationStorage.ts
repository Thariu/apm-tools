const STORAGE_KEY_PREFIX = "retroFacilitationParticipants:v1:";

/** リロード直後の表示用: スプリントごとの担当者順を localStorage にキャッシュ */
export function readCachedFacilitationParticipants(sprintKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${sprintKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function writeCachedFacilitationParticipants(
  sprintKey: string,
  participants: string[],
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${sprintKey}`,
      JSON.stringify(participants),
    );
  } catch {
    // quota / private mode などは無視
  }
}

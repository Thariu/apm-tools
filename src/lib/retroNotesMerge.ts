/**
 * 振り返り付箋（FDL / 幸福指標）の配列を ID でマージする。
 * Firestore 上は retro_sessions/{sprintKey} 配下のサブコレクション（1付箋1ドキュメント）だが、
 * 書き込み時はサーバー最新 + ローカル差分をマージして同時編集の欠落を防ぐ。
 */

export type RetroNoteLike = { id: string; createdAt?: number };

/** サーバー配列にローカル更新を ID 単位で上書き・追加する */
export function mergeNotesById<T extends RetroNoteLike>(
  serverNotes: T[],
  updates: T[],
): T[] {
  const byId = new Map(serverNotes.map((n) => [n.id, n]));
  for (const u of updates) {
    const prev = byId.get(u.id);
    byId.set(u.id, prev ? ({ ...prev, ...u } as T) : u);
  }
  return sortNotesByOrder([...byId.values()]);
}

/** 指定 ID の付箋だけ部分更新 */
export function patchNoteInList<T extends RetroNoteLike>(
  notes: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  return mergeNotesById(
    notes,
    notes
      .filter((n) => n.id === id)
      .map((n) => ({ ...n, ...patch, id })),
  );
}

export function removeNoteFromList<T extends RetroNoteLike>(
  notes: T[],
  id: string,
): T[] {
  return notes.filter((n) => n.id !== id);
}

function sortNotesByOrder<T extends RetroNoteLike>(notes: T[]): T[] {
  return [...notes].sort((a, b) => {
    const ca = a.createdAt ?? 0;
    const cb = b.createdAt ?? 0;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });
}

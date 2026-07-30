import type { TaskTemplateItem, TaskTemplateSet } from "./types";

/** レガシー移行で自動作成されたセット名（削除対象） */
export const LEGACY_DEFAULT_SET_NAME = "既定";

export function sortTemplateItems(items: TaskTemplateItem[]): TaskTemplateItem[] {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, "ja-JP");
  });
}

export function normalizeTaskTemplateSet(
  raw: Partial<TaskTemplateSet> & { name?: unknown; items?: unknown },
  docId: string,
): TaskTemplateSet | null {
  const id = typeof raw.id === "string" ? raw.id : docId;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const sortOrder =
    typeof raw.sortOrder === "number" && Number.isFinite(raw.sortOrder)
      ? raw.sortOrder
      : Number.MAX_SAFE_INTEGER;
  const createdAt =
    typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString();
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;

  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items: TaskTemplateItem[] = [];
  for (let i = 0; i < itemsRaw.length; i++) {
    const row = itemsRaw[i] as Partial<TaskTemplateItem> & { title?: unknown };
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!title) continue;
    const itemId =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim()
        : `legacy-item-${i}`;
    const itemSortOrder =
      typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder)
        ? row.sortOrder
        : i;
    items.push({ id: itemId, title, sortOrder: itemSortOrder });
  }

  return {
    id: String(id),
    name,
    sortOrder,
    items: sortTemplateItems(items),
    createdAt,
    updatedAt,
  };
}

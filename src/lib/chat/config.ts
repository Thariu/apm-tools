export type ChatSlot = "midday" | "evening";

function parseJsonRecord(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) {
        out[key.trim().toLowerCase()] = value.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function getChatSyncSecret(): string | null {
  const secret = process.env.CHAT_SYNC_SECRET?.trim();
  return secret || null;
}

/** Chat ユーザーのメール → ボード担当者名 */
export function getChatMemberMap(): Record<string, string> {
  return parseJsonRecord(process.env.CHAT_MEMBER_MAP);
}

/** Chat ユーザーのメール → spaces/xxx（DM 用） */
export function getChatSpaceMap(): Record<string, string> {
  return parseJsonRecord(process.env.CHAT_SPACE_MAP);
}

export function getChatAccessToken(): string | null {
  const token = process.env.CHAT_ACCESS_TOKEN?.trim();
  return token || null;
}

export function resolveAssigneeName(email: string | undefined | null): string | null {
  if (!email?.trim()) return null;
  const map = getChatMemberMap();
  return map[email.trim().toLowerCase()] ?? null;
}

export function resolveSpaceName(email: string | undefined | null): string | null {
  if (!email?.trim()) return null;
  const map = getChatSpaceMap();
  return map[email.trim().toLowerCase()] ?? null;
}

export function parseChatSlot(raw: string | null | undefined): ChatSlot | null {
  if (raw === "midday" || raw === "evening") return raw;
  if (raw === "morning") return "midday";
  return null;
}

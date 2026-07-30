import {
  buildDefaultBusinessDayIsos,
  normalizeBusinessDayIsos,
} from "@/lib/burndown";
import { toIsoDateString } from "@/lib/dateUtils";
import type { RetroSession } from "@/lib/types";

/** 過去振り返りとして保持する最大件数（ボードごと） */
export const MAX_ARCHIVED_RETRO_SESSIONS = 10;

/** 最終営業日の翌日に振り返り → その翌日 0:00 から過去扱い */
export const RETRO_ARCHIVE_DAYS_AFTER_LAST_BUSINESS = 2;

export function addCalendarDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toIsoDateString(d);
}

/** 最終営業日 + 2 日の 0:00（ISO 日付）からアーカイブ */
export function getRetroArchiveStartIso(
  businessDayIsos: string[],
): string | null {
  const days = normalizeBusinessDayIsos(businessDayIsos);
  if (days.length === 0) return null;
  return addCalendarDays(days[days.length - 1], RETRO_ARCHIVE_DAYS_AFTER_LAST_BUSINESS);
}

export function isRetroArchiveDue(
  businessDayIsos: string[],
  now: Date = new Date(),
): boolean {
  const startIso = getRetroArchiveStartIso(businessDayIsos);
  if (!startIso) return false;
  const start = new Date(`${startIso}T00:00:00`);
  return now.getTime() >= start.getTime();
}

export function isRetroSessionArchived(
  session: RetroSession | null | undefined,
): boolean {
  return Boolean(session?.archivedAt);
}

export function resolveRetroBusinessDayIsos(
  session: RetroSession,
  options: {
    activeSprintKey: string;
    activeSprintBusinessDayIsos: string[];
  },
): string[] {
  if (session.businessDayIsos?.length) {
    return normalizeBusinessDayIsos(session.businessDayIsos);
  }
  if (session.sprintKey === options.activeSprintKey) {
    return normalizeBusinessDayIsos(options.activeSprintBusinessDayIsos);
  }
  return buildDefaultBusinessDayIsos(session.sprintKey);
}

/** アーカイブ対象か（未アーカイブかつ期限到達） */
export function shouldArchiveRetroSession(
  session: RetroSession,
  businessDayIsos: string[],
  now: Date = new Date(),
): boolean {
  if (session.archivedAt) return false;
  return isRetroArchiveDue(businessDayIsos, now);
}

export function sortArchivedRetroSessions(
  sessions: RetroSession[],
): RetroSession[] {
  return [...sessions]
    .filter((s) => s.archivedAt)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
}

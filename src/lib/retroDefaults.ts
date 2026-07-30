import { createId } from "@/lib/id";
import { computeHappinessNoteSize } from "@/lib/retroHappiness";
import type {
  RetroFramework,
  RetroFdlData,
  RetroHappinessData,
  RetroHappinessNote,
  RetroSession,
  RetroThankYouNote,
} from "@/lib/types";

export function defaultRetroFdlData(): RetroFdlData {
  return { notes: [], thankYouNotes: [], nextActionsByParticipant: {} };
}

export function renameRecordKey<T>(
  map: Record<string, T>,
  fromName: string,
  toName: string,
): Record<string, T> {
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

export function deleteRecordKey<T>(
  map: Record<string, T>,
  name: string,
): Record<string, T> {
  const key = name.trim();
  if (!key || !(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

export function defaultRetroHappinessData(): RetroHappinessData {
  return {
    scoresByParticipant: {},
    reasons: [],
    improvements: [],
  };
}

export function createRetroSession(args: {
  sprintKey: string;
  framework: RetroFramework;
  participants: string[];
  businessDayIsos?: string[];
}): RetroSession {
  const now = new Date().toISOString();
  return {
    sprintKey: args.sprintKey,
    framework: args.framework,
    participants: args.participants,
    facilitatorIndex: 0,
    notesInSubcollections: true,
    ...(args.businessDayIsos?.length
      ? { businessDayIsos: args.businessDayIsos }
      : {}),
    fdl: args.framework === "fdl" ? { nextActionsByParticipant: {} } : undefined,
    happiness:
      args.framework === "happiness" ? defaultRetroHappinessData() : undefined,
    createdAt: now,
    updatedAt: now,
    previous: undefined,
  };
}

export function createRetroNote(text = "") {
  return {
    id: createId("note"),
    text,
    createdAt: Date.now(),
  };
}

export function createRetroHappinessNote(
  text = "",
  author?: string,
): RetroHappinessNote {
  const name = author?.trim();
  const { width, height } = computeHappinessNoteSize(text);
  return {
    id: createId("note"),
    text,
    createdAt: Date.now(),
    width,
    height,
    ...(name ? { author: name } : {}),
  };
}

export function duplicateRetroHappinessNote(
  source: RetroHappinessNote,
): RetroHappinessNote {
  const next = createRetroHappinessNote(source.text, source.author);
  return {
    ...next,
    ...(typeof source.width === "number" ? { width: source.width } : {}),
    ...(typeof source.height === "number" ? { height: source.height } : {}),
  };
}

export function createRetroThankYouNote(
  text = "",
  author?: string,
): RetroThankYouNote {
  return createRetroHappinessNote(text, author);
}

export function duplicateRetroThankYouNote(
  source: RetroThankYouNote,
): RetroThankYouNote {
  return duplicateRetroHappinessNote(source);
}


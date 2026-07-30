import type { ChatSlot } from "./config";

export type ChatUser = {
  name?: string;
  email?: string;
  displayName?: string;
};

export type ChatEvent = {
  type?: string;
  user?: ChatUser;
  message?: {
    text?: string;
    argumentText?: string;
  };
  action?: {
    actionMethodName?: string;
    function?: string;
    parameters?: { key?: string; value?: string }[];
  };
  common?: {
    user?: ChatUser;
    formInputs?: Record<string, unknown>;
  };
  appCommandMetadata?: {
    appCommandId?: number;
  };
};

export function getEventUser(event: ChatEvent): ChatUser | null {
  return event.common?.user ?? event.user ?? null;
}

export function getActionName(event: ChatEvent): string {
  return (
    event.action?.actionMethodName ||
    event.action?.function ||
    ""
  );
}

export function getActionParams(
  event: ChatEvent,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of event.action?.parameters ?? []) {
    if (p.key && p.value != null) out[p.key] = p.value;
  }
  return out;
}

/** cardsV2 formInputs からテキスト値を取り出す */
export function getFormText(
  event: ChatEvent,
  name: string,
): string {
  const inputs = event.common?.formInputs;
  if (!inputs || typeof inputs !== "object") return "";

  const node = inputs[name] as Record<string, unknown> | undefined;
  if (!node) return "";

  // stringInputs.value[]
  const stringInputs = node.stringInputs as
    | { value?: string[] }
    | undefined;
  if (stringInputs?.value?.[0]) return String(stringInputs.value[0]).trim();

  // 一部の形式では "" キー配下
  const nested = node[""] as { stringInputs?: { value?: string[] } } | undefined;
  if (nested?.stringInputs?.value?.[0]) {
    return String(nested.stringInputs.value[0]).trim();
  }

  return "";
}

export function detectSlotFromText(text: string): ChatSlot {
  const t = text.trim();
  if (/夕|evening|17/.test(t)) return "evening";
  return "midday";
}

export function isDailyTaskTrigger(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return /今日|タスク|進捗|朝|昼|夕|morning|midday|evening|today/i.test(t);
}

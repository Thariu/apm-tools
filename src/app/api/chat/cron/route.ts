import {
  chatSecretMissingResponse,
  unauthorizedChatResponse,
  verifyChatSyncSecret,
} from "@/lib/chat/auth";
import {
  getChatMemberMap,
  getChatSpaceMap,
  getChatSyncSecret,
  parseChatSlot,
} from "@/lib/chat/config";
import { sendChatMessage } from "@/lib/chat/sendMessage";
import { buildDispatchCard } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function dispatch(request: Request) {
  if (!getChatSyncSecret()) {
    return chatSecretMissingResponse();
  }
  if (!verifyChatSyncSecret(request)) {
    return unauthorizedChatResponse();
  }

  const url = new URL(request.url);
  let slot = parseChatSlot(url.searchParams.get("slot"));

  if (!slot && request.method === "POST") {
    try {
      const body = (await request.json()) as { slot?: string };
      slot = parseChatSlot(body.slot ?? null);
    } catch {
      // ignore
    }
  }

  if (!slot) {
    return Response.json(
      { error: "slot is required (midday|evening)" },
      { status: 400 },
    );
  }

  const memberMap = getChatMemberMap();
  const spaceMap = getChatSpaceMap();
  const emails = Object.keys(memberMap);

  if (emails.length === 0) {
    return Response.json(
      { error: "CHAT_MEMBER_MAP is empty" },
      { status: 503 },
    );
  }

  const results: {
    email: string;
    assigneeName: string;
    status: "sent" | "skipped" | "error";
    detail?: string;
    taskCount?: number;
  }[] = [];

  for (const email of emails) {
    const assigneeName = memberMap[email];
    const spaceName = spaceMap[email];
    if (!spaceName) {
      results.push({
        email,
        assigneeName,
        status: "error",
        detail: "CHAT_SPACE_MAP に space がありません",
      });
      continue;
    }

    try {
      const card = await buildDispatchCard({ assigneeName, slot });
      if (card.skipped) {
        results.push({
          email,
          assigneeName,
          status: "skipped",
          taskCount: 0,
          detail: "未完了タスクなし",
        });
        continue;
      }

      const sent = await sendChatMessage({
        spaceName,
        message: card.message,
      });
      if (!sent.ok) {
        results.push({
          email,
          assigneeName,
          status: "error",
          detail: sent.error,
          taskCount: card.taskCount,
        });
        continue;
      }

      results.push({
        email,
        assigneeName,
        status: "sent",
        taskCount: card.taskCount,
      });
    } catch (err) {
      results.push({
        email,
        assigneeName,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ ok: true, slot, results });
}

export async function GET(request: Request) {
  return dispatch(request);
}

export async function POST(request: Request) {
  return dispatch(request);
}

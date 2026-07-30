import {
  chatSecretMissingResponse,
  unauthorizedChatResponse,
  verifyChatSyncSecret,
} from "@/lib/chat/auth";
import { getChatSyncSecret } from "@/lib/chat/config";
import type { ChatEvent } from "@/lib/chat/events";
import { handleChatEvent } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!getChatSyncSecret()) {
    return chatSecretMissingResponse();
  }
  if (!verifyChatSyncSecret(request)) {
    return unauthorizedChatResponse();
  }

  let event: ChatEvent;
  try {
    event = (await request.json()) as ChatEvent;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const message = await handleChatEvent(event);
    return Response.json(message);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[chat/events]", detail);
    return Response.json(
      { text: `サーバーエラー: ${detail}` },
      { status: 200 },
    );
  }
}

/** 疎通確認用 */
export async function GET(request: Request) {
  if (!getChatSyncSecret()) {
    return chatSecretMissingResponse();
  }
  if (!verifyChatSyncSecret(request)) {
    return unauthorizedChatResponse();
  }
  return Response.json({
    ok: true,
    endpoint: "/api/chat/events",
    hint: "Google Chat からの POST を受け付けます。",
  });
}

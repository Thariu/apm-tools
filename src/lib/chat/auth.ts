import { timingSafeEqual } from "crypto";
import { getChatSyncSecret } from "./config";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** URL の ?key= または Authorization: Bearer を検証 */
export function verifyChatSyncSecret(request: Request): boolean {
  const expected = getChatSyncSecret();
  if (!expected) return false;

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key && safeEqual(key, expected)) return true;

  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token && safeEqual(token, expected)) return true;
  }

  return false;
}

export function unauthorizedChatResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function chatSecretMissingResponse(): Response {
  return Response.json(
    { error: "CHAT_SYNC_SECRET is not configured" },
    { status: 503 },
  );
}

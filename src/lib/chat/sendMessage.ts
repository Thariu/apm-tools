import { getChatAccessToken } from "./config";

export async function sendChatMessage(params: {
  spaceName: string;
  message: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const token = getChatAccessToken();
  if (!token) {
    return { ok: false, error: "CHAT_ACCESS_TOKEN is not configured" };
  }

  const space = params.spaceName.replace(/^\/+/, "");
  const url = `https://chat.googleapis.com/v1/${space}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.message),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error: body || res.statusText || "Chat API request failed",
      status: res.status,
    };
  }

  return { ok: true };
}

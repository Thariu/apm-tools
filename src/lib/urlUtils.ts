/** http/https のみ許可して正規化。無効なら undefined */
export function normalizeRequestUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  return url.href;
}

export function isValidRequestUrl(raw: string): boolean {
  return normalizeRequestUrl(raw) !== undefined;
}

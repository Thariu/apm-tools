export const SESSION_COOKIE_NAME = "planning_session";

/** 7 days */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",
  /** Google Chat コールバック（CHAT_SYNC_SECRET で保護） */
  "/api/chat",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

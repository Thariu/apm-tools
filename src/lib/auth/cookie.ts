import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SEC } from "./constants";

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.AUTH_COOKIE_SECURE !== "false",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

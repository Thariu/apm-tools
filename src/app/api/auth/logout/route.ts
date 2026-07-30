import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth/cookie";

export async function POST() {
  const cookie = sessionCookieOptions();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, "", {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: 0,
  });
  return response;
}

import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/auth/config";
import { verifyCredentials } from "@/lib/auth/credentials";
import { sessionCookieOptions } from "@/lib/auth/cookie";
import { createSessionToken } from "@/lib/auth/session";

type LoginBody = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "認証が設定されていません。" },
      { status: 503 },
    );
  }

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json(
      { error: "リクエスト形式が不正です。" },
      { status: 400 },
    );
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "ID とパスワードを入力してください。" },
      { status: 400 },
    );
  }

  if (!verifyCredentials(username, password)) {
    return NextResponse.json(
      { error: "ID またはパスワードが正しくありません。" },
      { status: 401 },
    );
  }

  const token = await createSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: "セッションの作成に失敗しました。" },
      { status: 500 },
    );
  }

  const cookie = sessionCookieOptions();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, token, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
  return response;
}

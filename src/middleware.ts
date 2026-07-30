import { NextResponse, type NextRequest } from "next/server";
import { isAuthConfigured } from "@/lib/auth/config";
import { isPublicPath, SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { isValidSessionToken } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await isValidSessionToken(sessionToken);

  if (isPublicPath(pathname)) {
    if (pathname === "/login" && authenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (!authenticated) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

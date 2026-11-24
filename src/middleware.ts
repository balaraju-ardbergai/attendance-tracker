import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "ap_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-secret-do-not-use-in-production",
);

const PUBLIC_PATHS = new Set(["/", "/login", "/forgot-password", "/reset-password"]);
const AUTH_PAGES = new Set(["/login", "/forgot-password", "/reset-password"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  let session: { userId?: string; mustResetPassword?: boolean } | null = null;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret);
      session = payload as { userId?: string; mustResetPassword?: boolean };
    } catch {
      session = null;
    }
  }

  // Users with a temporary password must set a new one before anything else.
  if (session?.mustResetPassword && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  if (!session) {
    if (!PUBLIC_PATHS.has(pathname)) {
      const url = new URL("/login", req.url);
      if (pathname !== "/") url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Signed-in users don't need the auth pages.
  if (AUTH_PAGES.has(pathname) || pathname === "/") {
    return NextResponse.redirect(new URL("/attendance", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

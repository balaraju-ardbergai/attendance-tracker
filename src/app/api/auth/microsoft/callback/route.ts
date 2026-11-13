import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { getAuthSecret } from "@/lib/auth-secret";

const safePath = (path: string) => (path.startsWith("/") && !path.startsWith("//") ? path : "/attendance");

function back(origin: string, error: string) {
  return NextResponse.redirect(`${origin}/login?error=${error}`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const tenant = process.env.MS_TENANT_ID || "common";

  let next = "/attendance";
  try {
    const { payload } = await jwtVerify(url.searchParams.get("state") ?? "", getAuthSecret());
    if (payload.provider !== "microsoft") return back(origin, "microsoft");
    if (typeof payload.next === "string") next = safePath(payload.next);
  } catch {
    return back(origin, "microsoft");
  }

  if (url.searchParams.get("error") || !code) return back(origin, "microsoft");
  if (!process.env.MS_CLIENT_ID || !process.env.MS_CLIENT_SECRET) return back(origin, "microsoft_config");

  try {
    const redirectUri = `${origin}/api/auth/microsoft/callback`;
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID,
        client_secret: process.env.MS_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) return back(origin, "microsoft");

    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return back(origin, "microsoft");

    const infoRes = await fetch("https://graph.microsoft.com/oidc/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) return back(origin, "microsoft");

    const info = (await infoRes.json()) as { email?: string; preferred_username?: string };
    const email = (info.email ?? info.preferred_username)?.toLowerCase().trim();
    if (!email) return back(origin, "microsoft_email");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      console.warn(`[auth] microsoft login rejected for unknown/inactive email: ${email}`);
      return back(origin, "microsoft_unknown");
    }

    await setSessionCookie({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustResetPassword: user.mustResetPassword,
    });

    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error("[auth] microsoft callback failed:", err);
    return back(origin, "microsoft");
  }
}

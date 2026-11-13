import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/auth-secret";

const safePath = (path: string | null) => (path?.startsWith("/") && !path.startsWith("//") ? path : "/attendance");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const tenant = process.env.MS_TENANT_ID || "common";
  const clientId = process.env.MS_CLIENT_ID;

  if (!clientId || !process.env.MS_CLIENT_SECRET) {
    return NextResponse.redirect(`${origin}/login?error=microsoft_config`);
  }

  const state = await new SignJWT({ provider: "microsoft", next: safePath(url.searchParams.get("next")) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getAuthSecret());

  const authUrl = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", `${origin}/api/auth/microsoft/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
}

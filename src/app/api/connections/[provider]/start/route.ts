import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { ApiError, handleRoute, requireActiveUser } from "@/lib/api";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-secret-do-not-use-in-production",
);

// Kicks off the OAuth flow. Requires the provider's client id/secret in env;
// otherwise returns 501 so the UI can show "not configured".
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handleRoute(async () => {
    const { provider } = await params;
    if (provider !== "outlook" && provider !== "gmail") throw new ApiError(404, "Unknown provider.");
    const { user } = await requireActiveUser();

    const config = providerConfig(provider);
    if (!config.clientId || !config.clientSecret) {
      throw new ApiError(
        501,
        `${config.label} is not configured yet. Ask your administrator to set ${provider === "outlook" ? "MS_CLIENT_ID / MS_CLIENT_SECRET" : "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"}.`,
      );
    }

    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/connections/${provider}/callback`;

    const state = await new SignJWT({ userId: user.id, provider })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(secret);

    const authUrl = new URL(config.authorizeUrl);
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", config.scope);
    authUrl.searchParams.set("state", state);
    if (provider === "outlook") authUrl.searchParams.set("response_mode", "query");

    return NextResponse.redirect(authUrl.toString());
  });
}

export function providerConfig(provider: "outlook" | "gmail") {
  const tenant = process.env.MS_TENANT_ID || "common";
  return provider === "outlook"
    ? {
        label: "Outlook",
        clientId: process.env.MS_CLIENT_ID,
        clientSecret: process.env.MS_CLIENT_SECRET,
        authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        userinfoUrl: "https://graph.microsoft.com/oidc/userinfo",
        scope: "openid email profile",
      }
    : {
        label: "Gmail",
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
        scope: "openid email profile",
      };
}

import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AUDIT, logAudit } from "@/lib/audit";
import { providerConfig } from "../start/route";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-secret-do-not-use-in-production",
);

function back(origin: string, status: string, provider: string) {
  return NextResponse.redirect(`${origin}/connectors?status=${status}&provider=${provider}`);
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const origin = new URL(req.url).origin;
  const { provider } = await params;
  if (provider !== "outlook" && provider !== "gmail") return back(origin, "error", provider);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  let userId: string | null = null;
  try {
    const { payload } = await jwtVerify(state ?? "", secret);
    if (payload.provider === provider && typeof payload.userId === "string") {
      userId = payload.userId;
    }
  } catch {
    return back(origin, "error", provider);
  }
  if (!userId) return back(origin, "error", provider);
  if (oauthError || !code) return back(origin, "error", provider);

  // State can remain valid for 10 minutes; ensure the account was not removed
  // or deactivated after the OAuth flow began.
  const activeUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true, mustResetPassword: true } });
  if (!activeUser || !activeUser.isActive || activeUser.mustResetPassword) {
    return back(origin, "error", provider);
  }

  const config = providerConfig(provider);
  const redirectUri = `${origin}/api/connections/${provider}/callback`;

  try {
    const tokenRes = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId ?? "",
        client_secret: config.clientSecret ?? "",
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) return back(origin, "error", provider);
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return back(origin, "error", provider);

    const infoRes = await fetch(config.userinfoUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) return back(origin, "error", provider);
    const info = (await infoRes.json()) as { email?: string };

    await prisma.connection.upsert({
      where: { userId_provider: { userId, provider } },
      update: { accountEmail: info.email ?? null, connectedAt: new Date() },
      create: { userId, provider, accountEmail: info.email ?? null },
    });
    await logAudit({ actorId: userId, targetUserId: userId, action: AUDIT.CONNECTOR_LINKED, details: { provider } });

    return back(origin, "connected", provider);
  } catch (err) {
    console.error("[connections] callback failed:", err);
    return back(origin, "error", provider);
  }
}

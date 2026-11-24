import { prisma } from "@/lib/db";
import { handleRoute, ok, requireActiveUser } from "@/lib/api";

export const CONNECTOR_PROVIDERS = [
  { id: "outlook", label: "Outlook", envKeys: ["MS_CLIENT_ID", "MS_CLIENT_SECRET"] },
  { id: "gmail", label: "Gmail", envKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] },
] as const;

export async function GET() {
  return handleRoute(async () => {
    const { user } = await requireActiveUser();
    const connections = await prisma.connection.findMany({ where: { userId: user.id } });

    const providers = CONNECTOR_PROVIDERS.map((p) => {
      const connected = connections.find((c) => c.provider === p.id);
      return {
        id: p.id,
        label: p.label,
        configured: p.envKeys.every((k) => Boolean(process.env[k])),
        connected: Boolean(connected),
        accountEmail: connected?.accountEmail ?? null,
        connectedAt: connected?.connectedAt ?? null,
      };
    });
    return ok({ providers });
  });
}

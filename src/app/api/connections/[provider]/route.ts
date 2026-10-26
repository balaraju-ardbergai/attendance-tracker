import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, requireActiveUser } from "@/lib/api";
import { AUDIT, logAudit } from "@/lib/audit";

export async function DELETE(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handleRoute(async () => {
    const { provider } = await params;
    if (provider !== "outlook" && provider !== "gmail") throw new ApiError(404, "Unknown provider.");
    const { user } = await requireActiveUser();

    await prisma.connection.deleteMany({ where: { userId: user.id, provider } });
    await logAudit({ actorId: user.id, targetUserId: user.id, action: AUDIT.CONNECTOR_UNLINKED, details: { provider } });

    return ok({ message: "Disconnected." });
  });
}

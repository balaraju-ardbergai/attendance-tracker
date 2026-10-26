import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { AUDIT, logAudit } from "@/lib/audit";

// POST /api/teams/[id]/members — add or remove a member (admin/director only).
// Body: { userId, action: "ADD" | "REMOVE" }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const body = await readJson<{ userId?: string; action?: "ADD" | "REMOVE" }>(req);
    if (!body.userId || (body.action !== "ADD" && body.action !== "REMOVE")) {
      throw new ApiError(400, "userId and action (ADD or REMOVE) are required.");
    }

    const team = await prisma.team.findUnique({ where: { id }, select: { name: true, leadId: true } });
    if (!team) throw new ApiError(404, "Team not found.");
    const user = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, name: true, isActive: true } });
    if (!user) throw new ApiError(404, "User not found.");

    if (body.action === "ADD") {
      if (!user.isActive) throw new ApiError(400, "Inactive users cannot join a team.");
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: id, userId: user.id } },
        update: {},
        create: { teamId: id, userId: user.id },
      });
      await logAudit({ actorId: session.userId, targetUserId: user.id, action: AUDIT.TEAM_MEMBER_ADDED, details: { team: team.name } });
      return ok({ message: `${user.name} added to ${team.name}.` });
    }

    if (team.leadId === user.id) throw new ApiError(400, "Remove or replace the team lead first.");
    await prisma.teamMember.deleteMany({ where: { teamId: id, userId: user.id } });
    await logAudit({ actorId: session.userId, targetUserId: user.id, action: AUDIT.TEAM_MEMBER_REMOVED, details: { team: team.name } });
    return ok({ message: `${user.name} removed from ${team.name}.` });
  });
}

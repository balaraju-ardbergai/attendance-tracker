import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { ledTeamIds } from "@/lib/permissions";
import { fromKey, serverTodayKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";
import { REQUEST_TYPE_LABEL } from "@/lib/roles";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireActiveUser();
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") ?? "mine";
    const isManager = session.role === "ADMIN" || session.role === "DIRECTOR";

    if (scope === "team") {
      if (isManager) {
        const requests = await prisma.request.findMany({
          where: { userId: { not: session.userId } },
          include: { user: { select: { id: true, name: true, email: true, department: true, pictureUrl: true } } },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        });
        return ok({ requests });
      }
      // Team leads review requests from their direct reports and their teams' members.
      const teamIds = await ledTeamIds(session.userId);
      if (teamIds.length === 0) return ok({ requests: [] });
      const requests = await prisma.request.findMany({
        where: {
          userId: { not: session.userId },
          user: {
            OR: [
              { managerId: session.userId },
              { teamMemberships: { some: { teamId: { in: teamIds } } } },
            ],
          },
        },
        include: { user: { select: { id: true, name: true, email: true, department: true, pictureUrl: true } } },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      });
      return ok({ requests });
    }

    const requests = await prisma.request.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
    });
    return ok({ requests });
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireActiveUser();
    const body = await readJson<{ type?: string; startDate?: string; endDate?: string; reason?: string }>(req);
    const type = body.type;
    const { startDate, endDate, reason } = body;

    if (type !== "LEAVE" && type !== "WFH") throw new ApiError(400, "Request type must be LEAVE or WFH.");
    if (!startDate || !endDate || !KEY_RE.test(startDate) || !KEY_RE.test(endDate)) {
      throw new ApiError(400, "Valid start and end dates are required.");
    }
    if (startDate > endDate) throw new ApiError(400, "The start date cannot be after the end date.");
    if (startDate < serverTodayKey()) throw new ApiError(400, "The start date cannot be in the past.");
    if (!reason || reason.trim().length < 3) throw new ApiError(400, "Please provide a short reason.");

    const overlap = await prisma.request.findFirst({
      where: {
        userId: session.userId,
        status: { in: ["PENDING", "APPROVED"] },
        NOT: { endDate: { lt: fromKey(startDate) }, startDate: { gt: fromKey(endDate) } },
      },
    });
    if (overlap) {
      throw new ApiError(409, "You already have a request that overlaps these dates.");
    }

    const request = await prisma.request.create({
      data: {
        userId: session.userId,
        type,
        startDate: fromKey(startDate),
        endDate: fromKey(endDate),
        reason: reason.trim(),
      },
    });

    await logAudit({
      actorId: session.userId,
      targetUserId: session.userId,
      action: AUDIT.REQUEST_SUBMITTED,
      details: { type, startDate, endDate },
    });

    return ok({ request, message: `${REQUEST_TYPE_LABEL[type]} request submitted.` }, 201);
  });
}

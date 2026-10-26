import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { AUDIT, logAudit } from "@/lib/audit";

// GET /api/teams — all teams with lead, member count, task and expense totals.
export async function GET() {
  return handleRoute(async () => {
    await requireActiveUser();
    const teams = await prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        lead: { select: { id: true, name: true, email: true, pictureUrl: true } },
        creator: { select: { id: true, name: true } },
        _count: { select: { members: true, tasks: true, expenses: true } },
      },
    });

    const expenseTotals = await prisma.expense.groupBy({
      by: ["teamId"],
      _sum: { amount: true },
      where: { teamId: { not: null } },
    });
    const totalByTeam = new Map(expenseTotals.map((t) => [t.teamId, t._sum.amount ?? 0]));

    const taskRows = await prisma.task.groupBy({
      by: ["teamId", "status"],
      _count: { _all: true },
      where: { teamId: { not: null } },
    });
    const tasksByTeam = new Map<string, { completed: number; total: number }>();
    for (const row of taskRows) {
      if (!row.teamId) continue;
      const agg = tasksByTeam.get(row.teamId) ?? { completed: 0, total: 0 };
      agg.total += row._count._all;
      if (row.status === "COMPLETED") agg.completed += row._count._all;
      tasksByTeam.set(row.teamId, agg);
    }

    return ok({
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        lead: t.lead,
        creator: t.creator,
        memberCount: t._count.members,
        taskCount: t._count.tasks,
        expenseCount: t._count.expenses,
        expenseTotal: totalByTeam.get(t.id) ?? 0,
        tasksCompleted: tasksByTeam.get(t.id)?.completed ?? 0,
      })),
    });
  });
}

// POST /api/teams — create a team (admin/director only).
export async function POST(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const body = await readJson<{ name?: string; description?: string; leadId?: string }>(req);
    const name = body.name?.trim();
    if (!name) throw new ApiError(400, "Team name is required.");

    if (body.leadId) {
      const lead = await prisma.user.findUnique({ where: { id: body.leadId }, select: { id: true, isActive: true } });
      if (!lead || !lead.isActive) throw new ApiError(400, "Team lead not found or inactive.");
    }

    const team = await prisma.team.create({
      data: {
        name,
        description: body.description?.trim() || null,
        leadId: body.leadId || null,
        createdById: session.userId,
      },
    });

    // The lead automatically becomes a member.
    if (body.leadId) {
      await prisma.teamMember.create({ data: { teamId: team.id, userId: body.leadId } });
    }

    await logAudit({ actorId: session.userId, action: AUDIT.TEAM_CREATED, details: { teamId: team.id, name } });
    return ok({ team, message: "Team created." }, 201);
  });
}

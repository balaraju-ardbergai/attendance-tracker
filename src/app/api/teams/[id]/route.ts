import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { toKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

async function loadTeam(id: string) {
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) throw new ApiError(404, "Team not found.");
  return team;
}

// GET /api/teams/[id] — team graph data: members, task breakdown, expense spend.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    await requireActiveUser();
    const { id } = await params;
    const team = await loadTeam(id);

    const [members, tasks, expenses] = await Promise.all([
      prisma.teamMember.findMany({
        where: { teamId: id },
        include: { user: { select: { id: true, name: true, email: true, role: true, department: true, pictureUrl: true, isActive: true, managerId: true } } },
        orderBy: { joinedAt: "asc" },
      }),
      prisma.task.findMany({
        where: { teamId: id },
        include: { assignee: { select: { id: true, name: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.expense.findMany({
        where: { teamId: id },
        orderBy: { date: "desc" },
        take: 10,
        select: { id: true, title: true, amount: true, category: true, date: true },
      }),
    ]);

    const now = new Date();
    const monthStartKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const expenseTotal = await prisma.expense.aggregate({ where: { teamId: id }, _sum: { amount: true } });
    const expenseMonth = await prisma.expense.aggregate({
      where: { teamId: id, date: { gte: new Date(`${monthStartKey}T00:00:00.000Z`) } },
      _sum: { amount: true },
    });

    return ok({
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        leadId: team.leadId,
        createdAt: team.createdAt,
      },
      members: members.map((m) => m.user),
      taskStats: {
        total: tasks.length,
        todo: tasks.filter((t) => t.status === "TODO").length,
        inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
        completed: tasks.filter((t) => t.status === "COMPLETED").length,
      },
      recentTasks: tasks.slice(0, 8).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        progress: t.progress,
        assignee: t.assignee,
        dueDate: t.dueDate ? toKey(t.dueDate) : null,
      })),
      expenseTotal: expenseTotal._sum.amount ?? 0,
      expenseThisMonth: expenseMonth._sum.amount ?? 0,
      recentExpenses: expenses.map((e) => ({ ...e, date: toKey(e.date) })),
    });
  });
}

// PATCH /api/teams/[id] — rename / re-describe / set lead (admin/director only).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const team = await loadTeam(id);
    const body = await readJson<{ name?: string; description?: string; leadId?: string | null }>(req);

    if (body.leadId) {
      const lead = await prisma.user.findUnique({ where: { id: body.leadId }, select: { id: true, isActive: true } });
      if (!lead || !lead.isActive) throw new ApiError(400, "Team lead not found or inactive.");
    }

    const updated = await prisma.team.update({
      where: { id },
      data: {
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
        ...(body.leadId !== undefined ? { leadId: body.leadId || null } : {}),
      },
    });
    if (body.leadId) {
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: id, userId: body.leadId } },
        update: {},
        create: { teamId: id, userId: body.leadId },
      });
    }

    await logAudit({ actorId: session.userId, action: AUDIT.TEAM_UPDATED, details: { teamId: id, name: team.name } });
    return ok({ team: updated, message: "Team updated." });
  });
}

// DELETE /api/teams/[id] (admin/director only).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const team = await loadTeam(id);
    await prisma.team.delete({ where: { id } });
    await logAudit({ actorId: session.userId, action: AUDIT.TEAM_DELETED, details: { teamId: id, name: team.name } });
    return ok({ message: "Team deleted." });
  });
}

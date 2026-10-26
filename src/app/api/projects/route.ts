import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { canManageProject } from "@/lib/permissions";
import { AUDIT, logAudit } from "@/lib/audit";

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

// GET /api/projects — everyone sees projects; HR/Directors see all, leads see theirs,
// employees see projects of their teams + projects they're assigned to.
export async function GET() {
  return handleRoute(async () => {
    const { session } = await requireActiveUser();
    const isManager = session.role === "ADMIN" || session.role === "DIRECTOR";

    const ledTeams = await prisma.team.findMany({ where: { leadId: session.userId }, select: { id: true } });
    const memberships = await prisma.teamMember.findMany({ where: { userId: session.userId }, select: { teamId: true } });
    const visibleTeamIds = [...ledTeams.map((t) => t.id), ...memberships.map((m) => m.teamId)];

    const projects = await prisma.project.findMany({
      where: isManager
        ? {}
        : {
            OR: [
              { leadId: session.userId },
              { teamId: { in: visibleTeamIds } },
              { tasks: { some: { assigneeId: session.userId } } },
              { teamId: null },
            ],
          },
      orderBy: { createdAt: "desc" },
      include: {
        lead: { select: { id: true, name: true, email: true, pictureUrl: true } },
        team: { select: { id: true, name: true } },
        _count: { select: { tasks: true, sprints: true, phases: true } },
      },
    });

    const issueRows = await prisma.task.findMany({
      where: { projectId: { in: projects.map((p) => p.id) } },
      select: { projectId: true, status: true, progress: true, assigneeId: true, sprintId: true },
    });

    const result = projects.map((p) => {
      const rows = issueRows.filter((r) => r.projectId === p.id);
      const completed = rows.filter((r) => r.status === "COMPLETED").length;
      const mine = rows.filter((r) => r.assigneeId === session.userId && r.status !== "COMPLETED").length;
      const avgProgress = rows.length ? Math.round(rows.reduce((s, r) => s + r.progress, 0) / rows.length) : 0;
      return {
        id: p.id,
        key: p.key,
        name: p.name,
        description: p.description,
        methodology: p.methodology,
        lead: p.lead,
        team: p.team,
        issueCount: rows.length,
        completedCount: completed,
        myOpenCount: mine,
        avgProgress,
        sprintCount: p._count.sprints,
        phaseCount: p._count.phases,
      };
    });

    return ok({ projects: result });
  });
}

// POST /api/projects — HR/Directors and team leads can create projects.
export async function POST(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireActiveUser();
    const body = await readJson<{
      name?: string;
      key?: string;
      description?: string;
      methodology?: string;
      teamId?: string | null;
      leadId?: string | null;
    }>(req);

    const name = body.name?.trim();
    const key = body.key?.trim().toUpperCase();
    if (!name) throw new ApiError(400, "Project name is required.");
    if (!key || !KEY_RE.test(key)) throw new ApiError(400, "Key must be 2–10 letters/digits, starting with a letter (e.g. PRD).");

    const existing = await prisma.project.findUnique({ where: { key } });
    if (existing) throw new ApiError(409, `A project with key ${key} already exists.`);

    if (body.leadId) {
      const lead = await prisma.user.findUnique({ where: { id: body.leadId }, select: { id: true, isActive: true } });
      if (!lead || !lead.isActive) throw new ApiError(400, "Project lead not found or inactive.");
    }
    if (body.teamId) {
      const team = await prisma.team.findUnique({ where: { id: body.teamId }, select: { id: true } });
      if (!team) throw new ApiError(400, "Team not found.");
    }

    const methodology = body.methodology === "WATERFALL" ? "WATERFALL" : "SCRUM";
    const project = await prisma.project.create({
      data: {
        name,
        key,
        description: body.description?.trim() || null,
        methodology: methodology as never,
        teamId: body.teamId || null,
        leadId: body.leadId || null,
        createdById: session.userId,
      },
    });

    await logAudit({
      actorId: session.userId,
      action: AUDIT.PROJECT_CREATED,
      details: { projectId: project.id, key, name, methodology },
    });
    return ok({ project, message: "Project created." }, 201);
  });
}

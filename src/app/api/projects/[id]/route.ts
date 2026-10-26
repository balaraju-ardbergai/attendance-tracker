import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { canManageProject } from "@/lib/permissions";
import { toKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const ISSUE_SELECT = {
  id: true, key: true, seq: true, title: true, description: true,
  acceptanceCriteria: true, type: true, status: true, priority: true,
  progress: true, storyPoints: true, dueDate: true, epicId: true,
  sprintId: true, phaseId: true, teamId: true, projectId: true,
  assignee: { select: { id: true, name: true, email: true, pictureUrl: true } },
  team: { select: { id: true, name: true } },
  sprint: { select: { id: true, name: true, status: true } },
  phase: { select: { id: true, name: true, order: true } },
  creator: { select: { id: true, name: true } },
} as const;

function serializeIssue(t: {
  dueDate: Date | null;
} & Record<string, unknown>) {
  return { ...t, dueDate: t.dueDate ? toKey(t.dueDate) : null };
}

async function loadProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new ApiError(404, "Project not found.");
  return project;
}

// GET /api/projects/[id] — full workspace payload.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    await requireActiveUser();
    const { id } = await params;
    const project = await loadProject(id);

    const [tasks, sprints, phases] = await Promise.all([
      prisma.task.findMany({
        where: { projectId: id },
        select: ISSUE_SELECT,
        orderBy: [{ seq: "asc" }],
      }),
      prisma.sprint.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
      prisma.phase.findMany({ where: { projectId: id }, orderBy: { order: "asc" } }),
    ]);

    const { session } = await requireActiveUser();
    const canManage = await canManageProject(session, project);

    const members = project.teamId
      ? (await prisma.teamMember.findMany({
          where: { teamId: project.teamId },
          include: { user: { select: { id: true, name: true, email: true, pictureUrl: true, isActive: true } } },
          orderBy: { joinedAt: "asc" },
        })).map((m) => m.user)
      : null;

    return ok({
      project: {
        id: project.id, key: project.key, name: project.name, description: project.description,
        methodology: project.methodology, teamId: project.teamId, leadId: project.leadId,
        createdAt: project.createdAt,
      },
      issues: tasks.map(serializeIssue),
      sprints,
      phases,
      members,
      canManage,
    });
  });
}

// PATCH /api/projects/[id] — settings (manage permission).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const project = await loadProject(id);
    const canManage = await canManageProject(session, project);
    if (!canManage) throw new ApiError(403, "Only the project lead, its team lead, HR or Directors can edit this project.");

    const body = await readJson<{
      name?: string; description?: string; methodology?: string;
      leadId?: string | null; teamId?: string | null;
    }>(req);

    if (body.leadId) {
      const lead = await prisma.user.findUnique({ where: { id: body.leadId }, select: { id: true, isActive: true } });
      if (!lead || !lead.isActive) throw new ApiError(400, "Project lead not found or inactive.");
    }
    if (body.teamId) {
      const team = await prisma.team.findUnique({ where: { id: body.teamId }, select: { id: true } });
      if (!team) throw new ApiError(400, "Team not found.");
    }
    if (body.methodology !== undefined && !["SCRUM", "WATERFALL"].includes(body.methodology)) {
      throw new ApiError(400, "Methodology must be SCRUM or WATERFALL.");
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
        ...(body.methodology !== undefined ? { methodology: body.methodology as never } : {}),
        ...(body.leadId !== undefined ? { leadId: body.leadId || null } : {}),
        ...(body.teamId !== undefined ? { teamId: body.teamId || null } : {}),
      },
    });

    await logAudit({ actorId: session.userId, action: AUDIT.PROJECT_UPDATED, details: { projectId: id, key: project.key } });
    return ok({ project: updated, message: "Project updated." });
  });
}

// DELETE /api/projects/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const project = await loadProject(id);
    await prisma.project.delete({ where: { id } });
    await logAudit({ actorId: session.userId, action: AUDIT.PROJECT_DELETED, details: { projectId: id, key: project.key, name: project.name } });
    return ok({ message: "Project deleted." });
  });
}

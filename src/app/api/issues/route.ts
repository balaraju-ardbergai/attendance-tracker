import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { canManageProject, visibleProjectWhere } from "@/lib/permissions";
import { fromKey, toKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["EPIC", "STORY", "TASK", "BUG"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

const ISSUE_SELECT = {
  id: true, key: true, seq: true, title: true, description: true,
  acceptanceCriteria: true, type: true, status: true, priority: true,
  progress: true, storyPoints: true, dueDate: true, epicId: true,
  sprintId: true, phaseId: true, teamId: true, projectId: true,
  assignee: { select: { id: true, name: true, email: true, pictureUrl: true } },
  team: { select: { id: true, name: true } },
  sprint: { select: { id: true, name: true, status: true } },
  phase: { select: { id: true, name: true, order: true } },
  epic: { select: { id: true, key: true, title: true } },
  creator: { select: { id: true, name: true } },
} as const;

const serialize = (t: { dueDate: Date | null } & Record<string, unknown>) => ({
  ...t,
  dueDate: t.dueDate ? toKey(t.dueDate) : null,
});

// GET /api/issues?projectId=&scope=mine|all&sprintId=&assigneeId=&epicId=
export async function GET(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireActiveUser();
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const sprintId = url.searchParams.get("sprintId");
    const epicId = url.searchParams.get("epicId");
    const scope = url.searchParams.get("scope") ?? "all";

    // Visibility: employees only see issues assigned to them or in projects they
    // can see; HR/Directors see everything.
    let visibility: Record<string, unknown> = {};
    if (session.role !== "ADMIN" && session.role !== "DIRECTOR") {
      if (projectId) {
        const project = await prisma.project.findFirst({
          where: { id: projectId, ...(await visibleProjectWhere(session)) },
          select: { id: true },
        });
        if (!project) throw new ApiError(404, "Project not found.");
      } else {
        visibility = {
          OR: [
            { assigneeId: session.userId },
            { createdById: session.userId },
            { project: await visibleProjectWhere(session) },
          ],
        };
      }
    }

    const tasks = await prisma.task.findMany({
      where: {
        ...visibility,
        ...(projectId ? { projectId } : {}),
        ...(sprintId ? { sprintId } : {}),
        ...(epicId ? { epicId } : {}),
        ...(scope === "mine" ? { assigneeId: session.userId } : {}),
      },
      select: ISSUE_SELECT,
      orderBy: [{ seq: "asc" }, { updatedAt: "desc" }],
    });
    return ok({ issues: tasks.map(serialize) });
  });
}

// POST /api/issues — create a Jira-style work item.
export async function POST(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireActiveUser();
    const body = await readJson<{
      projectId?: string | null;
      type?: string;
      epicId?: string | null;
      sprintId?: string | null;
      phaseId?: string | null;
      title?: string;
      description?: string;
      acceptanceCriteria?: string;
      storyPoints?: number | null;
      assigneeId?: string | null;
      teamId?: string | null;
      priority?: string;
      dueDate?: string | null;
    }>(req);

    const title = body.title?.trim();
    if (!title) throw new ApiError(400, "Title is required.");
    if (body.type && !TYPES.includes(body.type)) throw new ApiError(400, "Invalid type.");
    if (body.priority && !PRIORITIES.includes(body.priority)) throw new ApiError(400, "Invalid priority.");
    if (body.dueDate && !KEY_RE.test(body.dueDate)) throw new ApiError(400, "Invalid due date.");

    let project = null;
    if (body.projectId) {
      project = await prisma.project.findUnique({ where: { id: body.projectId } });
      if (!project) throw new ApiError(404, "Project not found.");
      const canManage = await canManageProject(session, project);
      if (!canManage) throw new ApiError(403, "Only the project lead, its team lead, HR or Directors can create issues here.");
      if (body.sprintId) {
        const sprint = await prisma.sprint.findFirst({ where: { id: body.sprintId, projectId: project.id } });
        if (!sprint) throw new ApiError(400, "Sprint does not belong to this project.");
      }
      if (body.phaseId) {
        const phase = await prisma.phase.findFirst({ where: { id: body.phaseId, projectId: project.id } });
        if (!phase) throw new ApiError(400, "Phase does not belong to this project.");
      }
      if (body.epicId) {
        const epic = await prisma.task.findFirst({ where: { id: body.epicId, projectId: project.id, type: "EPIC" } });
        if (!epic) throw new ApiError(400, "Epic does not belong to this project.");
      }
    } else if (session.role !== "ADMIN" && session.role !== "DIRECTOR") {
      throw new ApiError(403, "Adhoc tasks (without a project) can only be created by HR or Directors.");
    }

    if (body.assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true, isActive: true } });
      if (!assignee || !assignee.isActive) throw new ApiError(400, "Assignee not found or inactive.");
    }

    // Jira-style key: PROJECT_KEY-<seq>
    let seq: number | null = null;
    let key: string | null = null;
    if (project) {
      const last = await prisma.task.findFirst({
        where: { projectId: project.id, seq: { not: null } },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      seq = (last?.seq ?? 0) + 1;
      key = `${project.key}-${seq}`;
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: body.description?.trim() || null,
        acceptanceCriteria: body.acceptanceCriteria?.trim() || null,
        storyPoints: body.storyPoints ?? null,
        type: (body.type ?? "TASK") as never,
        priority: (body.priority ?? "MEDIUM") as never,
        assigneeId: body.assigneeId || null,
        teamId: body.teamId || project?.teamId || null,
        dueDate: body.dueDate ? fromKey(body.dueDate) : null,
        projectId: project?.id ?? null,
        sprintId: body.sprintId || null,
        phaseId: body.phaseId || null,
        epicId: body.epicId || null,
        createdById: session.userId,
        key,
        seq,
      },
      select: ISSUE_SELECT,
    });

    await logAudit({
      actorId: session.userId,
      targetUserId: body.assigneeId ?? null,
      action: AUDIT.TASK_CREATED,
      details: { issueKey: key ?? task.id, title, projectId: project?.id },
    });
    return ok({ issue: serialize(task), message: key ? `${key} created.` : "Task created." }, 201);
  });
}

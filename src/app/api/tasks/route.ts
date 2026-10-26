import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { fromKey, toKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/tasks?scope=mine|all — employees see their tasks; admins/directors can see all.
export async function GET(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireActiveUser();
    const scope = new URL(req.url).searchParams.get("scope") ?? "mine";
    const isManager = session.role === "ADMIN" || session.role === "DIRECTOR";

    if (scope === "all" && isManager) {
      const tasks = await prisma.task.findMany({
        include: {
          assignee: { select: { id: true, name: true, email: true, pictureUrl: true } },
          team: { select: { id: true, name: true } },
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      });
      return ok({ tasks });
    }

    const tasks = await prisma.task.findMany({
      where: { assigneeId: session.userId },
      include: {
        assignee: { select: { id: true, name: true, email: true, pictureUrl: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
    return ok({ tasks });
  });
}

// POST /api/tasks — create a task (admin/director only).
export async function POST(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const body = await readJson<{
      title?: string;
      description?: string;
      priority?: string;
      assigneeId?: string | null;
      teamId?: string | null;
      dueDate?: string | null;
    }>(req);

    const title = body.title?.trim();
    if (!title) throw new ApiError(400, "Task title is required.");
    const priority = body.priority && ["LOW", "MEDIUM", "HIGH"].includes(body.priority) ? body.priority : "MEDIUM";

    if (body.assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true, isActive: true } });
      if (!assignee || !assignee.isActive) throw new ApiError(400, "Assignee not found or inactive.");
    }
    if (body.teamId) {
      const team = await prisma.team.findUnique({ where: { id: body.teamId }, select: { id: true } });
      if (!team) throw new ApiError(400, "Team not found.");
    }
    if (body.dueDate && !KEY_RE.test(body.dueDate)) throw new ApiError(400, "Invalid due date.");

    const task = await prisma.task.create({
      data: {
        title,
        description: body.description?.trim() || null,
        priority: priority as never,
        assigneeId: body.assigneeId || null,
        teamId: body.teamId || null,
        dueDate: body.dueDate ? fromKey(body.dueDate) : null,
        createdById: session.userId,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, pictureUrl: true } },
        team: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      actorId: session.userId,
      targetUserId: body.assigneeId ?? null,
      action: AUDIT.TASK_CREATED,
      details: { taskId: task.id, title },
    });
    return ok({ task: { ...task, dueDate: task.dueDate ? toKey(task.dueDate) : null }, message: "Task created." }, 201);
  });
}

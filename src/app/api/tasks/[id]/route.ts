import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { fromKey, toKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// PATCH /api/tasks/[id] — assignees update their own status/progress;
// admins/directors can update everything. Body may include { status, progress }
// or full field updates { title, description, priority, assigneeId, teamId, dueDate }.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const isManager = session.role === "ADMIN" || session.role === "DIRECTOR";

    const task = await prisma.task.findUnique({ where: { id }, include: { team: { select: { leadId: true } } } });
    if (!task) throw new ApiError(404, "Task not found.");

    const isTeamLead = task.team?.leadId === session.userId;
    if (!isManager && task.assigneeId !== session.userId && !isTeamLead) {
      throw new ApiError(403, "You can only update your own tasks.");
    }

    const body = await readJson<{
      status?: string;
      progress?: number;
      title?: string;
      description?: string;
      priority?: string;
      assigneeId?: string | null;
      teamId?: string | null;
      dueDate?: string | null;
    }>(req);

    // Non-managers can only touch status and progress.
    const data: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!["TODO", "IN_PROGRESS", "COMPLETED"].includes(body.status)) throw new ApiError(400, "Invalid status.");
      data.status = body.status;
      // Keep progress coherent with status transitions.
      if (body.status === "COMPLETED" && body.progress === undefined) data.progress = 100;
      if (body.status === "TODO" && body.progress === undefined) data.progress = 0;
    }
    if (body.progress !== undefined) {
      const progress = Math.round(Number(body.progress));
      if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw new ApiError(400, "Progress must be 0–100.");
      data.progress = progress;
    }

    if (isManager) {
      if (body.title?.trim()) data.title = body.title.trim();
      if (body.description !== undefined) data.description = body.description.trim() || null;
      if (body.priority !== undefined) {
        if (!["LOW", "MEDIUM", "HIGH"].includes(body.priority)) throw new ApiError(400, "Invalid priority.");
        data.priority = body.priority;
      }
      if (body.assigneeId !== undefined) {
        if (body.assigneeId) {
          const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true, isActive: true } });
          if (!assignee || !assignee.isActive) throw new ApiError(400, "Assignee not found or inactive.");
        }
        data.assigneeId = body.assigneeId || null;
      }
      if (body.teamId !== undefined) {
        if (body.teamId) {
          const team = await prisma.team.findUnique({ where: { id: body.teamId }, select: { id: true } });
          if (!team) throw new ApiError(400, "Team not found.");
        }
        data.teamId = body.teamId || null;
      }
      if (body.dueDate !== undefined) {
        if (body.dueDate && !KEY_RE.test(body.dueDate)) throw new ApiError(400, "Invalid due date.");
        data.dueDate = body.dueDate ? fromKey(body.dueDate) : null;
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true, pictureUrl: true } },
        team: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      actorId: session.userId,
      targetUserId: updated.assigneeId,
      action: AUDIT.TASK_UPDATED,
      details: { taskId: id, title: updated.title, status: updated.status, progress: updated.progress },
    });
    return ok({ task: { ...updated, dueDate: updated.dueDate ? toKey(updated.dueDate) : null }, message: "Task updated." });
  });
}

// DELETE /api/tasks/[id] (admin/director only).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "Task not found.");
    await prisma.task.delete({ where: { id } });
    await logAudit({ actorId: session.userId, action: AUDIT.TASK_DELETED, details: { taskId: id, title: task.title } });
    return ok({ message: "Task deleted." });
  });
}

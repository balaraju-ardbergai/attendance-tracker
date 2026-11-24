import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { canManageProject } from "@/lib/permissions";
import { fromKey, toKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

// PATCH /api/issues/[id] — assignees update status/progress on their own issues;
// project lead / team lead / HR / Directors can edit everything (sprint, phase,
// epic, points, assignee, …).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const task = await prisma.task.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!task) throw new ApiError(404, "Issue not found.");

    const isManagerRole = session.role === "ADMIN" || session.role === "DIRECTOR";
    let canManage = isManagerRole;
    if (!canManage && task.project) canManage = await canManageProject(session, task.project);
    const isAssignee = task.assigneeId === session.userId;
    if (!canManage && !isAssignee) {
      throw new ApiError(403, "You can only update your own issues.");
    }

    const body = await readJson<{
      status?: string;
      progress?: number;
      title?: string;
      description?: string;
      acceptanceCriteria?: string;
      storyPoints?: number | null;
      type?: string;
      priority?: string;
      assigneeId?: string | null;
      sprintId?: string | null;
      phaseId?: string | null;
      epicId?: string | null;
      dueDate?: string | null;
      teamId?: string | null;
    }>(req);

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw new ApiError(400, "Invalid status.");
      data.status = body.status;
      if (body.progress === undefined) {
        if (body.status === "COMPLETED") data.progress = 100;
        else if (body.status === "TODO") data.progress = 0;
        else if (task.progress === 0 || task.progress === 100) data.progress = 30;
      }
    }
    if (body.progress !== undefined) {
      const progress = Math.round(Number(body.progress));
      if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw new ApiError(400, "Progress must be 0–100.");
      data.progress = progress;
    }

    if (canManage) {
      if (body.title?.trim()) data.title = body.title.trim();
      if (body.description !== undefined) data.description = body.description.trim() || null;
      if (body.acceptanceCriteria !== undefined) data.acceptanceCriteria = body.acceptanceCriteria.trim() || null;
      if (body.storyPoints !== undefined) data.storyPoints = body.storyPoints;
      if (body.type !== undefined) {
        if (!["EPIC", "STORY", "TASK", "BUG"].includes(body.type)) throw new ApiError(400, "Invalid type.");
        data.type = body.type;
      }
      if (body.priority !== undefined) {
        if (!PRIORITIES.includes(body.priority)) throw new ApiError(400, "Invalid priority.");
        data.priority = body.priority;
      }
      if (body.assigneeId !== undefined) {
        if (body.assigneeId) {
          const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true, isActive: true } });
          if (!assignee || !assignee.isActive) throw new ApiError(400, "Assignee not found or inactive.");
        }
        data.assigneeId = body.assigneeId || null;
      }
      if (body.sprintId !== undefined) {
        if (body.sprintId) {
          const sprint = await prisma.sprint.findFirst({ where: { id: body.sprintId, projectId: task.projectId! } });
          if (!sprint) throw new ApiError(400, "Sprint does not belong to this project.");
        }
        data.sprintId = body.sprintId || null;
      }
      if (body.phaseId !== undefined) {
        if (body.phaseId) {
          const phase = await prisma.phase.findFirst({ where: { id: body.phaseId, projectId: task.projectId! } });
          if (!phase) throw new ApiError(400, "Phase does not belong to this project.");
        }
        data.phaseId = body.phaseId || null;
      }
      if (body.epicId !== undefined) {
        if (body.epicId) {
          const epic = await prisma.task.findFirst({ where: { id: body.epicId, projectId: task.projectId!, type: "EPIC" } });
          if (!epic) throw new ApiError(400, "Epic does not belong to this project.");
          if (epic.id === id) throw new ApiError(400, "An issue cannot be its own epic.");
        }
        data.epicId = body.epicId || null;
      }
      if (body.dueDate !== undefined) {
        if (body.dueDate && !KEY_RE.test(body.dueDate)) throw new ApiError(400, "Invalid due date.");
        data.dueDate = body.dueDate ? fromKey(body.dueDate) : null;
      }
      if (body.teamId !== undefined) {
        if (body.teamId) {
          const team = await prisma.team.findUnique({ where: { id: body.teamId }, select: { id: true } });
          if (!team) throw new ApiError(400, "Team not found.");
        }
        data.teamId = body.teamId || null;
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true, pictureUrl: true } },
        team: { select: { id: true, name: true } },
        sprint: { select: { id: true, name: true, status: true } },
        phase: { select: { id: true, name: true, order: true } },
        epic: { select: { id: true, key: true, title: true } },
      },
    });

    await logAudit({
      actorId: session.userId,
      targetUserId: updated.assigneeId,
      action: AUDIT.TASK_UPDATED,
      details: { issueKey: updated.key ?? id, title: updated.title, status: updated.status, progress: updated.progress },
    });
    return ok({ issue: { ...updated, dueDate: updated.dueDate ? toKey(updated.dueDate) : null }, message: "Issue updated." });
  });
}

// DELETE /api/issues/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const task = await prisma.task.findUnique({ where: { id }, include: { project: true } });
    if (!task) throw new ApiError(404, "Issue not found.");

    const isManagerRole = session.role === "ADMIN" || session.role === "DIRECTOR";
    let canManage = isManagerRole;
    if (!canManage && task.project) canManage = await canManageProject(session, task.project);
    if (!canManage) throw new ApiError(403, "Only the project lead, its team lead, HR or Directors can delete issues.");

    await prisma.task.delete({ where: { id } });
    await logAudit({ actorId: session.userId, action: AUDIT.TASK_DELETED, details: { issueKey: task.key ?? id, title: task.title } });
    return ok({ message: "Issue deleted." });
  });
}

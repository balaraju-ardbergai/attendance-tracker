import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { canManageProject, assertManageProject } from "@/lib/permissions";
import { fromKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

// PATCH /api/sprints/[id] — edit, start or complete a sprint.
// Starting a sprint completes other active sprints of the same project and
// moves unfinished issues of previously completed sprints back to the backlog? —
// no: unfinished issues stay in their sprint; Jira-style they are moved to the
// new sprint by the caller if desired. Here we only guard one ACTIVE sprint.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const sprint = await prisma.sprint.findUnique({ where: { id }, include: { project: true } });
    if (!sprint) throw new ApiError(404, "Sprint not found.");
    assertManageProject(await canManageProject(session, sprint.project));

    const body = await readJson<{
      action?: "UPDATE" | "START" | "COMPLETE";
      name?: string;
      goal?: string;
      startDate?: string;
      endDate?: string;
    }>(req);

    if (body.action === "START") {
      if (sprint.status === "COMPLETED") throw new ApiError(409, "Completed sprints cannot be restarted.");
      await prisma.$transaction([
        prisma.sprint.updateMany({ where: { projectId: sprint.projectId, status: "ACTIVE" }, data: { status: "PLANNED" } }),
        prisma.sprint.update({ where: { id }, data: { status: "ACTIVE" } }),
      ]);
      await logAudit({ actorId: session.userId, action: AUDIT.SPRINT_UPDATED, details: { sprintId: id, sprint: sprint.name, started: true } });
      return ok({ message: `Sprint “${sprint.name}” started.` });
    }

    if (body.action === "COMPLETE") {
      if (sprint.status !== "ACTIVE") throw new ApiError(409, "Only the active sprint can be completed.");
      await prisma.sprint.update({ where: { id }, data: { status: "COMPLETED" } });
      // Unfinished issues roll back to the backlog.
      await prisma.task.updateMany({
        where: { sprintId: id, status: { not: "COMPLETED" } },
        data: { sprintId: null },
      });
      await logAudit({ actorId: session.userId, action: AUDIT.SPRINT_UPDATED, details: { sprintId: id, sprint: sprint.name, completed: true } });
      return ok({ message: `Sprint “${sprint.name}” completed. Unfinished issues moved back to the backlog.` });
    }

    const updated = await prisma.sprint.update({
      where: { id },
      data: {
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        ...(body.goal !== undefined ? { goal: body.goal.trim() || null } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate ? fromKey(body.startDate) : null } : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate ? fromKey(body.endDate) : null } : {}),
      },
    });
    await logAudit({ actorId: session.userId, action: AUDIT.SPRINT_UPDATED, details: { sprintId: id, sprint: updated.name } });
    return ok({ sprint: updated, message: "Sprint updated." });
  });
}

// DELETE /api/sprints/[id] — issues return to the backlog.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const sprint = await prisma.sprint.findUnique({ where: { id }, include: { project: true } });
    if (!sprint) throw new ApiError(404, "Sprint not found.");
    assertManageProject(await canManageProject(session, sprint.project));

    await prisma.task.updateMany({ where: { sprintId: id }, data: { sprintId: null } });
    await prisma.sprint.delete({ where: { id } });
    await logAudit({ actorId: session.userId, action: AUDIT.SPRINT_DELETED, details: { sprint: sprint.name, projectKey: sprint.project.key } });
    return ok({ message: "Sprint deleted. Its issues moved back to the backlog." });
  });
}

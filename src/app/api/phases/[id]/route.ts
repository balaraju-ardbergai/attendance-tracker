import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { canManageProject, assertManageProject } from "@/lib/permissions";
import { fromKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

// PATCH /api/phases/[id] — rename/reschedule/reorder.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const phase = await prisma.phase.findUnique({ where: { id }, include: { project: true } });
    if (!phase) throw new ApiError(404, "Phase not found.");
    assertManageProject(await canManageProject(session, phase.project));

    const body = await readJson<{ name?: string; direction?: "up" | "down" }>(req);

    if (body.direction) {
      const swapWith = await prisma.phase.findFirst({
        where: { projectId: phase.projectId, order: body.direction === "up" ? { lt: phase.order } : { gt: phase.order } },
        orderBy: body.direction === "up" ? { order: "desc" } : { order: "asc" },
      });
      if (!swapWith) throw new ApiError(400, "The phase cannot move further.");
      await prisma.$transaction([
        prisma.phase.update({ where: { id: phase.id }, data: { order: swapWith.order } }),
        prisma.phase.update({ where: { id: swapWith.id }, data: { order: phase.order } }),
      ]);
      await logAudit({ actorId: session.userId, action: AUDIT.PHASE_UPDATED, details: { phase: phase.name, moved: body.direction } });
      return ok({ message: "Phase moved." });
    }

    const updated = await prisma.phase.update({
      where: { id },
      data: { ...(body.name?.trim() ? { name: body.name.trim() } : {}) },
    });
    await logAudit({ actorId: session.userId, action: AUDIT.PHASE_UPDATED, details: { phase: updated.name } });
    return ok({ phase: updated, message: "Phase updated." });
  });
}

// DELETE /api/phases/[id] — issues return to no phase.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const phase = await prisma.phase.findUnique({ where: { id }, include: { project: true } });
    if (!phase) throw new ApiError(404, "Phase not found.");
    assertManageProject(await canManageProject(session, phase.project));

    await prisma.task.updateMany({ where: { phaseId: id }, data: { phaseId: null } });
    await prisma.phase.delete({ where: { id } });
    await logAudit({ actorId: session.userId, action: AUDIT.PHASE_DELETED, details: { phase: phase.name, projectKey: phase.project.key } });
    return ok({ message: "Phase deleted. Its issues are now unphased." });
  });
}

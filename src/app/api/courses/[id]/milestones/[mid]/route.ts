import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { AUDIT, logAudit } from "@/lib/audit";

// PATCH /api/courses/[id]/milestones/[mid] — update fields or move up/down (admin/director only).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  return handleRoute(async () => {
    const { id, mid } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const body = await readJson<{
      action?: "UPDATE" | "MOVE";
      name?: string;
      description?: string;
      link?: string;
      durationMin?: number | null;
      phase?: string;
      direction?: "up" | "down";
    }>(req);

    const milestone = await prisma.milestone.findFirst({ where: { id: mid, courseId: id } });
    if (!milestone) throw new ApiError(404, "Milestone not found.");
    const course = await prisma.course.findUnique({ where: { id }, select: { name: true } });

    if (body.action === "MOVE") {
      const swapWith = await prisma.milestone.findFirst({
        where: { courseId: id, order: body.direction === "up" ? { lt: milestone.order } : { gt: milestone.order } },
        orderBy: body.direction === "up" ? { order: "desc" } : { order: "asc" },
      });
      if (!swapWith) throw new ApiError(400, "The milestone cannot move further.");
      await prisma.$transaction([
        prisma.milestone.update({ where: { id: milestone.id }, data: { order: swapWith.order } }),
        prisma.milestone.update({ where: { id: swapWith.id }, data: { order: milestone.order } }),
      ]);
      await logAudit({
        actorId: session.userId,
        action: AUDIT.MILESTONE_UPDATED,
        details: { courseId: id, courseName: course?.name, milestone: milestone.name, moved: body.direction },
      });
      return ok({ message: "Milestone moved." });
    }

    const updated = await prisma.milestone.update({
      where: { id: milestone.id },
      data: {
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
        ...(body.link !== undefined ? { link: body.link.trim() || null } : {}),
        ...(body.durationMin !== undefined ? { durationMin: body.durationMin } : {}),
        ...(body.phase !== undefined ? { phase: body.phase.trim() || null } : {}),
      },
    });

    await logAudit({
      actorId: session.userId,
      action: AUDIT.MILESTONE_UPDATED,
      details: { courseId: id, courseName: course?.name, milestone: updated.name },
    });
    return ok({ milestone: updated, message: "Milestone updated." });
  });
}

// DELETE /api/courses/[id]/milestones/[mid] (admin/director only).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  return handleRoute(async () => {
    const { id, mid } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const milestone = await prisma.milestone.findFirst({ where: { id: mid, courseId: id } });
    if (!milestone) throw new ApiError(404, "Milestone not found.");
    const course = await prisma.course.findUnique({ where: { id }, select: { name: true } });

    await prisma.milestone.delete({ where: { id: mid } });
    // Re-sequence remaining milestones so order stays contiguous.
    const remaining = await prisma.milestone.findMany({
      where: { courseId: id },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    await prisma.$transaction(
      remaining.map((m, i) => prisma.milestone.update({ where: { id: m.id }, data: { order: i + 1 } })),
    );

    await logAudit({
      actorId: session.userId,
      action: AUDIT.MILESTONE_DELETED,
      details: { courseId: id, courseName: course?.name, milestone: milestone.name },
    });
    return ok({ message: "Milestone deleted." });
  });
}

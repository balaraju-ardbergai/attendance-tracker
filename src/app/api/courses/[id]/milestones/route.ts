import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { AUDIT, logAudit } from "@/lib/audit";

// POST /api/courses/[id]/milestones — append a milestone (admin/director only).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const course = await prisma.course.findUnique({ where: { id } });
    if (!course) throw new ApiError(404, "Course not found.");

    const body = await readJson<{
      name?: string;
      description?: string;
      link?: string;
      durationMin?: number;
      phase?: string;
    }>(req);
    const name = body.name?.trim();
    if (!name) throw new ApiError(400, "Milestone name is required.");

    const last = await prisma.milestone.findFirst({
      where: { courseId: id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const milestone = await prisma.milestone.create({
      data: {
        courseId: id,
        order: (last?.order ?? 0) + 1,
        name,
        description: body.description?.trim() || null,
        link: body.link?.trim() || null,
        durationMin: body.durationMin ?? null,
        phase: body.phase?.trim() || null,
      },
    });

    await logAudit({
      actorId: session.userId,
      action: AUDIT.MILESTONE_ADDED,
      details: { courseId: id, courseName: course.name, milestone: name },
    });
    return ok({ milestone, message: "Milestone added." }, 201);
  });
}

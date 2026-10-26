import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { fromKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

// GET /api/courses — admins/directors see all courses, employees see the ones they are enrolled in.
export async function GET() {
  return handleRoute(async () => {
    const { session } = await requireActiveUser();
    const isManager = session.role === "ADMIN" || session.role === "DIRECTOR";

    const courses = await prisma.course.findMany({
      where: isManager ? {} : { enrollments: { some: { userId: session.userId } } },
      orderBy: { createdAt: "desc" },
      include: {
        creator: { select: { id: true, name: true } },
        enrollments: { select: { userId: true } },
        milestones: { select: { id: true } },
        _count: { select: { milestones: true, enrollments: true } },
      },
    });

    const milestoneIds = courses.flatMap((c) => c.milestones.map((m) => m.id));
    const progress = await prisma.milestoneProgress.findMany({
      where: { milestoneId: { in: milestoneIds } },
      select: { milestoneId: true, userId: true, percent: true },
    });

    // Org-level overall progress per course: sum of milestone percents / (milestones × participants).
    const perMilestone = new Map<string, { sum: number; count: number }>();
    for (const p of progress) {
      const agg = perMilestone.get(p.milestoneId) ?? { sum: 0, count: 0 };
      agg.sum += p.percent;
      agg.count += 1;
      perMilestone.set(p.milestoneId, agg);
    }

    const result = courses.map((c) => {
      const totalSlots = c._count.milestones * c._count.enrollments;
      const totalPercent = c.milestones.reduce(
        (sum, m) => sum + (perMilestone.get(m.id)?.sum ?? 0),
        0,
      );
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        startedOn: c.startedOn,
        attendanceEnabled: c.attendanceEnabled,
        scheduleNote: c.scheduleNote,
        creator: c.creator,
        milestoneCount: c._count.milestones,
        participantCount: c._count.enrollments,
        progressPercent: totalSlots > 0 ? Math.round(totalPercent / totalSlots) : 0,
      };
    });

    return ok({ courses: result });
  });
}

// POST /api/courses — create a course (admin/director only).
export async function POST(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const body = await readJson<{
      name?: string;
      description?: string;
      startedOn?: string;
      attendanceEnabled?: boolean;
      scheduleNote?: string;
    }>(req);

    const name = body.name?.trim();
    if (!name) throw new ApiError(400, "Course name is required.");

    const course = await prisma.course.create({
      data: {
        name,
        description: body.description?.trim() || null,
        startedOn: body.startedOn ? fromKey(body.startedOn) : null,
        attendanceEnabled: Boolean(body.attendanceEnabled),
        scheduleNote: body.scheduleNote?.trim() || null,
        createdById: session.userId,
      },
    });

    await logAudit({
      actorId: session.userId,
      action: AUDIT.COURSE_CREATED,
      details: { courseId: course.id, courseName: course.name },
    });

    return ok({ course, message: "Course created." }, 201);
  });
}

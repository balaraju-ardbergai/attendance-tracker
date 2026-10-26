import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { fromKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

async function loadCourse(id: string) {
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) throw new ApiError(404, "Course not found.");
  return course;
}

// GET /api/courses/[id] — full tracker payload: course, milestones, participants with
// per-person progress summaries, and sessions with attendance.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const course = await loadCourse(id);

    const isManager = session.role === "ADMIN" || session.role === "DIRECTOR";
    if (!isManager) {
      const enrolled = await prisma.courseEnrollment.findUnique({
        where: { courseId_userId: { courseId: id, userId: session.userId } },
      });
      if (!enrolled) throw new ApiError(403, "You are not enrolled in this course.");
    }

    const [milestones, enrollments, sessions] = await Promise.all([
      prisma.milestone.findMany({ where: { courseId: id }, orderBy: { order: "asc" } }),
      prisma.courseEnrollment.findMany({
        where: { courseId: id },
        include: {
          user: { select: { id: true, name: true, email: true, department: true, pictureUrl: true, role: true } },
        },
        orderBy: { enrolledAt: "asc" },
      }),
      prisma.courseSession.findMany({
        where: { courseId: id },
        orderBy: { date: "asc" },
        include: {
          attendance: { select: { userId: true, status: true, markedAt: true } },
        },
      }),
    ]);

    const progressRows = await prisma.milestoneProgress.findMany({
      where: { milestone: { courseId: id } },
      select: { milestoneId: true, userId: true, percent: true },
    });

    const progressByUser = new Map<string, Record<string, number>>();
    for (const row of progressRows) {
      const map = progressByUser.get(row.userId) ?? {};
      map[row.milestoneId] = row.percent;
      progressByUser.set(row.userId, map);
    }

    const totalSteps = milestones.length;
    const participants = enrollments.map(({ user }) => {
      const progress = progressByUser.get(user.id) ?? {};
      let percentSum = 0;
      let stepsCompleted = 0;
      let currentlyAt: { id: string; name: string } | null = null;
      for (const m of milestones) {
        const percent = progress[m.id] ?? 0;
        percentSum += percent;
        if (percent >= 100) stepsCompleted++;
        else if (!currentlyAt) currentlyAt = { id: m.id, name: m.name };
      }
      const status =
        totalSteps === 0 || percentSum === 0
          ? "NOT_STARTED"
          : stepsCompleted === totalSteps
            ? "COMPLETED"
            : "IN_PROGRESS";
      return {
        ...user,
        progress,
        summary: {
          stepsCompleted,
          totalSteps,
          percent: totalSteps > 0 ? Math.round(percentSum / totalSteps) : 0,
          currentlyAt,
          status,
        },
      };
    });

    // Per-milestone org-level aggregate (average across participants).
    const milestoneStats = milestones.map((m) => {
      const values = participants
        .map((p) => p.progress[m.id] ?? 0)
        .filter((v) => v > 0);
      const completed = participants.filter((p) => (p.progress[m.id] ?? 0) >= 100).length;
      return {
        milestoneId: m.id,
        avgPercent: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / participants.length) : 0,
        completed,
      };
    });

    return ok({
      course: {
        id: course.id,
        name: course.name,
        description: course.description,
        startedOn: course.startedOn,
        attendanceEnabled: course.attendanceEnabled,
        scheduleNote: course.scheduleNote,
        createdAt: course.createdAt,
        creator: { id: course.createdById },
      },
      milestones,
      milestoneStats,
      participants,
      sessions,
      canManage: isManager,
    });
  });
}

// PATCH /api/courses/[id] — update course details (admin/director only).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const course = await loadCourse(id);
    const body = await readJson<{
      name?: string;
      description?: string;
      startedOn?: string | null;
      attendanceEnabled?: boolean;
      scheduleNote?: string;
    }>(req);

    const updated = await prisma.course.update({
      where: { id },
      data: {
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
        ...(body.startedOn !== undefined
          ? { startedOn: body.startedOn ? fromKey(body.startedOn) : null }
          : {}),
        ...(body.attendanceEnabled !== undefined ? { attendanceEnabled: body.attendanceEnabled } : {}),
        ...(body.scheduleNote !== undefined ? { scheduleNote: body.scheduleNote.trim() || null } : {}),
      },
    });

    await logAudit({
      actorId: session.userId,
      action: AUDIT.COURSE_UPDATED,
      details: { courseId: id, courseName: course.name },
    });
    return ok({ course: updated, message: "Course updated." });
  });
}

// DELETE /api/courses/[id] (admin/director only).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const course = await loadCourse(id);

    await prisma.course.delete({ where: { id } });
    await logAudit({
      actorId: session.userId,
      action: AUDIT.COURSE_DELETED,
      details: { courseId: id, courseName: course.name },
    });
    return ok({ message: "Course deleted." });
  });
}

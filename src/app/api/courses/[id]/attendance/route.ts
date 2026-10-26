import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { serverTodayKey, toKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

// POST /api/courses/[id]/attendance — mark a participant's attendance on a session.
// Admins/directors can mark anyone on any session; participants can mark themselves
// on today's session only. Body: { sessionId, userId?, status: "PRESENT" | "ABSENT" | "EXCUSED" }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const body = await readJson<{ sessionId?: string; userId?: string; status?: string }>(req);
    if (!body.sessionId || !body.status) throw new ApiError(400, "sessionId and status are required.");
    if (body.status !== "PRESENT" && body.status !== "ABSENT" && body.status !== "EXCUSED") {
      throw new ApiError(400, "Status must be PRESENT, ABSENT or EXCUSED.");
    }

    const sessionRow = await prisma.courseSession.findFirst({
      where: { id: body.sessionId, courseId: id },
      include: { course: { select: { id: true, name: true } } },
    });
    if (!sessionRow) throw new ApiError(404, "Session not found.");

    const isManager = session.role === "ADMIN" || session.role === "DIRECTOR";
    const targetUserId = body.userId ?? session.userId;

    if (targetUserId !== session.userId) {
      if (!isManager) throw new ApiError(403, "You can only mark your own attendance.");
    } else if (!isManager) {
      if (toKey(sessionRow.date) !== serverTodayKey()) {
        throw new ApiError(400, "You can only mark your own attendance for today's session.");
      }
    }

    const enrolled = await prisma.courseEnrollment.findUnique({
      where: { courseId_userId: { courseId: id, userId: targetUserId } },
    });
    if (!enrolled) throw new ApiError(400, "That person is not enrolled in this course.");

    await prisma.courseAttendance.upsert({
      where: { sessionId_userId: { sessionId: body.sessionId, userId: targetUserId } },
      update: { status: body.status, markedById: session.userId, markedAt: new Date() },
      create: {
        sessionId: body.sessionId,
        userId: targetUserId,
        status: body.status,
        markedById: session.userId,
      },
    });

    if (targetUserId !== session.userId) {
      await logAudit({
        actorId: session.userId,
        targetUserId,
        action: AUDIT.COURSE_ATTENDANCE_MARKED,
        details: { courseId: id, courseName: sessionRow.course.name, sessionId: body.sessionId, status: body.status },
      });
    }

    return ok({ message: "Attendance saved." });
  });
}

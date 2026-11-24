import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { AUDIT, logAudit } from "@/lib/audit";

// POST /api/courses/[id]/enrollments — add or remove a participant (admin/director only).
// Body: { userId, action: "ADD" | "REMOVE" }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const body = await readJson<{ userId?: string; action?: "ADD" | "REMOVE" }>(req);
    if (!body.userId || (body.action !== "ADD" && body.action !== "REMOVE")) {
      throw new ApiError(400, "userId and action (ADD or REMOVE) are required.");
    }

    const course = await prisma.course.findUnique({ where: { id }, select: { name: true } });
    if (!course) throw new ApiError(404, "Course not found.");
    const user = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, name: true, email: true } });
    if (!user) throw new ApiError(404, "User not found.");

    if (body.action === "ADD") {
      await prisma.courseEnrollment.upsert({
        where: { courseId_userId: { courseId: id, userId: user.id } },
        update: {},
        create: { courseId: id, userId: user.id },
      });
      await logAudit({
        actorId: session.userId,
        targetUserId: user.id,
        action: AUDIT.ENROLLED,
        details: { courseId: id, courseName: course.name },
      });
      return ok({ message: `${user.name} enrolled.` });
    }

    await prisma.courseEnrollment.deleteMany({ where: { courseId: id, userId: user.id } });
    // Keep their milestone progress rows — re-enrolling restores them.
    await logAudit({
      actorId: session.userId,
      targetUserId: user.id,
      action: AUDIT.UNENROLLED,
      details: { courseId: id, courseName: course.name },
    });
    return ok({ message: `${user.name} removed from the course.` });
  });
}

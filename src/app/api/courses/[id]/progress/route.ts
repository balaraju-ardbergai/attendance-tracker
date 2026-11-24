import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { AUDIT, logAudit } from "@/lib/audit";

// POST /api/courses/[id]/progress — upsert a participant's percent on a milestone.
// Participants may update their own row; admins/directors may update anyone's.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const body = await readJson<{ milestoneId?: string; userId?: string; percent?: number }>(req);

    const milestoneId = body.milestoneId;
    const percent = Math.round(body.percent ?? 0);
    if (!milestoneId) throw new ApiError(400, "Milestone is required.");
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new ApiError(400, "Progress must be between 0 and 100.");
    }
    // Tracker semantics: partial progress is picked from 10%–90%, or 100% to complete.
    if (percent !== 0 && percent !== 100 && (percent < 10 || percent > 90)) {
      throw new ApiError(400, "Pick a percentage between 10 and 90, or mark it Completed (100%).");
    }

    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, courseId: id },
      include: { course: { select: { id: true, name: true } } },
    });
    if (!milestone) throw new ApiError(404, "Milestone not found.");

    const isManager = session.role === "ADMIN" || session.role === "DIRECTOR";
    const targetUserId = body.userId ?? session.userId;
    if (targetUserId !== session.userId && !isManager) {
      throw new ApiError(403, "You can only update your own progress.");
    }

    const enrolled = await prisma.courseEnrollment.findUnique({
      where: { courseId_userId: { courseId: id, userId: targetUserId } },
    });
    if (!enrolled) throw new ApiError(400, "That person is not enrolled in this course.");

    await prisma.milestoneProgress.upsert({
      where: { milestoneId_userId: { milestoneId, userId: targetUserId } },
      update: { percent },
      create: { milestoneId, userId: targetUserId, percent },
    });

    if (targetUserId !== session.userId) {
      await logAudit({
        actorId: session.userId,
        targetUserId,
        action: AUDIT.PROGRESS_UPDATED,
        details: { courseId: id, courseName: milestone.course.name, milestone: milestone.name, percent },
      });
    }

    return ok({ message: percent >= 100 ? "Milestone completed!" : "Progress updated." });
  });
}

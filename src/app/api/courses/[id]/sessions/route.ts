import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { fromKey, serverTodayKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/courses/[id]/sessions — add one or more class dates (admin/director only).
// Body: { dates: ["YYYY-MM-DD", ...], topic? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const course = await prisma.course.findUnique({ where: { id }, select: { name: true } });
    if (!course) throw new ApiError(404, "Course not found.");

    const body = await readJson<{ dates?: string[]; topic?: string }>(req);
    const dates = (body.dates ?? []).filter((d) => KEY_RE.test(d));
    if (dates.length === 0) throw new ApiError(400, "At least one valid date is required.");

    const created = await prisma.$transaction(
      dates.map((d) =>
        prisma.courseSession.upsert({
          where: { courseId_date: { courseId: id, date: fromKey(d) } },
          update: { topic: body.topic?.trim() || null },
          create: { courseId: id, date: fromKey(d), topic: body.topic?.trim() || null },
        }),
      ),
    );

    await logAudit({
      actorId: session.userId,
      action: AUDIT.SESSION_ADDED,
      details: { courseId: id, courseName: course.name, count: created.length },
    });
    return ok({ created: created.length, message: `${created.length} session(s) added.` }, 201);
  });
}

// DELETE /api/courses/[id]/sessions?sessionId=... (admin/director only).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (!sessionId) throw new ApiError(400, "sessionId is required.");
    const sessionRow = await prisma.courseSession.findFirst({ where: { id: sessionId, courseId: id } });
    if (!sessionRow) throw new ApiError(404, "Session not found.");
    await prisma.courseSession.delete({ where: { id: sessionId } });
    return ok({ message: "Session deleted." });
  });
}

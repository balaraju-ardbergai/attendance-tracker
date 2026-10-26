import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, requireActiveUser } from "@/lib/api";
import { isManagerRole } from "@/lib/permissions";
import { computeMonthStats, fromKey, serverTodayKey, toKey } from "@/lib/dates";

// GET /api/employees/[id]/overview — drill-down for the org dashboard:
// today + this-month attendance, open tasks, courses, pending requests.
// Visible to HR/Directors and to the person's own team lead / manager.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();

    const person = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, department: true, pictureUrl: true, managerId: true },
    });
    if (!person) throw new ApiError(404, "Person not found.");

    if (!isManagerRole(session.role)) {
      // Team leads / managers may view their own people.
      let allowed = person.managerId === session.userId;
      if (!allowed) {
        const membership = await prisma.teamMember.findFirst({
          where: { userId: id, team: { leadId: session.userId } },
          select: { id: true },
        });
        allowed = Boolean(membership);
      }
      if (!allowed) throw new ApiError(403, "You can only view details of your own team members.");
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayKey = serverTodayKey();
    const monthStart = fromKey(toKey(new Date(Date.UTC(year, month, 1))));
    const monthEnd = fromKey(toKey(new Date(Date.UTC(year, month + 1, 1))));

    const [records, tasks, progressRows, pendingRequests] = await Promise.all([
      prisma.attendance.findMany({
        where: { userId: id, date: { gte: monthStart, lt: monthEnd } },
        select: { date: true, status: true, clockInAt: true, clockOutAt: true },
        orderBy: { date: "asc" },
      }),
      prisma.task.findMany({
        where: { assigneeId: id, status: { not: "COMPLETED" } },
        select: { id: true, key: true, title: true, status: true, progress: true, dueDate: true },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      }),
      prisma.milestoneProgress.findMany({
        where: { userId: id },
        select: { percent: true, milestone: { select: { courseId: true, course: { select: { id: true, name: true } } } } },
      }),
      prisma.request.findMany({
        where: { userId: id, status: "PENDING" },
        select: { type: true, startDate: true, endDate: true },
      }),
    ]);

    const today = records.find((r) => toKey(r.date) === todayKey) ?? null;
    const stats = computeMonthStats(records, year, month);

    const courseMap = new Map<string, { id: string; name: string; sum: number; count: number }>();
    for (const row of progressRows) {
      const c = courseMap.get(row.milestone.courseId) ?? {
        id: row.milestone.course.id,
        name: row.milestone.course.name,
        sum: 0,
        count: 0,
      };
      c.sum += row.percent;
      c.count += 1;
      courseMap.set(row.milestone.courseId, c);
    }
    const courses = [...courseMap.values()].map((c) => ({
      id: c.id,
      name: c.name,
      percent: c.count ? Math.round(c.sum / c.count) : 0,
    }));

    return ok({
      person: {
        id: person.id,
        name: person.name,
        email: person.email,
        role: person.role,
        department: person.department,
        pictureUrl: person.pictureUrl,
      },
      today: today
        ? {
            status: today.status,
            clockInAt: today.clockInAt,
            clockOutAt: today.clockOutAt,
          }
        : null,
      stats,
      openTasks: tasks.map((t) => ({ ...t, dueDate: t.dueDate ? toKey(t.dueDate) : null })),
      courses,
      pendingRequests: pendingRequests.map((r) => ({
        type: r.type,
        startDate: toKey(r.startDate),
        endDate: toKey(r.endDate),
      })),
    });
  });
}

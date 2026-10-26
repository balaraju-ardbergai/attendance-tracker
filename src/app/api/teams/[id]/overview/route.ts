import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, requireActiveUser } from "@/lib/api";
import { canAccessTeam } from "@/lib/permissions";
import { computeMonthStats, fromKey, serverTodayKey, toKey } from "@/lib/dates";

// GET /api/teams/[id]/overview — member-level details for the team lead,
// HR Admins and Directors: attendance this month, requests, tasks, courses.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser();
    const team = await prisma.team.findUnique({ where: { id }, select: { name: true, leadId: true } });
    if (!team) throw new ApiError(404, "Team not found.");
    if (!(await canAccessTeam(session.userId, session.role, id))) {
      throw new ApiError(403, "Only the team lead, HR or Directors can view member details.");
    }

    const memberships = await prisma.teamMember.findMany({
      where: { teamId: id },
      include: { user: { select: { id: true, name: true, email: true, role: true, department: true, pictureUrl: true } } },
      orderBy: { joinedAt: "asc" },
    });
    const memberIds = memberships.map((m) => m.user.id);
    if (memberIds.length === 0) return ok({ members: [] });

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthStart = fromKey(toKey(new Date(Date.UTC(year, month, 1))));
    const monthEnd = fromKey(toKey(new Date(Date.UTC(year, month + 1, 1))));

    const [attendance, pendingRequests, openTasks, progressRows] = await Promise.all([
      prisma.attendance.findMany({
        where: { userId: { in: memberIds }, date: { gte: monthStart, lt: monthEnd } },
        select: { userId: true, date: true, status: true },
      }),
      prisma.request.findMany({
        where: { userId: { in: memberIds }, status: "PENDING" },
        select: { userId: true, type: true, startDate: true, endDate: true },
      }),
      prisma.task.findMany({
        where: { assigneeId: { in: memberIds }, status: { not: "COMPLETED" } },
        select: { id: true, assigneeId: true, key: true, title: true, status: true, progress: true, dueDate: true },
      }),
      prisma.milestoneProgress.findMany({
        where: { userId: { in: memberIds }, milestone: { course: { enrollments: { some: { userId: { in: memberIds } } } } } },
        select: { userId: true, percent: true, milestone: { select: { courseId: true, course: { select: { id: true, name: true } } } } },
      }),
    ]);

    const members = memberships.map(({ user }) => {
      const records = attendance.filter((a) => a.userId === user.id);
      const stats = computeMonthStats(records, year, month);
      const requests = pendingRequests
        .filter((r) => r.userId === user.id)
        .map((r) => ({ type: r.type, startDate: toKey(r.startDate), endDate: toKey(r.endDate) }));
      const tasks = openTasks
        .filter((t) => t.assigneeId === user.id)
        .map((t) => ({ id: t.id, key: t.key, title: t.title, status: t.status, progress: t.progress, dueDate: t.dueDate ? toKey(t.dueDate) : null }));

      // Aggregate the member's courses: total milestone percent / milestone count.
      const courseMap = new Map<string, { name: string; sum: number; count: number }>();
      for (const row of progressRows) {
        if (row.userId !== user.id) continue;
        const c = courseMap.get(row.milestone.courseId) ?? { name: row.milestone.course.name, sum: 0, count: 0 };
        c.sum += row.percent;
        c.count += 1;
        courseMap.set(row.milestone.courseId, c);
      }
      const courses = [...courseMap.values()].map((c) => ({
        name: c.name,
        percent: c.count ? Math.round(c.sum / c.count) : 0,
      }));

      return { ...user, attendance: stats, pendingRequests: requests, openTasks: tasks, courses };
    });

    return ok({ team: { id, name: team.name, leadId: team.leadId }, members });
  });
}

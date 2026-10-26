import { prisma } from "@/lib/db";
import { handleRoute, ok, requireActiveUser } from "@/lib/api";
import { computeMonthStats, fromKey, monthLabel, serverTodayKey, toKey } from "@/lib/dates";

// ORG Dashboard: per-employee month stats for HR Admins and Directors.
export async function GET() {
  return handleRoute(async () => {
    await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, department: true, pictureUrl: true },
    });
    const ids = users.map((u) => u.id);

    const start = fromKey(toKey(new Date(Date.UTC(year, month, 1))));
    const end = fromKey(toKey(new Date(Date.UTC(year, month + 1, 1))));
    const records = await prisma.attendance.findMany({
      where: { userId: { in: ids }, date: { gte: start, lt: end } },
      select: { userId: true, date: true, status: true },
    });

    const byUser = new Map<string, { date: Date; status: string }[]>();
    for (const r of records) {
      const list = byUser.get(r.userId) ?? [];
      list.push({ date: r.date, status: r.status });
      byUser.set(r.userId, list);
    }

    const todayKey = serverTodayKey();
    const todayRecords = records.filter((r) => toKey(r.date) === todayKey);

    const employees = users.map((u) => ({
      ...u,
      stats: computeMonthStats(byUser.get(u.id) ?? [], year, month),
    }));

    return ok({
      month: { year, month, label: monthLabel(year, month) },
      summary: {
        employees: users.length,
        presentToday: todayRecords.filter((r) => r.status === "PRESENT" || r.status === "LATE").length,
        onLeaveToday: todayRecords.filter((r) => r.status === "LEAVE").length,
        wfhToday: todayRecords.filter((r) => r.status === "WFH").length,
        notMarkedToday: users.length - todayRecords.length,
      },
      employees,
    });
  });
}

import { prisma } from "@/lib/db";
import { handleRoute, ok, requireExpenseAccess } from "@/lib/api";
import { fromKey, serverTodayKey, toKey } from "@/lib/dates";

// GET /api/expenses/analytics — dashboard aggregates for the current week/month
// plus trends (last 6 months), category and team splits for the current month.
export async function GET() {
  return handleRoute(async () => {
    await requireExpenseAccess();
    const now = new Date();
    const todayKey = serverTodayKey();

    // Current week: Monday..Sunday containing today (server-local).
    const dow = (now.getDay() + 6) % 7; // 0 = Monday
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dow);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
    const weekEndKey = toKey(new Date(Date.UTC(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate())));

    // Current month range.
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthStartKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-${String(monthStart.getDate()).padStart(2, "0")}`;
    const monthEndKey = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;

    // Trend: last 6 calendar months including the current one.
    const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const trendStartKey = `${trendStart.getFullYear()}-${String(trendStart.getMonth() + 1).padStart(2, "0")}-01`;

    const expenses = await prisma.expense.findMany({
      where: { date: { gte: fromKey(trendStartKey), lte: fromKey(monthEndKey) } },
      select: { id: true, title: true, amount: true, category: true, date: true, teamId: true, party: true },
    });

    const inRange = (key: string, start: string, end: string) => key >= start && key <= end;

    const sum = (rows: typeof expenses) => rows.reduce((s, e) => s + e.amount, 0);
    const monthRows = expenses.filter((e) => inRange(toKey(e.date), monthStartKey, monthEndKey));
    const weekRows = expenses.filter((e) => inRange(toKey(e.date), weekStartKey, weekEndKey));

    const CATEGORIES = ["VENDOR_BILLING", "CLIENT_BILLING", "OFFICE_PURCHASE", "EVENT_PRIZE", "OTHER"];
    const byCategory = CATEGORIES.map((category) => ({
      category,
      total: sum(monthRows.filter((e) => e.category === category)),
    })).filter((c) => c.total > 0);

    const teams = await prisma.team.findMany({ select: { id: true, name: true } });
    const byTeam = teams
      .map((t) => ({ teamId: t.id, name: t.name, total: sum(monthRows.filter((e) => e.teamId === t.id)) }))
      .filter((t) => t.total > 0);

    const trend: { key: string; label: string; total: number }[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      trend.push({
        key,
        label: monthNames[d.getMonth()],
        total: sum(expenses.filter((e) => toKey(e.date).startsWith(key))),
      });
    }

    const topExpenses = [...monthRows]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((e) => ({ id: e.id, title: e.title, category: e.category, party: e.party, amount: e.amount, date: toKey(e.date) }));

    return ok({
      today: todayKey,
      week: { start: weekStartKey, end: weekEndKey, total: sum(weekRows), count: weekRows.length },
      month: { start: monthStartKey, end: monthEndKey, total: sum(monthRows), count: monthRows.length },
      trend,
      byCategory,
      byTeam,
      topExpenses,
    });
  });
}

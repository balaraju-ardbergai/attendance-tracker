import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, requireExpenseAccess } from "@/lib/api";
import { serverTodayKey, toKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";
import { expenseReportEmail, sendMail } from "@/lib/mail";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/roles";

type Period = "weekly" | "monthly";

// Computes the expense summary for the last completed week (Mon–Sun) or the
// previous calendar month, and emails it to every configured recipient.
async function buildAndSendReport(period: Period, actorId: string | null) {
  const now = new Date();

  let start: Date;
  let end: Date;
  if (period === "weekly") {
    // Last completed Monday–Sunday week.
    const dow = (now.getDay() + 6) % 7; // 0 = Monday
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - dow);
    end = new Date(thisMonday);
    end.setDate(thisMonday.getDate() - 1);
    start = new Date(end);
    start.setDate(end.getDate() - 6);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
  }
  const key = (d: Date) => toKey(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
  const startKey = key(start);
  const endKey = key(end);

  const expenses = await prisma.expense.findMany({
    where: { date: { gte: new Date(`${startKey}T00:00:00.000Z`), lte: new Date(`${endKey}T00:00:00.000Z`) } },
    include: { team: { select: { name: true } } },
    orderBy: { amount: "desc" },
  });

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const CATEGORIES = ["VENDOR_BILLING", "CLIENT_BILLING", "OFFICE_PURCHASE", "EVENT_PRIZE", "OTHER"];
  const byCategory = CATEGORIES.map((c) => ({
    label: EXPENSE_CATEGORY_LABEL[c],
    total: expenses.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0),
  })).filter((c) => c.total > 0);

  const teamTotals = new Map<string, number>();
  for (const e of expenses) {
    if (e.team) teamTotals.set(e.team.name, (teamTotals.get(e.team.name) ?? 0) + e.amount);
  }
  const byTeam = [...teamTotals.entries()].map(([label, t]) => ({ label, total: t }));

  const topExpenses = expenses.slice(0, 5).map((e) => ({
    title: e.title,
    category: EXPENSE_CATEGORY_LABEL[e.category],
    party: e.party,
    amount: e.amount,
    date: toKey(e.date),
  }));

  const recipients = await prisma.user.findMany({
    where: { isActive: true, receivesExpenseReports: true },
    select: { id: true, name: true, email: true },
  });

  const periodLabel =
    period === "weekly"
      ? `Week ${startKey} to ${endKey}`
      : `${start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`;

  let sent = 0;
  for (const recipient of recipients) {
    const mail = expenseReportEmail(recipient.name, recipient.email, periodLabel, { total, count: expenses.length }, byCategory, byTeam, topExpenses);
    const { delivered } = await sendMail(mail);
    if (delivered) sent++;
  }

  if (actorId) {
    await logAudit({
      actorId,
      action: AUDIT.REPORT_SENT,
      details: { period, periodLabel, total, count: expenses.length, recipients: recipients.length, sent },
    });
  }

  return {
    period,
    periodLabel,
    total,
    count: expenses.length,
    recipients: recipients.length,
    sent,
    recipientsWithoutMailProvider: recipients.length - sent,
  };
}

function assertCronSecret(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return; // not configured (local dev) — allow
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) throw new ApiError(401, "Invalid cron secret.");
}

// GET /api/reports/expense/weekly|monthly — target of Vercel Cron (see vercel.json).
export async function GET(req: Request, { params }: { params: Promise<{ period: string }> }) {
  return handleRoute(async () => {
    const { period } = await params;
    if (period !== "weekly" && period !== "monthly") throw new ApiError(404, "Unknown report period.");
    assertCronSecret(req);
    const result = await buildAndSendReport(period, null);
    return ok(result);
  });
}

// POST /api/reports/expense/weekly|monthly — manual send (expense access required).
export async function POST(req: Request, { params }: { params: Promise<{ period: string }> }) {
  return handleRoute(async () => {
    const { period } = await params;
    if (period !== "weekly" && period !== "monthly") throw new ApiError(404, "Unknown report period.");
    const { session } = await requireExpenseAccess();
    const result = await buildAndSendReport(period, session.userId);
    return ok({ ...result, message: `Report generated. ${result.sent} of ${result.recipients} recipient(s) emailed.` });
  });
}

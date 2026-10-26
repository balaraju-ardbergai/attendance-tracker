import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireExpenseAccess } from "@/lib/api";
import { fromKey, serverTodayKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = ["VENDOR_BILLING", "CLIENT_BILLING", "OFFICE_PURCHASE", "EVENT_PRIZE", "OTHER"];

// GET /api/expenses — list with optional filters: from, to, category, teamId.
export async function GET(req: Request) {
  return handleRoute(async () => {
    await requireExpenseAccess();
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const category = url.searchParams.get("category");
    const teamId = url.searchParams.get("teamId");

    const expenses = await prisma.expense.findMany({
      where: {
        ...(from && KEY_RE.test(from) ? { date: { gte: fromKey(from) } } : {}),
        ...(to && KEY_RE.test(to) ? { date: { ...(from && KEY_RE.test(from) ? { gte: fromKey(from) } : {}), lte: fromKey(to) } } : {}),
        ...(category && CATEGORIES.includes(category) ? { category: category as never } : {}),
        ...(teamId ? { teamId } : {}),
      },
      include: {
        creator: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    return ok({ expenses, summary: { total, count: expenses.length } });
  });
}

// POST /api/expenses — record an expense.
export async function POST(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireExpenseAccess();
    const body = await readJson<{
      title?: string;
      description?: string;
      category?: string;
      party?: string;
      amount?: number;
      date?: string;
      teamId?: string | null;
      paymentMethod?: string;
      receiptUrl?: string;
    }>(req);

    const title = body.title?.trim();
    if (!title) throw new ApiError(400, "A title is required.");
    if (!body.category || !CATEGORIES.includes(body.category)) throw new ApiError(400, "A valid category is required.");
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "Amount must be a positive number.");
    if (!body.date || !KEY_RE.test(body.date)) throw new ApiError(400, "A valid date is required.");
    if (body.date > serverTodayKey()) throw new ApiError(400, "The expense date cannot be in the future.");

    if (body.teamId) {
      const team = await prisma.team.findUnique({ where: { id: body.teamId }, select: { id: true } });
      if (!team) throw new ApiError(400, "Selected team does not exist.");
    }

    const expense = await prisma.expense.create({
      data: {
        title,
        description: body.description?.trim() || null,
        category: body.category as never,
        party: body.party?.trim() || null,
        amount,
        date: fromKey(body.date),
        teamId: body.teamId || null,
        paymentMethod: body.paymentMethod?.trim() || null,
        receiptUrl: body.receiptUrl?.trim() || null,
        createdById: session.userId,
      },
      include: {
        creator: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      actorId: session.userId,
      action: AUDIT.EXPENSE_CREATED,
      details: { expenseId: expense.id, title, amount, category: body.category },
    });
    return ok({ expense, message: "Expense recorded." }, 201);
  });
}

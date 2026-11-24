import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireExpenseAccess } from "@/lib/api";
import { fromKey, serverTodayKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = ["VENDOR_BILLING", "CLIENT_BILLING", "OFFICE_PURCHASE", "EVENT_PRIZE", "OTHER"];

// PATCH /api/expenses/[id] — update an expense.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireExpenseAccess();
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new ApiError(404, "Expense not found.");

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

    if (body.category !== undefined && !CATEGORIES.includes(body.category)) {
      throw new ApiError(400, "Invalid category.");
    }
    if (body.amount !== undefined && (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0)) {
      throw new ApiError(400, "Amount must be a positive number.");
    }
    if (body.date !== undefined && (!KEY_RE.test(body.date) || body.date > serverTodayKey())) {
      throw new ApiError(400, "Invalid expense date.");
    }
    if (body.teamId) {
      const team = await prisma.team.findUnique({ where: { id: body.teamId }, select: { id: true } });
      if (!team) throw new ApiError(400, "Selected team does not exist.");
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        ...(body.title?.trim() ? { title: body.title.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
        ...(body.category !== undefined ? { category: body.category as never } : {}),
        ...(body.party !== undefined ? { party: body.party.trim() || null } : {}),
        ...(body.amount !== undefined ? { amount: Number(body.amount) } : {}),
        ...(body.date !== undefined ? { date: fromKey(body.date) } : {}),
        ...(body.teamId !== undefined ? { teamId: body.teamId || null } : {}),
        ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod.trim() || null } : {}),
        ...(body.receiptUrl !== undefined ? { receiptUrl: body.receiptUrl.trim() || null } : {}),
      },
      include: {
        creator: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      actorId: session.userId,
      action: AUDIT.EXPENSE_UPDATED,
      details: { expenseId: id, title: updated.title },
    });
    return ok({ expense: updated, message: "Expense updated." });
  });
}

// DELETE /api/expenses/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireExpenseAccess();
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new ApiError(404, "Expense not found.");

    await prisma.expense.delete({ where: { id } });
    await logAudit({
      actorId: session.userId,
      action: AUDIT.EXPENSE_DELETED,
      details: { expenseId: id, title: expense.title, amount: expense.amount },
    });
    return ok({ message: "Expense deleted." });
  });
}

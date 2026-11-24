import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireExpenseAccess } from "@/lib/api";
import { fromKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["INCOMING", "OUTGOING"];
const STATUSES = ["DRAFT", "SENT", "PENDING", "PAID", "CANCELLED"];

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

async function assertUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } });
  if (!user || !user.isActive) throw new ApiError(400, "Responsible user must be active.");
}

async function assertTeam(id: string | null | undefined) {
  if (!id) return;
  const team = await prisma.team.findUnique({ where: { id }, select: { id: true } });
  if (!team) throw new ApiError(400, "Selected team does not exist.");
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session, user } = await requireExpenseAccess();
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new ApiError(404, "Invoice not found.");
    if (user.role !== "DIRECTOR" && user.role !== "ADMIN" && invoice.responsibleUserId !== session.userId) {
      throw new ApiError(403, "You can update only invoices assigned to you.");
    }

    const body = await readJson<{
      invoiceNumber?: string | null;
      title?: string;
      description?: string | null;
      type?: string;
      status?: string;
      source?: string;
      amount?: number;
      invoiceDate?: string;
      dueDate?: string;
      paidDate?: string | null;
      responsibleUserId?: string;
      teamId?: string | null;
      attachmentUrl?: string | null;
    }>(req);

    if (body.type !== undefined && !TYPES.includes(body.type)) throw new ApiError(400, "Invalid invoice type.");
    if (body.status !== undefined && !STATUSES.includes(body.status)) throw new ApiError(400, "Invalid invoice status.");
    if (body.amount !== undefined && (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0)) {
      throw new ApiError(400, "Amount must be a positive number.");
    }
    if (body.invoiceDate !== undefined && !KEY_RE.test(body.invoiceDate)) throw new ApiError(400, "Invalid invoice date.");
    if (body.dueDate !== undefined && !KEY_RE.test(body.dueDate)) throw new ApiError(400, "Invalid due date.");
    if (body.paidDate && !KEY_RE.test(body.paidDate)) throw new ApiError(400, "Invalid paid date.");

    const invoiceDate = body.invoiceDate ?? invoice.invoiceDate.toISOString().slice(0, 10);
    const dueDate = body.dueDate ?? invoice.dueDate.toISOString().slice(0, 10);
    if (dueDate < invoiceDate) throw new ApiError(400, "Due date cannot be before invoice date.");

    if (body.responsibleUserId) await assertUser(body.responsibleUserId);
    if (body.teamId !== undefined) await assertTeam(body.teamId);

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        ...(body.invoiceNumber !== undefined ? { invoiceNumber: clean(body.invoiceNumber) } : {}),
        ...(body.title?.trim() ? { title: body.title.trim() } : {}),
        ...(body.description !== undefined ? { description: clean(body.description) } : {}),
        ...(body.type !== undefined ? { type: body.type as never } : {}),
        ...(body.status !== undefined ? { status: body.status as never } : {}),
        ...(body.source?.trim() ? { source: body.source.trim() } : {}),
        ...(body.amount !== undefined ? { amount: Number(body.amount) } : {}),
        ...(body.invoiceDate !== undefined ? { invoiceDate: fromKey(body.invoiceDate) } : {}),
        ...(body.dueDate !== undefined ? { dueDate: fromKey(body.dueDate) } : {}),
        ...(body.paidDate !== undefined ? { paidDate: body.paidDate ? fromKey(body.paidDate) : null } : {}),
        ...(body.responsibleUserId !== undefined ? { responsibleUserId: body.responsibleUserId } : {}),
        ...(body.teamId !== undefined ? { teamId: body.teamId || null } : {}),
        ...(body.attachmentUrl !== undefined ? { attachmentUrl: clean(body.attachmentUrl) } : {}),
      },
      include: {
        responsibleUser: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      actorId: session.userId,
      targetUserId: updated.responsibleUserId,
      action: AUDIT.INVOICE_UPDATED,
      details: { invoiceId: id, title: updated.title, status: updated.status },
    });
    return ok({ invoice: updated, message: "Invoice updated." });
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session, user } = await requireExpenseAccess();
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new ApiError(404, "Invoice not found.");
    if (user.role !== "DIRECTOR" && user.role !== "ADMIN" && invoice.responsibleUserId !== session.userId) {
      throw new ApiError(403, "You can delete only invoices assigned to you.");
    }

    await prisma.invoice.delete({ where: { id } });
    await logAudit({
      actorId: session.userId,
      targetUserId: invoice.responsibleUserId,
      action: AUDIT.INVOICE_DELETED,
      details: { invoiceId: id, title: invoice.title, amount: invoice.amount },
    });
    return ok({ message: "Invoice deleted." });
  });
}

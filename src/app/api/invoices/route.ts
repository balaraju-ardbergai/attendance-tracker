import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireExpenseAccess } from "@/lib/api";
import { addDaysKey, fromKey, serverTodayKey } from "@/lib/dates";
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

export async function GET(req: Request) {
  return handleRoute(async () => {
    const { session, user } = await requireExpenseAccess();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const responsibleUserId = url.searchParams.get("responsibleUserId");

    const ownerFilter =
      user.role === "DIRECTOR" || user.role === "ADMIN"
        ? responsibleUserId && responsibleUserId !== "ALL"
          ? { responsibleUserId }
          : {}
        : { responsibleUserId: session.userId };

    const dueFilter: { gte?: Date; lte?: Date } =
      from && KEY_RE.test(from) ? { gte: fromKey(from) } : {};
    if (to && KEY_RE.test(to)) dueFilter.lte = fromKey(to);

    const invoices = await prisma.invoice.findMany({
      where: {
        ...ownerFilter,
        ...(status && STATUSES.includes(status) ? { status: status as never } : {}),
        ...(type && TYPES.includes(type) ? { type: type as never } : {}),
        ...(Object.keys(dueFilter).length ? { dueDate: dueFilter } : {}),
      },
      include: {
        responsibleUser: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 500,
    });

    return ok({
      invoices,
      summary: {
        count: invoices.length,
        total: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
        dueSoon: invoices.filter((invoice) => invoice.status !== "PAID" && invoice.status !== "CANCELLED" && invoice.dueDate <= fromKey(addDaysKey(serverTodayKey(), 7))).length,
      },
    });
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireExpenseAccess();
    const body = await readJson<{
      invoiceNumber?: string;
      title?: string;
      description?: string;
      type?: string;
      status?: string;
      source?: string;
      amount?: number;
      invoiceDate?: string;
      dueDate?: string;
      paidDate?: string | null;
      responsibleUserId?: string;
      teamId?: string | null;
      attachmentUrl?: string;
    }>(req);

    const title = body.title?.trim();
    const source = body.source?.trim();
    if (!title) throw new ApiError(400, "A title is required.");
    if (!source) throw new ApiError(400, "Company or source is required.");
    if (!body.type || !TYPES.includes(body.type)) throw new ApiError(400, "A valid invoice type is required.");
    if (body.status && !STATUSES.includes(body.status)) throw new ApiError(400, "A valid status is required.");
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "Amount must be a positive number.");
    if (!body.invoiceDate || !KEY_RE.test(body.invoiceDate)) throw new ApiError(400, "A valid invoice date is required.");
    if (!body.dueDate || !KEY_RE.test(body.dueDate)) throw new ApiError(400, "A valid due date is required.");
    if (body.paidDate && !KEY_RE.test(body.paidDate)) throw new ApiError(400, "A valid paid date is required.");
    if (body.dueDate < body.invoiceDate) throw new ApiError(400, "Due date cannot be before invoice date.");
    if (!body.responsibleUserId) throw new ApiError(400, "Responsible user is required.");

    await assertUser(body.responsibleUserId);
    await assertTeam(body.teamId);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: clean(body.invoiceNumber),
        title,
        description: clean(body.description),
        type: body.type as never,
        status: (body.status ?? "PENDING") as never,
        source,
        amount,
        invoiceDate: fromKey(body.invoiceDate),
        dueDate: fromKey(body.dueDate),
        paidDate: body.paidDate ? fromKey(body.paidDate) : null,
        responsibleUserId: body.responsibleUserId,
        teamId: body.teamId || null,
        attachmentUrl: clean(body.attachmentUrl),
        createdById: session.userId,
      },
      include: {
        responsibleUser: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      actorId: session.userId,
      targetUserId: invoice.responsibleUserId,
      action: AUDIT.INVOICE_CREATED,
      details: { invoiceId: invoice.id, title: invoice.title, amount: invoice.amount, dueDate: body.dueDate },
    });
    return ok({ invoice, message: "Invoice recorded." }, 201);
  });
}

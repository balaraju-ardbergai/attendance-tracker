import { prisma } from "@/lib/db";
import { handleRoute, ok, requireExpenseAccess } from "@/lib/api";
import { addDaysKey, fromKey, serverTodayKey } from "@/lib/dates";

export async function GET() {
  return handleRoute(async () => {
    const { session } = await requireExpenseAccess();
    const today = serverTodayKey();
    const dueThrough = addDaysKey(today, 7);

    const invoices = await prisma.invoice.findMany({
      where: {
        responsibleUserId: session.userId,
        status: { notIn: ["PAID", "CANCELLED"] },
        dueDate: { lte: fromKey(dueThrough) },
      },
      select: {
        id: true,
        title: true,
        source: true,
        amount: true,
        dueDate: true,
        status: true,
        type: true,
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    });

    return ok({
      today,
      dueThrough,
      count: invoices.length,
      overdueCount: invoices.filter((invoice) => invoice.dueDate < fromKey(today)).length,
      invoices,
    });
  });
}

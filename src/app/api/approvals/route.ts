import { prisma } from "@/lib/db";
import { handleRoute, ok, requireActiveUser } from "@/lib/api";

export async function GET() {
  return handleRoute(async () => {
    await requireActiveUser(["DIRECTOR"]);
    const approvals = await prisma.approval.findMany({
      include: { requestedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    approvals.sort((a, b) => {
      if (a.status === "PENDING" && b.status !== "PENDING") return -1;
      if (b.status === "PENDING" && a.status !== "PENDING") return 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const pendingCount = approvals.filter((a) => a.status === "PENDING").length;
    return ok({ approvals, pendingCount });
  });
}

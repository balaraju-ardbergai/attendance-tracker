import { prisma } from "@/lib/db";
import { handleRoute, ok, requireActiveUser } from "@/lib/api";

// Director-facing trail of HR activities ("Actions Taken").
export async function GET() {
  return handleRoute(async () => {
    await requireActiveUser(["DIRECTOR"]);
    const logs = await prisma.auditLog.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
      include: {
        actor: { select: { name: true, email: true } },
        targetUser: { select: { name: true, email: true } },
      },
    });
    return ok({ logs });
  });
}

import { prisma } from "@/lib/db";
import { handleRoute, ok, requireActiveUser } from "@/lib/api";

// GET /api/org — active users with their manager links, for the org graph.
// Visible to everyone (read-only); editing managers is admin/director only.
export async function GET() {
  return handleRoute(async () => {
    await requireActiveUser();
    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        pictureUrl: true,
        managerId: true,
      },
    });
    return ok({ users });
  });
}

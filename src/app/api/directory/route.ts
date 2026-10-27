import { prisma } from "@/lib/db";
import { handleRoute, ok, requireActiveUser } from "@/lib/api";

// GET /api/directory — lightweight people list (id, name, email) for pickers
// available to every signed-in user (project leads are regular employees).
export async function GET() {
  return handleRoute(async () => {
    await requireActiveUser();
    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    });
    return ok({ users });
  });
}

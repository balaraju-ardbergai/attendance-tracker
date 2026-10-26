import { prisma } from "@/lib/db";
import { handleRoute, ok } from "@/lib/api";
import { getSession } from "@/lib/auth";

export async function GET() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return ok({ user: null });

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.isActive) return ok({ user: null });

    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        pictureUrl: user.pictureUrl,
        mustResetPassword: user.mustResetPassword,
        expenseAccess: user.role === "DIRECTOR" || user.role === "ADMIN" || user.expenseAccess,
      },
    });
  });
}

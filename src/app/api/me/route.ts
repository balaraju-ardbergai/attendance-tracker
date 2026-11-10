import { prisma } from "@/lib/db";
import { handleRoute, ok } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { MONOCHROME_THEME_SLUG } from "@/lib/themes";

export async function GET() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return ok({ user: null });

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { theme: { select: { slug: true, isActive: true } } },
    });
    if (!user || !user.isActive) return ok({ user: null });

    const ledTeams = await prisma.team.count({ where: { leadId: user.id } });

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
        isTeamLead: ledTeams > 0,
        theme: user.theme?.isActive ? user.theme.slug : MONOCHROME_THEME_SLUG,
      },
    });
  });
}

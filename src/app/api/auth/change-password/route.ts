import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson } from "@/lib/api";
import { getSession, hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { AUDIT, logAudit } from "@/lib/audit";
import { passwordChangedEmail, sendMail } from "@/lib/mail";

// Used for the mandatory first-login password change (temporary password) and,
// optionally, for normal self-service changes (current password required then).
// Deliberately does NOT use requireUser: users with mustResetPassword are
// blocked from every other API until they complete this.
export async function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) throw new ApiError(401, "You must sign in first.");

    const { currentPassword, newPassword } = await readJson<{
      currentPassword?: string;
      newPassword?: string;
    }>(req);

    if (!newPassword || newPassword.length < 8) {
      throw new ApiError(400, "Password must be at least 8 characters long.");
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.isActive) throw new ApiError(401, "Account not found or inactive.");

    if (!user.mustResetPassword) {
      if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new ApiError(400, "Your current password is incorrect.");
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustResetPassword: false },
    });

    await setSessionCookie({
      userId: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      mustResetPassword: false,
    });

    await logAudit({ actorId: user.id, targetUserId: user.id, action: AUDIT.PASSWORD_CHANGED });
    await sendMail(passwordChangedEmail(user.name, user.email));

    return ok({ message: "Password updated successfully." });
  });
}

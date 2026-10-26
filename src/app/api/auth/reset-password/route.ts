import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { logAudit, AUDIT } from "@/lib/audit";
import { passwordChangedEmail, sendMail } from "@/lib/mail";

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { email, code, newPassword } = await readJson<{
      email?: string;
      code?: string;
      newPassword?: string;
    }>(req);
    if (!email || !code || !newPassword) {
      throw new ApiError(400, "Email, code and a new password are required.");
    }
    if (newPassword.length < 8) {
      throw new ApiError(400, "Password must be at least 8 characters long.");
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.isActive) throw new ApiError(400, "Invalid or expired code.");

    const otp = await prisma.otp.findFirst({
      where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.expiresAt < new Date()) {
      throw new ApiError(400, "This code has expired. Please request a new one.");
    }
    if (!(await verifyPassword(code, otp.codeHash))) {
      throw new ApiError(400, "Incorrect code. Please check and try again.");
    }

    await prisma.$transaction([
      prisma.otp.update({ where: { id: otp.id }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword), mustResetPassword: false },
      }),
    ]);

    await logAudit({ actorId: user.id, targetUserId: user.id, action: AUDIT.PASSWORD_RESET });
    await sendMail(passwordChangedEmail(user.name, user.email));

    return ok({ message: "Password updated. You can now sign in with your new password." });
  });
}

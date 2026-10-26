import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson } from "@/lib/api";
import { generateOtpCode, hashPassword } from "@/lib/auth";
import { isMailConfigured, passwordResetOtpEmail, sendMail } from "@/lib/mail";

const OTP_TTL_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { email } = await readJson<{ email?: string }>(req);
    if (!email) throw new ApiError(400, "Email is required.");

    const genericMessage =
      "If an account exists for this email, a 6-digit code has been sent. It is valid for 5 minutes.";

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user || !user.isActive) {
      // Do not reveal whether the account exists.
      return ok({ message: genericMessage });
    }

    const recent = await prisma.otp.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } },
    });
    if (recent) {
      throw new ApiError(429, "Please wait a minute before requesting another code.");
    }

    // Invalidate any codes that are still outstanding.
    await prisma.otp.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = generateOtpCode();
    await prisma.otp.create({
      data: {
        userId: user.id,
        codeHash: await hashPassword(code),
        purpose: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    const mail = passwordResetOtpEmail(user.name, user.email, code);
    const { delivered } = await sendMail(mail);

    const exposeDevCode =
      process.env.NODE_ENV !== "production" &&
      process.env.DEV_EXPOSE_OTP === "true" &&
      !isMailConfigured();

    return ok({ message: genericMessage, ...(exposeDevCode ? { devCode: code, delivered } : {}) });
  });
}

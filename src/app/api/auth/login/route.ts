import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson } from "@/lib/api";
import { setSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { email, password } = await readJson<{ email?: string; password?: string }>(req);
    if (!email || !password) throw new ApiError(400, "Email and password are required.");

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      throw new ApiError(401, "Invalid email or password.");
    }

    await setSessionCookie({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustResetPassword: user.mustResetPassword,
    });

    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustResetPassword: user.mustResetPassword,
      },
    });
  });
}

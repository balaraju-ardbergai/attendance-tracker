import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { generateTempPassword, hashPassword } from "@/lib/auth";
import { AUDIT, logAudit } from "@/lib/audit";
import { approvalRequestedEmail, inviteEmail, sendMail } from "@/lib/mail";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  return handleRoute(async () => {
    await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const users = await prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true, name: true, email: true, role: true, department: true,
        pictureUrl: true, isActive: true, createdAt: true,
        managerId: true, expenseAccess: true, receivesExpenseReports: true,
      },
    });
    return ok({ users });
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const body = await readJson<{ name?: string; email?: string; department?: string; role?: string }>(req);
    const name = body.name?.trim();
    const email = body.email?.toLowerCase().trim();
    const department = body.department?.trim() || null;
    const role = body.role === "ADMIN" && session.role === "DIRECTOR" ? "ADMIN" : "EMPLOYEE";

    if (!name || name.length < 2) throw new ApiError(400, "Please enter the person's full name.");
    if (!email || !EMAIL_RE.test(email)) throw new ApiError(400, "Please enter a valid email address.");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ApiError(409, "A user with this email already exists.");

    if (session.role === "DIRECTOR") {
      // Directors create users directly.
      const tempPassword = generateTempPassword();
      const user = await prisma.user.create({
        data: {
          name, email, department, role,
          passwordHash: await hashPassword(tempPassword),
          mustResetPassword: true,
        },
      });
      await logAudit({
        actorId: session.userId, targetUserId: user.id, action: AUDIT.USER_ADDED,
        details: { email, role, department },
      });
      await sendMail(inviteEmail(name, email, tempPassword));
      return ok({ user, tempPassword, message: "User created. An invitation email with the temporary password has been sent." }, 201);
    }

    // HR Admins propose the addition; a Director must approve it.
    const approval = await prisma.approval.create({
      data: {
        type: "USER_ADD",
        payload: { name, email, department, role } as never,
        requestedById: session.userId,
      },
    });
    await logAudit({
      actorId: session.userId, action: AUDIT.APPROVAL_SUBMITTED,
      details: { approvalId: approval.id, type: "USER_ADD", email },
    });

    const directors = await prisma.user.findMany({ where: { role: "DIRECTOR", isActive: true } });
    for (const director of directors) {
      await sendMail(approvalRequestedEmail(director.name, director.email, session.name, `add user ${name} (${email})`));
    }

    return ok({ approval, message: "Request sent to the Director for approval. The user will be created once approved." }, 201);
  });
}

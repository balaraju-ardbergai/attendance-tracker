import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { generateTempPassword, hashPassword } from "@/lib/auth";
import { AUDIT, logAudit } from "@/lib/audit";
import { approvalOutcomeEmail, inviteEmail, sendMail } from "@/lib/mail";

type ApprovalPayload = {
  userId?: string;
  name?: string;
  email?: string;
  department?: string | null;
  role?: string;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["DIRECTOR"]);
    const { action, note } = await readJson<{ action?: "APPROVE" | "REJECT"; note?: string }>(req);
    if (action !== "APPROVE" && action !== "REJECT") throw new ApiError(400, "Action must be APPROVE or REJECT.");

    const approval = await prisma.approval.findUnique({
      where: { id },
      include: { requestedBy: { select: { id: true, name: true, email: true } } },
    });
    if (!approval) throw new ApiError(404, "Approval request not found.");
    if (approval.status !== "PENDING") throw new ApiError(409, "This request has already been reviewed.");

    const payload = approval.payload as ApprovalPayload;

    if (action === "REJECT") {
      await prisma.approval.update({
        where: { id },
        data: { status: "REJECTED", reviewedById: session.userId, reviewedAt: new Date(), note: note?.trim() || null },
      });
      await logAudit({
        actorId: session.userId, targetUserId: approval.requestedById, action: AUDIT.APPROVAL_REJECTED,
        details: { approvalId: id, type: approval.type },
      });
      await sendMail(approvalOutcomeEmail(approval.requestedBy.name, approval.requestedBy.email, describe(approval.type, payload), false));
      return ok({ message: "Request rejected." });
    }

    // APPROVE — execute the underlying action.
    switch (approval.type) {
      case "USER_ADD": {
        if (!payload.email || !payload.name) throw new ApiError(400, "The approval payload is incomplete.");
        const clash = await prisma.user.findUnique({ where: { email: payload.email } });
        if (clash) throw new ApiError(409, "A user with this email already exists. Reject this request instead.");
        const tempPassword = generateTempPassword();
        const user = await prisma.user.create({
          data: {
            name: payload.name,
            email: payload.email,
            department: payload.department ?? null,
            role: payload.role === "ADMIN" ? "ADMIN" : "EMPLOYEE",
            passwordHash: await hashPassword(tempPassword),
            mustResetPassword: true,
          },
        });
        await logAudit({ actorId: session.userId, targetUserId: user.id, action: AUDIT.USER_ADDED, details: { email: payload.email } });
        await sendMail(inviteEmail(payload.name, payload.email, tempPassword));
        break;
      }
      case "USER_REMOVE": {
        const user = await prisma.user.update({ where: { id: payload.userId! }, data: { isActive: false } });
        await logAudit({ actorId: session.userId, targetUserId: user.id, action: AUDIT.USER_REMOVED, details: { email: user.email } });
        break;
      }
      case "USER_REACTIVATE": {
        const user = await prisma.user.update({ where: { id: payload.userId! }, data: { isActive: true } });
        await logAudit({ actorId: session.userId, targetUserId: user.id, action: AUDIT.USER_REACTIVATED, details: { email: user.email } });
        break;
      }
      case "ASSIGN_HR": {
        const user = await prisma.user.update({ where: { id: payload.userId! }, data: { role: "ADMIN" } });
        await logAudit({ actorId: session.userId, targetUserId: user.id, action: AUDIT.HR_ASSIGNED, details: { email: user.email } });
        break;
      }
      case "SET_EMPLOYEE": {
        const user = await prisma.user.update({ where: { id: payload.userId! }, data: { role: "EMPLOYEE" } });
        await logAudit({ actorId: session.userId, targetUserId: user.id, action: AUDIT.HR_UNASSIGNED, details: { email: user.email } });
        break;
      }
      default:
        throw new ApiError(400, "Unknown approval type.");
    }

    await prisma.approval.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: session.userId, reviewedAt: new Date(), note: note?.trim() || null },
    });
    await logAudit({
      actorId: session.userId, targetUserId: approval.requestedById, action: AUDIT.APPROVAL_APPROVED,
      details: { approvalId: id, type: approval.type },
    });
    await sendMail(approvalOutcomeEmail(approval.requestedBy.name, approval.requestedBy.email, describe(approval.type, payload), true));

    return ok({ message: "Approved and applied." });
  });
}

function describe(type: string, payload: ApprovalPayload): string {
  switch (type) {
    case "USER_ADD": return `add user ${payload.name} (${payload.email})`;
    case "USER_REMOVE": return `remove user ${payload.name}`;
    case "USER_REACTIVATE": return `reactivate user ${payload.name}`;
    case "ASSIGN_HR": return `assign ${payload.name} as HR Admin`;
    case "SET_EMPLOYEE": return `change ${payload.name} to Employee`;
    default: return "an administrative action";
  }
}

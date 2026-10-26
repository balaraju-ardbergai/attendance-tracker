import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { AUDIT, logAudit } from "@/lib/audit";
import { approvalRequestedEmail, sendMail } from "@/lib/mail";

type Action = "UPDATE" | "DEACTIVATE" | "REACTIVATE" | "ASSIGN_HR" | "SET_EMPLOYEE";

// Major changes requested by HR Admins are routed to a Director via an Approval;
// Directors apply them directly.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await params;
    const { session } = await requireActiveUser(["ADMIN", "DIRECTOR"]);
    const body = await readJson<{
      action?: Action;
      name?: string;
      department?: string;
      pictureUrl?: string;
    }>(req);

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new ApiError(404, "User not found.");

    const isDirector = session.role === "DIRECTOR";
    const informDirectors = async (what: string) => {
      const directors = await prisma.user.findMany({ where: { role: "DIRECTOR", isActive: true } });
      for (const director of directors) {
        await sendMail(approvalRequestedEmail(director.name, director.email, session.name, what));
      }
    };

    const submitApproval = async (type: "USER_REMOVE" | "USER_REACTIVATE" | "ASSIGN_HR" | "SET_EMPLOYEE", what: string) => {
      const approval = await prisma.approval.create({
        data: { type, payload: { userId: target.id, name: target.name, email: target.email } as never, requestedById: session.userId },
      });
      await logAudit({
        actorId: session.userId, targetUserId: target.id, action: AUDIT.APPROVAL_SUBMITTED,
        details: { approvalId: approval.id, type, targetEmail: target.email },
      });
      await informDirectors(what);
      return ok({ approval, message: "Request sent to the Director for approval." }, 202);
    };

    switch (body.action) {
      case "UPDATE": {
        if (target.role === "DIRECTOR" && !isDirector) throw new ApiError(403, "Directors can only be managed by other Directors.");
        const updated = await prisma.user.update({
          where: { id },
          data: {
            ...(body.name?.trim() ? { name: body.name.trim() } : {}),
            ...(body.department !== undefined ? { department: body.department.trim() || null } : {}),
            ...(body.pictureUrl !== undefined ? { pictureUrl: body.pictureUrl.trim() || null } : {}),
          },
        });
        await logAudit({ actorId: session.userId, targetUserId: id, action: AUDIT.PROFILE_UPDATED, details: { email: target.email } });
        return ok({ user: updated, message: "Profile updated." });
      }
      case "DEACTIVATE": {
        if (target.id === session.userId) throw new ApiError(400, "You cannot remove your own account.");
        if (target.role === "DIRECTOR") throw new ApiError(403, "Directors cannot be removed from the portal.");
        if (!target.isActive) throw new ApiError(409, "This user is already inactive.");
        if (isDirector) {
          await prisma.user.update({ where: { id }, data: { isActive: false } });
          await logAudit({ actorId: session.userId, targetUserId: id, action: AUDIT.USER_REMOVED, details: { email: target.email } });
          return ok({ message: `${target.name} has been removed.` });
        }
        return submitApproval("USER_REMOVE", `remove user ${target.name} (${target.email})`);
      }
      case "REACTIVATE": {
        if (target.isActive) throw new ApiError(409, "This user is already active.");
        if (isDirector) {
          await prisma.user.update({ where: { id }, data: { isActive: true } });
          await logAudit({ actorId: session.userId, targetUserId: id, action: AUDIT.USER_REACTIVATED, details: { email: target.email } });
          return ok({ message: `${target.name} has been reactivated.` });
        }
        return submitApproval("USER_REACTIVATE", `reactivate user ${target.name} (${target.email})`);
      }
      case "ASSIGN_HR": {
        if (target.id === session.userId) throw new ApiError(400, "You cannot change your own role.");
        if (target.role !== "EMPLOYEE") throw new ApiError(409, "Only employees can be assigned as HR.");
        if (isDirector) {
          await prisma.user.update({ where: { id }, data: { role: "ADMIN" } });
          await logAudit({ actorId: session.userId, targetUserId: id, action: AUDIT.HR_ASSIGNED, details: { email: target.email } });
          return ok({ message: `${target.name} is now an HR Admin.` });
        }
        return submitApproval("ASSIGN_HR", `assign ${target.name} (${target.email}) as HR Admin`);
      }
      case "SET_EMPLOYEE": {
        if (target.id === session.userId) throw new ApiError(400, "You cannot change your own role.");
        if (target.role !== "ADMIN") throw new ApiError(409, "This user is not an HR Admin.");
        if (isDirector) {
          await prisma.user.update({ where: { id }, data: { role: "EMPLOYEE" } });
          await logAudit({ actorId: session.userId, targetUserId: id, action: AUDIT.HR_UNASSIGNED, details: { email: target.email } });
          return ok({ message: `${target.name} is now a regular employee.` });
        }
        return submitApproval("SET_EMPLOYEE", `change ${target.name} (${target.email}) back to Employee`);
      }
      default:
        throw new ApiError(400, "Unknown action.");
    }
  });
}

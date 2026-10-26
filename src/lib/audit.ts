import { prisma } from "./db";

// Director-facing trail of HR activities ("Actions Taken").

export const AUDIT = {
  USER_ADDED: "USER_ADDED",
  USER_REMOVED: "USER_REMOVED",
  USER_REACTIVATED: "USER_REACTIVATED",
  HR_ASSIGNED: "HR_ASSIGNED",
  HR_UNASSIGNED: "HR_UNASSIGNED",
  PROFILE_UPDATED: "PROFILE_UPDATED",
  REQUEST_SUBMITTED: "REQUEST_SUBMITTED",
  REQUEST_APPROVED: "REQUEST_APPROVED",
  REQUEST_REJECTED: "REQUEST_REJECTED",
  REQUEST_CANCELLED: "REQUEST_CANCELLED",
  APPROVAL_SUBMITTED: "APPROVAL_SUBMITTED",
  APPROVAL_APPROVED: "APPROVAL_APPROVED",
  APPROVAL_REJECTED: "APPROVAL_REJECTED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET: "PASSWORD_RESET",
  CONNECTOR_LINKED: "CONNECTOR_LINKED",
  CONNECTOR_UNLINKED: "CONNECTOR_UNLINKED",
} as const;

export async function logAudit(entry: {
  actorId: string;
  targetUserId?: string | null;
  action: string;
  details?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        targetUserId: entry.targetUserId ?? null,
        action: entry.action,
        details: (entry.details ?? undefined) as never,
      },
    });
  } catch (err) {
    // Auditing must never break the main flow.
    console.error("[audit] failed to write entry:", err);
  }
}

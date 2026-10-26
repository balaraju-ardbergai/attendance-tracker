// Client-safe labels and types shared between pages and API routes.

export type AppRole = "DIRECTOR" | "ADMIN" | "EMPLOYEE";

export const ROLE_LABEL: Record<AppRole, string> = {
  DIRECTOR: "Director",
  ADMIN: "HR Admin",
  EMPLOYEE: "Employee",
};

export const REQUEST_TYPE_LABEL: Record<string, string> = {
  LEAVE: "Leave",
  WFH: "Work From Home",
};

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const ATTENDANCE_STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present",
  LATE: "Late",
  LEAVE: "On Leave",
  WFH: "Work From Home",
  ABSENT: "Absent",
};

export const APPROVAL_TYPE_LABEL: Record<string, string> = {
  USER_ADD: "Add new user",
  USER_REMOVE: "Remove user",
  USER_REACTIVATE: "Reactivate user",
  ASSIGN_HR: "Assign as HR Admin",
  SET_EMPLOYEE: "Change to Employee",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  USER_ADDED: "Added a user",
  USER_REMOVED: "Removed a user",
  USER_REACTIVATED: "Reactivated a user",
  HR_ASSIGNED: "Assigned HR role",
  HR_UNASSIGNED: "Removed HR role",
  PROFILE_UPDATED: "Updated a profile",
  REQUEST_SUBMITTED: "Submitted a request",
  REQUEST_APPROVED: "Approved a request",
  REQUEST_REJECTED: "Rejected a request",
  REQUEST_CANCELLED: "Cancelled a request",
  APPROVAL_SUBMITTED: "Requested Director approval",
  APPROVAL_APPROVED: "Approved an approval request",
  APPROVAL_REJECTED: "Rejected an approval request",
  PASSWORD_CHANGED: "Changed their password",
  PASSWORD_RESET: "Reset their password",
  CONNECTOR_LINKED: "Connected an external service",
  CONNECTOR_UNLINKED: "Disconnected an external service",
};

// Status colors used by badges, the month grid and the combined stat bar.
export const STATUS_TONE: Record<string, string> = {
  PRESENT: "bg-emerald-500",
  LATE: "bg-amber-500",
  LEAVE: "bg-violet-500",
  WFH: "bg-sky-500",
  ABSENT: "bg-rose-500",
};

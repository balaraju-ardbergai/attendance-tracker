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
  LEAVE: "On Leave",
  WFH: "Work From Home",
  ABSENT: "Absent",
};

export const COURSE_ATTENDANCE_LABEL: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  EXCUSED: "Excused",
};

export const COURSE_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
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
  COURSE_CREATED: "Created a course",
  COURSE_UPDATED: "Updated a course",
  COURSE_DELETED: "Deleted a course",
  MILESTONE_ADDED: "Added a course milestone",
  MILESTONE_UPDATED: "Updated a course milestone",
  MILESTONE_DELETED: "Deleted a course milestone",
  ENROLLED: "Enrolled a participant",
  UNENROLLED: "Removed a participant",
  PROGRESS_UPDATED: "Updated course progress",
  SESSION_ADDED: "Added course sessions",
  COURSE_ATTENDANCE_MARKED: "Marked course attendance",
};

// Status colors used by badges, the month grid and the combined stat bar.
export const STATUS_TONE: Record<string, string> = {
  PRESENT: "bg-emerald-500",
  LEAVE: "bg-violet-500",
  WFH: "bg-sky-500",
  ABSENT: "bg-rose-500",
};

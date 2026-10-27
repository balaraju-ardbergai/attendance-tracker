import { prisma } from "./db";
import { ApiError } from "./api";
import type { AppRole } from "./auth";

export const isManagerRole = (role: AppRole) => role === "DIRECTOR" || role === "ADMIN";

/** IDs of the teams this user leads. */
export async function ledTeamIds(userId: string): Promise<string[]> {
  const teams = await prisma.team.findMany({ where: { leadId: userId }, select: { id: true } });
  return teams.map((t) => t.id);
}

/** True when the user leads the given team or is HR/Director. */
export async function canAccessTeam(userId: string, role: AppRole, teamId: string): Promise<boolean> {
  if (isManagerRole(role)) return true;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leadId: true } });
  return team?.leadId === userId;
}

/** Can this session manage a project (create sprints/phases, edit issues)? */
export async function canManageProject(
  session: { userId: string; role: AppRole },
  project: { leadId: string | null; teamId: string | null },
): Promise<boolean> {
  if (isManagerRole(session.role)) return true;
  if (project.leadId === session.userId) return true;
  if (project.teamId) {
    const team = await prisma.team.findUnique({ where: { id: project.teamId }, select: { leadId: true } });
    if (team?.leadId === session.userId) return true;
  }
  return false;
}

export function assertManageProject(condition: boolean) {
  if (!condition) throw new ApiError(403, "Only the project lead, its team lead, HR or Directors can do that.");
}

/**
 * Prisma `where` fragment limiting projects to what the user may see:
 * HR/Directors see everything; others see projects they lead, projects of
 * their teams, org-wide projects (no team) and projects they are assigned in.
 */
export async function visibleProjectWhere(session: { userId: string; role: AppRole }) {
  if (isManagerRole(session.role)) return {};
  const led = await ledTeamIds(session.userId);
  const memberships = await prisma.teamMember.findMany({
    where: { userId: session.userId },
    select: { teamId: true },
  });
  const teamIds = [...led, ...memberships.map((m) => m.teamId)];
  return {
    OR: [
      { leadId: session.userId },
      { teamId: { in: teamIds } },
      { teamId: null },
      { tasks: { some: { assigneeId: session.userId } } },
    ],
  };
}

/** Is the user allowed to manage members/details of this team? */
export async function canManageTeamMembers(
  session: { userId: string; role: AppRole },
  team: { leadId: string | null },
): Promise<boolean> {
  return isManagerRole(session.role) || team.leadId === session.userId;
}

/** Can this session review (approve/reject) a request made by `requesterId`? */
export async function canReviewRequestOf(
  session: { userId: string; role: AppRole },
  requesterId: string,
): Promise<boolean> {
  if (isManagerRole(session.role)) return true;
  // Team leads review their own people: direct reports or members of teams they lead.
  const requester = await prisma.user.findUnique({ where: { id: requesterId }, select: { managerId: true } });
  if (requester?.managerId === session.userId) return true;
  if (requester?.managerId) {
    const manager = await prisma.user.findUnique({ where: { id: requester.managerId }, select: { managerId: true } });
    if (manager?.managerId === session.userId) return true; // skip-level (their lead's lead)
  }
  const membership = await prisma.teamMember.findFirst({
    where: { userId: requesterId, team: { leadId: session.userId } },
    select: { id: true },
  });
  return Boolean(membership);
}

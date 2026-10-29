import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { computeMonthStats, fromKey, serverTodayKey, toKey } from "@/lib/dates";
import { AUDIT, logAudit } from "@/lib/audit";

const PHONE_RE = /^[+()\-\s\d]{7,24}$/;
const TIMEZONE_RE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/;
const MAX = {
  preferredName: 80,
  phone: 24,
  pronouns: 40,
  location: 120,
  timezone: 80,
  bio: 1000,
  emergencyContactName: 120,
  emergencyContactRelationship: 80,
  emergencyContactPhone: 24,
} as const;

type EditableProfile = {
  preferredName?: string | null;
  phone?: string | null;
  pronouns?: string | null;
  location?: string | null;
  timezone?: string | null;
  bio?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
};

const clean = (value: string | null | undefined, max: number) => {
  if (value === undefined) return undefined;
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > max) throw new ApiError(400, `A profile field exceeds its ${max}-character limit.`);
  return normalized;
};

export async function GET() {
  return handleRoute(async () => {
    const { session, user } = await requireActiveUser();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayKey = serverTodayKey();
    const monthStart = fromKey(toKey(new Date(Date.UTC(year, month, 1))));
    const monthEnd = fromKey(toKey(new Date(Date.UTC(year, month + 1, 1))));

    const [
      profile,
      manager,
      memberships,
      ledTeams,
      directReports,
      attendance,
      requests,
      issues,
      enrollments,
      skills,
      connections,
    ] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId: user.id } }),
      user.managerId
        ? prisma.user.findUnique({
            where: { id: user.managerId },
            select: { id: true, name: true, email: true, role: true, pictureUrl: true },
          })
        : null,
      prisma.teamMember.findMany({
        where: { userId: user.id },
        include: { team: { select: { id: true, name: true, description: true, lead: { select: { id: true, name: true } } } } },
        orderBy: { joinedAt: "asc" },
      }),
      prisma.team.findMany({
        where: { leadId: user.id },
        select: { id: true, name: true, _count: { select: { members: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.user.count({ where: { managerId: user.id, isActive: true } }),
      prisma.attendance.findMany({
        where: { userId: user.id, date: { gte: monthStart, lt: monthEnd } },
        select: { date: true, status: true, clockInAt: true, clockOutAt: true },
        orderBy: { date: "asc" },
      }),
      prisma.request.findMany({
        where: { userId: user.id },
        select: { id: true, type: true, startDate: true, endDate: true, reason: true, status: true, reviewNote: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.task.findMany({
        where: { assigneeId: user.id, status: { not: "COMPLETED" } },
        select: {
          id: true,
          key: true,
          title: true,
          status: true,
          priority: true,
          progress: true,
          dueDate: true,
          storyPoints: true,
          project: { select: { id: true, key: true, name: true } },
          sprint: { select: { id: true, name: true, status: true } },
          phase: { select: { id: true, name: true, order: true } },
        },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        take: 20,
      }),
      prisma.courseEnrollment.findMany({
        where: { userId: user.id },
        include: {
          course: {
            include: {
              milestones: { orderBy: { order: "asc" }, select: { id: true, name: true, order: true } },
              sessions: { where: { date: { gte: fromKey(todayKey) } }, orderBy: { date: "asc" }, take: 1, select: { id: true, date: true, topic: true } },
            },
          },
        },
        orderBy: { enrolledAt: "desc" },
      }),
      prisma.userSkill.findMany({
        where: { userId: user.id },
        include: { skill: { select: { id: true, name: true } } },
        orderBy: { skill: { name: "asc" } },
      }),
      prisma.connection.findMany({ where: { userId: user.id }, orderBy: { provider: "asc" } }),
    ]);

    const milestoneIds = enrollments.flatMap((e) => e.course.milestones.map((m) => m.id));
    const progressRows = milestoneIds.length
      ? await prisma.milestoneProgress.findMany({
          where: { userId: user.id, milestoneId: { in: milestoneIds } },
          select: { milestoneId: true, percent: true },
        })
      : [];
    const progressByMilestone = new Map(progressRows.map((p) => [p.milestoneId, p.percent]));

    const courses = enrollments.map((enrollment) => {
      const milestones = enrollment.course.milestones;
      let sum = 0;
      let completed = 0;
      let currentMilestone: { id: string; name: string } | null = null;
      for (const milestone of milestones) {
        const percent = progressByMilestone.get(milestone.id) ?? 0;
        sum += percent;
        if (percent >= 100) completed += 1;
        else if (!currentMilestone) currentMilestone = { id: milestone.id, name: milestone.name };
      }
      return {
        id: enrollment.course.id,
        name: enrollment.course.name,
        description: enrollment.course.description,
        attendanceEnabled: enrollment.course.attendanceEnabled,
        enrolledAt: enrollment.enrolledAt,
        percent: milestones.length ? Math.round(sum / milestones.length) : 0,
        stepsCompleted: completed,
        totalSteps: milestones.length,
        currentMilestone,
        nextSession: enrollment.course.sessions[0]
          ? {
              id: enrollment.course.sessions[0].id,
              date: toKey(enrollment.course.sessions[0].date),
              topic: enrollment.course.sessions[0].topic,
            }
          : null,
      };
    });

    const today = attendance.find((record) => toKey(record.date) === todayKey) ?? null;
    const stats = computeMonthStats(attendance, year, month);
    const overdueCount = issues.filter((issue) => issue.dueDate && toKey(issue.dueDate) < todayKey).length;
    const pendingRequests = requests.filter((request) => request.status === "PENDING").length;
    const incompleteCourses = courses.filter((course) => course.percent < 100).length;

    return ok({
      identity: {
        id: user.id,
        legalName: user.name,
        displayName: profile?.preferredName || user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        pictureUrl: user.pictureUrl,
        createdAt: user.createdAt,
      },
      profile: {
        preferredName: profile?.preferredName ?? "",
        phone: profile?.phone ?? "",
        pronouns: profile?.pronouns ?? "",
        location: profile?.location ?? "",
        timezone: profile?.timezone ?? "",
        bio: profile?.bio ?? "",
        emergencyContactName: profile?.emergencyContactName ?? "",
        emergencyContactRelationship: profile?.emergencyContactRelationship ?? "",
        emergencyContactPhone: profile?.emergencyContactPhone ?? "",
      },
      organization: {
        manager,
        teams: memberships.map((membership) => membership.team),
        teamsLed: ledTeams.map((team) => ({ id: team.id, name: team.name, memberCount: team._count.members })),
        directReports: directReports,
      },
      attendance: {
        today: today
          ? { status: today.status, clockInAt: today.clockInAt, clockOutAt: today.clockOutAt }
          : null,
        stats,
        year,
        month,
      },
      requests: requests.map((request) => ({
        ...request,
        startDate: toKey(request.startDate),
        endDate: toKey(request.endDate),
      })),
      issues: issues.map((issue) => ({
        ...issue,
        dueDate: issue.dueDate ? toKey(issue.dueDate) : null,
      })),
      courses,
      skills: skills.map((row) => ({
        id: row.id,
        skillId: row.skill.id,
        name: row.skill.name,
        proficiency: row.proficiency,
        evidence: row.evidence,
      })),
      connections: connections.map((connection) => ({
        id: connection.id,
        provider: connection.provider,
        accountEmail: connection.accountEmail,
        connectedAt: connection.connectedAt,
      })),
      capabilities: {
        isTeamLead: ledTeams.length > 0,
        expenseAccess: session.role === "DIRECTOR" || session.role === "ADMIN" || user.expenseAccess,
        receivesExpenseReports: user.receivesExpenseReports,
      },
      attention: {
        attendanceNotMarked: !today,
        overdueIssues: overdueCount,
        pendingRequests,
        incompleteCourses,
      },
    });
  });
}

export async function PATCH(req: Request) {
  return handleRoute(async () => {
    const { session, user } = await requireActiveUser();
    const body = await readJson<EditableProfile & Record<string, unknown>>(req);

    // Explicitly reject HR-owned fields rather than silently ignoring them.
    const forbidden = [
      "email",
      "role",
      "department",
      "managerId",
      "isActive",
      "expenseAccess",
      "receivesExpenseReports",
      "mustResetPassword",
    ];
    const attempted = forbidden.find((field) => field in body);
    if (attempted) throw new ApiError(403, `${attempted} is managed by HR and cannot be changed here.`);

    const data = {
      preferredName: clean(body.preferredName, MAX.preferredName),
      phone: clean(body.phone, MAX.phone),
      pronouns: clean(body.pronouns, MAX.pronouns),
      location: clean(body.location, MAX.location),
      timezone: clean(body.timezone, MAX.timezone),
      bio: clean(body.bio, MAX.bio),
      emergencyContactName: clean(body.emergencyContactName, MAX.emergencyContactName),
      emergencyContactRelationship: clean(body.emergencyContactRelationship, MAX.emergencyContactRelationship),
      emergencyContactPhone: clean(body.emergencyContactPhone, MAX.emergencyContactPhone),
    };

    if (data.phone && !PHONE_RE.test(data.phone)) throw new ApiError(400, "Enter a valid phone number.");
    if (data.emergencyContactPhone && !PHONE_RE.test(data.emergencyContactPhone)) {
      throw new ApiError(400, "Enter a valid emergency contact phone number.");
    }
    if (data.timezone && !TIMEZONE_RE.test(data.timezone)) {
      throw new ApiError(400, "Timezone must be an IANA name such as Asia/Kolkata.");
    }

    const writable = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: writable,
      create: { userId: user.id, ...writable },
    });

    await logAudit({
      actorId: session.userId,
      targetUserId: session.userId,
      action: AUDIT.PROFILE_SELF_UPDATED,
      details: { fields: Object.keys(writable) },
    });

    return ok({ profile, message: "Personal information updated." });
  });
}

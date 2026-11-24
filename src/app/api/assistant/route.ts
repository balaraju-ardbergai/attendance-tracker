import { prisma } from "@/lib/db";
import { handleRoute, ok, readJson, requireActiveUser } from "@/lib/api";
import { computeMonthStats, formatKey, fromKey, serverTodayKey, toKey } from "@/lib/dates";
import { ledTeamIds } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/roles";

// Rule-based, account-aware assistant. It only ever reads data belonging to the
// signed-in user (or what their role already permits) — no data leaves the DB.
// An LLM provider can be layered on top later; the intent → data plumbing stays.

type Intent = { reply: string };

const suggestions = [
  "Where am I at the Claude certification?",
  "Did I mark attendance today?",
  "My attendance this month",
  "My pending requests",
  "My open tasks",
  "My team",
  "Expenses this month",
];

function bullet(items: string[]) {
  return items.map((i) => `• ${i}`).join("\n");
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { session } = await requireActiveUser();
    const { message } = await readJson<{ message?: string }>(req);
    const q = (message ?? "").toLowerCase().trim();
    if (!q) {
      return ok<Intent>({ reply: `Ask me things like:\n${bullet(suggestions)}` });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, role: true, department: true, managerId: true, expenseAccess: true },
    });
    if (!user) return ok<Intent>({ reply: "Your account could not be found. Please sign in again." });

    const has = (...words: string[]) => words.some((w) => q.includes(w));

    // ---- Courses / certification progress ----------------------------------
    if (has("course", "certification", "certified", "claude", "milestone", "where am i at", "progress")) {
      const enrollments = await prisma.courseEnrollment.findMany({
        where: { userId: user.id },
        include: { course: { select: { id: true, name: true, milestones: { select: { id: true, order: true, name: true } } } } },
      });
      if (enrollments.length === 0) {
        return ok<Intent>({ reply: "You are not enrolled in any courses yet. HR Admins can enroll you." });
      }
      // Match a specific course if the user named it.
      const named = enrollments.find((e) =>
        e.course.name.toLowerCase().split(/[\s-]+/).some((token) => token.length > 3 && q.includes(token)),
      );
      const targets = named ? [named] : enrollments;
      const lines: string[] = [];
      for (const enrollment of targets) {
        const milestones = enrollment.course.milestones;
        if (milestones.length === 0) {
          lines.push(`${enrollment.course.name}: no milestones defined yet.`);
          continue;
        }
        const progress = await prisma.milestoneProgress.findMany({
          where: { userId: user.id, milestone: { courseId: enrollment.course.id } },
          select: { percent: true, milestone: { select: { order: true, name: true } } },
        });
        const byOrder = new Map(progress.map((p) => [p.milestone.order, p]));
        const totalSteps = milestones.length;
        let sum = 0;
        let completed = 0;
        let next: string | null = null;
        for (const m of milestones) {
          const pct = byOrder.get(m.order)?.percent ?? 0;
          sum += pct;
          if (pct >= 100) completed++;
          else if (!next) next = m.name;
        }
        const percent = Math.round(sum / totalSteps);
        lines.push(
          `${enrollment.course.name}: ${percent}% overall (${completed}/${totalSteps} milestones done)` +
            (next ? `\n  ↳ You are currently at: ${next}` : "\n  ↳ All milestones completed — go get that exam! 🎉"),
        );
      }
      return ok<Intent>({ reply: lines.join("\n\n") });
    }

    // ---- Attendance --------------------------------------------------------
    if (has("attendance", "marked", "clock", "check in", "checkin", "punch")) {
      const todayKey = serverTodayKey();
      const now = new Date();
      const monthStart = fromKey(toKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))));
      const monthEnd = fromKey(toKey(new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))));
      const records = await prisma.attendance.findMany({
        where: { userId: user.id, date: { gte: monthStart, lt: monthEnd } },
        select: { date: true, status: true, clockInAt: true, clockOutAt: true },
      });
      const today = records.find((r) => toKey(r.date) === todayKey);
      const stats = computeMonthStats(records, now.getFullYear(), now.getMonth());
      const todayLine = today
        ? `Today: ${today.status}${today.clockInAt ? ` (in ${new Date(today.clockInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}${today.clockOutAt ? `, out ${new Date(today.clockOutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""})`
        : "Today: not marked yet — head to the Attendance page!";
      return ok<Intent>({
        reply: `${todayLine}\nThis month: ${stats.present} present · ${stats.leave} leave · ${stats.wfh} WFH · ${stats.absent} absent (of ${stats.workingDays} working days).`,
      });
    }

    // ---- My requests -------------------------------------------------------
    if (has("request", "leave", "wfh", "work from home", "holiday", "vacation")) {
      const requests = await prisma.request.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 6,
      });
      if (requests.length === 0) return ok<Intent>({ reply: "You haven't submitted any leave/WFH requests." });
      const pending = requests.filter((r) => r.status === "PENDING");
      const lines = requests.slice(0, 5).map((r) =>
        `${r.status} · ${r.type === "LEAVE" ? "Leave" : "WFH"} · ${formatKey(toKey(r.startDate))} → ${formatKey(toKey(r.endDate))}`,
      );
      return ok<Intent>({
        reply: `${pending.length} pending request(s).\n${bullet(lines)}\n\nManage them on the Requests page.`,
      });
    }

    // ---- My tasks / issues / sprint ---------------------------------------
    if (has("task", "issue", "jira", "sprint", "assigned", "todo", "to-do", "story", "bug")) {
      const issues = await prisma.task.findMany({
        where: { assigneeId: user.id, status: { not: "COMPLETED" } },
        include: { sprint: { select: { name: true, status: true } }, project: { select: { key: true } } },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        take: 8,
      });
      if (issues.length === 0) return ok<Intent>({ reply: "You have no open tasks. 🎉" });
      const lines = issues.map((t) => {
        const key = t.key ?? "TASK";
        const sprint = t.sprint ? ` · ${t.sprint.name}` : "";
        const due = t.dueDate ? ` · due ${formatKey(toKey(t.dueDate))}` : "";
        return `${key}: ${t.title} (${t.status.replace("_", " ").toLowerCase()}, ${t.progress}%${sprint}${due})`;
      });
      return ok<Intent>({ reply: `You have ${issues.length} open item(s):\n${bullet(lines)}` });
    }

    // ---- Team / manager / org ---------------------------------------------
    if (has("team", "member", "colleague", "teammate", "who is my", "manager", "lead", "hr", "director", "org")) {
      const memberships = await prisma.teamMember.findMany({
        where: { userId: user.id },
        include: { team: { select: { name: true, leadId: true, lead: { select: { name: true } } } } },
      });
      const lines: string[] = [];
      if (user.managerId) {
        const manager = await prisma.user.findUnique({ where: { id: user.managerId }, select: { name: true, role: true } });
        if (manager) lines.push(`Your manager: ${manager.name} (${ROLE_LABEL[manager.role]})`);
      }
      if (memberships.length > 0) {
        lines.push(
          `Your team(s): ${memberships.map((m) => `${m.team.name}${m.team.lead ? ` (lead ${m.team.lead.name})` : ""}`).join(", ")}`,
        );
      }
      const teamIds = await ledTeamIds(user.id);
      if (teamIds.length > 0) {
        const myTeams = await prisma.team.findMany({
          where: { id: { in: teamIds } },
          include: { members: { include: { user: { select: { name: true, role: true } } } } },
        });
        for (const t of myTeams) {
          lines.push(`You lead ${t.name} with ${t.members.length} member(s): ${t.members.map((m) => m.user.name).join(", ")}`);
        }
      }
      if (has("hr", "director", "who is")) {
        const directors = await prisma.user.findMany({ where: { role: "DIRECTOR", isActive: true }, select: { name: true } });
        const hrs = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { name: true } });
        lines.push(`Directors: ${directors.map((d) => d.name).join(", ") || "—"}. HR Admins: ${hrs.map((h) => h.name).join(", ") || "—"}.`);
      }
      if (lines.length === 0) {
        return ok<Intent>({ reply: "You're not part of any team yet and have no manager assigned. HR can set both up." });
      }
      return ok<Intent>({ reply: lines.join("\n") });
    }

    // ---- Expenses (access-gated) ------------------------------------------
    if (has("expense", "spend", "spent", "billing", "cost", "money", "budget")) {
      const isManager = user.role === "DIRECTOR" || user.role === "ADMIN";
      if (!isManager && !user.expenseAccess) {
        return ok<Intent>({ reply: "You don't have access to Expenses. Directors or HR can grant it from the Users page." });
      }
      const now = new Date();
      const monthStart = fromKey(toKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))));
      const expenses = await prisma.expense.findMany({
        where: { date: { gte: monthStart } },
        select: { amount: true, category: true, title: true },
        orderBy: { amount: "desc" },
      });
      const total = expenses.reduce((s, e) => s + e.amount, 0);
      const top = expenses.slice(0, 3).map((e) => `${e.title} — ₹${e.amount.toLocaleString("en-IN")}`);
      return ok<Intent>({
        reply: `This month's spend: ₹${total.toLocaleString("en-IN")} across ${expenses.length} expense(s).` +
          (top.length ? `\nLargest:\n${bullet(top)}` : ""),
      });
    }

    // ---- Profile ------------------------------------------------------------
    if (has("who am i", "my profile", "my account", "my role", "my email")) {
      return ok<Intent>({
        reply: `You are ${user.name} (${user.email}), ${ROLE_LABEL[user.role]}${user.department ? ` in ${user.department}` : ""}.`,
      });
    }

    // ---- Fallback -----------------------------------------------------------
    return ok<Intent>({
      reply: `I can answer questions about your account, for example:\n${bullet(suggestions)}\n\nTry asking one of those!`,
    });
  });
}

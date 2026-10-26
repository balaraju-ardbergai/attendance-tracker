// Seeds demo data: 1 Director, 1 HR Admin, 4 employees, current-month attendance,
// two leave/WFH requests, and the Claude certification courses mirroring the
// Claude_Certification_Tracker spreadsheet.
// Run with: npm run db:seed   (requires a reachable DATABASE_URL)

import { PrismaClient, AttendanceStatus, CourseAttendanceStatus, RequestStatus, RequestType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => new Date(`${k}T00:00:00.000Z`);
const toKey = (d: Date) => d.toISOString().slice(0, 10);

const PEOPLE: {
  email: string;
  name: string;
  role: Role;
  department: string;
  password: string;
}[] = [
  { email: "director@org.com", name: "Amelia Stone", role: "DIRECTOR", department: "Leadership", password: "Director@123" },
  { email: "hr@org.com", name: "Priya Sharma", role: "ADMIN", department: "Human Resources", password: "Hr@12345" },
  { email: "employee@org.com", name: "Rahul Verma", role: "EMPLOYEE", department: "Engineering", password: "Emp@12345" },
  { email: "sara@org.com", name: "Sara Khan", role: "EMPLOYEE", department: "Marketing", password: "Emp@12345" },
  { email: "david@org.com", name: "David Lee", role: "EMPLOYEE", department: "Engineering", password: "Emp@12345" },
  { email: "anita@org.com", name: "Anita Rao", role: "EMPLOYEE", department: "Human Resources", password: "Emp@12345" },
];

const SKILLJAR = "https://anthropic-partners.skilljar.com";

// Milestones for "Claude Certified Developer - Foundations" (order matters).
const DEVELOPER_MILESTONES: { name: string; phase: string; description?: string; durationMin?: number; link?: string }[] = [
  { name: "Claude 101", phase: "PREREQUISITE", description: "Everyday work with Claude: core features, projects, artifacts and settings.", link: `${SKILLJAR}/claude-101` },
  { name: "Claude Code 101", phase: "PREREQUISITE", description: "Use Claude Code effectively in your daily development work.", link: "https://anthropic.skilljar.com/claude-code-101" },
  { name: "Claude Platform 101", phase: "PREREQUISITE", description: "Build on the Claude Platform from the ground up.", link: `${SKILLJAR}/page/all-courses` },
  { name: "Claude Code in Action", phase: "PREREQUISITE", description: "Run long, hands-off Claude Code sessions: steer, configure and extend.", link: `${SKILLJAR}/claude-code-in-action` },
  { name: "AI Fluency: Framework & Foundations", phase: "PREREQUISITE", description: "Collaborate with AI effectively, efficiently, ethically and safely.", link: `${SKILLJAR}/ai-fluency-framework-foundations` },
  { name: "Building with the Claude API", phase: "PREREQUISITE", description: "Full spectrum of working with Anthropic models via the Claude API.", link: `${SKILLJAR}/claude-with-the-anthropic-api` },
  { name: "Introduction to Model Context Protocol", phase: "PREREQUISITE", description: "Build MCP servers and clients in Python: tools, resources and prompts.", link: `${SKILLJAR}/introduction-to-model-context-protocol` },
  { name: "Model Context Protocol: Advanced Topics", phase: "PREREQUISITE", description: "Sampling, notifications, file access, and transport mechanisms.", link: `${SKILLJAR}/model-context-protocol-advanced-topics` },
  { name: "AI Capabilities and Limitations", phase: "PREREQUISITE", description: "Introductory course on how AI works.", link: "https://anthropic.skilljar.com/ai-capabilities-and-limitations" },
  { name: "MSO Foundations", phase: "PREP COURSE", durationMin: 57, description: "Model fundamentals and technical foundations.", link: `${SKILLJAR}/path/claude-certified-developer-foundations/mso-foundations` },
  { name: "Production-Grade Prompting, Agents & Tool Use", phase: "PREP COURSE", durationMin: 209, description: "Reliable prompts, tools, context management, agent loops.", link: `${SKILLJAR}/path/claude-certified-developer-foundations/production-grade-prompting-agents-tool-use` },
  { name: "Claude Code, MCP & Integration", phase: "PREP COURSE", durationMin: 142, description: "Make an integration configurable, shareable, and safe.", link: `${SKILLJAR}/path/claude-certified-developer-foundations/claude-code-mcp-integration` },
  { name: "Production Engineering, Evals & Security", phase: "PREP COURSE", durationMin: 211, description: "Prove an agent holds up under real production traffic.", link: `${SKILLJAR}/path/claude-certified-developer-foundations/production-engineering-evals-security` },
  { name: "Accelerators & IP Contribution", phase: "PREP COURSE", durationMin: 155, description: "Package a build so it survives reuse, review, and deployment.", link: `${SKILLJAR}/path/claude-certified-developer-foundations/accelerators-ip-contribution` },
  { name: "Claude Certified Developer - Foundations (Exam)", phase: "EXAM", description: "Exam details and registration on the certification page.", link: `${SKILLJAR}/claude-certified-developer-foundations-certification` },
];

const ARCHITECT_MILESTONES: { name: string; phase: string; description?: string; link?: string }[] = [
  { name: "Claude 101", phase: "PREP COURSE", description: "Everyday work with Claude: core features, projects, artifacts and settings.", link: `${SKILLJAR}/claude-101` },
  { name: "AI Fluency: Framework & Foundations", phase: "PREP COURSE", description: "Collaborate with AI effectively, efficiently, ethically and safely.", link: `${SKILLJAR}/ai-fluency-framework-foundations` },
  { name: "Building with the Claude API", phase: "PREP COURSE", description: "Full spectrum of working with Anthropic models via the Claude API.", link: `${SKILLJAR}/claude-with-the-anthropic-api` },
  { name: "Introduction to Model Context Protocol", phase: "PREP COURSE", description: "Build MCP servers and clients in Python: tools, resources and prompts.", link: `${SKILLJAR}/introduction-to-model-context-protocol` },
  { name: "Claude Code in Action", phase: "PREP COURSE", description: "Run long, hands-off Claude Code sessions: steer, configure and extend.", link: `${SKILLJAR}/claude-code-in-action` },
  { name: "Claude on Google Cloud", phase: "PREP COURSE", description: "Working with Anthropic models on Google Cloud.", link: `${SKILLJAR}/claude-with-google-vertex` },
  { name: "Claude with Amazon Bedrock", phase: "PREP COURSE", description: "Anthropic's AWS accreditation training, open to all.", link: `${SKILLJAR}/claude-in-amazon-bedrock` },
  { name: "Claude Certified Architect - Foundations (Exam)", phase: "EXAM", description: "Exam details and registration on the certification page.", link: `${SKILLJAR}/claude-certified-architect-foundations-certification` },
];

/** Last N Wednesdays before (and excluding) today, plus the next upcoming Wednesday. */
function recentWednesdays(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  while (out.length < count) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 3) out.push(keyOf(d));
  }
  const next = new Date();
  next.setDate(next.getDate() + ((10 - next.getDay()) % 7 || 7));
  out.push(keyOf(next));
  return out;
}

async function main() {
  const now = new Date();
  const todayKey = keyOf(now);
  const year = now.getFullYear();
  const month = now.getMonth();

  const users: Record<string, string> = {};
  for (const person of PEOPLE) {
    const hash = await bcrypt.hash(person.password, 10);
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: { name: person.name, role: person.role, department: person.department, isActive: true },
      create: {
        email: person.email,
        name: person.name,
        role: person.role,
        department: person.department,
        passwordHash: hash,
        mustResetPassword: false,
      },
    });
    users[person.email] = user.id;
  }
  const ids = Object.values(users);

  // Org structure: everyone reports to the HR Admin, HR reports to the Director.
  await prisma.user.update({ where: { id: users["hr@org.com"] }, data: { managerId: users["director@org.com"], receivesExpenseReports: true } });
  await prisma.user.update({ where: { id: users["director@org.com"] }, data: { managerId: null, receivesExpenseReports: true } });
  for (const email of ["employee@org.com", "sara@org.com", "david@org.com", "anita@org.com"]) {
    await prisma.user.update({ where: { id: users[email] }, data: { managerId: users["hr@org.com"], expenseAccess: false, receivesExpenseReports: false } });
  }

  // Clean previous demo activity for idempotent re-seeding.
  await prisma.request.deleteMany({ where: { userId: { in: ids } } });
  await prisma.attendance.deleteMany({ where: { userId: { in: ids } } });
  await prisma.approval.deleteMany({});
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.connection.deleteMany({ where: { userId: { in: ids } } });
  await prisma.course.deleteMany({
    where: { name: { in: ["Claude Certified Developer - Foundations", "Claude Certified Architect - Foundations"] } },
  });
  await prisma.expense.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.task.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.team.deleteMany({ where: { createdById: { in: ids } } });

  // Per-user plan for believable month data.
  const leaveStart = toKey(new Date(Date.UTC(year, month, 2)));
  const leaveEnd = toKey(new Date(Date.UTC(year, month, 4)));
  const fridays: string[] = [];
  for (let day = 1; day <= 31; day++) {
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCMonth() !== month) break;
    if (d.getUTCDay() === 5) fridays.push(toKey(d));
  }

  for (const person of PEOPLE) {
    const userId = users[person.email];
    const records: {
      userId: string;
      date: Date;
      status: AttendanceStatus;
      clockInAt?: Date;
      clockOutAt?: Date;
    }[] = [];

    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= lastDayOfMonth; day++) {
      const date = new Date(Date.UTC(year, month, day));
      const key = toKey(date);
      if (key > todayKey) break;
      const dow = date.getUTCDay();
      if (dow === 0 || dow === 6) continue;

      let status: AttendanceStatus;
      if (person.email === "sara@org.com" && key >= leaveStart && key <= leaveEnd) {
        status = "LEAVE";
      } else if (person.email === "david@org.com" && fridays.includes(key)) {
        status = "WFH";
      } else if (key === todayKey && Math.random() < 0.4) {
        continue; // some people haven't marked today yet
      } else {
        status = "PRESENT";
      }

      const inAt = new Date(`${key}T09:0${Math.floor(Math.random() * 9)}:00.000Z`);
      const outAt = key === todayKey ? undefined : new Date(`${key}T17:${pad(30 + Math.floor(Math.random() * 20))}:00.000Z`);
      records.push({
        userId,
        date,
        status,
        clockInAt: inAt,
        ...(outAt ? { clockOutAt: outAt } : {}),
      });
    }
    await prisma.attendance.createMany({ data: records });
  }

  const hrId = users["hr@org.com"];

  // A couple of requests for the requests-handling screens.
  await prisma.request.create({
    data: {
      userId: users["employee@org.com"],
      type: RequestType.LEAVE,
      startDate: fromKey(toKey(new Date(now.getTime() + 7 * 86400_000))),
      endDate: fromKey(toKey(new Date(now.getTime() + 9 * 86400_000))),
      reason: "Family function out of town.",
      status: RequestStatus.PENDING,
    },
  });
  await prisma.request.create({
    data: {
      userId: users["anita@org.com"],
      type: RequestType.WFH,
      startDate: fromKey(toKey(new Date(now.getTime() + 2 * 86400_000))),
      endDate: fromKey(toKey(new Date(now.getTime() + 2 * 86400_000))),
      reason: "Internet installation at home.",
      status: RequestStatus.PENDING,
    },
  });
  await prisma.request.create({
    data: {
      userId: users["sara@org.com"],
      type: RequestType.LEAVE,
      startDate: fromKey(leaveStart),
      endDate: fromKey(leaveEnd),
      reason: "Approved personal leave.",
      status: RequestStatus.APPROVED,
      reviewedById: hrId,
      reviewedAt: now,
    },
  });

  /* ------------------------------- Courses ------------------------------- */

  async function createCourse(config: {
    name: string;
    description: string;
    attendanceEnabled: boolean;
    scheduleNote: string | null;
    milestones: { name: string; phase: string; description?: string; durationMin?: number; link?: string }[];
    progressByUser: Record<string, Record<number, number>>; // email -> {milestoneOrder: percent}
  }) {
    const course = await prisma.course.create({
      data: {
        name: config.name,
        description: config.description,
        startedOn: fromKey("2026-10-01"),
        attendanceEnabled: config.attendanceEnabled,
        scheduleNote: config.scheduleNote,
        createdById: hrId,
      },
    });

    const milestones = await prisma.$transaction(
      config.milestones.map((m, i) =>
        prisma.milestone.create({
          data: {
            courseId: course.id,
            order: i + 1,
            name: m.name,
            phase: m.phase,
            description: m.description ?? null,
            link: m.link ?? null,
            durationMin: m.durationMin ?? null,
          },
        }),
      ),
    );

    for (const [email, progressMap] of Object.entries(config.progressByUser)) {
      const userId = users[email];
      await prisma.courseEnrollment.create({ data: { courseId: course.id, userId } });
      const rows = Object.entries(progressMap).map(([order, percent]) => ({
        milestoneId: milestones[Number(order) - 1].id,
        userId,
        percent,
      }));
      if (rows.length) await prisma.milestoneProgress.createMany({ data: rows });
    }

    return { course, milestones };
  }

  // Developer track — attendance enabled with weekly Wednesday classes.
  const developer = await createCourse({
    name: "Claude Certified Developer - Foundations",
    description: "Prerequisites, the 5-course prep path and the certification exam. Track progress per person, exactly like the shared tracker sheet.",
    attendanceEnabled: true,
    scheduleNote: "Wed 16:00–17:00 IST",
    milestones: DEVELOPER_MILESTONES,
    progressByUser: {
      "employee@org.com": { 1: 100, 2: 100, 5: 60 },
      "sara@org.com": { 1: 100, 2: 60, 4: 100, 5: 20, 7: 100, 8: 100, 9: 100, 10: 100 },
      "david@org.com": { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 7: 100 },
      "anita@org.com": { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100, 7: 100, 8: 100 },
      "hr@org.com": { 1: 100, 2: 100, 3: 100, 4: 100, 5: 70, 7: 30 },
    },
  });

  await createCourse({
    name: "Claude Certified Architect - Foundations",
    description: "Seven prep courses (cloud platforms optional) leading to the Architect Foundations exam.",
    attendanceEnabled: false,
    scheduleNote: null,
    milestones: ARCHITECT_MILESTONES,
    progressByUser: {
      "director@org.com": { 1: 100 },
      "sara@org.com": { 1: 10 },
      "david@org.com": { 1: 20 },
    },
  });

  // Class sessions + attendance for the developer track.
  const wednesdays = recentWednesdays(3);
  for (let i = 0; i < wednesdays.length; i++) {
    const isPast = wednesdays[i] <= todayKey;
    const session = await prisma.courseSession.create({
      data: {
        courseId: developer.course.id,
        date: fromKey(wednesdays[i]),
        topic: isPast ? `Week ${i + 1} review` : "Prep course Q&A",
      },
    });
    if (isPast) {
      const attendees = Object.entries(users).filter(([email]) => email !== "director@org.com");
      await prisma.courseAttendance.createMany({
        data: attendees.map(([email, userId], idx) => ({
          sessionId: session.id,
          userId,
          status: (email === "david@org.com" && idx === 2 ? "ABSENT" : "PRESENT") as CourseAttendanceStatus,
          markedById: hrId,
        })),
      });
    }
  }

  /* --------------------------- Teams & Expenses --------------------------- */

  const engineering = await prisma.team.create({
    data: {
      name: "Engineering",
      description: "Product development and platform work.",
      leadId: users["david@org.com"],
      createdById: hrId,
    },
  });
  const marketing = await prisma.team.create({
    data: {
      name: "Marketing",
      description: "Brand, content and campaigns.",
      leadId: users["sara@org.com"],
      createdById: hrId,
    },
  });
  await prisma.teamMember.createMany({
    data: [
      { teamId: engineering.id, userId: users["david@org.com"] },
      { teamId: engineering.id, userId: users["employee@org.com"] },
      { teamId: marketing.id, userId: users["sara@org.com"] },
    ],
  });

  const monthAgo = (n: number) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - n);
    d.setDate(Math.min(5 + Math.floor(Math.random() * 20), 28));
    return fromKey(keyOf(d));
  };

  await prisma.expense.createMany({
    data: [
      { title: "AWS infrastructure bill", category: "VENDOR_BILLING", party: "Amazon Web Services", amount: 42850, date: monthAgo(2), teamId: engineering.id, paymentMethod: "Bank transfer", createdById: hrId },
      { title: "Figma organization plan", category: "VENDOR_BILLING", party: "Figma", amount: 9600, date: monthAgo(1), teamId: engineering.id, paymentMethod: "Card", createdById: hrId },
      { title: "Office internet — October", category: "VENDOR_BILLING", party: "ACT Fibernet", amount: 5999, date: fromKey(todayKey), paymentMethod: "UPI", createdById: hrId },
      { title: "Client workshop catering", category: "CLIENT_BILLING", party: "Meridian Foods", amount: 12400, date: monthAgo(1), teamId: marketing.id, paymentMethod: "Card", createdById: hrId },
      { title: "Client-site travel reimbursement", category: "CLIENT_BILLING", party: "Rahul Verma", amount: 6750, date: monthAgo(0), teamId: engineering.id, paymentMethod: "UPI", createdById: hrId },
      { title: "4× monitors for new workstations", category: "OFFICE_PURCHASE", party: "Amazon Business", amount: 54800, date: monthAgo(2), teamId: engineering.id, paymentMethod: "Card", createdById: hrId },
      { title: "Keyboards & mice refresh", category: "OFFICE_PURCHASE", party: "Logitech", amount: 14300, date: monthAgo(1), teamId: engineering.id, paymentMethod: "Card", createdById: hrId },
      { title: "Pantry & coffee supplies", category: "OFFICE_PURCHASE", party: "Metro Cash & Carry", amount: 7200, date: fromKey(todayKey), paymentMethod: "UPI", createdById: hrId },
      { title: "Hackathon — 1st prize", category: "EVENT_PRIZE", party: "Team Neural Ninjas", amount: 25000, date: monthAgo(1), paymentMethod: "Bank transfer", createdById: hrId },
      { title: "Hackathon — 2nd prize", category: "EVENT_PRIZE", party: "Team Prompt Engineers", amount: 15000, date: monthAgo(1), paymentMethod: "Bank transfer", createdById: hrId },
      { title: "Hackathon — 3rd prize", category: "EVENT_PRIZE", party: "Team Cache Money", amount: 10000, date: monthAgo(1), paymentMethod: "Bank transfer", createdById: hrId },
      { title: "Hackathon jerseys & swag", category: "EVENT_PRIZE", party: "Printo", amount: 8450, date: monthAgo(1), paymentMethod: "UPI", createdById: hrId },
      { title: "Team lunch — quarterly offsite", category: "OTHER", party: "Barbeque Nation", amount: 18600, date: monthAgo(0), paymentMethod: "Card", createdById: hrId },
      { title: "Housekeeping services", category: "OTHER", party: "CleanScape", amount: 5400, date: monthAgo(2), paymentMethod: "UPI", createdById: hrId },
    ],
  });

  await prisma.task.createMany({
    data: [
      { title: "Migrate staging to the new Postgres cluster", status: "IN_PROGRESS", priority: "HIGH", progress: 60, assigneeId: users["employee@org.com"], teamId: engineering.id, dueDate: fromKey(toKey(new Date(now.getTime() + 5 * 86400_000))), createdById: hrId },
      { title: "Ship attendance export to CSV", status: "TODO", priority: "MEDIUM", progress: 0, assigneeId: users["david@org.com"], teamId: engineering.id, dueDate: fromKey(toKey(new Date(now.getTime() + 10 * 86400_000))), createdById: hrId },
      { title: "Quarterly expense reconciliation", status: "IN_PROGRESS", priority: "HIGH", progress: 40, assigneeId: users["anita@org.com"], dueDate: fromKey(toKey(new Date(now.getTime() + 7 * 86400_000))), createdById: hrId },
      { title: "Draft the hackathon retrospective post", status: "COMPLETED", priority: "LOW", progress: 100, assigneeId: users["sara@org.com"], teamId: marketing.id, createdById: hrId },
      { title: "Plan November content calendar", status: "TODO", priority: "MEDIUM", progress: 0, assigneeId: users["sara@org.com"], teamId: marketing.id, dueDate: fromKey(toKey(new Date(now.getTime() + 4 * 86400_000))), createdById: hrId },
      { title: "Onboard the next certification batch", status: "IN_PROGRESS", priority: "MEDIUM", progress: 30, assigneeId: users["anita@org.com"], createdById: hrId },
      { title: "Review pending HR approvals", status: "COMPLETED", priority: "HIGH", progress: 100, assigneeId: users["hr@org.com"], createdById: users["director@org.com"] },
      { title: "Set up the devices lab inventory sheet", status: "TODO", priority: "LOW", progress: 0, assigneeId: users["david@org.com"], teamId: engineering.id, createdById: hrId },
    ],
  });

  /* ------------------------- Projects (Jira-style) ------------------------- */

  const makeDate = (offsetDays: number) => fromKey(toKey(new Date(now.getTime() + offsetDays * 86400_000)));

  const prd = await prisma.project.create({
    data: {
      key: "PRD",
      name: "Product Engineering",
      description: "Agile development of the OrgPulse product — sprints, epics and stories.",
      methodology: "SCRUM",
      teamId: engineering.id,
      leadId: users["david@org.com"],
      createdById: hrId,
    },
  });
  const sprint1 = await prisma.sprint.create({
    data: { projectId: prd.id, name: "Sprint 1", goal: "Core attendance flows live", startDate: makeDate(-21), endDate: makeDate(-7), status: "COMPLETED" },
  });
  const sprint2 = await prisma.sprint.create({
    data: { projectId: prd.id, name: "Sprint 2", goal: "Reporting and CSV export", startDate: makeDate(-3), endDate: makeDate(11), status: "ACTIVE" },
  });
  const prdEpic = await prisma.task.create({
    data: { projectId: prd.id, key: "PRD-1", seq: 1, type: "EPIC", title: "Attendance export & reporting", description: "Managers can export and analyse team attendance.", status: "IN_PROGRESS", progress: 55, createdById: hrId },
  });
  const prdIssues: { key: string; seq: number; title: string; type: string; status: string; progress: number; points: number; sprintId?: string; epicId?: string; assignee: string; ac?: string; priority?: string }[] = [
    { key: "PRD-2", seq: 2, title: "CSV export of monthly attendance", type: "STORY", status: "COMPLETED", progress: 100, points: 5, sprintId: sprint1.id, epicId: prdEpic.id, assignee: "david@org.com" },
    { key: "PRD-3", seq: 3, title: "Login page shows org branding", type: "TASK", status: "COMPLETED", progress: 100, points: 2, sprintId: sprint1.id, assignee: "employee@org.com" },
    { key: "PRD-4", seq: 4, title: "Fix duplicate attendance on double click", type: "BUG", status: "COMPLETED", progress: 100, points: 1, sprintId: sprint1.id, priority: "HIGH", assignee: "employee@org.com" },
    { key: "PRD-5", seq: 5, title: "XLSX export with formatting", type: "STORY", status: "IN_PROGRESS", progress: 60, points: 8, sprintId: sprint2.id, epicId: prdEpic.id, assignee: "david@org.com", ac: "Given a month with attendance, when HR exports, then the XLSX has per-employee sheets and stat bars." },
    { key: "PRD-6", seq: 6, title: "Chart for leave trends", type: "STORY", status: "IN_PROGRESS", progress: 30, points: 5, sprintId: sprint2.id, epicId: prdEpic.id, assignee: "employee@org.com" },
    { key: "PRD-7", seq: 7, title: "Rate-limit export endpoint", type: "TASK", status: "TODO", progress: 0, points: 3, sprintId: sprint2.id, assignee: "sara@org.com" },
    { key: "PRD-8", seq: 8, title: "Email report PDF attachment", type: "STORY", status: "TODO", progress: 0, points: 8, epicId: prdEpic.id, assignee: "david@org.com", priority: "HIGH" },
  ];
  await prisma.task.createMany({
    data: prdIssues.map((i) => ({
      projectId: prd.id, key: i.key, seq: i.seq, type: i.type as never, title: i.title,
      status: i.status as never, progress: i.progress, storyPoints: i.points,
      sprintId: i.sprintId ?? null, epicId: i.epicId ?? null,
      assigneeId: users[i.assignee], teamId: engineering.id,
      acceptanceCriteria: i.ac ?? null, priority: (i.priority ?? "MEDIUM") as never,
      createdById: hrId,
    })),
  });

  const ops = await prisma.project.create({
    data: {
      key: "OPS",
      name: "Office Setup 2.0",
      description: "Waterfall project: new office layout and equipment rollout.",
      methodology: "WATERFALL",
      leadId: hrId,
      createdById: hrId,
    },
  });
  const phase1 = await prisma.phase.create({ data: { projectId: ops.id, name: "Requirements & Budget", order: 1, startDate: makeDate(-14), endDate: makeDate(-7) } });
  const phase2 = await prisma.phase.create({ data: { projectId: ops.id, name: "Procurement & Build", order: 2, startDate: makeDate(-6), endDate: makeDate(7) } });
  await prisma.phase.create({ data: { projectId: ops.id, name: "Rollout & Training", order: 3, startDate: makeDate(8), endDate: makeDate(21) } });
  await prisma.task.createMany({
    data: [
      { projectId: ops.id, key: "OPS-1", seq: 1, type: "TASK", title: "Collect workstation requirements from teams", status: "COMPLETED", progress: 100, assigneeId: users["anita@org.com"], phaseId: phase1.id, createdById: hrId },
      { projectId: ops.id, key: "OPS-2", seq: 2, type: "TASK", title: "Vendor quotes for monitors & chairs", status: "IN_PROGRESS", progress: 50, assigneeId: users["hr@org.com"], phaseId: phase2.id, createdById: hrId },
      { projectId: ops.id, key: "OPS-3", seq: 3, type: "TASK", title: "Schedule desk reassembly weekend", status: "TODO", progress: 0, assigneeId: users["david@org.com"], phaseId: phase2.id, createdById: hrId },
    ],
  });

  console.log("\nSeed complete. Demo accounts:");
  for (const p of PEOPLE) {
    console.log(`  ${p.role.padEnd(9)} ${p.email.padEnd(20)} password: ${p.password}`);
  }
  console.log("  Courses seeded: Claude Certified Developer - Foundations (with classes), Claude Certified Architect - Foundations");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

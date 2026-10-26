// Seeds demo data: 1 Director, 1 HR Admin, 4 employees, plus current-month
// attendance and a couple of leave/WFH requests so the dashboard is alive.
// Run with: npm run db:seed   (requires a reachable DATABASE_URL)

import { PrismaClient, AttendanceStatus, RequestStatus, RequestType, Role } from "@prisma/client";
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

  // Clean previous demo activity for idempotent re-seeding.
  await prisma.request.deleteMany({ where: { userId: { in: ids } } });
  await prisma.attendance.deleteMany({ where: { userId: { in: ids } } });
  await prisma.approval.deleteMany({});
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.connection.deleteMany({ where: { userId: { in: ids } } });

  // Per-user plan for believable month data.
  const leaveStart = toKey(new Date(Date.UTC(year, month, 2))); // 2nd of month
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
        status = Math.random() < 0.08 ? "LATE" : "PRESENT";
      }

      const inAt = new Date(`${key}T${status === "LATE" ? "09:47" : "09:0" + Math.floor(Math.random() * 9)}:00.000Z`);
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

  console.log("\nSeed complete. Demo accounts:");
  for (const p of PEOPLE) {
    console.log(`  ${p.role.padEnd(9)} ${p.email.padEnd(20)} password: ${p.password}`);
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

# Org Tracker

A complete internal organization platform — attendance, leave/WFH, courses & certifications, expenses with scheduled email analytics, teams & org hierarchy, JIRA-style project tracking (Scrum + Waterfall), and a built-in assistant — built with **Next.js 15 (App Router) + shadcn/ui + PostgreSQL (Prisma)**, ready to deploy on **Vercel**.

> Formerly "Attendance Portal" → "OrgPulse" → **Org Tracker** as the scope grew. The folder is still `attendance-portal`.

For coding agents: read **[AGENTS.md](AGENTS.md)** first — it documents architecture, conventions, environment gotchas and hard-won lessons in depth.

---

## Modules

| Module | Route | What it does |
| --- | --- | --- |
| **Attendance** | `/attendance` | Daily mark with time + optional geolocation, clock-out, month calendar, monthly stats. Statuses: `PRESENT / LEAVE / WFH / ABSENT` (no LATE by design) |
| **Requests** | `/requests` | Leave / WFH with date ranges, overlap checks, reasons. Reviewed by HR Admins, Directors **and the requester's team lead / manager**. Approval writes LEAVE/WFH onto the employee's calendar and emails the outcome |
| **Projects** | `/projects` | JIRA-style tracker. **Scrum**: projects with keys (`PRD-12`), epics, sprints (planned → active → completed, goal + dates), backlog & kanban board with **drag-and-drop** between status columns, story points, acceptance criteria, types (Epic/Story/Task/Bug). **Waterfall**: sequential phases with ordering. Assignees update their own work; leads/HR manage everything |
| **Courses** | `/courses` | Certification tracker (modelled on a spreadsheet): ordered milestones grouped by phase (PREREQUISITE / PREP COURSE / EXAM) with links & durations, per-person % progress (10–90 partial or Completed), org-level averages, optional class sessions with attendance (Present/Absent/Excused) |
| **Teams** | `/teams` | Teams with leads and members. Leads get a **Member details** view (attendance this month, pending requests, open tasks, course progress) and can manage their own team. Per-team task and expense stats |
| **Org Graph** | `/org-graph` | Company reporting tree driven by `User.managerId` (set from the Users page) |
| **Expenses** | `/expenses` | Vendor/client billings, office purchases, event prize money. Categories, party, payment method, team attribution, filters. Access: Directors/HR or granted users |
| **Expense analytics** | `/expenses` | Summary cards (week/month), 6-month trend, category donut, per-team bars — plus **clickable drill-downs** |
| **Email reports** | `/api/reports/expense/[period]` | Weekly (Mon 09:00) and monthly (1st 09:00) reports via **Vercel Cron** through Gmail SMTP. Recipients configured by Directors. Manual "send now" buttons |
| **Dashboard** | `/dashboard` | Org-wide: every summary card is clickable and opens the matching people list; every employee card opens a drill-down (today, month stats, open tasks, courses, pending requests) |
| **Assistant** | floating widget (bottom-right) | Rule-based, account-aware Q&A over the signed-in user's own data — certification progress, attendance, tasks, requests, team, expenses |
| **Connectors** | `/connectors` | Per-user OAuth for Outlook (Microsoft Graph) and Gmail |
| **Administration** | `/users`, `/approvals`, `/audit` | User lifecycle with Director approvals, HR-role assignment, manager assignment, expense-access grants, Director-only audit trail |

## Security model

- Sessions: JWT in an httpOnly cookie (7 days). **Authorization is never trusted from the token** — every API call re-reads the user from the database, so role changes, deactivations and forced password resets take effect immediately.
- Login brute-force guard: 5 failed attempts per email → 15-minute lockout.
- Forgot password: 6-digit OTP, 5-minute expiry, single use, hashed at rest, generic response (no account enumeration), 60-second resend throttle.
- First-login: accounts created by HR start with a temporary password; **every API returns 403 until the user completes the forced password change**.
- Passwords: bcrypt (cost 10). Secrets: `AUTH_SECRET` JWT signing key.
- Project visibility: HR/Directors see all; others see projects they lead, projects of their teams, org-wide (team-less) projects, and projects they're assigned in. Issue listings follow the same rules.

## Quick start (local)

**Prerequisites:** Node 18.18+, PostgreSQL, npm.

1. Edit `.env` and set your Postgres password:

   ```
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/attendance?schema=public"
   ```

   > **Use a dedicated database.** `prisma db push` syncs the *entire* database it points at — never point it at a database shared with other applications. The app's database is named `attendance`.

2. Create schema + demo data and run:

   ```bash
   npm install
   npm run db:push
   npm run db:seed
   npm run dev
   ```

3. Open http://localhost:3000. Without `GMAIL_USER`/`GMAIL_APP_PASSWORD`, emails print to the dev-server console (and the OTP is returned in the API response in dev mode).

### Demo accounts (from the seed)

| Role | Email | Password |
| --- | --- | --- |
| Director | `director@org.com` | `Director@123` |
| HR Admin | `hr@org.com` | `Hr@12345` |
| Employees | `employee@org.com`, `sara@org.com`, `david@org.com`, `anita@org.com` | `Emp@12345` |

Seeded content: a month of attendance, pending/approved requests, the two Claude certification tracks (with real course links), Engineering & Marketing teams, sample expenses, and two projects — `PRD` (Scrum, epics + sprints + stories) and `OPS` (Waterfall, phases).

## Deploying to Vercel

1. Create a hosted Postgres (Vercel Postgres / Neon / Supabase — all pgAdmin-compatible). Push the schema once from a machine with credentials: `DATABASE_URL="<prod-url>" npx prisma db push`.
2. Import the repo into Vercel and set environment variables:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | dedicated production Postgres connection string |
   | `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` (used in email links) |
   | `GMAIL_USER` | the Gmail account that sends emails |
   | `GMAIL_APP_PASSWORD` | Google **App Password** (2-Step Verification → App passwords); spaces stripped automatically |
   | `CRON_SECRET` | random string — protects the scheduled report endpoints |
   | `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT_ID` | optional, Outlook connector |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional, Gmail connector |
   | `DEV_EXPOSE_OTP` | **leave unset in production** |

   `prisma generate` runs automatically on install (`postinstall`). The crons in `vercel.json` deploy with the project.

3. OAuth connectors need redirect URIs registered: `https://YOUR-APP/api/connections/outlook/callback` and `.../gmail/callback` (plus localhost variants for dev).

## Email flows

All email goes through **Gmail SMTP** (`smtp.gmail.com:465`, nodemailer) when `GMAIL_USER` + `GMAIL_APP_PASSWORD` are set; otherwise every email is logged to the server console. Sent: invitations (temporary password), OTP, password-changed confirmation, request outcomes, approval-needed (to Directors), approval outcomes, weekly/monthly expense reports.

## Design decisions & production notes

- **Dates** are pinned to the server's calendar day (UTC on Vercel). Working days are Mon–Fri; today counts as absent in stats only once marked or passed.
- **Geolocation** requires `localhost` or HTTPS; denial still records attendance without coordinates.
- **Removals** deactivate accounts (history preserved); Directors cannot be removed from the portal.
- **Course progress** semantics: a milestone counts as a completed step at 100%; partial percentages contribute fractionally; "Currently at" is the first milestone below 100% in order.
- **Authorization is DB-backed on every request** (see Security model) — the cost is one user query per API call, deliberately chosen over stale-JWT role checks.
- **Assistant** is rule-based and strictly scoped to the signed-in user's data; an LLM provider can be layered onto `/api/assistant` later without changing the client.
- **Login rate limiting** is in-memory per server instance — sufficient against casual stuffing; add a shared store (e.g. Upstash Redis) if you need cross-instance limits.
- **pgAdmin** can point at the same `DATABASE_URL` to browse data.

## Project structure

```
prisma/schema.prisma   # User, Attendance, Request, Approval, Otp, Connection, AuditLog,
                       # Course/Milestone/MilestoneProgress/CourseEnrollment/CourseSession/CourseAttendance,
                       # Team/TeamMember, Expense, Project/Sprint/Phase, Task (Jira-style issues)
prisma/seed.ts         # demo org: users, attendance, courses, teams, expenses, PRD/OPS projects
src/middleware.ts      # page-route protection, forced first-login reset, auth-page redirects
src/lib/               # api (guards/handlers), auth (JWT/bcrypt/OTP), permissions (hierarchy),
                       # mail (Gmail SMTP), audit, dates/stats, client helpers, roles labels
src/app/api/           # auth, me, directory, attendance, requests, users, approvals, dashboard,
                       # audit, connections, courses, expenses (+analytics), reports, teams (+overview),
                       # org, projects, sprints, phases, issues, employees/[id]/overview, assistant
src/app/(auth)/        # login, forgot-password, reset-password, change-password
src/app/(app)/         # attendance, requests, projects, courses, teams, org-graph, expenses,
                       # dashboard, users, approvals, audit, connectors
src/components/        # page-header, app shell, chat widget, month grid, stat bar, charts, request dialog, ui/ (shadcn)
vercel.json            # weekly + monthly report crons
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server (http://localhost:3000) |
| `npm run build` / `npm start` | production build / serve |
| `npm run lint` | ESLint |
| `npm run db:push` | push the Prisma schema to the database |
| `npm run db:seed` | (re)seed demo data (idempotent) |
| `npm run db:generate` | regenerate the Prisma client |

## Entity relationships & dynamic navigation

Org Tracker is relational rather than a collection of isolated pages. `User.managerId` builds the draggable Org Graph; `TeamMember` joins people to `Team`; teams connect to projects, issues and expenses; courses connect through enrollment, milestones and progress; Scrum and Waterfall both use the same issue (`Task`) model through `Sprint` and `Phase`.

Key dynamic flows:
- Drag a person onto another person in **Org Graph** to change their manager (cycle-safe); drop onto the top-level tray to remove their manager.
- Team stats, members, tasks, courses and expenses are clickable and deep-link to filtered details.
- Project issue links use `/projects/[projectId]?issue=[issueId]`; team expense links use `/expenses?teamId=[teamId]`; project lists accept `/projects?teamId=[teamId]`.
- Epics filter the backlog, sprint pills open issues, and board cards drag between statuses.

The full ER map and action paths are documented in **AGENTS.md**.

## My Profile / employee self-service

`/profile` is the signed-in employee hub, inspired by the publicly described employee self-service principles in Workday — personalized attention items, quick actions, profile maintenance, time/absence, learning and permission-aware account information. It is an Org Tracker design, not a reproduction of Workday branding or proprietary tenant UI.

Tabs:

- **Overview** — needs-attention items, quick actions, today's attendance, monthly attendance, manager/teams, recent requests, open Jira work and course progress.
- **Personal information** — employee-owned preferred name, phone, pronouns, location, timezone, bio and emergency contact. Legal name, work email, department, role, manager and access flags are read-only and managed by HR.
- **Career & learning** — employee-confirmed skills (1–5 proficiency + evidence), all enrolled courses including zero-progress courses, current milestones, completion and upcoming class sessions, plus leadership responsibilities.
- **Account & connections** — role/access summary, Gmail/Outlook connection status, account creation date and password-change action.

Security and privacy:

- `GET/PATCH /api/profile` derives identity exclusively from the active session and uses the DB-backed authorization guard.
- The PATCH allowlist rejects attempts to change HR-owned fields (role, email, department, manager, active state, expense/report permissions).
- Skills use normalized `Skill` + `UserSkill` tables and can only be edited by their owner through `/api/profile/skills`.
- `/api/employees/[id]/overview` supports self access; viewing another person still requires HR/Director, direct-manager or team-lead authorization.
- Team APIs omit all expense totals/records for people without expense access.
- Employee course detail returns only that employee's participant/progress row and own session attendance; HR/Directors retain the complete tracker.
- OAuth callbacks re-check that the state-bound user still exists, is active and has completed first-login password reset.

Workday public references used for feature research:

- [Employee Experience](https://www.workday.com/en-us/products/human-resource-management/employee-experience.html)
- [Workday Mobile](https://www.workday.com/en-us/products/platform-product-extensions/workday-mobile.html)
- [Time Tracking](https://www.workday.com/en-us/products/workforce-management/time.html)
- [Absence](https://www.workday.com/en-us/products/workforce-management/absence.html)
- [Skills Cloud](https://www.workday.com/en-us/products/human-resource-management/skills-cloud.html)
- [Talent Optimization](https://www.workday.com/en-us/products/talent-management/talent-optimization.html)
- [Learning](https://www.workday.com/en-us/products/talent-management/learning.html)
- [Organizational Management](https://www.workday.com/en-us/products/human-resource-management/organizational-management.html)

Pay, tax, compensation and benefits were deliberately not faked. Those features require an authoritative payroll/benefits provider and a separate compliance design.

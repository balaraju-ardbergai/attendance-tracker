# AGENTS.md — Org Tracker (formerly "Attendance Portal")

Guide for coding agents and humans working in this repository. Read this before making changes.

## What this app is

**Org Tracker** is an internal organization-management web app for a small company. It covers:

| Module | Route | Notes |
| --- | --- | --- |
| Attendance | `/attendance` | daily mark + geolocation, clock-out, month calendar, stats. Statuses: `PRESENT / LEAVE / WFH / ABSENT` (the user explicitly removed `LATE` — do not reintroduce) |
| Leave / WFH requests | `/requests` | employees submit; HR Admins, Directors **and team leads of the requester** review |
| Courses | `/courses` | certification tracker (from a spreadsheet): milestones with phases, per-person % progress, org averages, optional class sessions + attendance |
| Teams & Org Graph | `/teams`, `/org-graph` | teams with leads; reporting tree via `User.managerId`. Team leads see a "Member details" tab for their own team |
| Expenses | `/expenses` | restricted: Directors/HR or `User.expenseAccess`. Recharts dashboards; scheduled email reports |
| Expense email reports | `/api/reports/expense/[period]` | Vercel Cron (see `vercel.json`); recipients = `User.receivesExpenseReports`, configured by Directors; `CRON_SECRET` protects the cron endpoints |
| Projects (JIRA-style tracker) | `/projects` | agile (SCRUM: epics, sprints, story points, Jira keys like `PRD-12`, backlog/board) and waterfall (phases). Issues = extended `Task` model. Board supports drag-and-drop between status columns (native HTML5 DnD, optimistic update, permission-checked); the issue dialog stays open on inline status/progress edits |
| Assistant | floating chat widget (bottom-right) | rule-based, account-aware Q&A over the signed-in user's own data (`/api/assistant`) |
| Connectors | `/connectors` | Outlook/Gmail OAuth, per-user |
| Admin | `/users`, `/approvals`, `/dashboard`, `/audit` | user lifecycle goes through Director approvals; audit log is Director-only |

Roles: `DIRECTOR`, `ADMIN` (HR), `EMPLOYEE`. Team leads are regular employees/HR who lead a `Team` (or a `Project`); hierarchy permissions flow from `Team.leadId`, `Project.leadId` and `User.managerId`.

## Stack

- **Next.js 15** (App Router, `src/` dir, Turbopack), **React 19**, **TypeScript**, **Tailwind v4**
- **shadcn/ui** components in `src/components/ui` (installed via the v5 CLI: `npx shadcn@latest add <component>`; init used `-b radix -p vega`)
- **Prisma 6 + PostgreSQL** (schema in `prisma/schema.prisma`)
- Auth: custom JWT sessions (`jose`) in an httpOnly cookie `ap_session`; passwords `bcryptjs`; middleware in `src/middleware.ts` (edge, verifies the JWT, forces first-login password reset)
- Email: **Gmail SMTP via nodemailer** (`src/lib/mail.ts`); the user explicitly does NOT want Resend. Without `GMAIL_USER`/`GMAIL_APP_PASSWORD` emails print to the server console
- Charts: **recharts** (wrappers in `src/components/charts.tsx`)

## Commands

```bash
npm run dev            # dev server (http://localhost:3000)
npm run build          # production build (must pass before finishing work)
npm run db:push        # push prisma/schema.prisma to the database
npm run db:seed        # idempotent demo seed (6 users, 2 certification courses, teams, expenses, projects)
npm run db:generate    # regenerate prisma client
```

Always pass the npm cache location on this machine (C: drive is full):

```bash
npm_config_cache=/d/npm-cache npm install ...
npm_config_cache=/d/npm-cache npx ...
```

## Critical environment facts

- **The app uses a dedicated `attendance` database.** The Postgres server on `localhost:5432` also hosts OTHER projects of the user's inside the `postgres` database (`a2a_events`, `agent_executions`, `work_orders`, …). `prisma db push` syncs the ENTIRE database it points at — never run `prisma db push --accept-data-loss` against `postgres`. `DATABASE_URL` in `.env` must stay pointed at `attendance`.
- `.env` holds the user's real DB password and a real Gmail App Password. `.env.example` documents every variable. `DEV_EXPOSE_OTP=true` returns the OTP in dev API responses only when no mail provider is configured.
- The dev server locks `node_modules/.prisma/client/query_engine-windows.dll.node` — **stop node processes before `prisma generate`/`db push`** or you get EPERM rename errors.
- Windows + Git Bash: production (`next start`) route-handler `console.log` does not reach redirected log files; dev server logs do.
- The user edits files themselves between sessions — **re-read files before editing**.

## Architecture conventions

- All API routes: `handleRoute(async () => { … })` from `src/lib/api.ts` (converts `ApiError` → JSON responses). Guards: `requireUser(roles?)`, `requireActiveUser(roles?)`, `requireExpenseAccess()`. Never trust the client — permissions are re-checked server-side in every route.
- Hierarchy permission rule: HR Admins/Directors can act org-wide; **team/project leads can act on their own people** (e.g. review a leave request from someone in a team they lead). Check `Team.leadId` / `Project.leadId` / `User.managerId` when extending guards.
- Client pages are `"use client"` and talk to APIs via `api<T>()` from `src/lib/client.ts` (throws `Error` with the server's message). Toast errors with `sonner`. Never import server-only modules (`@/lib/db`, `@/lib/auth`, `@/lib/api`) from client components; shared client-safe labels live in `src/lib/roles.ts`.
- Dates: calendar days are pinned to **UTC midnight** (`src/lib/dates.ts`: `toKey`/`fromKey`/`serverTodayKey`). Attendance "today" = server-local date. Working days are Mon–Fri.
- Money: `Float` rupees, formatted with `rupees()` from `src/lib/money.ts`.
- Audit: every admin-ish action calls `logAudit` (`src/lib/audit.ts`); add new actions to both `src/lib/audit.ts` (constants) and `src/lib/roles.ts` (`AUDIT_ACTION_LABEL`).
- Jira-style IDs: `Project.key` (e.g. `PRD`) + per-project `seq` → `Task.key` = `PRD-12`, computed on issue creation (`max(seq)+1` per project).
- Sessions carry `{ userId, email, name, role, mustResetPassword }`; middleware redirects: unauthenticated → `/login`, `mustResetPassword` → `/change-password`, signed-in users away from auth pages.

## Deploy (Vercel)

Env vars: `DATABASE_URL` (dedicated hosted DB), `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, optional `CRON_SECRET`, `MS_*`/`GOOGLE_*` OAuth, **leave `DEV_EXPOSE_OTP` unset in production**. `prisma generate` runs on `postinstall`. Push the schema once against the prod URL from a machine with the credentials.

## Things the user cares about

- Naming: the app is **Org Tracker**. The folder is still `attendance-portal` (don't rename it — their dev server/terminal point at it).
- No Resend. Gmail only, for now.
- No `LATE` attendance status.
- Every visible control must be actionable in production: dashboard summary cards open people lists, employee cards open a drill-down via `/api/employees/[id]/overview` (leads may view their own people), the projects board is drag-and-drop.
- Progress semantics everywhere: a milestone/step "counts" at 100%; partial percents contribute fractionally.

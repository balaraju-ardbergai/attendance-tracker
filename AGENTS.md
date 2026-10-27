# AGENTS.md — Org Tracker (formerly "Attendance Portal" / "OrgPulse")

Operating guide for coding agents and humans in this repository. **Read this fully before changing anything.**

## What this app is

**Org Tracker** (folder name `attendance-portal`) is a production internal platform for a small company, deployed on Vercel. Modules and routes:

| Module | Route | Notes |
| --- | --- | --- |
| Attendance | `/attendance` | daily mark + geolocation, clock-out, month calendar, stats. Statuses: `PRESENT / LEAVE / WFH / ABSENT`. The user explicitly removed `LATE` — do not reintroduce |
| Requests | `/requests` | leave/WFH; reviewed by HR Admins, Directors **and the requester's team lead / manager** (`canReviewRequestOf` in `src/lib/permissions.ts`) |
| Courses | `/courses` | certification tracker: milestones with phases, per-person % progress, org averages, optional class sessions + attendance |
| Teams & Org Graph | `/teams`, `/org-graph` | `Team.leadId` grants leads a Member-details view (`/api/teams/[id]/overview`) and management rights over their own team |
| Expenses | `/expenses` | restricted: Directors/HR or `User.expenseAccess`. Recharts dashboards; scheduled email reports |
| Expense reports | `/api/reports/expense/[period]` | Vercel Cron (`vercel.json`); recipients = `User.receivesExpenseReports` (Directors configure); guarded by `CRON_SECRET` |
| Projects | `/projects` | JIRA-style: `Project` (key → issue keys like `PRD-12`), `Sprint` (SCRUM), `Phase` (WATERFALL), `Task` = issue (type EPIC/STORY/TASK/BUG, epicId, sprintId, phaseId, storyPoints, acceptanceCriteria). Board is drag-and-drop (native HTML5 DnD, optimistic, permission-checked) |
| Assistant | floating chat widget | rule-based account-aware Q&A (`/api/assistant`); strictly scoped to the signed-in user's data |
| Connectors | `/connectors` | Outlook/Gmail OAuth per user |
| Admin | `/users`, `/approvals`, `/dashboard`, `/audit` | approvals flow for user lifecycle; dashboard cards are clickable drill-downs (`/api/employees/[id]/overview`); audit is Director-only |

Roles: `DIRECTOR`, `ADMIN` (HR), `EMPLOYEE`. Hierarchy permissions flow from `Team.leadId`, `Project.leadId`, `Project.teamId` and `User.managerId` — see `src/lib/permissions.ts`.

## Stack

- **Next.js 15** (App Router, `src/` dir, Turbopack), **React 19**, **TypeScript**, **Tailwind v4**
- **shadcn/ui** (`src/components/ui`; v5 CLI: `npx shadcn@latest add <component>`; init used `-b radix -p vega`)
- **Prisma 6 + PostgreSQL**; **jose** JWT sessions in httpOnly cookie `ap_session`; **bcryptjs**; **nodemailer** Gmail SMTP (the user explicitly rejected Resend); **recharts** (`src/components/charts.tsx`)

## Commands

```bash
npm_config_cache=/d/npm-cache npm install ...   # ALWAYS — C: drive is 100% full
npm run dev            # dev server on :3000
npm run build          # production build — must pass before finishing work
npm run lint           # keep at 0 errors (warnings tolerated but tidy them)
npm run db:push        # push prisma/schema.prisma
npm run db:seed        # idempotent demo seed
```

## Critical environment facts (do not skip)

1. **Dedicated database.** The Postgres server on `localhost:5432` also hosts ANOTHER project of the user's inside the `postgres` database (`a2a_events`, `agent_executions`, `work_orders`, …). `prisma db push` syncs the ENTIRE database it points at — running it with `--accept-data-loss` against `postgres` would destroy that project. `DATABASE_URL` must stay pointed at the dedicated `attendance` database. Before any `db push` that warns, preview with `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`.
2. **Kill node before `prisma generate`/`db push`** — the dev server locks `node_modules/.prisma/client/query_engine-windows.dll.node` (EPERM rename errors).
3. **`.env` holds real secrets** (DB password, Gmail App Password). `.env.example` documents every variable. `DEV_EXPOSE_OTP=true` returns OTPs in API responses only in dev when no mail provider is configured — never set it in production.
4. **The user edits files between sessions.** Always re-read files before editing; do not assume they match your memory. A formatting watcher may also touch files mid-edit.
5. Production (`next start`) route-handler `console.log` does NOT reach redirected log files on this Windows setup; dev server logs do.
6. If pages 500 with "Failed to load chunk" after a production build, the `.next` folder is stale — `rm -rf .next` and restart the dev server.

## Architecture rules

- **Authorization is DB-backed on every API call.** `requireUser` (`src/lib/api.ts`) re-reads the user and rejects: inactive accounts, users with `mustResetPassword` (they may only call `/api/auth/change-password`), and role mismatches — it returns a session with the FRESH role. Never trust `session.role` from the JWT for new checks when the DB user is available. Cost: one user query per request — accepted deliberately.
- **Hierarchy**: HR Admins/Directors act org-wide; team/project leads act only on their own people/projects. Use `src/lib/permissions.ts`: `canManageProject`, `canManageTeamMembers`, `canReviewRequestOf`, `visibleProjectWhere`, `canAccessTeam`.
- **Project visibility**: HR/Directors see all; others see projects they lead, of their teams, org-wide (`teamId: null`), or assigned to them. Both `/api/projects` and `/api/projects/[id]` enforce it via `visibleProjectWhere`; `/api/issues` GET applies the same rules.
- All API routes wrap in `handleRoute` (`ApiError` → JSON). Validate inputs, never trust the client, gate every mutation server-side. UI gating (hiding buttons) is UX only.
- Jira keys: `Project.key` + per-project `seq` → `Task.key` (`PRD-12`), computed as `max(seq)+1`; `Task.key` has a UNIQUE constraint (concurrent creates may 409 — client retries).
- Client pages are `"use client"`, talk to APIs via `api<T>()` from `src/lib/client.ts` (throws `Error` with the server message), toast with `sonner`. Never import server-only modules into client components; shared labels live in `src/lib/roles.ts` (add new audit actions to BOTH `src/lib/audit.ts` and `AUDIT_ACTION_LABEL`).
- Dates: UTC-midnight convention (`src/lib/dates.ts`). `serverTodayKey()` is the server's local date. Months are 0-based — never default month params with `||` (January is 0).
- Every page uses `PageHeader` (`src/components/page-header.tsx`) for title/description/actions alignment. Keep it that way — a scripted regex conversion of headers once corrupted 12 pages and they had to be rewritten by hand. **Never bulk-edit JSX with regex scripts; edit files individually.**
- Every visible control must do something real: dashboard cards open dialogs, board cards drag, all links resolve. When adding UI, wire the action in the same change.

## Auth flows

- Login → JWT cookie (7d) → middleware protects page routes (`src/middleware.ts`); APIs protect themselves.
- HR adds user → Director approves → user created with temp password + invite email → `mustResetPassword=true` → forced `/change-password` (middleware for pages, `requireUser` 403 for APIs).
- Forgot password → hashed 6-digit OTP (5 min, single use, 60s resend throttle) → reset. Login has an in-memory brute-force lockout (5 fails / 15 min / per instance).

## Deploy (Vercel)

Env: `DATABASE_URL` (dedicated hosted DB), `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `CRON_SECRET`, optional `MS_*`/`GOOGLE_*`, **no `DEV_EXPOSE_OTP`**. `postinstall` runs `prisma generate`. Push schema once against prod from a machine with credentials. OAuth redirect URIs: `/api/connections/outlook/callback` and `/api/connections/gmail/callback`.

## Things the user cares about

- The product is called **Org Tracker**; folder stays `attendance-portal`.
- Gmail only (no Resend). No LATE attendance status.
- Production bar, not demo bar: every button works, permissions are real, failures surface as toasts.
- The user tests continuously and edits data via the UI — demo data in the DB may differ from `seed.ts`; never "fix" their live data by reseeding without asking.

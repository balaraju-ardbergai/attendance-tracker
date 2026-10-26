# Attendance Portal

An organization attendance tracking application built with **Next.js (App Router) + shadcn/ui + PostgreSQL (Prisma)**, ready to deploy on **Vercel**.

## Features

| Area | Details |
| --- | --- |
| **Roles** | Director, HR Admin (`ADMIN`), Employee |
| **Sign in** | Email + password, JWT session in an httpOnly cookie, route protection via middleware |
| **First login** | Accounts created by HR start with a temporary password; users must set a new one before they can use the portal |
| **Forgot password** | 6-digit OTP to the registered email, valid 5 minutes, single use; confirmation email after reset |
| **User addition** | HR submits name/email → Director approves → user is created with a temporary password + invitation email. Directors can add users directly. |
| **HR management** | Assign/remove HR role, remove/reactivate users — Directors apply directly, HR Admins request it (approval queue) |
| **Attendance** | One-click daily mark with time + optional geolocation, clock-out, month calendar view. Statuses: Present / Leave / WFH / Absent. |
| **Requests** | Leave / WFH with date range + reason; approve/reject with note (HR Admin + Director), cancel (owner); approval writes LEAVE/WFH onto the employee's calendar and emails the outcome |
| **Courses** | Certification & training tracks modelled on a progress-tracker spreadsheet: ordered milestones (phase-grouped: prerequisite / prep course / exam, with links + durations), per-person progress per milestone (10–90% partial or Completed), per-person summary (steps completed, % complete, currently-at, status) and per-milestone org-level progress. Optional class attendance: the creator enables it, sets the schedule, generates recurring session dates, and marks/collects attendance (participants can mark themselves for today's class). |
| **Organization dashboard** | Summary cards + one card per employee (picture, name, email, role) with a combined progress bar of present/late/leave/WFH/absent for the current month |
| **HR Activity (audit)** | Director-only trail of every administrative action (who, what, whom, when) |
| **Connectors** | OAuth connections for Outlook (Microsoft Graph) and Gmail (Google), per user, with real token exchange — just add API keys |

## Quick start (local)

**Prerequisites:** Node 18.18+, a PostgreSQL database (local or hosted), npm.

1. **Configure the environment** — edit `.env` and set your Postgres password in `DATABASE_URL`:

   ```
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/attendance?schema=public"
   ```

   The `attendance` database is created automatically by `db push` (your user needs CREATEDB, which the default `postgres` user has).

2. **Create the schema and seed demo data:**

   ```bash
   npm install
   npm run db:push
   npm run db:seed
   ```

3. **Run it:**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. Email has no provider configured locally, so OTPs and invitations are **printed to the dev server console** (and the OTP is also returned in the API response in dev mode).

### Demo accounts (from the seed)

| Role | Email | Password |
| --- | --- | --- |
| Director | `director@org.com` | `Director@123` |
| HR Admin | `hr@org.com` | `Hr@12345` |
| Employee | `employee@org.com` | `Emp@12345` |
| Employee | `sara@org.com` / `david@org.com` / `anita@org.com` | `Emp@12345` |

## Deploying to Vercel

1. **Database** — create a hosted Postgres (Vercel Postgres, Neon or Supabase all work and are pgAdmin-compatible via their connection strings). Copy the connection string.
2. **Push the schema** once from your machine against the production URL: `DATABASE_URL="<prod-url>" npx prisma db push` (optionally seed with `npm run db:seed`).
3. **Import the repo into Vercel** and set the environment variables:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | your production Postgres connection string |
   | `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` (used in email links) |
   | `GMAIL_USER` | the Gmail account that sends the emails |
   | `GMAIL_APP_PASSWORD` | a Google **App Password** for that account (see below) |
   | `DEV_EXPOSE_OTP` | **leave unset in production** |
   | `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT_ID` | optional, Outlook connector |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional, Gmail connector |

   `prisma generate` runs automatically on install (`postinstall` script).

## How the email flows work

`src/lib/mail.ts` sends every email through **Gmail SMTP** (`smtp.gmail.com:465` via nodemailer) using `GMAIL_USER` + `GMAIL_APP_PASSWORD`; when those aren't set, emails are logged to the server console so all flows are testable offline. Emails sent: invitation (with temporary password), password-reset OTP, password-changed confirmation, request outcome, approval-needed (to Directors), approval outcome (to requester).

### Creating the Gmail App Password

1. On the sending Google account, enable **2-Step Verification** (myaccount.google.com → Security).
2. Go to **Security → 2-Step Verification → App passwords** (or https://myaccount.google.com/apppasswords).
3. Create one (name it "Attendance Portal"), copy the 16-character password into `GMAIL_APP_PASSWORD` (spaces are stripped automatically).
4. Restart the dev server. Regular account passwords do **not** work — Gmail requires App Passwords for SMTP.

## Connectors setup

- **Outlook:** register an app in [Azure Portal → App registrations](https://portal.azure.com), add a **Web** redirect URI `https://YOUR-APP/api/connections/outlook/callback` (and `http://localhost:3000/api/connections/outlook/callback` for dev), grant delegated `openid email profile`, put the client id/secret in env.
- **Gmail:** create an OAuth client in [Google Cloud Console](https://console.cloud.google.com) with the same callback pattern (`/api/connections/gmail/callback`), enable OpenID scopes.

Until credentials exist the UI shows "Not configured" and doesn't let anyone start the flow.

## Notes & design decisions

- **Dates** are pinned to the *server's* calendar day (UTC on Vercel). A "day" is the server's date — fine for a single-timezone organization.
- **Geolocation** uses the browser API; browsers only expose it on `localhost` or HTTPS. If the user denies it, attendance is still marked without coordinates.
- **Working days** are Mon–Fri; today only counts as "absent" in stats once marked (or after the day passes).
- **Removals** deactivate accounts (history preserved) rather than deleting rows.
- **Course progress** mirrors the tracker sheet: a milestone counts as a completed step at 100%; partial percentages (10–90%) contribute fractionally to "% Complete"; "Currently at" is the first milestone below 100% in order.
- **pgAdmin** can point at the same `DATABASE_URL` to browse/edit data.

## Courses (certification tracker)

The Courses section replicates a spreadsheet-based certification tracker (e.g. the Claude certification tracks):

- **Structure** — a course has ordered **milestones** (name, phase like `PREREQUISITE`/`PREP COURSE`/`EXAM`, description, link, duration) and **participants** (enrolled employees).
- **Tracker tab** — the matrix: participants as rows, milestones as columns (grouped by phase), each cell picks `Not started / 10%–90% / Completed`; summary columns show steps completed, % complete, "Currently at" (next step) and status. Participants can edit their own cells; HR Admins and Directors can edit anyone's.
- **Org level** — each milestone shows the org-wide average progress and how many participants completed it; the course list shows overall org progress per course.
- **Classes & attendance** — if the creator enables attendance for the course (some courses have recurring classes), they set the schedule note and generate recurring session dates (weekday pattern × weeks, or single dates). Admins mark anyone's attendance (Present/Absent/Excused); participants can mark themselves for today's session.

The seed includes the two Claude certification tracks from the original tracker, with real course links and progress patterns.

## Project structure

```
prisma/schema.prisma       # User, Attendance, Request, Approval, Otp, Connection, AuditLog,
                           # Course, Milestone, MilestoneProgress, CourseEnrollment, CourseSession, CourseAttendance
prisma/seed.ts             # demo org: 1 Director, 1 HR, 4 employees + month of attendance + 2 certification courses
src/middleware.ts          # session check, forced first-login reset, auth-page redirects
src/lib/                   # db, auth (JWT/bcrypt/OTP), mail (Gmail SMTP), audit, date/stats helpers
src/app/api/               # auth, me, attendance, requests, users, approvals, dashboard, audit, connections, courses
src/app/(auth)/            # login, forgot-password, reset-password, change-password
src/app/(app)/             # attendance, requests, courses, dashboard, users, approvals, audit, connectors
src/components/            # app shell, month grid, combined stat bar, request dialog, ui/ (shadcn)
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | start dev server |
| `npm run build` / `npm start` | production build / serve |
| `npm run db:push` | push the Prisma schema to the database |
| `npm run db:seed` | (re)seed demo data |
| `npm run db:generate` | regenerate the Prisma client |

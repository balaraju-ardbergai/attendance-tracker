# Attendance Portal

An organization attendance tracking application built with **Next.js (App Router) + shadcn/ui + PostgreSQL (Prisma)**, ready to deploy on **Vercel**.

## Features

| Area | Details |
| --- | --- |
| **Roles** | Director, HR Admin (`ADMIN`), Employee |
| **Sign in** | Email + password, Microsoft sign-in, JWT session in an httpOnly cookie, route protection via middleware |
| **First login** | The initial Director and accounts created later start with a temporary password; users must set a new one before they can use the portal |
| **Forgot password** | 6-digit OTP to the registered email, valid 5 minutes, single use; confirmation email after reset |
| **User addition** | HR submits name/email, Director approves, then the user is created with a temporary password + invitation email. Directors can add users directly. |
| **HR management** | Assign/remove HR role, remove/reactivate users. Directors apply directly, HR Admins request it through the approval queue. |
| **Attendance** | One-click daily mark with time + optional geolocation, clock-out, month calendar view |
| **Requests** | Leave / WFH with date range + reason; approve/reject with note (HR Admin + Director), cancel (owner); approval writes LEAVE/WFH onto the employee's calendar and emails the outcome |
| **Organization dashboard** | Summary cards + one card per employee (picture, name, email, role) with a combined progress bar of present/leave/WFH/absent for the current month |
| **HR Activity (audit)** | Director-only trail of every administrative action (who, what, whom, when) |

## Quick Start

**Prerequisites:** Node 18.18+, a PostgreSQL database (local or hosted), npm.

1. **Configure the environment** - edit `.env` and set your Postgres password in `DATABASE_URL`:

   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/attendance?schema=public"
   ```

2. **Create the schema and seed the initial Director:**

   ```bash
   npm install
   npm run db:push
   npm run db:seed
   ```

3. **Run it:**

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`. Email has no provider configured locally, so OTPs and invitations are printed to the dev server console. Set `DEV_EXPOSE_OTP=true` locally only if you also want reset OTPs returned in the API response.

### Initial Account

| Role | Email | Password |
| --- | --- | --- |
| Director | `director@org.com` | `ChangeMe@123!` |

You will be forced to change this password after first login. Add Directors, HR Admins and Employees from **Users** after signing in as Director.

## Deploying To Vercel

1. **Database** - create a hosted Postgres (Vercel Postgres, Neon or Supabase all work and are pgAdmin-compatible via their connection strings). Copy the connection string.
2. **Import the repo into Vercel** and set the environment variables:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | your production Postgres connection string |
   | `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` (used in email links) |
   | `INITIAL_DIRECTOR_EMAIL` | first Director login email |
   | `INITIAL_DIRECTOR_PASSWORD` | first Director temporary password, at least 8 characters |
   | `INITIAL_DIRECTOR_NAME` | optional first Director display name |
   | `INITIAL_DIRECTOR_RESET_PASSWORD` | optional; set to `true` only when you want deploys to reset that Director password and force another password change |
   | `GMAIL_USER` | the Gmail account that sends the emails |
   | `GMAIL_APP_PASSWORD` | a Google **App Password** for that account |
   | `DEV_EXPOSE_OTP` | **leave unset in production** |
   | `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT_ID` | optional, Microsoft sign-in |

   Vercel runs `npm run vercel-build`, which generates Prisma, pushes the schema, creates the first Director with a forced password change, and builds the app.

## Email

`src/lib/mail.ts` sends every email through **Gmail SMTP** (`smtp.gmail.com:465` via nodemailer) using `GMAIL_USER` + `GMAIL_APP_PASSWORD`; when those aren't set, emails are logged to the server console so all flows are testable offline.

### Creating The Gmail App Password

1. On the sending Google account, enable **2-Step Verification**.
2. Go to **Security -> 2-Step Verification -> App passwords**.
3. Create one named "Attendance Portal", copy the 16-character password into `GMAIL_APP_PASSWORD` (spaces are stripped automatically).
4. Restart the dev server. Regular account passwords do **not** work; Gmail requires App Passwords for SMTP.

## Microsoft Sign-In

Set `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, and `MS_TENANT_ID` to enable the "Continue with Microsoft" button on the login page. Add this Web redirect URI in Azure:

```txt
http://localhost:3000/api/auth/microsoft/callback
```

For production, add the same path on your deployed domain. Microsoft sign-in only logs in existing active portal users by matching their Microsoft email to `User.email`; user creation still goes through the Director/HR flow.

## Notes

- **Dates** are pinned to the server's calendar day (UTC on Vercel). A "day" is the server's date, fine for a single-timezone organization.
- **Geolocation** uses the browser API; browsers only expose it on `localhost` or HTTPS. If the user denies it, attendance is still marked without coordinates.
- **Working days** are Mon-Fri; today only counts as absent in stats once marked (or after the day passes).
- **Removals** deactivate accounts (history preserved) rather than deleting rows.
- **pgAdmin** can point at the same `DATABASE_URL` to browse/edit data.

## Project Structure

```txt
prisma/schema.prisma       # User, Attendance, Request, Approval, Otp, AuditLog
prisma/seed.mjs            # one initial Director only; add everyone else from the app
src/middleware.ts          # session check, forced first-login reset, auth-page redirects
src/lib/                   # db, auth (JWT/bcrypt/OTP), mail, audit, date/stats helpers
src/app/api/               # auth, me, attendance, requests, users, approvals, dashboard, audit
src/app/(auth)/            # login, forgot-password, reset-password, change-password
src/app/(app)/             # attendance, requests, dashboard, users, approvals, audit
src/components/            # app shell, month grid, combined stat bar, request dialog, ui/ (shadcn)
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | start dev server |
| `npm run build` / `npm start` | production build / serve |
| `npm run vercel-build` | Vercel build: generate Prisma, push schema, ensure first Director, build app |
| `npm run db:push` | push the Prisma schema to the database |
| `npm run db:seed` | seed/reset the one local Director |
| `npm run db:prod-seed` | create/update the first production Director from env |
| `npm run db:generate` | regenerate the Prisma client |

// Email delivery via Gmail SMTP. Set GMAIL_USER + GMAIL_APP_PASSWORD (a Google
// App Password — see README) to send real email; otherwise emails are printed
// to the server console so the app is fully testable without credentials.

import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function getTransporter(): Transporter | null {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER!,
        pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, ""),
      },
    });
  }
  return transporter;
}

export async function sendMail(mail: { to: string; subject: string; html: string }): Promise<{ delivered: boolean }> {
  const transport = getTransporter();
  const from = `Attendance Portal <${process.env.GMAIL_USER}>`;
  if (!transport) {
    console.log(
      `\n===== [dev email - Gmail not configured] =====\nTo: ${mail.to}\nFrom: ${from}\nSubject: ${mail.subject}\n${mail.html}\n=============================================\n`,
    );
    return { delivered: false };
  }
  try {
    await transport.sendMail({ from, to: mail.to, subject: mail.subject, html: mail.html });
    return { delivered: true };
  } catch (err) {
    console.error("[mail] send failed:", err);
    return { delivered: false };
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function appUrl(path = "") {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${path}`;
}

function wrap(title: string, body: string) {
  return `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f4f4f5;padding:24px;">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e4e4e7;">
    <h2 style="margin:0 0 16px;color:#18181b;">${escapeHtml(title)}</h2>
    ${body}
    <p style="margin-top:28px;font-size:12px;color:#71717a;">Attendance Portal — automated message.</p>
  </div></body></html>`;
}

export function inviteEmail(name: string, email: string, tempPassword: string) {
  return {
    to: email,
    subject: "You have been added to the Attendance Portal",
    html: wrap(
      "Welcome to the Attendance Portal",
      `<p>Hi ${escapeHtml(name)},</p>
       <p>An account has been created for you. Sign in at <a href="${appUrl("/login")}">${appUrl("/login")}</a> using:</p>
       <p><b>Email:</b> ${escapeHtml(email)}<br/><b>Temporary password:</b> <code style="background:#f4f4f5;padding:2px 6px;border-radius:4px;">${tempPassword}</code></p>
       <p>You will be asked to set your own password the first time you sign in.</p>`,
    ),
  };
}

export function passwordResetOtpEmail(name: string, email: string, code: string) {
  return {
    to: email,
    subject: `Your password reset code: ${code}`,
    html: wrap(
      "Password reset code",
      `<p>Hi ${escapeHtml(name)},</p>
       <p>Use the code below to reset your password. It is valid for <b>5 minutes</b>.</p>
       <p style="font-size:28px;letter-spacing:8px;font-weight:700;color:#18181b;">${code}</p>
       <p>If you did not request this, you can safely ignore this email.</p>`,
    ),
  };
}

export function passwordChangedEmail(name: string, email: string) {
  return {
    to: email,
    subject: "Your Attendance Portal password was changed",
    html: wrap(
      "Password changed",
      `<p>Hi ${escapeHtml(name)},</p>
       <p>Your password was changed successfully. If this wasn't you, please contact your HR admin immediately.</p>`,
    ),
  };
}

export function requestStatusEmail(
  name: string,
  email: string,
  typeLabel: string,
  status: string,
  note?: string | null,
) {
  return {
    to: email,
    subject: `Your ${typeLabel} request was ${status.toLowerCase()}`,
    html: wrap(
      `Request ${status.toLowerCase()}`,
      `<p>Hi ${escapeHtml(name)},</p>
       <p>Your <b>${escapeHtml(typeLabel)}</b> request has been <b>${escapeHtml(status.toLowerCase())}</b>.</p>
       ${note ? `<p><b>Note from reviewer:</b> ${escapeHtml(note)}</p>` : ""}
       <p><a href="${appUrl("/requests")}">View your requests</a></p>`,
    ),
  };
}

export function approvalRequestedEmail(
  directorName: string,
  directorEmail: string,
  requestedByName: string,
  what: string,
) {
  return {
    to: directorEmail,
    subject: "Approval needed in the Attendance Portal",
    html: wrap(
      "Approval requested",
      `<p>Hi ${escapeHtml(directorName)},</p>
       <p><b>${escapeHtml(requestedByName)}</b> has requested your approval to <b>${escapeHtml(what)}</b>.</p>
       <p><a href="${appUrl("/approvals")}">Review pending approvals</a></p>`,
    ),
  };
}

export function approvalOutcomeEmail(
  name: string,
  email: string,
  what: string,
  approved: boolean,
) {
  return {
    to: email,
    subject: `Your request was ${approved ? "approved" : "rejected"}`,
    html: wrap(
      approved ? "Request approved" : "Request rejected",
      `<p>Hi ${escapeHtml(name)},</p>
       <p>Your request <b>${escapeHtml(what)}</b> was <b>${approved ? "approved" : "rejected"}</b> by a Director.</p>
       <p><a href="${appUrl()}">Open the Attendance Portal</a></p>`,
    ),
  };
}

export function expenseReportEmail(
  recipientName: string,
  recipientEmail: string,
  periodLabel: string,
  summary: { total: number; count: number },
  byCategory: { label: string; total: number }[],
  byTeam: { label: string; total: number }[],
  topExpenses: { title: string; category: string; party: string | null; amount: number; date: string }[],
) {
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const rows = (items: { label: string; value: string }[]) =>
    items.length === 0
      ? `<tr><td colspan="2" style="padding:6px;color:#71717a;">None recorded.</td></tr>`
      : items
          .map(
            (r) =>
              `<tr><td style="padding:6px;border-bottom:1px solid #e4e4e7;">${escapeHtml(r.label)}</td><td style="padding:6px;border-bottom:1px solid #e4e4e7;text-align:right;font-weight:600;">${r.value}</td></tr>`,
          )
          .join("");
  const table = (title: string, body: string) =>
    `<h3 style="margin:20px 0 8px;font-size:14px;color:#18181b;">${escapeHtml(title)}</h3>
     <table style="width:100%;border-collapse:collapse;font-size:13px;">${body}</table>`;

  return {
    to: recipientEmail,
    subject: `Expense report — ${periodLabel}`,
    html: wrap(
      `Expense report — ${escapeHtml(periodLabel)}`,
      `<p>Hi ${escapeHtml(recipientName)},</p>
       <p>Here is the expense summary for <b>${escapeHtml(periodLabel)}</b>: <b>${fmt(summary.total)}</b> across ${summary.count} expense${summary.count === 1 ? "" : "s"}.</p>
       ${table("By category", rows(byCategory.map((c) => ({ label: c.label, value: fmt(c.total) }))))}
       ${table("By team", rows(byTeam.map((t) => ({ label: t.label, value: fmt(t.total) }))))}
       ${table(
         "Largest expenses",
         rows(topExpenses.map((e) => ({ label: `${e.title}${e.party ? ` (${e.party})` : ""} — ${formatDate(e.date)}`, value: fmt(e.amount) }))),
       )}
       <p style="margin-top:20px;"><a href="${appUrl("/expenses")}">Open the Expenses dashboard</a></p>`,
    ),
  };
}

function formatDate(key: string) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

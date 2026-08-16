import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // EMAIL_DRY_RUN lets Admin test the live portal (opening/closing weeks,
  // roster changes, tickets) against production data without emailing the
  // real roster — same no-op fallback as "no credentials configured", just
  // reachable without removing/re-adding all 5 SMTP variables each time.
  const dryRun = process.env.EMAIL_DRY_RUN === "true";

  if (dryRun || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    transporter = {
      sendMail: async (opts) => {
        console.log(`[mailer:${dryRun ? "dry-run" : "noop"}] Would send email to ${opts.to}: "${opts.subject}"`);
        return { messageId: dryRun ? "dry-run" : "noop" };
      },
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

export async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  return t.sendMail({
    from: process.env.SMTP_FROM || "Profiling 2027 Feedback Portal <no-reply@qcin.org>",
    to,
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, ""),
  });
}

let realTransporter = null;

/**
 * Always sends through the real SMTP transport, ignoring EMAIL_DRY_RUN —
 * used ONLY by the Admin's "Send Test Email" self-check (see
 * admin.controller.js sendTestEmail, which hardcodes the recipient to the
 * calling Admin's own address). Safe to bypass dry-run here specifically
 * because it can never reach the real roster, only the Admin testing it.
 */
export async function sendTestMail({ to, subject, html }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP credentials are not configured yet");
  }
  if (!realTransporter) {
    realTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== "false",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return realTransporter.sendMail({
    from: process.env.SMTP_FROM || "Profiling 2027 Feedback Portal <no-reply@qcin.org>",
    to,
    subject,
    html,
    text: html.replace(/<[^>]+>/g, ""),
  });
}

/**
 * End-of-day (~19:30 IST) digest for Admins/Project Leads/CASU Leads —
 * who in their scope still has pending submissions for the open week.
 * `rows` is already scoped to the recipient (see compliance.js
 * sendEndOfDayDigest): Admins get everyone, Project Leads get only
 * Profiler/Group Anchor/Project Lead rows, CASU Leads get only
 * CASU Anchor/CASU Lead rows.
 */
export function digestEmailBody(recipientName, weekLabel, rows, scopeLabel) {
  const scopeSuffix = scopeLabel ? ` (${scopeLabel})` : "";

  if (rows.length === 0) {
    return `
      <p>Hi ${recipientName},</p>
      <p>End-of-day update for <strong>${weekLabel}</strong>${scopeSuffix}: everyone in your scope has completed
      their submissions. Nothing pending right now.</p>
      <p>Thanks.</p>
    `;
  }

  const selfPendingCount = rows.filter((r) => r.selfPending).length;
  const peerPendingCount = rows.reduce((a, r) => a + r.pendingPeers.length, 0);
  const items = rows
    .map((r) => {
      const bits = [];
      if (r.selfPending) bits.push("Self-Evaluation");
      if (r.pendingPeers.length) bits.push(`Peer-Evaluation for ${r.pendingPeers.join(", ")}`);
      return `<li><strong>${r.name}</strong> (${r.roleLabel}) — ${bits.join("; ")}</li>`;
    })
    .join("");

  return `
    <p>Hi ${recipientName},</p>
    <p>End-of-day update for <strong>${weekLabel}</strong>${scopeSuffix}: <strong>${selfPendingCount} self-evaluation${
    selfPendingCount === 1 ? "" : "s"
  }</strong> and <strong>${peerPendingCount} peer-evaluation${peerPendingCount === 1 ? "" : "s"}</strong> still pending.</p>
    <ul>${items}</ul>
    <p>Thanks.</p>
  `;
}

export function reminderEmailBody(user, weekLabel, pending, daysLeft = null) {
  const items = [];
  if (pending.selfPending) items.push("<li>Your own Self-Evaluation</li>");
  for (const peer of pending.peerNames) {
    items.push(`<li>Peer-Evaluation for <strong>${peer}</strong></li>`);
  }
  const count = items.length;
  const deadlineLine =
    daysLeft === null
      ? "Please log in and complete these before the window closes."
      : daysLeft <= 0
      ? "<strong>The window closes today</strong> — please log in and complete these as soon as possible."
      : `You have <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"} left</strong> to complete ${count === 1 ? "this" : "these"} before the window closes.`;
  return `
    <p>Hi ${user.name},</p>
    <p>You still have <strong>${count} pending submission${count === 1 ? "" : "s"}</strong> for <strong>${weekLabel}</strong> on the Profiling 2027 Feedback Portal:</p>
    <ul>${items.join("")}</ul>
    <p>${deadlineLine}</p>
    <p>Thanks.</p>
  `;
}

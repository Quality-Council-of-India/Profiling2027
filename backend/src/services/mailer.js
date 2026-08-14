import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    // No SMTP credentials configured (e.g. local dev). Fall back to a
    // console-logging transport so the rest of the app keeps working.
    transporter = {
      sendMail: async (opts) => {
        console.log(`[mailer:noop] Would send email to ${opts.to}: "${opts.subject}"`);
        return { messageId: "noop" };
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

export function reminderEmailBody(user, weekLabel, pending) {
  const items = [];
  if (pending.selfPending) items.push("<li>Your own Self-Evaluation</li>");
  for (const peer of pending.peerNames) {
    items.push(`<li>Peer-Evaluation for <strong>${peer}</strong></li>`);
  }
  return `
    <p>Hi ${user.name},</p>
    <p>You still have pending submissions for <strong>${weekLabel}</strong> on the Profiling 2027 Feedback Portal:</p>
    <ul>${items.join("")}</ul>
    <p>Please log in and complete these before the window closes.</p>
    <p>— Core Team</p>
  `;
}

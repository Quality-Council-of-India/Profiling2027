// Grievance Redressal — "Raise Your Concern" tickets. Any non-admin user can
// file one; Admin triages/responds from the Grievances tab.
import { prisma } from "../utils/prisma.js";
import { notify, getAdminIds } from "./notifications.js";

export const TICKET_CATEGORIES = ["password_email_change", "portal_bug", "feature_not_working", "other"];

export const TICKET_CATEGORY_LABELS = {
  password_email_change: "Password / Email Change",
  portal_bug: "Portal Not Working",
  feature_not_working: "Functionality Not Working",
  other: "Other",
};

export async function createTicket(projectId, user, { category, subject, description }) {
  const ticket = await prisma.ticket.create({
    data: { project_id: projectId, user_id: user.id, category, subject, description },
  });

  const adminIds = await getAdminIds(projectId);
  await notify(projectId, adminIds, {
    type: "ticket_created",
    title: `New concern raised: ${subject}`,
    body: `${user.name} (${TICKET_CATEGORY_LABELS[category]}) — ${description.slice(0, 200)}`,
    link: "/admin/grievances",
    emailHtml: () => `
      <p>${user.name} (${user.role}${user.field ? `, ${user.field}` : ""}) raised a new concern on the Profiling 2027 Feedback Portal:</p>
      <p><strong>Category:</strong> ${TICKET_CATEGORY_LABELS[category]}<br/>
      <strong>Subject:</strong> ${subject}</p>
      <p>${description}</p>
      <p>Respond from the Grievances tab in the Admin Panel.</p>
    `,
  });

  return ticket;
}

export function listMyTickets(userId) {
  return prisma.ticket.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
  });
}

export function listAllTickets(projectId, status) {
  return prisma.ticket.findMany({
    where: { project_id: projectId, ...(status ? { status } : {}) },
    include: { user: { select: { id: true, name: true, role: true, field: true, email: true } } },
    orderBy: { created_at: "desc" },
  });
}

export async function respondToTicket(projectId, ticketId, { status, admin_response }) {
  const existing = await prisma.ticket.findFirst({
    where: { id: ticketId, project_id: projectId },
    include: { user: true },
  });
  if (!existing) return null;

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      ...(status ? { status } : {}),
      ...(admin_response !== undefined ? { admin_response } : {}),
      ...(status === "resolved" ? { resolved_at: new Date() } : {}),
    },
  });

  if (status === "resolved") {
    await notify(projectId, [existing.user_id], {
      type: "ticket_resolved",
      title: `Your concern "${existing.subject}" was resolved`,
      body: admin_response || "Marked resolved by Admin.",
      link: "/concerns",
      emailHtml: (u) => `
        <p>Hi ${u.name},</p>
        <p>Your concern <strong>"${existing.subject}"</strong> has been marked resolved.</p>
        ${admin_response ? `<p><strong>Admin's response:</strong><br/>${admin_response}</p>` : ""}
        <p>Thanks.</p>
      `,
    });
  }

  return updated;
}

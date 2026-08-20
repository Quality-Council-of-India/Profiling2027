// Admin "send an email on any topic" — resolves a recipient spec down to
// active users' {id, name, email}, and builds a human-readable summary of
// who that was for the sent-history log (see EmailBroadcast).

import { prisma } from "../utils/prisma.js";
import { fieldList } from "../utils/fields.js";

const ROLE_LABELS = {
  admin: "Admin (Core Team)",
  project_lead: "Project Lead",
  casu_lead: "CASU Lead",
  group_anchor: "Group Anchor",
  casu_anchor: "CASU Anchor",
  profiler: "Profiler",
};

export async function resolveRecipients(projectId, recipients) {
  const { scope, role, field, userIds } = recipients;

  if (scope === "all") {
    const users = await prisma.user.findMany({
      where: { project_id: projectId, is_active: true },
      select: { id: true, name: true, email: true },
    });
    return { users, summary: `All active users (${users.length})` };
  }

  if (scope === "role") {
    const users = await prisma.user.findMany({
      where: { project_id: projectId, is_active: true, role },
      select: { id: true, name: true, email: true },
    });
    return { users, summary: `${ROLE_LABELS[role] || role} (${users.length})` };
  }

  if (scope === "field") {
    const users = await prisma.user.findMany({
      where: { project_id: projectId, is_active: true, field: { not: null } },
      select: { id: true, name: true, email: true, field: true },
    });
    const matched = users.filter((u) => fieldList(u.field).includes(field));
    return { users: matched, summary: `${field} field (${matched.length})` };
  }

  if (scope === "users") {
    const ids = (userIds || []).map(Number);
    const users = await prisma.user.findMany({
      where: { project_id: projectId, is_active: true, id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
    return { users, summary: `${users.length} individually selected user${users.length === 1 ? "" : "s"}` };
  }

  throw Object.assign(new Error(`Unknown recipient scope "${scope}"`), { status: 400 });
}

export function broadcastEmailBody(recipientName, bodyHtml) {
  return `
    <p>Hi ${recipientName},</p>
    ${bodyHtml}
    <p>Thanks.</p>
  `;
}

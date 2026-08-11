// Bell-icon notifications — in-app rows plus an email copy, per the "In-app +
// email copy" delivery choice: new ticket -> notify Admin, ticket resolved ->
// notify its filer, week opened/closed -> notify every active non-admin user.
import { prisma } from "../utils/prisma.js";
import { sendMail } from "./mailer.js";
import { ROLES } from "../utils/roles.js";

/** Bulk-creates one notification row per user and emails each of them. Fixed
 * query count regardless of recipient list size (one createMany + one
 * findMany), matching the batching approach used elsewhere for scale. */
export async function notify(projectId, userIds, { type, title, body, link, emailHtml }) {
  if (userIds.length === 0) return;

  await prisma.notification.createMany({
    data: userIds.map((user_id) => ({ project_id: projectId, user_id, type, title, body, link })),
  });

  if (emailHtml) {
    const recipients = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { email: true, name: true },
    });
    await Promise.all(
      recipients.map((u) =>
        sendMail({ to: u.email, subject: title, html: emailHtml(u) }).catch((err) => {
          console.error(`[notifications] Failed to email ${u.email}:`, err.message);
        })
      )
    );
  }
}

/** Every active Admin in the project — the recipient list for new-ticket notifications. */
export async function getAdminIds(projectId) {
  const admins = await prisma.user.findMany({
    where: { project_id: projectId, role: ROLES.ADMIN, is_active: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/** Every active non-admin user — the recipient list for week open/close notifications. */
export async function getActiveNonAdminIds(projectId) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: ROLES.ADMIN } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

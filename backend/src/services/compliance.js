import { prisma } from "../utils/prisma.js";
import { getPendingForUserWeek } from "./evaluations.js";
import { sendMail, reminderEmailBody } from "./mailer.js";

/** Builds the full compliance matrix for a week — §4.4 / replaces the
 * 'Peer and Self Evaluations Track' spreadsheet tab. */
export async function buildComplianceMatrix(projectId, weekId) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: "admin" } },
    orderBy: [{ field: "asc" }, { role: "asc" }, { name: "asc" }],
  });

  const rows = [];
  for (const u of users) {
    const pending = await getPendingForUserWeek(u.id, weekId);
    rows.push({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      field: u.field,
      selfDone: pending.selfDone,
      peersDone: pending.peers.filter((p) => p.done).length,
      peersExpected: pending.peers.length,
      pendingPeers: pending.peers.filter((p) => !p.done).map((p) => p.name),
      completed: pending.completed,
      total: pending.total,
      isCompliant: pending.completed === pending.total,
    });
  }

  const totalExpected = rows.reduce((a, r) => a + r.total, 0);
  const totalReceived = rows.reduce((a, r) => a + r.completed, 0);

  return {
    rows,
    summary: {
      totalProfessionals: rows.length,
      fullyCompliant: rows.filter((r) => r.isCompliant).length,
      selfDone: rows.filter((r) => r.selfDone).length,
      totalExpected,
      totalReceived,
      completionPct: totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 100,
    },
  };
}

/** Emails every non-compliant user their specific pending items. Returns count sent. */
export async function sendComplianceReminders(projectId, weekId, weekLabel) {
  const { rows } = await buildComplianceMatrix(projectId, weekId);
  const nonCompliant = rows.filter((r) => !r.isCompliant);

  let sent = 0;
  for (const r of nonCompliant) {
    try {
      await sendMail({
        to: r.email,
        subject: `Reminder: pending Profiling 2027 feedback submissions — ${weekLabel}`,
        html: reminderEmailBody(
          { name: r.name },
          weekLabel,
          { selfPending: !r.selfDone, peerNames: r.pendingPeers }
        ),
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send reminder to ${r.email}:`, err.message);
    }
  }
  return { remindersSent: sent, nonCompliantCount: nonCompliant.length };
}

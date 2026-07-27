import { prisma } from "../utils/prisma.js";
import { sendMail, reminderEmailBody } from "./mailer.js";

/**
 * Builds the full compliance matrix for a week — §4.4 / replaces the
 * 'Peer and Self Evaluations Track' spreadsheet tab.
 *
 * Batch-oriented: 3 queries total regardless of roster size, rather than
 * looping getPendingForUserWeek() per user (which was 2-3 queries per
 * person — fine at ~60 users, ~2-3000 round trips at ~1000).
 */
export async function buildComplianceMatrix(projectId, weekId) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: "admin" } },
    orderBy: [{ field: "asc" }, { role: "asc" }, { name: "asc" }],
  });
  const userIds = users.map((u) => u.id);

  const [selfEvals, mappings, peerEvalsGiven] = await Promise.all([
    prisma.evaluation.findMany({
      where: { week_id: weekId, eval_type: "self", evaluator_id: { in: userIds } },
      select: { evaluator_id: true },
    }),
    prisma.peerMapping.findMany({
      where: { evaluator_id: { in: userIds } },
      include: { evaluatee: { select: { id: true, name: true } } },
    }),
    prisma.evaluation.findMany({
      where: { week_id: weekId, eval_type: "peer", evaluator_id: { in: userIds } },
      select: { evaluator_id: true, evaluatee_id: true },
    }),
  ]);

  const selfDoneSet = new Set(selfEvals.map((e) => e.evaluator_id));

  const mappingsByEvaluator = new Map();
  for (const m of mappings) {
    if (!mappingsByEvaluator.has(m.evaluator_id)) mappingsByEvaluator.set(m.evaluator_id, []);
    mappingsByEvaluator.get(m.evaluator_id).push(m.evaluatee);
  }

  const doneSetByEvaluator = new Map();
  for (const e of peerEvalsGiven) {
    if (!doneSetByEvaluator.has(e.evaluator_id)) doneSetByEvaluator.set(e.evaluator_id, new Set());
    doneSetByEvaluator.get(e.evaluator_id).add(e.evaluatee_id);
  }

  const rows = users.map((u) => {
    const selfDone = selfDoneSet.has(u.id);
    const evaluatees = mappingsByEvaluator.get(u.id) || [];
    const doneSet = doneSetByEvaluator.get(u.id) || new Set();
    const peers = evaluatees.map((ev) => ({ id: ev.id, name: ev.name, done: doneSet.has(ev.id) }));
    const completed = (selfDone ? 1 : 0) + peers.filter((p) => p.done).length;
    const total = 1 + peers.length;

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      field: u.field,
      selfDone,
      peersDone: peers.filter((p) => p.done).length,
      peersExpected: peers.length,
      pendingPeers: peers.filter((p) => !p.done).map((p) => p.name),
      completed,
      total,
      isCompliant: completed === total,
    };
  });

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

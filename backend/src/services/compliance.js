import { prisma } from "../utils/prisma.js";
import { sendMail, reminderEmailBody, digestEmailBody } from "./mailer.js";

const DIGEST_ROLE_LABELS = {
  profiler: "Profiler",
  group_anchor: "Group Anchor",
  casu_anchor: "CASU Anchor",
  casu_lead: "CASU Lead",
  project_lead: "Project Lead",
};

/**
 * Builds the full compliance matrix for a week — §4.4 / replaces the
 * 'Peer and Self Evaluations Track' spreadsheet tab.
 *
 * Batch-oriented: 3 queries total regardless of roster size, rather than
 * looping getPendingForUserWeek() per user (which was 2-3 queries per
 * person — fine at ~60 users, ~2-3000 round trips at ~1000).
 *
 * weekStatus matters: peer_mappings is a LIVE, global table (fully deleted
 * and rebuilt on every roster import), so it only reflects "who's expected
 * to evaluate whom" for the CURRENTLY open week. Pass weekStatus === "closed"
 * to instead read the frozen peer_mapping_snapshots row for that week (see
 * its schema doc comment) and to base the roster itself on everyone who has
 * a ComputedScore row for that week — not today's active roster — so a
 * later reshuffle can never again silently rewrite an already-closed week's
 * numbers. Callers that need LIVE data regardless of the week's actual
 * status (sendComplianceReminders, sendEndOfDayDigest — nagging people NOW
 * only makes sense against the current mapping) simply don't pass "closed".
 */
export async function buildComplianceMatrix(projectId, weekId, weekStatus) {
  const isClosed = weekStatus === "closed";

  const users = isClosed
    ? (
        await prisma.computedScore.findMany({
          where: { week_id: weekId, user: { project_id: projectId, role: { not: "admin" } } },
          include: { user: { select: { id: true, name: true, email: true, role: true, field: true } } },
        })
      )
        .map((s) => ({ ...s.user, field: s.field ?? s.user.field }))
        .sort(
          (a, b) => (a.field || "").localeCompare(b.field || "") || a.role.localeCompare(b.role) || a.name.localeCompare(b.name)
        )
    : await prisma.user.findMany({
        where: { project_id: projectId, is_active: true, role: { not: "admin" } },
        orderBy: [{ field: "asc" }, { role: "asc" }, { name: "asc" }],
      });
  const userIds = users.map((u) => u.id);

  const [selfEvals, mappings, peerEvalsGiven] = await Promise.all([
    prisma.evaluation.findMany({
      where: { week_id: weekId, eval_type: "self", evaluator_id: { in: userIds } },
      select: { evaluator_id: true },
    }),
    isClosed
      ? prisma.peerMappingSnapshot.findMany({
          where: { week_id: weekId, evaluator_id: { in: userIds } },
          include: { evaluatee: { select: { id: true, name: true } } },
        })
      : prisma.peerMapping.findMany({
          where: { evaluator_id: { in: userIds } },
          include: { evaluatee: { select: { id: true, name: true } } },
        }),
    prisma.evaluation.findMany({
      where: { week_id: weekId, eval_type: "peer", evaluator_id: { in: userIds } },
      select: { evaluator_id: true, evaluatee_id: true },
    }),
  ]);

  // A closed week with no frozen snapshot at all (shouldn't happen going
  // forward — closeWeek always writes one — but could for a week closed
  // before this snapshot mechanism existed) has no trustworthy mapping data
  // to fall back to; flag it rather than silently showing 0-expected rows.
  const mappingDataAvailable = !isClosed || mappings.length > 0 || userIds.length === 0;

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
      peers, // [{ id, name, done }] — who's been evaluated vs still pending, by name
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
    mappingDataAvailable,
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
export async function sendComplianceReminders(projectId, weekId, weekLabel, weekEndDate) {
  const { rows } = await buildComplianceMatrix(projectId, weekId);
  const nonCompliant = rows.filter((r) => !r.isCompliant);

  // Week windows vary (3-4 days, and don't always start on the same day of
  // the week) — daysLeft is computed from this week's own end_date rather
  // than assumed, so the reminder is accurate regardless of how long this
  // particular window is or when it started.
  const daysLeft = weekEndDate
    ? Math.max(0, Math.ceil((new Date(weekEndDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  let sent = 0;
  for (const r of nonCompliant) {
    try {
      await sendMail({
        to: r.email,
        subject: `Reminder: pending Profiling 2027 feedback submissions — ${weekLabel}`,
        html: reminderEmailBody(
          { name: r.name },
          weekLabel,
          { selfPending: !r.selfDone, peerNames: r.pendingPeers },
          daysLeft
        ),
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send reminder to ${r.email}:`, err.message);
    }
  }
  return { remindersSent: sent, nonCompliantCount: nonCompliant.length };
}

/**
 * End-of-day (~19:30 IST) visibility digest for Admins/Project Leads/CASU
 * Leads — who in their scope still has pending submissions for the open
 * week. Each group only sees their own remit:
 *   Admin         -> everyone
 *   Project Lead  -> Profilers, Group Anchors, and Project Leads (incl. themselves)
 *   CASU Lead     -> CASU Anchors and CASU Leads (incl. themselves)
 */
export async function sendEndOfDayDigest(projectId, weekId, weekLabel) {
  const { rows } = await buildComplianceMatrix(projectId, weekId);
  const nonCompliant = rows.filter((r) => !r.isCompliant);

  const [admins, projectLeads, casuLeads] = await Promise.all([
    prisma.user.findMany({ where: { project_id: projectId, role: "admin", is_active: true } }),
    prisma.user.findMany({ where: { project_id: projectId, role: "project_lead", is_active: true } }),
    prisma.user.findMany({ where: { project_id: projectId, role: "casu_lead", is_active: true } }),
  ]);

  const scopes = [
    { recipients: admins, allowedRoles: null, scopeLabel: null },
    {
      recipients: projectLeads,
      allowedRoles: ["profiler", "group_anchor", "project_lead"],
      scopeLabel: "Profilers, Group Anchors & Project Leads",
    },
    {
      recipients: casuLeads,
      allowedRoles: ["casu_anchor", "casu_lead"],
      scopeLabel: "CASU Anchors & CASU Leads",
    },
  ];

  let sent = 0;
  for (const { recipients, allowedRoles, scopeLabel } of scopes) {
    if (recipients.length === 0) continue;
    const scopedRows = (allowedRoles ? nonCompliant.filter((r) => allowedRoles.includes(r.role)) : nonCompliant).map(
      (r) => ({
        name: r.name,
        roleLabel: DIGEST_ROLE_LABELS[r.role] || r.role,
        selfPending: !r.selfDone,
        pendingPeers: r.pendingPeers,
      })
    );

    for (const recipient of recipients) {
      try {
        await sendMail({
          to: recipient.email,
          subject: `End-of-day update: ${scopedRows.length} pending submission${scopedRows.length === 1 ? "" : "s"} — ${weekLabel}`,
          html: digestEmailBody(recipient.name, weekLabel, scopedRows, scopeLabel),
        });
        sent++;
      } catch (err) {
        console.error(`Failed to send EOD digest to ${recipient.email}:`, err.message);
      }
    }
  }
  return { digestsSent: sent };
}

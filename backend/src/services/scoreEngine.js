// Score Computation Engine — Technical Spec §4.3.
// Handles self-scoring, the three peer-evaluation sub-cases, and the SAPA factor.
// Recomputed synchronously whenever an evaluation is submitted, and can be
// re-run in bulk via computeScoresForWeek().
//
// computeScoresForWeek() is batch-oriented by design: at ~1000 users, doing
// 3 queries per user sequentially (the old approach) means ~3000 round trips
// to close a single week. Instead it fetches every evaluation/mapping for
// the week ONCE, computes all rows in memory, and writes them in a single
// multi-row upsert — a fixed number of queries regardless of user count.

import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { PARAMS } from "../utils/constants.js";

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Pure scoring math, shared by the single-user and batch code paths. */
function computeRow({ weekId, userId, field, selfEval, peerEvals, expectedPeerCount }) {
  const selfScores = {};
  let totalSelf = 0;
  for (const p of PARAMS) {
    const v = selfEval ? selfEval[p] : 0;
    selfScores[p] = v;
    totalSelf += v;
  }

  const peerScores = {};
  let totalPeer = 0;
  const peerCount = peerEvals.length;
  for (const p of PARAMS) {
    const avg = peerCount > 0 ? peerEvals.reduce((sum, e) => sum + e[p], 0) / peerCount : 0;
    peerScores[p] = round2(avg);
    totalPeer += peerScores[p];
  }
  totalPeer = round2(totalPeer);

  const sapaFactor = totalSelf > 0 && totalPeer > 0 ? round2(totalSelf / totalPeer) : null;

  const row = { week_id: weekId, user_id: userId, field: field ?? null };
  for (const p of PARAMS) {
    row[`${p}_self`] = selfScores[p];
    row[`${p}_peer`] = peerScores[p];
  }
  row.total_self = totalSelf;
  row.total_peer = totalPeer;
  row.peer_count = peerCount;
  row.expected_peer_count = expectedPeerCount;
  row.sapa_factor = sapaFactor;
  return row;
}

/** Computes and upserts the computed_scores row for one user in one week. */
export async function computeScoresForUserWeek(weekId, userId) {
  const [user, selfEval, peerEvals, expectedPeerCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { field: true } }),
    prisma.evaluation.findUnique({
      where: {
        week_id_evaluator_id_evaluatee_id_eval_type: {
          week_id: weekId,
          evaluator_id: userId,
          evaluatee_id: userId,
          eval_type: "self",
        },
      },
    }),
    prisma.evaluation.findMany({
      where: { week_id: weekId, evaluatee_id: userId, eval_type: "peer" },
    }),
    prisma.peerMapping.count({ where: { evaluatee_id: userId } }),
  ]);

  const row = computeRow({ weekId, userId, field: user?.field, selfEval, peerEvals, expectedPeerCount });

  return prisma.computedScore.upsert({
    where: { week_id_user_id: { week_id: weekId, user_id: userId } },
    create: row,
    update: { ...row, computed_at: new Date() },
  });
}

/** Bulk-writes computed_scores rows in a single round trip via multi-row upsert. */
async function upsertComputedScoresBatch(rows) {
  if (rows.length === 0) return;

  // Column names are drawn from the internal PARAMS constant, never from
  // request input, so interpolating them directly (rather than as bound
  // params, which Postgres doesn't allow for identifiers) is safe.
  const scoreColumns = PARAMS.flatMap((p) => [`${p}_self`, `${p}_peer`]);
  const allColumns = ["week_id", "user_id", "field", ...scoreColumns, "total_self", "total_peer", "peer_count", "expected_peer_count", "sapa_factor", "computed_at"];

  const valueRows = rows.map((r) => {
    const values = [
      r.week_id,
      r.user_id,
      r.field,
      ...scoreColumns.map((c) => r[c]),
      r.total_self,
      r.total_peer,
      r.peer_count,
      r.expected_peer_count,
      r.sapa_factor,
    ];
    return Prisma.sql`(${Prisma.join(values)}, now())`;
  });

  const updateSet = Prisma.join(
    ["field", ...scoreColumns, "total_self", "total_peer", "peer_count", "expected_peer_count", "sapa_factor", "computed_at"].map(
      (c) => Prisma.raw(`"${c}" = EXCLUDED."${c}"`)
    )
  );

  await prisma.$executeRaw`
    INSERT INTO "computed_scores" (${Prisma.join(allColumns.map((c) => Prisma.raw(`"${c}"`)))})
    VALUES ${Prisma.join(valueRows)}
    ON CONFLICT (week_id, user_id) DO UPDATE SET ${updateSet}
  `;
}

/**
 * Recomputes scores for every active user in a project for a given week.
 * Fixed query count regardless of roster size: 3 reads + 1 bulk write.
 */
export async function computeScoresForWeek(weekId, projectId) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: "admin" } },
    select: { id: true, field: true },
  });
  if (users.length === 0) return [];
  const userIds = users.map((u) => u.id);
  const fieldByUser = new Map(users.map((u) => [u.id, u.field]));

  const [selfEvals, peerEvals, mappingCounts] = await Promise.all([
    prisma.evaluation.findMany({
      where: { week_id: weekId, eval_type: "self", evaluatee_id: { in: userIds } },
    }),
    prisma.evaluation.findMany({
      where: { week_id: weekId, eval_type: "peer", evaluatee_id: { in: userIds } },
    }),
    prisma.peerMapping.groupBy({
      by: ["evaluatee_id"],
      where: { evaluatee_id: { in: userIds } },
      _count: { _all: true },
    }),
  ]);

  const selfByUser = new Map(selfEvals.map((e) => [e.evaluatee_id, e]));
  const peersByUser = new Map();
  for (const e of peerEvals) {
    if (!peersByUser.has(e.evaluatee_id)) peersByUser.set(e.evaluatee_id, []);
    peersByUser.get(e.evaluatee_id).push(e);
  }
  const expectedByUser = new Map(mappingCounts.map((m) => [m.evaluatee_id, m._count._all]));

  const rows = userIds.map((userId) =>
    computeRow({
      weekId,
      userId,
      field: fieldByUser.get(userId),
      selfEval: selfByUser.get(userId) || null,
      peerEvals: peersByUser.get(userId) || [],
      expectedPeerCount: expectedByUser.get(userId) || 0,
    })
  );

  await upsertComputedScoresBatch(rows);
  return rows;
}

export { PARAMS };

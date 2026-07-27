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

const PARAMS = ["sincerity", "team_spirit", "knowledge", "quantity", "quality"];

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Pure scoring math, shared by the single-user and batch code paths. */
function computeRow({ weekId, userId, selfEval, peerEvals, expectedPeerCount }) {
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

  return {
    week_id: weekId,
    user_id: userId,
    sincerity_self: selfScores.sincerity,
    sincerity_peer: peerScores.sincerity,
    team_spirit_self: selfScores.team_spirit,
    team_spirit_peer: peerScores.team_spirit,
    knowledge_self: selfScores.knowledge,
    knowledge_peer: peerScores.knowledge,
    quantity_self: selfScores.quantity,
    quantity_peer: peerScores.quantity,
    quality_self: selfScores.quality,
    quality_peer: peerScores.quality,
    total_self: totalSelf,
    total_peer: totalPeer,
    peer_count: peerCount,
    expected_peer_count: expectedPeerCount,
    sapa_factor: sapaFactor,
  };
}

/** Computes and upserts the computed_scores row for one user in one week. */
export async function computeScoresForUserWeek(weekId, userId) {
  const [selfEval, peerEvals, expectedPeerCount] = await Promise.all([
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

  const row = computeRow({ weekId, userId, selfEval, peerEvals, expectedPeerCount });

  return prisma.computedScore.upsert({
    where: { week_id_user_id: { week_id: weekId, user_id: userId } },
    create: row,
    update: { ...row, computed_at: new Date() },
  });
}

/** Bulk-writes computed_scores rows in a single round trip via multi-row upsert. */
async function upsertComputedScoresBatch(rows) {
  if (rows.length === 0) return;

  const valueRows = rows.map(
    (r) => Prisma.sql`(
      ${r.week_id}, ${r.user_id},
      ${r.sincerity_self}, ${r.sincerity_peer},
      ${r.team_spirit_self}, ${r.team_spirit_peer},
      ${r.knowledge_self}, ${r.knowledge_peer},
      ${r.quantity_self}, ${r.quantity_peer},
      ${r.quality_self}, ${r.quality_peer},
      ${r.total_self}, ${r.total_peer},
      ${r.peer_count}, ${r.expected_peer_count},
      ${r.sapa_factor}, now()
    )`
  );

  await prisma.$executeRaw`
    INSERT INTO "computed_scores" (
      week_id, user_id,
      sincerity_self, sincerity_peer,
      team_spirit_self, team_spirit_peer,
      knowledge_self, knowledge_peer,
      quantity_self, quantity_peer,
      quality_self, quality_peer,
      total_self, total_peer,
      peer_count, expected_peer_count,
      sapa_factor, computed_at
    )
    VALUES ${Prisma.join(valueRows)}
    ON CONFLICT (week_id, user_id) DO UPDATE SET
      sincerity_self = EXCLUDED.sincerity_self,
      sincerity_peer = EXCLUDED.sincerity_peer,
      team_spirit_self = EXCLUDED.team_spirit_self,
      team_spirit_peer = EXCLUDED.team_spirit_peer,
      knowledge_self = EXCLUDED.knowledge_self,
      knowledge_peer = EXCLUDED.knowledge_peer,
      quantity_self = EXCLUDED.quantity_self,
      quantity_peer = EXCLUDED.quantity_peer,
      quality_self = EXCLUDED.quality_self,
      quality_peer = EXCLUDED.quality_peer,
      total_self = EXCLUDED.total_self,
      total_peer = EXCLUDED.total_peer,
      peer_count = EXCLUDED.peer_count,
      expected_peer_count = EXCLUDED.expected_peer_count,
      sapa_factor = EXCLUDED.sapa_factor,
      computed_at = EXCLUDED.computed_at
  `;
}

/**
 * Recomputes scores for every active user in a project for a given week.
 * Fixed query count regardless of roster size: 3 reads + 1 bulk write.
 */
export async function computeScoresForWeek(weekId, projectId) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: "admin" } },
    select: { id: true },
  });
  if (users.length === 0) return [];
  const userIds = users.map((u) => u.id);

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
      selfEval: selfByUser.get(userId) || null,
      peerEvals: peersByUser.get(userId) || [],
      expectedPeerCount: expectedByUser.get(userId) || 0,
    })
  );

  await upsertComputedScoresBatch(rows);
  return rows;
}

export { PARAMS };

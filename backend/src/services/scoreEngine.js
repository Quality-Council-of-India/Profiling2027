// Score Computation Engine — Technical Spec §4.3.
// Handles self-scoring, the three peer-evaluation sub-cases, and the SAPA factor.
// Recomputed synchronously whenever an evaluation is submitted, and can be
// re-run in bulk via computeScoresForWeek().

import { prisma } from "../utils/prisma.js";

const PARAMS = ["sincerity", "team_spirit", "knowledge", "quantity", "quality"];

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Computes and upserts the computed_scores row for one user in one week.
 * §4.3.1 Self-Evaluation: direct scores, or all-zero if not submitted.
 * §4.3.2 Peer-Evaluation: averaged across however many peers responded
 *        (sub-cases 1/2/3 all collapse into "average of n, or 0 if n=0").
 * §4.3.3 SAPA Factor: total_self / total_peer, only when both are non-zero.
 */
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

  return prisma.computedScore.upsert({
    where: { week_id_user_id: { week_id: weekId, user_id: userId } },
    create: {
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
    },
    update: {
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
      computed_at: new Date(),
    },
  });
}

/** Recomputes scores for every active user in a project for a given week. */
export async function computeScoresForWeek(weekId, projectId) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: "admin" } },
    select: { id: true },
  });
  const results = [];
  for (const u of users) {
    results.push(await computeScoresForUserWeek(weekId, u.id));
  }
  return results;
}

export { PARAMS };

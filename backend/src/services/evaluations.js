import { prisma } from "../utils/prisma.js";

function tagFrequency(evals, field) {
  const freq = {};
  for (const e of evals) {
    for (const tag of e[field] || []) {
      freq[tag] = (freq[tag] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Subjective (Questionnaire Part II) aggregation for one user in one week —
 * §4.3.4. Peer remarks are anonymised (no evaluator identity returned).
 */
export async function getSubjectiveSummary(weekId, userId) {
  const [selfEval, peerEvals] = await Promise.all([
    prisma.evaluation.findFirst({
      where: { week_id: weekId, evaluatee_id: userId, eval_type: "self" },
    }),
    prisma.evaluation.findMany({
      where: { week_id: weekId, evaluatee_id: userId, eval_type: "peer" },
      select: {
        problem_solving: true,
        problem_reason: true,
        strengths_tags: true,
        weakness_tags: true,
        strength_comment: true,
        weakness_comment: true,
      },
    }),
  ]);

  return {
    self: selfEval
      ? {
          problem_solving: selfEval.problem_solving,
          problem_reason: selfEval.problem_reason,
          strengths_tags: selfEval.strengths_tags,
          weakness_tags: selfEval.weakness_tags,
          strength_comment: selfEval.strength_comment,
          weakness_comment: selfEval.weakness_comment,
        }
      : null,
    peer: {
      responseCount: peerEvals.length,
      problemSolving: {
        satisfied: peerEvals.filter((e) => e.problem_solving === "satisfied").length,
        not_satisfied: peerEvals.filter((e) => e.problem_solving === "not_satisfied").length,
      },
      strengthsFrequency: tagFrequency(peerEvals, "strengths_tags"),
      weaknessFrequency: tagFrequency(peerEvals, "weakness_tags"),
      strengthComments: peerEvals.map((e) => e.strength_comment).filter(Boolean),
      weaknessComments: peerEvals.map((e) => e.weakness_comment).filter(Boolean),
      problemReasons: peerEvals.map((e) => e.problem_reason).filter(Boolean),
    },
  };
}

/**
 * Builds the "pending evaluations" view for one user in one week:
 * self-eval status + which mapped peers still need to be evaluated.
 * Backs both GET /api/weeks/:id/status and GET /api/evaluations/pending.
 */
export async function getPendingForUserWeek(userId, weekId) {
  const [selfEval, mappings, peerEvalsGiven] = await Promise.all([
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
    prisma.peerMapping.findMany({
      where: { evaluator_id: userId },
      include: { evaluatee: { select: { id: true, name: true, role: true, field: true } } },
    }),
    prisma.evaluation.findMany({
      where: { week_id: weekId, evaluator_id: userId, eval_type: "peer" },
      select: { evaluatee_id: true, locked: true },
    }),
  ]);

  const lockedByEvaluatee = new Map(peerEvalsGiven.map((e) => [e.evaluatee_id, e.locked]));
  const peers = mappings.map((m) => ({
    id: m.evaluatee.id,
    name: m.evaluatee.name,
    role: m.evaluatee.role,
    field: m.evaluatee.field,
    done: lockedByEvaluatee.has(m.evaluatee.id),
    locked: lockedByEvaluatee.get(m.evaluatee.id) ?? false,
  }));

  return {
    selfDone: !!selfEval,
    selfLocked: selfEval?.locked ?? false,
    peers,
    completed: (selfEval ? 1 : 0) + peers.filter((p) => p.done).length,
    total: 1 + peers.length,
  };
}

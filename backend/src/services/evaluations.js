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

function formatProblemSolving(value) {
  if (value === "satisfied") return "Satisfied";
  if (value === "not_satisfied") return "Not Satisfied";
  return "";
}

/** "Tag (count)" formatting shared by the weekly and combined sheet exports. */
function formatTagFrequency(freq) {
  return freq.map(({ tag, count }) => `${tag} (${count})`).join(", ");
}

/**
 * Batch subjective aggregation for every given user in one week — backs the
 * Week Scoresheet / Combined Score Sheet exports (§4.6.05). Two queries
 * regardless of roster size, rather than getSubjectiveSummary() per user.
 * Peer remarks are concatenated one-per-line (matches the original
 * 'Scores for Week XX' spreadsheet's TEXTJOIN formula) rather than
 * summarised, so every individual's wording survives intact. Tag arrays are
 * additionally exposed raw (unformatted) so the Combined Score Sheet can sum
 * frequencies across every week rather than repeating this week's counts.
 */
export async function getSubjectiveSummaryBatch(weekId, userIds) {
  const [selfEvals, peerEvals] = await Promise.all([
    prisma.evaluation.findMany({
      where: { week_id: weekId, eval_type: "self", evaluatee_id: { in: userIds } },
      select: {
        evaluatee_id: true,
        problem_solving: true,
        problem_reason: true,
        strength_comment: true,
        weakness_comment: true,
        strengths_tags: true,
        weakness_tags: true,
      },
    }),
    prisma.evaluation.findMany({
      where: { week_id: weekId, eval_type: "peer", evaluatee_id: { in: userIds } },
      select: {
        evaluatee_id: true,
        problem_solving: true,
        problem_reason: true,
        strength_comment: true,
        weakness_comment: true,
        strengths_tags: true,
        weakness_tags: true,
      },
    }),
  ]);

  const selfByUser = new Map(selfEvals.map((e) => [e.evaluatee_id, e]));
  const peersByUser = new Map();
  for (const e of peerEvals) {
    if (!peersByUser.has(e.evaluatee_id)) peersByUser.set(e.evaluatee_id, []);
    peersByUser.get(e.evaluatee_id).push(e);
  }

  const result = new Map();
  for (const userId of userIds) {
    const self = selfByUser.get(userId);
    const peers = peersByUser.get(userId) || [];
    const satisfied = peers.filter((p) => p.problem_solving === "satisfied").length;
    const notSatisfied = peers.filter((p) => p.problem_solving === "not_satisfied").length;
    const peerStrengthsFrequency = tagFrequency(peers, "strengths_tags");
    const peerWeaknessFrequency = tagFrequency(peers, "weakness_tags");
    const selfStrengthsTagsRaw = self?.strengths_tags || [];
    const selfWeaknessTagsRaw = self?.weakness_tags || [];

    result.set(userId, {
      selfProblemSolving: self ? formatProblemSolving(self.problem_solving) : "",
      selfProblemReason: self?.problem_solving === "not_satisfied" ? self.problem_reason || "" : "",
      selfStrength: self?.strength_comment || "",
      selfWeakness: self?.weakness_comment || "",
      selfStrengthsTags: formatTagFrequency(tagFrequency(self ? [self] : [], "strengths_tags")),
      selfWeaknessTags: formatTagFrequency(tagFrequency(self ? [self] : [], "weakness_tags")),
      selfStrengthsTagsRaw,
      selfWeaknessTagsRaw,
      peerProblemSolving: peers.length ? `Satisfied: ${satisfied} | Not Satisfied: ${notSatisfied}` : "",
      peerSatisfiedCount: satisfied,
      peerNotSatisfiedCount: notSatisfied,
      peerProblemReason: peers
        .filter((p) => p.problem_solving === "not_satisfied")
        .map((p) => p.problem_reason)
        .filter(Boolean)
        .join("\n"),
      peerStrength: peers.map((p) => p.strength_comment).filter(Boolean).join("\n"),
      peerWeakness: peers.map((p) => p.weakness_comment).filter(Boolean).join("\n"),
      peerStrengthsTags: formatTagFrequency(peerStrengthsFrequency),
      peerWeaknessTags: formatTagFrequency(peerWeaknessFrequency),
      peerStrengthsFrequency,
      peerWeaknessFrequency,
    });
  }
  return result;
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

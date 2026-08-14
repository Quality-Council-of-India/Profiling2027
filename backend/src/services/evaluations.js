import { prisma } from "../utils/prisma.js";
import { TRAJECTORY_LABELS } from "../utils/constants.js";

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
        trajectory: true,
        strengths_tags: true,
        weakness_tags: true,
        improvement_suggestion: true,
      },
    }),
  ]);

  return {
    self: selfEval
      ? {
          trajectory: selfEval.trajectory,
          strengths_tags: selfEval.strengths_tags,
          weakness_tags: selfEval.weakness_tags,
          improvement_suggestion: selfEval.improvement_suggestion,
        }
      : null,
    peer: {
      responseCount: peerEvals.length,
      trajectory: {
        improved: peerEvals.filter((e) => e.trajectory === "improved").length,
        stayed_same: peerEvals.filter((e) => e.trajectory === "stayed_same").length,
        declined: peerEvals.filter((e) => e.trajectory === "declined").length,
        not_applicable: peerEvals.filter((e) => e.trajectory === "not_applicable").length,
      },
      strengthsFrequency: tagFrequency(peerEvals, "strengths_tags"),
      weaknessFrequency: tagFrequency(peerEvals, "weakness_tags"),
      improvementSuggestions: peerEvals.map((e) => e.improvement_suggestion).filter(Boolean),
    },
  };
}

function formatTrajectory(value) {
  return TRAJECTORY_LABELS[value] || "";
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
        trajectory: true,
        improvement_suggestion: true,
        strengths_tags: true,
        weakness_tags: true,
      },
    }),
    prisma.evaluation.findMany({
      where: { week_id: weekId, eval_type: "peer", evaluatee_id: { in: userIds } },
      select: {
        evaluatee_id: true,
        trajectory: true,
        improvement_suggestion: true,
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
    const peerImprovedCount = peers.filter((p) => p.trajectory === "improved").length;
    const peerStayedSameCount = peers.filter((p) => p.trajectory === "stayed_same").length;
    const peerDeclinedCount = peers.filter((p) => p.trajectory === "declined").length;
    const peerNotApplicableCount = peers.filter((p) => p.trajectory === "not_applicable").length;
    const peerStrengthsFrequency = tagFrequency(peers, "strengths_tags");
    const peerWeaknessFrequency = tagFrequency(peers, "weakness_tags");
    const selfStrengthsTagsRaw = self?.strengths_tags || [];
    const selfWeaknessTagsRaw = self?.weakness_tags || [];

    result.set(userId, {
      selfTrajectory: self ? formatTrajectory(self.trajectory) : "",
      selfTrajectoryRaw: self?.trajectory || null,
      selfSuggestion: self?.improvement_suggestion || "",
      selfStrengthsTags: formatTagFrequency(tagFrequency(self ? [self] : [], "strengths_tags")),
      selfWeaknessTags: formatTagFrequency(tagFrequency(self ? [self] : [], "weakness_tags")),
      selfStrengthsTagsRaw,
      selfWeaknessTagsRaw,
      peerTrajectory: peers.length
        ? [
            peerImprovedCount ? `Improved: ${peerImprovedCount}` : null,
            peerStayedSameCount ? `Stayed the Same: ${peerStayedSameCount}` : null,
            peerDeclinedCount ? `Declined: ${peerDeclinedCount}` : null,
            peerNotApplicableCount ? `Not Applicable: ${peerNotApplicableCount}` : null,
          ]
            .filter(Boolean)
            .join(" | ")
        : "",
      peerImprovedCount,
      peerStayedSameCount,
      peerDeclinedCount,
      peerNotApplicableCount,
      peerSuggestions: peers.map((p) => p.improvement_suggestion).filter(Boolean).join("\n"),
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

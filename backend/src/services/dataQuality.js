// Admin-only "Data Quality" review queue — peer evaluation submissions with
// internal signs of being low-effort or self-contradictory, surfaced for a
// human to look at. This never auto-corrects, excludes, or re-weights
// anything in scoring — it's purely a review list, same spirit as the
// existing Trajectory Mismatch feature.

import { prisma } from "../utils/prisma.js";
import { PARAM_FIELDS } from "../utils/constants.js";
import { tokenizeSuggestion, isNonSubstantive } from "./analytics.js";

// Curated pairs of (strength tag, weakness tag) that describe the SAME
// underlying thing from opposite directions — selecting both in one
// submission is a direct self-contradiction, not just two independent
// opinions. Two plausible-looking pairs were deliberately left out after
// checking them against real Week 1-5 submissions — "Is supportive and a
// team player" + "Needs to be more available and responsive to the team",
// and "Takes full ownership of work" + "Needs to maintain better focus and
// discipline at work" — both turned out to describe genuinely compatible,
// real feedback (e.g. a friendly teammate who's slow to reply) rather than
// a contradiction, and including them produced obvious false positives.
const CONTRADICTORY_TAG_PAIRS = [
  ["Manages work efficiently and consistently meets deadlines", "Needs to improve time management and meet deadlines"],
  ["Delivers high-quality work", "Needs to increase attention to detail to improve work quality"],
  ["Communicates clearly and is approachable", "Needs to improve communication skills"],
  ["Has strong project knowledge", "Needs to deepen understanding of project concepts"],
  ["Shows initiative and works proactively", "Needs to take more initiative and work with greater autonomy"],
  ["Shows strong leadership", "Needs to improve team management and be unbiased in the team"],
  ["Receptive to feedback and is a quick learner", "Needs to be more receptive to constructive feedback"],
  ["Good with Excel and other technical skills", "Needs to work on Excel and Analytical skills"],
  ["Adapts well to changing requirements", "Needs to adapt better to changing priorities"],
];

// A perfectly flat score across all 7 parameters, sitting at the very
// bottom of the 1-7 scale, reads as "clicked the same low button 7 times"
// rather than considered per-parameter judgment. A flat score higher up
// the scale (4, 5, 6, 7) is far too common in real data (over 40% of all
// submissions) to mean anything on its own — this only fires at the floor.
const FLOOR_FLAT_MAX_VALUE = 2;

// Near the scale's floor/ceiling (out of 49) but claiming the opposite
// direction of travel is a strong, rare signal in real data (0.3% of
// submissions) — someone whose peer just gave them a near-worst-possible
// score isn't plausibly "Improved" relative to whatever came before.
const MISMATCH_LOW_TOTAL = 10;
const MISMATCH_HIGH_TOTAL = 46;

function detectSignals(row) {
  const scores = PARAM_FIELDS.map((p) => row[p.key]);
  const total = scores.reduce((a, b) => a + b, 0);

  const floorFlat = new Set(scores).size === 1 && scores[0] <= FLOOR_FLAT_MAX_VALUE;

  const strengthTags = new Set(row.strengths_tags);
  const weaknessTags = new Set(row.weakness_tags);
  const contradictoryPair =
    CONTRADICTORY_TAG_PAIRS.find(([s, w]) => strengthTags.has(s) && weaknessTags.has(w)) || null;

  const mismatch =
    (total <= MISMATCH_LOW_TOTAL && row.trajectory === "improved") ||
    (total >= MISMATCH_HIGH_TOTAL && row.trajectory === "declined");

  const text = row.improvement_suggestion;
  const junkSuggestion = !text || isNonSubstantive(tokenizeSuggestion(text));

  return { floorFlat, contradictoryPair, mismatch, junkSuggestion, total };
}

// Which of the 3 strong signals a `?signal=` filter value corresponds to —
// "any" (default) means "at least one", matching the base flagging rule.
const SIGNAL_FILTER_KEYS = {
  floorFlat: (s) => s.floorFlat,
  contradictoryPair: (s) => !!s.contradictoryPair,
  mismatch: (s) => s.mismatch,
};

/**
 * Returns every evaluation of the given type (peer by default; optionally
 * narrowed to one week, and/or filtered by evaluator/evaluatee name, role,
 * field, or which specific signal fired) with at least one of the 3
 * "strong" signals — a floor-flat score, a contradictory strength/weakness
 * tag pair, or an extreme-score/trajectory mismatch. A non-substantive
 * improvement suggestion never triggers a flag by itself (too common —
 * ~46% of ALL submissions — to mean much alone), but is reported as
 * corroborating context once a strong signal has already fired.
 * Calibrated against this project's real Week 1-5 data: this threshold
 * flags ~6.7% of real peer-evaluation submissions.
 *
 * For a self-evaluation, evaluator and evaluatee are the same person
 * (see evaluations.controller.js) — the signals themselves are generic to
 * any evaluation row and need no special-casing, only the frontend's
 * display differs (a self row shows one person, not "A -> B").
 */
export async function getDataQualityFlags(projectId, weekId, evalType = "peer", filters = {}) {
  const { name, role, field, signal } = filters;
  const personMatch = (extra) => ({
    ...(name ? { name: { contains: name, mode: "insensitive" } } : {}),
    ...(role ? { role } : {}),
    ...(field ? { field } : {}),
    ...extra,
  });
  const personFilterActive = Boolean(name || role || field);

  const rows = await prisma.evaluation.findMany({
    where: {
      eval_type: evalType,
      week: { project_id: projectId, ...(weekId ? { id: weekId } : {}) },
      ...(personFilterActive
        ? { OR: [{ evaluator: personMatch() }, { evaluatee: personMatch() }] }
        : {}),
    },
    include: {
      week: { select: { id: true, label: true, week_number: true } },
      evaluator: { select: { id: true, name: true, role: true, field: true } },
      evaluatee: { select: { id: true, name: true, role: true, field: true } },
    },
    orderBy: { submitted_at: "desc" },
  });

  const signalFilter = signal && signal !== "any" ? SIGNAL_FILTER_KEYS[signal] : null;

  const flagged = [];
  for (const row of rows) {
    const signals = detectSignals(row);
    const strongSignalCount = [signals.floorFlat, !!signals.contradictoryPair, signals.mismatch].filter(
      Boolean
    ).length;
    if (strongSignalCount === 0) continue;
    if (signalFilter && !signalFilter(signals)) continue;

    flagged.push({
      id: row.id,
      eval_type: row.eval_type,
      week: row.week,
      evaluator: row.evaluator,
      evaluatee: row.evaluatee,
      scores: Object.fromEntries(PARAM_FIELDS.map((p) => [p.key, row[p.key]])),
      total: signals.total,
      trajectory: row.trajectory,
      strengths_tags: row.strengths_tags,
      weakness_tags: row.weakness_tags,
      improvement_suggestion: row.improvement_suggestion,
      submitted_at: row.submitted_at,
      signals: {
        floorFlat: signals.floorFlat,
        contradictoryPair: signals.contradictoryPair,
        mismatch: signals.mismatch,
        junkSuggestion: signals.junkSuggestion,
      },
      strongSignalCount,
    });
  }

  flagged.sort(
    (a, b) => b.strongSignalCount - a.strongSignalCount || new Date(b.submitted_at) - new Date(a.submitted_at)
  );

  return { flagged, totalSubmissionsChecked: rows.length };
}

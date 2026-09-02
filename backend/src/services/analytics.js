// Admin Analytics Dashboard — Technical Spec §4.6.
import { prisma } from "../utils/prisma.js";
import { roleFilterForScope, analyticsScope } from "./access.js";
import { ROLES } from "../utils/roles.js";
import { PARAM_FIELDS, WEAKNESS_TAGS } from "../utils/constants.js";
import { fieldList, sharesField } from "../utils/fields.js";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Who counts for a week-scoped analytics query: anyone currently active
 * (as before), PLUS anyone who has since been deactivated/reshuffled away
 * but has at least one ComputedScore row in the selected week(s) — a
 * closed week's stats shouldn't lose someone's contribution just because
 * they're no longer on the team today. Someone with no ComputedScore row
 * in range (e.g. a brand-new hire viewing a week before they joined) is
 * still correctly excluded by each function's own "scores.length === 0 ->
 * skip" check, unchanged.
 */
function activeOrScoredWhere(weekIds) {
  return { OR: [{ is_active: true }, { computedScores: { some: { week_id: { in: weekIds } } } }] };
}

/**
 * A user's field for a week-scoped display: for a SINGLE selected week,
 * the field frozen on that week's ComputedScore row (accurate even after a
 * later reshuffle) if one was recorded, falling back to the user's current
 * field for rows computed before that snapshot column existed. For
 * multiple selected weeks (including "Cumulative"), deliberately still the
 * user's CURRENT field — same reconciliation tradeoff getFieldStandings
 * has always used: a multi-week average doesn't have to decide which of
 * several historical field names to file one person's blended score under.
 */
function effectiveField(user, weekIds) {
  if (weekIds.length === 1) {
    const score = user.computedScores.find((s) => s.week_id === weekIds[0]);
    if (score?.field) return score.field;
  }
  return user.field;
}

/**
 * Optional field narrowing for the Team-Wide Analytics cards that support
 * it — an Admin/Lead picking one field out of the dropdown. Filtered on
 * each user's effectiveField() (the same historical-vs-live resolution
 * every other per-week field lookup uses), not a raw Prisma `where`,
 * since a CASU Anchor's field can be a comma-joined multi-field string.
 * `field` falsy (unset/"All Fields") is a no-op.
 */
function filterByField(users, weekIds, field) {
  if (!field) return users;
  return users.filter((u) => fieldList(effectiveField(u, weekIds)).includes(field));
}

/**
 * §4.6.01 Field-Wise Heatmap: 10 fields x 7 parameters, avg peer scores.
 * weekIds is one-or-more — same "averaged across the selection" rule as
 * getFieldStandings/getRankings: each person's own per-parameter peer score
 * is averaged across their scored weeks in the selection FIRST, then those
 * per-person averages are averaged again within each field. Grouped by
 * effectiveField() — the frozen per-week snapshot for a single closed week,
 * current field for a multi-week/cumulative selection (see effectiveField).
 */
export async function getFieldHeatmap(projectId, weekIds, scope) {
  const users = await prisma.user.findMany({
    where: {
      project_id: projectId,
      ...activeOrScoredWhere(weekIds),
      field: { not: null },
      ...roleFilterForScope(scope),
    },
    include: { computedScores: { where: { week_id: { in: weekIds } } } },
  });

  const byField = {};
  for (const u of users) {
    const scores = u.computedScores;
    if (scores.length === 0) continue;
    const avgByParam = Object.fromEntries(
      PARAM_FIELDS.map((p) => [p.label, scores.reduce((a, s) => a + Number(s[`${p.key}_peer`]), 0) / scores.length])
    );
    for (const field of fieldList(effectiveField(u, weekIds))) {
      byField[field] ??= { count: 0, sums: Object.fromEntries(PARAM_FIELDS.map((p) => [p.label, 0])) };
      byField[field].count += 1;
      for (const p of PARAM_FIELDS) {
        byField[field].sums[p.label] += avgByParam[p.label];
      }
    }
  }

  return Object.entries(byField).map(([field, { count, sums }]) => {
    const row = { field, count };
    let total = 0;
    for (const p of PARAM_FIELDS) {
      const avg = count > 0 ? sums[p.label] / count : 0;
      row[p.label] = Math.round(avg * 100) / 100;
      total += avg;
    }
    row.avg = Math.round((total / PARAM_FIELDS.length) * 100) / 100;
    return row;
  });
}

function sapaBucket(sapa) {
  if (sapa === null || sapa === undefined) return null;
  const v = Number(sapa);
  if (v > 1.1) return "over";
  if (v < 0.9) return "under";
  return "aligned";
}

/**
 * §4.6.03 SAPA Distribution — by role and by field. weekIds is one-or-more:
 * each person's SAPA factor is averaged across their scored weeks in the
 * selection FIRST, then that single averaged figure is bucketed into
 * over/aligned/under — same two-step-averaging convention as the heatmap,
 * so a person's classification doesn't wobble between weeks.
 */
export async function getSapaDistribution(projectId, weekIds, scope, field) {
  const users = filterByField(
    await prisma.user.findMany({
      where: { project_id: projectId, ...activeOrScoredWhere(weekIds), ...roleFilterForScope(scope) },
      include: { computedScores: { where: { week_id: { in: weekIds } } } },
    }),
    weekIds,
    field
  );

  function distribute(groupKeysFn) {
    const groups = {};
    for (const u of users) {
      const scored = u.computedScores.filter((s) => s.sapa_factor !== null);
      if (scored.length === 0) continue;
      const avgSapa = scored.reduce((a, s) => a + Number(s.sapa_factor), 0) / scored.length;
      const bucket = sapaBucket(avgSapa);
      if (!bucket) continue;
      // A CASU Anchor covering more than one field counts toward each of them.
      for (const key of groupKeysFn(u)) {
        groups[key] ??= { over: 0, aligned: 0, under: 0, sapaSum: 0, sapaCount: 0, members: { over: [], aligned: [], under: [] } };
        groups[key][bucket] += 1;
        groups[key].sapaSum += avgSapa;
        groups[key].sapaCount += 1;
        groups[key].members[bucket].push({ id: u.id, name: u.name, sapa: Math.round(avgSapa * 100) / 100 });
      }
    }
    return Object.entries(groups).map(([key, g]) => {
      const total = g.over + g.aligned + g.under;
      return {
        key,
        over: total ? Math.round((g.over / total) * 100) : 0,
        aligned: total ? Math.round((g.aligned / total) * 100) : 0,
        under: total ? Math.round((g.under / total) * 100) : 0,
        avg: g.sapaCount ? Math.round((g.sapaSum / g.sapaCount) * 1000) / 1000 : null,
        members: g.members,
      };
    });
  }

  return {
    byRole: distribute((u) => [u.role]),
    byField: distribute((u) => {
      const field = effectiveField(u, weekIds);
      return field ? fieldList(field) : ["—"];
    }),
  };
}

/**
 * §4.6.02 Quadrant Analysis: X = avg peer score, Y = sentiment of qualitative
 * feedback received. Sentiment is a lightweight heuristic (no NLP model
 * available in this stack): blends the week-over-week Trajectory answers
 * (Improved/Stayed the Same/Declined) with the strength-vs-weakness tag
 * balance, both from peer submissions. Replace with a real sentiment model
 * if/when available. weekIds is one-or-more: performance is averaged across
 * the selection's scored weeks (same rule as getRankings), and sentiment is
 * computed from every peer submission POOLED across the selection, not just
 * the latest week.
 */
export async function getQuadrantData(projectId, weekIds, scope, field) {
  const users = filterByField(
    await prisma.user.findMany({
      where: { project_id: projectId, ...activeOrScoredWhere(weekIds), ...roleFilterForScope(scope) },
      include: {
        computedScores: { where: { week_id: { in: weekIds } } },
        evaluationsReceived: {
          where: { week_id: { in: weekIds }, eval_type: "peer" },
          select: { trajectory: true, strengths_tags: true, weakness_tags: true },
        },
      },
    }),
    weekIds,
    field
  );

  return users
    .map((u) => {
      const scores = u.computedScores;
      if (scores.length === 0) return null;
      const avgPerformance = scores.reduce((a, s) => a + Number(s.total_peer), 0) / scores.length;
      const peerEvals = u.evaluationsReceived;
      const improved = peerEvals.filter((e) => e.trajectory === "improved").length;
      const declined = peerEvals.filter((e) => e.trajectory === "declined").length;
      // "not_applicable" (first-time evaluations, or Week 1) carries no
      // directional signal, so it's excluded from the denominator rather
      // than counted as neutral.
      const scoredTrajectoryCount = peerEvals.filter((e) => e.trajectory !== "not_applicable").length;
      const strengthCount = peerEvals.reduce((a, e) => a + e.strengths_tags.length, 0);
      const weaknessCount = peerEvals.reduce((a, e) => a + e.weakness_tags.length, 0);

      const trajectorySignal = scoredTrajectoryCount ? (improved - declined) / scoredTrajectoryCount : 0;
      const tagSignal =
        strengthCount + weaknessCount > 0
          ? (strengthCount - weaknessCount) / (strengthCount + weaknessCount)
          : 0;
      const sentiment = clamp(trajectorySignal * 0.5 + tagSignal * 0.5, -1, 1);

      return {
        id: u.id,
        name: u.name,
        role: u.role,
        field: effectiveField(u, weekIds),
        performance: Math.round(avgPerformance * 100) / 100, // X axis, out of 49
        sentiment: Math.round(sentiment * 100) / 100, // Y axis, -1..1
      };
    })
    .filter(Boolean);
}

// Self-vs-peer gap on a single 1-7 parameter — same thresholds as the
// individual Performance Scorecard (scorecard.js), so a team-wide view and
// a personal one always agree on what counts as "aligned".
const GAP_ALIGNED = 1.0;
const GAP_MODERATE = 2.0;
function gapBucket(diff) {
  if (diff <= GAP_ALIGNED) return "aligned";
  if (diff <= GAP_MODERATE) return "someGap";
  return "largeGap";
}

/**
 * Per-Parameter Alignment — team-wide self-vs-peer gap distribution for
 * each of the 7 parameters. Complements the heatmap (which only shows
 * peer-score magnitude): this answers "how many people are aligned/have
 * some gap/have a large gap" on each parameter, team-wide. weekIds is
 * one-or-more: each (person, scored week) pair contributes its own gap
 * classification, so someone scored in 3 of 5 selected weeks contributes 3
 * data points, not one averaged point — this pools every week's evaluation
 * instances together rather than pre-averaging a person's gap across weeks.
 */
export async function getParameterAlignment(projectId, weekIds, scope, field) {
  const users = filterByField(
    await prisma.user.findMany({
      where: { project_id: projectId, ...activeOrScoredWhere(weekIds), role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
      include: { computedScores: { where: { week_id: { in: weekIds } } } },
    }),
    weekIds,
    field
  );

  const buckets = Object.fromEntries(PARAM_FIELDS.map((p) => [p.key, { aligned: 0, someGap: 0, largeGap: 0 }]));
  for (const u of users) {
    for (const score of u.computedScores) {
      for (const p of PARAM_FIELDS) {
        const diff = Math.abs(Number(score[`${p.key}_self`]) - Number(score[`${p.key}_peer`]));
        buckets[p.key][gapBucket(diff)] += 1;
      }
    }
  }

  return PARAM_FIELDS.map((p) => {
    const b = buckets[p.key];
    return { key: p.key, label: p.label, ...b, total: b.aligned + b.someGap + b.largeGap };
  });
}

/**
 * Same as getParameterAlignment, but one row per week — feeds the "% Aligned
 * over time" trend chart shown when more than one week is selected.
 */
export async function getParameterAlignmentTrend(projectId, weekIds, scope, field) {
  const weeks = await prisma.week.findMany({
    where: { id: { in: weekIds }, project_id: projectId },
    orderBy: { week_number: "asc" },
  });
  const users = filterByField(
    await prisma.user.findMany({
      where: { project_id: projectId, ...activeOrScoredWhere(weekIds), role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
      include: { computedScores: { where: { week_id: { in: weekIds } } } },
    }),
    weekIds,
    field
  );

  return weeks.map((week) => {
    const buckets = Object.fromEntries(PARAM_FIELDS.map((p) => [p.key, { aligned: 0, someGap: 0, largeGap: 0 }]));
    for (const u of users) {
      const score = u.computedScores.find((s) => s.week_id === week.id);
      if (!score) continue;
      for (const p of PARAM_FIELDS) {
        const diff = Math.abs(Number(score[`${p.key}_self`]) - Number(score[`${p.key}_peer`]));
        buckets[p.key][gapBucket(diff)] += 1;
      }
    }
    const row = { weekLabel: week.label, weekNumber: week.week_number };
    for (const p of PARAM_FIELDS) {
      const b = buckets[p.key];
      const total = b.aligned + b.someGap + b.largeGap;
      row[p.key] = total > 0 ? Math.round((b.aligned / total) * 100) : null;
    }
    return row;
  });
}

const TEAM_TAGS_TOP_N = 10;

/**
 * Team Strengths & Growth Areas — strengths/weakness tag frequency across
 * every peer evaluation received, team-wide (scoped the same way as the
 * other aggregate views). weekIds is one-or-more — every peer evaluation
 * across the whole selection is pooled into one frequency count, same as
 * every other Team-Wide Analytics card. Each tag's % is its share of every
 * peer evaluation response in the selection (not of total tag-selections,
 * so multi-tag responses don't inflate the denominator).
 */
export async function getTeamTagFrequency(projectId, weekIds, scope, field) {
  const users = filterByField(
    await prisma.user.findMany({
      where: { project_id: projectId, ...activeOrScoredWhere(weekIds), role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
      include: {
        computedScores: { where: { week_id: { in: weekIds } } },
        evaluationsReceived: {
          where: { week_id: { in: weekIds }, eval_type: "peer" },
          select: { strengths_tags: true, weakness_tags: true },
        },
      },
    }),
    weekIds,
    field
  );

  const strengthFreq = {};
  const weaknessFreq = {};
  let responseCount = 0;
  for (const u of users) {
    for (const e of u.evaluationsReceived) {
      responseCount += 1;
      for (const tag of e.strengths_tags) strengthFreq[tag] = (strengthFreq[tag] || 0) + 1;
      for (const tag of e.weakness_tags) weaknessFreq[tag] = (weaknessFreq[tag] || 0) + 1;
    }
  }

  const topSorted = (freq) =>
    Object.entries(freq)
      .map(([tag, count]) => ({ tag, count, pct: responseCount ? Math.round((count / responseCount) * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TEAM_TAGS_TOP_N);

  return { strengths: topSorted(strengthFreq), weaknesses: topSorted(weaknessFreq), responseCount };
}

const TAG_TREND_TOP_N = 5;

/**
 * Same idea as getTeamTagFrequency, but tracked over several weeks — picks
 * a FIXED top-N set of tags (by total frequency across the whole selected
 * range) so the trend lines track the same tags week to week, rather than
 * whichever tags happened to be #1-5 in any single week.
 */
export async function getTeamTagTrend(projectId, weekIds, scope, field) {
  const weeks = await prisma.week.findMany({
    where: { id: { in: weekIds }, project_id: projectId },
    orderBy: { week_number: "asc" },
  });
  const users = filterByField(
    await prisma.user.findMany({
      where: { project_id: projectId, ...activeOrScoredWhere(weekIds), role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
      include: {
        computedScores: { where: { week_id: { in: weekIds } } },
        evaluationsReceived: {
          where: { week_id: { in: weekIds }, eval_type: "peer" },
          select: { week_id: true, strengths_tags: true, weakness_tags: true },
        },
      },
    }),
    weekIds,
    field
  );

  const perWeekStrength = new Map(weeks.map((w) => [w.id, {}]));
  const perWeekWeakness = new Map(weeks.map((w) => [w.id, {}]));
  const totalStrength = {};
  const totalWeakness = {};
  for (const u of users) {
    for (const e of u.evaluationsReceived) {
      const sBucket = perWeekStrength.get(e.week_id);
      const wBucket = perWeekWeakness.get(e.week_id);
      if (!sBucket) continue;
      for (const tag of e.strengths_tags) {
        sBucket[tag] = (sBucket[tag] || 0) + 1;
        totalStrength[tag] = (totalStrength[tag] || 0) + 1;
      }
      for (const tag of e.weakness_tags) {
        wBucket[tag] = (wBucket[tag] || 0) + 1;
        totalWeakness[tag] = (totalWeakness[tag] || 0) + 1;
      }
    }
  }

  const topTags = (totals) =>
    Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, TAG_TREND_TOP_N)
      .map(([tag]) => tag);
  const strengthTags = topTags(totalStrength);
  const weaknessTags = topTags(totalWeakness);

  const trendFor = (tags, perWeek) =>
    weeks.map((week) => {
      const bucket = perWeek.get(week.id) || {};
      const row = { weekLabel: week.label, weekNumber: week.week_number };
      for (const tag of tags) row[tag] = bucket[tag] || 0;
      return row;
    });

  return {
    strengthTags,
    weaknessTags,
    strengthTrend: trendFor(strengthTags, perWeekStrength),
    weaknessTrend: trendFor(weaknessTags, perWeekWeakness),
  };
}

// Generic English function words, plus a few filler verbs specific to how
// this questionnaire's suggestions tend to be phrased ("needs to improve...",
// "should take...") — excluded before clustering so near-duplicate
// suggestions match on their actual THEMES (communication, ownership,
// deadlines, ...) instead of on filler words shared by every answer.
// Deliberately generous rather than exhaustive.
const SUGGESTION_STOPWORDS = new Set([
  "the", "a", "an", "to", "and", "of", "in", "on", "for", "is", "are", "be", "this", "that",
  "with", "should", "needs", "need", "more", "take", "can", "could", "would", "their", "them",
  "he", "she", "they", "his", "her", "my", "as", "yet", "some", "cases", "while", "working", "from",
  "it", "its", "at", "by", "or", "but", "not", "also", "you", "your", "i", "we", "our", "us",
  "has", "have", "had", "do", "does", "did", "been", "being", "was", "were", "will", "shall",
  "may", "might", "must", "than", "so", "if", "about", "into", "up", "down", "out", "over",
  "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how",
  "all", "any", "both", "each", "few", "most", "other", "such", "no", "nor", "only", "own",
  "same", "too", "very", "just", "don", "now", "improve", "improving", "improved", "improvement",
  "area", "areas", "things", "thing", "help", "work", "good", "well", "him", "one", "upon",
]);

// Words that show up almost exclusively in "I have nothing to add" style
// non-answers to the open-ended focus question — unlike SUGGESTION_STOPWORDS
// (generic function words present in EVERY answer), these ARE content words,
// but ones that only ever restate "no suggestion" rather than describe an
// actual action. See isNonSubstantive below.
const NON_SUBSTANTIVE_WORDS = new Set([
  "nothing", "none", "nil", "na", "suggestion", "comment", "feedback", "everything",
  "overall", "fine", "great", "doing", "keep", "job", "perfect", "excellent", "satisfied",
  "happy", "awesome", "amazing", "wonderful", "superb", "ok", "okay", "fantastic",
  "specific", "particular", "far", "concern", "issue",
]);

// Naive plural stripping (e.g. "suggestions" -> "suggestion", "deadlines" ->
// "deadline") so a singular/plural mismatch alone doesn't stop two otherwise
// identically-worded suggestions from clustering together. Only applied to
// longer words, and never to words already ending "ss", to avoid mangling
// short unrelated words.
function stemWord(word) {
  return word.length >= 5 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

function tokenizeSuggestion(text) {
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  const tokens = [];
  for (const w of words) {
    if (w.length < 3 || SUGGESTION_STOPWORDS.has(w)) continue;
    tokens.push(stemWord(w));
  }
  return tokens;
}

/**
 * True when every remaining (non-filler) word in a suggestion is itself just
 * a generic "nothing to add" word — "Nothing", "None", "No suggestions",
 * "All good", "Everything is fine", and similar carry no actionable content,
 * but they're too short and too different from EACH OTHER (no shared literal
 * words) for the word-overlap clustering below to ever group them together
 * on its own. These are filtered out before clustering entirely, rather than
 * left to form their own confusing scatter of one-off clusters. This is a
 * curated keyword list, not real language understanding — a genuinely
 * unusual non-answer can still slip through as its own small cluster.
 */
function isNonSubstantive(tokens) {
  return tokens.length === 0 || tokens.every((t) => NON_SUBSTANTIVE_WORDS.has(t));
}

function jaccardSimilarity(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

// How much stopword-stripped word overlap two suggestions need to be
// treated as "the same suggestion" — tuned for short (5-15 content word)
// free-text answers, not long prose.
const CLUSTER_JACCARD_THRESHOLD = 0.25;

/**
 * Groups near-duplicate free-text suggestions together by word overlap
 * (Jaccard similarity on stopword-stripped tokens) — no NLP/ML service
 * available in this stack, so this only catches suggestions worded
 * similarly to each other, not ones that are merely related in meaning.
 *
 * Every new suggestion is compared against EVERY existing member of EVERY
 * existing cluster (not just whichever suggestion happened to start that
 * cluster) — it joins whichever cluster it's most similar to on AVERAGE,
 * as long as that average clears the threshold. This "average-linkage"
 * approach is deliberately not "join if similar to ANY member" (single-
 * linkage): single-linkage lets A~B~C chain together into one cluster even
 * when A and C don't actually resemble each other, which snowballs into
 * one meaningless bucket. Requiring the average over the whole cluster
 * keeps a cluster's members mutually similar to each other as it grows,
 * without needing every pair to match (too strict) or just one anchor
 * (too order-dependent). With a few hundred suggestions at most per
 * team-week, comparing every pair is computationally trivial — there's no
 * performance reason to take the cheaper anchor-only shortcut.
 */
function clusterSuggestions(texts) {
  const clusters = []; // { members: [{ text, tokens }], counts: Map<text, count> }
  for (const text of texts) {
    const tokens = tokenizeSuggestion(text);
    if (tokens.length === 0) continue;

    let bestCluster = null;
    let bestAvg = 0;
    for (const cluster of clusters) {
      const avg =
        cluster.members.reduce((sum, m) => sum + jaccardSimilarity(tokens, m.tokens), 0) / cluster.members.length;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestAvg >= CLUSTER_JACCARD_THRESHOLD) {
      bestCluster.members.push({ text, tokens });
      bestCluster.counts.set(text, (bestCluster.counts.get(text) || 0) + 1);
    } else {
      clusters.push({ members: [{ text, tokens }], counts: new Map([[text, 1]]) });
    }
  }

  return clusters
    .map((c) => {
      const count = [...c.counts.values()].reduce((a, b) => a + b, 0);
      const representative = [...c.counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { members: c.members, representative, count };
    })
    .sort((a, b) => b.count - a.count);
}

/** Average similarity of `tokens` to every member of a cluster — same metric clusterSuggestions uses to grow clusters, reused here to test self-suggestion overlap against a peer cluster as a whole (not just its representative). */
function avgSimilarityToCluster(tokens, cluster) {
  return cluster.members.reduce((sum, m) => sum + jaccardSimilarity(tokens, m.tokens), 0) / cluster.members.length;
}

// Pre-tokenized once — the fixed Weakness tag vocabulary a peer picks from
// in the SAME evaluation, shown structured in Team Strengths & Growth Areas.
const WEAKNESS_TAG_TOKENS = WEAKNESS_TAGS.map(tokenizeSuggestion);

/** The fixed Weakness tag (if any) a cluster's wording most closely echoes, plus how closely. */
function bestMatchingWeaknessTag(cluster) {
  let best = null;
  WEAKNESS_TAGS.forEach((tag, i) => {
    const tagTokens = WEAKNESS_TAG_TOKENS[i];
    const sim = cluster.members.reduce((sum, m) => sum + jaccardSimilarity(m.tokens, tagTokens), 0) / cluster.members.length;
    if (!best || sim > best.sim) best = { tag, sim };
  });
  return best;
}

// Hedge/modal words that signal an actual improvement ask regardless of
// where they appear in the sentence — largely the same vocabulary already
// stripped as generic stopwords during clustering, but checked here on the
// RAW words (before stripping), since stripping is exactly what would make
// them invisible to this check.
const ACTION_MARKERS = new Set([
  "should", "could", "would", "must", "need", "needs", "improve", "increase",
  "decrease", "reduce", "avoid", "focus", "try", "ensure", "recommend",
  "suggest", "consider", "better", "more", "less", "stop", "start",
]);

// Imperative-style action verbs — catches a suggestion phrased as a bare
// command with no hedge word at all ("Attend all meetings on time"), which
// would otherwise be indistinguishable from a non-actionable remark.
// Deliberately verbs that read as instructions in this context, not generic
// verbs ("do", "make", "get") that show up in all kinds of sentences.
const ACTION_VERBS = new Set([
  "attend", "speak", "share", "document", "communicate", "ask", "check",
  "follow", "complete", "submit", "respond", "coordinate", "plan", "prepare",
  "review", "verify", "escalate", "delegate", "prioritize", "practice",
  "apply", "learn", "adopt", "maintain", "continue", "provide", "offer",
  "seek", "request", "raise", "flag", "report", "update", "track", "monitor",
  "schedule", "organize", "contribute", "participate", "engage", "listen",
  "collaborate", "use", "adhere", "proofread", "validate", "confirm",
  "clarify", "discuss", "involve", "consult", "notify", "inform", "record",
  "log", "note", "execute", "implement", "refine", "streamline", "simplify",
  "automate", "mentor", "coach", "train",
]);

// "is/was/being + <verb>" reads as a description of the person ("he is
// listening"), not an instruction ("listen more") — an ACTION_VERBS hit
// directly after one of these is not treated as an actionable signal.
const COPULA_WORDS = new Set(["is", "are", "was", "were", "has", "have", "being", "been", "be"]);

/**
 * True when a suggestion contains some signal that it's actually proposing
 * an action: a hedge/modal word anywhere in the sentence, OR an imperative-
 * style action verb not immediately preceded by a copula. There's no
 * grammar parser in this stack, so this is a curated-keyword heuristic, not
 * real imperative-mood detection — two honest failure modes remain: a bare
 * command using a verb outside ACTION_VERBS can still read as non-
 * actionable, and a descriptive sentence using an ACTION_VERB in a
 * non-adjacent tense ("He always listens well") can still read as
 * actionable. Both just mean a response lands in "Positive" vs "Unique/
 * Repetitive" — nothing is ever hidden by this check.
 */
function hasActionableSignal(text) {
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  if (words.some((w) => ACTION_MARKERS.has(w))) return true;
  for (let i = 0; i < words.length; i++) {
    if (!ACTION_VERBS.has(stemWord(words[i])) && !ACTION_VERBS.has(words[i])) continue;
    const prev = i > 0 ? words[i - 1] : null;
    if (prev && COPULA_WORDS.has(prev)) continue;
    return true;
  }
  return false;
}

/**
 * Rounds each of `counts` (a {key: count} map) to a whole percentage of
 * `total`, using largest-remainder allocation so the results always sum to
 * exactly 100 (rather than each key rounding independently and landing a
 * point or two short, e.g. 31/24/21/23 instead of summing to 100).
 */
function allocateWholePercentages(counts, total) {
  const keys = Object.keys(counts);
  if (!total) return Object.fromEntries(keys.map((k) => [k, 0]));
  const raw = keys.map((k) => (counts[k] / total) * 100);
  const floors = raw.map(Math.floor);
  const shortfall = 100 - floors.reduce((a, b) => a + b, 0);
  const byRemainderDesc = keys
    .map((_, i) => i)
    .sort((a, b) => raw[b] - floors[b] - (raw[a] - floors[a]));
  const result = [...floors];
  for (let i = 0; i < shortfall; i++) {
    result[byRemainderDesc[i]] += 1;
  }
  return Object.fromEntries(keys.map((k, i) => [k, result[i]]));
}

/**
 * What the team should focus on — every peer "single most impactful action"
 * suggestion, sorted into four always-visible categories rather than
 * ranked as one undifferentiated list (an earlier version of this excluded
 * some responses outright, which hid real data — nothing is excluded now):
 *  - Unique: a genuine actionable suggestion not already captured by the
 *    fixed Weakness tags shown, structured, in Team Strengths & Growth Areas.
 *  - Repetitive: an actionable suggestion that just restates one of those
 *    fixed tags — see bestMatchingWeaknessTag.
 *  - Non-answer: no real content ("Nothing", "None", "All good", ...) — see
 *    isNonSubstantive.
 *  - Positive: says something about the person but proposes no action
 *    ("Very calm nature", "Great team player") — see hasActionableSignal.
 * Unique/Repetitive suggestions are further grouped into clusters of near-
 * duplicate wording (word-overlap, not a bag of individual words — a word
 * cloud strips exactly the context that makes a short free-text answer
 * actionable) and each reports how many SELF-evaluations raised a similarly-
 * worded suggestion about themselves, as a self-awareness signal. Every
 * category's count/% is against the SAME total (every peer suggestion in
 * the selection), so all four percentages sum to ~100%. weekIds is
 * one-or-more: every selected week's suggestions (peer and self) are pooled
 * together before classifying.
 */
export async function getTeamFocusSuggestions(projectId, weekIds, scope, field) {
  const users = filterByField(
    await prisma.user.findMany({
      where: { project_id: projectId, ...activeOrScoredWhere(weekIds), role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
      include: {
        computedScores: { where: { week_id: { in: weekIds } } },
        evaluationsReceived: {
          where: { week_id: { in: weekIds }, eval_type: { in: ["peer", "self"] } },
          select: { eval_type: true, improvement_suggestion: true },
        },
      },
    }),
    weekIds,
    field
  );

  const peerTexts = [];
  const selfTexts = [];
  for (const u of users) {
    for (const e of u.evaluationsReceived) {
      if (!e.improvement_suggestion) continue;
      (e.eval_type === "peer" ? peerTexts : selfTexts).push(e.improvement_suggestion);
    }
  }

  const nonAnswerTexts = [];
  const positiveTexts = [];
  const actionableTexts = [];
  for (const text of peerTexts) {
    if (isNonSubstantive(tokenizeSuggestion(text))) {
      nonAnswerTexts.push(text);
    } else if (!hasActionableSignal(text)) {
      positiveTexts.push(text);
    } else {
      actionableTexts.push(text);
    }
  }

  const clusters = clusterSuggestions(actionableTexts);
  const selfTokenized = selfTexts.map(tokenizeSuggestion);
  const total = peerTexts.length;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  const toItem = (c) => {
    const selfOverlapCount = selfTokenized.filter((tokens) => avgSimilarityToCluster(tokens, c) >= CLUSTER_JACCARD_THRESHOLD).length;
    return {
      text: c.representative,
      count: c.count,
      pct: pct(c.count),
      selfOverlapCount,
      selfOverlapPct: selfTexts.length ? Math.round((selfOverlapCount / selfTexts.length) * 100) : 0,
    };
  };

  const uniqueItems = [];
  const repetitiveItems = [];
  for (const c of clusters) {
    const match = bestMatchingWeaknessTag(c);
    if (match && match.sim >= CLUSTER_JACCARD_THRESHOLD) {
      repetitiveItems.push({ ...toItem(c), matchedTag: match.tag });
    } else {
      uniqueItems.push(toItem(c));
    }
  }

  const sumCount = (items) => items.reduce((a, it) => a + it.count, 0);
  const uniqueCount = sumCount(uniqueItems);
  const repetitiveCount = sumCount(repetitiveItems);

  // Rounding each category's % independently (plain pct()) can leave the four
  // labels a point or two short of 100 — e.g. 31/24/21/23 instead of summing
  // to 100 — because each one rounds toward/away from its own nearest integer
  // regardless of the others. Largest-remainder allocation instead rounds all
  // four together so they always add up to exactly 100 (of a non-empty total).
  const categoryPcts = allocateWholePercentages(
    { unique: uniqueCount, repetitive: repetitiveCount, nonAnswer: nonAnswerTexts.length, positive: positiveTexts.length },
    total
  );

  return {
    totalPeerSuggestions: total,
    totalSelfSuggestions: selfTexts.length,
    categories: {
      unique: { count: uniqueCount, pct: categoryPcts.unique, items: uniqueItems },
      repetitive: { count: repetitiveCount, pct: categoryPcts.repetitive, items: repetitiveItems },
      nonAnswer: { count: nonAnswerTexts.length, pct: categoryPcts.nonAnswer, texts: nonAnswerTexts },
      positive: { count: positiveTexts.length, pct: categoryPcts.positive, texts: positiveTexts },
    },
  };
}

/**
 * Team Momentum — what fraction of peer Trajectory answers said Improved /
 * Stayed the Same / Declined, team-wide. "not_applicable" (first scored
 * week for that pairing) is tracked but excluded from the scored total,
 * same convention as the Quadrant sentiment heuristic. weekIds is
 * one-or-more — every selected week's trajectory answers are pooled
 * together into one distribution.
 */
export async function getTeamTrajectory(projectId, weekIds, scope) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, ...activeOrScoredWhere(weekIds), role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
    include: {
      evaluationsReceived: {
        where: { week_id: { in: weekIds }, eval_type: "peer" },
        select: { trajectory: true },
      },
    },
  });

  const counts = { improved: 0, stayed_same: 0, declined: 0, not_applicable: 0 };
  for (const u of users) {
    for (const e of u.evaluationsReceived) counts[e.trajectory] += 1;
  }
  const scoredTotal = counts.improved + counts.stayed_same + counts.declined;

  return { counts, scoredTotal, total: scoredTotal + counts.not_applicable };
}

/**
 * Standings by Total Peer Score — for one week, or averaged across several
 * (the frontend's multi-select / "cumulative across all weeks" options both
 * collapse into "one or more week IDs", averaged when there's more than one).
 *
 * The ranking POOL (who counts, and the requester's numeric rank/of-count)
 * is always the true field / whole-project set — a rank number alone
 * doesn't expose anyone's individual score. What varies by role is whether
 * the full named+scored LIST is also returned, matching the same
 * visibility rules as canViewUser: Profilers get their rank only; Group/CASU
 * Anchors get their field's named list; leads/Admin get the named list at
 * their existing analytics scope (excl_casu / full).
 */
/** Sorts a pool by totalPeer descending and assigns rank/of — shared by getRankings and getFieldMemberStandings. */
function rankByTotalPeer(pool) {
  const ranked = pool.filter((u) => u.totalPeer !== null).sort((a, b) => b.totalPeer - a.totalPeer);
  return ranked.map((u, i) => ({ ...u, rank: i + 1, of: ranked.length }));
}

/** Per-user average totalPeer/totalSelf across the given weeks, for a set of users. */
function averageScoresByUser(users, weekIds) {
  return users.map((u) => {
    const scores = u.computedScores;
    const totalPeer = scores.length
      ? scores.reduce((a, s) => a + Number(s.total_peer), 0) / scores.length
      : null;
    const totalSelf = scores.length
      ? scores.reduce((a, s) => a + Number(s.total_self), 0) / scores.length
      : null;
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      field: effectiveField(u, weekIds),
      totalPeer: totalPeer === null ? null : Math.round(totalPeer * 100) / 100,
      totalSelf: totalSelf === null ? null : Math.round(totalSelf * 100) / 100,
      weeksCounted: scores.length,
    };
  });
}

export async function getRankings(projectId, requester, weekIds) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, ...activeOrScoredWhere(weekIds), role: { not: ROLES.ADMIN } },
    include: { computedScores: { where: { week_id: { in: weekIds } } } },
  });

  const withAvg = averageScoresByUser(users, weekIds);
  const rank = rankByTotalPeer;

  let field = null;
  if (requester.field) {
    // For a single closed week, use the requester's OWN historically-frozen
    // field (myRecord.field, already resolved via effectiveField inside
    // averageScoresByUser) rather than their current live field —
    // otherwise someone who's since moved fields would see "not enough
    // data" for a past week (their live field shares nothing with anyone's
    // historical one), and the card title would show today's field name
    // instead of what was actually true back then. Falls back to the live
    // field for the rare case they have no record in this selection at all.
    const myRecord = withAvg.find((u) => u.id === requester.id);
    const myEffectiveField = myRecord?.field ?? requester.field;
    const fieldPool = rank(withAvg.filter((u) => sharesField({ field: myEffectiveField }, u)));
    const mine = fieldPool.find((u) => u.id === requester.id);
    const canSeeFieldList = [ROLES.GROUP_ANCHOR, ROLES.CASU_ANCHOR, ROLES.CASU_LEAD, ROLES.ADMIN].includes(
      requester.role
    );
    field = {
      myRank: mine?.rank ?? null,
      totalInField: fieldPool.length,
      list: canSeeFieldList ? fieldPool : null,
      // The field name the card title should show for this week selection
      // — see the comment above on why this can differ from the
      // requester's live/current field.
      fieldLabel: myEffectiveField,
    };
  }

  const scope = analyticsScope(requester);
  const overallPool = rank(withAvg);
  const mineOverall = overallPool.find((u) => u.id === requester.id);
  const overallList =
    scope === "personal"
      ? null
      : scope === "excl_casu"
      ? overallPool.filter((u) => [ROLES.PROFILER, ROLES.GROUP_ANCHOR].includes(u.role))
      : overallPool;

  const overall = {
    myRank: mineOverall?.rank ?? null,
    totalOverall: overallPool.length,
    list: overallList,
  };

  return { field, overall };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Week-on-week Total Peer Score comparison for the Analytics tab's line
 * graph: the requester's own score vs their sub-field's average vs the
 * whole (non-admin) team's average, one point per open/closed week.
 * Field/overall averages only count users who already have a
 * computed_scores row for that week (mirrors getFieldHeatmap) — a week
 * nobody's been scored in yet simply produces a null average, not a 0.
 *
 * Each week's field grouping is resolved from THAT WEEK's own frozen
 * computed_scores.field snapshot (falling back to the live user.field only
 * when no snapshot exists, e.g. a user who has never been scored) — never
 * from the target's current/live field. Without this, a roster reshuffle
 * after a week closes would silently repaint which field group an
 * already-closed week's point was compared against. Every row here already
 * comes from a computed_scores join scoped to this exact week, so — unlike
 * most other analytics functions — there's no separate is_active filter:
 * having a score for the week IS the membership test for that week.
 */
export async function getPeerScoreTrendComparison(projectId, targetUser) {
  const weeks = await prisma.week.findMany({
    where: { project_id: projectId, status: { not: "upcoming" } },
    orderBy: { week_number: "asc" },
  });
  if (weeks.length === 0) return [];
  const weekIds = weeks.map((w) => w.id);

  const scores = await prisma.computedScore.findMany({
    where: {
      week_id: { in: weekIds },
      user: { project_id: projectId, role: { not: ROLES.ADMIN } },
    },
    select: { week_id: true, user_id: true, total_peer: true, field: true, user: { select: { field: true } } },
  });

  const byWeek = new Map();
  for (const s of scores) {
    if (!byWeek.has(s.week_id)) byWeek.set(s.week_id, []);
    byWeek.get(s.week_id).push(s);
  }

  return weeks.map((w) => {
    const rows = byWeek.get(w.id) || [];
    const mine = rows.find((r) => r.user_id === targetUser.id);
    const myFieldThisWeek = mine ? mine.field ?? mine.user.field : targetUser.field;
    const fieldRows = myFieldThisWeek
      ? rows.filter((r) => sharesField({ field: myFieldThisWeek }, { field: r.field ?? r.user.field }))
      : [];
    const fieldAvg = fieldRows.length
      ? round2(fieldRows.reduce((a, r) => a + Number(r.total_peer), 0) / fieldRows.length)
      : null;
    const overallAvg = rows.length
      ? round2(rows.reduce((a, r) => a + Number(r.total_peer), 0) / rows.length)
      : null;
    return {
      week: { id: w.id, label: w.label, week_number: w.week_number },
      selfTotalPeer: mine ? Number(mine.total_peer) : null,
      fieldAvgTotalPeer: fieldAvg,
      fieldLabel: myFieldThisWeek,
      overallAvgTotalPeer: overallAvg,
    };
  });
}

/**
 * Field-Wise Standing — a leaderboard of FIELDS rather than individuals, for
 * roles that don't belong to a single field themselves (Admin, CASU Lead,
 * Project Lead) and so have no meaningful "your field" rank. Same averaging
 * rule as getRankings: one or more week IDs, averaged per person first, then
 * per field.
 */
export async function getFieldStandings(projectId, weekIds, scope) {
  const users = await prisma.user.findMany({
    where: {
      project_id: projectId,
      ...activeOrScoredWhere(weekIds),
      role: { not: ROLES.ADMIN },
      field: { not: null },
      ...roleFilterForScope(scope),
    },
    include: { computedScores: { where: { week_id: { in: weekIds } } } },
  });

  const byField = new Map();
  for (const u of users) {
    const scores = u.computedScores;
    if (scores.length === 0) continue;
    const avgTotalPeer = scores.reduce((a, s) => a + Number(s.total_peer), 0) / scores.length;
    // A CASU Anchor covering more than one field counts toward each of them.
    for (const field of fieldList(effectiveField(u, weekIds))) {
      if (!byField.has(field)) byField.set(field, { sum: 0, count: 0 });
      const entry = byField.get(field);
      entry.sum += avgTotalPeer;
      entry.count += 1;
    }
  }

  const standings = [...byField.entries()]
    .map(([field, { sum, count }]) => ({
      field,
      avgTotalPeer: Math.round((sum / count) * 100) / 100,
      memberCount: count,
    }))
    .sort((a, b) => b.avgTotalPeer - a.avgTotalPeer);

  return standings.map((s, i) => ({ ...s, rank: i + 1 }));
}

/**
 * Field-Wise Standing, drilled into ONE field — the individual ranked list
 * of every user in that field, for the same roles that see getFieldStandings
 * (Admin/CASU Lead/Project Lead, who have no personal field of their own).
 * Same averaging rule as getRankings: one or more week IDs, averaged per
 * person first.
 */
export async function getFieldMemberStandings(projectId, weekIds, field, scope) {
  const users = await prisma.user.findMany({
    where: {
      project_id: projectId,
      ...activeOrScoredWhere(weekIds),
      role: { not: ROLES.ADMIN },
      field: { not: null },
      ...roleFilterForScope(scope),
    },
    include: { computedScores: { where: { week_id: { in: weekIds } } } },
  });

  // A CASU Anchor's `field` may be comma-joined (covers more than one field),
  // so this can't be a plain Prisma equality filter — filter in application code.
  const inField = users.filter((u) => fieldList(effectiveField(u, weekIds)).includes(field));
  return rankByTotalPeer(averageScoresByUser(inField, weekIds));
}

const HALL_OF_RECOGNITION_ROLES = [ROLES.PROFILER, ROLES.GROUP_ANCHOR, ROLES.CASU_ANCHOR];

/**
 * Hall of Recognition — per closed week (in order), the top Total Peer
 * Score scorer for each of Profiler/Group Anchor/CASU Anchor, irrespective
 * of field, plus — from the 2nd closed week onward — a single cross-role
 * "Overall Star Performer": whoever has the highest CUMULATIVE average
 * Total Peer Score across every closed week completed so far. Each
 * person's average is over their own scored weeks only (not diluted by
 * weeks before they joined), matching how the Combined Score Sheet already
 * averages per person.
 */
export async function getHallOfRecognition(projectId) {
  const closedWeeks = await prisma.week.findMany({
    where: { project_id: projectId, status: "closed" },
    orderBy: { week_number: "asc" },
  });
  if (closedWeeks.length === 0) return { weeks: [] };

  const weekIds = closedWeeks.map((w) => w.id);
  // No is_active filter: every row here already comes from a computed_scores
  // join scoped to a specific closed week, so having a score IS the
  // membership test for that week (mirrors getPeerScoreTrendComparison) —
  // someone who left the project after being that week's top scorer must
  // still show up in that week's already-published Hall of Recognition.
  const scores = await prisma.computedScore.findMany({
    where: {
      week_id: { in: weekIds },
      user: { project_id: projectId, role: { not: ROLES.ADMIN } },
    },
    include: { user: { select: { id: true, name: true, role: true, field: true, photo_url: true } } },
  });

  const scoresByWeek = new Map();
  for (const s of scores) {
    if (!scoresByWeek.has(s.week_id)) scoresByWeek.set(s.week_id, []);
    scoresByWeek.get(s.week_id).push(s);
  }

  const cumulative = new Map(); // user_id -> { sum, count, name, role, field }
  const weeksOut = [];

  closedWeeks.forEach((week, index) => {
    const weekScores = scoresByWeek.get(week.id) || [];

    const topByRole = {};
    for (const role of HALL_OF_RECOGNITION_ROLES) {
      const inRole = weekScores.filter((s) => s.user.role === role);
      topByRole[role] =
        inRole.length === 0
          ? null
          : inRole.reduce((best, s) => {
              const top = {
                id: s.user.id,
                name: s.user.name,
                field: s.field || s.user.field, // frozen at compute time; see getFieldHeatmap
                photo_url: s.user.photo_url,
                totalPeer: Number(s.total_peer),
              };
              return !best || top.totalPeer > best.totalPeer ? top : best;
            }, null);
    }

    for (const s of weekScores) {
      const uid = s.user.id;
      if (!cumulative.has(uid)) {
        cumulative.set(uid, {
          sum: 0,
          count: 0,
          name: s.user.name,
          role: s.user.role,
          field: s.user.field,
          photo_url: s.user.photo_url,
        });
      }
      const entry = cumulative.get(uid);
      entry.sum += Number(s.total_peer);
      entry.count += 1;
    }

    let overallStar = null;
    if (index >= 1) {
      for (const entry of cumulative.values()) {
        const avgTotalPeer = Math.round((entry.sum / entry.count) * 100) / 100;
        if (!overallStar || avgTotalPeer > overallStar.avgTotalPeer) {
          overallStar = {
            name: entry.name,
            role: entry.role,
            field: entry.field,
            photo_url: entry.photo_url,
            avgTotalPeer,
          };
        }
      }
    }

    weeksOut.push({
      week: { id: week.id, label: week.label, week_number: week.week_number },
      topProfiler: topByRole[ROLES.PROFILER],
      topGroupAnchor: topByRole[ROLES.GROUP_ANCHOR],
      topCasuAnchor: topByRole[ROLES.CASU_ANCHOR],
      overallStar,
    });
  });

  return { weeks: weeksOut };
}

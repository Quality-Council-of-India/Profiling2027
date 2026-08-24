// Admin Analytics Dashboard — Technical Spec §4.6.
import { prisma } from "../utils/prisma.js";
import { roleFilterForScope, analyticsScope } from "./access.js";
import { ROLES } from "../utils/roles.js";
import { PARAM_FIELDS } from "../utils/constants.js";
import { fieldList, sharesField } from "../utils/fields.js";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** §4.6.01 Field-Wise Heatmap: 10 fields x 7 parameters, avg peer scores. */
export async function getFieldHeatmap(projectId, weekId, scope) {
  const users = await prisma.user.findMany({
    where: {
      project_id: projectId,
      is_active: true,
      field: { not: null },
      ...roleFilterForScope(scope),
    },
    include: { computedScores: { where: { week_id: weekId } } },
  });

  const byField = {};
  for (const u of users) {
    const score = u.computedScores[0];
    if (!score) continue;
    // Group by the field frozen at compute time, not the user's current one —
    // a later reshuffle shouldn't silently relabel this week's own numbers.
    // Falls back to the live field for rows computed before this snapshot existed.
    for (const field of fieldList(score.field || u.field)) {
      byField[field] ??= { count: 0, sums: Object.fromEntries(PARAM_FIELDS.map((p) => [p.label, 0])) };
      byField[field].count += 1;
      for (const p of PARAM_FIELDS) {
        byField[field].sums[p.label] += Number(score[`${p.key}_peer`]);
      }
    }
  }

  return Object.entries(byField).map(([field, { count, sums }]) => {
    const row = { field };
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

/** §4.6.03 SAPA Distribution — by role and by field. */
export async function getSapaDistribution(projectId, weekId, scope) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, ...roleFilterForScope(scope) },
    include: { computedScores: { where: { week_id: weekId } } },
  });

  function distribute(groupKeysFn) {
    const groups = {};
    for (const u of users) {
      const score = u.computedScores[0];
      const bucket = score ? sapaBucket(score.sapa_factor) : null;
      if (!bucket) continue;
      // A CASU Anchor covering more than one field counts toward each of them.
      for (const key of groupKeysFn(u, score)) {
        groups[key] ??= { over: 0, aligned: 0, under: 0, sapaSum: 0, sapaCount: 0, members: { over: [], aligned: [], under: [] } };
        groups[key][bucket] += 1;
        groups[key].sapaSum += Number(score.sapa_factor);
        groups[key].sapaCount += 1;
        groups[key].members[bucket].push({ id: u.id, name: u.name, sapa: Math.round(Number(score.sapa_factor) * 100) / 100 });
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
    // Frozen-at-compute-time field, falling back to the live one for rows
    // computed before this snapshot existed — see getFieldHeatmap above.
    byField: distribute((u, score) => {
      const field = score.field || u.field;
      return field ? fieldList(field) : ["—"];
    }),
  };
}

/**
 * §4.6.02 Quadrant Analysis: X = avg peer score, Y = sentiment of qualitative
 * feedback received. Sentiment is a lightweight heuristic (no NLP model
 * available in this stack): blends the week-over-week Trajectory answers
 * (Improved/Stayed the Same/Declined) with the strength-vs-weakness tag
 * balance, both from peer submissions for the given week. Replace with a
 * real sentiment model if/when available.
 */
export async function getQuadrantData(projectId, weekId, scope) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, ...roleFilterForScope(scope) },
    include: {
      computedScores: { where: { week_id: weekId } },
      evaluationsReceived: {
        where: { week_id: weekId, eval_type: "peer" },
        select: { trajectory: true, strengths_tags: true, weakness_tags: true },
      },
    },
  });

  return users
    .map((u) => {
      const score = u.computedScores[0];
      if (!score) return null;
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
        field: score.field || u.field, // frozen at compute time; see getFieldHeatmap
        performance: Number(score.total_peer), // X axis, out of 49
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
 * each of the 7 parameters, for one week. Complements the heatmap (which
 * only shows peer-score magnitude): this answers "how many people are
 * aligned/have some gap/have a large gap" on each parameter, team-wide.
 */
export async function getParameterAlignment(projectId, weekId, scope) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
    include: { computedScores: { where: { week_id: weekId } } },
  });

  const buckets = Object.fromEntries(PARAM_FIELDS.map((p) => [p.key, { aligned: 0, someGap: 0, largeGap: 0 }]));
  for (const u of users) {
    const score = u.computedScores[0];
    if (!score) continue;
    for (const p of PARAM_FIELDS) {
      const diff = Math.abs(Number(score[`${p.key}_self`]) - Number(score[`${p.key}_peer`]));
      buckets[p.key][gapBucket(diff)] += 1;
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
export async function getParameterAlignmentTrend(projectId, weekIds, scope) {
  const weeks = await prisma.week.findMany({
    where: { id: { in: weekIds }, project_id: projectId },
    orderBy: { week_number: "asc" },
  });
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
    include: { computedScores: { where: { week_id: { in: weekIds } } } },
  });

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

/**
 * Team Strengths & Growth Areas — strengths/weakness tag frequency across
 * every peer evaluation received for one week, team-wide (scoped the same
 * way as the other aggregate views).
 */
export async function getTeamTagFrequency(projectId, weekId, scope) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
    include: {
      evaluationsReceived: {
        where: { week_id: weekId, eval_type: "peer" },
        select: { strengths_tags: true, weakness_tags: true },
      },
    },
  });

  const strengthFreq = {};
  const weaknessFreq = {};
  for (const u of users) {
    for (const e of u.evaluationsReceived) {
      for (const tag of e.strengths_tags) strengthFreq[tag] = (strengthFreq[tag] || 0) + 1;
      for (const tag of e.weakness_tags) weaknessFreq[tag] = (weaknessFreq[tag] || 0) + 1;
    }
  }

  const topSorted = (freq) =>
    Object.entries(freq)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

  return { strengths: topSorted(strengthFreq), weaknesses: topSorted(weaknessFreq) };
}

const TAG_TREND_TOP_N = 5;

/**
 * Same idea as getTeamTagFrequency, but tracked over several weeks — picks
 * a FIXED top-N set of tags (by total frequency across the whole selected
 * range) so the trend lines track the same tags week to week, rather than
 * whichever tags happened to be #1-5 in any single week.
 */
export async function getTeamTagTrend(projectId, weekIds, scope) {
  const weeks = await prisma.week.findMany({
    where: { id: { in: weekIds }, project_id: projectId },
    orderBy: { week_number: "asc" },
  });
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
    include: {
      evaluationsReceived: {
        where: { week_id: { in: weekIds }, eval_type: "peer" },
        select: { week_id: true, strengths_tags: true, weakness_tags: true },
      },
    },
  });

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
  "he", "she", "they", "his", "her", "as", "yet", "some", "cases", "while", "working", "from",
  "it", "its", "at", "by", "or", "but", "not", "also", "you", "your", "i", "we", "our", "us",
  "has", "have", "had", "do", "does", "did", "been", "being", "was", "were", "will", "shall",
  "may", "might", "must", "than", "so", "if", "about", "into", "up", "down", "out", "over",
  "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how",
  "all", "any", "both", "each", "few", "most", "other", "such", "no", "nor", "only", "own",
  "same", "too", "very", "just", "don", "now", "improve", "improving", "improved", "improvement",
  "area", "areas", "things", "thing", "help", "work", "good", "well", "him", "one", "upon",
]);

function tokenizeSuggestion(text) {
  return (text.toLowerCase().match(/[a-z']+/g) || []).filter((w) => w.length >= 3 && !SUGGESTION_STOPWORDS.has(w));
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
const CLUSTER_JACCARD_THRESHOLD = 0.3;

/**
 * Groups near-duplicate free-text suggestions together by word overlap
 * (Jaccard similarity on stopword-stripped tokens) — no NLP/ML service
 * available in this stack, so this only catches suggestions worded
 * similarly to each other, not ones that are merely related in meaning.
 * Each cluster is compared against the FIRST suggestion that started it
 * (not a running union of every member added since), so a cluster's
 * definition stays anchored instead of drifting as it grows.
 */
function clusterSuggestions(texts) {
  const clusters = []; // { anchorTokens, texts: Map<text, count> }
  for (const text of texts) {
    const tokens = tokenizeSuggestion(text);
    if (tokens.length === 0) continue;
    let cluster = clusters.find((c) => jaccardSimilarity(tokens, c.anchorTokens) >= CLUSTER_JACCARD_THRESHOLD);
    if (!cluster) {
      cluster = { anchorTokens: tokens, texts: new Map() };
      clusters.push(cluster);
    }
    cluster.texts.set(text, (cluster.texts.get(text) || 0) + 1);
  }
  return clusters
    .map((c) => {
      const count = [...c.texts.values()].reduce((a, b) => a + b, 0);
      const representative = [...c.texts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { anchorTokens: c.anchorTokens, representative, count };
    })
    .sort((a, b) => b.count - a.count);
}

const FOCUS_SUGGESTIONS_TOP_N = 8;

/**
 * What the team should focus on — the most-repeated peer "single most
 * impactful action" suggestions, clustered by near-duplicate wording rather
 * than reduced to a bag of individual words (a word cloud strips exactly the
 * context that makes a short free-text answer actionable). Each returned
 * cluster also reports how many SELF-evaluations that same week raised a
 * similarly-worded suggestion about themselves, as a self-awareness signal —
 * self answers are matched against peer clusters, not clustered on their own.
 */
export async function getTeamFocusSuggestions(projectId, weekId, scope) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
    include: {
      evaluationsReceived: {
        where: { week_id: weekId, eval_type: { in: ["peer", "self"] } },
        select: { eval_type: true, improvement_suggestion: true },
      },
    },
  });

  const peerTexts = [];
  const selfTexts = [];
  for (const u of users) {
    for (const e of u.evaluationsReceived) {
      if (!e.improvement_suggestion) continue;
      (e.eval_type === "peer" ? peerTexts : selfTexts).push(e.improvement_suggestion);
    }
  }

  const peerClusters = clusterSuggestions(peerTexts).slice(0, FOCUS_SUGGESTIONS_TOP_N);
  const selfTokenized = selfTexts.map(tokenizeSuggestion);

  const items = peerClusters.map((c) => {
    const selfOverlapCount = selfTokenized.filter(
      (tokens) => jaccardSimilarity(tokens, c.anchorTokens) >= CLUSTER_JACCARD_THRESHOLD
    ).length;
    return {
      text: c.representative,
      count: c.count,
      pct: peerTexts.length ? Math.round((c.count / peerTexts.length) * 100) : 0,
      selfOverlapCount,
      selfOverlapPct: selfTexts.length ? Math.round((selfOverlapCount / selfTexts.length) * 100) : 0,
    };
  });

  return { items, totalPeerSuggestions: peerTexts.length, totalSelfSuggestions: selfTexts.length };
}

/**
 * Team Momentum — what fraction of peer Trajectory answers this week said
 * Improved / Stayed the Same / Declined, team-wide. "not_applicable" (first
 * scored week for that pairing) is tracked but excluded from the scored
 * total, same convention as the Quadrant sentiment heuristic.
 */
export async function getTeamTrajectory(projectId, weekId, scope) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: ROLES.ADMIN }, ...roleFilterForScope(scope) },
    include: {
      evaluationsReceived: {
        where: { week_id: weekId, eval_type: "peer" },
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
      field: u.field,
      totalPeer: totalPeer === null ? null : Math.round(totalPeer * 100) / 100,
      totalSelf: totalSelf === null ? null : Math.round(totalSelf * 100) / 100,
      weeksCounted: scores.length,
    };
  });
}

export async function getRankings(projectId, requester, weekIds) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: ROLES.ADMIN } },
    include: { computedScores: { where: { week_id: { in: weekIds } } } },
  });

  const withAvg = averageScoresByUser(users, weekIds);
  const rank = rankByTotalPeer;

  let field = null;
  if (requester.field) {
    const fieldPool = rank(withAvg.filter((u) => sharesField(requester, u)));
    const mine = fieldPool.find((u) => u.id === requester.id);
    const canSeeFieldList = [ROLES.GROUP_ANCHOR, ROLES.CASU_ANCHOR, ROLES.CASU_LEAD, ROLES.ADMIN].includes(
      requester.role
    );
    field = {
      myRank: mine?.rank ?? null,
      totalInField: fieldPool.length,
      list: canSeeFieldList ? fieldPool : null,
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
      user: { project_id: projectId, is_active: true, role: { not: ROLES.ADMIN } },
    },
    select: { week_id: true, user_id: true, total_peer: true, user: { select: { field: true } } },
  });

  const byWeek = new Map();
  for (const s of scores) {
    if (!byWeek.has(s.week_id)) byWeek.set(s.week_id, []);
    byWeek.get(s.week_id).push(s);
  }

  return weeks.map((w) => {
    const rows = byWeek.get(w.id) || [];
    const mine = rows.find((r) => r.user_id === targetUser.id);
    const fieldRows = targetUser.field ? rows.filter((r) => sharesField(targetUser, r.user)) : [];
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
      is_active: true,
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
    for (const field of fieldList(u.field)) {
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
      is_active: true,
      role: { not: ROLES.ADMIN },
      field: { not: null },
      ...roleFilterForScope(scope),
    },
    include: { computedScores: { where: { week_id: { in: weekIds } } } },
  });

  // A CASU Anchor's `field` may be comma-joined (covers more than one field),
  // so this can't be a plain Prisma equality filter — filter in application code.
  const inField = users.filter((u) => fieldList(u.field).includes(field));
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
  const scores = await prisma.computedScore.findMany({
    where: {
      week_id: { in: weekIds },
      user: { project_id: projectId, is_active: true, role: { not: ROLES.ADMIN } },
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

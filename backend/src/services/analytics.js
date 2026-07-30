// Admin Analytics Dashboard — Technical Spec §4.6.
import { prisma } from "../utils/prisma.js";
import { roleFilterForScope, analyticsScope } from "./access.js";
import { ROLES } from "../utils/roles.js";

const PEER_PARAM_COLUMNS = {
  Sincerity: "sincerity_peer",
  "Team Spirit": "team_spirit_peer",
  Knowledge: "knowledge_peer",
  Quantity: "quantity_peer",
  Quality: "quality_peer",
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** §4.6.01 Field-Wise Heatmap: 10 fields x 5 parameters, avg peer scores. */
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
    byField[u.field] ??= { count: 0, sums: { Sincerity: 0, "Team Spirit": 0, Knowledge: 0, Quantity: 0, Quality: 0 } };
    byField[u.field].count += 1;
    byField[u.field].sums.Sincerity += Number(score.sincerity_peer);
    byField[u.field].sums["Team Spirit"] += Number(score.team_spirit_peer);
    byField[u.field].sums.Knowledge += Number(score.knowledge_peer);
    byField[u.field].sums.Quantity += Number(score.quantity_peer);
    byField[u.field].sums.Quality += Number(score.quality_peer);
  }

  return Object.entries(byField).map(([field, { count, sums }]) => {
    const row = { field };
    let total = 0;
    for (const param of Object.keys(PEER_PARAM_COLUMNS)) {
      const avg = count > 0 ? sums[param] / count : 0;
      row[param] = Math.round(avg * 100) / 100;
      total += avg;
    }
    row.avg = Math.round((total / 5) * 100) / 100;
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

  function distribute(groupKeyFn) {
    const groups = {};
    for (const u of users) {
      const score = u.computedScores[0];
      const bucket = score ? sapaBucket(score.sapa_factor) : null;
      if (!bucket) continue;
      const key = groupKeyFn(u);
      groups[key] ??= { over: 0, aligned: 0, under: 0, sapaSum: 0, sapaCount: 0 };
      groups[key][bucket] += 1;
      groups[key].sapaSum += Number(score.sapa_factor);
      groups[key].sapaCount += 1;
    }
    return Object.entries(groups).map(([key, g]) => {
      const total = g.over + g.aligned + g.under;
      return {
        key,
        over: total ? Math.round((g.over / total) * 100) : 0,
        aligned: total ? Math.round((g.aligned / total) * 100) : 0,
        under: total ? Math.round((g.under / total) * 100) : 0,
        avg: g.sapaCount ? Math.round((g.sapaSum / g.sapaCount) * 1000) / 1000 : null,
      };
    });
  }

  return {
    byRole: distribute((u) => u.role),
    byField: distribute((u) => u.field || "—"),
  };
}

/**
 * §4.6.02 Quadrant Analysis: X = avg peer score, Y = sentiment of qualitative
 * feedback received. Sentiment is a lightweight heuristic (no NLP model
 * available in this stack): blends the Problem-Solving satisfied/not-satisfied
 * ratio with the strength-vs-weakness tag balance, both from peer submissions
 * for the given week. Replace with a real sentiment model if/when available.
 */
export async function getQuadrantData(projectId, weekId, scope) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, ...roleFilterForScope(scope) },
    include: {
      computedScores: { where: { week_id: weekId } },
      evaluationsReceived: {
        where: { week_id: weekId, eval_type: "peer" },
        select: { problem_solving: true, strengths_tags: true, weakness_tags: true },
      },
    },
  });

  return users
    .map((u) => {
      const score = u.computedScores[0];
      if (!score) return null;
      const peerEvals = u.evaluationsReceived;
      const satisfied = peerEvals.filter((e) => e.problem_solving === "satisfied").length;
      const notSatisfied = peerEvals.length - satisfied;
      const strengthCount = peerEvals.reduce((a, e) => a + e.strengths_tags.length, 0);
      const weaknessCount = peerEvals.reduce((a, e) => a + e.weakness_tags.length, 0);

      const satisfactionSignal = peerEvals.length ? (satisfied - notSatisfied) / peerEvals.length : 0;
      const tagSignal =
        strengthCount + weaknessCount > 0
          ? (strengthCount - weaknessCount) / (strengthCount + weaknessCount)
          : 0;
      const sentiment = clamp(satisfactionSignal * 0.6 + tagSignal * 0.4, -1, 1);

      return {
        id: u.id,
        name: u.name,
        role: u.role,
        field: u.field,
        performance: Number(score.total_peer), // X axis, out of 25
        sentiment: Math.round(sentiment * 100) / 100, // Y axis, -1..1
      };
    })
    .filter(Boolean);
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
export async function getRankings(projectId, requester, weekIds) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: ROLES.ADMIN } },
    include: { computedScores: { where: { week_id: { in: weekIds } } } },
  });

  const withAvg = users.map((u) => {
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

  function rank(pool) {
    const ranked = pool.filter((u) => u.totalPeer !== null).sort((a, b) => b.totalPeer - a.totalPeer);
    return ranked.map((u, i) => ({ ...u, rank: i + 1, of: ranked.length }));
  }

  let field = null;
  if (requester.field) {
    const fieldPool = rank(withAvg.filter((u) => u.field === requester.field));
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
    include: { user: { select: { id: true, name: true, role: true, field: true } } },
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
              const top = { id: s.user.id, name: s.user.name, field: s.user.field, totalPeer: Number(s.total_peer) };
              return !best || top.totalPeer > best.totalPeer ? top : best;
            }, null);
    }

    for (const s of weekScores) {
      const uid = s.user.id;
      if (!cumulative.has(uid)) {
        cumulative.set(uid, { sum: 0, count: 0, name: s.user.name, role: s.user.role, field: s.user.field });
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
          overallStar = { name: entry.name, role: entry.role, field: entry.field, avgTotalPeer };
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

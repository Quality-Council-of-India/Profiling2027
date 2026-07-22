// Admin Analytics Dashboard — Technical Spec §4.6.
import { prisma } from "../utils/prisma.js";
import { roleFilterForScope } from "./access.js";

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

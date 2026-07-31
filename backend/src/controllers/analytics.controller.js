import { prisma } from "../utils/prisma.js";
import { analyticsScope } from "../services/access.js";
import {
  getFieldHeatmap,
  getSapaDistribution,
  getQuadrantData,
  getRankings,
  getHallOfRecognition,
} from "../services/analytics.js";

async function requireAggregateAccess(req, res) {
  const scope = analyticsScope(req.user);
  if (scope === "personal") {
    res.status(403).json({
      error: "Your role has a personalised analytics view only — use /api/scores/:userId instead",
    });
    return null;
  }
  const weekId = Number(req.params.weekId);
  const week = await prisma.week.findFirst({
    where: { id: weekId, project_id: req.user.project_id },
  });
  if (!week) {
    res.status(404).json({ error: "Week not found" });
    return null;
  }
  return { scope, week };
}

export async function heatmap(req, res) {
  const ctx = await requireAggregateAccess(req, res);
  if (!ctx) return;
  const data = await getFieldHeatmap(req.user.project_id, ctx.week.id, ctx.scope);
  res.json({ week: ctx.week, heatmap: data });
}

export async function sapaDistribution(req, res) {
  const ctx = await requireAggregateAccess(req, res);
  if (!ctx) return;
  const data = await getSapaDistribution(req.user.project_id, ctx.week.id, ctx.scope);
  res.json({ week: ctx.week, ...data });
}

export async function quadrant(req, res) {
  const ctx = await requireAggregateAccess(req, res);
  if (!ctx) return;
  const data = await getQuadrantData(req.user.project_id, ctx.week.id, ctx.scope);
  res.json({ week: ctx.week, points: data });
}

/**
 * Rankings by Total Peer Score — available to every role (unlike the
 * aggregate endpoints above, since a Profiler's own rank/of-count doesn't
 * expose anyone else's individual score; see getRankings for the
 * role-dependent list-visibility rules).
 * ?weeks=1,2,3 — one ID for a single week, several for an averaged/"cumulative" view.
 */
export async function rankings(req, res, next) {
  try {
    const weeksParam = req.query.weeks;
    if (!weeksParam) {
      return res.status(400).json({ error: "Provide one or more week IDs via ?weeks=1,2,3" });
    }
    const weekIds = String(weeksParam)
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));
    if (weekIds.length === 0) {
      return res.status(400).json({ error: "No valid week IDs provided" });
    }

    const weeks = await prisma.week.findMany({
      where: { id: { in: weekIds }, project_id: req.user.project_id },
      orderBy: { week_number: "asc" },
    });
    if (weeks.length === 0) {
      return res.status(404).json({ error: "No matching weeks found" });
    }

    const data = await getRankings(
      req.user.project_id,
      req.user,
      weeks.map((w) => w.id)
    );
    res.json({ weeksUsed: weeks, ...data });
  } catch (err) {
    next(err);
  }
}

/** Hall of Recognition — per-role weekly stars + cumulative Overall Star Performer. Visible to every role. */
export async function hallOfRecognition(req, res) {
  const data = await getHallOfRecognition(req.user.project_id);
  res.json(data);
}

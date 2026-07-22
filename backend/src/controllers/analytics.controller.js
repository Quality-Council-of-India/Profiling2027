import { prisma } from "../utils/prisma.js";
import { analyticsScope } from "../services/access.js";
import { getFieldHeatmap, getSapaDistribution, getQuadrantData } from "../services/analytics.js";

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

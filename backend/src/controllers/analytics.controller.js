import { prisma } from "../utils/prisma.js";
import { analyticsScope, canViewUser } from "../services/access.js";
import {
  getFieldHeatmap,
  getSapaDistribution,
  getQuadrantData,
  getParameterAlignment,
  getParameterAlignmentTrend,
  getTeamTagFrequency,
  getTeamTagTrend,
  getTeamFocusSuggestions,
  getTeamTrajectory,
  getRankings,
  getFieldStandings,
  getFieldMemberStandings,
  getHallOfRecognition,
  getPeerScoreTrendComparison,
} from "../services/analytics.js";

/** Parses "?weeks=1,2,3" into a validated array of week IDs, or returns null (and responds) on failure. */
function parseWeekIdsParam(req, res) {
  const weeksParam = req.query.weeks;
  if (!weeksParam) {
    res.status(400).json({ error: "Provide one or more week IDs via ?weeks=1,2,3" });
    return null;
  }
  const weekIds = String(weeksParam)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));
  if (weekIds.length === 0) {
    res.status(400).json({ error: "No valid week IDs provided" });
    return null;
  }
  return weekIds;
}

/**
 * Shared access+week-range check for every Team-Wide Analytics card.
 * ?weeks=1,2,3 — one week for that week's numbers, several (including a
 * "Cumulative" selection of every closed week) for an all-time combined
 * view — same "one-or-more week IDs" contract as rankings/fieldStandings.
 */
async function requireAggregateAccess(req, res) {
  const scope = analyticsScope(req.user);
  if (scope === "personal") {
    res.status(403).json({
      error: "Your role has a personalised analytics view only — use /api/scores/:userId instead",
    });
    return null;
  }
  const weekIds = parseWeekIdsParam(req, res);
  if (!weekIds) return null;
  const weeks = await prisma.week.findMany({
    where: { id: { in: weekIds }, project_id: req.user.project_id },
    orderBy: { week_number: "asc" },
  });
  if (weeks.length === 0) {
    res.status(404).json({ error: "No matching weeks found" });
    return null;
  }
  return { scope, weeks, weekIds: weeks.map((w) => w.id) };
}

export async function heatmap(req, res) {
  const ctx = await requireAggregateAccess(req, res);
  if (!ctx) return;
  const data = await getFieldHeatmap(req.user.project_id, ctx.weekIds, ctx.scope);
  res.json({ weeks: ctx.weeks, heatmap: data });
}

/** ?field=Arts — optional, narrows to just that field (see filterByField in analytics.js). Unset/empty means every field. */
function parseFieldParam(req) {
  const field = req.query.field ? String(req.query.field).trim() : "";
  return field || null;
}

export async function sapaDistribution(req, res) {
  const ctx = await requireAggregateAccess(req, res);
  if (!ctx) return;
  const data = await getSapaDistribution(req.user.project_id, ctx.weekIds, ctx.scope, parseFieldParam(req));
  res.json({ weeks: ctx.weeks, ...data });
}

export async function quadrant(req, res) {
  const ctx = await requireAggregateAccess(req, res);
  if (!ctx) return;
  const data = await getQuadrantData(req.user.project_id, ctx.weekIds, ctx.scope, parseFieldParam(req));
  res.json({ weeks: ctx.weeks, points: data });
}

export async function parameterAlignment(req, res) {
  const ctx = await requireAggregateAccess(req, res);
  if (!ctx) return;
  const data = await getParameterAlignment(req.user.project_id, ctx.weekIds, ctx.scope, parseFieldParam(req));
  res.json({ weeks: ctx.weeks, alignment: data });
}

/** ?weeks=1,2,3&field=Arts — % Aligned per parameter, one point per week, for the trend chart shown when multiple weeks are selected. */
export async function parameterAlignmentTrend(req, res, next) {
  try {
    const scope = analyticsScope(req.user);
    if (scope === "personal") {
      return res.status(403).json({ error: "Your role has a personalised analytics view only" });
    }
    const weekIds = parseWeekIdsParam(req, res);
    if (!weekIds) return;
    const weeks = await prisma.week.findMany({ where: { id: { in: weekIds }, project_id: req.user.project_id } });
    if (weeks.length === 0) return res.status(404).json({ error: "No matching weeks found" });

    const trend = await getParameterAlignmentTrend(
      req.user.project_id,
      weeks.map((w) => w.id),
      scope,
      parseFieldParam(req)
    );
    res.json({ trend });
  } catch (err) {
    next(err);
  }
}

export async function teamTags(req, res) {
  const ctx = await requireAggregateAccess(req, res);
  if (!ctx) return;
  const data = await getTeamTagFrequency(req.user.project_id, ctx.weekIds, ctx.scope, parseFieldParam(req));
  res.json({ weeks: ctx.weeks, ...data });
}

/** ?weeks=1,2,3&field=Arts — top strength/weakness tag counts per week, for the trend chart shown when multiple weeks are selected. */
export async function teamTagTrend(req, res, next) {
  try {
    const scope = analyticsScope(req.user);
    if (scope === "personal") {
      return res.status(403).json({ error: "Your role has a personalised analytics view only" });
    }
    const weekIds = parseWeekIdsParam(req, res);
    if (!weekIds) return;
    const weeks = await prisma.week.findMany({ where: { id: { in: weekIds }, project_id: req.user.project_id } });
    if (weeks.length === 0) return res.status(404).json({ error: "No matching weeks found" });

    const data = await getTeamTagTrend(
      req.user.project_id,
      weeks.map((w) => w.id),
      scope,
      parseFieldParam(req)
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function teamFocusSuggestions(req, res) {
  const ctx = await requireAggregateAccess(req, res);
  if (!ctx) return;
  const data = await getTeamFocusSuggestions(req.user.project_id, ctx.weekIds, ctx.scope, parseFieldParam(req));
  res.json({ weeks: ctx.weeks, ...data });
}

export async function teamTrajectory(req, res) {
  const ctx = await requireAggregateAccess(req, res);
  if (!ctx) return;
  const data = await getTeamTrajectory(req.user.project_id, ctx.weekIds, ctx.scope);
  res.json({ weeks: ctx.weeks, ...data });
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

/**
 * Field-Wise Standing — a leaderboard of fields, not individuals. For
 * Admin/CASU Lead/Project Lead, who don't belong to a single field and so
 * have no personal "standing in your field" to show.
 * ?weeks=1,2,3 — one ID for a single week, several for an averaged view.
 */
export async function fieldStandings(req, res, next) {
  try {
    const scope = analyticsScope(req.user);
    if (scope === "personal") {
      return res.status(403).json({ error: "Your role has a personal field standing instead — use rankings" });
    }
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
    });
    if (weeks.length === 0) {
      return res.status(404).json({ error: "No matching weeks found" });
    }

    const standings = await getFieldStandings(
      req.user.project_id,
      weeks.map((w) => w.id),
      scope
    );
    res.json({ standings });
  } catch (err) {
    next(err);
  }
}

/**
 * Field-Wise Standing drilled into one field — the individual ranked list
 * of every user in that field. Same access rule as fieldStandings (Admin/
 * CASU Lead/Project Lead only, since they have no personal field of their own).
 * ?weeks=1,2,3&field=Arts
 */
export async function fieldMemberRankings(req, res, next) {
  try {
    const scope = analyticsScope(req.user);
    if (scope === "personal") {
      return res.status(403).json({ error: "Your role has a personal field standing instead — use rankings" });
    }
    const field = req.query.field ? String(req.query.field) : "";
    if (!field) {
      return res.status(400).json({ error: "Provide a field via ?field=" });
    }
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
    });
    if (weeks.length === 0) {
      return res.status(404).json({ error: "No matching weeks found" });
    }

    const list = await getFieldMemberStandings(
      req.user.project_id,
      weeks.map((w) => w.id),
      field,
      scope
    );
    res.json({ field, list });
  } catch (err) {
    next(err);
  }
}

/**
 * Week-on-week Total Peer Score comparison for the Analytics tab's line
 * graph — the requester's own score vs their sub-field average vs the
 * overall team average, one point per open/closed week.
 */
export async function peerTrend(req, res) {
  const userId = Number(req.params.userId);
  const target = await prisma.user.findFirst({
    where: { id: userId, project_id: req.user.project_id },
  });
  if (!target) return res.status(404).json({ error: "User not found" });
  if (!canViewUser(req.user, target)) {
    return res.status(403).json({ error: "You cannot view this user's scores" });
  }
  const trend = await getPeerScoreTrendComparison(req.user.project_id, target);
  res.json({ user: { id: target.id, name: target.name, field: target.field }, trend });
}

/** Hall of Recognition — per-role weekly stars + cumulative Overall Star Performer. Visible to every role. */
export async function hallOfRecognition(req, res) {
  const data = await getHallOfRecognition(req.user.project_id);
  res.json(data);
}

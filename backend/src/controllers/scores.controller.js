import { prisma } from "../utils/prisma.js";
import { canViewUser, canViewFieldTeam } from "../services/access.js";
import { getSubjectiveSummary } from "../services/evaluations.js";

export async function getUserWeekScore(req, res) {
  const userId = Number(req.params.userId);
  const weekId = Number(req.params.weekId);

  const target = await prisma.user.findFirst({
    where: { id: userId, project_id: req.user.project_id },
  });
  if (!target) return res.status(404).json({ error: "User not found" });
  if (!canViewUser(req.user, target)) {
    return res.status(403).json({ error: "You cannot view this user's scores" });
  }

  const [week, computed, subjective] = await Promise.all([
    prisma.week.findFirst({ where: { id: weekId, project_id: req.user.project_id } }),
    prisma.computedScore.findUnique({
      where: { week_id_user_id: { week_id: weekId, user_id: userId } },
    }),
    getSubjectiveSummary(weekId, userId),
  ]);
  if (!week) return res.status(404).json({ error: "Week not found" });

  res.json({
    week,
    user: { id: target.id, name: target.name, role: target.role, field: target.field },
    computed: computed || null,
    subjective,
  });
}

export async function getUserTrend(req, res) {
  const userId = Number(req.params.userId);

  const target = await prisma.user.findFirst({
    where: { id: userId, project_id: req.user.project_id },
  });
  if (!target) return res.status(404).json({ error: "User not found" });
  if (!canViewUser(req.user, target)) {
    return res.status(403).json({ error: "You cannot view this user's scores" });
  }

  const scores = await prisma.computedScore.findMany({
    where: { user_id: userId, week: { project_id: req.user.project_id } },
    include: { week: true },
    orderBy: { week: { week_number: "asc" } },
  });

  res.json({
    user: { id: target.id, name: target.name, role: target.role, field: target.field },
    trend: scores.map((s) => ({
      week: s.week.label,
      week_number: s.week.week_number,
      sincerity_self: s.sincerity_self,
      sincerity_peer: s.sincerity_peer,
      team_spirit_self: s.team_spirit_self,
      team_spirit_peer: s.team_spirit_peer,
      knowledge_self: s.knowledge_self,
      knowledge_peer: s.knowledge_peer,
      quantity_self: s.quantity_self,
      quantity_peer: s.quantity_peer,
      quality_self: s.quality_self,
      quality_peer: s.quality_peer,
      total_self: s.total_self,
      total_peer: s.total_peer,
      peer_count: s.peer_count,
      expected_peer_count: s.expected_peer_count,
      sapa_factor: s.sapa_factor,
    })),
  });
}

export async function getFieldScores(req, res) {
  const field = req.params.field;
  const weekId = Number(req.params.weekId);

  if (!canViewFieldTeam(req.user, field)) {
    return res.status(403).json({ error: "You cannot view this field's team scores" });
  }

  const week = await prisma.week.findFirst({
    where: { id: weekId, project_id: req.user.project_id },
  });
  if (!week) return res.status(404).json({ error: "Week not found" });

  const users = await prisma.user.findMany({
    where: { project_id: req.user.project_id, field, is_active: true },
    include: {
      computedScores: { where: { week_id: weekId } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  res.json({
    week,
    field,
    members: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      computed: u.computedScores[0] || null,
    })),
  });
}

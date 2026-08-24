import { prisma } from "../utils/prisma.js";
import { canViewUser, teamViewFilter } from "../services/access.js";
import { getSubjectiveSummary } from "../services/evaluations.js";
import { PARAM_FIELDS } from "../utils/constants.js";

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
    trend: scores.map((s) => {
      const row = { week: s.week.label, week_number: s.week.week_number };
      for (const p of PARAM_FIELDS) {
        row[`${p.key}_self`] = s[`${p.key}_self`];
        row[`${p.key}_peer`] = s[`${p.key}_peer`];
      }
      row.total_self = s.total_self;
      row.total_peer = s.total_peer;
      row.peer_count = s.peer_count;
      row.expected_peer_count = s.expected_peer_count;
      row.sapa_factor = s.sapa_factor;
      return row;
    }),
  });
}

/**
 * Team View — §Team View tab. Membership is derived entirely from the
 * requester's own role (see teamViewFilter), not a field the client picks:
 * a Group Anchor automatically sees their field's Profilers, a Project
 * Lead automatically sees every Profiler + Group Anchor + the other
 * Project Lead(s), and so on up the hierarchy.
 */
/**
 * Multi-week history of a person's own Self-Evaluation (Part II subjective
 * answers) — trajectory, strengths/weakness tags, and improvement plan for
 * every week they've submitted one. Complements getUserTrend (Part I
 * quantitative scores only) in Analytics.
 */
export async function getUserSelfEvalHistory(req, res) {
  const userId = Number(req.params.userId);

  const target = await prisma.user.findFirst({
    where: { id: userId, project_id: req.user.project_id },
  });
  if (!target) return res.status(404).json({ error: "User not found" });
  if (!canViewUser(req.user, target)) {
    return res.status(403).json({ error: "You cannot view this user's scores" });
  }

  const evaluations = await prisma.evaluation.findMany({
    where: { evaluator_id: userId, evaluatee_id: userId, eval_type: "self", week: { project_id: req.user.project_id } },
    include: { week: true },
    orderBy: { week: { week_number: "asc" } },
  });

  res.json({
    history: evaluations.map((e) => ({
      week: { id: e.week.id, label: e.week.label, week_number: e.week.week_number },
      trajectory: e.trajectory,
      strengths_tags: e.strengths_tags,
      weakness_tags: e.weakness_tags,
      strengths_other_text: e.strengths_other_text,
      weakness_other_text: e.weakness_other_text,
      improvement_suggestion: e.improvement_suggestion,
    })),
  });
}

export async function getTeamScores(req, res) {
  const weekId = Number(req.params.weekId);

  const filter = teamViewFilter(req.user);
  if (!filter) {
    return res.status(403).json({ error: "Your role does not have a Team View" });
  }

  const week = await prisma.week.findFirst({
    where: { id: weekId, project_id: req.user.project_id },
  });
  if (!week) return res.status(404).json({ error: "Week not found" });

  const users = await prisma.user.findMany({
    where: { project_id: req.user.project_id, is_active: true, ...filter },
    include: {
      computedScores: { where: { week_id: weekId } },
    },
    orderBy: [{ field: "asc" }, { role: "asc" }, { name: "asc" }],
  });

  res.json({
    week,
    members: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      field: u.field,
      computed: u.computedScores[0] || null,
    })),
  });
}

import { prisma } from "../utils/prisma.js";
import { canViewCompliance, canViewTrajectoryMismatches } from "../services/access.js";
import { buildComplianceMatrix, sendComplianceReminders, getTrajectoryMismatches } from "../services/compliance.js";

export async function getCompliance(req, res) {
  if (!canViewCompliance(req.user)) {
    return res.status(403).json({ error: "You cannot view the compliance tracker" });
  }
  const weekId = Number(req.params.weekId);
  const week = await prisma.week.findFirst({
    where: { id: weekId, project_id: req.user.project_id },
  });
  if (!week) return res.status(404).json({ error: "Week not found" });

  // null (not []) for anyone without access — the frontend tells "not
  // permitted" apart from "permitted, zero mismatches this week" by that.
  const [matrix, trajectoryMismatches] = await Promise.all([
    buildComplianceMatrix(req.user.project_id, weekId, week.status),
    canViewTrajectoryMismatches(req.user) ? getTrajectoryMismatches(req.user.project_id, weekId) : null,
  ]);
  res.json({ week, ...matrix, trajectoryMismatches });
}

export async function remindNonCompliant(req, res) {
  if (!canViewCompliance(req.user)) {
    return res.status(403).json({ error: "You cannot send reminders" });
  }
  const weekId = Number(req.params.weekId);
  const week = await prisma.week.findFirst({
    where: { id: weekId, project_id: req.user.project_id },
  });
  if (!week) return res.status(404).json({ error: "Week not found" });

  const result = await sendComplianceReminders(req.user.project_id, weekId, week.label, week.end_date);
  res.json(result);
}

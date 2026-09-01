import { prisma } from "../utils/prisma.js";
import { canViewCompliance } from "../services/access.js";
import { buildComplianceMatrix, sendComplianceReminders } from "../services/compliance.js";

export async function getCompliance(req, res) {
  if (!canViewCompliance(req.user)) {
    return res.status(403).json({ error: "You cannot view the compliance tracker" });
  }
  const weekId = Number(req.params.weekId);
  const week = await prisma.week.findFirst({
    where: { id: weekId, project_id: req.user.project_id },
  });
  if (!week) return res.status(404).json({ error: "Week not found" });

  const matrix = await buildComplianceMatrix(req.user.project_id, weekId, week.status);
  res.json({ week, ...matrix });
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

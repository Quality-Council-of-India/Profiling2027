import { prisma } from "../utils/prisma.js";
import { getPendingForUserWeek } from "../services/evaluations.js";

export async function listWeeks(req, res) {
  const weeks = await prisma.week.findMany({
    where: { project_id: req.user.project_id },
    orderBy: { week_number: "asc" },
  });
  res.json({ weeks });
}

export async function weekStatus(req, res) {
  const weekId = Number(req.params.id);
  const week = await prisma.week.findFirst({
    where: { id: weekId, project_id: req.user.project_id },
  });
  if (!week) return res.status(404).json({ error: "Week not found" });

  const pending = await getPendingForUserWeek(req.user.id, week.id);
  res.json({ week, pending });
}

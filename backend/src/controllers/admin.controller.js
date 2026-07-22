import { prisma } from "../utils/prisma.js";
import { importRoster } from "../services/roster.js";
import { computeScoresForWeek } from "../services/scoreEngine.js";

export async function openWeek(req, res) {
  const weekId = Number(req.params.id);
  const week = await prisma.week.findFirst({
    where: { id: weekId, project_id: req.user.project_id },
  });
  if (!week) return res.status(404).json({ error: "Week not found" });

  const updated = await prisma.week.update({ where: { id: weekId }, data: { status: "open" } });
  res.json({ week: updated });
}

export async function closeWeek(req, res) {
  const weekId = Number(req.params.id);
  const week = await prisma.week.findFirst({
    where: { id: weekId, project_id: req.user.project_id },
  });
  if (!week) return res.status(404).json({ error: "Week not found" });

  const updated = await prisma.week.update({ where: { id: weekId }, data: { status: "closed" } });
  // Final recompute on close so every professional (even non-responders) has a row.
  await computeScoresForWeek(weekId, req.user.project_id);
  res.json({ week: updated });
}

export async function importRosterHandler(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Upload a CSV file under the 'roster' field" });
    }
    const csvText = req.file.buffer.toString("utf-8");
    const result = await importRoster(req.user.project_id, csvText);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

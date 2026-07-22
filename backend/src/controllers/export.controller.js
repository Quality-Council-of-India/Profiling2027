import { prisma } from "../utils/prisma.js";
import { buildWeekScoreWorkbook, buildCombinedScoreWorkbook } from "../services/export.js";

async function streamWorkbook(res, workbook, filename) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function exportWeekScores(req, res, next) {
  try {
    const weekId = Number(req.params.weekId);
    const week = await prisma.week.findFirst({
      where: { id: weekId, project_id: req.user.project_id },
    });
    if (!week) return res.status(404).json({ error: "Week not found" });

    const { workbook, filename } = await buildWeekScoreWorkbook(req.user.project_id, weekId);
    await streamWorkbook(res, workbook, filename);
  } catch (err) {
    next(err);
  }
}

export async function exportCombinedScores(req, res, next) {
  try {
    const { workbook, filename } = await buildCombinedScoreWorkbook(req.user.project_id);
    await streamWorkbook(res, workbook, filename);
  } catch (err) {
    next(err);
  }
}

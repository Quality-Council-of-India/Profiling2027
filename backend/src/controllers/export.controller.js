import { prisma } from "../utils/prisma.js";
import { buildWeekScoreWorkbook, buildCombinedScoreWorkbook } from "../services/export.js";

// Buffered rather than streamed to res — safer across deployment targets
// (works identically under plain Node, Docker, and Vercel's serverless
// Node runtime, where writable-stream response support is less predictable).
async function streamWorkbook(res, workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.end(buffer);
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

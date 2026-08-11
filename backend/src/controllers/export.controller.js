import { prisma } from "../utils/prisma.js";
import { buildWeekScoreWorkbook, buildCombinedScoreWorkbook } from "../services/export.js";
import { buildScorecardDocx } from "../services/scorecard.js";

// Buffered rather than streamed to res — safer across deployment targets
// (works identically under plain Node, Docker, and Vercel's serverless
// Node runtime, where writable-stream response support is less predictable).
export async function streamWorkbook(res, workbook, filename) {
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

/** Own MIS scorecard (.docx) for a closed week — see services/scorecard.js. */
export async function exportScorecard(req, res, next) {
  try {
    const weekId = Number(req.params.weekId);
    const week = await prisma.week.findFirst({ where: { id: weekId, project_id: req.user.project_id } });
    if (!week) return res.status(404).json({ error: "Week not found" });
    if (week.status !== "closed") {
      return res.status(400).json({ error: `${week.label} hasn't closed yet — the scorecard becomes available once Admin closes it.` });
    }

    const result = await buildScorecardDocx(req.user.project_id, req.user, weekId);
    if (!result) return res.status(404).json({ error: "No scorecard available for this week yet" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.end(result.buffer);
  } catch (err) {
    next(err);
  }
}

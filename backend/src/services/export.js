// §4.6.05 Combined Score Sheet export + §5 GET /api/export/scores/:weekId
import ExcelJS from "exceljs";
import { prisma } from "../utils/prisma.js";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
const HEADER_FONT = { color: { argb: "FFFFFFFF" }, bold: true };

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
}

const COLUMNS = [
  { header: "Name", key: "name", width: 24 },
  { header: "Role", key: "role", width: 16 },
  { header: "Field", key: "field", width: 22 },
  { header: "Sincerity (Self)", key: "sincerity_self", width: 14 },
  { header: "Sincerity (Peer)", key: "sincerity_peer", width: 14 },
  { header: "Team Spirit (Self)", key: "team_spirit_self", width: 14 },
  { header: "Team Spirit (Peer)", key: "team_spirit_peer", width: 14 },
  { header: "Knowledge (Self)", key: "knowledge_self", width: 14 },
  { header: "Knowledge (Peer)", key: "knowledge_peer", width: 14 },
  { header: "Quantity (Self)", key: "quantity_self", width: 14 },
  { header: "Quantity (Peer)", key: "quantity_peer", width: 14 },
  { header: "Quality (Self)", key: "quality_self", width: 14 },
  { header: "Quality (Peer)", key: "quality_peer", width: 14 },
  { header: "Total (Self)", key: "total_self", width: 12 },
  { header: "Total (Peer)", key: "total_peer", width: 12 },
  { header: "Peer Responses", key: "peer_count", width: 12 },
  { header: "Expected Peers", key: "expected_peer_count", width: 12 },
  { header: "SAPA Factor", key: "sapa_factor", width: 12 },
];

/** Exports one week's score sheet (replaces the 'Scores for Week XX' tab). */
export async function buildWeekScoreWorkbook(projectId, weekId) {
  const week = await prisma.week.findFirst({ where: { id: weekId, project_id: projectId } });
  const scores = await prisma.computedScore.findMany({
    where: { week_id: weekId },
    include: { user: true },
    orderBy: [{ user: { field: "asc" } }, { user: { role: "asc" } }, { user: { name: "asc" } }],
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(week?.label || `Week ${weekId}`);
  sheet.columns = COLUMNS;

  for (const s of scores) {
    sheet.addRow({
      name: s.user.name,
      role: s.user.role,
      field: s.user.field || "—",
      sincerity_self: Number(s.sincerity_self),
      sincerity_peer: Number(s.sincerity_peer),
      team_spirit_self: Number(s.team_spirit_self),
      team_spirit_peer: Number(s.team_spirit_peer),
      knowledge_self: Number(s.knowledge_self),
      knowledge_peer: Number(s.knowledge_peer),
      quantity_self: Number(s.quantity_self),
      quantity_peer: Number(s.quantity_peer),
      quality_self: Number(s.quality_self),
      quality_peer: Number(s.quality_peer),
      total_self: Number(s.total_self),
      total_peer: Number(s.total_peer),
      peer_count: s.peer_count,
      expected_peer_count: s.expected_peer_count,
      sapa_factor: s.sapa_factor === null ? "" : Number(s.sapa_factor),
    });
  }
  styleHeaderRow(sheet.getRow(1));

  return { workbook, filename: `${(week?.label || "week").replace(/\s+/g, "_")}_scores.xlsx` };
}

/** Combined Score Sheet: average scores across ALL weeks, per professional. */
export async function buildCombinedScoreWorkbook(projectId) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: "admin" } },
    include: { computedScores: { include: { week: true } } },
    orderBy: [{ field: "asc" }, { role: "asc" }, { name: "asc" }],
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Combined Score Sheet");
  sheet.columns = [...COLUMNS, { header: "Weeks Included", key: "weeks", width: 14 }];

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  for (const u of users) {
    const scored = u.computedScores.filter((s) => s.week); // guard against orphaned rows
    if (scored.length === 0) continue;
    const col = (field) => scored.map((s) => Number(s[field]));
    const sapaValues = scored.map((s) => s.sapa_factor).filter((v) => v !== null).map(Number);

    sheet.addRow({
      name: u.name,
      role: u.role,
      field: u.field || "—",
      sincerity_self: round2(avg(col("sincerity_self"))),
      sincerity_peer: round2(avg(col("sincerity_peer"))),
      team_spirit_self: round2(avg(col("team_spirit_self"))),
      team_spirit_peer: round2(avg(col("team_spirit_peer"))),
      knowledge_self: round2(avg(col("knowledge_self"))),
      knowledge_peer: round2(avg(col("knowledge_peer"))),
      quantity_self: round2(avg(col("quantity_self"))),
      quantity_peer: round2(avg(col("quantity_peer"))),
      quality_self: round2(avg(col("quality_self"))),
      quality_peer: round2(avg(col("quality_peer"))),
      total_self: round2(avg(col("total_self"))),
      total_peer: round2(avg(col("total_peer"))),
      peer_count: Math.round(avg(col("peer_count"))),
      expected_peer_count: Math.round(avg(col("expected_peer_count"))),
      sapa_factor: sapaValues.length ? round2(avg(sapaValues)) : "",
      weeks: scored.length,
    });
  }
  styleHeaderRow(sheet.getRow(1));

  return { workbook, filename: "combined_score_sheet.xlsx" };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

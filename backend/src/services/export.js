// §4.6.05 Combined Score Sheet export + §5 GET /api/export/scores/:weekId
import ExcelJS from "exceljs";
import { prisma } from "../utils/prisma.js";
import { getSubjectiveSummaryBatch } from "./evaluations.js";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
const HEADER_FONT = { color: { argb: "FFFFFFFF" }, bold: true };
const WRAP_ALIGNMENT = { vertical: "top", wrapText: true };

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
  { header: "Problem Solving (Self)", key: "self_problem_solving", width: 16 },
  { header: "Problem Solving (Peer)", key: "peer_problem_solving", width: 22 },
  { header: "Strength (Self)", key: "self_strength", width: 34 },
  { header: "Strength (Peer)", key: "peer_strength", width: 40 },
  { header: "Weakness (Self)", key: "self_weakness", width: 34 },
  { header: "Weakness (Peer)", key: "peer_weakness", width: 40 },
];

const WRAPPING_KEYS = ["self_strength", "peer_strength", "self_weakness", "peer_weakness"];

function applyWrap(row) {
  for (const key of WRAPPING_KEYS) {
    row.getCell(key).alignment = WRAP_ALIGNMENT;
  }
}

/** Exports one week's score sheet (replaces the 'Scores for Week XX' tab). */
export async function buildWeekScoreWorkbook(projectId, weekId) {
  const week = await prisma.week.findFirst({ where: { id: weekId, project_id: projectId } });
  const scores = await prisma.computedScore.findMany({
    where: { week_id: weekId },
    include: { user: true },
    orderBy: [{ user: { field: "asc" } }, { user: { role: "asc" } }, { user: { name: "asc" } }],
  });

  const subjective = await getSubjectiveSummaryBatch(weekId, scores.map((s) => s.user_id));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(week?.label || `Week ${weekId}`);
  sheet.columns = COLUMNS;

  for (const s of scores) {
    const subj = subjective.get(s.user_id);
    const row = sheet.addRow({
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
      self_problem_solving: subj?.selfProblemSolving || "",
      peer_problem_solving: subj?.peerProblemSolving || "",
      self_strength: subj?.selfStrength || "",
      peer_strength: subj?.peerStrength || "",
      self_weakness: subj?.selfWeakness || "",
      peer_weakness: subj?.peerWeakness || "",
    });
    applyWrap(row);
  }
  styleHeaderRow(sheet.getRow(1));

  return { workbook, filename: `${(week?.label || "week").replace(/\s+/g, "_")}_scores.xlsx` };
}

/**
 * Combined Score Sheet: average scores across ALL weeks, per professional.
 * Subjective fields are aggregated across weeks the same way the original
 * spreadsheet did — problem-solving counts summed, strength/weakness
 * comments concatenated per week with a "-> WEEK N" prefix so a reader can
 * still tell which week each remark came from.
 */
export async function buildCombinedScoreWorkbook(projectId) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true, role: { not: "admin" } },
    include: { computedScores: { include: { week: true } } },
    orderBy: [{ field: "asc" }, { role: "asc" }, { name: "asc" }],
  });

  const weekIds = [...new Set(users.flatMap((u) => u.computedScores.filter((s) => s.week).map((s) => s.week_id)))];
  const allUserIds = users.map((u) => u.id);

  // One batch subjective-summary call per week (not per user) — cost scales
  // with week count, not roster size.
  const subjectiveByWeek = new Map();
  for (const weekId of weekIds) {
    subjectiveByWeek.set(weekId, await getSubjectiveSummaryBatch(weekId, allUserIds));
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Combined Score Sheet");
  sheet.columns = [...COLUMNS, { header: "Weeks Included", key: "weeks", width: 14 }];

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  for (const u of users) {
    const scored = u.computedScores
      .filter((s) => s.week) // guard against orphaned rows
      .sort((a, b) => a.week.week_number - b.week.week_number);
    if (scored.length === 0) continue;
    const col = (field) => scored.map((s) => Number(s[field]));
    const sapaValues = scored.map((s) => s.sapa_factor).filter((v) => v !== null).map(Number);

    let selfSatisfied = 0;
    let selfNotSatisfied = 0;
    let peerSatisfied = 0;
    let peerNotSatisfied = 0;
    const selfStrengthBlocks = [];
    const peerStrengthBlocks = [];
    const selfWeaknessBlocks = [];
    const peerWeaknessBlocks = [];

    for (const s of scored) {
      const subj = subjectiveByWeek.get(s.week_id)?.get(u.id);
      if (!subj) continue;
      if (subj.selfProblemSolving === "Satisfied") selfSatisfied++;
      else if (subj.selfProblemSolving === "Not Satisfied") selfNotSatisfied++;
      peerSatisfied += subj.peerSatisfiedCount;
      peerNotSatisfied += subj.peerNotSatisfiedCount;

      const label = `-> WEEK ${s.week.week_number}`;
      selfStrengthBlocks.push(`${label}\n\n${subj.selfStrength}`);
      peerStrengthBlocks.push(`${label}\n\n${subj.peerStrength}`);
      selfWeaknessBlocks.push(`${label}\n\n${subj.selfWeakness}`);
      peerWeaknessBlocks.push(`${label}\n\n${subj.peerWeakness}`);
    }

    const row = sheet.addRow({
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
      self_problem_solving:
        selfSatisfied + selfNotSatisfied > 0 ? `Satisfied: ${selfSatisfied} | Not Satisfied: ${selfNotSatisfied}` : "",
      peer_problem_solving:
        peerSatisfied + peerNotSatisfied > 0 ? `Satisfied: ${peerSatisfied} | Not Satisfied: ${peerNotSatisfied}` : "",
      self_strength: selfStrengthBlocks.join("\n"),
      peer_strength: peerStrengthBlocks.join("\n"),
      self_weakness: selfWeaknessBlocks.join("\n"),
      peer_weakness: peerWeaknessBlocks.join("\n"),
      weeks: scored.length,
    });
    applyWrap(row);
  }
  styleHeaderRow(sheet.getRow(1));

  return { workbook, filename: "combined_score_sheet.xlsx" };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const RAW_EVAL_WRAP_KEYS = ["strengths_tags", "weakness_tags", "strength_comment", "weakness_comment", "problem_reason"];

const RAW_EVAL_COLUMNS_PEER = [
  { header: "ID", key: "id", width: 8 },
  { header: "Week", key: "week", width: 12 },
  { header: "Evaluator Name", key: "evaluator_name", width: 22 },
  { header: "Evaluator Role", key: "evaluator_role", width: 16 },
  { header: "Evaluator Field", key: "evaluator_field", width: 20 },
  { header: "Evaluatee Name", key: "evaluatee_name", width: 22 },
  { header: "Evaluatee Role", key: "evaluatee_role", width: 16 },
  { header: "Evaluatee Field", key: "evaluatee_field", width: 20 },
  { header: "Sincerity", key: "sincerity", width: 10 },
  { header: "Team Spirit", key: "team_spirit", width: 10 },
  { header: "Knowledge", key: "knowledge", width: 10 },
  { header: "Quantity", key: "quantity", width: 10 },
  { header: "Quality", key: "quality", width: 10 },
  { header: "Total (this submission)", key: "total", width: 18 },
  { header: "Problem Solving", key: "problem_solving", width: 16 },
  { header: "Problem Reason", key: "problem_reason", width: 30 },
  { header: "Strengths Tags", key: "strengths_tags", width: 34 },
  { header: "Weakness Tags", key: "weakness_tags", width: 34 },
  { header: "Strength Comment", key: "strength_comment", width: 34 },
  { header: "Weakness Comment", key: "weakness_comment", width: 34 },
  { header: "Submitted At", key: "submitted_at", width: 20 },
];

const RAW_EVAL_COLUMNS_SELF = RAW_EVAL_COLUMNS_PEER.filter(
  (c) => !["evaluatee_name", "evaluatee_role", "evaluatee_field"].includes(c.key)
).map((c) => {
  if (c.key === "evaluator_name") return { ...c, header: "Name" };
  if (c.key === "evaluator_role") return { ...c, header: "Role" };
  if (c.key === "evaluator_field") return { ...c, header: "Field" };
  return c;
});

/**
 * Raw per-submission export for the Admin Panel's Raw Data Browser (self or
 * peer evaluations) — one row per response, mirroring a Google Form's
 * "Form Responses" tab rather than the per-person Week Scoresheet above.
 * Flattens quantitative scores into individual columns and adds a
 * per-submission total, rather than the cramped single-cell mini-grid the
 * portal UI uses for on-screen browsing.
 */
export async function buildEvaluationsExportWorkbook(projectId, table, weekId) {
  const isSelf = table === "self_evaluations";
  const evalType = isSelf ? "self" : "peer";
  const where = {
    week: { project_id: projectId },
    eval_type: evalType,
    ...(weekId ? { week_id: weekId } : {}),
  };
  const rows = await prisma.evaluation.findMany({
    where,
    orderBy: [{ week_id: "asc" }, { submitted_at: "desc" }],
    include: {
      week: { select: { label: true } },
      evaluator: { select: { name: true, role: true, field: true } },
      evaluatee: { select: { name: true, role: true, field: true } },
    },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isSelf ? "Self Evaluations" : "Peer Evaluations");
  sheet.columns = isSelf ? RAW_EVAL_COLUMNS_SELF : RAW_EVAL_COLUMNS_PEER;

  for (const r of rows) {
    const data = {
      id: r.id,
      week: r.week?.label || "—",
      evaluator_name: r.evaluator?.name || "—",
      evaluator_role: r.evaluator?.role || "—",
      evaluator_field: r.evaluator?.field || "—",
      sincerity: r.sincerity,
      team_spirit: r.team_spirit,
      knowledge: r.knowledge,
      quantity: r.quantity,
      quality: r.quality,
      total: r.sincerity + r.team_spirit + r.knowledge + r.quantity + r.quality,
      problem_solving: r.problem_solving === "satisfied" ? "Satisfied" : "Not Satisfied",
      problem_reason: r.problem_reason || "",
      strengths_tags: (r.strengths_tags || []).join(", "),
      weakness_tags: (r.weakness_tags || []).join(", "),
      strength_comment: r.strength_comment || "",
      weakness_comment: r.weakness_comment || "",
      submitted_at: r.submitted_at,
    };
    if (!isSelf) {
      data.evaluatee_name = r.evaluatee?.name || "—";
      data.evaluatee_role = r.evaluatee?.role || "—";
      data.evaluatee_field = r.evaluatee?.field || "—";
    }

    const row = sheet.addRow(data);
    row.getCell("submitted_at").numFmt = "yyyy-mm-dd hh:mm";
    for (const key of RAW_EVAL_WRAP_KEYS) {
      row.getCell(key).alignment = WRAP_ALIGNMENT;
    }
  }
  styleHeaderRow(sheet.getRow(1));

  const filename = `${table}${weekId ? `_week${weekId}` : ""}.xlsx`;
  return { workbook, filename };
}

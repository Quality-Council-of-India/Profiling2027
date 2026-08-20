// §4.6.05 Combined Score Sheet export + §5 GET /api/export/scores/:weekId
import ExcelJS from "exceljs";
import { prisma } from "../utils/prisma.js";
import { getSubjectiveSummaryBatch } from "./evaluations.js";
import { PARAM_FIELDS, TRAJECTORY_LABELS } from "../utils/constants.js";

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
  ...PARAM_FIELDS.flatMap((p) => [
    { header: `${p.label} (Self)`, key: `${p.key}_self`, width: 14 },
    { header: `${p.label} (Peer)`, key: `${p.key}_peer`, width: 14 },
  ]),
  { header: "Total (Self)", key: "total_self", width: 12 },
  { header: "Total (Peer)", key: "total_peer", width: 12 },
  { header: "Peer Responses", key: "peer_count", width: 12 },
  { header: "Expected Peers", key: "expected_peer_count", width: 12 },
  { header: "SAPA Factor", key: "sapa_factor", width: 12 },
  { header: "Trajectory (Self)", key: "self_trajectory", width: 16 },
  { header: "Trajectory (Peer)", key: "peer_trajectory", width: 30 },
  { header: "Strengths Tags (Self)", key: "self_strengths_tags", width: 30 },
  { header: "Strengths Tags (Peer)", key: "peer_strengths_tags", width: 40 },
  { header: "Weakness Tags (Self)", key: "self_weakness_tags", width: 30 },
  { header: "Weakness Tags (Peer)", key: "peer_weakness_tags", width: 40 },
  { header: "Improvement Suggestion (Self)", key: "self_suggestion", width: 34 },
  { header: "Improvement Suggestion (Peer)", key: "peer_suggestion", width: 40 },
];

const WRAPPING_KEYS = [
  "peer_trajectory",
  "self_strengths_tags",
  "peer_strengths_tags",
  "self_weakness_tags",
  "peer_weakness_tags",
  "self_suggestion",
  "peer_suggestion",
];

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
    const paramValues = {};
    for (const p of PARAM_FIELDS) {
      paramValues[`${p.key}_self`] = Number(s[`${p.key}_self`]);
      paramValues[`${p.key}_peer`] = Number(s[`${p.key}_peer`]);
    }
    const row = sheet.addRow({
      name: s.user.name,
      role: s.user.role,
      // Frozen at compute time — a later reshuffle shouldn't relabel this
      // week's own export row. Falls back to the current field for rows
      // computed before this snapshot existed.
      field: s.field || s.user.field || "—",
      ...paramValues,
      total_self: Number(s.total_self),
      total_peer: Number(s.total_peer),
      peer_count: s.peer_count,
      expected_peer_count: s.expected_peer_count,
      sapa_factor: s.sapa_factor === null ? "" : Number(s.sapa_factor),
      self_trajectory: subj?.selfTrajectory || "",
      peer_trajectory: subj?.peerTrajectory || "",
      self_strengths_tags: subj?.selfStrengthsTags || "",
      peer_strengths_tags: subj?.peerStrengthsTags || "",
      self_weakness_tags: subj?.selfWeaknessTags || "",
      peer_weakness_tags: subj?.peerWeaknessTags || "",
      self_suggestion: subj?.selfSuggestion || "",
      peer_suggestion: subj?.peerSuggestions || "",
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

    const selfTrajectoryTally = { improved: 0, stayed_same: 0, declined: 0, not_applicable: 0 };
    let peerImproved = 0;
    let peerStayedSame = 0;
    let peerDeclined = 0;
    let peerNotApplicable = 0;
    const selfSuggestionBlocks = [];
    const peerSuggestionBlocks = [];
    // Tags are compact by nature (unlike free-text suggestions), so — unlike
    // the per-week "-> WEEK N" blocks above — these sum frequencies across
    // every week into one cumulative count per tag rather than repeating a
    // growing list of per-week blocks.
    const selfStrengthsFreq = new Map();
    const peerStrengthsFreq = new Map();
    const selfWeaknessFreq = new Map();
    const peerWeaknessFreq = new Map();

    for (const s of scored) {
      const subj = subjectiveByWeek.get(s.week_id)?.get(u.id);
      if (!subj) continue;
      if (subj.selfTrajectoryRaw) selfTrajectoryTally[subj.selfTrajectoryRaw]++;
      peerImproved += subj.peerImprovedCount;
      peerStayedSame += subj.peerStayedSameCount;
      peerDeclined += subj.peerDeclinedCount;
      peerNotApplicable += subj.peerNotApplicableCount;

      const label = `-> WEEK ${s.week.week_number}`;
      selfSuggestionBlocks.push(`${label}\n\n${subj.selfSuggestion}`);
      peerSuggestionBlocks.push(`${label}\n\n${subj.peerSuggestions}`);

      addRawTags(selfStrengthsFreq, subj.selfStrengthsTagsRaw);
      addFrequencyEntries(peerStrengthsFreq, subj.peerStrengthsFrequency);
      addRawTags(selfWeaknessFreq, subj.selfWeaknessTagsRaw);
      addFrequencyEntries(peerWeaknessFreq, subj.peerWeaknessFrequency);
    }

    const paramAverages = {};
    for (const p of PARAM_FIELDS) {
      paramAverages[`${p.key}_self`] = round2(avg(col(`${p.key}_self`)));
      paramAverages[`${p.key}_peer`] = round2(avg(col(`${p.key}_peer`)));
    }

    const row = sheet.addRow({
      name: u.name,
      role: u.role,
      field: u.field || "—",
      ...paramAverages,
      total_self: round2(avg(col("total_self"))),
      total_peer: round2(avg(col("total_peer"))),
      peer_count: Math.round(avg(col("peer_count"))),
      expected_peer_count: Math.round(avg(col("expected_peer_count"))),
      sapa_factor: sapaValues.length ? round2(avg(sapaValues)) : "",
      self_trajectory: [
        selfTrajectoryTally.improved ? `Improved: ${selfTrajectoryTally.improved}` : null,
        selfTrajectoryTally.stayed_same ? `Stayed the Same: ${selfTrajectoryTally.stayed_same}` : null,
        selfTrajectoryTally.declined ? `Declined: ${selfTrajectoryTally.declined}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
      peer_trajectory: [
        peerImproved ? `Improved: ${peerImproved}` : null,
        peerStayedSame ? `Stayed the Same: ${peerStayedSame}` : null,
        peerDeclined ? `Declined: ${peerDeclined}` : null,
        peerNotApplicable ? `Not Applicable: ${peerNotApplicable}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
      self_strengths_tags: formatFrequencyMap(selfStrengthsFreq),
      peer_strengths_tags: formatFrequencyMap(peerStrengthsFreq),
      self_weakness_tags: formatFrequencyMap(selfWeaknessFreq),
      peer_weakness_tags: formatFrequencyMap(peerWeaknessFreq),
      self_suggestion: selfSuggestionBlocks.join("\n"),
      peer_suggestion: peerSuggestionBlocks.join("\n"),
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

function addRawTags(freqMap, tags) {
  for (const tag of tags || []) freqMap.set(tag, (freqMap.get(tag) || 0) + 1);
}

function addFrequencyEntries(freqMap, entries) {
  for (const { tag, count } of entries || []) freqMap.set(tag, (freqMap.get(tag) || 0) + count);
}

function formatFrequencyMap(freqMap) {
  return [...freqMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => `${tag} (${count})`)
    .join(", ");
}

const RAW_EVAL_WRAP_KEYS = ["strengths_tags", "weakness_tags", "improvement_suggestion"];

const RAW_EVAL_COLUMNS_PEER = [
  { header: "ID", key: "id", width: 8 },
  { header: "Week", key: "week", width: 12 },
  { header: "Evaluator Name", key: "evaluator_name", width: 22 },
  { header: "Evaluator Role", key: "evaluator_role", width: 16 },
  { header: "Evaluator Field", key: "evaluator_field", width: 20 },
  { header: "Evaluatee Name", key: "evaluatee_name", width: 22 },
  { header: "Evaluatee Role", key: "evaluatee_role", width: 16 },
  { header: "Evaluatee Field", key: "evaluatee_field", width: 20 },
  ...PARAM_FIELDS.map((p) => ({ header: p.label, key: p.key, width: 10 })),
  { header: "Total (this submission)", key: "total", width: 18 },
  { header: "Trajectory", key: "trajectory", width: 18 },
  { header: "Strengths Tags", key: "strengths_tags", width: 34 },
  { header: "Weakness Tags", key: "weakness_tags", width: 34 },
  { header: "Improvement Suggestion", key: "improvement_suggestion", width: 40 },
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
      total: PARAM_FIELDS.reduce((sum, p) => sum + r[p.key], 0),
      trajectory: TRAJECTORY_LABELS[r.trajectory] || "",
      strengths_tags: (r.strengths_tags || []).join(", "),
      weakness_tags: (r.weakness_tags || []).join(", "),
      improvement_suggestion: r.improvement_suggestion || "",
      submitted_at: r.submitted_at,
    };
    for (const p of PARAM_FIELDS) data[p.key] = r[p.key];
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

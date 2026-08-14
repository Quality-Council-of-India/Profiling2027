// MIS Scorecard — a per-person weekly performance report a user downloads
// for themselves (.docx). Generated on demand from the same computed_scores
// data written on week close, rather than pre-rendered and stored, since the
// underlying numbers are already final and deterministic once a week closes.
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
} from "docx";
import { prisma } from "../utils/prisma.js";
import { getSubjectiveSummary } from "./evaluations.js";
import { PARAM_FIELDS } from "../utils/constants.js";

const ROLE_LABELS = {
  admin: "Admin (Core Team)",
  project_lead: "Project Lead",
  casu_lead: "CASU Lead",
  group_anchor: "Group Anchor",
  casu_anchor: "CASU Anchor",
  profiler: "Profiler",
};

const IMPROVE_THRESHOLD = 0.5;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function trendLabel(delta) {
  if (delta === null) return { label: "First Scored Week", detail: "No prior week to compare against yet." };
  if (delta > IMPROVE_THRESHOLD) return { label: "Improved", detail: `Up ${delta.toFixed(2)} pts vs previous week` };
  if (delta < -IMPROVE_THRESHOLD) return { label: "Declined", detail: `Down ${Math.abs(delta).toFixed(2)} pts vs previous week` };
  return { label: "Neutral / Steady", detail: `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} pts vs previous week` };
}

const HEADER_SHADING = { fill: "1F3864" };

function cell(text, { header = false, width } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header ? HEADER_SHADING : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: header, color: header ? "FFFFFF" : "000000", size: 20 })],
      }),
    ],
  });
}

function sectionHeading(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 } });
}

/** Builds the .docx buffer for one user's scorecard for one (closed) week. */
export async function buildScorecardDocx(projectId, user, weekId) {
  const week = await prisma.week.findFirst({ where: { id: weekId, project_id: projectId } });
  if (!week) return null;

  const current = await prisma.computedScore.findUnique({
    where: { week_id_user_id: { week_id: weekId, user_id: user.id } },
  });
  if (!current) return null;

  const previous = await prisma.computedScore.findFirst({
    where: { user_id: user.id, week: { project_id: projectId, week_number: { lt: week.week_number } } },
    orderBy: { week: { week_number: "desc" } },
  });

  const history = await prisma.computedScore.findMany({
    where: { user_id: user.id, week: { project_id: projectId, week_number: { lte: week.week_number } } },
  });
  const cumulativeAvg = history.length
    ? round2(history.reduce((a, s) => a + Number(s.total_peer), 0) / history.length)
    : null;

  const delta = previous ? round2(Number(current.total_peer) - Number(previous.total_peer)) : null;
  const trend = trendLabel(delta);

  const subjective = await getSubjectiveSummary(weekId, user.id);
  const topStrengths = subjective.peer.strengthsFrequency.slice(0, 3);
  const topWeaknesses = subjective.peer.weaknessFrequency.slice(0, 3);

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Profiling 2027 — Weekly Performance Scorecard", bold: true, size: 32, color: "1F3864" })],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `${user.name}`, bold: true, size: 24 }),
              new TextRun({ text: `  ·  ${ROLE_LABELS[user.role] || user.role}${user.field ? ` · ${user.field}` : ""}`, size: 22, color: "555555" }),
            ],
            spacing: { after: 40 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `${week.label} — generated ${new Date().toLocaleDateString()}`, size: 20, color: "888888", italics: true })],
            spacing: { after: 200 },
          }),

          sectionHeading("This Week's Performance"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [cell("Metric", { header: true, width: 50 }), cell("Value", { header: true, width: 50 })] }),
              new TableRow({ children: [cell("Total Self Score"), cell(`${Number(current.total_self).toFixed(1)} / 49`)] }),
              new TableRow({ children: [cell("Total Peer Score"), cell(`${Number(current.total_peer).toFixed(1)} / 49`)] }),
              new TableRow({
                children: [
                  cell("SAPA Factor"),
                  cell(current.sapa_factor === null ? "— (awaiting data)" : Number(current.sapa_factor).toFixed(2)),
                ],
              }),
              new TableRow({ children: [cell("Peer Responses"), cell(`${current.peer_count} of ${current.expected_peer_count}`)] }),
            ],
          }),

          sectionHeading("Per-Parameter Breakdown"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  cell("Parameter", { header: true, width: 40 }),
                  cell("Self", { header: true, width: 30 }),
                  cell("Peer", { header: true, width: 30 }),
                ],
              }),
              ...PARAM_FIELDS.map(
                ({ key, label }) =>
                  new TableRow({
                    children: [
                      cell(label),
                      cell(Number(current[`${key}_self`]).toFixed(1)),
                      cell(Number(current[`${key}_peer`]).toFixed(1)),
                    ],
                  })
              ),
            ],
          }),

          sectionHeading("Week-on-Week Trend"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [cell("Metric", { header: true, width: 50 }), cell("Value", { header: true, width: 50 })] }),
              new TableRow({
                children: [
                  cell("Previous Week's Total Peer Score"),
                  cell(previous ? `${Number(previous.total_peer).toFixed(1)} / 49` : "— (no prior week)"),
                ],
              }),
              new TableRow({ children: [cell("Trend"), cell(`${trend.label} (${trend.detail})`)] }),
              new TableRow({
                children: [
                  cell("Cumulative Average Total Peer Score (to date)"),
                  cell(cumulativeAvg !== null ? `${cumulativeAvg.toFixed(2)} / 49 across ${history.length} scored week(s)` : "—"),
                ],
              }),
            ],
          }),

          sectionHeading("Feedback Received This Week"),
          new Paragraph({
            children: [new TextRun({ text: "Top Strengths (from peers)", bold: true, size: 20 })],
            spacing: { before: 100, after: 60 },
          }),
          ...(topStrengths.length
            ? topStrengths.map((t) => new Paragraph({ text: `• ${t.tag} (mentioned ${t.count}x)`, spacing: { after: 40 } }))
            : [new Paragraph({ text: "No peer feedback received yet this week.", spacing: { after: 40 } })]),
          new Paragraph({
            children: [new TextRun({ text: "Areas to Improve (from peers)", bold: true, size: 20 })],
            spacing: { before: 100, after: 60 },
          }),
          ...(topWeaknesses.length
            ? topWeaknesses.map((t) => new Paragraph({ text: `• ${t.tag} (mentioned ${t.count}x)`, spacing: { after: 40 } }))
            : [new Paragraph({ text: "No peer feedback received yet this week.", spacing: { after: 40 } })]),

          new Paragraph({
            children: [new TextRun({ text: "— Core Team, Profiling 2027", italics: true, color: "888888", size: 18 })],
            spacing: { before: 300 },
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `${user.name.replace(/\s+/g, "_")}_${week.label.replace(/\s+/g, "_")}_Scorecard.docx`;
  return { buffer, filename };
}

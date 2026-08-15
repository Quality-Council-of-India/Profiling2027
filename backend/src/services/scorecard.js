// MIS Scorecard — a per-person weekly performance report a user downloads
// for themselves (.docx). Generated on demand from the same computed_scores
// data written on week close, rather than pre-rendered and stored, since the
// underlying numbers are already final and deterministic once a week closes.
//
// Designed to be self-explanatory: every raw number carries a plain-English
// interpretation next to it (what a SAPA factor of 1.00 actually means, not
// just the number), since the reader may not have the rest of the portal's
// context in front of them when reading a downloaded report.
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
  ShadingType,
  BorderStyle,
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

const NAV = "1F3864";
const IMPROVE_THRESHOLD = 0.5;

// Self-vs-peer gap on a single 1-7 parameter — thresholds chosen so a
// same-page reader gets a plain "how big is this gap" read without doing
// the subtraction themselves.
const GAP_ALIGNED = 1.0;
const GAP_MODERATE = 2.0;

const TONE = {
  green: { bg: "D7F3E3", text: "1B7A43" },
  amber: { bg: "FCEACB", text: "8A5A00" },
  red: { bg: "FBDDDA", text: "B3261E" },
  neutral: { bg: "EDEFF3", text: "444444" },
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pluralize(n, noun) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function trendLabel(delta) {
  if (delta === null) return { label: "First Scored Week", detail: "This is the earliest week you have a score for — there's no prior week to compare against yet." };
  if (delta > IMPROVE_THRESHOLD) return { label: "Improved", detail: `Your peer score rose by ${delta.toFixed(2)} points compared to last week.` };
  if (delta < -IMPROVE_THRESHOLD) return { label: "Declined", detail: `Your peer score fell by ${Math.abs(delta).toFixed(2)} points compared to last week.` };
  return { label: "Steady", detail: `Your peer score is about the same as last week (${delta >= 0 ? "+" : ""}${delta.toFixed(2)} points).` };
}

function sapaInterpretation(sapa) {
  if (sapa === null) return { label: "Awaiting Data", tone: TONE.neutral, detail: "Not enough peer responses yet to calculate this." };
  if (sapa > 1.1) return { label: "Over-Rater", tone: TONE.amber, detail: "You rated yourself noticeably higher than your peers rated you." };
  if (sapa < 0.9) return { label: "Under-Rater", tone: TONE.amber, detail: "You rated yourself noticeably lower than your peers rated you." };
  return { label: "Aligned", tone: TONE.green, detail: "Your self-assessment closely matches how your peers see you." };
}

function gapTone(diff) {
  if (diff <= GAP_ALIGNED) return { label: "Aligned", ...TONE.green };
  if (diff <= GAP_MODERATE) return { label: "Some Gap", ...TONE.amber };
  return { label: "Large Gap", ...TONE.red };
}

function cell(content, { header = false, width, shading, align } = {}) {
  const children = Array.isArray(content) ? content : [content];
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header ? { type: ShadingType.CLEAR, fill: NAV } : shading ? { type: ShadingType.CLEAR, fill: shading } : undefined,
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    children: children.map((text) =>
      typeof text === "string"
        ? new Paragraph({
            alignment: align,
            children: [new TextRun({ text, bold: header, color: header ? "FFFFFF" : "000000", size: 19 })],
          })
        : text
    ),
  });
}

/** A "Metric | Value | Interpretation" row, with the interpretation column tinted by tone. */
function metricRow(metric, value, interpretation, tone = TONE.neutral) {
  return new TableRow({
    children: [
      cell(metric, { width: 26 }),
      cell(value, { width: 20 }),
      cell(interpretation, { width: 54, shading: tone.bg }),
    ],
  });
}

function sectionHeading(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, color: NAV })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "D8DEE9", space: 4 } },
  });
}

function bulletList(items, emptyText) {
  return items.length
    ? items.map((text) => new Paragraph({ text: `•  ${text}`, spacing: { after: 50 }, indent: { left: 120 } }))
    : [new Paragraph({ text: emptyText, spacing: { after: 50 }, indent: { left: 120 }, italics: true })];
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
  const sapa = current.sapa_factor === null ? null : Number(current.sapa_factor);
  const sapaInfo = sapaInterpretation(sapa);
  const fullyResponded = current.peer_count >= current.expected_peer_count;

  const subjective = await getSubjectiveSummary(weekId, user.id);
  const topStrengths = subjective.peer.strengthsFrequency.slice(0, 3);
  const topWeaknesses = subjective.peer.weaknessFrequency.slice(0, 3);
  const focusSuggestions = subjective.peer.improvementSuggestions;

  const doc = new Document({
    sections: [
      {
        children: [
          // ── Header banner ──
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { type: ShadingType.CLEAR, fill: NAV },
                    margins: { top: 220, bottom: 220, left: 260, right: 260 },
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "Weekly Performance Scorecard", bold: true, size: 30, color: "FFFFFF" })],
                        spacing: { after: 80 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: user.name, bold: true, size: 24, color: "FFFFFF" }),
                          new TextRun({
                            text: `   ·   ${ROLE_LABELS[user.role] || user.role}${user.field ? ` · ${user.field}` : ""}`,
                            size: 20,
                            color: "CBD5E1",
                          }),
                        ],
                        spacing: { after: 40 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${week.label} — generated ${new Date().toLocaleDateString()}`,
                            size: 18,
                            color: "A5C9EB",
                            italics: true,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "", spacing: { after: 120 } }),

          sectionHeading("This Week's Performance"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [cell("Metric", { header: true, width: 26 }), cell("Value", { header: true, width: 20 }), cell("What This Means", { header: true, width: 54 })],
              }),
              metricRow(
                "Total Self Score",
                `${Number(current.total_self).toFixed(1)} / 49`,
                "How you rated your own performance this week, across all 7 parameters.",
                TONE.neutral
              ),
              metricRow(
                "Total Peer Score",
                `${Number(current.total_peer).toFixed(1)} / 49`,
                "The average of how your peers rated your performance this week — the figure most reports and rankings use.",
                TONE.neutral
              ),
              metricRow("SAPA Factor", sapa === null ? "—" : sapa.toFixed(2), `${sapaInfo.label} — ${sapaInfo.detail}`, sapaInfo.tone),
              metricRow(
                "Peer Responses",
                `${current.peer_count} of ${current.expected_peer_count}`,
                fullyResponded
                  ? "All expected peers submitted feedback for you this week."
                  : "Not all expected peers have responded yet — your score may shift slightly if more come in before final records.",
                fullyResponded ? TONE.green : TONE.amber
              ),
            ],
          }),

          sectionHeading("Per-Parameter Breakdown"),
          new Paragraph({
            children: [
              new TextRun({
                text: "The Comparison column flags how closely your self-rating matched your peers' — a large gap either way is worth reflecting on.",
                italics: true,
                size: 18,
                color: "666666",
              }),
            ],
            spacing: { after: 100 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  cell("Parameter", { header: true, width: 34 }),
                  cell("Self", { header: true, width: 16 }),
                  cell("Peer", { header: true, width: 16 }),
                  cell("Comparison", { header: true, width: 34 }),
                ],
              }),
              ...PARAM_FIELDS.map(({ key, label }) => {
                const self = Number(current[`${key}_self`]);
                const peer = Number(current[`${key}_peer`]);
                const gap = gapTone(Math.abs(self - peer));
                return new TableRow({
                  children: [
                    cell(label, { width: 34 }),
                    cell(self.toFixed(1), { width: 16, align: "center" }),
                    cell(peer.toFixed(1), { width: 16, align: "center" }),
                    cell(gap.label, { width: 34, shading: gap.bg }),
                  ],
                });
              }),
            ],
          }),

          sectionHeading("Week-on-Week Trend"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [cell("Metric", { header: true, width: 26 }), cell("Value", { header: true, width: 20 }), cell("What This Means", { header: true, width: 54 })],
              }),
              metricRow(
                "Previous Week's Peer Score",
                previous ? `${Number(previous.total_peer).toFixed(1)} / 49` : "—",
                previous ? "Your Total Peer Score from the week before this one, for comparison." : "There's no earlier scored week yet to compare against.",
                TONE.neutral
              ),
              metricRow(
                "Trend",
                trend.label,
                trend.detail,
                trend.label === "Improved" ? TONE.green : trend.label === "Declined" ? TONE.red : TONE.neutral
              ),
              metricRow(
                "Cumulative Average",
                cumulativeAvg !== null ? `${cumulativeAvg.toFixed(2)} / 49` : "—",
                cumulativeAvg !== null
                  ? `Your average Total Peer Score across all ${pluralize(history.length, "scored week")} so far — a steadier view than any single week alone.`
                  : "No scored weeks yet.",
                TONE.neutral
              ),
            ],
          }),

          sectionHeading("Feedback Received This Week"),
          new Paragraph({
            children: [new TextRun({ text: "Top Strengths (from peers)", bold: true, size: 20, color: NAV })],
            spacing: { before: 100, after: 60 },
          }),
          ...bulletList(
            topStrengths.map((t) => `${t.tag} — it was mentioned ${pluralize(t.count, "time")}.`),
            "No peer feedback received yet this week."
          ),
          new Paragraph({
            children: [new TextRun({ text: "Areas to Improve (from peers)", bold: true, size: 20, color: NAV })],
            spacing: { before: 140, after: 60 },
          }),
          ...bulletList(
            topWeaknesses.map((t) => `${t.tag} — it was mentioned ${pluralize(t.count, "time")}.`),
            "No peer feedback received yet this week."
          ),
          new Paragraph({
            children: [new TextRun({ text: "What Peers Suggest You Focus On", bold: true, size: 20, color: NAV })],
            spacing: { before: 140, after: 60 },
          }),
          ...bulletList(focusSuggestions, "No suggestions submitted this week."),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `${user.name.replace(/\s+/g, "_")}_${week.label.replace(/\s+/g, "_")}_Scorecard.docx`;
  return { buffer, filename };
}

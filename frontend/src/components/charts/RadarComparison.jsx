import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { PARAM_FIELDS, NAV, ACCENT } from "../../utils/constants.js";

// Short forms of the 7 parameter labels for the axis ticks — the full labels
// (e.g. "Work Quality & Attention to Detail") run wider than the plot itself
// at typical card widths and get clipped off the edge of the chart.
const SHORT_LABELS = {
  ownership_discipline: "Ownership",
  team_spirit: "Team Spirit",
  communication_clarity: "Communication",
  domain_knowledge: "Domain Knowledge",
  timeliness_throughput: "Timeliness",
  work_quality: "Work Quality",
  problem_solving_initiative: "Problem Solving",
};

// computed: a computed_scores row (numeric strings from Prisma Decimal are fine as-is)
export default function RadarComparison({ computed, height = 280 }) {
  const data = PARAM_FIELDS.map(({ key }) => ({
    param: SHORT_LABELS[key] ?? key,
    Self: Number(computed?.[`${key}_self`] ?? 0),
    Peer: Number(computed?.[`${key}_peer`] ?? 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="58%" margin={{ top: 16, right: 36, bottom: 16, left: 36 }}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="param" tick={{ fontSize: 10.5, fill: "#6B7280" }} />
        <PolarRadiusAxis domain={[0, 7]} tick={{ fontSize: 9 }} />
        <Radar name="Self" dataKey="Self" stroke={ACCENT} fill={ACCENT} fillOpacity={0.15} strokeWidth={2} />
        <Radar name="Peer" dataKey="Peer" stroke={NAV} fill={NAV} fillOpacity={0.15} strokeWidth={2} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

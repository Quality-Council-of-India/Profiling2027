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

// computed: a computed_scores row (numeric strings from Prisma Decimal are fine as-is)
export default function RadarComparison({ computed, height = 240 }) {
  const data = PARAM_FIELDS.map(({ key, label }) => ({
    param: label,
    Self: Number(computed?.[`${key}_self`] ?? 0),
    Peer: Number(computed?.[`${key}_peer`] ?? 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="param" tick={{ fontSize: 11, fill: "#6B7280" }} />
        <PolarRadiusAxis domain={[0, 7]} tick={{ fontSize: 9 }} />
        <Radar name="Self" dataKey="Self" stroke={ACCENT} fill={ACCENT} fillOpacity={0.15} strokeWidth={2} />
        <Radar name="Peer" dataKey="Peer" stroke={NAV} fill={NAV} fillOpacity={0.15} strokeWidth={2} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

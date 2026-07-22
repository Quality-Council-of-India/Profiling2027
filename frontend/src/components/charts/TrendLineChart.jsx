import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { NAV, ACCENT } from "../../utils/constants.js";

// trend: array of computed_scores rows (from /api/scores/:userId/trend)
export default function TrendLineChart({ trend, height = 260 }) {
  const data = trend.map((t) => ({
    week: t.week.replace("Week ", "W"),
    "Self Total": Number(t.total_self),
    "Peer Total": Number(t.total_peer),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 25]} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="Self Total" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="Peer Total" stroke={NAV} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

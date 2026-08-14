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
import { ACCENT, NAV } from "../../utils/constants.js";

const FIELD_COLOR = "#F59E0B";

// trend: array from GET /api/analytics/peer-trend/:userId — one point per
// open/closed week, comparing the user's own Total Peer Score against their
// sub-field average and the overall team average for that same week.
export default function PeerScoreTrendChart({ trend, fieldLabel, height = 280 }) {
  const data = trend.map((t) => ({
    week: t.week.label.replace("Week ", "W"),
    "My Total Peer Score": t.selfTotalPeer,
    [fieldLabel ? `${fieldLabel} Average` : "Sub-Field Average"]: t.fieldAvgTotalPeer,
    "Overall Team Average": t.overallAvgTotalPeer,
  }));

  const fieldKey = fieldLabel ? `${fieldLabel} Average` : "Sub-Field Average";
  const hasFieldLine = data.some((d) => d[fieldKey] !== null && d[fieldKey] !== undefined);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 49]} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="My Total Peer Score" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        {hasFieldLine && (
          <Line type="monotone" dataKey={fieldKey} stroke={FIELD_COLOR} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        )}
        <Line type="monotone" dataKey="Overall Team Average" stroke={NAV} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

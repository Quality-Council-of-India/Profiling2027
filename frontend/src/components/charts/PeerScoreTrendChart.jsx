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
const FIELD_KEY = "Field Average";

// trend: array from GET /api/analytics/peer-trend/:userId — one point per
// open/closed week, comparing the user's own Total Peer Score against their
// sub-field average and the overall team average for that same week. Each
// point carries its OWN fieldLabel (that week's frozen field grouping),
// since a roster reshuffle between weeks can change which field group a
// person is actually being compared against — there is no single field
// name that's valid across the whole line, so the legend stays generic and
// the tooltip names the specific field for the week being hovered.
export default function PeerScoreTrendChart({ trend, height = 280 }) {
  const data = trend.map((t) => ({
    week: t.week.label.replace("Week ", "W"),
    "My Total Peer Score": t.selfTotalPeer,
    [FIELD_KEY]: t.fieldAvgTotalPeer,
    "Overall Team Average": t.overallAvgTotalPeer,
    fieldLabel: t.fieldLabel,
  }));

  const hasFieldLine = data.some((d) => d[FIELD_KEY] !== null && d[FIELD_KEY] !== undefined);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 49]} tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ fontSize: 12 }}
          formatter={(value, name, entry) =>
            name === FIELD_KEY && entry?.payload?.fieldLabel
              ? [value, `${entry.payload.fieldLabel} Average`]
              : [value, name]
          }
        />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="My Total Peer Score" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        {hasFieldLine && (
          <Line type="monotone" dataKey={FIELD_KEY} stroke={FIELD_COLOR} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        )}
        <Line type="monotone" dataKey="Overall Team Average" stroke={NAV} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

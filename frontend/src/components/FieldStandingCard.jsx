import { Card } from "./ui.jsx";
import { NAV, ACCENT } from "../utils/constants.js";

/**
 * A leaderboard of FIELDS rather than individuals — shown instead of
 * "Standing in your field" for roles that don't belong to a single field
 * (Admin, CASU Lead, Project Lead).
 */
export default function FieldStandingCard({ title, standings }) {
  if (!standings || standings.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">{title}</h2>
        <p className="text-sm text-slate-400">Not enough data yet for this range.</p>
      </Card>
    );
  }

  const top = standings[0].avgTotalPeer;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-3">{title}</h2>
      <div className="space-y-2.5">
        {standings.map((s) => (
          <div key={s.field}>
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="font-medium text-slate-700">
                <span className="text-slate-400 tabular-nums mr-1.5">#{s.rank}</span>
                {s.field}
              </span>
              <span className="tabular-nums text-slate-500">
                <span style={{ color: NAV }} className="font-semibold">{s.avgTotalPeer.toFixed(1)}</span>
                {" "}· {s.memberCount} member{s.memberCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${top > 0 ? (s.avgTotalPeer / top) * 100 : 0}%`, background: ACCENT }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

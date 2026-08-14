import { Card } from "./ui.jsx";
import { ROLE_LABELS, ROLE_COLORS, NAV, ACCENT } from "../utils/constants.js";

/**
 * Standings by Total Peer Score. Always shows "Rank X of Y" (never exposes
 * anyone's individual score by itself); additionally shows the named,
 * scored list when the backend granted one (role-dependent — see
 * services/analytics.js getRankings on the API side).
 */
export default function RankingCard({ title, myRank, total, list, meId, emptyLabel }) {
  // Admin has no personal rank (never scored) but should still see the full
  // named list — only bail out to the empty state when there's truly
  // nothing to show either way.
  if (!myRank && !list?.length) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">{title}</h2>
        <p className="text-sm text-slate-400">{emptyLabel || "Not enough data yet for this range."}</p>
      </Card>
    );
  }

  const pct = total > 1 ? Math.round(((total - myRank) / (total - 1)) * 100) : 100;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-3">{title}</h2>
      {myRank && (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold" style={{ color: NAV }}>#{myRank}</span>
            <span className="text-sm text-slate-500">of {total}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mb-4">
            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: ACCENT }} />
          </div>
        </>
      )}

      {list && (
        <div className="max-h-64 overflow-y-auto -mx-1 px-1">
          <table className="w-full text-xs">
            <tbody>
              {list.map((m) => (
                <tr
                  key={m.id}
                  className={`border-b border-slate-50 last:border-0 ${m.id === meId ? "bg-orange-50" : ""}`}
                >
                  <td className="py-1.5 pr-2 text-slate-400 w-8 tabular-nums">#{m.rank}</td>
                  <td className="py-1.5 pr-2 font-medium text-slate-800">
                    {m.name} {m.id === meId && <span className="text-orange-600">(you)</span>}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px]"
                      style={{ background: ROLE_COLORS[m.role] + "20", color: ROLE_COLORS[m.role] }}
                    >
                      {ROLE_LABELS[m.role]}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono text-slate-700 tabular-nums">{m.totalPeer.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, EmptyState } from "./ui.jsx";
import { ACCENT } from "../utils/constants.js";

/**
 * Per closed week: the Total-Peer-Score top scorer for each of
 * Profiler/Group Anchor/CASU Anchor (irrespective of field), plus — from
 * the 2nd closed week onward — a single cross-role Overall Star Performer
 * based on cumulative average Total Peer Score across every closed week so
 * far. Most recent week first.
 */
export default function HallOfRecognition() {
  const query = useQuery({ queryKey: ["hallOfRecognition"], queryFn: analyticsApi.hallOfRecognition });

  if (query.isLoading) return <Spinner />;
  if (query.isError) return <ErrorBanner message="Failed to load Hall of Recognition" />;

  const weeks = [...(query.data?.weeks || [])].reverse();

  if (weeks.length === 0) {
    return (
      <EmptyState
        icon="🏆"
        title="No closed weeks yet"
        message="Hall of Recognition populates once the first week closes."
      />
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-nav-deep">
            <th className="text-left px-4 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Week</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">🎨 Top Profiler</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">🧭 Top Group Anchor</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">🛡️ Top CASU Anchor</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">⭐ Overall Star Performer</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, i) => (
            <tr key={w.week.id} className={`transition-standard hover:bg-azure/10 ${i % 2 === 0 ? "bg-slate-50" : "bg-white"}`}>
              <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{w.week.label}</td>
              <RecognitionCell winner={w.topProfiler} />
              <RecognitionCell winner={w.topGroupAnchor} />
              <RecognitionCell winner={w.topCasuAnchor} />
              <RecognitionCell winner={w.overallStar} isOverall />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecognitionCell({ winner, isOverall = false }) {
  if (!winner) {
    return <td className="px-3 py-2.5 text-slate-400 text-xs">—</td>;
  }
  const score = isOverall ? winner.avgTotalPeer : winner.totalPeer;
  return (
    <td className="px-3 py-2.5">
      <div className="flex items-baseline gap-1.5">
        <span className="font-medium text-slate-800">{winner.name}</span>
        <span className="text-xs font-mono tabular-nums" style={{ color: ACCENT }}>
          {score.toFixed(1)}
        </span>
      </div>
      {winner.field && <span className="text-[11px] text-slate-400">{winner.field}</span>}
    </td>
  );
}

import { useState } from "react";
import { ROLE_COLORS, ROLE_LABELS } from "../../utils/constants.js";

// This team's actual peer scores cluster tightly high (this cycle's medians
// have run 38-40 out of 49, with even the WORST-scoring person still well
// above the scale's theoretical midpoint of 24.5), and peer sentiment
// (trajectory + tag balance) is likewise almost always net-positive — the
// same leniency pattern documented in the 2025-26 questionnaire redesign
// (Section 3 of the portal handbook). A fixed midpoint on either axis never
// actually splits this team: everyone lands in "Star Performers" every
// week.
//
// Splitting at a plain median instead mostly fixes that, but sentiment in
// particular is built from small integer tag/trajectory counts, so several
// people often land on the exact same value — a plain ">= median" test then
// puts every one of those tied people on the same side, skewing what should
// be a roughly-even split. Ranking and splitting at the midpoint INDEX
// (rather than the midpoint VALUE) guarantees each axis divides as close to
// 50/50 as integer math allows (e.g. 36/35 for 71 people) no matter how many
// ties land at the boundary — ties there are broken by id, an arbitrary but
// fully deterministic rule (not a further merit judgment).
function rankSplit(points, key) {
  if (points.length === 0) return { highIds: new Set(), boundaryValue: 0 };
  const sorted = [...points].sort((a, b) => a[key] - b[key] || a.id - b.id);
  const splitIndex = Math.floor(sorted.length / 2); // [0, splitIndex) = low half, [splitIndex, n) = high half
  return { highIds: new Set(sorted.slice(splitIndex).map((p) => p.id)), boundaryValue: sorted[splitIndex][key] };
}

// points: [{ id, name, role, field, performance (0-49), sentiment (-1..1) }]
export default function QuadrantPlot({ points, height = 280 }) {
  const [expandedKey, setExpandedKey] = useState(null);
  const { highIds: highPerfIds, boundaryValue: performanceBoundary } = rankSplit(points, "performance");
  const { highIds: highSentIds, boundaryValue: sentimentBoundary } = rankSplit(points, "sentiment");
  const isHighPerf = (p) => highPerfIds.has(p.id);
  const isHighSent = (p) => highSentIds.has(p.id);

  const QUADRANTS = [
    { key: "star", label: "Star Performers", accent: "#22C55E", test: (p) => isHighPerf(p) && isHighSent(p) },
    { key: "wellLiked", label: "Well-Liked Underperformers", accent: "#3B82F6", test: (p) => !isHighPerf(p) && isHighSent(p) },
    { key: "atRisk", label: "At-Risk", accent: "#EF4444", test: (p) => !isHighPerf(p) && !isHighSent(p) },
    { key: "toxic", label: "High Performers, Low Sentiment", accent: "#F97316", test: (p) => isHighPerf(p) && !isHighSent(p) },
  ];

  // The visual split lines track the same boundary values used for the
  // rank split above, so the background quadrant colors line up with where
  // dots actually get classified.
  const perfPct = Math.max(4, Math.min(96, (performanceBoundary / 49) * 100));
  const sentPct = Math.max(4, Math.min(96, ((sentimentBoundary + 1) / 2) * 100));

  return (
    <div>
      <div className="relative border border-slate-200 rounded-lg" style={{ height }}>
        <div className="absolute inset-0">
          <div
            className="absolute top-0 left-0 bg-blue-50/50 border-r border-b border-slate-200 flex items-center justify-center overflow-hidden"
            style={{ width: `${perfPct}%`, height: `${100 - sentPct}%` }}
          >
            <span className="text-xs text-blue-400 font-medium opacity-60 text-center px-1">Well-Liked Underperformers</span>
          </div>
          <div
            className="absolute top-0 right-0 bg-green-50/50 border-b border-slate-200 flex items-center justify-center overflow-hidden"
            style={{ width: `${100 - perfPct}%`, height: `${100 - sentPct}%` }}
          >
            <span className="text-xs text-green-400 font-medium opacity-60">Star Performers ★</span>
          </div>
          <div
            className="absolute bottom-0 left-0 bg-red-50/50 border-r border-slate-200 flex items-center justify-center overflow-hidden"
            style={{ width: `${perfPct}%`, height: `${sentPct}%` }}
          >
            <span className="text-xs text-red-400 font-medium opacity-60">At-Risk</span>
          </div>
          <div
            className="absolute bottom-0 right-0 bg-orange-50/50 flex items-center justify-center overflow-hidden"
            style={{ width: `${100 - perfPct}%`, height: `${sentPct}%` }}
          >
            <span className="text-xs text-orange-400 font-medium opacity-60 text-center px-2">High Performers,<br />Low Sentiment</span>
          </div>
        </div>
        {points.map((p) => {
          const x = Math.max(2, Math.min(98, (p.performance / 49) * 100));
          const y = Math.max(2, Math.min(98, ((p.sentiment + 1) / 2) * 100));
          return (
            <div
              key={p.id}
              className="absolute w-3 h-3 rounded-full border-2 border-white shadow-sm"
              style={{ left: `${x}%`, bottom: `${y}%`, background: ROLE_COLORS[p.role] }}
              title={`${p.name} — performance ${p.performance.toFixed(1)}/49, sentiment ${p.sentiment.toFixed(2)}`}
            />
          );
        })}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-slate-400">
          ← Low Performance | High Performance →
        </div>
        <div className="absolute left-1 top-1/2 -translate-y-1/2 text-xs text-slate-400 -rotate-90 origin-center whitespace-nowrap">
          ← Negative | Positive →
        </div>
      </div>
      <div className="flex gap-3 mt-2 justify-center flex-wrap">
        {Object.entries(ROLE_COLORS)
          .filter(([k]) => k !== "admin")
          .map(([k, c]) => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
              <span className="text-xs text-slate-500">{ROLE_LABELS[k]}</span>
            </div>
          ))}
      </div>

      {/* Named breakdown, collapsed by default — click a bucket to see who's
          in it, same pattern as the SAPA Distribution role bars, so a large
          team doesn't force everyone's name onto the page at once. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        {QUADRANTS.map((q) => {
          const members = points.filter(q.test).sort((a, b) => b.performance - a.performance);
          const isOpen = expandedKey === q.key;
          return (
            <div key={q.key} className="border border-slate-200 rounded-lg p-3">
              <button
                onClick={() => setExpandedKey(isOpen ? null : q.key)}
                className="w-full flex items-center gap-1.5 mb-0.5 text-left"
                disabled={members.length === 0}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: q.accent }} />
                <span className="text-xs font-semibold text-slate-700">{q.label}</span>
                <span className="text-xs text-slate-400">({members.length})</span>
                {members.length > 0 && <span className="text-slate-400 text-xs ml-auto">{isOpen ? "▲" : "▼"}</span>}
              </button>
              {members.length === 0 ? (
                <p className="text-xs text-slate-400 mt-1.5">No one here.</p>
              ) : isOpen ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {members.map((m) => (
                    <span
                      key={m.id}
                      title={`${m.name} — performance ${m.performance.toFixed(1)}/49, sentiment ${m.sentiment.toFixed(2)}`}
                      className="px-2 py-0.5 rounded-md text-[11px] bg-slate-50 border border-slate-100 text-slate-700"
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

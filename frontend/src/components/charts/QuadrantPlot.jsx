import { ROLE_COLORS, ROLE_LABELS } from "../../utils/constants.js";

const PERFORMANCE_MIDPOINT = 24.5; // half of the 49-point max total peer score

const QUADRANTS = [
  { key: "star", label: "Star Performers", accent: "#22C55E", test: (p) => p.performance >= PERFORMANCE_MIDPOINT && p.sentiment >= 0 },
  { key: "wellLiked", label: "Well-Liked Underperformers", accent: "#3B82F6", test: (p) => p.performance < PERFORMANCE_MIDPOINT && p.sentiment >= 0 },
  { key: "atRisk", label: "At-Risk", accent: "#EF4444", test: (p) => p.performance < PERFORMANCE_MIDPOINT && p.sentiment < 0 },
  { key: "toxic", label: "High Performers, Low Sentiment", accent: "#F97316", test: (p) => p.performance >= PERFORMANCE_MIDPOINT && p.sentiment < 0 },
];

// points: [{ id, name, role, field, performance (0-49), sentiment (-1..1) }]
export default function QuadrantPlot({ points, height = 280 }) {
  return (
    <div>
      <div className="relative border border-slate-200 rounded-lg" style={{ height }}>
        <div className="absolute inset-0 flex">
          <div className="w-1/2 h-1/2 bg-blue-50/50 border-r border-b border-slate-200 flex items-center justify-center">
            <span className="text-xs text-blue-400 font-medium opacity-60">Well-Liked Underperformers</span>
          </div>
          <div className="w-1/2 h-1/2 bg-green-50/50 border-b border-slate-200 flex items-center justify-center">
            <span className="text-xs text-green-400 font-medium opacity-60">Star Performers ★</span>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 flex" style={{ height: "50%" }}>
          <div className="w-1/2 bg-red-50/50 border-r border-slate-200 flex items-center justify-center">
            <span className="text-xs text-red-400 font-medium opacity-60">At-Risk</span>
          </div>
          <div className="w-1/2 bg-orange-50/50 flex items-center justify-center">
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

      {/* Named breakdown — hover tooltips alone don't tell you who's where at a glance. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        {QUADRANTS.map((q) => {
          const members = points.filter(q.test).sort((a, b) => b.performance - a.performance);
          return (
            <div key={q.key} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: q.accent }} />
                <span className="text-xs font-semibold text-slate-700">{q.label}</span>
                <span className="text-xs text-slate-400">({members.length})</span>
              </div>
              {members.length === 0 ? (
                <p className="text-xs text-slate-400">No one here.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

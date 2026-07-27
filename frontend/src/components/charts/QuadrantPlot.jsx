import { ROLE_COLORS, ROLE_LABELS } from "../../utils/constants.js";

// points: [{ id, name, role, field, performance (0-25), sentiment (-1..1) }]
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
            <span className="text-xs text-orange-400 font-medium opacity-60">Toxic High-Performers</span>
          </div>
        </div>
        {points.map((p) => {
          const x = Math.max(2, Math.min(98, (p.performance / 25) * 100));
          const y = Math.max(2, Math.min(98, ((p.sentiment + 1) / 2) * 100));
          return (
            <div
              key={p.id}
              className="absolute w-3 h-3 rounded-full border-2 border-white shadow-sm"
              style={{ left: `${x}%`, bottom: `${y}%`, background: ROLE_COLORS[p.role] }}
              title={`${p.name} — performance ${p.performance.toFixed(1)}/25, sentiment ${p.sentiment.toFixed(2)}`}
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
    </div>
  );
}

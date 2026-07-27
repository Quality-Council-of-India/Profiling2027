// Circular-feeling gauge (rendered as a labeled bar since we avoid extra
// chart libraries): green band (0.9-1.1 aligned), yellow (0.7-0.9 / 1.1-1.3),
// red (<0.7 or >1.3), centred visually on 1.0.
export default function SAPAGauge({ sapa }) {
  if (sapa === null || sapa === undefined) {
    return <p className="text-sm text-slate-400">Not enough data yet (need both self and peer scores).</p>;
  }
  const v = Number(sapa);
  const pct = Math.max(0, Math.min(100, (v / 2) * 100)); // 0..2 mapped to 0..100%
  const color = v > 1.3 || v < 0.7 ? "#DC2626" : v > 1.1 || v < 0.9 ? "#D97706" : "#059669";
  const label = v > 1.1 ? "Over-rater" : v < 0.9 ? "Under-rater" : "Well-aligned";

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-bold" style={{ color }}>{v.toFixed(2)}</span>
        <span className="text-sm text-slate-500">{label}</span>
      </div>
      <div className="relative h-3 rounded-full bg-gradient-to-r from-blue-200 via-green-300 to-red-300">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow"
          style={{ left: `calc(${pct}% - 6px)`, background: color }}
        />
        <div className="absolute top-1/2 -translate-y-1/2 left-1/2 w-0.5 h-4 bg-slate-400" />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>0.0</span>
        <span>1.0 (aligned)</span>
        <span>2.0</span>
      </div>
    </div>
  );
}

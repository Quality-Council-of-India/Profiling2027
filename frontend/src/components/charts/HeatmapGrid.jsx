import { PARAM_LABELS } from "../../utils/constants.js";

// Diverging red-yellow-green scale across the FULL 1-7 rating range —
// previously this was a sequential scale that floored at 3.5 and returned
// flat grey for everything below it, so a 2.0 and a 3.4 were visually
// indistinguishable. Hue sweeps red (1) -> yellow (4) -> green (7).
function heatColor(v) {
  const t = Math.max(0, Math.min(1, (Number(v) - 1) / 6));
  const hue = t * 120;
  return { bg: `hsl(${hue}, 72%, 45%)`, text: "white" };
}

// rows: [{ field, Sincerity, "Team Spirit", Knowledge, Quantity, Quality, avg }]
export default function HeatmapGrid({ rows }) {
  if (!rows.length) {
    return <p className="text-sm text-slate-400 py-6 text-center">No scored data for this week yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 uppercase">Field</th>
            {PARAM_LABELS.map((p) => (
              <th key={p} className="text-center px-3 py-2 text-xs font-medium text-slate-600 uppercase">
                {p}
              </th>
            ))}
            <th className="text-center px-3 py-2 text-xs font-medium text-slate-600 uppercase">Avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field}>
              <td className="px-3 py-2 text-xs font-medium text-slate-800">{row.field}</td>
              {PARAM_LABELS.map((p) => {
                const { bg, text } = heatColor(row[p]);
                return (
                  <td key={p} className="px-3 py-2 text-center">
                    <span
                      className="inline-block px-2.5 py-1 rounded text-xs font-bold"
                      style={{ background: bg, color: text, minWidth: 40 }}
                    >
                      {Number(row[p]).toFixed(2)}
                    </span>
                  </td>
                );
              })}
              <td className="px-3 py-2 text-center">
                <span
                  className="inline-block px-2.5 py-1 rounded text-xs font-bold"
                  style={{ background: "#1F3864", color: "white", minWidth: 40 }}
                >
                  {Number(row.avg).toFixed(2)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

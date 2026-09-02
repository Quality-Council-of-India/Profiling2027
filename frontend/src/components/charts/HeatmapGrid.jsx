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

// The highest value in each parameter column (across field rows only, not
// the Team Average summary row) — ties all get the marker, since with
// mostly-green cells the color scale alone doesn't make the single best
// field/parameter combination easy to spot at a glance.
function columnMaxes(rows) {
  const maxes = {};
  for (const p of PARAM_LABELS) {
    maxes[p] = Math.max(...rows.map((r) => Number(r[p])));
  }
  return maxes;
}

// count-weighted so a field with more members doesn't count the same as a
// field with one — mirrors how each field's own row average is itself a
// count-weighted average of its members' per-parameter scores.
function teamAverageRow(rows) {
  const totalCount = rows.reduce((a, r) => a + (r.count || 0), 0);
  if (totalCount === 0) return null;
  const row = { field: "Team Average", count: totalCount };
  let total = 0;
  for (const p of PARAM_LABELS) {
    const avg = rows.reduce((a, r) => a + Number(r[p]) * (r.count || 0), 0) / totalCount;
    row[p] = Math.round(avg * 100) / 100;
    total += avg;
  }
  row.avg = Math.round((total / PARAM_LABELS.length) * 100) / 100;
  return row;
}

function Cell({ value, isMax }) {
  const { bg, text } = heatColor(value);
  return (
    <td className="px-3 py-2 text-center">
      <span
        className="inline-block px-2.5 py-1 rounded text-xs font-bold"
        style={{
          background: bg,
          color: text,
          minWidth: 40,
          ...(isMax ? { outline: "2px dashed #1e293b", outlineOffset: 2 } : {}),
        }}
        title={isMax ? "Highest score for this parameter" : undefined}
      >
        {Number(value).toFixed(2)}
      </span>
    </td>
  );
}

// rows: [{ field, count, Sincerity, "Team Spirit", Knowledge, Quantity, Quality, avg }]
export default function HeatmapGrid({ rows }) {
  if (!rows.length) {
    return <p className="text-sm text-slate-400 py-6 text-center">No scored data for this week yet.</p>;
  }
  const maxes = columnMaxes(rows);
  const teamAvg = teamAverageRow(rows);
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
              {PARAM_LABELS.map((p) => (
                <Cell key={p} value={row[p]} isMax={Number(row[p]) === maxes[p]} />
              ))}
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
          {teamAvg && (
            <tr className="border-t-2 border-slate-300">
              <td className="px-3 py-2 text-xs font-bold text-slate-800">{teamAvg.field}</td>
              {PARAM_LABELS.map((p) => (
                <td key={p} className="px-3 py-2 text-center">
                  <span className="inline-block px-2.5 py-1 rounded text-xs font-bold bg-slate-700 text-white" style={{ minWidth: 40 }}>
                    {Number(teamAvg[p]).toFixed(2)}
                  </span>
                </td>
              ))}
              <td className="px-3 py-2 text-center">
                <span className="inline-block px-2.5 py-1 rounded text-xs font-bold bg-slate-900 text-white" style={{ minWidth: 40 }}>
                  {Number(teamAvg.avg).toFixed(2)}
                </span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-400 mt-2">
        Dotted box = the highest score for that parameter across all fields. "Team Average" is each field's average
        weighted by its member count.
      </p>
    </div>
  );
}

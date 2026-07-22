import { PARAM_LABELS } from "../../utils/constants.js";

function heatColor(v) {
  const t = Math.max(0, Math.min(1, (v - 2.5) / 2.5));
  const r = Math.round(220 - t * 190);
  const g = Math.round(220 - t * 60);
  const b = Math.round(220 - t * 150);
  return `rgb(${r},${g},${b})`;
}

// rows: [{ field, Sincerity, "Team Spirit", Knowledge, Quantity, Quality, avg }]
export default function HeatmapGrid({ rows }) {
  if (!rows.length) {
    return <p className="text-sm text-gray-400 py-6 text-center">No scored data for this week yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 uppercase">Field</th>
            {PARAM_LABELS.map((p) => (
              <th key={p} className="text-center px-3 py-2 text-xs font-medium text-gray-600 uppercase">
                {p}
              </th>
            ))}
            <th className="text-center px-3 py-2 text-xs font-medium text-gray-600 uppercase">Avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field}>
              <td className="px-3 py-2 text-xs font-medium text-gray-800">{row.field}</td>
              {PARAM_LABELS.map((p) => (
                <td key={p} className="px-3 py-2 text-center">
                  <span
                    className="inline-block px-2.5 py-1 rounded text-xs font-bold text-white"
                    style={{ background: heatColor(row[p]), minWidth: 40 }}
                  >
                    {Number(row[p]).toFixed(2)}
                  </span>
                </td>
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
        </tbody>
      </table>
    </div>
  );
}

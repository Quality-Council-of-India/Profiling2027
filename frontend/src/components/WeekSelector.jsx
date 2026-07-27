import { NAV, ACCENT } from "../utils/constants.js";

/**
 * Week filter for Analytics: click to toggle any week on/off (multi-select),
 * or jump straight to "Cumulative" (every closed week averaged together).
 * The still-open week is included in the toggle list but not in "Cumulative"
 * — its data is still partial, so it shouldn't blend into a cumulative view.
 */
export default function WeekSelector({ weeks, selectedIds, onChange }) {
  const closedWeeks = weeks.filter((w) => w.status === "closed");
  const isCumulative =
    closedWeeks.length > 0 &&
    selectedIds.length === closedWeeks.length &&
    closedWeeks.every((w) => selectedIds.includes(w.id));

  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {weeks
        .filter((w) => w.status !== "upcoming")
        .map((w) => {
          const active = selectedIds.includes(w.id);
          return (
            <button
              key={w.id}
              onClick={() => toggle(w.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-standard ${
                active ? "text-white border-transparent" : "text-slate-600 border-slate-300 hover:border-slate-400"
              }`}
              style={active ? { background: NAV } : {}}
              title={w.status === "open" ? "Currently open — partial data" : "Closed"}
            >
              {w.label.replace("Week ", "W")}
              {w.status === "open" && <span className="ml-1 opacity-70">•</span>}
            </button>
          );
        })}
      {closedWeeks.length > 1 && (
        <button
          onClick={() => onChange(closedWeeks.map((w) => w.id))}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-standard ${
            isCumulative ? "text-white border-transparent" : "text-slate-600 border-dashed border-slate-300 hover:border-slate-400"
          }`}
          style={isCumulative ? { background: ACCENT } : {}}
        >
          Cumulative (all closed)
        </button>
      )}
    </div>
  );
}

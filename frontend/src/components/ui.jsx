export function Badge({ text, color }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: color + "1a", color }}
    >
      {text}
    </span>
  );
}

export function Card({ children, className = "", interactive = false }) {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 shadow-sm transition-standard ${
        interactive ? "hover:shadow-md hover:border-slate-300 cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, accent = false }) {
  return (
    <Card className="p-4 relative overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: accent ? "#E07B00" : "#A5C9EB" }}
      />
      <p className="text-xs uppercase tracking-wide text-slate-500 mb-1 pl-1.5">{label}</p>
      <p className={`font-display text-2xl font-bold tabular-nums pl-1.5 ${accent ? "text-orange-600" : "text-slate-900"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1 pl-1.5">{sub}</p>}
    </Card>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-400">
      <svg className="animate-spin h-6 w-6 text-nav/40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function ErrorBanner({ message }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
      <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.28 11.18c.75 1.334-.213 2.987-1.742 2.987H3.72c-1.53 0-2.493-1.653-1.743-2.987l6.28-11.18zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
}

/** Manual re-fetch for a page — e.g. after an Admin imports a new roster
 * or opens/closes a week, so other viewers don't have to wait for a
 * background refetch or full page reload to see it. */
export function RefreshButton({ onClick, isFetching = false, label = "Refresh" }) {
  return (
    <button
      onClick={onClick}
      disabled={isFetching}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-700 disabled:opacity-50 transition-standard flex-shrink-0"
    >
      <svg
        className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 10a6 6 0 0110.5-4M16 10a6 6 0 01-10.5 4" />
        <path d="M14.5 2.5V6H11M5.5 17.5V14H9" />
      </svg>
    </button>
  );
}

/** Simple centered overlay modal — click the backdrop or the × to close. */
export function Modal({ title, onClose, children, widthClass = "max-w-lg" }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-xl shadow-xl w-full ${widthClass} max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-standard"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon = "○", title, message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="text-3xl opacity-40">{icon}</span>
      {title && <p className="text-sm font-medium text-slate-600">{title}</p>}
      {message && <p className="text-xs text-slate-400 max-w-xs">{message}</p>}
    </div>
  );
}

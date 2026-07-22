export function Badge({ text, color }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: color + "20", color }}
    >
      {text}
    </span>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, accent = false }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-orange-600" : "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </Card>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-gray-400">{label}</div>
  );
}

export function ErrorBanner({ message }) {
  return (
    <div className="px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
      {message}
    </div>
  );
}

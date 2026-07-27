// Minimal stroke-based icon set for the nav — replaces emoji (renders
// inconsistently across platforms) with a consistent, professional look.
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };

export function DashboardIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <rect x="2.5" y="2.5" width="6" height="7" rx="1" />
      <rect x="11.5" y="2.5" width="6" height="4" rx="1" />
      <rect x="11.5" y="9.5" width="6" height="8" rx="1" />
      <rect x="2.5" y="12.5" width="6" height="5" rx="1" />
    </svg>
  );
}

export function EvaluateIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <path d="M12.5 2.8l4.7 4.7L7 17.7l-5 1.3 1.3-5 9.2-9.2z" />
      <path d="M11 4.3l4.7 4.7" />
    </svg>
  );
}

export function ScoresIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <rect x="3" y="2.5" width="14" height="15" rx="1.5" />
      <path d="M6.5 8.5l2 2 4-4.5" />
      <path d="M6.5 13.5h7" />
    </svg>
  );
}

export function TeamIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <circle cx="7" cy="6.5" r="2.5" />
      <path d="M2.5 17c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5" />
      <circle cx="14.5" cy="7.5" r="2" />
      <path d="M12.8 12.3c1.9.4 3.2 2.1 3.2 4.2" />
    </svg>
  );
}

export function ComplianceIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <path d="M10 2.3l6 2.2v5c0 4-2.6 6.9-6 8.2-3.4-1.3-6-4.2-6-8.2v-5l6-2.2z" />
      <path d="M7.2 9.8l1.9 1.9 3.7-4" />
    </svg>
  );
}

export function AnalyticsIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <path d="M3 17V9.5M8 17V3M13 17v-6M18 17H2" />
    </svg>
  );
}

export function AdminIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3L4.9 4.9" />
    </svg>
  );
}

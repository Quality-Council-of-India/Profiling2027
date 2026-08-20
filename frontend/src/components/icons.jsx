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

export function TrophyIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <path d="M6 3h8v4.5a4 4 0 01-8 0V3z" />
      <path d="M6 4.5H3.5a2 2 0 002 3.5H6M14 4.5h2.5a2 2 0 01-2 3.5H14" />
      <path d="M10 11.5v3M7.5 17h5M8.3 14.5h3.4l.5 2.5H7.8l.5-2.5z" />
    </svg>
  );
}

export function SearchIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M16.5 16.5l-4-4" />
    </svg>
  );
}

export function AnchorIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <circle cx="10" cy="4" r="1.6" />
      <path d="M10 5.8V16M5.5 10H3M17 10h-2.5M4 13.5c0 3 2.7 4.8 6 5 3.3-.2 6-2 6-5" />
      <path d="M6.5 8.2c-1 .6-1.7 1.3-2.5 1.8M13.5 8.2c1 .6 1.7 1.3 2.5 1.8" />
    </svg>
  );
}

export function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <path d="M10 2.3l6 2.2v5c0 4-2.6 6.9-6 8.2-3.4-1.3-6-4.2-6-8.2v-5l6-2.2z" />
    </svg>
  );
}

export function StarIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <path d="M10 2.5l2.3 4.9 5.3.7-3.9 3.7 1 5.3-4.7-2.6-4.7 2.6 1-5.3-3.9-3.7 5.3-.7z" />
    </svg>
  );
}

export function ConcernIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <path d="M2.5 5.5a2 2 0 012-2h11a2 2 0 012 2v6a2 2 0 01-2 2H8l-3.8 3v-3H4.5a2 2 0 01-2-2v-6z" />
      <path d="M10 7.2v2.3M10 11.8v.1" />
    </svg>
  );
}

export function BellIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <path d="M5 8.5a5 5 0 0110 0c0 2.3.6 3.6 1.4 4.6.3.4 0 1-.5 1H4.1c-.5 0-.8-.6-.5-1C4.4 12.1 5 10.8 5 8.5z" />
      <path d="M8.2 16a1.8 1.8 0 003.6 0" />
    </svg>
  );
}

export function HelpIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M7.7 7.8a2.3 2.3 0 014.4.9c0 1.5-2.1 1.7-2.1 3.3" strokeLinecap="round" />
      <path d="M10 14.8v.1" strokeLinecap="round" />
    </svg>
  );
}

export function MailIcon(props) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" {...base} {...props}>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="M3 5.5l7 5.5 7-5.5" />
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

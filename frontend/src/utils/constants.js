export const FIELDS = [
  "Arts - 1",
  "Arts - 2",
  "Literature & Education and Sports - 1",
  "Literature & Education and Sports - 2",
  "Medicine",
  "Public Affairs & Civil Services and Social Work - 1",
  "Science & Engineering",
  "Social Work - 2",
  "Trade & Industry and Others",
];

// [Profiling 2027] Feedback Form Revised Questionnaire v2, §4 Part I — 7
// parameters rated 1-7, replacing the 2026 cycle's 5-parameter/1-5 set.
export const PARAM_FIELDS = [
  {
    key: "ownership_discipline",
    label: "Ownership & Discipline",
    desc: "How would you rate your/your peer's sense of personal responsibility and self-discipline in assigned work?",
  },
  {
    key: "team_spirit",
    label: "Team Spirit",
    desc: "How would you rate your/your peer's ability to be supportive, approachable, cooperative, and unbiased within the team?",
  },
  {
    key: "communication_clarity",
    label: "Communication & Clarity",
    desc: "How clearly and constructively does your/your peer convey information — written and verbal — and articulate doubts or updates?",
  },
  {
    key: "domain_knowledge",
    label: "Domain Knowledge & Application",
    desc: "How would you rate your/your peer's understanding of profiling concepts and ability to apply them?",
  },
  {
    key: "timeliness_throughput",
    label: "Timeliness & Throughput",
    desc: "How punctually does your/your peer meet deadlines and complete the assigned volume of work?",
  },
  {
    key: "work_quality",
    label: "Work Quality & Attention to Detail",
    desc: "How would you rate the accuracy, thoroughness, and quality standards of your/your peer's deliverables?",
  },
  {
    key: "problem_solving_initiative",
    label: "Problem Solving & Initiative",
    desc: "How effectively does your/your peer independently identify, escalate, and resolve challenges?",
  },
];

export const PARAM_KEYS = PARAM_FIELDS.map((p) => p.key);
export const PARAM_LABELS = PARAM_FIELDS.map((p) => p.label);

// §4 Part I — 1-7 rating scale anchors.
export const RATING_SCALE = [
  { value: 1, label: "Very Poor" },
  { value: 2, label: "Poor" },
  { value: 3, label: "Below Avg" },
  { value: 4, label: "Average" },
  { value: 5, label: "Good" },
  { value: 6, label: "Very Good" },
  { value: 7, label: "Excellent" },
];

// §4 Part II, Question 11 — week-over-week directional signal, applicable
// from Week 2 onward (Week 1 submissions always send "not_applicable").
export const TRAJECTORY_OPTIONS = [
  { value: "improved", label: "Improved" },
  { value: "stayed_same", label: "Stayed the Same" },
  { value: "declined", label: "Declined" },
  { value: "not_applicable", label: "Not Applicable" },
];

export const TRAJECTORY_LABELS = Object.fromEntries(TRAJECTORY_OPTIONS.map((t) => [t.value, t.label]));

export const MAX_TAGS_PER_CATEGORY = 3;

// §4 Part II, Question 8 — capped at the top 3 per Change 4 (was unlimited).
export const STRENGTH_TAGS = [
  "Takes full ownership of work",
  "Is supportive and a team player",
  "Has strong project knowledge",
  "Good with Excel and other technical skills",
  "Effectively solves problems and resolves doubts",
  "Shows strong leadership",
  "Manages work efficiently and consistently meets deadlines",
  "Delivers high-quality work",
  "Maintains a positive attitude",
  "Communicates clearly and is approachable",
  "Receptive to feedback and is a quick learner",
  "Shows initiative and works proactively",
  "Adapts well to changing requirements",
];

// §4 Part II, Question 9 — capped at the top 3 per Change 4 (was unlimited).
export const WEAKNESS_TAGS = [
  "Needs to improve time management and meet deadlines",
  "Needs to increase attention to detail to improve work quality",
  "Needs to improve communication skills",
  "Needs to deepen understanding of project concepts",
  "Needs to be more available and responsive to the team",
  "Needs to take more initiative and work with greater autonomy",
  "Needs to improve team management and be unbiased in the team",
  "Needs to maintain better focus and discipline at work",
  "Needs to be more receptive to constructive feedback",
  "Needs to work on Excel and Analytical skills",
  "Needs to adapt better to changing priorities",
];

export const ROLE_LABELS = {
  admin: "Admin (Core Team)",
  project_lead: "Project Lead",
  casu_lead: "CASU Lead",
  group_anchor: "Group Anchor",
  casu_anchor: "CASU Anchor",
  profiler: "Profiler",
};

export const ROLE_COLORS = {
  admin: "#E07B00",
  project_lead: "#7C3AED",
  casu_lead: "#0891B2",
  group_anchor: "#059669",
  casu_anchor: "#2563EB",
  profiler: "#6B7280",
};

export const TICKET_CATEGORY_LABELS = {
  password_email_change: "Password / Email Change",
  portal_bug: "Portal Not Working",
  feature_not_working: "Functionality Not Working",
  other: "Other",
};

export const TICKET_STATUS_LABELS = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

export const TICKET_STATUS_COLORS = {
  open: "#E07B00",
  in_progress: "#2563EB",
  resolved: "#059669",
};

export const NAV = "#1F3864";
export const ACCENT = "#E07B00";
export const AZURE = "#A5C9EB";

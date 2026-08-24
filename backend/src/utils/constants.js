// Shared vocabulary for the feedback form — Technical Spec Appendices A & B.
// Kept identical to the frontend's copy (frontend/src/utils/constants.js) so
// seeded data and the live form always use the same parameter/tag set.

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
  { key: "ownership_discipline", label: "Ownership & Discipline" },
  { key: "team_spirit", label: "Team Spirit" },
  { key: "communication_clarity", label: "Communication & Clarity" },
  { key: "domain_knowledge", label: "Domain Knowledge & Application" },
  { key: "timeliness_throughput", label: "Timeliness & Throughput" },
  { key: "work_quality", label: "Work Quality & Attention to Detail" },
  { key: "problem_solving_initiative", label: "Problem Solving & Initiative" },
];

export const PARAMS = PARAM_FIELDS.map((p) => p.key);

// §4 Part II, Question 11 — week-over-week directional signal, applicable
// from Week 2 onward (Week 1 submissions always send "not_applicable").
export const TRAJECTORY_LABELS = {
  improved: "Improved",
  stayed_same: "Stayed the Same",
  declined: "Declined",
  not_applicable: "Not Applicable",
};

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

export const MAX_TAGS_PER_CATEGORY = 3;

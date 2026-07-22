// Role constants and grouping helpers used across access-control checks.
// Mirrors Technical Spec v3, Section 4.1.1 (Access Matrix).

export const ROLES = {
  PROFILER: "profiler",
  GROUP_ANCHOR: "group_anchor",
  CASU_ANCHOR: "casu_anchor",
  CASU_LEAD: "casu_lead",
  PROJECT_LEAD: "project_lead",
  ADMIN: "admin",
};

export const ALL_ROLES = Object.values(ROLES);

// Roles whose form-filling logic is "peer within your field + your anchors" (§4.2.2)
export const FIELD_ANCHOR_ROLES = [ROLES.GROUP_ANCHOR, ROLES.CASU_ANCHOR];

// Roles that get a personalised analytics view only (own scores/trends).
export const PERSONAL_ANALYTICS_ROLES = [
  ROLES.PROFILER,
  ROLES.GROUP_ANCHOR,
  ROLES.CASU_ANCHOR,
];

// Roles allowed to see the compliance tracker / send reminders.
export const COMPLIANCE_ROLES = [ROLES.CASU_LEAD, ROLES.PROJECT_LEAD, ROLES.ADMIN];

// Roles with full-visibility analytics (all fields, all roles including CASU).
export const FULL_ANALYTICS_ROLES = [ROLES.CASU_LEAD, ROLES.ADMIN];

export function isFieldAnchor(role) {
  return FIELD_ANCHOR_ROLES.includes(role);
}

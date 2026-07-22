// Data-scoping rules that implement the Access Matrix (Technical Spec §4.1.1).
// Role-gate middleware (src/middleware/auth.js) handles coarse "can hit this
// route at all" checks; this module handles the finer "which rows can this
// user see" scoping that depends on field + role combinations.

import { ROLES } from "../utils/roles.js";

/**
 * Can `requester` view the scores/profile of `target`?
 * target: { id, role, field }
 */
export function canViewUser(requester, target) {
  if (requester.id === target.id) return true;

  switch (requester.role) {
    case ROLES.ADMIN:
    case ROLES.CASU_LEAD:
      // "Everyone's scores (all fields)"
      return true;
    case ROLES.PROJECT_LEAD:
      // "All Group Anchors' scores" + "All Profilers' scores" — excludes CASU roles
      return [ROLES.PROFILER, ROLES.GROUP_ANCHOR].includes(target.role);
    case ROLES.GROUP_ANCHOR:
    case ROLES.CASU_ANCHOR:
      // "Profilers & Anchor scores in own field"
      return target.field === requester.field;
    default:
      return false;
  }
}

/** Can `requester` view the aggregate Team View for `field`? */
export function canViewFieldTeam(requester, field) {
  if ([ROLES.ADMIN, ROLES.CASU_LEAD, ROLES.PROJECT_LEAD].includes(requester.role)) {
    return true;
  }
  if ([ROLES.GROUP_ANCHOR, ROLES.CASU_ANCHOR].includes(requester.role)) {
    return requester.field === field;
  }
  return false;
}

/** Can `requester` open the compliance tracker / send reminders? */
export function canViewCompliance(requester) {
  return [ROLES.ADMIN, ROLES.CASU_LEAD, ROLES.PROJECT_LEAD].includes(requester.role);
}

/** Can `requester` open/close weeks or manage the roster? */
export function isAdmin(requester) {
  return requester.role === ROLES.ADMIN;
}

/**
 * Analytics scoping. Returns one of:
 *  - "personal" — only own data (Profiler / Group Anchor / CASU Anchor)
 *  - "excl_casu" — all Profilers + Group Anchors, no CASU roles (Project Lead)
 *  - "full" — everyone, all fields (CASU Lead / Admin)
 */
export function analyticsScope(requester) {
  if ([ROLES.ADMIN, ROLES.CASU_LEAD].includes(requester.role)) return "full";
  if (requester.role === ROLES.PROJECT_LEAD) return "excl_casu";
  return "personal";
}

/** Prisma `where` fragment restricting a user list to what `scope` permits. */
export function roleFilterForScope(scope) {
  if (scope === "excl_casu") {
    return { role: { in: [ROLES.PROFILER, ROLES.GROUP_ANCHOR] } };
  }
  return {}; // "full" — no restriction
}

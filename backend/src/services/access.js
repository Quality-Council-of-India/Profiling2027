// Data-scoping rules that implement the Access Matrix (Technical Spec §4.1.1).
// Role-gate middleware (src/middleware/auth.js) handles coarse "can hit this
// route at all" checks; this module handles the finer "which rows can this
// user see" scoping that depends on field + role combinations.

import { ROLES } from "../utils/roles.js";
import { fieldList, sharesField } from "../utils/fields.js";

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
      // "Profilers & Anchor scores in own field" — a CASU Anchor can cover
      // more than one field, so this is "shares at least one field" rather
      // than an exact match.
      return sharesField(requester, target);
    default:
      return false;
  }
}

/**
 * Team View membership — who shows up in `requester`'s team roster.
 * Role-driven, not a field the client picks:
 *   Group Anchor  -> Profilers in own field
 *   CASU Anchor   -> Profilers + Group Anchor in own field
 *   Project Lead  -> ALL Profilers + ALL Group Anchors + the OTHER Project Lead(s)
 *   CASU Lead     -> everyone (all Profilers, Group Anchors, CASU Anchors, Project Leads)
 *   Admin         -> everyone (same as CASU Lead)
 * Returns a Prisma `where` fragment, or null if this role has no Team View at all.
 */
export function teamViewFilter(requester) {
  switch (requester.role) {
    case ROLES.GROUP_ANCHOR:
      return { field: requester.field, role: ROLES.PROFILER };
    case ROLES.CASU_ANCHOR:
      // A CASU Anchor can cover more than one field (comma-joined in `field`).
      return { field: { in: fieldList(requester.field) }, role: { in: [ROLES.PROFILER, ROLES.GROUP_ANCHOR] } };
    case ROLES.PROJECT_LEAD:
      return {
        OR: [
          { role: { in: [ROLES.PROFILER, ROLES.GROUP_ANCHOR] } },
          { role: ROLES.PROJECT_LEAD, id: { not: requester.id } },
        ],
      };
    case ROLES.CASU_LEAD:
    case ROLES.ADMIN:
      return { role: { not: ROLES.ADMIN } };
    default:
      return null;
  }
}

/**
 * Same membership rules as teamViewFilter, but as a plain predicate over
 * already-resolved (role, field) values on both sides, usable when the
 * data source is a historical per-week snapshot rather than a live Prisma
 * query (see getTeamScores) — the target's field there comes from a
 * ComputedScore row, not the live User table, so it can't be pushed into a
 * `where` clause the way teamViewFilter's result can.
 */
export function teamViewMatches(requester, target) {
  switch (requester.role) {
    case ROLES.GROUP_ANCHOR:
      return target.role === ROLES.PROFILER && sharesField(requester, target);
    case ROLES.CASU_ANCHOR:
      return [ROLES.PROFILER, ROLES.GROUP_ANCHOR].includes(target.role) && sharesField(requester, target);
    case ROLES.PROJECT_LEAD:
      return (
        [ROLES.PROFILER, ROLES.GROUP_ANCHOR].includes(target.role) ||
        (target.role === ROLES.PROJECT_LEAD && target.id !== requester.id)
      );
    case ROLES.CASU_LEAD:
    case ROLES.ADMIN:
      return target.role !== ROLES.ADMIN;
    default:
      return false;
  }
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

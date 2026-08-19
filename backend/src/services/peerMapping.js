// Auto-generates peer_mappings from the team roster, per Technical Spec §4.2.2.
//
//   Profiler      → all other Profilers in same field + own Group Anchor + own CASU Anchor(s)
//   Group Anchor  → all Profilers in own field + own CASU Anchor(s) + the Project Lead(s)
//   CASU Anchor   → own Group Anchor + all Profilers in own field + CASU Lead(s)
//                   (per field they cover — one CASU Anchor can cover more than one field,
//                   and one field can have more than one CASU Anchor; see utils/fields.js)
//   CASU Lead     → all Group Anchors + the Project Lead(s)
//   Project Lead  → all Group Anchors + CASU Lead(s)
//   Admin         → fills no evaluations

import { prisma } from "../utils/prisma.js";
import { ROLES } from "../utils/roles.js";
import { fieldList } from "../utils/fields.js";

/**
 * Rebuilds peer_mappings for a project from scratch based on the current
 * active roster. Safe to re-run after a roster import.
 */
export async function regeneratePeerMappings(projectId) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true },
  });

  const byField = {};
  const teamFor = (field) => (byField[field] ??= { profilers: [], group_anchor: null, casu_anchors: [] });

  for (const u of users) {
    if (!u.field) continue;
    if (u.role === ROLES.CASU_ANCHOR) {
      for (const field of fieldList(u.field)) teamFor(field).casu_anchors.push(u);
      continue;
    }
    // Every other fielded role has exactly one field.
    const team = teamFor(u.field);
    if (u.role === ROLES.PROFILER) team.profilers.push(u);
    if (u.role === ROLES.GROUP_ANCHOR) team.group_anchor = u;
  }

  const projectLeads = users.filter((u) => u.role === ROLES.PROJECT_LEAD);
  const casuLeads = users.filter((u) => u.role === ROLES.CASU_LEAD);
  const allGroupAnchors = users.filter((u) => u.role === ROLES.GROUP_ANCHOR);

  const pairs = new Set();
  const rows = [];
  const addMapping = (evaluator, evaluatee) => {
    if (!evaluator || !evaluatee || evaluator.id === evaluatee.id) return;
    const key = `${evaluator.id}:${evaluatee.id}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    rows.push({
      project_id: projectId,
      evaluator_id: evaluator.id,
      evaluatee_id: evaluatee.id,
      mapping_type: "peer",
    });
  };

  for (const [, team] of Object.entries(byField)) {
    const { profilers, group_anchor, casu_anchors } = team;

    // Profilers evaluate: other profilers in field + own GA + own CASU anchor(s)
    for (const p of profilers) {
      for (const peer of profilers) addMapping(p, peer);
      addMapping(p, group_anchor);
      for (const ca of casu_anchors) addMapping(p, ca);
    }

    // Group Anchor evaluates: all profilers in field + own CASU anchor(s) + Project Lead(s)
    if (group_anchor) {
      for (const p of profilers) addMapping(group_anchor, p);
      for (const ca of casu_anchors) addMapping(group_anchor, ca);
      for (const pl of projectLeads) addMapping(group_anchor, pl);
    }

    // CASU Anchor(s) evaluate: own GA + all profilers in field + CASU Lead(s)
    for (const ca of casu_anchors) {
      addMapping(ca, group_anchor);
      for (const p of profilers) addMapping(ca, p);
      for (const cl of casuLeads) addMapping(ca, cl);
    }
  }

  // CASU Lead evaluates: all Group Anchors + Project Lead(s)
  for (const cl of casuLeads) {
    for (const ga of allGroupAnchors) addMapping(cl, ga);
    for (const pl of projectLeads) addMapping(cl, pl);
  }

  // Project Lead evaluates: all Group Anchors + CASU Lead(s)
  for (const pl of projectLeads) {
    for (const ga of allGroupAnchors) addMapping(pl, ga);
    for (const cl of casuLeads) addMapping(pl, cl);
  }

  await prisma.$transaction([
    prisma.peerMapping.deleteMany({ where: { project_id: projectId } }),
    prisma.peerMapping.createMany({ data: rows, skipDuplicates: true }),
  ]);

  return { mappingsCreated: rows.length };
}

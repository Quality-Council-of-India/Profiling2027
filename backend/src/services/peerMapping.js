// Auto-generates peer_mappings from the team roster, per Technical Spec §4.2.2.
//
//   Profiler      → all other Profilers in same field + own Group Anchor + own CASU Anchor
//   Group Anchor  → all Profilers in own field + own CASU Anchor + the Project Lead(s)
//   CASU Anchor   → own Group Anchor + all Profilers in own field + CASU Lead(s)
//   CASU Lead     → all Group Anchors + the Project Lead(s)
//   Project Lead  → all Group Anchors + CASU Lead(s)
//   Admin         → fills no evaluations

import { prisma } from "../utils/prisma.js";
import { ROLES } from "../utils/roles.js";

/**
 * Rebuilds peer_mappings for a project from scratch based on the current
 * active roster. Safe to re-run after a roster import.
 */
export async function regeneratePeerMappings(projectId) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, is_active: true },
  });

  const byField = {};
  for (const u of users) {
    if (!u.field) continue;
    byField[u.field] ??= { profilers: [], group_anchor: null, casu_anchor: null };
    if (u.role === ROLES.PROFILER) byField[u.field].profilers.push(u);
    if (u.role === ROLES.GROUP_ANCHOR) byField[u.field].group_anchor = u;
    if (u.role === ROLES.CASU_ANCHOR) byField[u.field].casu_anchor = u;
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
    const { profilers, group_anchor, casu_anchor } = team;

    // Profilers evaluate: other profilers in field + own GA + own CASU anchor
    for (const p of profilers) {
      for (const peer of profilers) addMapping(p, peer);
      addMapping(p, group_anchor);
      addMapping(p, casu_anchor);
    }

    // Group Anchor evaluates: all profilers in field + own CASU anchor + Project Lead(s)
    if (group_anchor) {
      for (const p of profilers) addMapping(group_anchor, p);
      addMapping(group_anchor, casu_anchor);
      for (const pl of projectLeads) addMapping(group_anchor, pl);
    }

    // CASU Anchor evaluates: own GA + all profilers in field + CASU Lead(s)
    if (casu_anchor) {
      addMapping(casu_anchor, group_anchor);
      for (const p of profilers) addMapping(casu_anchor, p);
      for (const cl of casuLeads) addMapping(casu_anchor, cl);
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

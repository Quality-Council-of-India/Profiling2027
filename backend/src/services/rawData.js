// Admin raw-data browser — view-only access into every backend table, so
// the admin doesn't need to go into Supabase directly to see who filled
// what, for whom, per week. Each table gets its own query (rather than one
// generic reflection-based query) so results come back joined/readable
// instead of bare foreign-key IDs, and so table names stay whitelisted.

import { prisma } from "../utils/prisma.js";

export const TABLES = ["projects", "users", "peer_mappings", "weeks", "evaluations", "computed_scores"];

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

function pagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

async function paged(model, where, orderBy, page, pageSize, skip, take) {
  const [rows, total] = await Promise.all([
    model.findMany({ where, orderBy, skip, take }),
    model.count({ where }),
  ]);
  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function queryTable(table, projectId, query) {
  const { page, pageSize, skip, take } = pagination(query);
  const weekId = query.weekId ? Number(query.weekId) : undefined;

  switch (table) {
    case "projects":
      return paged(prisma.project, {}, { year: "desc" }, page, pageSize, skip, take);

    case "users":
      return paged(
        prisma.user,
        { project_id: projectId },
        [{ field: "asc" }, { role: "asc" }, { name: "asc" }],
        page,
        pageSize,
        skip,
        take
      ).then((result) => ({
        ...result,
        // Never surface the hash, even to the admin's own browser.
        rows: result.rows.map(({ password_hash, ...rest }) => rest),
      }));

    case "weeks":
      return paged(prisma.week, { project_id: projectId }, { week_number: "asc" }, page, pageSize, skip, take);

    case "peer_mappings": {
      const result = await paged(
        prisma.peerMapping,
        { project_id: projectId },
        [{ evaluator_id: "asc" }, { evaluatee_id: "asc" }],
        page,
        pageSize,
        skip,
        take
      );
      const ids = [...new Set(result.rows.flatMap((r) => [r.evaluator_id, r.evaluatee_id]))];
      const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true, field: true } });
      const byId = new Map(users.map((u) => [u.id, u]));
      return {
        ...result,
        rows: result.rows.map((r) => ({
          id: r.id,
          evaluator: byId.get(r.evaluator_id) || null,
          evaluatee: byId.get(r.evaluatee_id) || null,
          mapping_type: r.mapping_type,
        })),
      };
    }

    case "evaluations": {
      const where = { week: { project_id: projectId }, ...(weekId ? { week_id: weekId } : {}) };
      const result = await paged(
        prisma.evaluation,
        where,
        { submitted_at: "desc" },
        page,
        pageSize,
        skip,
        take
      );
      const ids = [...new Set(result.rows.flatMap((r) => [r.evaluator_id, r.evaluatee_id]))];
      const [users, weeks] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } }),
        prisma.week.findMany({ where: { id: { in: [...new Set(result.rows.map((r) => r.week_id))] } }, select: { id: true, label: true } }),
      ]);
      const usersById = new Map(users.map((u) => [u.id, u]));
      const weeksById = new Map(weeks.map((w) => [w.id, w]));
      return {
        ...result,
        rows: result.rows.map((r) => ({
          id: r.id,
          week: weeksById.get(r.week_id) || null,
          evaluator: usersById.get(r.evaluator_id) || null,
          evaluatee: usersById.get(r.evaluatee_id) || null,
          eval_type: r.eval_type,
          sincerity: r.sincerity,
          team_spirit: r.team_spirit,
          knowledge: r.knowledge,
          quantity: r.quantity,
          quality: r.quality,
          problem_solving: r.problem_solving,
          problem_reason: r.problem_reason,
          strengths_tags: r.strengths_tags,
          weakness_tags: r.weakness_tags,
          strength_comment: r.strength_comment,
          weakness_comment: r.weakness_comment,
          submitted_at: r.submitted_at,
        })),
      };
    }

    case "computed_scores": {
      const where = { week: { project_id: projectId }, ...(weekId ? { week_id: weekId } : {}) };
      const result = await paged(
        prisma.computedScore,
        where,
        { computed_at: "desc" },
        page,
        pageSize,
        skip,
        take
      );
      const userIds = [...new Set(result.rows.map((r) => r.user_id))];
      const weekIds = [...new Set(result.rows.map((r) => r.week_id))];
      const [users, weeks] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: true, field: true } }),
        prisma.week.findMany({ where: { id: { in: weekIds } }, select: { id: true, label: true } }),
      ]);
      const usersById = new Map(users.map((u) => [u.id, u]));
      const weeksById = new Map(weeks.map((w) => [w.id, w]));
      return {
        ...result,
        rows: result.rows.map((r) => ({
          ...r,
          user: usersById.get(r.user_id) || null,
          week: weeksById.get(r.week_id) || null,
        })),
      };
    }

    default:
      throw Object.assign(new Error(`Unknown table "${table}"`), { status: 400 });
  }
}

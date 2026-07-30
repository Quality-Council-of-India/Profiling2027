import { prisma } from "../utils/prisma.js";
import { importRoster } from "../services/roster.js";
import { computeScoresForWeek } from "../services/scoreEngine.js";
import { regeneratePeerMappings } from "../services/peerMapping.js";
import { queryTable, TABLES } from "../services/rawData.js";
import { buildEvaluationsExportWorkbook } from "../services/export.js";
import { streamWorkbook } from "./export.controller.js";
import { signAuthToken } from "../utils/jwt.js";
import { publicUser } from "./auth.controller.js";
import { ALL_ROLES, ROLES } from "../utils/roles.js";

const EXPORTABLE_TABLES = ["self_evaluations", "peer_evaluations"];

/**
 * "View portal as <role>" — lets Admin preview/test the app the way a real
 * professional sees it (Evaluate, My Scores, etc. are meaningless for an
 * Admin's own account, since Admins never submit or receive evaluations).
 * Picks the first active user of that role in the project and signs them a
 * token; the `impersonated_by` claim keeps a trace of who initiated it.
 */
export async function impersonateRole(req, res) {
  const { role } = req.params;
  if (role === ROLES.ADMIN || !ALL_ROLES.includes(role)) {
    return res.status(400).json({ error: `Cannot preview as "${role}"` });
  }

  const target = await prisma.user.findFirst({
    where: { project_id: req.user.project_id, role, is_active: true },
    orderBy: { name: "asc" },
  });
  if (!target) {
    return res.status(404).json({ error: `No active user with role "${role}" exists yet` });
  }

  const token = signAuthToken(target, { impersonated_by: req.user.id });
  res.json({ token, user: publicUser(target) });
}

/**
 * Creates the next sequential week for the project (auto-numbered,
 * defaulting to a 7-day span starting the day after the previous week
 * ends). Needed because a freshly-provisioned project has zero weeks —
 * without this, Team View/Compliance/Analytics have nothing to filter by.
 */
export async function createWeek(req, res) {
  const projectId = req.user.project_id;
  const last = await prisma.week.findFirst({
    where: { project_id: projectId },
    orderBy: { week_number: "desc" },
  });

  const week_number = (last?.week_number ?? 0) + 1;
  const label = req.body.label?.trim() || `Week ${String(week_number).padStart(2, "0")}`;
  const start_date = req.body.start_date
    ? new Date(req.body.start_date)
    : last
    ? new Date(new Date(last.end_date).getTime() + 24 * 60 * 60 * 1000)
    : new Date();
  const end_date = req.body.end_date
    ? new Date(req.body.end_date)
    : new Date(start_date.getTime() + 6 * 24 * 60 * 60 * 1000);

  const week = await prisma.week.create({
    data: { project_id: projectId, week_number, label, start_date, end_date, status: "upcoming" },
  });
  res.status(201).json({ week });
}

export async function openWeek(req, res) {
  const weekId = Number(req.params.id);
  const week = await prisma.week.findFirst({
    where: { id: weekId, project_id: req.user.project_id },
  });
  if (!week) return res.status(404).json({ error: "Week not found" });

  const updated = await prisma.week.update({ where: { id: weekId }, data: { status: "open" } });
  res.json({ week: updated });
}

export async function closeWeek(req, res) {
  const weekId = Number(req.params.id);
  const week = await prisma.week.findFirst({
    where: { id: weekId, project_id: req.user.project_id },
  });
  if (!week) return res.status(404).json({ error: "Week not found" });

  const updated = await prisma.week.update({ where: { id: weekId }, data: { status: "closed" } });
  // Final recompute on close so every professional (even non-responders) has a row.
  await computeScoresForWeek(weekId, req.user.project_id);
  res.json({ week: updated });
}

export async function importRosterHandler(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Upload a .csv or .xlsx file under the 'roster' field" });
    }
    const result = await importRoster(req.user.project_id, req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** Full roster, including inactive users — for the Admin Panel's roster manager. */
export async function listUsers(req, res) {
  const users = await prisma.user.findMany({
    where: { project_id: req.user.project_id },
    orderBy: [{ is_active: "desc" }, { field: "asc" }, { role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, field: true, is_active: true },
  });
  res.json({ users });
}

/**
 * Deactivates/reactivates a user for mid-project roster changes (§ someone
 * quits partway through the cycle). Historical evaluations/computed_scores
 * are untouched — only peer_mappings gets regenerated, so future weeks
 * correctly stop expecting evaluations to/from this person without
 * rewriting anything already submitted.
 */
export async function setUserActive(req, res) {
  const userId = Number(req.params.id);
  const { is_active } = req.body;
  if (typeof is_active !== "boolean") {
    return res.status(400).json({ error: "Body must include boolean is_active" });
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, project_id: req.user.project_id },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === "admin") {
    return res.status(400).json({ error: "Cannot deactivate an admin account" });
  }

  const updated = await prisma.user.update({ where: { id: userId }, data: { is_active } });
  const { mappingsCreated } = await regeneratePeerMappings(req.user.project_id);

  res.json({ user: updated, mappingsCreated });
}

/** Lists the tables the raw-data browser can show. */
export async function listRawTables(req, res) {
  res.json({ tables: TABLES });
}

/** Raw, view-only rows for one table — see services/rawData.js for per-table shaping. */
export async function getRawTable(req, res, next) {
  try {
    const { table } = req.params;
    if (!TABLES.includes(table)) {
      return res.status(400).json({ error: `Unknown table. Valid: ${TABLES.join(", ")}` });
    }
    const result = await queryTable(table, req.user.project_id, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** .xlsx export of every row in a self/peer evaluations table, optionally filtered to one week. */
export async function exportRawTable(req, res, next) {
  try {
    const { table } = req.params;
    if (!EXPORTABLE_TABLES.includes(table)) {
      return res.status(400).json({ error: `Only ${EXPORTABLE_TABLES.join(", ")} can be exported` });
    }
    const weekId = req.query.weekId ? Number(req.query.weekId) : undefined;
    const { workbook, filename } = await buildEvaluationsExportWorkbook(req.user.project_id, table, weekId);
    await streamWorkbook(res, workbook, filename);
  } catch (err) {
    next(err);
  }
}

/**
 * Unlocks one specific evaluation row so its evaluator can submit exactly
 * one corrective edit — the next successful submission re-locks it
 * automatically (see evaluations.controller.js submitEvaluation). Every
 * other resubmission attempt is rejected while locked, so this is the only
 * way a professional's own evaluation can be revised after the fact.
 */
export async function unlockEvaluation(req, res) {
  const evaluationId = Number(req.params.id);
  const evaluation = await prisma.evaluation.findFirst({
    where: { id: evaluationId, week: { project_id: req.user.project_id } },
  });
  if (!evaluation) return res.status(404).json({ error: "Evaluation not found" });

  const updated = await prisma.evaluation.update({
    where: { id: evaluationId },
    data: { locked: false },
  });
  res.json({ evaluation: updated });
}

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { importRoster } from "../services/roster.js";
import { computeScoresForWeek } from "../services/scoreEngine.js";
import { regeneratePeerMappings } from "../services/peerMapping.js";
import { queryTable, TABLES } from "../services/rawData.js";
import { buildEvaluationsExportWorkbook } from "../services/export.js";
import { streamWorkbook } from "./export.controller.js";
import { signAuthToken } from "../utils/jwt.js";
import { publicUser, sendPasswordResetEmail } from "./auth.controller.js";
import { ALL_ROLES, ROLES } from "../utils/roles.js";
import { notify, getActiveNonAdminIds } from "../services/notifications.js";

const EXPORTABLE_TABLES = ["self_evaluations", "peer_evaluations"];
const setPasswordSchema = z.object({ password: z.string().min(8) });

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

  const recipientIds = await getActiveNonAdminIds(req.user.project_id);
  await notify(req.user.project_id, recipientIds, {
    type: "week_opened",
    title: `${updated.label} is now open`,
    body: "Submit your Self-Evaluation and Peer Evaluations before the window closes.",
    link: "/dashboard",
    emailHtml: (u) => `
      <p>Hi ${u.name},</p>
      <p><strong>${updated.label}</strong> is now open on the Profiling 2027 Feedback Portal. Please log in and submit
      your Self-Evaluation and Peer Evaluations before the window closes.</p>
      <p>— Core Team</p>
    `,
  });

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

  const recipientIds = await getActiveNonAdminIds(req.user.project_id);
  await notify(req.user.project_id, recipientIds, {
    type: "week_closed",
    title: `${updated.label} is now closed`,
    body: "Your scores for this week are final — check My Scores or Analytics.",
    link: "/scores",
    emailHtml: (u) => `
      <p>Hi ${u.name},</p>
      <p><strong>${updated.label}</strong> has closed on the Profiling 2027 Feedback Portal. Your scores for this
      week are now final — check "My Scores" or "Analytics" to see them.</p>
      <p>— Core Team</p>
    `,
  });

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
    select: { id: true, name: true, email: true, emp_id: true, role: true, field: true, photo_url: true, is_active: true },
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

/**
 * Directly sets a user's password — the only way an Admin can act on a
 * password, alongside sendUserPasswordReset below. Existing passwords are
 * bcrypt hashes and are never readable, viewable, or exportable by anyone,
 * including Admin — there is no "view password" capability, by design.
 */
export async function setUserPassword(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const { password } = setPasswordSchema.parse(req.body);

    const user = await prisma.user.findFirst({ where: { id: userId, project_id: req.user.project_id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const password_hash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: userId }, data: { password_hash } });
    res.json({ message: `Password updated for ${user.name}.` });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    next(err);
  }
}

/** Sends the same self-service reset-link email, on the Admin's behalf, for a specific user. */
export async function sendUserPasswordReset(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const user = await prisma.user.findFirst({ where: { id: userId, project_id: req.user.project_id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    await sendPasswordResetEmail(user);
    res.json({ message: `Reset link emailed to ${user.email}.` });
  } catch (err) {
    next(err);
  }
}

const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Admin uploads a user's photo (for the Hall of Recognition winner cards).
 * Stored as a base64 data: URI directly in photo_url — there's no object
 * storage (S3/Cloudinary) in this stack, and a handful of small compressed
 * photos for a ~70-person roster is trivial for Postgres to hold as text.
 */
export async function uploadUserPhoto(req, res) {
  const userId = Number(req.params.id);
  if (!req.file) {
    return res.status(400).json({ error: "Upload an image file under the 'photo' field" });
  }
  if (!PHOTO_MIME_TYPES.includes(req.file.mimetype)) {
    return res.status(400).json({ error: "Only JPEG, PNG, or WEBP images are accepted" });
  }

  const user = await prisma.user.findFirst({ where: { id: userId, project_id: req.user.project_id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const photo_url = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
  const updated = await prisma.user.update({ where: { id: userId }, data: { photo_url } });
  res.json({ user: { id: updated.id, photo_url: updated.photo_url } });
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

/**
 * Bulk-unlocks every evaluation for a week — for the "whole team needs to
 * resubmit" case (e.g. turnout was too low), as opposed to unlocking one
 * person's row at a time via the Raw Data Browser for individual corrections.
 * Doesn't change the week's open/closed status itself — pair with
 * openWeek if the week had already closed.
 */
export async function unlockAllForWeek(req, res) {
  const weekId = Number(req.params.id);
  const week = await prisma.week.findFirst({ where: { id: weekId, project_id: req.user.project_id } });
  if (!week) return res.status(404).json({ error: "Week not found" });

  const { count } = await prisma.evaluation.updateMany({
    where: { week_id: weekId, locked: true },
    data: { locked: false },
  });
  res.json({ unlockedCount: count });
}

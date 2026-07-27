import { prisma } from "../utils/prisma.js";
import { importRoster } from "../services/roster.js";
import { computeScoresForWeek } from "../services/scoreEngine.js";
import { regeneratePeerMappings } from "../services/peerMapping.js";
import { queryTable, TABLES } from "../services/rawData.js";

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
      return res.status(400).json({ error: "Upload a CSV file under the 'roster' field" });
    }
    const csvText = req.file.buffer.toString("utf-8");
    const result = await importRoster(req.user.project_id, csvText);
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

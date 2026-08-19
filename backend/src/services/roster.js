import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { prisma } from "../utils/prisma.js";
import { ALL_ROLES } from "../utils/roles.js";
import { regeneratePeerMappings } from "./peerMapping.js";

function generateTempPassword() {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars, URL-safe
}

/** Parses an .xlsx roster (first sheet, header row = name/email/role/field) into plain row objects. */
async function parseXlsxRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers = [];
  sheet.getRow(1).eachCell((cell, col) => {
    headers[col] = String(cell.value ?? "").trim().toLowerCase();
  });

  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const obj = {};
    headers.forEach((h, col) => {
      if (!h) return;
      const val = row.getCell(col).value;
      obj[h] = val === null || val === undefined ? "" : String(val).trim();
    });
    if (Object.values(obj).some((v) => v)) rows.push(obj);
  }
  return rows;
}

/**
 * Bulk imports a team roster from a .csv or .xlsx file (columns:
 * name,email,role,field, optionally photo_url) for a project, then rebuilds
 * peer_mappings from the new roster (§4.2.2 / §5 POST /api/admin/roster/import).
 *
 * New users get a random placeholder password — not emailed here; an Admin
 * issues real credentials afterward via "Send Login Credentials to All" in
 * Password Management, in one deliberate batch rather than one email per
 * import. Existing users (matched by email) have name/role/field updated but
 * keep their current password. photo_url is only touched when the uploaded file
 * actually has that column — a re-import for an unrelated fix (e.g.
 * correcting someone's field) without a photo_url column won't wipe out
 * photos set by an earlier import.
 */
export async function importRoster(projectId, buffer, filename = "roster.csv") {
  const rows = filename.toLowerCase().endsWith(".xlsx")
    ? await parseXlsxRows(buffer)
    : parse(buffer.toString("utf-8"), { columns: true, skip_empty_lines: true, trim: true });

  const hasPhotoColumn = rows.some((r) => Object.prototype.hasOwnProperty.call(r, "photo_url"));
  const hasEmpIdColumn = rows.some((r) => Object.prototype.hasOwnProperty.call(r, "emp_id"));

  const created = [];
  const updated = [];
  const errors = [];

  for (const [i, row] of rows.entries()) {
    const line = i + 2; // +1 header, +1 1-indexed
    const name = row.name?.trim();
    const email = row.email?.trim().toLowerCase();
    const role = row.role?.trim();
    const field = row.field?.trim() || null;
    const photoFields = hasPhotoColumn ? { photo_url: row.photo_url?.trim() || null } : {};
    const empIdFields = hasEmpIdColumn ? { emp_id: row.emp_id?.trim() || null } : {};

    if (!name || !email || !role) {
      errors.push({ line, error: "name, email, and role are required" });
      continue;
    }
    if (!ALL_ROLES.includes(role)) {
      errors.push({ line, error: `Unknown role "${role}"` });
      continue;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const user = await prisma.user.update({
        where: { email },
        data: { name, role, field, project_id: projectId, is_active: true, ...photoFields, ...empIdFields },
      });
      updated.push({ id: user.id, name, email, role, field });
    } else {
      // Temp password here is a placeholder only — nobody's emailed it. An
      // Admin issues real, deliberate credentials afterward via "Send Login
      // Credentials to All" in Password Management, which resets every
      // active non-admin user's password (this one included) and emails it
      // in one synchronized batch, rather than trickling out one welcome
      // email per roster import.
      const tempPassword = generateTempPassword();
      const password_hash = await bcrypt.hash(tempPassword, 12);
      const user = await prisma.user.create({
        data: { project_id: projectId, name, email, role, field, password_hash, ...photoFields, ...empIdFields },
      });
      created.push({ id: user.id, name, email, role, field });
    }
  }

  const { mappingsCreated } = await regeneratePeerMappings(projectId);

  return {
    createdCount: created.length,
    updatedCount: updated.length,
    created,
    updated,
    errors,
    mappingsCreated,
  };
}

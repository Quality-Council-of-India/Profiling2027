import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { parse } from "csv-parse/sync";
import { prisma } from "../utils/prisma.js";
import { ALL_ROLES } from "../utils/roles.js";
import { regeneratePeerMappings } from "./peerMapping.js";
import { sendMail } from "./mailer.js";

function generateTempPassword() {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars, URL-safe
}

/**
 * Bulk imports a team roster from CSV (columns: name,email,role,field) for a
 * project, then rebuilds peer_mappings from the new roster (§4.2.2 / §5
 * POST /api/admin/roster/import).
 *
 * New users get a random temp password (emailed to them, best-effort);
 * existing users (matched by email) have name/role/field updated but keep
 * their current password.
 */
export async function importRoster(projectId, csvText) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

  const created = [];
  const updated = [];
  const errors = [];

  for (const [i, row] of rows.entries()) {
    const line = i + 2; // +1 header, +1 1-indexed
    const name = row.name?.trim();
    const email = row.email?.trim().toLowerCase();
    const role = row.role?.trim();
    const field = row.field?.trim() || null;

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
        data: { name, role, field, project_id: projectId, is_active: true },
      });
      updated.push({ id: user.id, name, email, role, field });
    } else {
      const tempPassword = generateTempPassword();
      const password_hash = await bcrypt.hash(tempPassword, 12);
      const user = await prisma.user.create({
        data: { project_id: projectId, name, email, role, field, password_hash },
      });
      created.push({ id: user.id, name, email, role, field, tempPassword });

      sendMail({
        to: email,
        subject: "Your Profiling 2027 Feedback Portal account",
        html: `<p>Hi ${name},</p><p>An account has been created for you on the Feedback Portal.</p><p>Email: ${email}<br/>Temporary password: <strong>${tempPassword}</strong></p><p>Please log in and use "Forgot password" to set your own password.</p>`,
      }).catch((err) => console.error(`Failed to email ${email}:`, err.message));
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

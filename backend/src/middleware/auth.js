import { verifyToken } from "../utils/jwt.js";
import { prisma } from "../utils/prisma.js";

/** Verifies the JWT and attaches the live user record to req.user. */
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Missing or malformed Authorization header" });
    }

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "User not found or deactivated" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Coarse role gate — use for routes with a fixed allow-list (e.g. admin-only). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions for this action" });
    }
    next();
  };
}

/**
 * Finer-grained gate for the three Admin Panel sections a non-master Admin
 * is otherwise view-only in (Week Management, Password Management, Team
 * Roster). The Master Admin always passes; every other Admin needs the
 * matching can_manage_* flag on their own user row, granted by the Master
 * Admin via PATCH /admin/admins/:id/permissions. req.user is the live DB
 * row from authenticate() above, so a permission just granted/revoked
 * takes effect on the very next request — no re-login needed.
 */
export function requireAdminAccess(section) {
  const flag = `can_manage_${section}`;
  return (req, res, next) => {
    if (!req.user.is_master_admin && !req.user[flag]) {
      return res.status(403).json({ error: "Only the Master Admin or an Admin granted access can do this" });
    }
    next();
  };
}

/** Only the Master Admin can grant/revoke other Admins' can_manage_* flags. */
export function requireMasterAdmin(req, res, next) {
  if (!req.user.is_master_admin) {
    return res.status(403).json({ error: "Only the Master Admin can do this" });
  }
  next();
}

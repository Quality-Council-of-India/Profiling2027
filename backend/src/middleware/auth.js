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

import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error("JWT_SECRET is not set — refusing to start with an insecure default.");
}

export function signAuthToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      field: user.field,
      project_id: user.project_id,
    },
    SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

export function signPurposeToken(payload, expiresIn) {
  return jwt.sign(payload, SECRET, { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

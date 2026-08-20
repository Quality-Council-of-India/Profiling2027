import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { signAuthToken, signPurposeToken, verifyToken } from "../utils/jwt.js";
import { sendMail } from "../services/mailer.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    field: user.field,
    photo_url: user.photo_url,
    project_id: user.project_id,
  };
}

export async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    // Constant response shape whether the user exists or not, to avoid
    // leaking which emails are registered.
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    await prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });

    const token = signAuthToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "email and password are required" });
    }
    next(err);
  }
}

/** Shared by self-service "forgot password" and the Admin's "send reset email" action. */
export async function sendPasswordResetEmail(user) {
  const resetToken = signPurposeToken({ sub: user.id, purpose: "password_reset" }, "30m");
  const frontendUrl = process.env.CORS_ORIGIN || "http://localhost:5173";
  const link = `${frontendUrl}/reset-password?token=${resetToken}`;
  await sendMail({
    to: user.email,
    subject: "Reset your Profiling 2027 Feedback Portal password",
    html: `<p>Hi ${user.name},</p><p>Click below to reset your password (expires in 30 minutes):</p><p><a href="${link}">${link}</a></p>`,
  });
}

// Step 1: request a reset link. Always responds 200 so email enumeration
// isn't possible from the response alone.
export async function requestPasswordReset(req, res, next) {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      await sendPasswordResetEmail(user);
    }

    res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "A valid email is required" });
    }
    next(err);
  }
}

// Step 2: complete the reset with the token emailed in step 1.
export async function confirmPasswordReset(req, res, next) {
  try {
    const { token, newPassword } = z
      .object({ token: z.string(), newPassword: z.string().min(8) })
      .parse(req.body);

    const payload = verifyToken(token);
    if (payload.purpose !== "password_reset") {
      return res.status(400).json({ error: "Invalid reset token" });
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: payload.sub },
      data: { password_hash, password_changed_at: new Date() },
    });

    res.json({ message: "Password updated. You can now log in." });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "token and a newPassword (min 8 chars) are required" });
    }
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(400).json({ error: "Reset link is invalid or has expired" });
    }
    next(err);
  }
}

export async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

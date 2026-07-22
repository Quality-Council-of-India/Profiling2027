import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import weeksRoutes from "./routes/weeks.routes.js";
import evaluationsRoutes from "./routes/evaluations.routes.js";
import scoresRoutes from "./routes/scores.routes.js";
import complianceRoutes from "./routes/compliance.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import exportRoutes from "./routes/export.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { prisma } from "./utils/prisma.js";

// Pure Express app definition — no app.listen() here. Used both by
// src/server.js (traditional long-running process: Docker/local dev,
// where node-cron drives reminders) and by /api/index.mjs at the repo
// root (Vercel serverless: the platform invokes this per-request, and
// reminders run via a separate Vercel Cron-triggered function instead).
const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

// Auth endpoints get a tighter limiter to blunt credential-stuffing / brute force.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
app.use("/api/auth", authLimiter);

const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300 });
app.use("/api", apiLimiter);

app.get("/health", (req, res) => res.json({ status: "ok" }));

// Same check, reachable via Vercel too — only /api/* is rewritten to this
// app there, so the bare /health above only works under Docker/local dev.
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// Dependency-free above confirms the app itself booted (catches things like
// a missing JWT_SECRET, which throws at import time). This one additionally
// confirms the database is reachable *and* migrated, without requiring auth.
app.get("/api/health/db", async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ status: "ok", userCount });
  } catch (err) {
    res.status(500).json({ status: "error", code: err.code || err.name, message: err.message });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/weeks", weeksRoutes);
app.use("/api/evaluations", evaluationsRoutes);
app.use("/api/scores", scoresRoutes);
app.use("/api/compliance", complianceRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

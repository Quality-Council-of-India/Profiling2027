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
import { startReminderCron } from "./jobs/reminderCron.js";

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Profiling 2027 Feedback Portal API listening on port ${PORT}`);
  startReminderCron();
});

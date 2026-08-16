import app from "./app.js";
import { startReminderCron } from "./jobs/reminderCron.js";
import { startDigestCron } from "./jobs/eodDigestCron.js";

// Traditional long-running process entrypoint — used for local dev and the
// Docker Compose / PM2 deployment path. Not used on Vercel, where
// /api/index.mjs imports app.js directly and reminders run via a
// Cron-triggered function instead (see /api/cron/reminders.mjs).
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Profiling 2027 Feedback Portal API listening on port ${PORT}`);
  startReminderCron();
  startDigestCron();
});

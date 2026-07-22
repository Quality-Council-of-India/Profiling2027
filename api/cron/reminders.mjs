// Vercel Cron Job target — replaces node-cron for the serverless deployment
// (see vercel.json's "crons" entry). node-cron itself only works inside a
// long-running process, which serverless functions aren't, so on Vercel the
// platform invokes this endpoint on schedule instead.
import { runReminderSweep } from "../../backend/src/jobs/reminderCron.js";

export default async function handler(req, res) {
  // When CRON_SECRET is set, Vercel Cron automatically sends it as a Bearer
  // token — this rejects anyone else who discovers the URL and calls it directly.
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    await runReminderSweep();
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[cron/reminders] sweep failed:", err);
    res.status(500).json({ error: "Reminder sweep failed" });
  }
}

import cron from "node-cron";
import { prisma } from "../utils/prisma.js";
import { sendComplianceReminders } from "../services/compliance.js";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/** §4.4.04 — auto-reminder if completion < 100% on day 2+ of the open window. */
async function runReminderSweep() {
  const openWeeks = await prisma.week.findMany({
    where: { status: "open", project: { is_active: true } },
  });

  for (const week of openWeeks) {
    const dayTwoReached = Date.now() - new Date(week.start_date).getTime() >= TWO_DAYS_MS;
    if (!dayTwoReached) continue;

    try {
      const result = await sendComplianceReminders(week.project_id, week.id, week.label, week.end_date);
      if (result.remindersSent > 0) {
        console.log(
          `[reminderCron] ${week.label}: sent ${result.remindersSent} reminder(s) to ${result.nonCompliantCount} non-compliant user(s)`
        );
      }
    } catch (err) {
      console.error(`[reminderCron] Failed for week ${week.id}:`, err);
    }
  }
}

export function startReminderCron() {
  const schedule = process.env.REMINDER_CRON || "0 10 * * *";
  cron.schedule(schedule, runReminderSweep);
  console.log(`[reminderCron] Scheduled with cron expression "${schedule}"`);
}

export { runReminderSweep };

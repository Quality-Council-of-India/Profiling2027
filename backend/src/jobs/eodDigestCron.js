import cron from "node-cron";
import { prisma } from "../utils/prisma.js";
import { sendEndOfDayDigest } from "../services/compliance.js";

/** Admin/Lead visibility digest — ~19:30 IST (14:00 UTC) daily, for every
 * currently open week, telling each Admin/Project Lead/CASU Lead who in
 * their scope still hasn't submitted. */
async function runDigestSweep() {
  const openWeeks = await prisma.week.findMany({
    where: { status: "open", project: { is_active: true } },
  });

  for (const week of openWeeks) {
    try {
      const result = await sendEndOfDayDigest(week.project_id, week.id, week.label);
      if (result.digestsSent > 0) {
        console.log(`[eodDigestCron] ${week.label}: sent ${result.digestsSent} digest email(s)`);
      }
    } catch (err) {
      console.error(`[eodDigestCron] Failed for week ${week.id}:`, err);
    }
  }
}

export function startDigestCron() {
  const schedule = process.env.EOD_DIGEST_CRON || "0 14 * * *"; // 19:30 IST
  cron.schedule(schedule, runDigestSweep);
  console.log(`[eodDigestCron] Scheduled with cron expression "${schedule}"`);
}

export { runDigestSweep };

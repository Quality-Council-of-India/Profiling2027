// Vercel Cron Job target for the end-of-day Admin/Lead visibility digest —
// see vercel.json's "crons" entry and jobs/eodDigestCron.js for the
// node-cron equivalent used in the long-running (Docker/local) deployment.
import { runDigestSweep } from "../../backend/src/jobs/eodDigestCron.js";

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    await runDigestSweep();
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[cron/digest] sweep failed:", err);
    res.status(500).json({ error: "Digest sweep failed" });
  }
}

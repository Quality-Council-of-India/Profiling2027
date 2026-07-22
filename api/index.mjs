// Vercel serverless entrypoint. Vercel's Node runtime invokes the default
// export directly per-request (req, res) — Express apps are natively
// compatible with that signature, so no adapter library is needed.
// vercel.json rewrites every /api/* request to this single function.
import app from "../backend/src/app.js";

export default app;

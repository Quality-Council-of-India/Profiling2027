import { canViewDataQuality } from "../services/access.js";
import { getDataQualityFlags } from "../services/dataQuality.js";

export async function dataQualityFlags(req, res) {
  if (!canViewDataQuality(req.user)) {
    return res.status(403).json({ error: "You cannot view Data Quality" });
  }
  const weekId = req.query.weekId ? Number(req.query.weekId) : undefined;
  const evalType = req.query.evalType === "self" ? "self" : "peer";
  const filters = {
    name: req.query.name ? String(req.query.name).trim() : undefined,
    role: req.query.role ? String(req.query.role) : undefined,
    field: req.query.field ? String(req.query.field) : undefined,
    signal: req.query.signal ? String(req.query.signal) : undefined,
  };
  const result = await getDataQualityFlags(req.user.project_id, weekId, evalType, filters);
  res.json(result);
}

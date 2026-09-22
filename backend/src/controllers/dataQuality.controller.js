import { getDataQualityFlags } from "../services/dataQuality.js";

export async function dataQualityFlags(req, res) {
  const weekId = req.query.weekId ? Number(req.query.weekId) : undefined;
  const result = await getDataQualityFlags(req.user.project_id, weekId);
  res.json(result);
}

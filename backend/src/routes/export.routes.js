import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import { ROLES } from "../utils/roles.js";
import { exportWeekScores, exportCombinedScores, exportScorecard } from "../controllers/export.controller.js";

const router = Router();

router.get("/scores/combined", authenticate, requireRole(ROLES.ADMIN), exportCombinedScores);
router.get("/scores/:weekId", authenticate, requireRole(ROLES.ADMIN), exportWeekScores);
router.get("/scorecard/:weekId", authenticate, exportScorecard);

export default router;

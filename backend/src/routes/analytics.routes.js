import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { heatmap, sapaDistribution, quadrant } from "../controllers/analytics.controller.js";

const router = Router();

router.get("/heatmap/:weekId", authenticate, heatmap);
router.get("/sapa/:weekId", authenticate, sapaDistribution);
router.get("/quadrant/:weekId", authenticate, quadrant);

export default router;

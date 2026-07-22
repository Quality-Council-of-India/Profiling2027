import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  getUserWeekScore,
  getUserTrend,
  getFieldScores,
} from "../controllers/scores.controller.js";

const router = Router();

router.get("/field/:field/:weekId", authenticate, getFieldScores);
router.get("/:userId/trend", authenticate, getUserTrend);
router.get("/:userId/:weekId", authenticate, getUserWeekScore);

export default router;

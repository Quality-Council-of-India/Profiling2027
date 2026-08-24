import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  getUserWeekScore,
  getUserTrend,
  getUserSelfEvalHistory,
  getTeamScores,
} from "../controllers/scores.controller.js";

const router = Router();

router.get("/team/:weekId", authenticate, getTeamScores);
router.get("/:userId/trend", authenticate, getUserTrend);
router.get("/:userId/self-eval-trend", authenticate, getUserSelfEvalHistory);
router.get("/:userId/:weekId", authenticate, getUserWeekScore);

export default router;

import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { heatmap, sapaDistribution, quadrant, rankings, fieldStandings, fieldMemberRankings, hallOfRecognition, peerTrend } from "../controllers/analytics.controller.js";

const router = Router();

router.get("/heatmap/:weekId", authenticate, heatmap);
router.get("/sapa/:weekId", authenticate, sapaDistribution);
router.get("/quadrant/:weekId", authenticate, quadrant);
router.get("/rankings", authenticate, rankings);
router.get("/field-standings", authenticate, fieldStandings);
router.get("/field-members", authenticate, fieldMemberRankings);
router.get("/hall-of-recognition", authenticate, hallOfRecognition);
router.get("/peer-trend/:userId", authenticate, peerTrend);

export default router;

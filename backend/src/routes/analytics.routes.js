import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  heatmap,
  sapaDistribution,
  quadrant,
  parameterAlignment,
  parameterAlignmentTrend,
  teamTags,
  teamTagTrend,
  teamFocusSuggestions,
  teamTrajectory,
  rankings,
  fieldStandings,
  fieldMemberRankings,
  hallOfRecognition,
  peerTrend,
} from "../controllers/analytics.controller.js";

const router = Router();

// ?weeks=1,2,3 — one week for that week's numbers, several (including
// "Cumulative") for an all-time combined view — see requireAggregateAccess.
router.get("/heatmap", authenticate, heatmap);
router.get("/sapa", authenticate, sapaDistribution);
router.get("/quadrant", authenticate, quadrant);
router.get("/parameter-alignment", authenticate, parameterAlignment);
router.get("/parameter-alignment-trend", authenticate, parameterAlignmentTrend);
router.get("/team-tags", authenticate, teamTags);
router.get("/team-tag-trend", authenticate, teamTagTrend);
router.get("/team-focus-suggestions", authenticate, teamFocusSuggestions);
router.get("/team-trajectory", authenticate, teamTrajectory);
router.get("/rankings", authenticate, rankings);
router.get("/field-standings", authenticate, fieldStandings);
router.get("/field-members", authenticate, fieldMemberRankings);
router.get("/hall-of-recognition", authenticate, hallOfRecognition);
router.get("/peer-trend/:userId", authenticate, peerTrend);

export default router;

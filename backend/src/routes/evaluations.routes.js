import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { submitEvaluation, pendingForCurrentUser } from "../controllers/evaluations.controller.js";

const router = Router();

router.post("/", authenticate, submitEvaluation);
router.get("/pending", authenticate, pendingForCurrentUser);

export default router;

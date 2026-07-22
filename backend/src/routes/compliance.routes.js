import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { getCompliance, remindNonCompliant } from "../controllers/compliance.controller.js";

const router = Router();

router.get("/:weekId", authenticate, getCompliance);
router.post("/:weekId/remind", authenticate, remindNonCompliant);

export default router;

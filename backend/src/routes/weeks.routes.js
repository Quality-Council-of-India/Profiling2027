import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { listWeeks, weekStatus } from "../controllers/weeks.controller.js";

const router = Router();

router.get("/", authenticate, listWeeks);
router.get("/:id/status", authenticate, weekStatus);

export default router;

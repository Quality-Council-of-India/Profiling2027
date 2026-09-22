import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import { ROLES } from "../utils/roles.js";
import { dataQualityFlags } from "../controllers/dataQuality.controller.js";

const router = Router();

// ?weekId=<id> narrows to one week; omitted returns every peer evaluation
// checked so far (Week 1 through whatever's currently open).
router.get("/flags", authenticate, requireRole(ROLES.ADMIN), dataQualityFlags);

export default router;

import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { dataQualityFlags } from "../controllers/dataQuality.controller.js";

const router = Router();

// Every Admin, plus a Project Lead/CASU Lead once granted can_view_data_quality
// (see setDataQualityAccess) — enforced inside dataQualityFlags itself via
// canViewDataQuality, same pattern as Compliance's Trajectory Mismatches.
//
// ?weekId=<id> narrows to one week; omitted returns every evaluation
// checked so far (Week 1 through whatever's currently open).
// ?evalType=peer|self (default peer), ?name=, ?role=, ?field=, ?signal=
// further narrow the results — see getDataQualityFlags.
router.get("/flags", authenticate, dataQualityFlags);

export default router;

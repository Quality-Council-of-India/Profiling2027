import { Router } from "express";
import multer from "multer";
import { authenticate, requireRole } from "../middleware/auth.js";
import { ROLES } from "../utils/roles.js";
import {
  createWeek,
  openWeek,
  closeWeek,
  importRosterHandler,
  listUsers,
  setUserActive,
  listRawTables,
  getRawTable,
  exportRawTable,
  impersonateRole,
  unlockEvaluation,
} from "../controllers/admin.controller.js";

const ROSTER_EXTENSIONS = [".csv", ".xlsx"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB is plenty for a ~70-row roster
  fileFilter: (req, file, cb) => {
    const ok = ROSTER_EXTENSIONS.some((ext) => file.originalname.toLowerCase().endsWith(ext));
    cb(ok ? null : new Error("Only .csv or .xlsx files are accepted"), ok);
  },
});

const router = Router();

router.post("/weeks", authenticate, requireRole(ROLES.ADMIN), createWeek);
router.post("/weeks/:id/open", authenticate, requireRole(ROLES.ADMIN), openWeek);
router.post("/weeks/:id/close", authenticate, requireRole(ROLES.ADMIN), closeWeek);
router.post(
  "/roster/import",
  authenticate,
  requireRole(ROLES.ADMIN),
  upload.single("roster"),
  importRosterHandler
);
router.get("/users", authenticate, requireRole(ROLES.ADMIN), listUsers);
router.patch("/users/:id/active", authenticate, requireRole(ROLES.ADMIN), setUserActive);
router.get("/data", authenticate, requireRole(ROLES.ADMIN), listRawTables);
router.get("/data/:table", authenticate, requireRole(ROLES.ADMIN), getRawTable);
router.get("/data/:table/export", authenticate, requireRole(ROLES.ADMIN), exportRawTable);
router.post("/impersonate/:role", authenticate, requireRole(ROLES.ADMIN), impersonateRole);
router.patch("/evaluations/:id/unlock", authenticate, requireRole(ROLES.ADMIN), unlockEvaluation);

export default router;

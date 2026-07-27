import { Router } from "express";
import multer from "multer";
import { authenticate, requireRole } from "../middleware/auth.js";
import { ROLES } from "../utils/roles.js";
import {
  openWeek,
  closeWeek,
  importRosterHandler,
  listUsers,
  setUserActive,
  listRawTables,
  getRawTable,
} from "../controllers/admin.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB is plenty for a ~70-row CSV
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === "text/csv" || file.originalname.endsWith(".csv");
    cb(ok ? null : new Error("Only .csv files are accepted"), ok);
  },
});

const router = Router();

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

export default router;

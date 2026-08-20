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
  setUserField,
  setUserPassword,
  sendUserPasswordReset,
  sendLoginCredentialsToAll,
  listRawTables,
  getRawTable,
  exportRawTable,
  impersonateUser,
  unlockEvaluation,
  unlockAllForWeek,
  uploadUserPhoto,
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

// Compressed client-side before upload (see PhotoUpload.jsx), so 800KB is
// generous headroom for a ~200x200 JPEG — well under what bloats a
// base64-in-Postgres row for a ~70-person roster.
const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 800 * 1024 },
});

const router = Router();

router.post("/weeks", authenticate, requireRole(ROLES.ADMIN), createWeek);
router.post("/weeks/:id/open", authenticate, requireRole(ROLES.ADMIN), openWeek);
router.post("/weeks/:id/close", authenticate, requireRole(ROLES.ADMIN), closeWeek);
router.post("/weeks/:id/unlock-all", authenticate, requireRole(ROLES.ADMIN), unlockAllForWeek);
router.post(
  "/roster/import",
  authenticate,
  requireRole(ROLES.ADMIN),
  upload.single("roster"),
  importRosterHandler
);
router.get("/users", authenticate, requireRole(ROLES.ADMIN), listUsers);
router.patch("/users/:id/active", authenticate, requireRole(ROLES.ADMIN), setUserActive);
router.patch("/users/:id/field", authenticate, requireRole(ROLES.ADMIN), setUserField);
router.patch("/users/:id/password", authenticate, requireRole(ROLES.ADMIN), setUserPassword);
router.patch(
  "/users/:id/photo",
  authenticate,
  requireRole(ROLES.ADMIN),
  uploadPhoto.single("photo"),
  uploadUserPhoto
);
router.post("/users/:id/send-reset", authenticate, requireRole(ROLES.ADMIN), sendUserPasswordReset);
router.post("/users/send-credentials-all", authenticate, requireRole(ROLES.ADMIN), sendLoginCredentialsToAll);
router.get("/data", authenticate, requireRole(ROLES.ADMIN), listRawTables);
router.get("/data/:table", authenticate, requireRole(ROLES.ADMIN), getRawTable);
router.get("/data/:table/export", authenticate, requireRole(ROLES.ADMIN), exportRawTable);
router.post("/impersonate-user/:id", authenticate, requireRole(ROLES.ADMIN), impersonateUser);
router.patch("/evaluations/:id/unlock", authenticate, requireRole(ROLES.ADMIN), unlockEvaluation);

export default router;

import { Router } from "express";
import multer from "multer";
import { authenticate, requireRole, requireAdminAccess, requireMasterAdmin } from "../middleware/auth.js";
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
  setAdminPermissions,
  sendUserPasswordReset,
  previewLoginCredentialsRecipients,
  sendLoginCredentialsToAll,
  sendBroadcastEmail,
  listEmailBroadcasts,
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

router.post("/weeks", authenticate, requireRole(ROLES.ADMIN), requireAdminAccess("weeks"), createWeek);
router.post("/weeks/:id/open", authenticate, requireRole(ROLES.ADMIN), requireAdminAccess("weeks"), openWeek);
router.post("/weeks/:id/close", authenticate, requireRole(ROLES.ADMIN), requireAdminAccess("weeks"), closeWeek);
router.post("/weeks/:id/unlock-all", authenticate, requireRole(ROLES.ADMIN), requireAdminAccess("weeks"), unlockAllForWeek);
router.post(
  "/roster/import",
  authenticate,
  requireRole(ROLES.ADMIN),
  requireAdminAccess("roster"),
  upload.single("roster"),
  importRosterHandler
);
router.get("/users", authenticate, requireRole(ROLES.ADMIN), listUsers);
router.patch("/users/:id/active", authenticate, requireRole(ROLES.ADMIN), requireAdminAccess("roster"), setUserActive);
router.patch("/users/:id/field", authenticate, requireRole(ROLES.ADMIN), requireAdminAccess("roster"), setUserField);
router.patch("/users/:id/password", authenticate, requireRole(ROLES.ADMIN), requireAdminAccess("passwords"), setUserPassword);
router.patch(
  "/users/:id/photo",
  authenticate,
  requireRole(ROLES.ADMIN),
  requireAdminAccess("roster"),
  uploadPhoto.single("photo"),
  uploadUserPhoto
);
router.patch("/admins/:id/permissions", authenticate, requireRole(ROLES.ADMIN), requireMasterAdmin, setAdminPermissions);
router.post("/users/:id/send-reset", authenticate, requireRole(ROLES.ADMIN), requireAdminAccess("passwords"), sendUserPasswordReset);
router.get("/users/send-credentials-all/preview", authenticate, requireRole(ROLES.ADMIN), requireAdminAccess("passwords"), previewLoginCredentialsRecipients);
router.post("/users/send-credentials-all", authenticate, requireRole(ROLES.ADMIN), requireAdminAccess("passwords"), sendLoginCredentialsToAll);
router.post("/broadcast-email", authenticate, requireRole(ROLES.ADMIN), sendBroadcastEmail);
router.get("/broadcast-email", authenticate, requireRole(ROLES.ADMIN), listEmailBroadcasts);
router.get("/data", authenticate, requireRole(ROLES.ADMIN), listRawTables);
router.get("/data/:table", authenticate, requireRole(ROLES.ADMIN), getRawTable);
router.get("/data/:table/export", authenticate, requireRole(ROLES.ADMIN), exportRawTable);
router.post("/impersonate-user/:id", authenticate, requireRole(ROLES.ADMIN), impersonateUser);
router.patch("/evaluations/:id/unlock", authenticate, requireRole(ROLES.ADMIN), unlockEvaluation);

export default router;

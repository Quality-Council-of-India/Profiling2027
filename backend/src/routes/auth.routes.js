import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";

const router = Router();

router.post("/login", authController.login);
router.post("/reset-password", authController.requestPasswordReset);
router.post("/reset-password/confirm", authController.confirmPasswordReset);

export default router;

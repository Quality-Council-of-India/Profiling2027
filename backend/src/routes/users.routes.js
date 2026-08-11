import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { me } from "../controllers/auth.controller.js";
import { myPeers } from "../controllers/users.controller.js";

const router = Router();

router.get("/me", authenticate, me);
router.get("/me/peers", authenticate, myPeers);

export default router;

import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import { ROLES } from "../utils/roles.js";
import { create, listMine, listAll, respond } from "../controllers/tickets.controller.js";

const router = Router();

router.post("/", authenticate, create);
router.get("/mine", authenticate, listMine);
router.get("/", authenticate, requireRole(ROLES.ADMIN), listAll);
router.patch("/:id", authenticate, requireRole(ROLES.ADMIN), respond);

export default router;

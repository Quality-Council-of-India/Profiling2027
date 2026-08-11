import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { list, unreadCount, markRead, markAllRead } from "../controllers/notifications.controller.js";

const router = Router();

router.get("/", authenticate, list);
router.get("/unread-count", authenticate, unreadCount);
router.patch("/:id/read", authenticate, markRead);
router.patch("/read-all", authenticate, markAllRead);

export default router;

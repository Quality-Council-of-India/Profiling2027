import { prisma } from "../utils/prisma.js";

/** Most recent notifications for the requester — the bell dropdown's feed. */
export async function list(req, res, next) {
  try {
    const notifications = await prisma.notification.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: "desc" },
      take: 30,
    });
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
}

/** Unread count only — cheap enough to poll for the badge without pulling the full feed. */
export async function unreadCount(req, res, next) {
  try {
    const count = await prisma.notification.count({ where: { user_id: req.user.id, is_read: false } });
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const id = Number(req.params.id);
    await prisma.notification.updateMany({
      where: { id, user_id: req.user.id },
      data: { is_read: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req, res, next) {
  try {
    await prisma.notification.updateMany({
      where: { user_id: req.user.id, is_read: false },
      data: { is_read: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

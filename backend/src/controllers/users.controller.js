import { prisma } from "../utils/prisma.js";

/** Both directions of a user's peer mapping — feeds the "About Profile" modal's peer list. */
export async function myPeers(req, res, next) {
  try {
    const [asEvaluator, asEvaluatee] = await Promise.all([
      prisma.peerMapping.findMany({
        where: { evaluator_id: req.user.id },
        include: { evaluatee: { select: { id: true, name: true, role: true, field: true } } },
      }),
      prisma.peerMapping.findMany({
        where: { evaluatee_id: req.user.id },
        include: { evaluator: { select: { id: true, name: true, role: true, field: true } } },
      }),
    ]);
    res.json({
      peersIEvaluate: asEvaluator.map((m) => m.evaluatee),
      peersWhoEvaluateMe: asEvaluatee.map((m) => m.evaluator),
    });
  } catch (err) {
    next(err);
  }
}

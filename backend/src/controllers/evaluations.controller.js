import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { getPendingForUserWeek } from "../services/evaluations.js";
import { computeScoresForUserWeek } from "../services/scoreEngine.js";

const submitSchema = z.object({
  week_id: z.number().int(),
  evaluatee_id: z.number().int(),
  eval_type: z.enum(["self", "peer"]),
  sincerity: z.number().int().min(1).max(5),
  team_spirit: z.number().int().min(1).max(5),
  knowledge: z.number().int().min(1).max(5),
  quantity: z.number().int().min(1).max(5),
  quality: z.number().int().min(1).max(5),
  problem_solving: z.enum(["satisfied", "not_satisfied"]),
  problem_reason: z.string().optional().nullable(),
  strengths_tags: z.array(z.string()).default([]),
  weakness_tags: z.array(z.string()).default([]),
  strength_comment: z.string().optional().nullable(),
  weakness_comment: z.string().optional().nullable(),
});

export async function submitEvaluation(req, res, next) {
  try {
    const body = submitSchema.parse(req.body);

    const week = await prisma.week.findFirst({
      where: { id: body.week_id, project_id: req.user.project_id },
    });
    if (!week) return res.status(404).json({ error: "Week not found" });
    if (week.status !== "open") {
      return res.status(400).json({ error: `Week ${week.label} is not open for submissions` });
    }

    // Self-evaluations are always about the submitter — the evaluatee is
    // forced server-side regardless of what the client sends.
    const evaluateeId = body.eval_type === "self" ? req.user.id : body.evaluatee_id;

    if (body.eval_type === "peer") {
      if (evaluateeId === req.user.id) {
        return res.status(400).json({ error: "Cannot submit a peer evaluation for yourself" });
      }
      const mapping = await prisma.peerMapping.findFirst({
        where: { evaluator_id: req.user.id, evaluatee_id: evaluateeId },
      });
      if (!mapping) {
        return res.status(403).json({ error: "This person is not in your peer-evaluation mapping" });
      }
    }

    const uniqueWhere = {
      week_id_evaluator_id_evaluatee_id_eval_type: {
        week_id: body.week_id,
        evaluator_id: req.user.id,
        evaluatee_id: evaluateeId,
        eval_type: body.eval_type,
      },
    };

    // Every submission locks itself immediately — a second attempt is
    // rejected unless an Admin has explicitly unlocked this exact row for
    // a correction (locked=false), in which case this write re-locks it.
    const existing = await prisma.evaluation.findUnique({ where: uniqueWhere });
    if (existing?.locked) {
      return res.status(403).json({
        error: "This evaluation has already been submitted and is locked. Ask an Admin to unlock it if you need to make a correction.",
      });
    }

    const evaluation = await prisma.evaluation.upsert({
      where: uniqueWhere,
      create: {
        week_id: body.week_id,
        evaluator_id: req.user.id,
        evaluatee_id: evaluateeId,
        eval_type: body.eval_type,
        sincerity: body.sincerity,
        team_spirit: body.team_spirit,
        knowledge: body.knowledge,
        quantity: body.quantity,
        quality: body.quality,
        problem_solving: body.problem_solving,
        problem_reason: body.problem_reason || null,
        strengths_tags: body.strengths_tags,
        weakness_tags: body.weakness_tags,
        strength_comment: body.strength_comment || null,
        weakness_comment: body.weakness_comment || null,
        locked: true,
      },
      update: {
        sincerity: body.sincerity,
        team_spirit: body.team_spirit,
        knowledge: body.knowledge,
        quantity: body.quantity,
        quality: body.quality,
        problem_solving: body.problem_solving,
        problem_reason: body.problem_reason || null,
        strengths_tags: body.strengths_tags,
        weakness_tags: body.weakness_tags,
        strength_comment: body.strength_comment || null,
        weakness_comment: body.weakness_comment || null,
        submitted_at: new Date(),
        locked: true,
      },
    });

    // Recompute the evaluatee's scores in real time (§4.2.1 Step 4).
    const computed = await computeScoresForUserWeek(body.week_id, evaluateeId);

    res.status(201).json({ evaluation, computed });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid evaluation payload", details: err.issues });
    }
    next(err);
  }
}

export async function pendingForCurrentUser(req, res) {
  if (req.user.role === "admin") {
    // Admin (QCI Core Team) monitors the process but doesn't submit
    // self/peer evaluations — excluded from peer_mappings and scoring.
    return res.status(404).json({ error: "Admins do not submit evaluations" });
  }
  const openWeek = await prisma.week.findFirst({
    where: { project_id: req.user.project_id, status: "open" },
  });
  if (!openWeek) {
    return res.status(404).json({ error: "No week is currently open for submissions" });
  }
  const pending = await getPendingForUserWeek(req.user.id, openWeek.id);
  res.json({ week: openWeek, pending });
}

import { z } from "zod";
import { ROLES } from "../utils/roles.js";
import {
  TICKET_CATEGORIES,
  createTicket,
  listMyTickets,
  listAllTickets,
  respondToTicket,
} from "../services/tickets.js";

const createSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
});

const respondSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved"]).optional(),
  admin_response: z.string().max(5000).optional(),
});

export async function create(req, res, next) {
  try {
    if (req.user.role === ROLES.ADMIN) {
      return res.status(400).json({ error: "Admin doesn't file concerns — use the Grievances tab to respond to them" });
    }
    const body = createSchema.parse(req.body);
    const ticket = await createTicket(req.user.project_id, req.user, body);
    res.status(201).json({ ticket });
  } catch (err) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Provide a valid category, subject, and description" });
    next(err);
  }
}

export async function listMine(req, res, next) {
  try {
    const tickets = await listMyTickets(req.user.id);
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
}

export async function listAll(req, res, next) {
  try {
    const status = ["open", "in_progress", "resolved"].includes(req.query.status) ? req.query.status : undefined;
    const tickets = await listAllTickets(req.user.project_id, status);
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
}

export async function respond(req, res, next) {
  try {
    const ticketId = Number(req.params.id);
    const body = respondSchema.parse(req.body);
    const updated = await respondToTicket(req.user.project_id, ticketId, body);
    if (!updated) return res.status(404).json({ error: "Ticket not found" });
    res.json({ ticket: updated });
  } catch (err) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid status or response" });
    next(err);
  }
}

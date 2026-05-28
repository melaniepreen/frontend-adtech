/* routes/briefing.js — POST /api/v1/agents/send-briefing
   Runs the briefing through an Overmind span: (1) Claude polishes the copy,
   (2) the mailer delivers it. The full trace is returned so the dashboard
   terminal can replay exactly what Overmind did. */
import { Router } from "express";
import { startSpan } from "../lib/overmind.js";
import { draftBriefing, claudeEnabled } from "../lib/anthropic.js";
import { sendMail } from "../lib/mailer.js";

export const briefing = Router();

briefing.post("/send-briefing", async (req, res) => {
  const {
    to = [], subject = "Ad Intelligence Briefing", body = "",
    findings = [], next_steps = [],
  } = req.body || {};

  if (!Array.isArray(to) || to.length === 0) {
    return res.status(400).json({ sent: false, error: "no recipients" });
  }

  const span = startSpan("briefing.send", { recipients: to.length });
  try {
    // 1) optional Claude polish — inside the same span
    let finalBody = body;
    if (claudeEnabled) {
      span.event("Claude is drafting the briefing copy…", "work");
      const drafted = await draftBriefing({ subject, findings, nextSteps: next_steps });
      if (drafted) { finalBody = drafted; span.event("Claude refined the wording.", "ok"); }
    } else {
      span.event("Using the dashboard-generated copy (no model key set).", "info");
    }

    // 2) deliver
    span.event(`Delivering to ${to.length} recipients…`, "work");
    const out = await sendMail({ to, subject, body: finalBody });
    span.event(
      out.simulated ? "Mail service not configured — send simulated." : `Delivered (${out.messageId}).`,
      out.simulated ? "warn" : "ok"
    );

    const { events, score } = span.end(0.96);
    res.json({
      sent: true, simulated: out.simulated, message_id: out.messageId,
      recipients: to.length, score, trace: events,
    });
  } catch (err) {
    const t = span.fail(err);
    res.status(500).json({ sent: false, error: err.message, trace: t.events });
  }
});

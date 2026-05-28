/* index.js — SIGNAL backend entry
   Express app exposing the Overmind-traced agent endpoints + a live SSE
   trace stream the dashboard terminal can subscribe to. */
import express from "express";
import cors from "cors";
import "dotenv/config";
import { briefing } from "./routes/briefing.js";
import { traceBus } from "./lib/overmind.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// agent endpoints
app.use("/api/v1/agents", briefing);

// live Overmind trace stream (Server-Sent Events) — subscribe from the frontend
// to mirror real async events into the terminal.
app.get("/api/v1/agents/trace-stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ msg: "Connected to Overmind trace stream.", tone: "ok" })}\n\n`);
  const onTrace = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  traceBus.on("trace", onTrace);
  req.on("close", () => traceBus.off("trace", onTrace));
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`SIGNAL backend listening on :${port}`));

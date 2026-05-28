/* lib/overmind.js — Overmind trace wrapper
   Every agent action runs inside a "span" that emits plain-English trace
   events. Events are (a) collected and returned to the caller and (b) pushed
   onto traceBus so the SSE stream (and the dashboard terminal) sees them live.

   To use the real SDK: `npm i @overmind/sdk`, then replace the lines marked
   "← real SDK" with actual span calls. The local tracer below is a drop-in
   fallback so the server runs with zero extra config. */
import { EventEmitter } from "node:events";

export const traceBus = new EventEmitter();
traceBus.setMaxListeners(0);

// import { init, trace } from "@overmind/sdk";                 // ← real SDK
// init({ apiKey: process.env.OVERMIND_API_KEY, project: process.env.OVERMIND_PROJECT });

export function startSpan(name, meta = {}) {
  const events = [];
  const t0 = Date.now();
  // const span = trace.startSpan(name, { attributes: meta });  // ← real SDK

  function emit(msg, tone = "info") {
    events.push({ msg, tone });
    traceBus.emit("trace", { span: name, msg, tone, ts: Date.now() });
    // span?.log({ level: tone, message: msg });                // ← real SDK
  }

  emit(`Overmind opened span “${name}”.`, "work");

  return {
    event: emit,
    end(score = 1) {
      emit(`Span “${name}” closed · score ${score.toFixed(2)}.`, "info");
      // span?.end({ score, durationMs: Date.now() - t0 });     // ← real SDK
      return { events, score, durationMs: Date.now() - t0 };
    },
    fail(err) {
      emit(`Span “${name}” failed — ${err.message}`, "err");
      // span?.end({ score: 0, error: err.message });           // ← real SDK
      return { events, score: 0, error: err.message };
    },
  };
}

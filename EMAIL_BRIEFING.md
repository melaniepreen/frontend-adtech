# Send Briefing — Feature & Backend Wiring

A **Send Briefing** button in the top nav opens a composer that auto-summarises
the live dashboard into an email for the **sales / ad-strategy team**, with
recommended next steps. Today the send is **mocked** (it logs to the Overmind
terminal). This doc explains the feature and how to make it actually send.

## What it does

- **Auto-summary** — `buildBriefing()` in `src/EmailBriefing.jsx` reads
  `window.ADTEC` and produces:
  - **Key findings** — top trend movers, the most-asked AI question, the funnel
    risk, and the before/after performance wins (CPL / leads / ROAS, LTV:CAC).
  - **How we proceed** — recommended budget plan, creative push on the hottest
    term, a fix for the funnel leak, and what to trim.
  - A **subject line** derived from the top mover + CPL change.
- **Editable** — recipients (add/remove chips), subject, and an optional note.
- **Actions** — `COPY TEXT` (plain-text version to clipboard), `SEND BRIEFING`
  (mock send → terminal trace + "Sent ✓" state).

The plain-text payload is produced by `toPlainText(briefing, recipients)` — this
is exactly what you'd POST to a backend.

## Files

```
src/EmailBriefing.jsx   the composer component (window.EmailBriefing)
src/AppDesktop.jsx      nav button + open/close state
adtec.html              loads EmailBriefing.jsx before AppDesktop.jsx
```

## Does it go through Overmind? — yes

The send is processed by an **Overmind-traced backend pipeline**, not a blind
mail POST. The flow:

```
Frontend (EmailBriefing.jsx)
   └─ POST /api/v1/agents/send-briefing
        └─ Overmind span “briefing.send”
             ├─ Claude polishes the copy        (optional)
             ├─ Mailer delivers it
             └─ span closes · score 0.96
        ◀─ returns the full trace
   └─ replays the trace into the terminal
```

The backend lives in **`server/`** (Express, ESM). See `server/README.md` for
run instructions and the endpoint contract. Key points:

- `server/routes/briefing.js` opens the Overmind span and runs the two steps.
- `server/lib/overmind.js` is the span tracer (swap in the real `@overmind/sdk`
  where marked). Every event is also streamed over SSE at
  `GET /api/v1/agents/trace-stream`.
- `server/lib/anthropic.js` is the optional Claude polish; `server/lib/mailer.js`
  is provider-agnostic SMTP.
- With no env keys it still runs: Claude is skipped and sends are simulated.

## Frontend wiring (already done)

`send()` in `src/EmailBriefing.jsx` POSTs to the backend and **replays the
returned `trace`** into the Overmind terminal. If `window.__ADTEC_API_BASE`
isn't set, or the backend is unreachable, it falls back to a local simulation so
the prototype never breaks. To point at the live server, add before the module
scripts in `adtec.html`:

```html
<script>
  window.__ADTEC_API_BASE = "http://localhost:8787";
  window.__ADTEC_CLIENT_ID = "gymshark";
</script>
```

## Notes

- Keep the composer's **review step** — auto-generated copy should always be
  editable before it goes to a human team.
- Recipients default to placeholder team addresses; swap them for the real
  distribution list (or fetch from a `team`/`recipients` endpoint).
- Scheduling (e.g. "every Monday 9am") would live on the backend as a cron that
  reuses the same `send-briefing` handler with server-generated findings.

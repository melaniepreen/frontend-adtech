# SIGNAL — Backend

Overmind-traced API for the SIGNAL dashboard. Today it serves the
**Send Briefing** flow; the structure (span tracing + SSE) is built to host the
rest of the agent endpoints.

## Run

```bash
cd server
cp .env.example .env      # all keys optional — works with none set
npm install
npm run dev               # node --watch index.js  →  http://localhost:8787
```

Point the frontend at it (in `adtec.html`, before the module scripts):

```html
<script>
  window.__ADTEC_API_BASE = "http://localhost:8787";
  window.__ADTEC_CLIENT_ID = "gymshark";
</script>
```

With no `.env` keys the server still runs: Claude polish is skipped and emails
are **simulated** (nothing is actually sent) — ideal for local dev. The frontend
also falls back to a local simulation if the backend is unreachable, so the
prototype never breaks.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/health` | liveness probe |
| `POST` | `/api/v1/agents/send-briefing` | run a briefing through Overmind → Claude → mail |
| `GET`  | `/api/v1/agents/trace-stream` | SSE stream of live Overmind trace events |

### `POST /api/v1/agents/send-briefing`

```jsonc
// request
{
  "client_id": "gymshark",
  "to": ["ad-strategy@gymshark.com", "sales@gymshark.com"],
  "subject": "Weekly Ad Intelligence Briefing — …",
  "body": "<dashboard-generated plain text>",
  "findings": ["…"],
  "next_steps": ["…"]
}
// response
{
  "sent": true,
  "simulated": false,
  "message_id": "…",
  "recipients": 2,
  "score": 0.96,
  "trace": [ { "msg": "Overmind opened span “briefing.send”.", "tone": "work" }, … ]
}
```

The `trace` array is replayed into the dashboard terminal so the user sees
exactly what the agent did.

## How the Overmind span works

`lib/overmind.js` wraps each action in a span that emits plain-English events.
A local tracer is used by default; to switch to the real SDK, `npm i
@overmind/sdk` and uncomment the lines marked `← real SDK`. Every event is also
pushed to `traceBus`, which feeds the SSE stream.

```
briefing.send
 ├─ Claude is drafting the briefing copy…        (work)
 ├─ Claude refined the wording.                   (ok)
 ├─ Delivering to N recipients…                   (work)
 ├─ Delivered (message-id).                        (ok)
 └─ Span closed · score 0.96.                      (info)
```

## Layout

```
server/
  index.js            express app + SSE trace stream
  routes/briefing.js  POST /send-briefing (the Overmind pipeline)
  lib/overmind.js     span tracer + traceBus (swap in real SDK here)
  lib/anthropic.js    optional Claude copy polish
  lib/mailer.js       SMTP send (simulated if unconfigured)
  .env.example        all config (every key optional)
```

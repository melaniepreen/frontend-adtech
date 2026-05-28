# adtec — Backend Integration Guide

How to wire the live REST API into the prototype. Today every screen reads from
a static mock object (`window.ADTEC`) built in **`src/data.js`**. Integration =
replacing those static fields with `fetch` calls that return the same shapes.

- **Base URL:** set once (see [Config](#1-config--api-client)).
- **`client_id`:** every demo endpoint is scoped by client — pass it on every call.
- **Strategy:** keep the `window.ADTEC` shape as the app's internal contract. Map
  each API response into that shape in one place (`src/api.js`) so components
  don't change.

---

## 1. Config + API client

Create **`src/api.js`** (plain JS, load it before `data.js` in `adtec.html`):

```js
window.ADTEC_API = (function () {
  const BASE = window.__ADTEC_API_BASE || "https://api.adtec.app";
  const CLIENT_ID = window.__ADTEC_CLIENT_ID || "gymshark";

  async function call(path, { method = "GET", body, query } = {}) {
    const url = new URL(BASE + path);
    url.searchParams.set("client_id", CLIENT_ID);
    if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", /* Authorization: `Bearer ${token}` */ },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
    return res.json();
  }

  return { call, CLIENT_ID, BASE };
})();
```

Set the base + client at runtime (e.g. injected by Vite env or a `<script>` in
`adtec.html` before the modules load):

```html
<script>
  window.__ADTEC_API_BASE = "https://api.adtec.app";
  window.__ADTEC_CLIENT_ID = "gymshark";
</script>
```

---

## 2. Endpoint → screen map

| # | Endpoint | Feeds (component) | Replaces in `data.js` |
|---|----------|-------------------|------------------------|
| **Dashboard** | `GET /api/v1/demo/dashboard/overview` | nav header / KPI strip | top-level summary (token balance, goals) |
| | `GET /api/v1/demo/dashboard/briefs` | *(new card list — not yet built)* | — |
| | `GET /api/v1/demo/dashboard/allocations` | Page 3 allocation history | `scenarios[*].matrix` history |
| **Intelligence** | `GET /api/v1/intelligence/tavily-results` | **Page 1** trend feed | `trends[]` |
| | `GET /api/v1/demo/intelligence/topic-clusters` | **Page 1** (gap/owned/contested zones) | *(new — see §5)* |
| | `GET /api/v1/demo/intelligence/keywords` | **Page 1** detail panel | `trends[*].detail` keywords |
| | `POST /api/v1/intelligence/trigger-scan` | **Page 1** "scan" action → terminal | fires `traceScripts.intel` |
| | `POST /api/v1/intelligence/complete-pipeline` | terminal RUN (research→keywords→campaign) | full trace sequence |
| **Planning** | `GET /api/v1/demo/planning/cpl-matrix` | **Page 3** scenario tabs | `scenarios` (cons/opt/aggr) |
| | `POST /api/v1/demo/planning/scenario-builder` | **Page 3** sliders / channel toggles | recompute `matrix` |
| **Agents** | `POST /api/v1/demo/agents/chat` | **Page 2** "Generate Strategy" panel | strategy text body |
| | `GET /api/v1/demo/agents/efficiency-metrics` | **Page 4** before/after | `beforeAfter[]` |
| | `GET /api/v1/agents/status` | nav LIVE pill / source ribbon | `sources[*].status` |
| | `POST /api/v1/agents/optimize-daily` | terminal action | trace sequence |
| **Creatives** | `POST /api/v1/demo/creatives/bulk-upload` | *(new upload view — not yet built)* | — |
| | `GET /api/v1/demo/creatives` | *(new — placement status list)* | — |
| **Campaigns** | `GET /api/v1/demo/campaigns/performance` | **Page 4** KPI cards / adstock | `advKpis[]`, `adstock[]` |
| | `GET /api/v1/demo/campaigns/business-kpis` | **Page 4** LTV:CAC, retention, cart | `advKpis[]` |
| | `GET /api/v1/analytics/performance/{position_id}` | **Page 4** per-position drill-in | `adstock[*].curve` |
| **Tokens** | `GET /api/v1/tokens/balance/{user_id}` | nav header token balance | *(new — see §5)* |
| | `POST /api/v1/tokens/calculate-reward` | reward/penalty readout | — |
| **Trading** | `POST /api/v1/trading/decide` | terminal background traces | `traceScripts` lines |
| | `POST /api/v1/thrad/auction` | **Page 1** Audience AI Queries (bid/ctx) | `aiQueries[*].adRank/ctxScore` |

---

## 3. Field mapping per page

The app's components read specific field names. Map each API response into these.

### Page 1 — Market Intelligence (`src/Page1.jsx`)
`trends[]` from `tavily-results`:
```
{ id, kw, growth, vol, intensity:"hot|warm|cool", src:["T","TT","M"…],
  spark:[7 numbers],
  detail:{ vol12:[12 nums], relevance:0-99, bidders:["meta"…],
           attribution:[{ src, w:0-1 }] } }
```
`sources[]` (status ribbon) from `agents/status`:
```
{ id, label, status:"active|degraded|inactive", sync, type, endpoint, note }
```
`aiQueries[]` enriched by `thrad/auction`:
```
{ q, intent:"DISCOVERY|COMPARISON|PURCHASE|LOYALTY", vol, trend:"up|flat|down",
  adRank, ctxScore }
```

### Page 2 — Strategy Generator (`src/Page2.jsx`)
`quarters[]`, `funnelStages[]`, `kpiRows[]` from dashboard overview + business-kpis.
"Generate Strategy" → `POST agents/chat` with `{ message }`; render the returned
text in the slideover. Stream the agent's steps into the terminal (see §4).

### Page 3 — Budget Scenario Planner (`src/Page3.jsx`)
`scenarios.{conservative|optimistic|aggressive}.matrix[]` from `cpl-matrix`:
```
{ channel, awareness:0-100, loyalty:0-100, leads, cpl, spend }
```
Slider / channel changes → `POST scenario-builder` and swap the active matrix.

### Page 4 — Campaign Performance (`src/Page4.jsx`)
`advKpis[]` from `campaigns/business-kpis`; `adstock[]` from
`campaigns/performance`; `beforeAfter[]` from `agents/efficiency-metrics`.

---

## 4. Wiring the Overmind terminal to real agent events

The terminal (`src/Terminal.jsx`) already listens for a window event. Any code
can push plain-English lines:

```js
window.adtecLog([
  { msg: "Scanning the web for fresh Gymshark market signals…", tone: "work" },
  { msg: "Found 14 trending topics across 6 sources.",          tone: "ok" },
]);
// tone: work | ok | info | warn | err
```

So for a live action, translate API lifecycle → sentences:

```js
async function runScan(topic) {
  window.adtecLog([{ msg: `Scanning the web for "${topic}"…`, tone: "work" }]);
  try {
    const r = await ADTEC_API.call("/api/v1/intelligence/trigger-scan", { method: "POST", body: { topic } });
    window.adtecLog([{ msg: `Found ${r.results.length} new signals.`, tone: "ok" }]);
  } catch (e) {
    window.adtecLog([{ msg: "Scan failed — the source may be rate-limited.", tone: "err" }]);
  }
}
```

If the backend exposes Server-Sent Events / WebSocket agent traces, subscribe
once and forward each event through `window.adtecLog(...)`.

---

## 5. Converting `data.js` from static to live

Today `data.js` builds `window.ADTEC` synchronously. To go live, make it a
loader and let `AppDesktop` await it before mounting. Minimal pattern:

```js
// data.js
window.ADTEC = { /* keep static fallbacks so the UI still renders offline */ };

window.ADTEC.load = async () => {
  const [trends, sources, scenarios] = await Promise.all([
    ADTEC_API.call("/api/v1/intelligence/tavily-results"),
    ADTEC_API.call("/api/v1/agents/status"),
    ADTEC_API.call("/api/v1/demo/planning/cpl-matrix", { query: { target_leads: 14000 } }),
  ]);
  Object.assign(window.ADTEC, {
    trends: trends.map(mapTrend),       // → shape in §3
    sources: sources.map(mapSource),
    scenarios: mapScenarios(scenarios),
  });
};
```

```jsx
// adtec.html mount block
const mount = async () => {
  if (!window.AppDesktop) return setTimeout(mount, 30);
  try { await window.ADTEC.load?.(); } catch (e) { console.warn("live load failed, using mock", e); }
  ReactDOM.createRoot(document.getElementById("root")).render(<AppDesktop/>);
};
mount();
```

Keep the static objects as fallbacks — the dashboard then degrades gracefully to
mock data if the API is unreachable.

### Not-yet-built screens (need new components when you wire these)
- **Content briefs** (`dashboard/briefs`) — card grid.
- **Topic clusters** with gap/owned/contested zones (`topic-clusters`).
- **Creative upload + placement status** (`creatives/*`).
- **Token balance + rewards** (`tokens/*`) — small header widget + detail.

---

## 6. Checklist

- [ ] `src/api.js` added and loaded before `data.js`
- [ ] `__ADTEC_API_BASE` + `__ADTEC_CLIENT_ID` set for the environment
- [ ] Auth header wired in `call()` if endpoints are protected
- [ ] Each `map*()` returns the exact shapes in §3
- [ ] Mock objects kept as offline fallbacks
- [ ] Agent actions forward lifecycle events through `window.adtecLog(...)`
- [ ] CORS allows the dashboard origin (or serve same-origin)

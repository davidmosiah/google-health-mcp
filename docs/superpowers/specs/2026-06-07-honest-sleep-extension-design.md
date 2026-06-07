# Honest-Sleep Extension — Design Spec

**Date:** 2026-06-07
**Repo:** `aaymeloglu/google-health-mcp` (fork of `davidmosiah/google-health-mcp`)
**Status:** Approved design, pending implementation plan

## Problem

Andy's Fitbit data merged into Google Health. The new sleep algorithm overestimates
sleep — it counts quiet wakefulness as sleep, inflating "time asleep" and efficiency.
He wants an MCP server that (a) pulls his ongoing health data from the **live Google
Health API v4**, and (b) recomputes an **honest** sleep number from the raw stage
timeline instead of trusting Google's inflated summary. Charts come later.

## Approach: fork & extend, don't rebuild

We fork `davidmosiah/google-health-mcp` (MIT, TypeScript/Node, Google Health API v4
native, v0.1.3 May 2026) rather than build from scratch. The fork already solves the
expensive, risky parts we don't want to reimplement against a churning beta API:

- **Google OAuth 2.0 + restricted-scope flow** with scope presets (`basic`/`activity`/
  `sleep`/`full`), local token storage (`~/.google-health-mcp/tokens.json`, 0600),
  setup/auth CLI (`src/cli/{setup,auth}.ts`, `src/services/token-store.ts`).
- **v4 API client** (`src/services/google-health-client.ts`) with retry, caching,
  redaction, privacy audit.
- **Tool registration + MCP plumbing** (`src/tools/google-health-tools.ts`,
  `@modelcontextprotocol/sdk`), plus a fixture-based test harness (`scripts/*-test.mjs`).

We keep `upstream` as a git remote (already configured) so we can pull future fixes.

### What the fork does NOT do (our value-add)

- It exposes data **as-is**: `daily_summary`, `rollup`, etc. — i.e. Google's inflated
  sleep number. No recompute, no custom metrics.
- No first-class "raw sleep stage timeline" tool (the data is *reachable* via the
  generic `list_data_points` for `dataType: "sleep"`, but not surfaced cleanly).
- No chart output.

## Architecture

Three additions, each a focused unit, layered over the inherited client:

```
GoogleHealthClient.listDataPoints({dataType:"sleep"})   [inherited — raw v4 segments]
        │
        ▼
src/services/sleep-normalize.ts   → normalized stage timeline: {start, end, stage}[]
        │                            (one adapter per source: v4 live, synthetic, Takeout)
        ▼
src/services/sleep-engine.ts      → pure recompute: Google's number vs honest number
        │                            + delta + efficiency, configurable params
        ▼
src/tools/sleep-tools.ts          → new MCP tools (registered alongside existing)
```

### Unit 1 — `src/services/sleep-normalize.ts`

Converts a raw source into the engine's input contract:

```ts
type SleepStage = "awake" | "light" | "deep" | "rem";
interface StageSegment { start: string; end: string; stage: SleepStage; }  // ISO8601
interface SleepNight {
  date: string;                    // night-of date
  segments: StageSegment[];        // ordered, 30s-grained
  source: "google_v4" | "synthetic" | "takeout";
  stagesAvailable: boolean;        // false for nap/classic logs → engine falls back
  googleReported?: { minutesAsleep: number; minutesAwake: number; efficiency: number };
}
```

Adapters:
- **`fromV4DataPoints(raw)`** — primary. Parses the `sleep` Session data points from
  `listDataPoints`. Confirm the exact v4 segment field names against a captured live
  sample during implementation (the data-types page lists `sleep` as a Session record
  with AWAKE/DEEP/REM/LIGHT stages; field-level shape verified from a real response).
- **`fromSynthetic(spec)`** — for unit tests / edge cases.
- **`fromTakeout(dir)`** — best-effort, secondary. The one-time Takeout dump
  (`health-data/data/Takeout/Google Health/`) is the new **CSV** format. Its per-night
  segment availability is **unverified** as of this spec (the `Sleep/` folder holds a
  weekly Sleep Profile; `Sleep Score/sleep_score.csv` holds nightly summary scores with
  `deep_sleep_in_minutes`). If the dump lacks the full segment timeline, Takeout is used
  only to cross-check Google's reported nightly minutes, not as an engine input. **Open
  item — verify before relying on it.**

### Unit 2 — `src/services/sleep-engine.ts`

Pure function: `computeHonestSleep(night: SleepNight, config: SleepConfig): SleepResult`.
No I/O — fully unit-testable. Mirrors the existing `src/services/summary.ts` service style.

Steps:
1. **Reproduce Google's number** from segments: `minutesAsleep = Σ(deep+light+rem)`,
   `timeInBed = span(first.start, last.end)`, `efficiency = asleep/inBed`. Assert it
   matches `googleReported` (sanity that we parse segments correctly).
2. **Honest recompute** with configurable params (defaults in code, overridable per call):
   - `wasoThresholdMin` — minimum contiguous AWAKE run counted as wake.
   - `reclassifyIsolatedLight` — a LIGHT run bracketed by AWAKE on both sides within
     `isolatedLightWindowMin` is reclassified to wake.
   - `trimOnsetLatency` / `trimFinalAwakening` — drop leading/trailing wake+light padding.
3. **Output**:

```ts
interface SleepResult {
  date: string;
  google:  { minutesAsleep: number; efficiency: number };
  honest:  { minutesAsleep: number; efficiency: number; minutesAwakeInBed: number };
  deltaMinutes: number;            // google.minutesAsleep − honest.minutesAsleep (the inflation)
  stagesAvailable: boolean;        // false → honest == google (no recompute possible)
  config: SleepConfig;             // echo what was applied
}
```

Degraded cases handled, not crashed: `stagesAvailable=false` → return Google's number
with `deltaMinutes=0` and a flag; no segments → empty result.

### Unit 3 — `src/tools/sleep-tools.ts`

New MCP tools, registered via `server.registerTool(...)` exactly like the existing tools,
imported from `src/index.ts` alongside `registerGoogleHealthTools`:

- **`google_health_sleep_timeline({ start, end })`** — normalized stage segments per night
  (the raw timeline the upstream never surfaced).
- **`google_health_honest_sleep({ start, end, config? })`** — runs the engine; returns
  `SleepResult[]` with Google-vs-honest and the per-night inflation. The headline tool.
- **`google_health_sleep_inflation_summary({ start, end })`** — aggregate over a range:
  mean/median nightly inflation, % of nights inflated, trend. The "how bad is it" answer.

## Charts (later phase — designed, not built in v1)

Per Andy: "a script that can take the data and produce sleep / step / heart rate charts."
Deliverable is a **standalone chart script** (`scripts/charts/`), not a chart-rendering
MCP tool — keeps rendering out of the server. v1 ships the data tools above; the chart
phase adds `google_health_*_chart_data` series tools + the script that consumes them.
Out of scope for the first implementation plan.

## Data sources & validation

- **Primary (live):** Google Health API v4 via the inherited client. The real ongoing
  source. Requires OAuth setup (below).
- **Validation fixtures:** synthetic nights (all-wake, no-stages, isolated-light-bracketed-
  by-wake, normal) for the engine; one captured **real** `listDataPoints("sleep")` response
  for the normalizer (added once auth works, redacted/committed as a fixture).
- **Takeout dump:** historical backfill / cross-check only; segment availability TBD.

## OAuth / access — the one real risk

All Google Health API v4 scopes are **Restricted**; Google requires a privacy/security
review to *publish* an app. For single-user personal use the path is the OAuth app in
**testing mode with Andy as sole test user**, which normally clears restricted scopes
without the full review. **This is the known risk** — confirmed only when we register the
Google Cloud project and run the auth flow. Mitigation if blocked: the legacy Fitbit Web
API (`davidmosiah/fitbitmcp`, no-approval Personal app, full sleep stages) as a fallback
adapter behind the same `sleep-normalize` contract — but it shuts down Sept 2026, so it's
strictly a stopgap, not built unless Google blocks us.

Setup steps (Andy's actions, documented in implementation plan): create Google Cloud
project → enable Google Health API v4 → create OAuth client → run `setup`/`auth` →
consent in testing mode.

## Testing

- Engine: `scripts/sleep-engine-test.mjs` against synthetic fixtures (follows the repo's
  existing `scripts/*-test.mjs` pattern; wired into `npm test`).
- Normalizer: against the captured live v4 sample.
- Reproduce-Google assertion doubles as an integration check.

## Integration / registration

- Build: `npm run build` → `dist/index.js` (inherited).
- Register in `~/.claude-assistant/.mcp.json` as **`health`**, stdio, `node
  /Users/aaymeloglu/git/google-health-mcp/dist/index.js`, env for OAuth client
  (same shape as the upstream `GOOGLE_HEALTH_*` vars).
- Public repo: `aaymeloglu/google-health-mcp`, `upstream` remote retained.

## Out of scope (YAGNI for v1)

- Chart rendering (separate later phase, designed above).
- The other ~17 Takeout categories (stress, SpO2, menstrual, etc.).
- Write/logging tools (nutrition write-gate etc. inherited but unused).
- Fitbit legacy fallback adapter (only if Google blocks personal access).

## Open items to resolve during implementation

1. Exact v4 `sleep` Session segment field names — verify against a live response.
2. Whether the Takeout CSV dump contains a per-night stage timeline.
3. Whether restricted scopes clear in testing mode for Andy's account.

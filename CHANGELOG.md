# Changelog

## 0.4.8 - 2026-06-27

### Security

- Pin transitive `hono` resolution to `4.12.27` via npm overrides, resolving production audit advisories while keeping the public MCP API unchanged.

### Added

- **Remote-write FOUNDATION (no write tool yet)** — `src/services/remote-write-gate.ts` (`checkRemoteWriteGate`/`isLiveWriteAuthorized`): enforces opt-in nutrition write scope, dry-run default, and explicit_user_intent=true with the same `USER_ACTION_REQUIRED` success-shaped refusal as `google_health_profile_update`.
- **Opt-in `nutrition-write` scope preset** + `GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE` constant. Read-only presets (basic/activity/sleep/full) and `DEFAULT_SCOPES` are unchanged, so existing users never re-consent and `missing_recommended_scopes` is unaffected.
- **`doctor --live` write coverage** — reports `nutrition_write_scope`; new `--live-write` flag does a dry-run round-trip that validates the v4 body and STOPS before any POST. The synthetic write checks never flip `api_reachable` (still read-derived).
- **`src/services/nutrition-normalize.ts`** — offline, pure, bilingual (EN + pt-BR) food→NutrientMap engine ported from wellness-nourish (`scaleNutrients`/`nutrientsForGrams`/`estimateMeal` + a 35-food catalog). No network, no API key. `estimateMeal` is now sync (the source declared `async` but did no I/O).
- **`src/services/google-v4-nutrition-datapoint.ts`** — maps NutrientMap → Google Health v4 create-DataPoint body + verified mg→g sodium unit shim. The v4 envelope/path/data-type slug are marked TO-VERIFY against official docs (no create body exists anywhere in the repo).
- Capability + agent manifest `mutating_tools` flags so agents discover the opt-in, dry-run-default write policy.
- Tests: `scripts/remote-write-gate-test.mjs`, `scripts/nutrition-normalize-test.mjs`, `scripts/v4-nutrition-mapping-test.mjs`.

### Notes

- The `log_nutrition` write tool is intentionally NOT included; this lays the rails + a documented seam (see the end of `registerGoogleHealthTools` in `src/tools/google-health-tools.ts`) for a community PR. No live remote mutation path is enabled.

## 0.4.5 - 2026-05-20

### Added

- **HTTP response cache middleware** (`src/services/http-cache.ts`) — in-memory cache layered OUTSIDE retry (`fetchWithCache → fetchWithRetry → fetch`), so cached responses skip both network and retry. Default 60s TTL for GET only; POST/PUT/DELETE and 4xx/5xx responses are never cached.
- **`GOOGLE_HEALTH_NO_CACHE=true` env var** — global per-process cache bypass; advertised in `server.json`.
- **Per-call `cache_ttl: 0`** request option — opts a single call out of cache without disabling globally.
- **Query-param-order-insensitive cache keys** — `?startTimeNs=…&endTimeNs=…&pageSize=…` and `?pageSize=…&endTimeNs=…&startTimeNs=…` share one cache entry.
- **`google_health_cache_status` now reports `http_cache` stats** alongside SQLite stats: `size`, `hit_count`, `miss_count`, `hit_rate`, `default_ttl_seconds`, `bypass_env_var`.
- `scripts/http-cache-test.mjs` — eight-case unit suite covering cache hit, POST never cached, TTL expiration, query-param normalization, 4xx not cached, env-var bypass, per-call `cache_ttl: 0`, and `getCacheStats()` math.

## 0.4.3 - 2026-05-19

### Added

- **HTTP retry middleware with exponential backoff + jitter** (`src/services/http-retry.ts`). Every Google Health API call (incl. token refresh and revoke) now retries on `408`, `429`, `500`, `502`, `503`, `504`, and network errors. Max 3 attempts (initial + 2 retries); backoff schedule `500ms / 1000ms / 2000ms` with ±20% jitter. Honors `Retry-After` (seconds or HTTP-date). Each retry logs to stderr as `[google-health-mcp] retry N/3 after Xms (status=Y or error=Z)`. Set `GOOGLE_HEALTH_NO_RETRY=true` to disable (used in tests). No new dependencies.

## 0.4.2 - 2026-05-19

### Fixed

- **`distance_meters` no longer returns millimeters as if they were meters.** When `firstRollup(distance, "distance")` only surfaced `millimetersSum` (and not `metersSum` / `distanceMetersSum`), `dailyStats()` returned the raw mm value labelled as meters — so a real 12.345 km walk reported as 12,345,000 m. Fix: new `distanceMeters()` helper prefers meter-named fields, falls back to mm with `Math.round(mm / 1000)`. Thanks @Z0mbiel0ne for the precise repro (#9).

### Changed

- **`promptHidden` reorders setup so the password prompt itself prints cleanly.** Previously the `_writeToOutput` interceptor was installed before `rl.question()`, so the question string ("Enter Google Health client secret:") was processed by the mute branch and could echo as asterisks. Marcel reordered: set `stdoutMuted = true` → ask question (renders the prompt normally because no interceptor yet) → install interceptor → user keystrokes get masked. Merged via PR #8 by @Z0mbiel0ne.

## 0.4.1 - 2026-05-11

### Fixed

- **Profile-store regex no longer false-positives on common wellness words.** Split `SECRET_PATTERNS` into `SECRET_KEY_PATTERNS` (broad, for field names like `oauth_token`) and `SECRET_VALUE_PATTERNS` (high-specificity, only credential shapes: JWTs, `Bearer <token>`, `sk_live_`, `sk-proj-`, `xoxb-`, `github_pat_`, raw `Authorization:` headers). Previously legitimate text like "5 training sessions per week", "limit cookies", "I need to refresh my approach", or "secret sauce: more sleep" was rejected.
- **Partial-profile reads no longer crash downstream.** `readProfileFile` now structurally merges with `DEFAULT_PROFILE` when legacy Hermes/OpenClaw files lacked sub-objects. Previously `buildProfileSummary` and `missingCriticalFields` would throw.
- **Onboarding `privacy_note` no longer hard-codes a single connector path.** Lists multiple example paths so the message reads correctly from every connector.

## 0.4.0 - 2026-05-11

- Add shared Delx Wellness profile support. Vendored copy of the canonical `profile-store` (delx-wellness commit ab83d1a) at `src/services/profile-store.ts` reads and writes `~/.delx-wellness/profile.json` — a single source of truth for preferred name, goals, devices, training/nutrition/exercise/agent preferences and safety flags shared across every Delx Wellness MCP connector.
- Add `google_health_profile_get` — read-only return of the current shared profile plus a summary and missing-critical fields.
- Add `google_health_profile_update` — partial-patch writer. Requires `explicit_user_intent=true` (otherwise returns USER_ACTION_REQUIRED). Rejects secret-like fields at write time.
- Add `google_health_onboarding` — read-only 11-question onboarding flow (en / pt-BR) plus current profile state and cross-connector hint.
- Add `google-health-mcp-server onboarding` CLI command — emits flow JSON to stdout and a TTY-gated Markdown summary to stderr.
- `recommended_first_calls` on the agent manifest now leads with `google_health_profile_get`.
- Tool count: 21 → 24.

## 0.3.0 - 2026-05-11

- Add `google_health_quickstart` tool — personalized 3-step setup walkthrough adapted to current state (Google Cloud OAuth client configured? token present? what's next?). Calls out the Fitbit-to-Google-Health migration path and returns cross-connector hints to pair with wellness-nourish, wellness-cycle-coach, and wellness-cgm-mcp.
- Add `google_health_demo` tool — realistic Pixel-Watch-style example payloads of `google_health_daily_summary`, `google_health_wellness_context`, and `google_health_daily_rollup` so agents see the contract before any real Google Health API call.
- `recommended_first_calls` on the agent manifest now leads with `google_health_quickstart` and `google_health_demo`.
- Tool count: 19 → 21.

## 0.2.2

- Made CLI UX tests use `--home-dir` explicitly so Windows runners do not depend on Unix-style `HOME` behavior.

## 0.2.1

- Closed the SQLite cache handle in tests so the expanded Windows CI matrix can remove temporary cache files cleanly.

## 0.2.0

- Added scope presets for easier first-time setup: `basic`, `activity`, `sleep` and `full`.
- Added `doctor --fix` to repair local config/token permissions before rechecking setup.
- Added `doctor --live` for opt-in Google Health API reachability checks after auth.
- Added `support --redacted` to generate safe GitHub issue bundles without OAuth tokens, client secrets or health values.
- Added `GOOGLE_HEALTH_API_BASE_URL` override for tested live-check diagnostics.
- Expanded CI to cover Linux, Windows and macOS.

## 0.1.4

- Fixed Windows OAuth browser launch by using PowerShell `Start-Process` instead of `cmd.exe`, preventing OAuth query parameters such as `response_type=code` from being stripped.
- Added a CLI regression test for Windows auth URL handling.

## 0.1.3

- Added `glama.json` for Glama maintainer claim and MCP discovery metadata.
- Included `glama.json` in npm package files and metadata checks.
- Recorded directory submission status in the discovery kit.

## 0.1.2

- Added public beta tester calls to action for Fitbit, Pixel Watch, Android and Google Health API v4 users.
- Added a terminal demo asset and expanded quickstart/demo docs for MCP builders.
- Added discovery copy for MCP directories and launch posts.
- Included top-level `assets/` in the npm package so README images render from packaged installs.

## 0.1.1

- Added a custom Google Health MCP banner and refreshed the README header.
- Published the npm package as `google-health-mcp-unofficial`.

## 0.1.0

- Initial beta Google Health API v4 MCP connector.
- Added local Google OAuth setup/auth/doctor flow.
- Added identity, profile, settings, list, reconcile, dailyRollUp and rollUp tools.
- Added agent manifest, data inventory, privacy audit, cache status and Hermes setup.
- Added daily summary, weekly summary and wellness context helpers.
- Marked the connector as beta until Google's end-of-May 2026 stabilization window passes.

## 0.7.8 - 2026-08-29

Skill layer ships in-package (`skill/SKILL.md`). Agents can use MCP tools **or** `call <tool> --json` on the same binary; mutation gates stay identical.

## 0.7.7 - 2026-08-26

### Security

- OAuth authorization now uses PKCE S256 and 128-bit state (was 32-bit).
- Local OAuth token files are gitignored so they cannot be committed.

## Unreleased (OSS-100)

### Added
- Coverage report template + issue form; headless auth walkthrough; clinical/dense policies; first-call FAQ.


## 0.7.3 - 2026-08-03

### Added (from @jumpmanjay PR #17 — rebased onto 0.7.2)

- **Headless OAuth.** `auth --manual` (aliases `--headless`, `--no-browser`) prints
  the authorization URL and accepts the redirect URL (or bare code) pasted back,
  so servers, SSH sessions, containers and WSL can authorize without a local
  browser. Selected automatically over SSH or when `DISPLAY`/`WAYLAND_DISPLAY`
  are unset; overridable with `GOOGLE_HEALTH_HEADLESS` and `--local-callback`.
- `auth --code "<redirect-url-or-code>"` for non-interactive provisioning.
- `auth --print-url` to emit only the authorization URL.
- `setup` forwards `--manual` / `--local-callback` to its auth step.
- `doctor` / `connection_status` report detected headless status and recommend
  `auth --manual` when appropriate.
- `scripts/headless-auth-test.mjs` coverage for detection, paste parsing and
  flow selection.

### Fixed

- Missing `xdg-open`/`open` no longer crashes `auth` with an uncaught `ENOENT`
  while the callback server is still waiting.
- Authorization URL is always printed in the callback flow, not only under
  `--no-open`.
- Local callback flow records granted OAuth scopes (exchanges full callback URL),
  matching the manual flow.

Credit: @jumpmanjay (PR #17).

## 0.7.2 - 2026-08-03

### Fixed (from external real-account coverage report — @maxgow on #3)

- **`total-calories` dailyRollUp clamp (issue #18).** Google enforces
  `window_size_days * page_size ≤ 14` for this type. Same pattern as nutrition-log
  (#15): `DAILY_ROLLUP_MAX_DURATION_DAYS["total-calories"] = 14` and
  `resolveDailyRollupPageSize` clamps instead of forwarding
  `INVALID_ROLLUP_QUERY_DURATION`.
- **`daily_summary` filter members (issue #19).** Resting HR and daily HRV now
  filter on `{type}.date`; sleep uses `sleep.interval.civil_end_time`. The old
  `interval.civil_start_time` path was rejected live with
  `INVALID_DATA_POINT_FILTER_DATA_TYPE_MEMBER`. Docs and inventory guidance updated
  to match the official list filter map.

### Added

- **Opt-in `clinical` scope preset (issue #20).** `full` stays unchanged.
  `clinical` = `full` + `googlehealth.ecg.readonly` + `googlehealth.irn.readonly`
  so ECG / irregular-rhythm-notification no longer fail with `MISSING_OAUTH_SCOPE`
  after an explicit re-auth. Sensitive scopes are never added silently.

## 0.7.1 - 2026-08-01

### Security (round 3: the *limits* printed next to the key list were prose nobody tested)

- **The gate for the list did not cover the sentences around the list.** 0.7.0 shipped
  `redaction-doc-test.mjs`, which proves the published key list against the exported one,
  character for character. The paragraph next to it — "raw requires `explicit_user_intent`",
  "`summary` is never less restrictive", "`altitude` is not location", "`summary` flattens to
  depth 2" — was still text nothing compared with behaviour. Same defect as 0.6.0 and 0.7.0
  fixed, one layer further in. **A public promise with no behavioural test is a debt, not a
  feature.**
- **`npm run test:declared-limits` is the new gate.** Ten limits are now assertions over the
  observed output of the built server, and the `declared-limits` block published in README.md
  and SECURITY.md must mirror the tested registry exactly, in order. Writing a limit into the
  docs without a test fails the build; deleting the block fails the build. Each assertion was
  verified to be falsifiable by mutating the code it guards (removing the intent gate, moving
  the depth-2 floor, summarizing before stripping) and watching the gate go red.
- **The text was narrowed until it was true, not widened.** SECURITY.md said raw "requires
  `explicit_user_intent=true`", full stop. The code only requires it of an **agent**
  escalation: a local `GOOGLE_HEALTH_PRIVACY_MODE=raw` default is honoured on every call with
  no per-call intent. That is the right behaviour — the machine owner is not an agent — but
  the sentence promised more than the code did. Both docs and the `google_health_privacy_audit`
  notes now state the two paths separately.
- **What an agent gets from this:** `google_health_privacy_audit` publishes one more documented
  limit (the intent gate and its exception), and every limit an agent may read in the README is
  now a claim some test would fail on. A limit that cannot be tested — the location guard has
  never met a real Google payload, because v4 documents no location data type — is labelled
  **NOT VERIFIED** in both docs instead of reading like a guarantee.

## 0.7.0 - 2026-08-01

### Security (round 2: the key list in 0.6.0 was still Strava's, one layer up)

- **The list an agent could trust had no entry for Google's own coordinate encoding.** 0.6.0
  fixed the drop-list by adopting `delx-mcp-kit`'s `isGpsKey()` — but that shared list was
  itself derived from Strava's field names, so `latitudeE7` and `longitudeE7` survived
  `structured` and `summary`. That is the canonical way *Google* writes a coordinate (integer
  degrees × 1e7, as in Location History and the Maps APIs): the single most predictable
  location field name for this provider was the one missing. The diagnosis in 0.6.0 was
  "somebody copied the policy from Strava without re-deriving the keys for the new provider";
  the fix then adopted a list that was still Strava's. Corrected by re-deriving for Google:
  `latitudeE7`, `longitudeE7`, `latE7`, `lngE7`, `lonE7`, the `start*`/`end*` E7 forms,
  `lat_deg`, `lng_deg`, `lon_deg`, `latitudeDegrees`, `longitudeDegrees`.
- **Coordinates hid one level down, inside containers nobody was dropping.** `location`,
  `geoLocation`, `route`, `position`, `trackPoints`, `placeVisit` and friends walked through
  untouched, carrying coordinates and the `address`/`city`/`placeId` siblings that localize
  just as well. Agents now get **whole-object** redaction of a place record, so a coordinate
  spelled in a way the leaf list never anticipated still dies with its container. Conditional
  on the value: a container holding only scalars is a label, not a place — `location: ["gym",
  "home"]` survives, `location: { latitudeE7: … }` does not.
- **Key matching now ignores case, `_` and `-`.** `latitude_e7`, `latitudeE7` and `LATITUDEE7`
  are one key. Spelling drift was a live source of silent misses.
- **`gpsRedactionSelfCheck()` scanned key NAMES only, so a rename kept it green.** It now
  scans the output for the probe's sentinel coordinate VALUES as well, and additionally
  requires a non-location metric to survive — otherwise a build that redacted everything
  would have reported a perfect score.

### Added — the gate that matters for anyone reading the docs

- **`npm run test:redaction-docs`: a gate that proves the code cannot prove the prose next to
  it.** 0.6.0 shipped a behavioural GPS gate and, in the same commit, a README enumerating
  20 keys against an export of 21 — `activities-tracker-gps` was enforced but never
  published, and nothing compared the two. The published lists in README.md and SECURITY.md
  now live inside `<!-- gps-redacted-keys -->` / `<!-- gps-redacted-containers -->` markers and
  are compared, in order, against `GPS_REDACTED_KEYS`, `GPS_REDACTED_CONTAINER_KEYS` and what
  `google_health_privacy_audit` actually serves. A promise wider than the code, a code wider
  than the promise, or a deleted marker block all fail the build.
- `google_health_privacy_audit` gains `gps_redacted_container_keys` (output-contract addition
  → minor bump) and publishes its two limits as notes rather than implying total coverage.

### Documented limits (stated instead of implied)

- **`altitude` and `elevation` are deliberately NOT redacted as location.** `altitude` is an
  official Google Health v4 data type (`activity_and_fitness`); the obvious fix — adding it to
  the drop-list — would have deleted a real metric from every `altitude` data point, and an
  altitude does not localize anyone on its own. Altitude *inside* a redacted place container
  is dropped with the container. There is a regression assert for this.
- **`summary` mode flattens numeric leaves up to depth 2**, so it promotes values rather than
  hiding them. It strips before summarizing and can never be less restrictive than
  `structured`, but any coordinate key outside the published lists would be promoted. The key
  list is the boundary; the mode is not.

### Removed

- `normalizeStreams()`. "Streams" is a Strava concept with no Google Health v4 endpoint: the
  function had no call site anywhere in `src/`, and its `includeGps` parameter only deleted
  `dataSource`. Two asserts in the 0.6.0 fixture were covering code no tool could execute.
  Function and asserts removed together.

### Scope, honestly

Unchanged from 0.6.0: Google Health API v4 documents no location or route data type, so there
is no upstream source of coordinates and nothing was leaking in practice. Severity is low.
What changed is that the published promise now matches the enforced list for *this* provider,
and drift between the two is a build failure.

## 0.6.0 - 2026-08-01

### Security (hardening + honesty, not a fix for an active leak)

- **`google_health_privacy_audit` was making a promise the code did not keep.** It reported
  `gps_redaction_default: true` from a hardcoded literal, and README/SECURITY promised GPS
  redaction, but the drop-list only held Strava-era key names (`latlng`, `gps`, `map`,
  `polyline`, `summary_polyline`, `tcxLink`). `latitude`, `longitude`, `lat`, `lon`, `lng`,
  `coordinates`, `startLatitude` and `startLongitude` were never dropped. An agent that
  trusted the audit before forwarding a payload to a third party was trusting an unbacked
  claim. Location keys are now sourced from `delx-mcp-kit`'s `isGpsKey()`, the shared
  definition across the Delx wellness servers.
- **`summary` mode was less restrictive than `structured`.** `collectNumbers()` walks numbers
  recursively, so coordinates buried inside a record were flattened back to the top level of
  the summary response — the mode meant to expose the least exposed the most. Summary now
  strips first and summarizes the stripped record, and `collectNumbers()` honours the same
  drop-list.
- **`gps_redaction_default` is now measured, not asserted.** Each call runs a synthetic record
  carrying every claimed location key through `structured` and `summary` and scans the output.
  If a future refactor stops redacting, the audit reports `false` instead of lying.
- **Honest scope:** Google Health API v4 does not currently document any location/route data
  type, so there is no known upstream source of coordinates today. Nothing was leaking in
  practice. This closes the gap between what the server *claimed* and what it *enforced*, and
  makes the guard real ahead of any v4 data type that carries location.

### Added

- `gps_redacted_keys` in the `google_health_privacy_audit` output — the live, enumerated list
  behind the claim, so agents can verify coverage instead of trusting a boolean. (Output
  contract change; hence the minor bump.)
- `npm run test:gps-redaction` (`scripts/gps-redaction-test.mjs`) — behavioural gate over a
  synthetic payload with every location key nested at several depths, asserting that neither
  the keys nor the coordinate values survive `structured` or `summary`, across bare records,
  arrays, `dataPoints`/`rollupDataPoints` envelopes and stream normalisation, while `raw`
  stays an honest passthrough. Verified to fail on 0.5.7 (16 location keys survived) and pass
  on 0.6.0.

### Changed

- `scripts/privacy-cache-test.mjs` no longer asserts `gps_redaction_default === true` against
  the literal it was reading from the audit. That gate tested a string, not behaviour — which
  is precisely why the missing keys went unnoticed. It now runs a payload through and checks
  the output.

## 0.5.7 - 2026-07-30

### Added / Fixed

- Use delx-mcp-kit for privacy escalation.

# Changelog

## 0.7.6 - 2026-08-14

### Fixed

- **Claude Desktop can invoke tools again** ([#23](https://github.com/davidmosiah/google-health-mcp/issues/23)
  by @wooyoungpark88). `tools/list` no longer advertises
  `outputSchema.$schema` / `inputSchema.$schema` as JSON Schema draft-07. The
  MCP SDK (1.29–1.30) still converts Zod with that dialect; we rewrite listed
  schemas to JSON Schema 2020-12 after conversion. `doctor --live` was never
  the failing path — only the Desktop validator. Gate:
  `npm run test:output-schema-dialect`.

## 0.7.5

- Security: raise `hono` override to **4.13.1** (clears moderate MCP SDK transitive advisories); `@hono/node-server@2.1.0`.


## 0.7.4

- Security: override `fast-uri@3.1.5` and `ip-address@10.4.0` (high transitive).



## 0.5.6 - 2026-07-30

### Security

- Security: require explicit_user_intent on revoke/disconnect tools so agents cannot wipe OAuth grants autonomously.

## 0.5.5 - 2026-07-30

### Added

- CLI `demo` command — OAuth-free synthetic contract samples (`is_demo: true`), same payload as MCP tool `google_health_demo`.
- Shared `buildSyntheticDemoPayload()` used by CLI and MCP tool.
- Community doc `docs/community/SYNTHETIC_DEMO.md` documents the working `npx … demo` path.

## 0.5.4 - 2026-07-30

### Fixed

- **daily_rollup + nutrition-log (issue #15):** Google Health rejects queries where
  `window_size_days * page_size` exceeds a per-type max duration (90 days for
  `nutrition-log`), independent of the requested date range. The tool schema default
  `page_size=100` made every default nutrition daily rollup fail with a misleading
  `range` error. Defaults are now 90, and the client clamps page size for known caps
  so agents (including small local models) succeed without guessing.

### Changed

- `DEFAULT_DAILY_ROLLUP_PAGE_SIZE = 90` for `google_health_daily_rollup` only
  (list/reconcile keep `DEFAULT_LIMIT = 100`).
- Documented `DAILY_ROLLUP_MAX_DURATION_DAYS` for confirmed per-type caps.

## 0.5.3 - 2026-07-16

### Fixed

- Validate real calendar dates and exclusive daily-rollup ranges before HTTP, preventing impossible or reversed civil dates from reaching Google Health v4.
- Validate timezone-aware rollup date-times and reject invalid or reversed instant ranges while preserving the caller's exact ISO values upstream.
- Log redacted per-domain errors from partial summaries to stderr instead of silently hiding failed Google Health domains.
- Add an executable HTTP-boundary regression suite and structured-output forward-compatibility checks.

## 0.5.2 - 2026-07-12

### Fixed

- Correct Google Health v4 scorecard / summary field mapping: accept `kcalSum`
  for calories, sum AZM minutes across heart-rate zones, and convert
  `weightGramsAvg` to kilograms when present.
- Harden error-envelope handling for Google Health v4 responses so agent-facing
  failures stay actionable instead of opaque.

### Added

- Ship `smithery.yaml` so the connector can be discovered and installed via
  Smithery.

### Changed

- Replace stale “end-of-May 2026 stabilization window” copy in summary and
  privacy-audit surfaces with the current evolving-API notice aligned to
  `GOOGLE_HEALTH_BETA_NOTICE`.

## 0.5.1 - 2026-06-27

### Added

- Expand `GOOGLE_HEALTH_DATA_TYPES` to a 39-type snapshot from the official
  Google Health API data-type table, including official operation names, type
  kind and scope family.
- Add `google_health_data_type_coverage`, a read-only MCP tool that returns a
  static issue #3 validation plan by default and can run explicit live
  list/reconcile/daily-rollup checks after OAuth.
- Add `google-health-mcp-server coverage --json` and
  `google-health-mcp-server coverage --live --json` for safe CLI coverage
  reports.
- Add `docs/data-coverage.md` plus README, beta-guide, tool-catalog and LLM
  documentation for the coverage workflow.

### Security

- Live coverage reports include only operation status and point-count buckets;
  tests assert that OAuth secrets, local paths and example health values do not
  leak into the report.
- Public support and setup-feedback reports now use metadata-only file checks
  and no longer read local config JSON or token JSON before printing redacted
  output.

## 0.5.0 - 2026-06-27

### Added

- Add `google-health-mcp-server support --feedback --json`, an anonymous setup
  feedback bundle for issue #4 and MCP client beta reports.
- The feedback bundle reports package/runtime posture, setup state, token
  presence, scope counts, client-readiness booleans, friction markers and
  reviewer questions without exposing OAuth tokens, Google Cloud client-secret
  values, local paths, raw token files or health measurements.
- Add `docs/setup-feedback.md` and wire the anonymous feedback path into the
  README, beta guide, quickstart, tool docs and LLM docs.

### Security

- Redact local token/config paths from support next-step output so public setup
  reports do not leak home-directory paths.

## 0.4.9 - 2026-06-27

### Changed

- Refresh the above-the-fold README for Google Health API v4 builders: install,
  agent prompts, privacy guarantees, tool catalog, Living Body demo path and
  Delx Wellness cross-links are now visible before the long install docs.
- Move the full tool catalog into `docs/tools.md` so support answers can link
  to one stable page.
- Add `docs/beta-feedback.md` with safe tester workflows for issues #2, #3 and
  #4.
- Replace stale "wait until end of May 2026" copy with a current evolving-API
  note that points to Google's official release notes.
- Update the opt-in nutrition write scope constant to
  `https://www.googleapis.com/auth/googlehealth.nutrition.writeonly`, matching
  Google's write-only scope naming. No write tool ships in this release.

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

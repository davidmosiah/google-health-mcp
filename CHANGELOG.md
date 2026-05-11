# Changelog

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

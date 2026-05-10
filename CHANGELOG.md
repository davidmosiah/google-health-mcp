# Changelog

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

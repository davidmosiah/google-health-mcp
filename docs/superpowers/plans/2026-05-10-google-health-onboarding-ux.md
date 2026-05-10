# Google Health Onboarding UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Google Health MCP easier to configure, debug, support, and validate during first-time setup.

**Architecture:** Keep the existing CLI shape and add small focused services behind it. `setup` owns local config generation and scope presets, `doctor` owns local diagnostics and optional local fixes, `support` owns safe redacted reports, and `live` checks are opt-in so ordinary doctor runs never call Google APIs.

**Tech Stack:** TypeScript ESM, Node.js CLI, existing smoke `.mjs` tests, GitHub Actions, npm package release.

---

### Task 1: Scope Presets For Setup

**Files:**
- Create: `src/services/scope-presets.ts`
- Modify: `src/cli/setup.ts`
- Modify: `scripts/cli-ux-test.mjs`
- Modify: `README.md`, `docs/quickstart.md`, `docs/oauth.md`

- [ ] **Step 1: Write failing CLI test**

Add assertions in `scripts/cli-ux-test.mjs` that run `setup --scope-preset sleep --no-auth --json` and verify saved `GOOGLE_HEALTH_SCOPES` contains profile, settings, and sleep scopes but excludes nutrition.

- [ ] **Step 2: Verify failure**

Run: `npm run build && npm run test:cli-ux`

Expected: FAIL because `--scope-preset` is ignored and setup still writes full default scopes.

- [ ] **Step 3: Implement scope presets**

Create `src/services/scope-presets.ts` with named presets: `basic`, `activity`, `sleep`, `full`. Update setup parsing so `--scope-preset` chooses scopes, `--scopes` accepts a space/comma-separated override, and interactive setup asks for a preset.

- [ ] **Step 4: Verify**

Run: `npm run build && npm run test:cli-ux`

Expected: PASS.

### Task 2: Doctor Fixes Local Friction

**Files:**
- Create: `src/services/local-fixes.ts`
- Modify: `src/cli/commands.ts`
- Modify: `src/services/connection-status.ts`
- Modify: `scripts/cli-ux-test.mjs`

- [ ] **Step 1: Write failing CLI test**

Add assertions that create insecure `config.json`/`tokens.json` with mode `0644`, run `doctor --fix --json --home-dir <tmp>`, and verify the files become `0600` and JSON includes `fixes_applied`.

- [ ] **Step 2: Verify failure**

Run: `npm run build && npm run test:cli-ux`

Expected: FAIL because `doctor --fix` and `--home-dir` are not supported.

- [ ] **Step 3: Implement local fixes**

Add `fixLocalSetup(homeDir)` to chmod local config/token files to `0600` on non-Windows. Add `--fix` and `--home-dir` to doctor parsing, apply fixes before recomputing status, and include `fixes_applied` in JSON output.

- [ ] **Step 4: Verify**

Run: `npm run build && npm run test:cli-ux`

Expected: PASS.

### Task 3: Safe Support Bundle

**Files:**
- Create: `src/services/support-report.ts`
- Modify: `src/cli/commands.ts`
- Modify: `scripts/cli-ux-test.mjs`
- Modify: `.github/ISSUE_TEMPLATE/install_help.yml`

- [ ] **Step 1: Write failing CLI test**

Add assertions that run `support --redacted --json --home-dir <tmp>` and verify output includes package version, platform, Node version, safe doctor status, issue body text, and no client secret/token values.

- [ ] **Step 2: Verify failure**

Run: `npm run build && npm run test:cli-ux`

Expected: FAIL because `support` command does not exist.

- [ ] **Step 3: Implement support report**

Build report from `buildConnectionStatus`, redact paths to `~`, include safe environment presence booleans but not values, and print either JSON or copy-paste Markdown.

- [ ] **Step 4: Verify**

Run: `npm run build && npm run test:cli-ux`

Expected: PASS.

### Task 4: Live Check Command

**Files:**
- Create: `src/services/live-check.ts`
- Modify: `src/cli/commands.ts`
- Modify: `src/services/config.ts`
- Modify: `src/types.ts`
- Modify: `scripts/cli-ux-test.mjs`

- [ ] **Step 1: Write failing CLI test**

Add assertions that run `doctor --live --json` against a local fake API base URL and verify the JSON reports `api_reachable: true` without printing token values.

- [ ] **Step 2: Verify failure**

Run: `npm run build && npm run test:cli-ux`

Expected: FAIL because `doctor --live` and `GOOGLE_HEALTH_API_BASE_URL` override are not supported.

- [ ] **Step 3: Implement live check**

Allow config to override `GOOGLE_HEALTH_API_BASE_URL`, make `GoogleHealthClient` use it, add `runLiveCheck()` to call identity/profile/settings safely, and attach results only when `--live` is set.

- [ ] **Step 4: Verify**

Run: `npm run build && npm run test:cli-ux`

Expected: PASS.

### Task 5: Cross-OS CI And Docs Polish

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/quickstart.md`
- Modify: `docs/oauth.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`, `package-lock.json`, `server.json`, `src/constants.ts`

- [ ] **Step 1: Add CI matrix**

Run CLI tests on `ubuntu-latest`, `windows-latest`, and `macos-latest` with Node 20/22/24 where practical.

- [ ] **Step 2: Update docs**

Document `setup --scope-preset`, `doctor --fix`, `doctor --live`, and `support --redacted`. Make the first-run path explicit for Google Cloud OAuth.

- [ ] **Step 3: Bump version**

Bump to `0.2.0` because this is an onboarding feature release.

- [ ] **Step 4: Full verification**

Run: `npm test`, `npm audit --omit=dev --audit-level=moderate`, `npm pack --dry-run`.

Expected: all pass.

- [ ] **Step 5: Commit, push, publish**

Commit feature branch, merge to main after local checks, tag `v0.2.0`, push, publish npm, and confirm GitHub CI plus npm latest.

### Self-Review

- Spec coverage: scope presets, doctor fixes, redacted support, live check, cross-OS CI, docs, release are all represented.
- Placeholder scan: no placeholder tasks remain.
- Type consistency: planned names are stable: `scope-preset`, `doctor --fix`, `doctor --live`, `support --redacted`, `GOOGLE_HEALTH_API_BASE_URL`.

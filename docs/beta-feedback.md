# Google Health MCP Beta Feedback Guide

Google Health API v4 is live for builders but still evolving. This connector
therefore treats real-account testing as a safety and compatibility loop, not a
marketing checkbox.

Use this guide when contributing to:

- [Issue #2: Beta testers wanted](https://github.com/davidmosiah/google-health-mcp/issues/2)
- [Issue #3: Validate data type coverage](https://github.com/davidmosiah/google-health-mcp/issues/3)
- [Issue #4: Collect anonymous setup feedback](https://github.com/davidmosiah/google-health-mcp/issues/4)

## Safe First Run

```bash
npx -y google-health-mcp-unofficial setup --scope-preset full
npx -y google-health-mcp-unofficial auth
npx -y google-health-mcp-unofficial doctor
npx -y google-health-mcp-unofficial doctor --live
npx -y google-health-mcp-unofficial coverage --json
npx -y google-health-mcp-unofficial coverage --live --json
npx -y google-health-mcp-unofficial support --redacted
npx -y google-health-mcp-unofficial support --feedback --json
```

`doctor --live` calls safe identity, profile and settings endpoints after auth.
It is the preferred proof that OAuth and API reachability are wired correctly.

## What To Report

For setup feedback:

- Paste the output of `support --feedback --json` when possible. It is designed
  for issue #4 and does not include local paths, tokens, secrets or health
  measurements.
- MCP client used: Claude Desktop, Cursor, Codex, Hermes, OpenClaw or another
  client.
- Platform: macOS, Windows, Linux, WSL or container.
- Device/source family: Fitbit, Pixel Watch, Android, Google sources or other
  supported sources.
- Which step was unclear: Google Cloud OAuth client, redirect URI, setup, auth,
  doctor, MCP client reload or tool choice.
- Whether `support --redacted` produced enough context to debug without secrets.

For data coverage:

- Start with `coverage --json` to see the static plan captured from the
  official data type table.
- After OAuth, run `coverage --live --json` for a redacted read-only report.
  It returns operation status and point-count buckets, not raw health payloads.
- Data type tested, for example `steps`, `sleep`, `heart-rate`,
  `daily-heart-rate-variability`, `active-zone-minutes`, `weight`, `body-fat`,
  `exercise` or `nutrition`.
- Source family: `all-sources`, `google-wearables` or `google-sources`.
- Method tested: list, reconcile, daily rollup or rollup.
- Whether the response shape matched the official docs and what field names
  were unexpected.

## Do Not Share

- OAuth access tokens, refresh tokens or token files.
- Google Cloud client secrets.
- Local config paths, token paths or home-directory paths.
- Raw personal health measurements.
- Full API responses containing private health data.
- Screenshots that expose account emails, device IDs or project secrets.

## Release Notes Watchlist

Before reporting a suspected bug, check:

- [Google Health API release notes](https://developers.google.com/health/release-notes)
- [Google Health API scopes](https://developers.google.com/health/scopes)
- [Google Health API data types](https://developers.google.com/health/data-types)

The current connector keeps read tools stable and leaves write tools gated.
Nutrition write support is foundation-only: the opt-in write scope is tracked,
but no live write tool is registered in this release.

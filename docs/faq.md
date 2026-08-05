# FAQ

## Is this Google Fit?

No. This targets Google Health API v4, not the legacy Google Fit REST API.

## Is this Health Connect?

No. Health Connect is Android/on-device. This connector uses Google Health API v4 over OAuth and HTTPS.

## Is it stable?

It is beta. Google Health API v4 is live for builders, but official release
notes continue to document scope and data-type changes. Check the release notes
before production launch decisions.

## Does it expose raw sensors?

No. `raw` mode means upstream Google Health API JSON for supported endpoints, not raw accelerometer telemetry.

## First agent call

1. `google_health_connection_status`
2. `google_health_agent_manifest` (if installing)
3. `google_health_daily_summary` or `coverage --live --json` (redacted)

Dense series tools are not required for Google Health day rollups; prefer summaries.

# Google Health MCP — Tools

Full tool catalog for [`google-health-mcp-unofficial`](https://www.npmjs.com/package/google-health-mcp-unofficial). For the short "start here" list and copy-paste prompts, see the [README](../README.md).

> **Unofficial project.** Not affiliated with, endorsed by or supported by Google, Fitbit or Alphabet. Not a medical device. Not medical advice.

## Start here

- `google_health_connection_status` — local config, token, scope and client readiness
- `google_health_data_inventory` — supported domains, scopes, data type naming and agent flow
- `google_health_data_type_coverage` — static coverage plan, or explicit live read-only validation
- `google_health_agent_manifest` — machine-readable install/runtime guide
- `google_health_daily_summary` — daily beta summary from rollups and reconciled streams
- `google_health_weekly_summary` — weekly beta review

## Google Health API methods

- `google_health_get_identity`
- `google_health_get_profile`
- `google_health_get_settings`
- `google_health_list_data_points`
- `google_health_reconcile_data_points`
- `google_health_daily_rollup`
- `google_health_rollup`

## Diagnostics

- `google_health_get_auth_url`
- `google_health_exchange_code`
- `google_health_data_type_coverage`
- `google_health_privacy_audit`
- `google_health_cache_status`
- `google_health_revoke_access`
- `google_health_wellness_context`

## Data type notes

Endpoint paths use kebab case:

```text
steps
sleep
heart-rate
daily-resting-heart-rate
daily-heart-rate-variability
active-zone-minutes
total-calories
weight
exercise
```

Filter expressions use snake case:

```text
steps.interval.civil_start_time >= "2026-05-07"
heart_rate.sample_time.physical_time >= "2026-05-07T00:00:00Z"
sleep.interval.civil_start_time >= "2026-05-07"
```

Source families supported by the API:

```text
users/me/dataSourceFamilies/all-sources
users/me/dataSourceFamilies/google-wearables
users/me/dataSourceFamilies/google-sources
```

## Coverage validation

The connector's `google_health_list_data_types` tool is the canonical local
inventory for data types this package exercises. `google_health_data_type_coverage`
adds a safe validation workflow: default mode returns a static plan captured
from the official data type table, and `live: true` runs read-only list,
reconcile and daily rollup checks against a real OAuth account.

CLI equivalents:

```bash
npx -y google-health-mcp-unofficial coverage --json
npx -y google-health-mcp-unofficial coverage --live --json --date YYYY-MM-DD
```

Live coverage reports include status and point-count buckets only. They do not
include raw Google Health payloads, health measurements, OAuth tokens, client
secrets or local paths.

Google Health API v4 continues to evolve, so real-account testers should
compare this inventory with the official docs and release notes before filing
coverage gaps.

Useful references:

- [Google Health API release notes](https://developers.google.com/health/release-notes)
- [Google Health API scopes](https://developers.google.com/health/scopes)
- [Google Health API data types](https://developers.google.com/health/data-types)

For safe public feedback, use [Data Coverage](data-coverage.md),
[Beta Feedback Guide](beta-feedback.md) and [Anonymous Setup Feedback](setup-feedback.md).
Do not post raw personal health values, OAuth tokens, client secrets, local
paths or token files.

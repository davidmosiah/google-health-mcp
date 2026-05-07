# Google Health MCP

Unofficial, local-first MCP server for the new **Google Health API v4**.

It lets Claude, Cursor, Hermes, OpenClaw and other MCP clients read user-authorized Google Health data from Fitbit, Pixel Watch and supported third-party sources through Google's OAuth 2.0 flow.

> **Beta status:** Google recommends waiting until the end of May 2026 before officially launching Google Health API integrations because breaking changes may occur while developer feedback is incorporated. This connector is intentionally published as an early beta for builders who want to test the API now.

> **Unofficial project.** Not affiliated with, endorsed by or supported by Google, Fitbit or Alphabet. Not a medical device. Not medical advice.

## Why this exists

Google Health API is the successor to Fitbit Web API: new OAuth, new base URL, v4 endpoint schema, standardized data types, reconciled streams and rollups.

This MCP gives agents a clean way to discover the API, check setup, authenticate locally and query data without pasting tokens into prompts or agent configs.

## Install

Create a Google Cloud OAuth client, enable the Google Health API, and add:

```text
http://127.0.0.1:3000/callback
```

Then run:

```bash
npx -y google-health-mcp-unofficial setup
npx -y google-health-mcp-unofficial auth
npx -y google-health-mcp-unofficial doctor
```

Recommended read-only scopes:

```text
https://www.googleapis.com/auth/googlehealth.profile.readonly
https://www.googleapis.com/auth/googlehealth.settings.readonly
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
https://www.googleapis.com/auth/googlehealth.sleep.readonly
https://www.googleapis.com/auth/googlehealth.nutrition.readonly
```

Standalone MCP config:

```json
{
  "mcpServers": {
    "google-health": {
      "command": "npx",
      "args": ["-y", "google-health-mcp-unofficial"]
    }
  }
}
```

## Tools

Start here:

- `google_health_connection_status` - local config, token, scope and client readiness
- `google_health_data_inventory` - supported domains, scopes, data type naming and agent flow
- `google_health_agent_manifest` - machine-readable install/runtime guide
- `google_health_daily_summary` - daily beta summary from rollups and reconciled streams
- `google_health_weekly_summary` - weekly beta review

Google Health API methods:

- `google_health_get_identity`
- `google_health_get_profile`
- `google_health_get_settings`
- `google_health_list_data_points`
- `google_health_reconcile_data_points`
- `google_health_daily_rollup`
- `google_health_rollup`

Diagnostics:

- `google_health_get_auth_url`
- `google_health_exchange_code`
- `google_health_privacy_audit`
- `google_health_cache_status`
- `google_health_revoke_access`
- `google_health_wellness_context`

## Data Type Notes

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

## Privacy

- OAuth tokens are stored locally at `~/.google-health-mcp/tokens.json` with `0600` permissions.
- Secrets can live in `~/.google-health-mcp/config.json` or `GOOGLE_HEALTH_*` environment variables.
- Tools never return access tokens, refresh tokens or client secrets.
- `GOOGLE_HEALTH_PRIVACY_MODE=structured` is the default.
- `raw` mode is explicit and should be used only for debugging or deep analysis.

## Hermes

```bash
npx -y google-health-mcp-unofficial setup --client hermes --no-auth
npx -y google-health-mcp-unofficial auth
npx -y google-health-mcp-unofficial doctor --client hermes
hermes mcp test google-health
```

After config changes, use `/reload-mcp` or `hermes mcp test google-health`. Do not restart the gateway for normal data access.

## Development

```bash
git clone https://github.com/davidmosiah/google-health-mcp.git
cd google-health-mcp
npm install
npm test
```

## Links

- Google Health API: https://developers.google.com/health
- REST reference: https://developers.google.com/health/reference/rest
- Scopes: https://developers.google.com/health/scopes
- Data types: https://developers.google.com/health/data-types
- Migration guide: https://developers.google.com/health/migration
- Delx Wellness registry: https://github.com/davidmosiah/delx-wellness

## License

MIT - see [LICENSE](LICENSE).

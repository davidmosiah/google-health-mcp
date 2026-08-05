# Headless auth walkthrough (issue #22)

## 60-second path (text; GIF optional later)

1. `npx -y google-health-mcp-unofficial@0.7.3 doctor`
2. `npx -y google-health-mcp-unofficial@0.7.3 auth` (or env-based headless flags documented in CLI help)
3. Browser consent once; tokens land in local token path (`0600`)
4. `google_health_connection_status` → ready
5. First data call: `google_health_daily_summary` or `coverage --live --json`

Screenshot/GIF of the browser consent step is optional and may be BLOCKED until a maintainer records one on a real account.

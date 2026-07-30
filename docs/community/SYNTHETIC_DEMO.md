# Synthetic demo (no OAuth account required)

Agents and contributors can exercise contracts without a Google Health account:

```bash
npx -y google-health-mcp-unofficial@0.5.4 demo
# or MCP tool google_health_demo
```

For redacted live coverage (needs real OAuth):

```bash
npx -y google-health-mcp-unofficial@0.5.4 coverage --json   # preflight
npx -y google-health-mcp-unofficial@0.5.4 coverage --live --json  # after auth
```

Never commit live coverage output with personal measurements.

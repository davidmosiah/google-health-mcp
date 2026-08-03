# Synthetic demo (no OAuth account required)

Agents and contributors can exercise **contract-shaped** samples without a Google Health account.

## CLI (no credentials)

```bash
npx -y google-health-mcp-unofficial@0.7.3 demo
```

Prints JSON with `is_demo: true` and sample shapes for `google_health_daily_summary`, `google_health_wellness_context`, and `google_health_daily_rollup`.

Also OAuth-free:

```bash
npx -y google-health-mcp-unofficial@0.7.3 doctor --json      # setup status
npx -y google-health-mcp-unofficial@0.7.3 coverage --json    # static data-type plan
```

## MCP tool (same payload)

Call tool **`google_health_demo`** from any MCP client after installing this package as a server. Same synthetic contract as the CLI `demo` command.

## Live coverage (needs real OAuth)

```bash
npx -y google-health-mcp-unofficial@0.7.3 coverage --json           # preflight plan
npx -y google-health-mcp-unofficial@0.7.3 coverage --live --json    # after auth
```

Never commit live coverage output with personal measurements.

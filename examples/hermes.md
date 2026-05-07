# Hermes Example

```bash
npx -y google-health-mcp-unofficial setup --client hermes --no-auth
npx -y google-health-mcp-unofficial auth
npx -y google-health-mcp-unofficial doctor --client hermes
```

Useful direct tools:

- `mcp_google_health_google_health_connection_status`
- `mcp_google_health_google_health_data_inventory`
- `mcp_google_health_google_health_daily_summary`
- `mcp_google_health_google_health_weekly_summary`
- `mcp_google_health_google_health_reconcile_data_points`
- `mcp_google_health_google_health_daily_rollup`

Keep `GOOGLE_HEALTH_CLIENT_SECRET` and OAuth tokens out of prompts, logs and public repos.

# Demo

This connector is designed to be safe to inspect before an agent sees any health data.

```bash
npx -y google-health-mcp-unofficial setup --scope-preset full
npx -y google-health-mcp-unofficial auth
npx -y google-health-mcp-unofficial doctor --fix
npx -y google-health-mcp-unofficial doctor --live
```

Expected shape:

```text
Google Health MCP doctor
OK config: local OAuth client configured
OK token store: ~/.google-health-mcp/tokens.json
OK privacy mode: structured
OK tools: connection, inventory, rollups, summaries
```

Start MCP clients with:

- `google_health_connection_status`
- `google_health_data_inventory`
- `google_health_privacy_audit`
- `google_health_daily_summary`

The demo intentionally avoids real personal health values. When sharing screenshots or issues, redact account IDs, OAuth client secrets, token paths outside your home folder, and any health measurements you do not want public.

For support, prefer:

```bash
npx -y google-health-mcp-unofficial support --redacted
```

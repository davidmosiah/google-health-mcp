# Quickstart

Google Health MCP is a beta connector for builders testing Google Health API v4 with local MCP clients. It is unofficial, read-only by default and stores OAuth tokens locally.

1. Create a Google Cloud OAuth web client.
2. Enable Google Health API.
3. Add redirect URI `http://127.0.0.1:3000/callback`.
4. Run:

```bash
npx -y google-health-mcp-unofficial setup --scope-preset full
npx -y google-health-mcp-unofficial auth
npx -y google-health-mcp-unofficial doctor
```

Choose a smaller OAuth consent surface when you only need one domain:

```bash
npx -y google-health-mcp-unofficial setup --scope-preset basic
npx -y google-health-mcp-unofficial setup --scope-preset activity
npx -y google-health-mcp-unofficial setup --scope-preset sleep
npx -y google-health-mcp-unofficial setup --scope-preset full
```

After auth, validate and debug with:

```bash
npx -y google-health-mcp-unofficial doctor --fix
npx -y google-health-mcp-unofficial doctor --live
npx -y google-health-mcp-unofficial support --redacted
```

MCP config:

```json
{
  "mcpServers": {
    "google_health": {
      "command": "npx",
      "args": ["-y", "google-health-mcp-unofficial"]
    }
  }
}
```

## What To Try First

Ask your MCP client to call:

- `google_health_connection_status`
- `google_health_data_inventory`
- `google_health_privacy_audit`
- `google_health_daily_summary`

## Good Beta Feedback

Open an issue if any of these happen:

- OAuth setup is confusing or fails in a client-specific way.
- A Fitbit, Pixel Watch or Google Health data type is missing from the inventory.
- A tool returns too much personal context for the default structured privacy mode.
- A filter expression from the Google Health docs does not work as expected.

Run `google-health-mcp-server support --redacted` and paste that bundle when possible. Do not paste OAuth tokens, client secrets or personal health measurements into public issues.

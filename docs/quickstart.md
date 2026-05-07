# Quickstart

1. Create a Google Cloud OAuth web client.
2. Enable Google Health API.
3. Add redirect URI `http://127.0.0.1:3000/callback`.
4. Run:

```bash
npx -y google-health-mcp-unofficial setup
npx -y google-health-mcp-unofficial auth
npx -y google-health-mcp-unofficial doctor
```

MCP config:

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

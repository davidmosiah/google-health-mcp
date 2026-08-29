---
name: google-health
description: >
  Unofficial Google Health Connect data for AI agents. Prefer MCP tools if connected; otherwise the package CLI.
  Use when the user wants Google Health data or actions through an agent.
---

# Google Health — skill or MCP

Same binary either way. Do not duplicate the API client.

## Choose a surface

**MCP** — tools appear natively after stdio/HTTP config:

```json
{ "mcpServers": { "google-health": { "command": "npx", "args": ["-y", "google-health-mcp-unofficial"] } } }
```

Do not put mutation flags in that snippet.

**Skill / CLI** — no MCP client required. Same tools:

```bash
npx -y google-health-mcp-unofficial call google_health_connection_status --json '{}'
```

If MCP tools named `google_*` are already available, use them. Do not also shell out.

## Loop

1. Call `google_health_connection_status` (or `doctor --json` when that exists).
2. Use read tools as asked.
3. Stop on `USER_ACTION_REQUIRED`. Do not invent env flags. Do not enable mutations from this skill.

## Never

- Paste tokens into git, chat logs, or the prompt
- Copy a mutations-enabled assignment into config

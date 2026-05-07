# Google Health MCP Skill

Use this skill whenever a user asks Hermes to inspect Google Health activity, sleep, heart-rate, HRV, weight, nutrition, daily summaries or weekly summaries.

Rules:

- Start with `mcp_google_health_google_health_connection_status`.
- Prefer `mcp_google_health_google_health_daily_summary` and `mcp_google_health_google_health_weekly_summary` before low-level endpoint calls.
- Treat Google Health data as sensitive. Do not request raw payloads unless the user explicitly asks.
- Do not diagnose or treat medical conditions.
- Reload MCP with `/reload-mcp` or `hermes mcp test google-health`; do not restart the gateway for normal data access.

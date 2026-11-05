---
name: google-health-mcp
description: >-
  Read the user's Fitbit and Pixel Watch data through the Google Health API v4 via the local google-health MCP server. Use when the user asks about Google Health, Pixel Watch or Fitbit-through-Google steps, heart rate, sleep or activity, or a daily summary. Starts with connection status and data inventory, uses synthetic demo data before OAuth, and never asks for secrets in chat.
---

# Google Health

MCP server `google-health` from the `google-health-mcp-unofficial@0.8.0` npm package, run locally through `npx`. It reads steps, heart rate, sleep, activity and body data from Fitbit and Pixel Watch devices. Data source: the official Google Health API v4 (Fitbit and Pixel Watch data) with Google OAuth 2.0.

## Workflow

1. Start with `google_health_connection_status`. Then pick what fits the question: `google_health_data_inventory`, `google_health_daily_summary`.
2. If `google_health_connection_status` reports the connector is not ready, call `google_health_demo` for clearly labelled synthetic data so the user sees the shape of the answer, then give them the setup commands below to run in their own terminal.
3. Lead with the answer to the user's question, then the two or three numbers that support it, with dates. Say when data is missing or stale instead of filling gaps.

## Setup (the user runs this in a terminal, not in chat)

```bash
npx -y google-health-mcp-unofficial@0.8.0 setup --client generic
npx -y google-health-mcp-unofficial@0.8.0 auth
npx -y google-health-mcp-unofficial@0.8.0 doctor
```

`setup` asks for the Google Health developer app client ID and secret and saves them locally (`--client generic` because this plugin already registers the server with Hermes); `auth` opens the Google Health consent page in the browser and stores the OAuth tokens under `~/.google-health-mcp/` with 0600 permissions; `doctor` confirms readiness.

## Safety

- Never ask the user to paste client secrets, passwords, tokens or MFA codes into the chat; setup happens in their terminal.
- Tools that change local state: google_health_profile_update (local profile only), google_health_exchange_code (stores OAuth tokens locally). Use them only when the user asks.
- Destructive: google_health_revoke_access (revokes the Google Health grant and deletes local tokens). Confirm with the user first.
- Not medical advice: the data supports personal reflection and planning, not diagnosis or treatment. Point the user to a clinician for symptoms, medication or anything urgent.

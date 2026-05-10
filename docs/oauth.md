# OAuth

Google Health MCP uses Google OAuth 2.0:

- Authorization URL: `https://accounts.google.com/o/oauth2/v2/auth`
- Token URL: `https://oauth2.googleapis.com/token`
- API base URL: `https://health.googleapis.com`

Recommended local redirect URI:

```text
http://127.0.0.1:3000/callback
```

Tokens are saved at `~/.google-health-mcp/tokens.json` with user-only permissions.

## Scope Presets

Use `setup --scope-preset <name>` to choose the smallest useful read-only scope set:

- `basic` - profile and settings
- `activity` - profile, settings, activity and health metrics
- `sleep` - profile, settings and sleep
- `full` - all recommended read-only scopes

Advanced users can pass `--scopes` with a comma- or space-separated Google Health scope list.

## Diagnostics

- `doctor --fix` repairs local file permissions for config and token files.
- `doctor --live` calls safe identity/profile/settings endpoints after auth to prove the API is reachable.
- `support --redacted` creates a safe GitHub issue bundle without secrets or health data.

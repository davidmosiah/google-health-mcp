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

## Auth Flows

`auth` picks a flow based on the host:

| Flow | When | What happens |
| --- | --- | --- |
| Local callback | Desktop with a browser | Opens the browser, catches the redirect on `127.0.0.1` |
| Manual paste | Headless host (auto-detected or `--manual`) | Prints the URL; you paste the redirect back |
| Non-interactive | `--code "<redirect-url-or-code>"` | Exchanges a code you already obtained |

Headless detection uses, in order: `GOOGLE_HEALTH_HEADLESS` (`1`/`0` forces either flow),
`SSH_CONNECTION`/`SSH_TTY`/`SSH_CLIENT`, platform, then `DISPLAY`/`WAYLAND_DISPLAY`.
`doctor` reports the result under `headless`.

Manual paste accepts either the full redirect URL or a bare `code` value. The full URL is
preferred — it carries `scope`, so `doctor` can report granted scopes without another call.
The `state` parameter is verified when present.

Flags:

- `--manual` (aliases `--headless`, `--no-browser`) — force the paste flow
- `--local-callback` — force the callback flow on a headless host, e.g. behind
  `ssh -L 3000:127.0.0.1:3000 <host>`
- `--no-open` — keep the callback flow but do not launch a browser
- `--print-url` — print only the authorization URL and exit
- `--code <redirect-url-or-code>` — exchange without prompting

`setup` forwards `--manual` and `--local-callback` to the `auth` step it runs.

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

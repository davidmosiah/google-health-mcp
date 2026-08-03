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
- `full` - recommended read-only scopes (profile, settings, activity, health metrics, sleep, nutrition)
- `clinical` - `full` plus opt-in **ECG** and **irregular-rhythm-notification** scopes (`googlehealth.ecg.readonly`, `googlehealth.irn.readonly`). Not in `full` on purpose — these are sensitive consent surfaces.
- `nutrition-write` - read nutrition + opt-in write scope (only write-capable preset)

Advanced users can pass `--scopes` with a comma- or space-separated Google Health scope list.

```bash
# Re-auth for ECG / irregular rhythm after a MISSING_OAUTH_SCOPE on those types:
npx -y google-health-mcp-unofficial auth --scope-preset clinical
```

## Diagnostics

- `doctor --fix` repairs local file permissions for config and token files.
- `doctor --live` calls safe identity/profile/settings endpoints after auth to prove the API is reachable.
- `support --redacted` creates a safe GitHub issue bundle without secrets or health data.

## Headless hosts (servers, SSH, containers, WSL)

`auth` normally opens a browser and catches the redirect on `127.0.0.1`. On a host
with no browser that cannot work: there is nothing to open, and the redirect would
land on the *browser's* loopback interface, not the server's.

When it detects a headless host — running over SSH, or no `DISPLAY`/`WAYLAND_DISPLAY` —
`auth` switches to pasting the redirect back in. Force it with `--manual`:

```bash
npx -y google-health-mcp-unofficial auth --manual
```

1. Open the printed URL on any device with a browser.
2. Approve access.
3. The browser lands on `http://127.0.0.1:3000/callback?...` and shows a connection error.
   That is expected — nothing is listening on *that* device.
4. Copy the full URL out of the address bar and paste it back into the terminal.

For scripts and provisioning:

```bash
npx -y google-health-mcp-unofficial auth --print-url
npx -y google-health-mcp-unofficial auth --code "http://127.0.0.1:3000/callback?code=..."
```

Force the loopback callback on a headless host (e.g. behind `ssh -L`):

```bash
npx -y google-health-mcp-unofficial auth --local-callback
```

Override detection with `GOOGLE_HEALTH_HEADLESS=1` (force manual) or `=0` (force desktop).


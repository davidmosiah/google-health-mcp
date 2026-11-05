# Google Health — Agent Plugins package

Portable [Agent Plugins](https://agent-plugins.org/) v1 package for
[Hermes Agent](https://github.com/NousResearch/hermes-agent) and other Agent Plugins clients:
the `google-health` MCP server (`google-health-mcp-unofficial@0.8.0` over stdio) plus the `google-health-mcp` workflow skill.

## Install (Hermes Agent)

```bash
hermes plugins install davidmosiah/google-health-mcp/agent-plugin --no-enable
hermes plugins enable google-health-mcp
```

Requires Node.js 20+ (`npx` on PATH). The skill loads as `google-health-mcp:google-health-mcp`.

## Connector setup

```bash
npx -y google-health-mcp-unofficial@0.8.0 setup --client generic
npx -y google-health-mcp-unofficial@0.8.0 auth
npx -y google-health-mcp-unofficial@0.8.0 doctor
```

`setup` asks for the Google Health developer app client ID and secret and saves them locally (`--client generic` because this plugin already registers the server with Hermes); `auth` opens the Google Health consent page in the browser and stores the OAuth tokens under `~/.google-health-mcp/` with 0600 permissions; `doctor` confirms readiness.

## Disclosure

Runs the `google-health-mcp-unofficial@0.8.0` npm package locally over stdio through `npx` (Node.js 20+ required); the package is downloaded from npm on first start. Data source: the official Google Health API v4 (Fitbit and Pixel Watch data) with Google OAuth 2.0. Credentials and OAuth tokens are created by the connector's own `setup`/`auth` commands in the user's terminal and stay on the machine (`~/.google-health-mcp/`); the plugin declares no environment variables and reads no Hermes credentials. Tools that change state: google_health_profile_update (local profile only); google_health_exchange_code (stores OAuth tokens locally); google_health_revoke_access (revokes the Google Health grant and deletes local tokens). The tool set comes from the pinned npm version, not from this repository's source tree.

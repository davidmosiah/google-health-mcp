# Security Policy

Report security issues through GitHub issues if they do not contain secrets. Do not paste OAuth tokens, client secrets, raw GPS exports or private activity payloads.

## Sensitive Data

- Google Health client secret
- OAuth access and refresh tokens
- Raw activity streams
- GPS coordinates, route maps and polylines
- Private activity metadata

## Defaults

- Tokens stay local under `~/.google-health-mcp/tokens.json`.
- Local config is written with `0600` permissions where supported.
- The server is read-only by default.
- GPS/map data is redacted unless explicitly requested.

## Trust Boundary

This package targets a single trusted local OS user. Google OAuth scopes limit
access to Google Health data, but the MCP server does not authenticate or
authorize individual users, agents, API keys or tools. Tool annotations are not
security controls.

The optional HTTP transport is localhost-only by default and does not ship a
Bearer-token authorization layer. Do not expose it on a public or shared
interface without an authenticated gateway, isolated per-user Google OAuth
credentials and an explicit authorization policy. See
[Authorization Model](docs/authorization.md) for the supported boundary and
multi-user requirements.

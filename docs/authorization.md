# Authorization Model

Google Health MCP is designed first for a single user running a local MCP
client. Its current authorization model has two separate boundaries.

## Google account access

Google OAuth authenticates the user to Google Health and limits upstream API
access through Google Health scopes. The `basic`, `activity`, `sleep` and
`full` presets contain read-only scopes. OAuth tokens stay in the local token
store with user-only file permissions and are never returned by MCP tools.

This answers **which Google account and data scopes the connector may use**. It
does not identify or authorize the MCP client, agent or API key calling a tool.

## MCP caller access

The local MCP process trusts the client process that launched or connected to
it. All callers that can reach the same process receive the same registered
tool catalog and use the same local Google OAuth credentials. The server does
not currently implement:

- per-user or per-agent identities;
- API-key policies;
- per-tool RBAC or allow/deny lists;
- separate Google token stores within one server process.

MCP tool annotations such as `readOnlyHint` and `destructiveHint` help clients
present and confirm actions, but they are metadata, not an authorization
boundary.

The connector keeps Google-backed behavior read-only by default. The
`google_health_revoke_access` tool is explicitly destructive because it revokes
Google access and clears the local token. Local profile updates affect the
shared local Delx Wellness profile, not Google Health.

## Transports and isolation

- **stdio (default):** access is inherited from the local OS user and MCP host.
- **HTTP:** binds to `127.0.0.1` by default for local development. It does not
  provide Bearer-token authentication for remote callers. Do not bind it to a
  public or shared interface without an authenticated gateway and an explicit
  authorization policy.

For stronger isolation today, run separate instances under separate OS users
or containers, with separate home directories and Google OAuth grants. Do not
share one token store between mutually untrusted agents.

## Remote or multi-user deployments

A hosted or shared deployment needs an additional layer that:

1. authenticates every MCP caller using the current
   [MCP Authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization);
2. maps the authenticated principal to an isolated downstream Google OAuth
   grant and storage boundary;
3. enforces least-privilege tool and scope policy before tool execution;
4. records security-relevant decisions without logging health payloads or
   OAuth secrets.

That remote, multi-tenant model is not shipped by this package today. Add it
only when a real deployment requires different users or agents to have
different capabilities; it is unnecessary overhead for the intended
single-user local workflow.

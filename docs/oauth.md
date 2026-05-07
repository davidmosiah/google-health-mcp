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

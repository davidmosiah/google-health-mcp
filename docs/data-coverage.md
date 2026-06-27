# Google Health Data Coverage

Use this when contributing to
[issue #3](https://github.com/davidmosiah/google-health-mcp/issues/3).

The connector ships a local catalog captured from the official
[Google Health API data types](https://developers.google.com/health/data-types)
page. The catalog includes the official data type name, kind, operation list,
scope family and the read-only connector operations this MCP can validate.

## Static Plan

Anyone can generate the plan without Google OAuth:

```bash
npx -y google-health-mcp-unofficial coverage --json
```

The static plan does not call Google APIs. It returns the data types and the
read-only operations that should be checked later with a real account.

## Live Read-Only Validation

After setup and OAuth:

```bash
npx -y google-health-mcp-unofficial coverage --live --json --date YYYY-MM-DD
```

To narrow the report:

```bash
npx -y google-health-mcp-unofficial coverage --live --json \
  --date YYYY-MM-DD \
  --data-source-family google-wearables \
  --data-types steps,sleep,heart-rate
```

Live mode calls only read operations:

- `listDataPoints`
- `reconcileDataPoints`
- `dailyRollUp`

It does not include raw Google Health payloads, personal health measurements,
OAuth tokens, client secrets or local file paths. Results are summarized as
operation status plus point-count buckets such as `none`, `single` or
`multiple`.

## MCP Tool

Agents can call:

```text
google_health_data_type_coverage
```

Default mode returns the static plan. Set `live: true` only after the user has
completed OAuth and explicitly asks for live validation.

## Public Issue Rules

Before pasting output into a public issue, review the JSON yourself.

Do not share:

- OAuth access tokens, refresh tokens or token files.
- Google Cloud client secrets.
- Local config paths, token paths or home-directory paths.
- Raw personal health measurements.
- Full API responses containing private health data.

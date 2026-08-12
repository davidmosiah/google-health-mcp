# Real-account coverage report template (proof loop)

Use for [issue #2](https://github.com/davidmosiah/google-health-mcp/issues/2) (or a new issue).
[#21](https://github.com/davidmosiah/google-health-mcp/issues/21) is closed at honest **1/2** —
see [proof-loop-status.md](./proof-loop-status.md).

## Privacy
- Booleans/errors only — no PHI, no names, no raw samples.
- Prefer: `npx -y google-health-mcp-unofficial@0.7.3 coverage --live --json`

## Checklist
- [ ] Package version
- [ ] Account type (Fitbit / Pixel / Android) — no identifiers
- [ ] Paste redacted JSON (success/fail per data type)
- [ ] Note any 403/empty domains

## Local prep complete
CLI + this template ship without a second live account. **Second live report itself is external.**

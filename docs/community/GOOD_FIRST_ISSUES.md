# Good first issues (maintainer seed)

These are intentionally small. File on GitHub as `good first issue` when ready.

1. **Docs: data type table one-liner** — Add a one-line agent tip next to each slug in `docs/data-coverage.md` (no code).
2. **Fixture: invalid civil date message** — Assert daily_rollup rejects `2026-02-30` with the shipped error string (extend `scripts/endpoint-contract-test.mjs`).
3. **i18n-ready error envelope** — Document the stable `error.code` / `error.message` shape agents should parse (docs only).

Do not invent new MCP tools for these.

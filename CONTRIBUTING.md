# Contributing

Thanks for improving Google Health MCP Unofficial.

Before opening a PR:

```bash
npm install
npm test
```

Guidelines:

- Use only official Google Health API endpoints.
- Keep default behavior read-only.
- Treat GPS data as sensitive.
- Do not add write/upload tools without explicit safety gates.
- Do not log or return OAuth tokens.
- Update docs and tests with behavior changes.

## Planned: nutrition write

The `log_nutrition` write tool is **not shipped yet**, but its supporting rails already live in the
codebase so a contributor (or a follow-up PR) can wire it without re-architecting anything. This is
intentionally opt-in, dry-run-by-default, and gated behind explicit user intent and a dedicated
write scope.

### Existing rails

| Concern | Location |
| --- | --- |
| Typed input contract | `LogNutritionInputSchema` in `src/schemas/common.ts` |
| Safety gate | `checkRemoteWriteGate` / `isLiveWriteAuthorized` in `src/services/remote-write-gate.ts` |
| Nutrient resolution | `estimateMeal` / `nutrientsForGrams` in `src/services/nutrition-normalize.ts` |
| v4 DataPoint body | `buildNutritionDataPointBody` in `src/services/google-v4-nutrition-datapoint.ts` |
| HTTP create | `client.createNutritionDataPoint(body)` in `src/services/google-health-client.ts` |
| Write scope | `GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE` in `src/constants.ts` (excluded from `DEFAULT_SCOPES`) |
| Scope preset | `nutrition-write` in `src/services/scope-presets.ts` |

### Wiring plan

Register the tool in `src/tools/google-health-tools.ts` (at the marked seam, after
`google_health_onboarding`) and have its handler:

1. `checkRemoteWriteGate({ explicit_user_intent, dry_run, granted_scopes }, { response_format, title: "Log Nutrition" })`.
2. Resolve nutrients via `estimateMeal()` / `nutrientsForGrams()`.
3. Build the body with `buildNutritionDataPointBody()`.
4. If `isLiveWriteAuthorized()` → `client.createNutritionDataPoint(body)`; otherwise return the dry-run body.
5. Return via `makeResponse(...)` / `makeError(...)`, mirroring `google_health_profile_update`.

Annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }`
(`openWorldHint` is **true** here because it talks to Google, unlike `profile_update`; this matches
`google_health_exchange_code`).

When the tool ships, also add `google_health_list_data_types`-style metadata updates:
`log_nutrition` to `STANDARD_TOOLS` in `src/services/agent-manifest.ts` (alphabetical), the smoke
test's `expectedTools` in `scripts/smoke-tools.mjs`, and flip `mutating_tools.enabled` in the agent
manifest.

### TO-VERIFY before any live POST

The Google Health v4 **create** surface is not exercised anywhere in this repo — the existing
`:rollUp` / `:dailyRollUp` / `:reconcile` POSTs are queries, not mutations, so the create envelope is
provisional (and `buildNutritionDataPointBody` flags this via `_to_verify`). Before wiring a real
write, confirm against the [REST reference](https://developers.google.com/health/reference/rest),
[data types](https://developers.google.com/health/data-types) and
[scopes](https://developers.google.com/health/scopes):

1. Create verb/path — RESTful `POST /v4/users/me/dataTypes/{dataType}/dataPoints` vs a `:create` / `:batchCreate` custom method.
2. Nutrition data-type slug (kebab) + value field schema + units (energy may be kJ, not kcal).
3. DataPoint envelope: `originDataSource` / data-source registration, and `startTime`/`endTime` vs civil `{date,time}`.
4. Whether a `validateOnly` / dry-run query param exists (drives `live-check.ts` behavior).
5. The exact write-scope string in `src/constants.ts`.

The `mg → g` sodium unit shim in `google-v4-nutrition-datapoint.ts` is already verified (inverse of
the Open Food Facts mapping); only the envelope, path, slug and energy unit remain open.

## Agent-first contributions

This package is designed for **AI agents** as first-class clients (MCP stdio / HTTP).

### Before you open a PR

1. Run `npm test` from the repo root (must exit 0).
2. Prefer a **contract test** that exercises the real shipped path (schema, client, or smoke), not a re-implementation of the fix.
3. Do **not** commit `.env`, token caches, OAuth secrets, or raw health exports.
4. Keep discovery tools intact: `google_health_agent_manifest`, `google_health_connection_status`, capabilities, and privacy modes.

### First call for agents

```bash
npx -y google-health-mcp-unofficial@0.5.4 doctor
# or MCP tools: google_health_agent_manifest → google_health_connection_status
```

### Privacy

- Default to non-raw privacy modes.
- Never log OAuth tokens or personal measurements in tests or fixtures.
- Use redacted coverage reports for real-account validation issues.

### Scoring

We aim for **mcp-scorecard ≥ 90** offline:

```bash
npx -y mcp-scorecard@0.5.3 .
```

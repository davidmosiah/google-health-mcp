<!-- delx-wellness header v2 -->
<h1 align="center">Google Health MCP</h1>

<div align="center">
  <img src="assets/banner.png" alt="Google Health MCP — Google Health MCP for AI agents" width="85%" />
</div>

<h3 align="center">
  Read user-authorized Google Health API v4 data &mdash; Fitbit, Pixel Watch and partners &mdash; locally via OAuth. <strong>Beta</strong>.<br>
  Local-first MCP server &mdash; <strong>tokens never leave your machine</strong>.
</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/google-health-mcp-unofficial"><img src="https://img.shields.io/npm/v/google-health-mcp-unofficial?style=for-the-badge&labelColor=0F172A&color=10B981&logo=npm&logoColor=white" alt="npm version" /></a>
  <a href="https://github.com/davidmosiah/google-health-mcp/releases/latest"><img src="https://img.shields.io/github/v/release/davidmosiah/google-health-mcp?style=for-the-badge&labelColor=0F172A&color=2563EB&logo=github" alt="GitHub release" /></a>
  <a href="https://www.npmjs.com/package/google-health-mcp-unofficial"><img src="https://img.shields.io/npm/dm/google-health-mcp-unofficial?style=for-the-badge&labelColor=0F172A&color=0EA5A3&logo=npm&logoColor=white" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/LICENSE-MIT-22C55E?style=for-the-badge&labelColor=0F172A" alt="License MIT" /></a>
  <a href="https://wellness.delx.ai/connectors/google-health"><img src="https://img.shields.io/badge/SITE-wellness.delx.ai-0EA5A3?style=for-the-badge&labelColor=0F172A" alt="Site" /></a>
</p>

<p align="center">
  <a href="https://github.com/davidmosiah/google-health-mcp/stargazers"><img src="https://img.shields.io/github/stars/davidmosiah/google-health-mcp?style=for-the-badge&labelColor=0F172A&color=FBBF24&logo=github" alt="GitHub stars" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/BUILT_FOR-MCP-7C3AED?style=for-the-badge&labelColor=0F172A" alt="Built for MCP" /></a>
  <a href="https://github.com/davidmosiah/delx-wellness/blob/main/docs/release-index.md"><img src="https://img.shields.io/badge/VERIFIED-release_index-0EA5A3?style=for-the-badge&labelColor=0F172A" alt="Verified release index" /></a>
  <a href="https://github.com/davidmosiah/delx-wellness-hermes"><img src="https://img.shields.io/badge/HERMES-one--command_setup-10B981?style=for-the-badge&labelColor=0F172A" alt="Hermes one-command setup" /></a>
  <a href="https://github.com/davidmosiah/delx-wellness"><img src="https://img.shields.io/badge/Google%20Health-4285F4?style=for-the-badge&labelColor=0F172A&logoColor=white" alt="Google Health" /></a>
</p>

> ⚡ **One-command install** with [Delx Wellness for Hermes](https://github.com/davidmosiah/delx-wellness-hermes):
> `npx -y delx-wellness-hermes setup` &mdash; preconfigures this connector and the other 8 in a dedicated Hermes profile.
>
> Or wire it standalone into Claude Desktop / Cursor / ChatGPT Desktop &mdash; see the install section below.

---

<!-- /delx-wellness header v2 -->

# Google Health MCP

**Local-first MCP server that gives your AI agent user-authorized Google Health API v4 data — Fitbit, Pixel Watch and partners — over OAuth.**

- **Install one connector** — `npx -y google-health-mcp-unofficial setup`
- **Run it in** Claude · Cursor · ChatGPT · Hermes · OpenClaw — see the [client examples](https://github.com/davidmosiah/delx-wellness/tree/main/examples).
- **Local-first** — your tokens never leave your machine ([privacy](#privacy--what-runs-offline)).
- **Which connector should I use?** — see the [front-door guide](https://github.com/davidmosiah/delx-wellness#which-connector-should-i-use).

> **Beta status:** Google Health API v4 is live for builders but still evolving. Google's release notes show scope and data-type changes continuing after launch, so this connector stays in early beta and points testers to safe read-only validation paths before public production use.

> **Unofficial project.** Not affiliated with, endorsed by or supported by Google, Fitbit or Alphabet. Not a medical device. Not medical advice.

## Why this exists

Google Health API is the successor to Fitbit Web API: new OAuth, new base URL, v4 endpoint schema, standardized data types, reconciled streams and rollups.

This MCP gives agents a clean way to discover the API, check setup, authenticate locally and query data without pasting tokens into prompts or agent configs.

## Quickstart in 60 seconds

Create a Google Cloud OAuth client, enable the Google Health API, and add the redirect `http://127.0.0.1:3000/callback`. Then:

```bash
npx -y google-health-mcp-unofficial setup --scope-preset full   # writes local config
npx -y google-health-mcp-unofficial auth                        # OAuth, tokens saved locally
npx -y google-health-mcp-unofficial doctor                      # verifies you're ready
```

`doctor --live` calls safe Google Health identity/profile/settings endpoints after auth to prove the API is reachable — the connection proof for this beta. Full install details (scope presets, MFA, recovery) are in the [Install section](#install) below.

## Try it with your agent

Three things to ask first, based on tools this connector actually ships:

```text
Use google_health_connection_status to check setup, then run
google_health_data_inventory. Tell me which Google Health domains
and scopes I have authorized.
```

```text
Call google_health_daily_summary for today, then google_health_weekly_summary.
Separate observed data from suggestions and stay non-medical.
```

```text
Run google_health_privacy_audit, then summarize exactly what is stored
locally and what would be sent to Google on the next call.
```

## Tools

Start here:

- `google_health_connection_status` — local config, token, scope and client readiness
- `google_health_data_inventory` — supported domains, scopes, data type naming and agent flow
- `google_health_data_type_coverage` — static coverage plan, or explicit live read-only validation for issue #3
- `google_health_daily_summary` — daily beta summary from rollups and reconciled streams
- `google_health_weekly_summary` — weekly beta review
- `google_health_privacy_audit` — what is stored locally and what is sent to Google

The full tool catalog — Google Health API methods, agent manifest, diagnostics and data-type naming notes (kebab-case endpoints, snake_case filters, source families) — lives in [docs/tools.md](docs/tools.md).

## Privacy & what runs offline

- OAuth tokens are stored locally at `~/.google-health-mcp/tokens.json` with `0600` permissions.
- Secrets can live in `~/.google-health-mcp/config.json` or `GOOGLE_HEALTH_*` environment variables.
- Tools never return access tokens, refresh tokens or client secrets.
- `GOOGLE_HEALTH_PRIVACY_MODE=structured` is the default; `raw` mode is explicit and should be used only for debugging or deep analysis.
- `support --redacted` prints a copy-paste support bundle for GitHub issues without tokens, secrets, local paths or health measurements.
- `support --feedback --json` prints an anonymous setup-feedback bundle for beta testers and MCP client reports.
- `coverage --live --json` prints only redacted data-type status and point-count buckets; it never includes raw Google Health payloads.

## See the full agent demo →

Want to see an agent actually reason over this connector alongside the rest of the stack? The shared, reproducible demo answers the anchor question **"Should I train hard today?"**:

```bash
npx -y delx-living-body demo
```

`delx-living-body` composes whatever connectors it detects locally with rule-based (offline) synthesis — readiness-first and non-medical. For this connector specifically, `npx -y google-health-mcp-unofficial doctor --live` is the local proof that your Google Health auth is wired correctly.

## Beta Testers Wanted

The highest-leverage contribution right now is real setup feedback from Fitbit, Pixel Watch, Android and Google Health API v4 users.

If you can test with a real account:

- Run `npx -y google-health-mcp-unofficial doctor` and confirm the OAuth flow is clear.
- Run `npx -y google-health-mcp-unofficial support --feedback --json` and paste the anonymous bundle into issue #4.
- Run `npx -y google-health-mcp-unofficial coverage --json` for the static issue #3 plan.
- After OAuth, run `npx -y google-health-mcp-unofficial coverage --live --json` and paste the reviewed, redacted report into issue #3.
- Try `google_health_connection_status`, `google_health_data_inventory` and `google_health_daily_summary` from your MCP client.
- Open an issue for missing data types, confusing setup steps, client-specific friction or privacy concerns.
- Do **not** paste OAuth tokens, client secrets, local paths or personal health measurements into public issues.

Useful links:

- [Beta testers wanted](https://github.com/davidmosiah/google-health-mcp/issues/2)
- [Data coverage validation](https://github.com/davidmosiah/google-health-mcp/issues/3)
- [MCP client setup feedback](https://github.com/davidmosiah/google-health-mcp/issues/4)
- [Beta feedback guide](docs/beta-feedback.md)
- [Data coverage harness](docs/data-coverage.md)
- [Anonymous setup feedback](docs/setup-feedback.md)
- [Demo](docs/demo.md)
- [Discovery kit](docs/discovery.md)

## Install

Create a Google Cloud OAuth client, enable the Google Health API, and add the local redirect:

```text
http://127.0.0.1:3000/callback
```

Then run:

```bash
npx -y google-health-mcp-unofficial setup --scope-preset full
npx -y google-health-mcp-unofficial auth
npx -y google-health-mcp-unofficial doctor
```

Scope presets keep OAuth consent easier to reason about — `basic`, `activity`, `sleep` and `full`. The full preset list, the exact read-only scope URLs and the OAuth endpoints live in [docs/oauth.md](docs/oauth.md).

If setup gets stuck:

```bash
npx -y google-health-mcp-unofficial doctor --fix       # repairs local config/token permissions (chmod 600 where supported)
npx -y google-health-mcp-unofficial doctor --live      # calls safe identity/profile/settings endpoints to prove the API is reachable
npx -y google-health-mcp-unofficial coverage --live --json # redacted read-only data-type coverage for issue #3
npx -y google-health-mcp-unofficial support --redacted # copy-paste support bundle, no tokens/secrets/measurements
npx -y google-health-mcp-unofficial support --feedback --json # anonymous setup feedback for issue #4
```

Standalone MCP config:

```json
{
  "mcpServers": {
    "google_health": {
      "command": "npx",
      "args": ["-y", "google-health-mcp-unofficial"]
    }
  }
}
```

## Hermes

```bash
npx -y google-health-mcp-unofficial setup --client hermes --no-auth
npx -y google-health-mcp-unofficial auth
npx -y google-health-mcp-unofficial doctor --client hermes --fix
npx -y google-health-mcp-unofficial doctor --client hermes --live
hermes mcp test google_health
```

After config changes, use `/reload-mcp` or `hermes mcp test google_health`. Do not restart the gateway for normal data access.

## Development

```bash
git clone https://github.com/davidmosiah/google-health-mcp.git
cd google-health-mcp
npm install
npm test
```

## Links

- Google Health API: https://developers.google.com/health
- Release notes: https://developers.google.com/health/release-notes
- REST reference: https://developers.google.com/health/reference/rest
- Scopes: https://developers.google.com/health/scopes
- Data types: https://developers.google.com/health/data-types
- Migration guide: https://developers.google.com/health/migration
- Delx Wellness registry: https://github.com/davidmosiah/delx-wellness

<!-- delx-wellness see-also -->

## See also

The full [Delx Wellness](https://wellness.delx.ai) connector library:

| Provider | Package | Repo |
|---|---|---|
| WHOOP | [`whoop-mcp-unofficial`](https://www.npmjs.com/package/whoop-mcp-unofficial) | [whoop-mcp](https://github.com/davidmosiah/whoop-mcp) |
| Oura | [`oura-mcp-unofficial`](https://www.npmjs.com/package/oura-mcp-unofficial) | [ouramcp](https://github.com/davidmosiah/ouramcp) |
| Garmin | [`garmin-mcp-unofficial`](https://www.npmjs.com/package/garmin-mcp-unofficial) | [garmin-mcp](https://github.com/davidmosiah/garmin-mcp) |
| Strava | [`strava-mcp-unofficial`](https://www.npmjs.com/package/strava-mcp-unofficial) | [strava-mcp](https://github.com/davidmosiah/strava-mcp) |
| Fitbit | [`fitbit-mcp-unofficial`](https://www.npmjs.com/package/fitbit-mcp-unofficial) | [fitbitmcp](https://github.com/davidmosiah/fitbitmcp) |
| Withings | [`withings-mcp-unofficial`](https://www.npmjs.com/package/withings-mcp-unofficial) | [withingsmcp](https://github.com/davidmosiah/withingsmcp) |
| Apple Health | [`apple-health-mcp-unofficial`](https://www.npmjs.com/package/apple-health-mcp-unofficial) | [apple-health-mcp](https://github.com/davidmosiah/apple-health-mcp) |
| Polar | [`polar-mcp-unofficial`](https://www.npmjs.com/package/polar-mcp-unofficial) | [polarmcp](https://github.com/davidmosiah/polarmcp) |
| Nourish (nutrition) | [`wellness-nourish`](https://www.npmjs.com/package/wellness-nourish) | [wellness-nourish](https://github.com/davidmosiah/wellness-nourish) |

**One-command setup for Hermes** — preconfigures every connector above plus wellness skills + onboarding: [`delx-wellness-hermes`](https://github.com/davidmosiah/delx-wellness-hermes).

<!-- /delx-wellness see-also -->

## 📧 Contact & Support

- 📨 **support@delx.ai** — general questions, integration help, partnerships
- 🐛 **Bug reports / feature requests** — [GitHub Issues](https://github.com/davidmosiah/google-health-mcp/issues)
- 🐦 **Updates** — [@delx369](https://x.com/delx369) on X
- 🌐 **Site** — [wellness.delx.ai](https://wellness.delx.ai)


## License

MIT - see [LICENSE](LICENSE).

import { DEFAULT_SCOPES, GOOGLE_HEALTH_BETA_NOTICE, GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE, NPM_PACKAGE_NAME, PINNED_NPM_PACKAGE, SERVER_VERSION } from "../constants.js";

export const AGENT_CLIENTS = ["generic", "claude", "cursor", "windsurf", "hermes", "openclaw"] as const;
export type AgentClientName = typeof AGENT_CLIENTS[number];

export const HERMES_DIRECT_TOOLS = [
  "mcp_google_health_google_health_agent_manifest",
  "mcp_google_health_google_health_connection_status",
  "mcp_google_health_google_health_data_inventory",
  "mcp_google_health_google_health_daily_summary",
  "mcp_google_health_google_health_weekly_summary",
  "mcp_google_health_google_health_wellness_context"
];

const STANDARD_TOOLS = [
  "google_health_agent_manifest",
  "google_health_cache_status",
  "google_health_capabilities",
  "google_health_connection_status",
  "google_health_daily_rollup",
  "google_health_daily_summary",
  "google_health_data_inventory",
  "google_health_demo",
  "google_health_exchange_code",
  "google_health_get_auth_url",
  "google_health_get_identity",
  "google_health_get_profile",
  "google_health_get_settings",
  // SEAM: add "log_nutrition" here when the write tool ships (keep alphabetical, between
  // get_settings and list_data_points).
  "google_health_list_data_points",
  "google_health_onboarding",
  "google_health_privacy_audit",
  "google_health_profile_get",
  "google_health_profile_update",
  "google_health_quickstart",
  "google_health_reconcile_data_points",
  "google_health_revoke_access",
  "google_health_rollup",
  "google_health_weekly_summary",
  "google_health_wellness_context"
];

const RESOURCES = [
  "google-health://agent-manifest",
  "google-health://capabilities",
  "google-health://inventory",
  "google-health://latest/steps",
  "google-health://profile",
  "google-health://summary/daily",
  "google-health://summary/weekly"
];

export function parseAgentClientName(value: string): AgentClientName {
  return AGENT_CLIENTS.includes(value as AgentClientName) ? value as AgentClientName : "generic";
}

export function buildAgentManifest(client: AgentClientName = "generic") {
  return {
    project: "google-health-mcp-unofficial",
    mcp_name: "io.github.davidmosiah/google-health-mcp",
    client,
    unofficial: true,
    status: "beta",
    beta_notice: GOOGLE_HEALTH_BETA_NOTICE,
    package: {
      name: NPM_PACKAGE_NAME,
      version: SERVER_VERSION,
      install_command: `npx -y ${NPM_PACKAGE_NAME}`,
      pinned_install_command: `npx -y ${PINNED_NPM_PACKAGE}`,
      binary: "google-health-mcp-server"
    },
    oauth: {
      provider: "Google OAuth 2.0 for Google Health API v4",
      redirect_uri: "http://127.0.0.1:3000/callback",
      scopes: DEFAULT_SCOPES,
      token_storage: "~/.google-health-mcp/tokens.json with 0600 permissions",
      secret_storage: "~/.google-health-mcp/config.json or GOOGLE_HEALTH_* environment variables; never print secrets"
    },
    recommended_first_calls: [
      "google_health_profile_get",
      "google_health_quickstart",
      "google_health_demo",
      "google_health_connection_status",
      "google_health_wellness_context",
      "google_health_daily_summary"
    ],
    standard_tools: STANDARD_TOOLS,
    resources: RESOURCES,
    mutating_tools: {
      enabled: false, // FOUNDATION present, tool not yet registered
      write_scope: GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE,
      scope_preset: "nutrition-write",
      policy: "Opt-in only. Requires explicit_user_intent=true and defaults to dry-run."
    },
    hermes: {
      config_path: "~/.hermes/config.yaml",
      skill_path: "~/.hermes/skills/google-health-mcp/SKILL.md",
      tool_name_prefix: "mcp_google_health_",
      common_tool_names: HERMES_DIRECT_TOOLS,
      recommended_config: hermesConfigSnippet(),
      use_direct_tools: true,
      avoid_terminal_workarounds: true,
      no_gateway_restart_for_data_access: true,
      reload_after_config_change: "/reload-mcp or hermes mcp test google_health",
      doctor_command: "npx -y google-health-mcp-unofficial doctor --client hermes --json"
    },
    agent_rules: [
      "Call google_health_connection_status and google_health_data_inventory before Google Health data tools.",
      "If setup is incomplete, guide the user through Google Cloud setup, local OAuth auth and doctor instead of guessing token state.",
      "Treat Google Health data as sensitive. Do not expose raw payloads unless the user asks for raw mode.",
      "Use data types in kebab case in endpoint tools, and snake_case names in filter expressions.",
      "For Hermes, do not restart the gateway for normal Google Health data access; reload MCP instead.",
      "Do not provide medical diagnosis or treatment instructions. Frame outputs as health/training context.",
      "Nutrition logging is a mutating, opt-in tool requiring explicit_user_intent=true, the nutrition-write scope, and dry-run-by-default. It is not enabled until the log_nutrition tool ships."
    ],
    troubleshooting: [
      { symptom: "missing GOOGLE_HEALTH_CLIENT_ID / GOOGLE_HEALTH_CLIENT_SECRET / GOOGLE_HEALTH_REDIRECT_URI", action: "Run `google-health-mcp-server setup` or set GOOGLE_HEALTH_* env vars after enabling Google Health API in Google Cloud." },
      { symptom: "401 or expired token", action: "Run `google-health-mcp-server auth` again; tokens refresh automatically when refresh_token is present." },
      { symptom: "permission or insufficient scope", action: "Re-authorize with the read-only Google Health scopes returned by google_health_data_inventory." },
      { symptom: "Hermes configured but tools unavailable", action: "Run `/reload-mcp` or `hermes mcp test google_health`; do not restart gateway for normal reload." }
    ],
    links: {
      github: "https://github.com/davidmosiah/google-health-mcp",
      docs: "https://wellness.delx.ai/connectors/google-health",
      npm: "https://www.npmjs.com/package/google-health-mcp-unofficial",
      google_health_docs: "https://developers.google.com/health",
      google_health_reference: "https://developers.google.com/health/reference/rest",
      google_cloud_console: "https://console.cloud.google.com/apis/library/health.googleapis.com"
    }
  };
}

export function formatAgentManifestMarkdown(manifest: ReturnType<typeof buildAgentManifest>): string {
  return `# Google Health MCP Agent Manifest

Unofficial: ${manifest.unofficial}
Status: ${manifest.status}
Package: \`${manifest.package.name}\` v${manifest.package.version}
Install: \`${manifest.package.install_command}\`
Pinned install: \`${manifest.package.pinned_install_command}\`

## OAuth
Provider: ${manifest.oauth.provider}
Redirect URI: \`${manifest.oauth.redirect_uri}\`
Scopes:
${manifest.oauth.scopes.map((scope) => `- \`${scope}\``).join("\n")}
Tokens: ${manifest.oauth.token_storage}

## First Calls
${manifest.recommended_first_calls.map((tool) => `- \`${tool}\``).join("\n")}

## Hermes
Config: \`${manifest.hermes.config_path}\`
Skill: \`${manifest.hermes.skill_path}\`
Reload: \`${manifest.hermes.reload_after_config_change}\`
Direct tools:
${manifest.hermes.common_tool_names.map((tool) => `- \`${tool}\``).join("\n")}

## Beta Notice
${manifest.beta_notice}

## Agent Rules
${manifest.agent_rules.map((rule) => `- ${rule}`).join("\n")}
`;
}

export function hermesConfigSnippet(): string {
  return `mcp_servers:\n  google_health:\n    command: npx\n    args:\n      - -y\n      - ${PINNED_NPM_PACKAGE}\n    timeout: 120\n    connect_timeout: 60\n    sampling:\n      enabled: false`;
}

export function hermesSkillMarkdown(): string {
  return `# Google Health MCP Skill

Use this skill whenever a user asks Hermes to inspect Google Health API v4 activity, sleep, heart, body, nutrition, daily summaries or weekly summaries through the Google Health MCP.

## Rules
- Start with \`mcp_google_health_google_health_connection_status\`.
- Prefer \`mcp_google_health_google_health_data_inventory\`, \`mcp_google_health_google_health_daily_summary\` and \`mcp_google_health_google_health_weekly_summary\` before low-level endpoint calls.
- Treat Google Health data as sensitive. Do not request raw payloads unless the user explicitly asks.
- Use kebab-case data types in endpoints and snake_case data type names in filters.
- Do not diagnose or treat medical conditions.
- Reload MCP with \`/reload-mcp\` or \`hermes mcp test google_health\`; do not restart the gateway for normal data access.
`;
}

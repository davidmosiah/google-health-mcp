import { DEFAULT_SCOPES, GOOGLE_HEALTH_BETA_NOTICE } from "../constants.js";

export function buildCapabilities() {
  return {
    project: "google-health-mcp-unofficial",
    mcp_name: "io.github.davidmosiah/google-health-mcp",
    creator: { name: "David Mosiah", github: "https://github.com/davidmosiah" },
    unofficial: true,
    status: "beta",
    beta_notice: GOOGLE_HEALTH_BETA_NOTICE,
    api_boundary: {
      source: "Official Google Health API v4 with Google OAuth 2.0",
      raw_definition: "Raw means the full JSON response returned by supported Google Health API v4 endpoints under https://health.googleapis.com.",
      does_not_include: [
        "Google Fit REST API legacy endpoints",
        "Android-only Health Connect on-device storage",
        "raw accelerometer/device telemetry",
        "private Google endpoints",
        "write/upload actions by default",
        "medical diagnosis or treatment guidance"
      ]
    },
    auth_model: {
      type: "Google OAuth 2.0 authorization code with offline refresh tokens",
      token_storage: "Local token file with user-only permissions",
      recommended_redirect_uri: "http://127.0.0.1:3000/callback",
      default_scopes: DEFAULT_SCOPES
    },
    privacy_modes: [
      { mode: "summary", use_when: "Default-safe interpretation with identifiers and source details minimized." },
      { mode: "structured", use_when: "Normalized Google Health data points and rollups for agents." },
      { mode: "raw", use_when: "The user explicitly needs upstream Google Health payloads for debugging or deep analysis." }
    ],
    supported_data: [
      { name: "Identity, profile and settings", examples: ["Google Health user id", "legacy Fitbit id presence", "profile", "units", "timezone"], tools: ["google_health_get_identity", "google_health_get_profile", "google_health_get_settings"] },
      { name: "Data point queries", examples: ["steps", "sleep", "heart-rate", "weight", "exercise"], tools: ["google_health_list_data_points", "google_health_reconcile_data_points"] },
      { name: "Daily rollups", examples: ["steps", "distance", "total-calories", "active-zone-minutes", "weight", "daily-resting-heart-rate"], tools: ["google_health_daily_rollup"] },
      { name: "Physical-time rollups", examples: ["hourly steps", "heart-rate windows", "distance windows"], tools: ["google_health_rollup"] },
      { name: "Agent summaries", examples: ["daily summary", "weekly review", "wellness context"], tools: ["google_health_daily_summary", "google_health_weekly_summary", "google_health_wellness_context"] }
    ],
    recommended_agent_flow: [
      "Call google_health_agent_manifest when installing or operating inside a server agent such as Hermes.",
      "Call google_health_connection_status before calling Google Health data tools.",
      "If setup is incomplete, guide the user through Google Cloud setup, OAuth auth and doctor.",
      "Use google_health_data_inventory to pick data types and understand endpoint/filter naming.",
      "Use google_health_daily_summary or google_health_weekly_summary before low-level endpoint tools.",
      "Treat health data as sensitive; avoid raw payloads unless explicitly requested.",
      "Use Google Health as trend context, not medical diagnosis. Escalate symptoms or abnormal vitals to clinicians."
    ],
    client_aliases: {
      hermes: {
        tool_prefix: "mcp_google_health_",
        direct_tools: [
          "mcp_google_health_google_health_agent_manifest",
          "mcp_google_health_google_health_connection_status",
          "mcp_google_health_google_health_data_inventory",
          "mcp_google_health_google_health_daily_summary",
          "mcp_google_health_google_health_weekly_summary"
        ],
        reload_command: "/reload-mcp",
        gateway_restart_required_for_data_access: false
      }
    },
    contribution_paths: [
      "Add real-account fixture coverage as Google Health v4 stabilizes.",
      "Add source-family-specific UX for Pixel Watch, Fitbit and Google first-party sources.",
      "Add webhook/subscriber support after read-only flows are proven.",
      "Add optional write tools only behind explicit opt-in and safety gates."
    ],
    links: {
      github: "https://github.com/davidmosiah/google-health-mcp",
      docs: "https://wellness.delx.ai/connectors/google-health",
      npm: "https://www.npmjs.com/package/google-health-mcp-unofficial",
      google_health_docs: "https://developers.google.com/health",
      google_health_reference: "https://developers.google.com/health/reference/rest",
      google_health_scopes: "https://developers.google.com/health/scopes",
      google_health_data_types: "https://developers.google.com/health/data-types",
      google_cloud_console: "https://console.cloud.google.com/apis/library/health.googleapis.com"
    }
  };
}

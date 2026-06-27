import { platform, arch } from "node:os";
import { NPM_PACKAGE_NAME, SERVER_VERSION } from "../constants.js";
import { buildConnectionStatus, type ConnectionStatus } from "./connection-status.js";
import type { AgentClientName } from "./agent-manifest.js";

export interface SupportReportOptions {
  homeDir: string;
  client?: AgentClientName;
}

export interface SupportReport {
  redacted: true;
  package: {
    name: string;
    version: string;
  };
  runtime: {
    platform: NodeJS.Platform;
    arch: string;
    node: string;
  };
  config: {
    source: ConnectionStatus["config"]["source"];
    required_env: ConnectionStatus["required_env"];
    missing_env: string[];
    redirect_uri: string | undefined;
    automatic_auth_supported: boolean;
    privacy_mode: ConnectionStatus["privacy_mode"];
    cache_enabled: boolean;
  };
  token: {
    exists: boolean;
    readable: boolean;
    secure_permissions?: boolean;
    expired?: boolean;
    has_refresh_token?: boolean;
    scope_status: ConnectionStatus["oauth"]["scope_status"];
    granted_scope_count: number;
    missing_recommended_scope_count: number;
  };
  next_steps: string[];
  issue_body: string;
}

export interface SetupFeedbackReport {
  kind: "google_health_setup_feedback";
  schema_version: 1;
  anonymous: true;
  redacted: true;
  package: SupportReport["package"];
  runtime: {
    platform: NodeJS.Platform;
    arch: string;
    node_major: number;
  };
  setup_state: {
    config_source: ConnectionStatus["config"]["source"];
    env_present: Record<string, boolean>;
    missing_env: string[];
    local_callback_supported: boolean;
    privacy_mode: ConnectionStatus["privacy_mode"];
    cache_enabled: boolean;
  };
  auth_state: {
    token_present: boolean;
    token_readable: boolean;
    token_secure_permissions?: boolean;
    token_expired?: boolean;
    refresh_token_present?: boolean;
    scope_status: ConnectionStatus["oauth"]["scope_status"];
    granted_scope_count: number;
    missing_recommended_scope_count: number;
    activity_tools_ready: boolean;
    profile_tools_ready: boolean;
    nutrition_write_ready: boolean;
  };
  client_state?: {
    client: AgentClientName;
    configured?: boolean;
    package_pinned?: boolean;
    skill_installed?: boolean;
    reload_hint?: string;
  };
  friction_markers: string[];
  reviewer_questions: string[];
  issue_body: string;
}

export async function buildSupportReport(options: SupportReportOptions): Promise<SupportReport> {
  const status = await buildConnectionStatus({ homeDir: options.homeDir, client: options.client, tokenInspection: "metadata" });
  const report: Omit<SupportReport, "issue_body"> = {
    redacted: true,
    package: {
      name: NPM_PACKAGE_NAME,
      version: SERVER_VERSION
    },
    runtime: {
      platform: platform() as NodeJS.Platform,
      arch: arch(),
      node: process.versions.node
    },
    config: {
      source: status.config.source,
      required_env: status.required_env,
      missing_env: status.missing_env,
      redirect_uri: redactRedirectUri(status.redirect_uri),
      automatic_auth_supported: status.automatic_auth_supported,
      privacy_mode: status.privacy_mode,
      cache_enabled: status.cache.enabled
    },
    token: {
      exists: status.token.exists,
      readable: status.token.readable,
      secure_permissions: status.token.secure_permissions,
      expired: status.token.expired,
      has_refresh_token: status.token.has_refresh_token,
      scope_status: status.oauth.scope_status,
      granted_scope_count: status.oauth.granted_scopes.length,
      missing_recommended_scope_count: status.oauth.missing_recommended_scopes.length
    },
    next_steps: redactLocalPaths(status.next_steps)
  };
  return {
    ...report,
    issue_body: supportIssueBody(report)
  };
}

export async function buildSetupFeedbackReport(options: SupportReportOptions): Promise<SetupFeedbackReport> {
  const status = await buildConnectionStatus({ homeDir: options.homeDir, client: options.client, tokenInspection: "metadata" });
  const hermes = status.client_checks?.hermes;
  const report: Omit<SetupFeedbackReport, "issue_body"> = {
    kind: "google_health_setup_feedback",
    schema_version: 1,
    anonymous: true,
    redacted: true,
    package: {
      name: NPM_PACKAGE_NAME,
      version: SERVER_VERSION
    },
    runtime: {
      platform: platform() as NodeJS.Platform,
      arch: arch(),
      node_major: Number(process.versions.node.split(".")[0] ?? 0)
    },
    setup_state: {
      config_source: status.config.source,
      env_present: status.required_env,
      missing_env: status.missing_env,
      local_callback_supported: status.automatic_auth_supported,
      privacy_mode: status.privacy_mode,
      cache_enabled: status.cache.enabled
    },
    auth_state: {
      token_present: status.token.exists,
      token_readable: status.token.readable,
      token_secure_permissions: status.token.secure_permissions,
      token_expired: status.token.expired,
      refresh_token_present: status.token.has_refresh_token,
      scope_status: status.oauth.scope_status,
      granted_scope_count: status.oauth.granted_scopes.length,
      missing_recommended_scope_count: status.oauth.missing_recommended_scopes.length,
      activity_tools_ready: status.oauth.activity_tools_ready,
      profile_tools_ready: status.oauth.profile_tools_ready,
      nutrition_write_ready: status.oauth.nutrition_write_ready
    },
    client_state: options.client ? {
      client: options.client,
      configured: options.client === "hermes" ? hermes?.google_health_server_configured : undefined,
      package_pinned: options.client === "hermes" ? hermes?.package_pinned : undefined,
      skill_installed: options.client === "hermes" ? hermes?.skill_installed : undefined,
      reload_hint: options.client === "hermes" ? "Use /reload-mcp or hermes mcp test google_health after config changes." : undefined
    } : undefined,
    friction_markers: buildFrictionMarkers(status),
    reviewer_questions: [
      "Which MCP client did you test: Claude Desktop, Cursor, Codex, Hermes, OpenClaw, Windsurf or another client?",
      "Which step was unclear: Google Cloud OAuth client, redirect URI, setup, auth, doctor, client reload or tool choice?",
      "Did `doctor`, `doctor --live` or this feedback bundle give enough next-step guidance without exposing secrets?",
      "Did the default structured privacy mode feel safe for your agent workflow?",
      "Which source family are you validating: Fitbit, Pixel Watch, Android, Google sources or another supported source?"
    ]
  };
  return {
    ...report,
    issue_body: setupFeedbackIssueBody(report)
  };
}

export function formatSupportReport(report: SupportReport): string {
  return report.issue_body;
}

export function formatSetupFeedbackReport(report: SetupFeedbackReport): string {
  return report.issue_body;
}

function redactRedirectUri(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "[redacted-invalid-redirect-uri]";
  }
}

function supportIssueBody(report: Omit<SupportReport, "issue_body">): string {
  return [
    "## Google Health MCP support bundle",
    "",
    "This bundle is redacted. It should not contain OAuth tokens, client secrets, or health measurements.",
    "",
    "```json",
    JSON.stringify(report, null, 2),
    "```"
  ].join("\n");
}

function setupFeedbackIssueBody(report: Omit<SetupFeedbackReport, "issue_body">): string {
  return [
    "## Anonymous Google Health MCP setup feedback",
    "",
    "This bundle is redacted and intentionally anonymous. It should not contain OAuth tokens, Google Cloud client secrets, local file paths, raw token files or health measurements.",
    "",
    "```json",
    JSON.stringify(report, null, 2),
    "```",
    "",
    "### Human notes",
    "",
    "- MCP client tested:",
    "- Device/source family:",
    "- Step that was confusing:",
    "- What worked well:",
    "- What should be clearer:"
  ].join("\n");
}

function buildFrictionMarkers(status: ConnectionStatus): string[] {
  const markers: string[] = [];
  if (!status.node.supported) markers.push("node_version_unsupported");
  if (status.missing_env.length) markers.push("missing_oauth_config");
  if (!status.automatic_auth_supported) markers.push("local_callback_not_ready");
  if (!status.token.exists) markers.push("token_missing");
  if (status.token.exists && !status.token.readable) markers.push("token_unreadable");
  if (status.token.secure_permissions === false) markers.push("token_permissions_insecure");
  if (status.token.expired && !status.token.has_refresh_token) markers.push("token_expired_without_refresh");
  if (status.oauth.scope_status === "missing_recommended") markers.push("missing_recommended_scopes");
  if (status.oauth.scope_status === "unknown") markers.push("scope_unknown");
  if (status.client === "hermes" && !status.client_checks?.hermes?.google_health_server_configured) markers.push("hermes_not_configured");
  if (status.client === "hermes" && status.client_checks?.hermes?.package_pinned === false) markers.push("hermes_package_not_pinned");
  if (!markers.length) markers.push("ready_for_beta_validation");
  return markers;
}

function redactLocalPaths(steps: string[]): string[] {
  return steps.map((step) => step
    .replace(/chmod 600\s+\S+/g, "chmod 600 [local-token-path]")
    .replace(/at\s+\/\S+/g, "at [local-path]")
    .replace(/~\/\.google-health-mcp\/tokens\.json/g, "[local-token-path]"));
}

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

export async function buildSupportReport(options: SupportReportOptions): Promise<SupportReport> {
  const status = await buildConnectionStatus({ homeDir: options.homeDir, client: options.client });
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
    next_steps: status.next_steps
  };
  return {
    ...report,
    issue_body: supportIssueBody(report)
  };
}

export function formatSupportReport(report: SupportReport): string {
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

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SCOPES, GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE, PINNED_NPM_PACKAGE } from "../constants.js";
import type { PrivacyMode, GoogleHealthTokenSet } from "../types.js";
import { HERMES_DIRECT_TOOLS, type AgentClientName } from "./agent-manifest.js";
import { loadConfigSources } from "./local-config.js";

type Env = Record<string, string | undefined>;

export interface ConnectionStatusOptions {
  env?: Env;
  homeDir?: string;
  nowMs?: number;
  client?: AgentClientName;
}

export interface ConnectionStatus extends Record<string, unknown> {
  ok: boolean;
  ready_for_google_health_api: boolean;
  client?: AgentClientName;
  node: {
    version: string;
    supported: boolean;
  };
  privacy_mode: PrivacyMode;
  required_env: Record<string, boolean>;
  missing_env: string[];
  redirect_uri?: string;
  automatic_auth_supported: boolean;
  config: {
    source: "env" | "local_config" | "mixed" | "missing";
    path: string;
    exists: boolean;
    secure_permissions?: boolean;
    error?: string;
  };
  token: {
    path: string;
    exists: boolean;
    readable: boolean;
    permissions?: string;
    secure_permissions?: boolean;
    expires_at?: number;
    expired?: boolean;
    has_refresh_token?: boolean;
    scope?: string;
    error?: string;
  };
  oauth: {
    recommended_scopes: string[];
    granted_scopes: string[];
    missing_recommended_scopes: string[];
    scope_status: "ok" | "missing_recommended" | "unknown" | "missing_token";
    activity_tools_ready: boolean;
    profile_tools_ready: boolean;
    nutrition_write_ready: boolean;
  };
  cache: {
    enabled: boolean;
    path: string;
  };
  client_checks?: {
    hermes?: HermesClientCheck;
  };
  next_steps: string[];
}

export interface HermesClientCheck {
  config_path: string;
  config_exists: boolean;
  google_health_server_configured: boolean;
  package_pinned: boolean;
  mcp_reload_confirmation_disabled?: boolean;
  skill_path: string;
  skill_installed: boolean;
  direct_tool_prefix: string;
  expected_direct_tools: string[];
  recommendations: string[];
  error?: string;
}

const REQUIRED_ENV = ["GOOGLE_HEALTH_CLIENT_ID", "GOOGLE_HEALTH_CLIENT_SECRET", "GOOGLE_HEALTH_REDIRECT_URI"];

export async function buildConnectionStatus(options: ConnectionStatusOptions = {}): Promise<ConnectionStatus> {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? homedir();
  const sources = loadConfigSources(env, homeDir);
  const value = (name: keyof typeof sources.values) => sources.values[name];
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const tokenPath = value("GOOGLE_HEALTH_TOKEN_PATH") ?? join(homeDir, ".google-health-mcp", "tokens.json");
  const cachePath = value("GOOGLE_HEALTH_CACHE_PATH") ?? join(homeDir, ".google-health-mcp", "cache.sqlite");
  const redirectUri = value("GOOGLE_HEALTH_REDIRECT_URI");
  const requiredEnv = Object.fromEntries(REQUIRED_ENV.map((name) => [name, Boolean(value(name as keyof typeof sources.values))]));
  const missingEnv = REQUIRED_ENV.filter((name) => !requiredEnv[name]);
  const token = await inspectToken(tokenPath, nowSeconds);
  const oauth = buildOAuthScopeStatus(token);
  const nodeSupported = Number(process.versions.node.split(".")[0] ?? 0) >= 20;
  const automaticAuthSupported = Boolean(redirectUri && isLocalHttpRedirect(redirectUri));
  const tokenUsable = token.exists && token.readable && token.secure_permissions !== false && (token.expired !== true || token.has_refresh_token === true);
  const ready = missingEnv.length === 0 && tokenUsable && oauth.scope_status !== "missing_recommended";
  const ok = ready && nodeSupported;
  const clientChecks = options.client === "hermes" ? { hermes: await inspectHermesClient(homeDir) } : undefined;

  return {
    ok,
    ready_for_google_health_api: ready,
    client: options.client,
    node: {
      version: process.versions.node,
      supported: nodeSupported
    },
    privacy_mode: parsePrivacyMode(value("GOOGLE_HEALTH_PRIVACY_MODE")),
    required_env: requiredEnv,
    missing_env: missingEnv,
    redirect_uri: redirectUri,
    automatic_auth_supported: automaticAuthSupported,
    config: {
      source: sources.source,
      path: sources.local.path,
      exists: sources.local.exists,
      secure_permissions: sources.local.secure_permissions,
      error: sources.local.error
    },
    token,
    oauth,
    cache: {
      enabled: parseBool(value("GOOGLE_HEALTH_CACHE")),
      path: cachePath
    },
    client_checks: clientChecks,
    next_steps: buildNextSteps({ missingEnv, token, nodeSupported, automaticAuthSupported, redirectUri, oauth })
  };
}

function parsePrivacyMode(value: string | undefined): PrivacyMode {
  if (value === "summary" || value === "structured" || value === "raw") return value;
  return "structured";
}

function parseBool(value: string | undefined): boolean {
  return Boolean(value && ["1", "true", "yes", "on", "sqlite"].includes(value.toLowerCase()));
}

function isLocalHttpRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname) && Boolean(url.port);
  } catch {
    return false;
  }
}

async function inspectToken(path: string, nowSeconds: number): Promise<ConnectionStatus["token"]> {
  try {
    const [stat, text] = await Promise.all([fs.stat(path), fs.readFile(path, "utf8")]);
    const permissions = (stat.mode & 0o777).toString(8).padStart(3, "0");
    const securePermissions = process.platform === "win32" ? true : (stat.mode & 0o077) === 0;
    const token = JSON.parse(text) as Partial<GoogleHealthTokenSet>;
    const expiresAt = typeof token.expires_at === "number" ? token.expires_at : undefined;
    return {
      path,
      exists: true,
      readable: true,
      permissions,
      secure_permissions: securePermissions,
      expires_at: expiresAt,
      expired: expiresAt ? expiresAt <= nowSeconds : undefined,
      has_refresh_token: typeof token.refresh_token === "string" && token.refresh_token.length > 0,
      scope: typeof token.scope === "string" ? token.scope : undefined
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { path, exists: false, readable: false };
    return { path, exists: true, readable: false, error: (error as Error).message };
  }
}

async function inspectHermesClient(homeDir: string): Promise<HermesClientCheck> {
  const configPath = join(homeDir, ".hermes", "config.yaml");
  const skillPath = join(homeDir, ".hermes", "skills", "google-health-mcp", "SKILL.md");
  const base: Omit<HermesClientCheck, "recommendations"> = {
    config_path: configPath,
    config_exists: false,
    google_health_server_configured: false,
    package_pinned: false,
    skill_path: skillPath,
    skill_installed: false,
    direct_tool_prefix: "mcp_google_health_",
    expected_direct_tools: HERMES_DIRECT_TOOLS
  };

  try {
    const [config, skillExists] = await Promise.all([
      readOptionalText(configPath),
      existsFile(skillPath)
    ]);
    const configText = config.text ?? "";
    const check = {
      ...base,
      config_exists: config.exists,
      google_health_server_configured: /google-health-mcp-unofficial|google-health-mcp-server|google-health-mcp/.test(configText) && /^\s*google[-_]health\s*:/m.test(configText),
      package_pinned: /google-health-mcp-unofficial@\d+\.\d+\.\d+/.test(configText),
      mcp_reload_confirmation_disabled: config.exists ? /mcp_reload_confirm\s*:\s*false/.test(configText) : undefined,
      skill_installed: skillExists
    };
    return { ...check, recommendations: buildHermesRecommendations(check) };
  } catch (error) {
    const check = { ...base, error: (error as Error).message };
    return { ...check, recommendations: buildHermesRecommendations(check) };
  }
}

async function readOptionalText(path: string): Promise<{ exists: boolean; text?: string }> {
  try {
    return { exists: true, text: await fs.readFile(path, "utf8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false };
    throw error;
  }
}

async function existsFile(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function buildHermesRecommendations(check: Omit<HermesClientCheck, "recommendations">): string[] {
  const recommendations: string[] = [];
  if (!check.config_exists) {
    recommendations.push("Run `google-health-mcp-server setup --client hermes --no-auth` to create a Hermes MCP config and local Hermes skill.");
  } else if (!check.google_health_server_configured) {
    recommendations.push("Add a `google_health` MCP server block to `~/.hermes/config.yaml`.");
  }
  if (check.config_exists && check.google_health_server_configured && !check.package_pinned) {
    recommendations.push(`Pin the Hermes MCP command to \`${PINNED_NPM_PACKAGE}\` to avoid stale npx cache surprises.`);
  }
  if (!check.skill_installed) {
    recommendations.push("Install the Hermes skill at `~/.hermes/skills/google-health-mcp/SKILL.md` so agents prefer direct MCP tools over terminal workarounds.");
  }
  if (check.config_exists && check.mcp_reload_confirmation_disabled !== true) {
    recommendations.push("Optional for lower friction: set `approvals.mcp_reload_confirm: false` if your Hermes policy allows MCP reload without confirmation.");
  }
  recommendations.push("After Hermes config changes, use `/reload-mcp` or `hermes mcp test google_health`; do not run `hermes gateway restart` for normal Google Health data access.");
  return recommendations;
}

function buildOAuthScopeStatus(token: ConnectionStatus["token"]): ConnectionStatus["oauth"] {
  if (!token.exists || !token.readable) {
    return {
      recommended_scopes: DEFAULT_SCOPES,
      granted_scopes: [],
      missing_recommended_scopes: DEFAULT_SCOPES,
      scope_status: "missing_token",
      activity_tools_ready: false,
      profile_tools_ready: false,
      nutrition_write_ready: false
    };
  }

  const grantedScopes = parseScopes(token.scope);
  if (grantedScopes.length === 0) {
    return {
      recommended_scopes: DEFAULT_SCOPES,
      granted_scopes: [],
      missing_recommended_scopes: [],
      scope_status: "unknown",
      activity_tools_ready: false,
      profile_tools_ready: false,
      nutrition_write_ready: false
    };
  }

  const granted = new Set(grantedScopes);
  const missingRecommendedScopes = DEFAULT_SCOPES.filter((scope) => !granted.has(scope));
  return {
    recommended_scopes: DEFAULT_SCOPES,
    granted_scopes: grantedScopes,
    missing_recommended_scopes: missingRecommendedScopes,
    scope_status: missingRecommendedScopes.length === 0 ? "ok" : "missing_recommended",
    activity_tools_ready: hasAnyScope(granted, ["https://www.googleapis.com/auth/googlehealth.activity_and_fitness", "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"]),
    profile_tools_ready: hasAnyScope(granted, ["https://www.googleapis.com/auth/googlehealth.profile", "https://www.googleapis.com/auth/googlehealth.profile.readonly"]),
    nutrition_write_ready: hasAnyScope(granted, [GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE])
  };
}

function parseScopes(scope: string | undefined): string[] {
  if (!scope) return [];
  return Array.from(new Set(scope.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean))).sort();
}

function hasAnyScope(granted: Set<string>, scopes: string[]): boolean {
  return scopes.some((scope) => granted.has(scope));
}

function buildNextSteps(input: {
  missingEnv: string[];
  token: ConnectionStatus["token"];
  nodeSupported: boolean;
  automaticAuthSupported: boolean;
  redirectUri?: string;
  oauth: ConnectionStatus["oauth"];
}): string[] {
  const steps: string[] = [];
  if (!input.nodeSupported) steps.push("Install Node.js 20 or newer.");
  for (const name of input.missingEnv) {
    steps.push(`Set ${name}. Create a Google Cloud OAuth client and enable the Google Health API if needed.`);
  }
  if (input.redirectUri && !input.automaticAuthSupported) {
    steps.push("For one-command auth, set GOOGLE_HEALTH_REDIRECT_URI to a local callback such as http://127.0.0.1:3000/callback.");
  }
  if (!input.token.exists) {
    steps.push("Run `google-health-mcp-server auth` to authorize Google Health and save local tokens.");
  } else if (!input.token.readable) {
    steps.push(`Fix token file readability at ${input.token.path}.`);
  } else if (input.token.secure_permissions === false) {
    steps.push(`Restrict token file permissions with: chmod 600 ${input.token.path}`);
  } else if (input.token.expired && !input.token.has_refresh_token) {
    steps.push("Re-authorize with `google-health-mcp-server auth`; the current token is expired and has no refresh token.");
  }
  if (input.oauth.scope_status === "missing_recommended") {
    steps.push(`Re-authorize with \`google-health-mcp-server auth\` to grant recommended scopes: ${input.oauth.missing_recommended_scopes.join(" ")}.`);
  } else if (input.oauth.scope_status === "unknown" && input.token.exists && input.token.readable) {
    steps.push("Token scope is not recorded locally. If activity or stream tools fail with permission errors, re-authorize with `google-health-mcp-server auth`.");
  }
  if (steps.length === 0) steps.push("Ready. Add this MCP server to your agent and start with google_health_daily_summary.");
  return steps;
}

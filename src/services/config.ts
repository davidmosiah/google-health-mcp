import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SCOPES, GOOGLE_HEALTH_API_BASE_URL } from "../constants.js";
import type { PrivacyMode, GoogleHealthConfig } from "../types.js";
import { loadConfigSources } from "./local-config.js";

interface ConfigOptions {
  env?: Record<string, string | undefined>;
  homeDir?: string;
}

function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function getConfig(options: ConfigOptions = {}): GoogleHealthConfig {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? homedir();
  const sources = loadConfigSources(env, homeDir);
  const value = (name: keyof typeof sources.values) => envValue(env, name) ?? sources.values[name];
  const clientId = value("GOOGLE_HEALTH_CLIENT_ID");
  const clientSecret = value("GOOGLE_HEALTH_CLIENT_SECRET");
  const redirectUri = value("GOOGLE_HEALTH_REDIRECT_URI");
  const tokenPath = value("GOOGLE_HEALTH_TOKEN_PATH") ?? join(homeDir, ".google-health-mcp", "tokens.json");
  const cachePath = value("GOOGLE_HEALTH_CACHE_PATH") ?? join(homeDir, ".google-health-mcp", "cache.sqlite");
  const apiBaseUrl = value("GOOGLE_HEALTH_API_BASE_URL") ?? GOOGLE_HEALTH_API_BASE_URL;
  const scopes = (value("GOOGLE_HEALTH_SCOPES")?.split(/[ ,]+/).filter(Boolean)) ?? DEFAULT_SCOPES;
  const privacyMode = parsePrivacyMode(value("GOOGLE_HEALTH_PRIVACY_MODE"));
  const cacheEnabled = parseBool(value("GOOGLE_HEALTH_CACHE"), false);

  const missing = [
    ["GOOGLE_HEALTH_CLIENT_ID", clientId],
    ["GOOGLE_HEALTH_CLIENT_SECRET", clientSecret],
    ["GOOGLE_HEALTH_REDIRECT_URI", redirectUri]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing required GOOGLE_HEALTH environment variables: ${missing.join(", ")}. ` +
      "Create a Google Cloud OAuth client, enable the Google Health API, and set these variables before using Google Health tools."
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    scopes,
    tokenPath,
    privacyMode,
    cacheEnabled,
    cachePath,
    apiBaseUrl
  };
}

function parsePrivacyMode(value: string | undefined): PrivacyMode {
  if (value === "summary" || value === "structured" || value === "raw") return value;
  return "structured";
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on", "sqlite"].includes(value.toLowerCase());
}

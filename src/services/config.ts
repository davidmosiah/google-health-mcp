import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SCOPES } from "../constants.js";
import type { PrivacyMode, GoogleHealthConfig } from "../types.js";
import { loadConfigSources } from "./local-config.js";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function getConfig(): GoogleHealthConfig {
  const sources = loadConfigSources(process.env, homedir());
  const value = (name: keyof typeof sources.values) => env(name) ?? sources.values[name];
  const clientId = value("GOOGLE_HEALTH_CLIENT_ID");
  const clientSecret = value("GOOGLE_HEALTH_CLIENT_SECRET");
  const redirectUri = value("GOOGLE_HEALTH_REDIRECT_URI");
  const tokenPath = value("GOOGLE_HEALTH_TOKEN_PATH") ?? join(homedir(), ".google-health-mcp", "tokens.json");
  const cachePath = value("GOOGLE_HEALTH_CACHE_PATH") ?? join(homedir(), ".google-health-mcp", "cache.sqlite");
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
    cachePath
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

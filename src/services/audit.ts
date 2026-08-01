import { homedir } from "node:os";
import { join } from "node:path";
import { SERVER_NAME } from "../constants.js";
import type { PrivacyMode } from "../types.js";
import { loadConfigSources } from "./local-config.js";
import { REDACTED_KEY_PATTERNS } from "./redaction.js";
import { GPS_REDACTED_CONTAINER_KEYS, GPS_REDACTED_KEYS, gpsRedactionSelfCheck } from "./privacy.js";

function parsePrivacyMode(value: string | undefined): PrivacyMode {
  if (value === "summary" || value === "structured" || value === "raw") return value;
  return "structured";
}

function parseBool(value: string | undefined): boolean {
  return Boolean(value && ["1", "true", "yes", "on", "sqlite"].includes(value.toLowerCase()));
}

export function buildPrivacyAudit(): Record<string, unknown> {
  const requiredEnv = ["GOOGLE_HEALTH_CLIENT_ID", "GOOGLE_HEALTH_CLIENT_SECRET", "GOOGLE_HEALTH_REDIRECT_URI"];
  const sources = loadConfigSources();
  const value = (name: keyof typeof sources.values) => sources.values[name];
  return {
    project: SERVER_NAME,
    unofficial: true,
    config_source: sources.source,
    local_config_path: sources.local.path,
    local_config_exists: sources.local.exists,
    local_config_secure_permissions: sources.local.secure_permissions,
    privacy_mode_default: parsePrivacyMode(value("GOOGLE_HEALTH_PRIVACY_MODE")),
    raw_payloads_opt_in: true,
    // Measured, not asserted: a synthetic record carrying every claimed location key, Google's
    // E7 coordinate encoding and nested place containers is run through structured + summary,
    // and the output is scanned by key AND by coordinate value. See gpsRedactionSelfCheck().
    gps_redaction_default: gpsRedactionSelfCheck(),
    gps_redacted_keys: GPS_REDACTED_KEYS,
    gps_redacted_container_keys: GPS_REDACTED_CONTAINER_KEYS,
    cache_enabled: parseBool(value("GOOGLE_HEALTH_CACHE")),
    cache_path: value("GOOGLE_HEALTH_CACHE_PATH") ?? join(homedir(), ".google-health-mcp", "cache.sqlite"),
    token_path: value("GOOGLE_HEALTH_TOKEN_PATH") ?? join(homedir(), ".google-health-mcp", "tokens.json"),
    stdout_safe: true,
    secret_env_vars: ["GOOGLE_HEALTH_CLIENT_SECRET"],
    required_env_present: Object.fromEntries(requiredEnv.map((name) => [name, Boolean(value(name as keyof typeof sources.values))])),
    redacted_key_patterns: REDACTED_KEY_PATTERNS,
    notes: [
      "This is an unofficial Google Health integration.",
      "Google Health API v4 is new and still evolving; check the official release notes before stable public launches because scopes and data types can change.",
      "OAuth tokens are stored locally and are not returned by tools.",
      "Raw Google Health payloads require GOOGLE_HEALTH_PRIVACY_MODE=raw or privacy_mode=raw.",
      "Documented limit: privacy_mode=raw asked for by an agent is refused with USER_ACTION_REQUIRED unless explicit_user_intent=true; a local GOOGLE_HEALTH_PRIVACY_MODE=raw default is honoured with no per-call intent, because it is the machine owner's own choice.",
      "Sensitive profile and token fields are removed or minimized unless raw mode is explicitly requested.",
      "Google Health API v4 does not currently document a location/route data type, so gps_redaction_default is a forward-compatible guard over gps_redacted_keys rather than a fix for an observed leak.",
      "Documented limit: altitude and elevation are NOT redacted. Altitude is an official Google Health v4 data type (activity_and_fitness) and does not localize a user on its own; altitude inside a redacted place container is dropped with the container.",
      "Documented limit: summary mode flattens numeric leaves up to depth 2, so any coordinate key outside gps_redacted_keys would be promoted to the top of the response. The key list is the boundary, not the mode.",
      "stdio transport logs to stderr to avoid corrupting JSON-RPC."
    ]
  };
}

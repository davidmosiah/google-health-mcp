import { constants, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const LOCAL_CONFIG_KEYS = [
  "GOOGLE_HEALTH_CLIENT_ID",
  "GOOGLE_HEALTH_CLIENT_SECRET",
  "GOOGLE_HEALTH_REDIRECT_URI",
  "GOOGLE_HEALTH_TOKEN_PATH",
  "GOOGLE_HEALTH_SCOPES",
  "GOOGLE_HEALTH_PRIVACY_MODE",
  "GOOGLE_HEALTH_CACHE",
  "GOOGLE_HEALTH_CACHE_PATH",
  "GOOGLE_HEALTH_API_BASE_URL"
] as const;

export type LocalConfigKey = typeof LOCAL_CONFIG_KEYS[number];
export type LocalGoogleHealthConfig = Partial<Record<LocalConfigKey, string>>;

export interface LocalConfigReadResult {
  path: string;
  exists: boolean;
  values: LocalGoogleHealthConfig;
  permissions?: string;
  secure_permissions?: boolean;
  error?: string;
}

export interface EffectiveConfigSources {
  values: LocalGoogleHealthConfig;
  local: LocalConfigReadResult;
  source: "env" | "local_config" | "mixed" | "missing";
}

export function getLocalConfigPath(homeDir = homedir()): string {
  return join(homeDir, ".google-health-mcp", "config.json");
}

export function readLocalConfig(homeDir = homedir()): LocalConfigReadResult {
  const path = getLocalConfigPath(homeDir);
  if (!existsSync(path)) return { path, exists: false, values: {} };
  try {
    const stat = statSync(path);
    const permissions = (stat.mode & 0o777).toString(8).padStart(3, "0");
    const securePermissions = process.platform === "win32" ? true : (stat.mode & 0o077) === 0;
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const values = Object.fromEntries(
      LOCAL_CONFIG_KEYS
        .map((key) => [key, typeof raw[key] === "string" && raw[key].trim() ? raw[key].trim() : undefined] as const)
        .filter(([, value]) => value)
    ) as LocalGoogleHealthConfig;
    return { path, exists: true, values, permissions, secure_permissions: securePermissions };
  } catch (error) {
    return { path, exists: true, values: {}, error: (error as Error).message };
  }
}

export function writeLocalConfig(values: LocalGoogleHealthConfig, homeDir = homedir()): string {
  const path = getLocalConfigPath(homeDir);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const clean = Object.fromEntries(
    LOCAL_CONFIG_KEYS
      .map((key) => [key, values[key]] as const)
      .filter(([, value]) => typeof value === "string" && value.trim())
  );
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(clean, null, 2)}\n`, { mode: constants.S_IRUSR | constants.S_IWUSR });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
  return path;
}

export function loadConfigSources(env: Record<string, string | undefined> = process.env, homeDir = homedir()): EffectiveConfigSources {
  const local = readLocalConfig(homeDir);
  const values: LocalGoogleHealthConfig = {};
  let envUsed = false;
  let localUsed = false;

  for (const key of LOCAL_CONFIG_KEYS) {
    const envValue = env[key]?.trim();
    if (envValue) {
      values[key] = envValue;
      envUsed = true;
    } else if (local.values[key]) {
      values[key] = local.values[key];
      localUsed = true;
    }
  }

  return {
    values,
    local,
    source: envUsed && localUsed ? "mixed" : envUsed ? "env" : localUsed ? "local_config" : "missing"
  };
}

import { DEFAULT_SCOPES } from "../constants.js";

export const SCOPE_PRESETS = {
  basic: [
    "https://www.googleapis.com/auth/googlehealth.profile.readonly",
    "https://www.googleapis.com/auth/googlehealth.settings.readonly"
  ],
  activity: [
    "https://www.googleapis.com/auth/googlehealth.profile.readonly",
    "https://www.googleapis.com/auth/googlehealth.settings.readonly",
    "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
    "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly"
  ],
  sleep: [
    "https://www.googleapis.com/auth/googlehealth.profile.readonly",
    "https://www.googleapis.com/auth/googlehealth.settings.readonly",
    "https://www.googleapis.com/auth/googlehealth.sleep.readonly"
  ],
  full: DEFAULT_SCOPES
} as const;

export type ScopePresetName = keyof typeof SCOPE_PRESETS;

export function parseScopePreset(value: string): ScopePresetName {
  if (value === "basic" || value === "activity" || value === "sleep" || value === "full") return value;
  throw new Error("Scope preset must be basic, activity, sleep or full.");
}

export function parseScopeList(value: string): string[] {
  const scopes = value.split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean);
  if (scopes.length === 0) throw new Error("At least one Google Health OAuth scope is required.");
  for (const scope of scopes) {
    if (!scope.startsWith("https://www.googleapis.com/auth/googlehealth.")) {
      throw new Error(`Unsupported Google Health OAuth scope: ${scope}`);
    }
  }
  return Array.from(new Set(scopes));
}

export function resolveScopes(preset: string | undefined, override: string | undefined): string[] {
  if (override) return parseScopeList(override);
  return [...SCOPE_PRESETS[parseScopePreset(preset ?? "full")]];
}

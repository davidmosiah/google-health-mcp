export const SERVER_NAME = "google-health-mcp-server";
export const SERVER_VERSION = "0.4.7";
export const NPM_PACKAGE_NAME = "google-health-mcp-unofficial";
export const PINNED_NPM_PACKAGE = `${NPM_PACKAGE_NAME}@${SERVER_VERSION}`;

export const GOOGLE_HEALTH_API_BASE_URL = "https://health.googleapis.com";
export const GOOGLE_HEALTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_HEALTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_HEALTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.profile.readonly",
  "https://www.googleapis.com/auth/googlehealth.settings.readonly",
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.nutrition.readonly"
];

// Opt-in nutrition WRITE scope. Intentionally excluded from DEFAULT_SCOPES so the read-only
// presets (basic/activity/sleep/full) stay read-only and existing users are never forced to
// re-consent to a write scope (and connection-status never reports it as a missing recommended
// scope, since missing_recommended_scopes is derived purely from DEFAULT_SCOPES).
// TO-VERIFY: confirm the exact scope string against https://developers.google.com/health/scopes.
export const GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE =
  "https://www.googleapis.com/auth/googlehealth.nutrition";

export const DEFAULT_LIMIT = 100;
export const MAX_GOOGLE_HEALTH_LIMIT = 10_000;
export const DEFAULT_MAX_PAGES = 1;
export const MAX_PAGES = 10;

export const GOOGLE_HEALTH_DATA_SOURCE_FAMILIES = [
  "users/me/dataSourceFamilies/all-sources",
  "users/me/dataSourceFamilies/google-wearables",
  "users/me/dataSourceFamilies/google-sources"
] as const;

export const GOOGLE_HEALTH_BETA_NOTICE =
  "Google Health API v4 is new; Google recommends waiting until the end of May 2026 for stable public launches because breaking changes may occur.";

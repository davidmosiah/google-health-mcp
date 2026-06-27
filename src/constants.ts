export const SERVER_NAME = "google-health-mcp-server";
export const SERVER_VERSION = "0.4.8";
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

// Canonical, agent-discoverable catalog of Google Health v4 data-type slugs this server exercises.
// Single source of truth for: (a) the GoogleHealthDataTypeSchema description agents read in the
// tool definition, and (b) the google_health_list_data_types tool. `supports` lists which endpoint
// verbs accept the slug (list = listDataPoints, reconcile = reconcileDataPoints, rollup = dailyRollUp
// + rollUp). Slugs stay in kebab case; the API still accepts other v4 slugs, so this is a guide, not
// a hard allow-list (GoogleHealthDataTypeSchema remains an open kebab-case string).
export const GOOGLE_HEALTH_DATA_TYPES = [
  { slug: "steps", supports: ["list", "reconcile", "rollup"], unit: "count", scope: "activity_and_fitness" },
  { slug: "distance", supports: ["list", "reconcile", "rollup"], unit: "meters", scope: "activity_and_fitness" },
  { slug: "active-zone-minutes", supports: ["list", "reconcile", "rollup"], unit: "minutes", scope: "activity_and_fitness" },
  { slug: "total-calories", supports: ["list", "reconcile", "rollup"], unit: "kilocalories", scope: "activity_and_fitness" },
  { slug: "heart-rate", supports: ["list", "reconcile", "rollup"], unit: "bpm", scope: "activity_and_fitness" },
  { slug: "daily-resting-heart-rate", supports: ["list", "reconcile"], unit: "bpm", scope: "activity_and_fitness" },
  { slug: "daily-heart-rate-variability", supports: ["list", "reconcile"], unit: "milliseconds", scope: "activity_and_fitness" },
  { slug: "sleep", supports: ["list", "reconcile"], unit: "minutes", scope: "sleep" },
  { slug: "weight", supports: ["list", "reconcile", "rollup"], unit: "kilograms", scope: "health_metrics_and_measurements" },
  { slug: "body-fat", supports: ["list", "reconcile", "rollup"], unit: "percent", scope: "health_metrics_and_measurements" },
  { slug: "exercise", supports: ["list", "reconcile"], unit: "session", scope: "activity_and_fitness" },
  { slug: "nutrition", supports: ["list", "reconcile"], unit: "macros", scope: "nutrition" }
] as const;

export const GOOGLE_HEALTH_DATA_TYPE_SLUGS = GOOGLE_HEALTH_DATA_TYPES.map((entry) => entry.slug);

export const GOOGLE_HEALTH_BETA_NOTICE =
  "Google Health API v4 is new; Google recommends waiting until the end of May 2026 for stable public launches because breaking changes may occur.";

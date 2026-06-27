export const SERVER_NAME = "google-health-mcp-server";
export const SERVER_VERSION = "0.5.1";
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
export const GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE =
  "https://www.googleapis.com/auth/googlehealth.nutrition.writeonly";

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
export const GOOGLE_HEALTH_DATA_TYPES_SOURCE = {
  url: "https://developers.google.com/health/data-types",
  page_last_updated: "2026-06-17",
  captured_at: "2026-06-27"
} as const;

export type GoogleHealthDataTypeSupport = "list" | "reconcile" | "rollup";

export const GOOGLE_HEALTH_DATA_TYPES = [
  { slug: "active-energy-burned", name: "Active Energy Burned", kind: "Interval", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "reconcile", "rollup", "dailyRollup"], unit: "energy", scope: "activity_and_fitness" },
  { slug: "active-minutes", name: "Active Minutes", kind: "Interval", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "reconcile", "rollup", "dailyRollup"], unit: "minutes", scope: "activity_and_fitness" },
  { slug: "active-zone-minutes", name: "Active Zone Minutes", kind: "Interval", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "reconcile", "rollup", "dailyRollup"], unit: "minutes", scope: "activity_and_fitness" },
  { slug: "activity-level", name: "Activity Level", kind: "Interval", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "level", scope: "activity_and_fitness" },
  { slug: "altitude", name: "Altitude", kind: "Interval", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "reconcile", "rollup", "dailyRollup"], unit: "altitude", scope: "activity_and_fitness" },
  { slug: "blood-glucose", name: "Blood Glucose", kind: "Sample", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "get", "reconcile", "rollup", "dailyRollup"], unit: "glucose", scope: "health_metrics_and_measurements" },
  { slug: "body-fat", name: "Body Fat", kind: "Sample", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "get", "reconcile", "rollup", "dailyRollup", "create", "update", "batchDelete"], unit: "percent", scope: "health_metrics_and_measurements" },
  { slug: "calories-in-heart-rate-zone", name: "Calories In Heart Rate Zone", kind: "Interval", supports: ["rollup"], official_operations: ["rollup", "dailyRollup"], unit: "kilocalories", scope: "activity_and_fitness" },
  { slug: "core-body-temperature", name: "Core Body Temperature", kind: "Sample", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "get", "reconcile", "rollup", "dailyRollup"], unit: "temperature", scope: "health_metrics_and_measurements" },
  { slug: "daily-heart-rate-variability", name: "Daily Heart Rate Variability", kind: "Daily", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "milliseconds", scope: "health_metrics_and_measurements" },
  { slug: "daily-heart-rate-zones", name: "Daily Heart Rate Zones", kind: "Daily", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "zones", scope: "health_metrics_and_measurements" },
  { slug: "daily-oxygen-saturation", name: "Daily Oxygen Saturation", kind: "Daily", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "percent", scope: "health_metrics_and_measurements" },
  { slug: "daily-respiratory-rate", name: "Daily Respiratory Rate", kind: "Daily", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "breaths_per_minute", scope: "health_metrics_and_measurements" },
  { slug: "daily-resting-heart-rate", name: "Daily Resting Heart Rate", kind: "Daily", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "bpm", scope: "health_metrics_and_measurements" },
  { slug: "daily-sleep-temperature-derivations", name: "Daily Sleep Temperature Derivations", kind: "Daily", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "temperature_delta", scope: "health_metrics_and_measurements" },
  { slug: "daily-vo2-max", name: "Daily VO2 Max", kind: "Daily", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "vo2_max", scope: "activity_and_fitness" },
  { slug: "distance", name: "Distance", kind: "Interval", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "reconcile", "rollup", "dailyRollup"], unit: "meters", scope: "activity_and_fitness" },
  { slug: "electrocardiogram", name: "Electrocardiogram (ECG)", kind: "Session", supports: ["list"], official_operations: ["list"], unit: "session", scope: "ecg" },
  { slug: "exercise", name: "Exercise", kind: "Session", supports: ["list", "reconcile"], official_operations: ["list", "get", "reconcile", "create", "update", "batchDelete"], unit: "session", scope: "activity_and_fitness" },
  { slug: "floors", name: "Floors", kind: "Interval", supports: ["reconcile", "rollup"], official_operations: ["reconcile", "rollup", "dailyRollup"], unit: "floors", scope: "activity_and_fitness" },
  { slug: "food", name: "Food", kind: "Food", supports: ["list"], official_operations: ["list", "get"], unit: "food", scope: "nutrition" },
  { slug: "food-measurement-unit", name: "Food Measurement Unit", kind: "Food", supports: ["list"], official_operations: ["list", "get"], unit: "unit", scope: "nutrition" },
  { slug: "heart-rate", name: "Heart Rate", kind: "Sample", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "reconcile", "rollup", "dailyRollup"], unit: "bpm", scope: "health_metrics_and_measurements" },
  { slug: "heart-rate-variability", name: "Heart Rate Variability", kind: "Sample", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "milliseconds", scope: "health_metrics_and_measurements" },
  { slug: "height", name: "Height", kind: "Sample", supports: ["list", "reconcile"], official_operations: ["list", "get", "reconcile", "create", "update", "batchDelete"], unit: "meters", scope: "health_metrics_and_measurements" },
  { slug: "hydration-log", name: "Hydration Log", kind: "Session", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "get", "reconcile", "rollup", "dailyRollup", "create", "update", "batchDelete"], unit: "volume", scope: "nutrition" },
  { slug: "irregular-rhythm-notification", name: "Irregular Rhythm Notification", kind: "Session", supports: ["list"], official_operations: ["list"], unit: "notification", scope: "irn" },
  { slug: "nutrition-log", name: "Nutrition Log", kind: "Sample", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "get", "reconcile", "rollup", "dailyRollup", "create", "update", "batchDelete"], unit: "nutrients", scope: "nutrition" },
  { slug: "oxygen-saturation", name: "Oxygen Saturation", kind: "Sample", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "percent", scope: "health_metrics_and_measurements" },
  { slug: "respiratory-rate-sleep-summary", name: "Respiratory Rate Sleep Summary", kind: "Sample", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "breaths_per_minute", scope: "health_metrics_and_measurements" },
  { slug: "run-vo2-max", name: "Run VO2 Max", kind: "Sample", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "reconcile", "rollup", "dailyRollup"], unit: "vo2_max", scope: "activity_and_fitness" },
  { slug: "sedentary-period", name: "Sedentary Period", kind: "Interval", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "reconcile", "rollup", "dailyRollup"], unit: "duration", scope: "activity_and_fitness" },
  { slug: "sleep", name: "Sleep", kind: "Session", supports: ["list", "reconcile"], official_operations: ["list", "get", "reconcile", "create", "update", "batchDelete"], unit: "session", scope: "sleep" },
  { slug: "steps", name: "Steps", kind: "Interval", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "reconcile", "rollup", "dailyRollup"], unit: "count", scope: "activity_and_fitness" },
  { slug: "swim-lengths-data", name: "Swim Lengths Data", kind: "Interval", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "reconcile", "rollup", "dailyRollup"], unit: "lengths", scope: "activity_and_fitness" },
  { slug: "time-in-heart-rate-zone", name: "Time in Heart Rate Zone", kind: "Interval", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "reconcile", "rollup", "dailyRollup"], unit: "duration", scope: "activity_and_fitness" },
  { slug: "total-calories", name: "Total Calories", kind: "Interval", supports: ["rollup"], official_operations: ["rollup", "dailyRollup"], unit: "kilocalories", scope: "activity_and_fitness" },
  { slug: "vo2-max", name: "VO2 Max", kind: "Sample", supports: ["list", "reconcile"], official_operations: ["list", "reconcile"], unit: "vo2_max", scope: "activity_and_fitness" },
  { slug: "weight", name: "Weight", kind: "Sample", supports: ["list", "reconcile", "rollup"], official_operations: ["list", "get", "reconcile", "rollup", "dailyRollup", "create", "update", "batchDelete"], unit: "kilograms", scope: "health_metrics_and_measurements" }
] as const;

export const GOOGLE_HEALTH_DATA_TYPE_SLUGS = GOOGLE_HEALTH_DATA_TYPES.map((entry) => entry.slug);

export const GOOGLE_HEALTH_BETA_NOTICE =
  "Google Health API v4 is new and still evolving; check the official release notes before stable public launches because scopes and data types can change.";

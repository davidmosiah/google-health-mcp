import type { PrivacyMode, GoogleHealthConfig } from "../types.js";
import {
  resolvePrivacyMode as resolvePrivacyModeKit,
  isGpsKey,
  type PrivacyEscalationOpts,
  type PrivacyMode as KitPrivacyMode,
} from "delx-mcp-kit";


export type { PrivacyEscalationOpts };

/** Resolve privacy mode via delx-mcp-kit (agent raw escalation requires intent). */
export function resolvePrivacyMode(
  config: GoogleHealthConfig,
  override?: PrivacyMode,
  opts?: PrivacyEscalationOpts,
): PrivacyMode {
  return resolvePrivacyModeKit(
    { privacyMode: config.privacyMode as KitPrivacyMode },
    override as KitPrivacyMode | undefined,
    opts,
  ) as PrivacyMode;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pickDefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
}


export function applyPrivacy(endpoint: string, payload: unknown, mode: PrivacyMode): unknown {
  if (mode === "raw") return payload;
  if (Array.isArray(payload)) return payload.map((record) => normalizeRecord(endpoint, record, mode));
  if (isObject(payload) && Array.isArray(payload.dataPoints)) {
    return { ...removeSensitive(payload), dataPoints: payload.dataPoints.map((record) => normalizeRecord(endpoint, record, mode)) };
  }
  if (isObject(payload) && Array.isArray(payload.rollupDataPoints)) {
    return { ...removeSensitive(payload), rollupDataPoints: payload.rollupDataPoints.map((record) => normalizeRecord(endpoint, record, mode)) };
  }
  return normalizeRecord(endpoint, payload, mode);
}

export function normalizeRecord(endpoint: string, record: unknown, mode: PrivacyMode): unknown {
  if (!isObject(record)) return record;
  if (endpoint.includes("/identity")) return normalizeIdentity(record, mode);
  if (endpoint.includes("/profile")) return normalizeProfile(record, mode);
  if (endpoint.includes("/settings")) return normalizeSettings(record);
  // Summary must never be *less* restrictive than structured: strip first, then summarize.
  // Summarizing the raw record let collectNumbers()/inferDataType() re-promote dropped
  // location values to the top level of the response.
  if (mode === "summary") return summarizeGoogleHealthRecord(removeSensitive(record));
  return removeSensitiveDeep(record);
}

export function normalizeStreams(payload: unknown, mode: PrivacyMode, includeGps: boolean): unknown {
  if (mode === "raw") return payload;
  const clean = isObject(payload) ? removeSensitiveDeep(payload) : payload;
  if (!includeGps && isObject(clean)) delete clean.dataSource;
  return mode === "summary" && isObject(clean) ? summarizeGoogleHealthRecord(clean) : clean;
}

function normalizeIdentity(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  return pickDefined({
    name: mode === "summary" ? undefined : record.name,
    healthUserId: mode === "summary" ? undefined : record.healthUserId,
    legacyUserId: mode === "raw" ? record.legacyUserId : undefined,
    has_google_health_identity: Boolean(record.healthUserId),
    has_legacy_fitbit_identity: Boolean(record.legacyUserId)
  });
}

function normalizeProfile(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const cleaned = removeSensitiveDeep(record);
  if (mode !== "summary") return cleaned;
  return pickDefined({
    timezone: findValue(cleaned, ["timezone", "timeZone", "ianaTimezone"]),
    locale: findValue(cleaned, ["locale"]),
    gender: findValue(cleaned, ["gender"]),
    height: findValue(cleaned, ["height"])
  });
}

function normalizeSettings(record: Record<string, unknown>): unknown {
  return removeSensitiveDeep(record);
}

function summarizeGoogleHealthRecord(record: Record<string, unknown>): Record<string, unknown> {
  return pickDefined({
    name: undefined,
    data_type: inferDataType(record),
    data_source_platform: isObject(record.dataSource) ? record.dataSource.platform : undefined,
    recording_method: isObject(record.dataSource) ? record.dataSource.recordingMethod : undefined,
    start_time: findValue(record, ["startTime", "physicalTime"]),
    end_time: findValue(record, ["endTime"]),
    summary: findValue(record, ["summary"]),
    value: summarizeValues(record)
  });
}

function inferDataType(record: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(record)) {
    if (!["name", "dataSource", "createTime", "updateTime", "civilStartTime", "civilEndTime"].includes(key) && isObject(record[key])) return key;
  }
  return undefined;
}

function summarizeValues(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const dataType = inferDataType(record);
  const payload = dataType && isObject(record[dataType]) ? record[dataType] as Record<string, unknown> : record;
  const out: Record<string, unknown> = {};
  collectNumbers(payload, out, 0);
  return Object.keys(out).length ? out : undefined;
}

function collectNumbers(record: Record<string, unknown>, out: Record<string, unknown>, depth: number): void {
  if (depth > 2) return;
  for (const [key, value] of Object.entries(record)) {
    // Same drop-list as removeSensitiveDeep. Without this, a caller that summarizes an
    // unstripped record would flatten coordinates into the summary payload.
    if (isSensitiveKey(key)) continue;
    if (typeof value === "number" || typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) out[key] = value;
    else if (isObject(value)) collectNumbers(value, out, depth + 1);
  }
}

function findValue(record: unknown, keys: string[]): unknown {
  if (!isObject(record)) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  for (const value of Object.values(record)) {
    const found = findValue(value, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function removeSensitiveDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeSensitiveDeep);
  if (!isObject(value)) return value;
  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue;
    clone[key] = removeSensitiveDeep(child);
  }
  return clone;
}

function removeSensitive(record: Record<string, unknown>): Record<string, unknown> {
  return removeSensitiveDeep(record) as Record<string, unknown>;
}

// Identity / secret-bearing keys owned by this server. Location keys are NOT listed here:
// they come from delx-mcp-kit's isGpsKey(), which is the single source of truth for what
// "GPS redaction" means across the Delx wellness servers (latitude, longitude, lat, lon,
// lng, coordinates, startLatitude/startLongitude, latlng, map, polyline, ...).
const SENSITIVE_KEYS = new Set([
  "email", "fullName", "firstName", "lastName", "avatar", "photoUrl",
  "access_token", "refresh_token", "id_token", "authorization", "legacyUserId",
  "tcxLink"
]);

/** A key is dropped when it is an identity/secret field OR any location field the kit knows. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key) || isGpsKey(key);
}

/**
 * Location keys this server claims to redact. Enumerated from delx-mcp-kit's isGpsKey()
 * so the public claim can never drift from the code that enforces it.
 */
export const GPS_REDACTED_KEYS: readonly string[] = [
  "startLatitude", "startLongitude", "start_latlng", "endLatitude", "endLongitude", "end_latlng",
  "latitude", "longitude", "lat", "lon", "lng", "latlng", "coordinates", "coordinate",
  "gps", "gpx", "geoPolylineDTO", "map", "polyline", "summary_polyline", "activities-tracker-gps"
].filter((key) => isGpsKey(key));

/**
 * Measured answer to "does this build actually redact GPS by default?".
 * The privacy audit reports this instead of a hardcoded literal: a synthetic record carrying
 * every claimed location key is pushed through the two non-raw modes and the result is
 * scanned. If a future refactor stops redacting, the audit says so instead of lying.
 */
export function gpsRedactionSelfCheck(): boolean {
  const probe = {
    startLatitude: -11.111111,
    startLongitude: -22.222222,
    exercise: {
      lat: -11.111111, lon: -22.222222, lng: -33.333333,
      coordinates: [-11.111111, -22.222222],
      locations: [{ latitude: -11.111111, longitude: -22.222222 }],
      steps: 10
    }
  };
  const endpoint = "/v4/users/me/dataTypes/exercise/dataPoints";
  return (["structured", "summary"] as const).every(
    (mode) => !containsGpsKey(applyPrivacy(endpoint, probe, mode))
  );
}

function containsGpsKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsGpsKey);
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, child]) => isGpsKey(key) || containsGpsKey(child));
}

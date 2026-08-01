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
    if (isSensitiveEntry(key, value)) continue;
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
    if (isSensitiveEntry(key, child)) continue;
    clone[key] = removeSensitiveDeep(child);
  }
  return clone;
}

function removeSensitive(record: Record<string, unknown>): Record<string, unknown> {
  return removeSensitiveDeep(record) as Record<string, unknown>;
}

// Identity / secret-bearing keys owned by this server. Location keys live below.
const SENSITIVE_KEYS = new Set([
  "email", "fullName", "firstName", "lastName", "avatar", "photoUrl",
  "access_token", "refresh_token", "id_token", "authorization", "legacyUserId",
  "tcxLink"
]);

/** Match on shape, not spelling: latitudeE7 / latitude_e7 / LATITUDE_E7 are one key. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Coordinate-bearing LEAF keys. Always dropped, whatever the value is.
 *
 * Two provenances, deliberately kept visible:
 *  - the cross-server floor from delx-mcp-kit's isGpsKey() (latitude, lat, latlng, polyline,
 *    map, gpx, activities-tracker-gps, ...), which was itself derived from Strava's naming;
 *  - names re-derived for THIS provider. Google encodes coordinates as integer degrees x 1e7
 *    (`latitudeE7` / `longitudeE7` in Location History and the Maps APIs) and as explicit
 *    degree suffixes (`lat_deg`). Inheriting the kit list without adding these repeated, one
 *    layer up, the exact mistake the kit was adopted to fix.
 *
 * The additions stay LOCAL to this server rather than going into delx-mcp-kit because the
 * E7 encoding is Google's, not a cross-provider convention: pushing it into the shared kit
 * would hand Strava/Garmin/Oura servers keys their APIs never emit, and would gate this
 * repo's fix on a kit release. Promoting them to the kit is a follow-up, not a blocker.
 */
export const GPS_REDACTED_KEYS: readonly string[] = [
  // cross-server floor (delx-mcp-kit isGpsKey)
  "startLatitude", "startLongitude", "start_latlng", "endLatitude", "endLongitude", "end_latlng",
  "latitude", "longitude", "lat", "lon", "lng", "latlng", "coordinates", "coordinate",
  "gps", "gpx", "geoPolylineDTO", "map", "polyline", "summary_polyline", "activities-tracker-gps",
  // Google's own encodings, re-derived for this provider
  "latitudeE7", "longitudeE7", "latE7", "lngE7", "lonE7",
  "startLatitudeE7", "startLongitudeE7", "endLatitudeE7", "endLongitudeE7",
  "lat_deg", "lng_deg", "lon_deg", "latitudeDegrees", "longitudeDegrees"
];

/**
 * Location CONTAINER keys. Dropped as a whole object — never key-by-key — whenever they hold
 * a place record, so a coordinate spelled in a way this list never anticipated still dies with
 * its container, together with the address/city/placeId siblings that localise just as well.
 *
 * Conditional on the value on purpose: a container holding scalars is a label, not a place
 * (`location: ["gym", "home"]` survives; `location: { latitudeE7 }` does not).
 */
export const GPS_REDACTED_CONTAINER_KEYS: readonly string[] = [
  "location", "locations", "geoLocation", "geoLocations", "geo", "geoJson",
  "route", "routes", "position", "positions", "waypoint", "waypoints",
  "trackPoint", "trackPoints", "placeVisit"
];

const LOCATION_LEAF_LOOKUP = new Set(GPS_REDACTED_KEYS.map(normalizeKey));
const LOCATION_CONTAINER_LOOKUP = new Set(GPS_REDACTED_CONTAINER_KEYS.map(normalizeKey));

/** True for a leaf key that carries a coordinate component. */
export function isLocationLeafKey(key: string): boolean {
  return isGpsKey(key) || LOCATION_LEAF_LOOKUP.has(normalizeKey(key));
}

/** True for a key that names a place record (see GPS_REDACTED_CONTAINER_KEYS). */
export function isLocationContainerKey(key: string): boolean {
  return LOCATION_CONTAINER_LOOKUP.has(normalizeKey(key));
}

/** A place record is an object, or an array containing objects. Scalars are labels. */
function isPlaceRecord(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => Boolean(item) && typeof item === "object");
  return isObject(value);
}

/** A key is dropped when it is an identity/secret field OR a coordinate-bearing leaf. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key) || isLocationLeafKey(key);
}

/** Drop decision for a key/value pair: leaf keys unconditionally, containers when they hold a place. */
export function isSensitiveEntry(key: string, value: unknown): boolean {
  return isSensitiveKey(key) || (isLocationContainerKey(key) && isPlaceRecord(value));
}

/**
 * Obviously fake sentinels carried by the self-check probe. Coordinates are scanned by VALUE as
 * well as by key, because a scan over key NAMES alone stays green through any refactor that
 * renames the key while still emitting the number.
 */
const SELF_CHECK_COORDS = [
  -11.111111, -22.222222, -33.333333, -85.858585, -74.747474, -857474747, -747474747
];
/** Non-location metric that MUST survive: a build that redacted everything would otherwise pass. */
const SELF_CHECK_METRIC = 4242;

/**
 * Measured answer to "does this build actually redact location by default?".
 * The privacy audit reports this instead of a hardcoded literal: a synthetic record carrying
 * leaf keys, Google's E7 encoding and nested place containers is pushed through the two non-raw
 * modes, and the output is scanned for surviving keys AND surviving coordinate values.
 */
export function gpsRedactionSelfCheck(): boolean {
  const probe = {
    startLatitude: -11.111111,
    startLongitude: -22.222222,
    location: { latitudeE7: -857474747, longitudeE7: -747474747, address: "Rua Sintetica 0", city: "Cidade Sintetica" },
    geoLocation: { lat_deg: -85.858585, lng_deg: -74.747474 },
    route: [{ position: { latitudeE7: -857474747, longitudeE7: -747474747 } }],
    exercise: {
      lat: -11.111111, lon: -22.222222, lng: -33.333333,
      coordinates: [-11.111111, -22.222222],
      locations: [{ latitude: -11.111111, longitude: -22.222222 }],
      steps: SELF_CHECK_METRIC
    }
  };
  const endpoint = "/v4/users/me/dataTypes/exercise/dataPoints";
  return (["structured", "summary"] as const).every((mode) => {
    const output = applyPrivacy(endpoint, probe, mode);
    return !containsLocationKey(output) && !containsCoordinateValue(output) && containsMetric(output);
  });
}

function containsLocationKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsLocationKey);
  if (!isObject(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => isLocationLeafKey(key) || isLocationContainerKey(key) || containsLocationKey(child)
  );
}

function containsCoordinateValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCoordinateValue);
  if (isObject(value)) return Object.values(value).some(containsCoordinateValue);
  if (typeof value === "number") return SELF_CHECK_COORDS.includes(value);
  if (typeof value === "string") return SELF_CHECK_COORDS.some((coord) => value.includes(String(coord)));
  return false;
}

function containsMetric(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsMetric);
  if (isObject(value)) return Object.values(value).some(containsMetric);
  if (typeof value === "number") return value === SELF_CHECK_METRIC;
  return typeof value === "string" && value === String(SELF_CHECK_METRIC);
}

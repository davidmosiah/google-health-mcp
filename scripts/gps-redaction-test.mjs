/**
 * Behavioural gate for the public "GPS is redacted" claim.
 *
 * Why this file exists: google_health_privacy_audit used to report
 * gps_redaction_default: true from a hardcoded literal, and the only gate asserted that
 * literal against itself. README/SECURITY promise GPS redaction, but the drop-list only
 * held Strava-era names (latlng/gps/map/polyline), so latitude, longitude, lat, lon, lng,
 * coordinates, startLatitude and startLongitude survived structured mode — and summary
 * mode was WORSE, because collectNumbers() flattened them back to the top of the payload.
 *
 * Round 2 (0.7.0): the 0.6.0 list was still the Strava list, now shared through delx-mcp-kit —
 * the same failure one layer up. It had no entry for latitudeE7/longitudeE7, which is Google's
 * OWN canonical coordinate encoding (integer degrees x 1e7, as in Location History and the Maps
 * APIs), and no notion of a location CONTAINER, so location/geoLocation/route/position objects
 * walked through structured untouched and summary promoted latitudeE7 to the top of `value`.
 *
 * Every assertion here is about observed OUTPUT. Nothing re-reads the claim.
 * All coordinates are obviously synthetic (-11.111111 / -22.222222 / -33.333333 /
 * -85.858585 / -74.747474 and their E7 forms).
 */
import assert from 'node:assert/strict';
import { buildPrivacyAudit } from '../dist/services/audit.js';
import { applyPrivacy, GPS_REDACTED_KEYS, GPS_REDACTED_CONTAINER_KEYS } from '../dist/services/privacy.js';

const ENDPOINT = '/v4/users/me/dataTypes/exercise/dataPoints';

/** Every location key the server claims to redact, nested at several depths. */
const gpsRecord = {
  name: 'users/synthetic/dataTypes/exercise/dataPoints/fixture-1',
  dataSource: { platform: 'SYNTHETIC', recordingMethod: 'AUTOMATICALLY_RECORDED' },
  startLatitude: -11.111111,
  startLongitude: -22.222222,
  endLatitude: -11.222222,
  endLongitude: -22.333333,
  start_latlng: [-11.111111, -22.222222],
  end_latlng: [-11.222222, -22.333333],
  exercise: {
    interval: { startTime: '2026-01-01T00:00:00Z', endTime: '2026-01-01T01:00:00Z' },
    steps: 4242,
    distanceMeters: 5000,
    lat: -11.111111,
    lon: -22.222222,
    lng: -33.333333,
    latlng: [-11.111111, -22.222222],
    coordinates: [-11.111111, -22.222222],
    coordinate: { latitude: -11.111111, longitude: -22.222222 },
    gps: { fix: true, latitude: -11.111111 },
    gpx: '<trkpt lat="-11.111111" lon="-22.222222"/>',
    map: { polyline: 'fakepolyline', summary_polyline: 'fakesummary' },
    polyline: 'fakepolyline',
    summary_polyline: 'fakesummary',
    geoPolylineDTO: { points: [{ lat: -11.111111, lon: -22.222222 }] },
    'activities-tracker-gps': [{ latitude: -11.111111 }],
    locations: [
      { latitude: -11.111111, longitude: -22.222222, altitudeMeters: 12 },
      { latitude: -11.222222, longitude: -22.333333, altitudeMeters: 15 }
    ],
    // Google's own coordinate encoding: integer degrees x 1e7.
    latitudeE7: -857474747,
    longitudeE7: -747474747,
    latitude_e7: -857474747,           // same key, other spelling — matching must ignore case/_/-
    LONGITUDEE7: -747474747
  },
  // Location containers: the coordinate hides one level down, under names the leaf list
  // never anticipated, next to address/city that localize just as well.
  location: { latitudeE7: -857474747, longitudeE7: -747474747, address: 'Rua Sintetica 0', city: 'Cidade Sintetica' },
  geoLocation: { lat_deg: -85.858585, lng_deg: -74.747474 },
  route: [{ position: { latitudeE7: -857474747, longitudeE7: -747474747 }, elapsedSeconds: 30 }],
  trackPoints: [{ latitudeDegrees: -85.858585, longitudeDegrees: -74.747474 }],
  placeVisit: { location: { placeId: 'synthetic-place', latitudeE7: -857474747 } },
  access_token: 'synthetic-secret'
};

/** Collect every key present anywhere in a payload, plus every number found anywhere. */
function walk(value, keys = new Set(), numbers = []) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, keys, numbers);
    return { keys, numbers };
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'number') numbers.push(value);
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) numbers.push(Number(value));
    return { keys, numbers };
  }
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    walk(child, keys, numbers);
  }
  return { keys, numbers };
}

const SYNTHETIC_COORDS = [
  -11.111111, -22.222222, -33.333333, -11.222222, -22.333333,
  -85.858585, -74.747474, -857474747, -747474747
];

const normalizeKey = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, '');
const CLAIMED = new Set([...GPS_REDACTED_KEYS, ...GPS_REDACTED_CONTAINER_KEYS].map(normalizeKey));

function assertNoGps(label, payload) {
  const { keys, numbers } = walk(payload);
  // Compare normalized: latitude_e7 and LATITUDEE7 are the same claim as latitudeE7.
  const survivingKeys = [...keys].filter((key) => CLAIMED.has(normalizeKey(key)));
  assert.deepEqual(survivingKeys, [], `${label}: location keys survived redaction: ${survivingKeys.join(', ')}`);

  const survivingCoords = numbers.filter((n) => SYNTHETIC_COORDS.includes(n));
  assert.deepEqual(
    survivingCoords, [],
    `${label}: coordinate VALUES survived even though the keys were dropped: ${survivingCoords.join(', ')}`
  );
}

// 1. structured — the DEFAULT mode. Must drop location keys and keep physiology.
const structured = applyPrivacy(ENDPOINT, gpsRecord, 'structured');
assertNoGps('structured', structured);
assert.equal(structured.exercise.steps, 4242, 'structured must keep non-location physiology');
assert.equal(structured.exercise.distanceMeters, 5000, 'structured must keep distance');
assert.equal(structured.access_token, undefined, 'structured must keep dropping secrets');
assert.equal(structured.name, gpsRecord.name, 'structured must keep the record name');

// 2. summary — must never be LESS restrictive than structured.
const summary = applyPrivacy(ENDPOINT, gpsRecord, 'summary');
assertNoGps('summary', summary);
assert.equal(summary.data_type, 'exercise', 'summary must still infer the data type');
assert.equal(summary.value.steps, 4242, 'summary must still surface real metrics');

// 3. arrays and dataPoints envelopes take the same path.
assertNoGps('array payload', applyPrivacy(ENDPOINT, [gpsRecord, gpsRecord], 'structured'));
assertNoGps('dataPoints envelope', applyPrivacy(ENDPOINT, { dataPoints: [gpsRecord] }, 'structured'));
assertNoGps('rollup envelope', applyPrivacy(ENDPOINT, { rollupDataPoints: [gpsRecord] }, 'summary'));

// 4. raw stays the documented, intent-gated escape hatch — it must NOT be silently redacted,
//    otherwise "raw" would be a lie in the other direction.
const raw = applyPrivacy(ENDPOINT, gpsRecord, 'raw');
assert.equal(raw.startLatitude, -11.111111, 'raw must remain an honest passthrough');
assert.equal(raw.location.latitudeE7, -857474747, 'raw must pass location containers through');

// 5. profile/settings/identity endpoints run through the same drop-list.
assertNoGps('profile', applyPrivacy('/v4/users/me/profile', { ...gpsRecord }, 'structured'));
assertNoGps('settings', applyPrivacy('/v4/users/me/settings', { ...gpsRecord }, 'structured'));

// 6. NOT over-redacting. A container holding scalars is a label, not a place, and the naive
//    fix — adding `altitude`/`elevation` to the drop-list — would have deleted an official
//    Google Health v4 data type (`altitude`, activity_and_fitness). Both must survive.
const labelRecord = applyPrivacy(ENDPOINT, {
  name: 'users/synthetic/dataTypes/altitude/dataPoints/fixture-2',
  location: ['gym', 'home'],
  altitude: { interval: { startTime: '2026-01-01T00:00:00Z' }, value: 812 },
  elevation: 812
}, 'structured');
assert.deepEqual(labelRecord.location, ['gym', 'home'], 'a scalar container is a label and must survive');
assert.equal(labelRecord.altitude.value, 812, 'altitude is an official v4 data type and must survive');
assert.equal(labelRecord.elevation, 812, 'elevation is not a coordinate on its own and must survive');

// 7. the PUBLIC CLAIM must equal the MEASURED behaviour, not a literal.
const audit = buildPrivacyAudit();
assert.equal(audit.gps_redaction_default, true, 'privacy audit must report GPS redaction as active');
assert.ok(Array.isArray(audit.gps_redacted_keys) && audit.gps_redacted_keys.length > 0,
  'privacy audit must enumerate which keys the claim covers');
assert.ok(Array.isArray(audit.gps_redacted_container_keys) && audit.gps_redacted_container_keys.length > 0,
  'privacy audit must enumerate the location containers it drops');
for (const key of ['latitude', 'longitude', 'lat', 'lon', 'lng', 'coordinates', 'startLatitude', 'startLongitude',
  'latitudeE7', 'longitudeE7', 'lat_deg', 'lng_deg']) {
  assert.ok(audit.gps_redacted_keys.includes(key), `audit claim must cover "${key}"`);
}
for (const key of ['location', 'geoLocation', 'route', 'position']) {
  assert.ok(audit.gps_redacted_container_keys.includes(key), `audit claim must cover container "${key}"`);
}

// 8. the self-check must be falsifiable by VALUE, not only by key name. A refactor that renames
//    a coordinate key while still emitting the number kept gpsRedactionSelfCheck() green in
//    0.6.0, because it scanned key names only.
const renamed = applyPrivacy(ENDPOINT, {
  exercise: { steps: 4242, wgs84Northing: -85.858585 }
}, 'structured');
assert.equal(renamed.exercise.wgs84Northing, -85.858585,
  'sanity: an unlisted key is genuinely NOT redacted — this is the documented boundary');
assert.equal(
  audit.notes.some((note) => note.includes('summary mode flattens') || note.includes('flattens numeric leaves')),
  true,
  'the audit must publish the summary-flattening limit instead of implying total coverage'
);

console.log(JSON.stringify({
  ok: true,
  gps_redaction: 'behaviour-verified',
  modes_checked: ['structured', 'summary', 'raw'],
  leaf_keys_covered: GPS_REDACTED_KEYS.length,
  container_keys_covered: GPS_REDACTED_CONTAINER_KEYS.length
}, null, 2));

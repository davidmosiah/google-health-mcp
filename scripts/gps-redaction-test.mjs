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
 * Every assertion here is about observed OUTPUT. Nothing re-reads the claim.
 * All coordinates are obviously synthetic (-11.111111 / -22.222222 / -33.333333).
 */
import assert from 'node:assert/strict';
import { buildPrivacyAudit } from '../dist/services/audit.js';
import { applyPrivacy, normalizeStreams, GPS_REDACTED_KEYS } from '../dist/services/privacy.js';

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
    ]
  },
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

const SYNTHETIC_COORDS = [-11.111111, -22.222222, -33.333333, -11.222222, -22.333333];

function assertNoGps(label, payload) {
  const { keys, numbers } = walk(payload);
  const survivingKeys = GPS_REDACTED_KEYS.filter((key) => keys.has(key));
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

// 4. stream normalisation.
assertNoGps('streams', normalizeStreams(gpsRecord, 'structured', false));
assertNoGps('streams summary', normalizeStreams(gpsRecord, 'summary', false));

// 5. raw stays the documented, intent-gated escape hatch — it must NOT be silently redacted,
//    otherwise "raw" would be a lie in the other direction.
const raw = applyPrivacy(ENDPOINT, gpsRecord, 'raw');
assert.equal(raw.startLatitude, -11.111111, 'raw must remain an honest passthrough');

// 6. profile/settings/identity endpoints run through the same drop-list.
assertNoGps('profile', applyPrivacy('/v4/users/me/profile', { ...gpsRecord }, 'structured'));
assertNoGps('settings', applyPrivacy('/v4/users/me/settings', { ...gpsRecord }, 'structured'));

// 7. the PUBLIC CLAIM must equal the MEASURED behaviour, not a literal.
const audit = buildPrivacyAudit();
assert.equal(audit.gps_redaction_default, true, 'privacy audit must report GPS redaction as active');
assert.ok(Array.isArray(audit.gps_redacted_keys) && audit.gps_redacted_keys.length > 0,
  'privacy audit must enumerate which keys the claim covers');
for (const key of ['latitude', 'longitude', 'lat', 'lon', 'lng', 'coordinates', 'startLatitude', 'startLongitude']) {
  assert.ok(audit.gps_redacted_keys.includes(key), `audit claim must cover "${key}"`);
}

console.log(JSON.stringify({
  ok: true,
  gps_redaction: 'behaviour-verified',
  modes_checked: ['structured', 'summary', 'raw'],
  keys_covered: GPS_REDACTED_KEYS.length
}, null, 2));

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPrivacyAudit } from '../dist/services/audit.js';
import { GoogleHealthCache } from '../dist/services/cache.js';
import { applyPrivacy } from '../dist/services/privacy.js';
import { redactErrorMessage, redactSensitive } from '../dist/services/redaction.js';

const dataPoint = {
  name: 'users/123/dataTypes/steps/dataPoints/abc',
  dataSource: { platform: 'FITBIT', recordingMethod: 'PASSIVELY_MEASURED' },
  steps: { interval: { startTime: '2026-05-07T00:00:00Z' }, count: '42' },
  access_token: 'secret'
};

const structured = applyPrivacy('/v4/users/me/dataTypes/steps/dataPoints', dataPoint, 'structured');
assert.equal(structured.name, 'users/123/dataTypes/steps/dataPoints/abc');
assert.equal(structured.access_token, undefined);
assert.deepEqual(structured.steps, dataPoint.steps);

const futureStructured = applyPrivacy('/v4/users/me/dataTypes/steps/dataPoints', {
  ...dataPoint,
  futureMetrics: { gaitSymmetry: 97 },
}, 'structured');
assert.deepEqual(futureStructured.futureMetrics, { gaitSymmetry: 97 });

const summary = applyPrivacy('/v4/users/me/dataTypes/steps/dataPoints', dataPoint, 'summary');
assert.equal(summary.data_type, 'steps');
assert.equal(summary.value.count, '42');
assert.equal(summary.name, undefined);

const raw = applyPrivacy('/v4/users/me/dataTypes/steps/dataPoints', dataPoint, 'raw');
assert.equal(raw.access_token, 'secret');

// normalizeStreams() was removed in 0.7.0: "streams" is a Strava concept with no Google Health
// v4 endpoint, no call site in src/, and a dead includeGps parameter. The two asserts that
// covered it here and in gps-redaction-test.mjs were testing code no tool could ever execute.

assert.equal(redactSensitive({ access_token: 'abc', nested: { client_secret: 'def' } }).access_token, '[REDACTED]');
assert.match(redactErrorMessage('Authorization: Bearer abc.def.ghi'), /REDACTED/);
assert.equal(buildPrivacyAudit().unofficial, true);
// gps_redaction_default is now MEASURED by the server (see privacy.gpsRedactionSelfCheck), and
// the behavioural proof lives in scripts/gps-redaction-test.mjs. Asserting the literal here
// tested the string, not the behaviour — that is exactly how the drop-list stayed missing
// latitude/longitude/lat/lon/lng/coordinates while the audit reported redaction as active.
const gpsProbe = applyPrivacy('/v4/users/me/dataTypes/exercise/dataPoints', {
  startLatitude: -11.111111,
  exercise: { lat: -11.111111, lng: -22.222222, locations: [{ latitude: -33.333333 }], steps: 7 }
}, 'structured');
assert.equal(JSON.stringify(gpsProbe).includes('11.111111'), false, 'structured leaked a coordinate');
assert.equal(gpsProbe.exercise.steps, 7);

const dir = mkdtempSync(join(tmpdir(), 'google-health-mcp-cache-'));
let cache;
try {
  const path = join(dir, 'cache.sqlite');
  cache = new GoogleHealthCache(path);
  cache.set('GET', 'https://example.com/a', { ok: true });
  assert.deepEqual(cache.get('GET', 'https://example.com/a'), { ok: true });
  assert.equal(cache.status().entries, 1);
} finally {
  cache?.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, privacy: true, cache: true, redaction: true, audit: true }, null, 2));

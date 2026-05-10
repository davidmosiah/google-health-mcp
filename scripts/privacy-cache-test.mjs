import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPrivacyAudit } from '../dist/services/audit.js';
import { GoogleHealthCache } from '../dist/services/cache.js';
import { applyPrivacy, normalizeStreams } from '../dist/services/privacy.js';
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

const summary = applyPrivacy('/v4/users/me/dataTypes/steps/dataPoints', dataPoint, 'summary');
assert.equal(summary.data_type, 'steps');
assert.equal(summary.value.count, '42');
assert.equal(summary.name, undefined);

const raw = applyPrivacy('/v4/users/me/dataTypes/steps/dataPoints', dataPoint, 'raw');
assert.equal(raw.access_token, 'secret');

const streams = normalizeStreams({ heartrate: { data: [120, 121] }, latlng: { data: [[1, 2]] } }, 'structured', false);
assert.deepEqual(streams.heartrate.data, [120, 121]);

assert.equal(redactSensitive({ access_token: 'abc', nested: { client_secret: 'def' } }).access_token, '[REDACTED]');
assert.match(redactErrorMessage('Authorization: Bearer abc.def.ghi'), /REDACTED/);
assert.equal(buildPrivacyAudit().unofficial, true);
assert.equal(buildPrivacyAudit().gps_redaction_default, true);

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

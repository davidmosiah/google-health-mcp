import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleHealthClient } from '../dist/services/google-health-client.js';

const dir = mkdtempSync(join(tmpdir(), 'google-health-mcp-endpoint-contract-'));
const tokenPath = join(dir, 'tokens.json');
writeFileSync(tokenPath, JSON.stringify({ access_token: 'synthetic-token' }), { mode: 0o600 });

const client = new GoogleHealthClient({
  clientId: 'synthetic-client',
  clientSecret: 'synthetic-secret',
  redirectUri: 'http://127.0.0.1/callback',
  scopes: [],
  tokenPath,
  privacyMode: 'structured',
  cacheEnabled: false,
  cachePath: join(dir, 'cache.sqlite'),
  apiBaseUrl: 'https://health.googleapis.com',
});

const originalFetch = globalThis.fetch;
const originalNoCache = process.env.GOOGLE_HEALTH_NO_CACHE;
const requests = [];
process.env.GOOGLE_HEALTH_NO_CACHE = 'true';

globalThis.fetch = async (input, init = {}) => {
  requests.push({ url: new URL(String(input)), body: init.body ? JSON.parse(String(init.body)) : undefined });
  return Response.json({ rollupDataPoints: [{ steps: { countSum: '42' } }] });
};

try {
  const daily = await client.dailyRollup({
    dataType: 'steps',
    startDate: '2026-07-08',
    endDate: '2026-07-15',
  });
  assert.match(requests[0].url.pathname, /dataTypes\/steps\/dataPoints:dailyRollUp$/);
  assert.deepEqual(requests[0].body.range.start.date, { year: 2026, month: 7, day: 8 });
  assert.deepEqual(requests[0].body.range.end.date, { year: 2026, month: 7, day: 15 });
  assert.equal(daily.rollupDataPoints[0].steps.countSum, '42');

  await client.rollup({
    dataType: 'heart-rate',
    startTime: '2026-07-08T23:00:00-03:00',
    endTime: '2026-07-15T23:00:00-03:00',
    windowSize: '3600s',
  });
  assert.equal(requests[1].body.range.startTime, '2026-07-08T23:00:00-03:00');
  assert.equal(requests[1].body.range.endTime, '2026-07-15T23:00:00-03:00');

  const fetchCountBeforeInvalid = requests.length;
  for (const action of [
    () => client.dailyRollup({ dataType: 'steps', startDate: '2026-02-30' }),
    () => client.dailyRollup({ dataType: 'steps', startDate: '2026-07-15', endDate: '2026-07-08' }),
    () => client.rollup({ dataType: 'heart-rate', startTime: 'not-a-date', endTime: '2026-07-15T00:00:00Z', windowSize: '3600s' }),
    () => client.rollup({ dataType: 'heart-rate', startTime: '2026-07-15T00:00:00Z', endTime: '2026-07-08T00:00:00Z', windowSize: '3600s' }),
  ]) {
    await assert.rejects(action, /Invalid Google Health|Google Health start/);
  }
  assert.equal(requests.length, fetchCountBeforeInvalid, 'invalid ranges must fail before HTTP');

  console.log(JSON.stringify({ ok: true, suite: 'endpoint-contracts', requests: requests.length }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  if (originalNoCache === undefined) delete process.env.GOOGLE_HEALTH_NO_CACHE;
  else process.env.GOOGLE_HEALTH_NO_CACHE = originalNoCache;
  rmSync(dir, { recursive: true, force: true });
}

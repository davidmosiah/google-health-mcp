import assert from 'node:assert/strict';
import {
  fetchWithRetry,
  parseRetryAfter,
  RETRYABLE_STATUSES,
  MAX_ATTEMPTS
} from '../dist/services/http-retry.js';

// ---------- parseRetryAfter ----------

assert.equal(parseRetryAfter(null), undefined, 'null header → undefined');
assert.equal(parseRetryAfter(''), undefined, 'empty header → undefined');
assert.equal(parseRetryAfter('5'), 5000, '5 seconds → 5000ms');
assert.equal(parseRetryAfter('0'), 0, '0 seconds → 0ms');
assert.equal(parseRetryAfter('1.5'), 1500, '1.5 seconds → 1500ms');
assert.equal(parseRetryAfter('not-a-date'), undefined, 'invalid → undefined');

const baseNow = Date.parse('2026-05-19T10:00:00Z');
const futureHeader = new Date(baseNow + 7000).toUTCString();
assert.equal(parseRetryAfter(futureHeader, baseNow), 7000, 'HTTP-date 7s ahead → 7000ms');
const pastHeader = new Date(baseNow - 5000).toUTCString();
assert.equal(parseRetryAfter(pastHeader, baseNow), 0, 'HTTP-date in the past → 0ms');

// ---------- retry statuses ----------

for (const code of [408, 429, 500, 502, 503, 504]) {
  assert.ok(RETRYABLE_STATUSES.has(code), `${code} must be retryable`);
}
for (const code of [200, 301, 400, 401, 403, 404, 418]) {
  assert.ok(!RETRYABLE_STATUSES.has(code), `${code} must NOT be retryable`);
}
assert.equal(MAX_ATTEMPTS, 3, 'MAX_ATTEMPTS must be 3');

// ---------- factory for a recording fetch ----------

function makeFetch(responses) {
  const calls = [];
  let i = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return r;
  };
  return { fetchImpl, calls };
}

function jsonResp(status, body = '', headers = {}) {
  return new Response(body, { status, headers });
}

const sleeps = [];
const sleepRecord = async (ms) => { sleeps.push(ms); };
const log = [];
const logger = (m) => { log.push(m); };

// ---------- happy path: 200 returns immediately, no retries ----------

{
  const { fetchImpl, calls } = makeFetch([jsonResp(200, '{}')]);
  const out = await fetchWithRetry('https://x/y', {}, { fetchImpl, sleep: sleepRecord, logger });
  assert.equal(out.status, 200);
  assert.equal(calls.length, 1, '200 → exactly 1 fetch call');
  assert.equal(sleeps.length, 0, '200 → no sleeps');
}

// ---------- retry on 503 then 200 ----------

{
  sleeps.length = 0; log.length = 0;
  const { fetchImpl, calls } = makeFetch([jsonResp(503), jsonResp(200, '{}')]);
  const out = await fetchWithRetry('https://x/y', {}, {
    fetchImpl,
    sleep: sleepRecord,
    jitterRandom: () => 0.5, // no jitter shift (0.5 → factor 1.0)
    logger
  });
  assert.equal(out.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(sleeps.length, 1);
  assert.equal(sleeps[0], 500, 'first backoff = 500ms (no jitter)');
  assert.equal(log.length, 1);
  assert.match(log[0], /retry 1\/3 after 500ms \(status=503\)/);
}

// ---------- retry on 429 with Retry-After: 7 ----------

{
  sleeps.length = 0; log.length = 0;
  const r1 = jsonResp(429, '', { 'retry-after': '7' });
  const r2 = jsonResp(200, '{}');
  const { fetchImpl } = makeFetch([r1, r2]);
  const out = await fetchWithRetry('https://x/y', {}, {
    fetchImpl,
    sleep: sleepRecord,
    jitterRandom: () => 0.5,
    logger
  });
  assert.equal(out.status, 200);
  assert.equal(sleeps[0], 7000, 'Retry-After header overrides default backoff');
  assert.match(log[0], /retry 1\/3 after 7000ms \(status=429\)/);
}

// ---------- HTTP-date Retry-After ----------

{
  sleeps.length = 0; log.length = 0;
  const fixedNow = Date.parse('2026-05-19T10:00:00Z');
  const dateHeader = new Date(fixedNow + 4000).toUTCString();
  const r1 = jsonResp(503, '', { 'retry-after': dateHeader });
  const r2 = jsonResp(200, '{}');
  const { fetchImpl } = makeFetch([r1, r2]);
  await fetchWithRetry('https://x/y', {}, {
    fetchImpl,
    sleep: sleepRecord,
    jitterRandom: () => 0.5,
    logger,
    now: () => fixedNow
  });
  assert.equal(sleeps[0], 4000, 'HTTP-date Retry-After honored');
}

// ---------- exhausted retries return last response ----------

{
  sleeps.length = 0; log.length = 0;
  const { fetchImpl, calls } = makeFetch([jsonResp(500), jsonResp(500), jsonResp(500)]);
  const out = await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, jitterRandom: () => 0.5, logger
  });
  assert.equal(out.status, 500);
  assert.equal(calls.length, 3, 'exactly MAX_ATTEMPTS calls');
  assert.equal(sleeps.length, 2, 'exactly MAX_ATTEMPTS-1 sleeps');
  assert.deepEqual(sleeps, [500, 1000]);
  assert.equal(log.length, 2);
  assert.match(log[0], /retry 1\/3/);
  assert.match(log[1], /retry 2\/3/);
}

// ---------- retry on network error then success ----------

{
  sleeps.length = 0; log.length = 0;
  const networkErr = new TypeError('fetch failed');
  const { fetchImpl, calls } = makeFetch([networkErr, jsonResp(200, '{}')]);
  const out = await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, jitterRandom: () => 0.5, logger
  });
  assert.equal(out.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(sleeps[0], 500);
  assert.match(log[0], /retry 1\/3 after 500ms \(error=fetch failed\)/);
}

// ---------- exhausted network errors propagate ----------

{
  sleeps.length = 0; log.length = 0;
  const networkErr = new TypeError('ECONNRESET');
  const { fetchImpl } = makeFetch([networkErr, networkErr, networkErr]);
  let threw = false;
  try {
    await fetchWithRetry('https://x/y', {}, {
      fetchImpl, sleep: sleepRecord, jitterRandom: () => 0.5, logger
    });
  } catch (e) {
    threw = true;
    assert.match(String(e.message ?? e), /ECONNRESET/);
  }
  assert.ok(threw, 'final network error must throw');
  assert.equal(sleeps.length, 2);
}

// ---------- non-retryable 4xx returns immediately ----------

{
  sleeps.length = 0; log.length = 0;
  const { fetchImpl, calls } = makeFetch([jsonResp(404)]);
  const out = await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, jitterRandom: () => 0.5, logger
  });
  assert.equal(out.status, 404);
  assert.equal(calls.length, 1);
  assert.equal(sleeps.length, 0);
  assert.equal(log.length, 0);
}

// ---------- noRetry option disables retries ----------

{
  sleeps.length = 0; log.length = 0;
  const { fetchImpl, calls } = makeFetch([jsonResp(503), jsonResp(200, '{}')]);
  const out = await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, logger, noRetry: true
  });
  assert.equal(out.status, 503, 'noRetry returns first response as-is');
  assert.equal(calls.length, 1);
  assert.equal(sleeps.length, 0);
}

// ---------- GOOGLE_HEALTH_NO_RETRY env var ----------

{
  sleeps.length = 0; log.length = 0;
  process.env.GOOGLE_HEALTH_NO_RETRY = 'true';
  try {
    const { fetchImpl, calls } = makeFetch([jsonResp(500), jsonResp(200, '{}')]);
    const out = await fetchWithRetry('https://x/y', {}, {
      fetchImpl, sleep: sleepRecord, logger
    });
    assert.equal(out.status, 500, 'env var disables retries');
    assert.equal(calls.length, 1);
  } finally {
    delete process.env.GOOGLE_HEALTH_NO_RETRY;
  }
}

// ---------- jitter bounds: ±20% ----------

{
  // Low jitter (random=0) → factor 0.8 → 500 * 0.8 = 400
  sleeps.length = 0; log.length = 0;
  const { fetchImpl } = makeFetch([jsonResp(500), jsonResp(200, '{}')]);
  await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, jitterRandom: () => 0, logger
  });
  assert.equal(sleeps[0], 400, '0 random → low-jitter 400ms');

  // High jitter (random→1) → factor ~1.2 → 500 * 1.2 = 600
  sleeps.length = 0; log.length = 0;
  const { fetchImpl: f2 } = makeFetch([jsonResp(500), jsonResp(200, '{}')]);
  await fetchWithRetry('https://x/y', {}, {
    fetchImpl: f2, sleep: sleepRecord, jitterRandom: () => 0.999999, logger
  });
  assert.equal(sleeps[0], 600, '~1 random → high-jitter 600ms');
}

console.log(JSON.stringify({ ok: true, http_retry: true }, null, 2));

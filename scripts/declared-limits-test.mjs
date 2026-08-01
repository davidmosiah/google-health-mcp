/**
 * Gate for the STATED LIMITS, one layer inside the gate for the key list.
 *
 * Why this file exists: 0.7.0 shipped `redaction-doc-test.mjs`, which proves the published
 * LIST of redacted keys against the exported list, character for character. The LIMITS printed
 * next to that list — "raw requires explicit_user_intent", "summary is never less restrictive",
 * "altitude is not location", "summary flattens to depth 2" — were prose that nothing compared
 * with behaviour. Same defect as the one 0.6.0 and 0.7.0 fixed, one layer further in: a public
 * promise with no behavioural test is a debt, not a feature.
 *
 * Two things are enforced here:
 *  1. every limit in the registry below is an assertion over observed OUTPUT of dist/;
 *  2. the registry and the `declared-limits` blocks published in README.md and SECURITY.md must
 *     be the same list, in the same order, with the same NOT VERIFIED labels — so a limit
 *     cannot be written into the docs without a test, and a limit that nobody can test must say
 *     so instead of reading like a guarantee.
 *
 * Writing this test also narrowed the text: SECURITY.md used to say raw "requires
 * explicit_user_intent=true", full stop. The code only requires it of an AGENT escalation —
 * a local `GOOGLE_HEALTH_PRIVACY_MODE=raw` default is honoured with no per-call intent. The
 * promise was wider than the code, so the text was narrowed to what
 * `local_raw_default_needs_no_per_call_intent` proves.
 *
 * All fixtures are synthetic (-11.111111 / -85.858585 coordinates, "synthetic-*" secrets).
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPrivacy, resolvePrivacyMode } from '../dist/services/privacy.js';
import { getConfig } from '../dist/services/config.js';
import { buildPrivacyAudit } from '../dist/services/audit.js';

const ENDPOINT = '/v4/users/me/dataTypes/exercise/dataPoints';
const DOCS = ['README.md', 'SECURITY.md'];

const home = mkdtempSync(join(tmpdir(), 'google-health-mcp-declared-limits-'));

/** A config built the way the server builds it, from an env map we control. */
function configFromEnv(extra = {}) {
  return getConfig({
    homeDir: home,
    env: {
      GOOGLE_HEALTH_CLIENT_ID: 'synthetic-client',
      GOOGLE_HEALTH_CLIENT_SECRET: 'synthetic-secret',
      GOOGLE_HEALTH_REDIRECT_URI: 'http://127.0.0.1:3000/callback',
      ...extra
    }
  });
}

/** Every primitive found anywhere in a payload — the only honest way to ask "did it leak?". */
function primitives(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) primitives(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) primitives(child, out);
    return out;
  }
  out.push(value);
  return out;
}

function keysOf(value, out = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    out.add(key);
    keysOf(child, out);
  }
  return out;
}

/** Record carrying a secret, a place container and physiology, at several depths. */
function mixedRecord() {
  return {
    name: 'users/synthetic/dataTypes/exercise/dataPoints/limits-1',
    access_token: 'synthetic-access-token',
    refresh_token: 'synthetic-refresh-token',
    id_token: 'synthetic-id-token',
    authorization: 'Bearer synthetic',
    dataSource: { platform: 'SYNTHETIC', email: 'synthetic@example.invalid' },
    // Note the un-listed numeric sibling: `accuracyMeters` is not in either key list, so it
    // only stays out of `summary` because the whole container was dropped BEFORE summarizing.
    location: { latitudeE7: -857474747, address: 'Rua Sintetica 0', accuracyMeters: 7777 },
    exercise: {
      steps: 4242,
      owner: { fullName: 'Synthetic Person', avatar: 'https://example.invalid/a.png' },
      latitude: -11.111111
    }
  };
}

const LEAKED = [
  'synthetic-access-token', 'synthetic-refresh-token', 'synthetic-id-token', 'Bearer synthetic',
  'synthetic@example.invalid', 'Synthetic Person', 'https://example.invalid/a.png',
  'Rua Sintetica 0', -857474747, -11.111111, 7777
];

/**
 * The registry. `check` runs against dist/ and must fail if the behaviour changes;
 * `verified: false` marks a statement that no test proves, which the docs must label.
 */
const LIMITS = [
  {
    id: 'default_mode_is_structured',
    check() {
      assert.equal(configFromEnv().privacyMode, 'structured',
        'a config with no GOOGLE_HEALTH_PRIVACY_MODE must resolve to structured');
      assert.equal(resolvePrivacyMode(configFromEnv(), undefined, {}), 'structured',
        'a call with no privacy_mode must run in structured');
    }
  },
  {
    id: 'raw_requires_explicit_user_intent',
    check() {
      const config = configFromEnv();
      assert.throws(
        () => resolvePrivacyMode(config, 'raw', {}),
        /USER_ACTION_REQUIRED/,
        'privacy_mode=raw without explicit_user_intent must be refused, not silently downgraded'
      );
      assert.throws(
        () => resolvePrivacyMode(config, 'raw', { explicit_user_intent: false }),
        /USER_ACTION_REQUIRED/,
        'explicit_user_intent=false is not intent'
      );
      assert.equal(resolvePrivacyMode(config, 'raw', { explicit_user_intent: true }), 'raw',
        'with intent, raw must actually be granted — a gate that never opens is not the claim');
      assert.equal(
        buildPrivacyAudit().notes.some((note) => note.includes('explicit_user_intent')),
        true,
        'the privacy audit an agent reads must publish the intent gate, not only the docs'
      );
    }
  },
  {
    id: 'local_raw_default_needs_no_per_call_intent',
    check() {
      const config = configFromEnv({ GOOGLE_HEALTH_PRIVACY_MODE: 'raw' });
      assert.equal(config.privacyMode, 'raw');
      assert.equal(resolvePrivacyMode(config, undefined, {}), 'raw',
        'the machine owner configuring raw is not an agent escalation and is honoured as-is');
    }
  },
  {
    id: 'raw_is_an_unfiltered_passthrough',
    check() {
      const record = mixedRecord();
      assert.deepEqual(applyPrivacy(ENDPOINT, record, 'raw'), record,
        'raw must return the upstream payload unchanged — redaction is structured/summary only');
    }
  },
  {
    id: 'structured_drops_identity_and_secret_keys',
    check() {
      const structured = applyPrivacy(ENDPOINT, mixedRecord(), 'structured');
      const survived = primitives(structured).filter((leaf) => LEAKED.includes(leaf));
      assert.deepEqual(survived, [], `structured leaked: ${survived.join(', ')}`);
      assert.equal(structured.exercise.steps, 4242, 'structured must keep physiology');
      assert.equal(structured.dataSource.platform, 'SYNTHETIC', 'structured must keep provenance');
      assert.equal(structured.name, 'users/synthetic/dataTypes/exercise/dataPoints/limits-1');
    }
  },
  {
    id: 'summary_is_never_less_restrictive_than_structured',
    check() {
      const record = mixedRecord();
      const structured = applyPrivacy(ENDPOINT, record, 'structured');
      const summary = applyPrivacy(ENDPOINT, record, 'summary');
      const droppedByStructured = primitives(record).filter((leaf) => !primitives(structured).includes(leaf));
      const reappeared = droppedByStructured.filter((leaf) => primitives(summary).includes(leaf));
      assert.deepEqual(reappeared, [],
        `summary re-promoted values structured had dropped: ${reappeared.join(', ')}`);
      const structuredKeys = keysOf(structured);
      const summaryOnlySensitive = [...keysOf(summary)].filter(
        (key) => !structuredKeys.has(key) && LEAKED.some((leak) => String(leak).includes(key))
      );
      assert.deepEqual(summaryOnlySensitive, [], 'summary must not invent keys structured dropped');
      assert.equal(summary.data_type, 'exercise',
        'summary must not name a dropped place container as the data type: summarizing before ' +
        'stripping makes the existence of a location record visible again');
      assert.equal(summary.value.steps, 4242, 'summary must still report the metric');
    }
  },
  {
    id: 'summary_flattens_numeric_leaves_to_depth_2',
    check() {
      const summary = applyPrivacy(ENDPOINT, {
        name: 'users/synthetic/dataTypes/exercise/dataPoints/limits-2',
        exercise: { d0: 10, nested1: { d1: 11, nested2: { d2: 12, nested3: { d3: 13 } } } }
      }, 'summary');
      assert.equal(summary.value.d0, 10, 'depth 0 must be promoted');
      assert.equal(summary.value.d1, 11, 'depth 1 must be promoted');
      assert.equal(summary.value.d2, 12, 'depth 2 must be promoted — this is the documented depth');
      assert.equal(summary.value.d3, undefined,
        'depth 3 must NOT be reported: summary is a flattener with a floor, not a full payload');
    }
  },
  {
    id: 'summary_promotes_unlisted_coordinate_keys',
    check() {
      const summary = applyPrivacy(ENDPOINT, {
        name: 'users/synthetic/dataTypes/exercise/dataPoints/limits-3',
        exercise: { steps: 4242, wgs84Northing: -85.858585 }
      }, 'summary');
      assert.equal(summary.value.wgs84Northing, -85.858585,
        'an unlisted coordinate key is promoted, not hidden — this is the honest limit, ' +
        'and the day it stops being true the docs must stop saying it');
    }
  },
  {
    id: 'altitude_and_elevation_are_not_location',
    check() {
      const structured = applyPrivacy(ENDPOINT, {
        name: 'users/synthetic/dataTypes/altitude/dataPoints/limits-4',
        altitude: { interval: { startTime: '2026-01-01T00:00:00Z' }, value: 812 },
        elevation: 812
      }, 'structured');
      assert.equal(structured.altitude.value, 812, 'altitude is an official v4 data type and must survive');
      assert.equal(structured.elevation, 812, 'elevation alone does not localize anyone');
    }
  },
  {
    id: 'altitude_inside_a_place_container_is_dropped',
    check() {
      const structured = applyPrivacy(ENDPOINT, {
        name: 'users/synthetic/dataTypes/exercise/dataPoints/limits-5',
        locations: [{ latitude: -11.111111, altitudeMeters: 812, elevation: 813 }],
        exercise: { steps: 4242 }
      }, 'structured');
      assert.equal(structured.locations, undefined, 'the place container must die whole');
      const survivors = primitives(structured);
      assert.equal(survivors.includes(812), false, 'altitude inside a place container dies with it');
      assert.equal(survivors.includes(813), false, 'elevation inside a place container dies with it');
      assert.equal(structured.exercise.steps, 4242, 'and the rest of the record survives');
    }
  },
  {
    id: 'location_guard_never_observed_upstream',
    verified: false
  }
];

for (const limit of LIMITS) {
  if (limit.verified === false) {
    assert.equal(typeof limit.check, 'undefined',
      `${limit.id}: an entry marked NOT VERIFIED must not carry a check — say it is untested or test it`);
    continue;
  }
  try {
    limit.check();
  } catch (error) {
    error.message = `declared limit "${limit.id}" is not what the code does:\n${error.message}`;
    throw error;
  }
}

/** Read the published limit ids, in order, out of a docs block. */
function readDocLimits(doc, text) {
  const pattern = /<!--\s*declared-limits:start\s*-->([\s\S]*?)<!--\s*declared-limits:end\s*-->/;
  const match = text.match(pattern);
  assert.ok(
    match,
    `${doc}: missing the "declared-limits" block. The published limits must stay inside the ` +
    `markers so this gate can compare them with behaviour — deleting the block is not a way to pass.`
  );
  return [...match[1].matchAll(/^\s*-\s+`([a-z0-9_]+)`\s+—\s+(.*)$/gm)].map((hit) => ({
    id: hit[1],
    unverified: /NOT VERIFIED/.test(hit[2])
  }));
}

const expectedIds = LIMITS.map((limit) => limit.id);

for (const doc of DOCS) {
  const documented = readDocLimits(doc, readFileSync(doc, 'utf8'));

  const missing = expectedIds.filter((id) => !documented.some((entry) => entry.id === id));
  assert.deepEqual(missing, [],
    `${doc}: limits proved by the test but never published: ${missing.join(', ')}`);

  const extra = documented.filter((entry) => !expectedIds.includes(entry.id)).map((entry) => entry.id);
  assert.deepEqual(extra, [],
    `${doc}: limits stated in the docs with no behavioural test: ${extra.join(', ')}. ` +
    `Write the test, or mark the line NOT VERIFIED and drop its check.`);

  assert.deepEqual(documented.map((entry) => entry.id), expectedIds,
    `${doc}: the published limits must mirror the registry exactly, in order.`);

  for (const limit of LIMITS) {
    const entry = documented.find((candidate) => candidate.id === limit.id);
    const shouldBeLabelled = limit.verified === false;
    assert.equal(
      entry.unverified, shouldBeLabelled,
      shouldBeLabelled
        ? `${doc} (${limit.id}): nothing tests this, so the line must say NOT VERIFIED instead of reading as a guarantee.`
        : `${doc} (${limit.id}): this limit IS proved by a test — do not label it NOT VERIFIED.`
    );
  }
}

rmSync(home, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  declared_limits: 'behaviour-verified',
  proved: LIMITS.filter((limit) => limit.verified !== false).length,
  labelled_not_verified: LIMITS.filter((limit) => limit.verified === false).map((limit) => limit.id),
  docs_checked: DOCS
}, null, 2));

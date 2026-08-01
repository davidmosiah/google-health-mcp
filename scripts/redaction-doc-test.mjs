/**
 * Gate for the PROSE, not the code.
 *
 * Why this file exists: a gate that proves the code does not prove the claim written next to
 * it. 0.6.0 shipped a behavioural GPS gate and, in the very same commit, a README enumerating
 * 20 keys against an export of 21 — `activities-tracker-gps` was enforced but never published.
 * Nothing compared the two, so the documented promise was free to drift from the drop-list
 * again, which is the original defect one layer up.
 *
 * This compares the key lists published in README.md and SECURITY.md, character for character
 * and in order, against the lists the server actually enforces and reports in
 * google_health_privacy_audit. Documentation drift is now a build failure.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GPS_REDACTED_KEYS, GPS_REDACTED_CONTAINER_KEYS } from '../dist/services/privacy.js';
import { buildPrivacyAudit } from '../dist/services/audit.js';

const DOCS = ['README.md', 'SECURITY.md'];

const BLOCKS = [
  { marker: 'gps-redacted-keys', expected: GPS_REDACTED_KEYS, label: 'GPS_REDACTED_KEYS' },
  { marker: 'gps-redacted-containers', expected: GPS_REDACTED_CONTAINER_KEYS, label: 'GPS_REDACTED_CONTAINER_KEYS' }
];

/** Extract the backticked tokens between <!-- marker:start --> and <!-- marker:end -->. */
function readBlock(doc, text, marker) {
  const pattern = new RegExp(`<!--\\s*${marker}:start\\s*-->([\\s\\S]*?)<!--\\s*${marker}:end\\s*-->`);
  const match = text.match(pattern);
  assert.ok(
    match,
    `${doc}: missing the "${marker}" block. The published key list must stay inside the markers ` +
    `so this gate can compare it with the code — deleting the block is not a way to pass.`
  );
  return [...match[1].matchAll(/`([^`]+)`/g)].map((hit) => hit[1]);
}

const checked = [];

for (const doc of DOCS) {
  const text = readFileSync(doc, 'utf8');
  for (const { marker, expected, label } of BLOCKS) {
    const documented = readBlock(doc, text, marker);

    const missing = expected.filter((key) => !documented.includes(key));
    assert.deepEqual(
      missing, [],
      `${doc} (${marker}): the server redacts keys the docs never mention: ${missing.join(', ')}. ` +
      `Enforcement is wider than the published promise.`
    );

    const extra = documented.filter((key) => !expected.includes(key));
    assert.deepEqual(
      extra, [],
      `${doc} (${marker}): the docs promise keys the server does NOT redact: ${extra.join(', ')}. ` +
      `A promise wider than the code is how the original defect shipped.`
    );

    // Order too: the published list must mirror the export, not merely overlap with it.
    assert.deepEqual(
      documented, [...expected],
      `${doc} (${marker}): the documented list must mirror ${label} exactly, in order.`
    );

    checked.push(`${doc}:${marker}`);
  }
}

// The audit is what an agent actually reads before forwarding a payload. It must serve the
// same lists the docs publish — a doc/code match is worthless if the tool reports a third thing.
const audit = buildPrivacyAudit();
assert.deepEqual([...audit.gps_redacted_keys], [...GPS_REDACTED_KEYS],
  'google_health_privacy_audit.gps_redacted_keys must serve the documented leaf list');
assert.deepEqual([...audit.gps_redacted_container_keys], [...GPS_REDACTED_CONTAINER_KEYS],
  'google_health_privacy_audit.gps_redacted_container_keys must serve the documented container list');

// The documented LIMITS must be published too, otherwise the promise silently reads as total.
for (const doc of DOCS) {
  const text = readFileSync(doc, 'utf8');
  assert.match(text, /altitude/i, `${doc} must state the altitude/elevation limit explicitly`);
  assert.match(text, /summary/i, `${doc} must state the summary-flattening limit explicitly`);
}

console.log(JSON.stringify({
  ok: true,
  redaction_docs: 'in-sync',
  blocks_checked: checked,
  leaf_keys: GPS_REDACTED_KEYS.length,
  container_keys: GPS_REDACTED_CONTAINER_KEYS.length
}, null, 2));

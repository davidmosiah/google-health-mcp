import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVER_VERSION, PINNED_NPM_PACKAGE } from '../dist/constants.js';
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const pkg = read('package.json');
const lock = read('package-lock.json');
const server = read('server.json');
function verify(p, l, s, runtime, pinned) {
  assert.equal(l.version, p.version);
  assert.equal(l.packages[''].version, p.version);
  assert.equal(s.version, p.version);
  const entry = s.packages.find((x) => x.registryType === 'npm');
  assert.equal(entry.identifier, p.name);
  assert.equal(entry.version, p.version);
  assert.equal(runtime, p.version);
  assert.equal(pinned, `${p.name}@${p.version}`);
}
verify(pkg, lock, server, SERVER_VERSION, PINNED_NPM_PACKAGE);
const stale = '0.7.8'; // Previous published version: negative fixture only.
for (const alter of [
  (x) => { x[1].version = stale; },
  (x) => { x[1].packages[''].version = stale; },
  (x) => { x[2].version = stale; },
  (x) => { x[2].packages.find((p) => p.registryType === 'npm').version = stale; },
  (x) => { x[3] = stale; },
  (x) => { x[4] = `${pkg.name}@${stale}`; },
]) {
  const fixture = structuredClone([pkg, lock, server, SERVER_VERSION, PINNED_NPM_PACKAGE]);
  alter(fixture);
  assert.throws(() => verify(...fixture), assert.AssertionError);
}
console.log(JSON.stringify({ ok: true, version: pkg.version, staleMetadataCases: 6 }));

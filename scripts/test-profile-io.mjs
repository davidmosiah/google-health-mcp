import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { getProfile, updateProfile, migrateFromLegacy } from '../dist/services/profile-store.js';
const original = { access: fs.access, readFile: fs.readFile, writeFile: fs.writeFile };
let writes = 0;
try {
  fs.writeFile = async () => { writes++; throw new Error('Unexpected profile write'); };
  for (const operation of ['access', 'readFile']) {
    fs.access = async () => {};
    fs.readFile = async () => { throw new Error('Unexpected read'); };
    fs[operation] = async () => { throw Object.assign(new Error('synthetic-sensitive-path'), { code: 'EACCES' }); };
    for (const run of [() => getProfile(), () => updateProfile({ notes: 'synthetic' }), ...(operation === 'access' ? [() => migrateFromLegacy()] : [])]) {
      await assert.rejects(run, error => error instanceof Error && /Stored wellness profile is invalid/.test(error.message) && !error.message.includes('synthetic-sensitive-path'));
    }
  }
  assert.equal(writes, 0);
  console.log('PASS 5 profile IO failures; no fallback, migration or writes');
} finally { Object.assign(fs, original); }

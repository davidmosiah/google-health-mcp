import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const home = await fs.mkdtemp(join(tmpdir(), 'profile-io-isolated-'));
const oldHome = process.env.HOME; const oldUserProfile = process.env.USERPROFILE;
process.env.HOME = home; process.env.USERPROFILE = home;
const { getProfile, updateProfile, migrateFromLegacy } = await import('../dist/services/profile-store.js');
const original = { lstat: fs.lstat, open: fs.open, writeFile: fs.writeFile };
let writes = 0;
try {
  fs.writeFile = async () => { writes++; throw new Error('Unexpected profile write'); };
  for (const operation of ['lstat', 'open']) {
    fs.lstat = async () => ({ isSymbolicLink: () => false });
    fs.open = async () => { throw new Error('Unexpected read'); };
    fs[operation] = async () => { throw Object.assign(new Error('synthetic-sensitive-path'), { code: 'EACCES' }); };
    for (const run of [() => getProfile(), () => updateProfile({ notes: 'synthetic' }), ...(operation === 'lstat' ? [() => migrateFromLegacy()] : [])]) {
      await assert.rejects(run, error => error instanceof Error && /Stored wellness profile is (invalid|unavailable)/.test(error.message) && !error.message.includes('synthetic-sensitive-path'));
    }
  }
  assert.equal(writes, 0);
  console.log('PASS 5 profile IO failures; no fallback, migration or writes');
} finally { Object.assign(fs, original); await fs.rm(home, { recursive: true, force: true }); if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome; if (oldUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = oldUserProfile; }

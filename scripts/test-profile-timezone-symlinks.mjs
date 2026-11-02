import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
const home = await fs.mkdtemp(join(tmpdir(), 'profile-timezone-synthetic-'));
const oldHome = process.env.HOME, oldUserProfile = process.env.USERPROFILE;
process.env.HOME = home; process.env.USERPROFILE = home;
const { profileTimezone, getProfilePath } = await import('../dist/services/profile-store.js');
const path = getProfilePath();
const candidates = [path, join(home, '.hermes/profiles/delx-wellness/wellness-profile.json'), join(home, '.openclaw-delx-wellness/workspace/wellness-profile.json')];
const bytes = JSON.stringify({ schema: 'delx-wellness-profile/v1', profile: { timezone: 'Europe/London' } });
const originalLstat = fs.lstat;
try {
  assert.equal(await profileTimezone(), undefined);
  await assert.rejects(fs.lstat(dirname(path)), { code: 'ENOENT' });
  for (const candidate of candidates) {
    await fs.mkdir(dirname(candidate), { recursive: true });
    await fs.writeFile(candidate, bytes);
    assert.equal(await profileTimezone(), 'Europe/London');
    await fs.unlink(candidate);
    if (process.platform !== 'win32') for (const dangling of [false, true]) {
      const target = candidate + '.synthetic-target';
      if (!dangling) await fs.writeFile(target, bytes);
      await fs.symlink(target, candidate);
      await assert.rejects(profileTimezone(), /Stored wellness profile is unavailable/);
      assert.equal((await fs.lstat(candidate)).isSymbolicLink(), true);
      assert.equal(await fs.readlink(candidate), target);
      if (dangling) await assert.rejects(fs.lstat(target), { code: 'ENOENT' });
      else assert.equal(await fs.readFile(target, 'utf8'), bytes);
      if (candidate !== path) await assert.rejects(fs.lstat(path), { code: 'ENOENT' });
      await assert.rejects(fs.lstat(path + '.lock'), { code: 'ENOENT' });
      await fs.unlink(candidate); if (!dangling) await fs.unlink(target);
    }
  }
  for (const code of ['EACCES', 'EPERM', 'EIO']) {
    fs.lstat = async () => { throw Object.assign(new Error('synthetic-sensitive-path'), { code }); };
    await assert.rejects(profileTimezone(), error => /Stored wellness profile is unavailable/.test(error.message) && !error.message.includes('synthetic-sensitive-path'));
  }
  fs.lstat = originalLstat;
  await fs.writeFile(candidates[1], bytes);
  await fs.writeFile(path, '{');
  await assert.rejects(profileTimezone(), /Stored wellness profile is invalid/);
  assert.equal(await fs.readFile(path, 'utf8'), '{');
  assert.equal(await fs.readFile(candidates[1], 'utf8'), bytes);
  console.log('PASS read-only timezone: missing/valid canonical+both legacy; live/dangling symlinks rejected unchanged on POSIX; lstat faults sanitized; malformed canonical blocks fallback.');
  if (process.platform === 'win32') console.log('SKIP real symlink fixtures on Windows: privileges are not assumed');
} finally {
  fs.lstat = originalLstat;
  await fs.rm(home, { recursive: true, force: true });
  if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
  if (oldUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = oldUserProfile;
}

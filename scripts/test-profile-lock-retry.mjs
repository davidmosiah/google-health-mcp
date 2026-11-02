import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { withProfileLock } from '../dist/services/profile-file.js';

const root = await fs.mkdtemp(join(tmpdir(), 'profile-lock-retry-'));
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const nowDescriptor = Object.getOwnPropertyDescriptor(performance, 'now');
const original = { mkdir: fs.mkdir, rmdir: fs.rmdir };
const sensitive = 'synthetic-private-path-or-value';
let cases = 0;

async function fixture(name, options) {
  const path = join(root, name, 'profile.json'), lock = `${path}.lock`;
  await original.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, 'original synthetic bytes');
  if (options.otherLock) {
    await original.mkdir(lock);
    await fs.writeFile(join(lock, 'owner-marker'), 'other synthetic owner');
  }
  let attempts = 0, callbacks = 0, removals = 0, owned = false, clockCalls = 0;
  Object.defineProperty(process, 'platform', { ...platformDescriptor, value: options.platform });
  if (options.clock) Object.defineProperty(performance, 'now', {
    configurable: true, value: () => options.clock(clockCalls++)
  });
  fs.mkdir = async (target, ...args) => {
    if (options.parentError && target === dirname(path)) {
      throw Object.assign(new Error(sensitive), { code: options.parentError });
    }
    if (target !== lock) return original.mkdir.call(fs, target, ...args);
    attempts += 1;
    assert.equal(callbacks, 0, 'no callback before successful acquisition');
    assert.equal(removals, 0, 'no lock removal while acquisition is failing');
    const code = options.code?.(attempts);
    if (code) throw Object.assign(new Error(sensitive), { code });
    const value = await original.mkdir.call(fs, target, ...args);
    owned = true;
    return value;
  };
  fs.rmdir = async (target, ...args) => {
    if (target !== lock) return original.rmdir.call(fs, target, ...args);
    removals += 1;
    assert.equal(owned, true, 'must not remove a lock not acquired by this call');
    if (options.releaseError) throw Object.assign(new Error(sensitive), { code: options.releaseError });
    return original.rmdir.call(fs, target, ...args);
  };
  let failure;
  const started = Date.now();
  try {
    await withProfileLock(path, async () => {
      assert.equal(owned, true);
      callbacks += 1;
      if (options.callbackError) throw new Error('synthetic callback failure');
      await fs.writeFile(path, 'updated synthetic bytes');
    });
  } catch (error) { failure = error; }
  finally {
    fs.mkdir = original.mkdir; fs.rmdir = original.rmdir;
    Object.defineProperty(process, 'platform', platformDescriptor);
    if (nowDescriptor) Object.defineProperty(performance, 'now', nowDescriptor);
    else delete performance.now;
  }
  const elapsed = Date.now() - started;
  if (options.error) {
    assert.match(failure?.message ?? '', options.error, name);
    assert.ok(!failure.message.includes(sensitive), 'filesystem errors remain sanitized');
  } else assert.equal(failure, undefined, name);
  assert.equal(callbacks, options.callbacks ?? 0, name);
  assert.equal(removals, options.removals ?? 0, name);
  if (options.attempts !== undefined) assert.equal(attempts, options.attempts, name);
  if (options.persistent) {
    assert.ok(elapsed >= 4500, 'persistent EPERM honors the existing deadline, not an immediate fallback');
    assert.ok(attempts > 1);
  }
  if (options.clockCalls !== undefined) assert.equal(clockCalls, options.clockCalls, name);
  assert.equal(await fs.readFile(path, 'utf8'), callbacks && !options.callbackError ? 'updated synthetic bytes' : 'original synthetic bytes');
  if (options.otherLock) {
    assert.equal(await fs.readFile(join(lock, 'owner-marker'), 'utf8'), 'other synthetic owner');
    assert.ok((await fs.lstat(lock)).isDirectory());
  } else if (options.releaseError) assert.ok((await fs.lstat(lock)).isDirectory());
  else await assert.rejects(fs.lstat(lock), { code: 'ENOENT' });
  cases += 1;
}

try {
  await fixture('win-one-eperm', { platform:'win32', code:n => n === 1 ? 'EPERM' : undefined, attempts:2, callbacks:1, removals:1 });
  await fixture('win-transient-mixed', { platform:'win32', code:n => ['EPERM','EPERM','EEXIST','EPERM'][n-1], attempts:5, callbacks:1, removals:1 });
  await fixture('win-persistent-eperm', { platform:'win32', code:() => 'EPERM', persistent:true, error:/profile lock is unavailable/ });
  for (const code of ['EACCES','EIO','ENOENT','EBUSY']) {
    await fixture(`win-${code}`, { platform:'win32', code:() => code, attempts:1, error:/profile lock is unavailable/ });
  }
  for (const platform of ['linux','darwin']) {
    await fixture(`${platform}-eperm`, { platform, code:() => 'EPERM', attempts:1, error:/profile lock is unavailable/ });
  }
  await fixture('win-parent-eperm', { platform:'win32', parentError:'EPERM', attempts:0, error:/profile storage is unavailable/ });
  await fixture('shared-deadline', { platform:'win32', clock:n => n * 2000,
    code:n => n > 8 ? 'EIO' : n % 2 ? 'EPERM' : 'EEXIST', attempts:3, clockCalls:4, error:/profile lock is unavailable/ });
  await fixture('other-owner', { platform:'win32', otherLock:true, clock:n => n * 6000, attempts:1, error:/profile is busy/ });
  await fixture('callback-failure', { platform:'win32', callbackError:true, attempts:1, callbacks:1, removals:1, error:/synthetic callback failure/ });
  await fixture('release-not-retried', { platform:'win32', releaseError:'EPERM', attempts:1, callbacks:1, removals:1, error:/lock could not be released/ });
  console.log(JSON.stringify({ok:true,suite:'profile-lock-retry',cases,realAccounts:0,
    guarantees:['mkdir-success-only ownership','single unchanged deadline','persistent denial fails closed','non-EPERM errors unchanged','no foreign lock removal','release errors not retried']}));
} finally {
  fs.mkdir = original.mkdir; fs.rmdir = original.rmdir;
  Object.defineProperty(process, 'platform', platformDescriptor);
  if (nowDescriptor) Object.defineProperty(performance, 'now', nowDescriptor); else delete performance.now;
  await fs.rm(root, { recursive:true, force:true });
}

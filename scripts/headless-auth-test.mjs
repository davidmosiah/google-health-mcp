import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import {
  detectHeadlessEnvironment,
  parseAuthOptions,
  parsePastedRedirect
} from '../dist/cli/auth.js';
import { buildConnectionStatus } from '../dist/services/connection-status.js';

const dir = mkdtempSync(join(tmpdir(), 'google-health-mcp-headless-'));

// Detection inputs are stripped so CLI assertions do not depend on whether CI
// runs on a headless ubuntu runner or a macOS/Windows one; each case sets
// GOOGLE_HEALTH_HEADLESS explicitly. Platform/DISPLAY logic is unit-tested above.
function childEnv(env) {
  const merged = { ...process.env, HOME: dir, USERPROFILE: dir };
  for (const key of ['SSH_CONNECTION', 'SSH_TTY', 'SSH_CLIENT', 'DISPLAY', 'WAYLAND_DISPLAY', 'GOOGLE_HEALTH_HEADLESS']) {
    delete merged[key];
  }
  return { ...merged, ...env };
}

function runCli(args, { env = {}, stdin = null } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['dist/index.js', ...args], {
      env: childEnv(env),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ status: null, stdout, stderr, timedOut: true });
    }, 20_000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, timedOut: false });
    });
    if (stdin !== null) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

// ---------- (a) headless detection ----------
{
  assert.equal(detectHeadlessEnvironment({}, 'linux').headless, true, 'bare linux with no DISPLAY is headless');
  assert.match(detectHeadlessEnvironment({}, 'linux').reason, /DISPLAY/);

  assert.equal(detectHeadlessEnvironment({ DISPLAY: ':0' }, 'linux').headless, false);
  assert.equal(detectHeadlessEnvironment({ WAYLAND_DISPLAY: 'wayland-0' }, 'linux').headless, false);

  assert.equal(detectHeadlessEnvironment({}, 'darwin').headless, false, 'desktop platforms are not headless');
  assert.equal(detectHeadlessEnvironment({}, 'win32').headless, false);

  // SSH wins over a local display: the display belongs to the remote host.
  for (const key of ['SSH_CONNECTION', 'SSH_TTY', 'SSH_CLIENT']) {
    const detection = detectHeadlessEnvironment({ [key]: 'x', DISPLAY: ':0' }, 'linux');
    assert.equal(detection.headless, true, `${key} implies headless`);
    assert.match(detection.reason, /SSH/);
  }
  assert.equal(detectHeadlessEnvironment({ SSH_TTY: 'x' }, 'darwin').headless, true, 'SSH to a Mac is still headless');

  // Explicit override in both directions.
  for (const value of ['1', 'true', 'yes', 'on']) {
    assert.equal(detectHeadlessEnvironment({ GOOGLE_HEALTH_HEADLESS: value, DISPLAY: ':0' }, 'linux').headless, true);
  }
  for (const value of ['0', 'false', 'no', 'off']) {
    assert.equal(detectHeadlessEnvironment({ GOOGLE_HEALTH_HEADLESS: value, SSH_TTY: 'x' }, 'linux').headless, false);
  }
}

// ---------- (b) flag parsing ----------
{
  const bare = parseAuthOptions([]);
  assert.deepEqual(
    { json: bare.json, noOpen: bare.noOpen, manual: bare.manual, localCallback: bare.localCallback, printUrl: bare.printUrl, code: bare.code },
    { json: false, noOpen: false, manual: false, localCallback: false, printUrl: false, code: undefined }
  );

  for (const alias of ['--manual', '--headless', '--no-browser']) {
    assert.equal(parseAuthOptions([alias]).manual, true, `${alias} selects manual auth`);
  }
  assert.equal(parseAuthOptions(['--local-callback']).localCallback, true);
  assert.equal(parseAuthOptions(['--print-url']).printUrl, true);
  assert.equal(parseAuthOptions(['--code', 'abc123']).code, 'abc123');
  assert.throws(() => parseAuthOptions(['--code']), /Missing value for --code/);
  assert.throws(() => parseAuthOptions(['--code', '--json']), /Missing value for --code/);
}

// ---------- (c) pasted redirect parsing ----------
{
  const state = 'deadbeef';

  // Full redirect URL round-trips whole, so exchangeCode can also read `scope`.
  const full = `http://127.0.0.1:3000/callback?code=4/abc-DEF_123&state=${state}&scope=https://www.googleapis.com/auth/googlehealth.sleep.readonly`;
  assert.equal(parsePastedRedirect(full, state), full);

  // Bare codes are accepted for operators who only copy the code parameter.
  assert.equal(parsePastedRedirect('4/abc-DEF_123', state), '4/abc-DEF_123');

  // Shells and chat clients love to add surrounding quotes and whitespace.
  assert.equal(parsePastedRedirect('  "4/abc-DEF_123"  ', state), '4/abc-DEF_123');
  assert.equal(parsePastedRedirect(`  ${full}\n`, state), full);

  // A URL with no state is still usable (some operators trim the query).
  assert.equal(
    parsePastedRedirect('http://127.0.0.1:3000/callback?code=xyz', state),
    'http://127.0.0.1:3000/callback?code=xyz'
  );

  assert.throws(() => parsePastedRedirect('', state), /No authorization code provided/);
  assert.throws(() => parsePastedRedirect('   ', state), /No authorization code provided/);
  assert.throws(() => parsePastedRedirect('some words here', state), /does not look like an authorization code/);
  assert.throws(
    () => parsePastedRedirect('http://127.0.0.1:3000/callback?error=access_denied', state),
    /Google Health authorization failed: access_denied/
  );
  assert.throws(
    () => parsePastedRedirect('http://127.0.0.1:3000/callback', state),
    /no `code` parameter/
  );
  assert.throws(
    () => parsePastedRedirect(`http://127.0.0.1:3000/callback?code=xyz&state=other`, state),
    /state mismatch/
  );
}

// ---------- (d) doctor reports headless status ----------
{
  const headlessStatus = await buildConnectionStatus({ env: { GOOGLE_HEALTH_HEADLESS: '1' }, homeDir: dir });
  assert.equal(headlessStatus.headless.detected, true);
  assert.ok(
    headlessStatus.next_steps.some((step) => step.includes('auth --manual')),
    'headless hosts are told to use auth --manual'
  );

  const desktopStatus = await buildConnectionStatus({ env: { GOOGLE_HEALTH_HEADLESS: '0' }, homeDir: dir });
  assert.equal(desktopStatus.headless.detected, false);
  assert.ok(desktopStatus.next_steps.some((step) => step.includes('google-health-mcp-server auth')));
  assert.ok(!desktopStatus.next_steps.some((step) => step.includes('auth --manual')));
}

// ---------- (e) end-to-end CLI behaviour on a headless host ----------
// The callback port is held by a blocker socket for the manual-flow assertions,
// then released so the forced local-callback flow can bind it.
const blocker = createServer((_req, res) => res.writeHead(204).end());
await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
const blockerAddress = blocker.address();
assert.ok(blockerAddress && typeof blockerAddress === 'object');
const PORT = blockerAddress.port;

const ENV = {
  GOOGLE_HEALTH_CLIENT_ID: 'client-id',
  GOOGLE_HEALTH_CLIENT_SECRET: 'client-secret',
  GOOGLE_HEALTH_REDIRECT_URI: `http://127.0.0.1:${PORT}/callback`
};
const HEADLESS_ENV = { ...ENV, GOOGLE_HEALTH_HEADLESS: '1' };

{
  const printed = await runCli(['auth', '--print-url'], { env: ENV });
  assert.equal(printed.status, 0);
  assert.match(printed.stdout, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  assert.match(printed.stdout, /client_id=client-id/);
  assert.match(printed.stdout, new RegExp(`redirect_uri=http%3A%2F%2F127\\.0\\.0\\.1%3A${PORT}%2Fcallback`));
  assert.doesNotMatch(printed.stdout, /client-secret/, 'the auth URL must never carry the client secret');
}

// The whole point: with the callback port already taken, manual auth must not
// try to bind it. The old browser-only flow died here with EADDRINUSE.
{
  try {
    const manual = await runCli(['auth', '--manual'], { env: HEADLESS_ENV, stdin: '' });
    assert.equal(manual.timedOut, false, 'manual auth must not hang waiting for a callback');
    assert.equal(manual.status, 1);
    assert.doesNotMatch(manual.stderr, /EADDRINUSE/, 'manual auth must not bind the callback port');
    assert.match(manual.stdout, /Authorization \(headless\)/);
    assert.match(manual.stdout, /accounts\.google\.com/);
    assert.match(manual.stderr, /No authorization code was pasted/);
    assert.match(manual.stderr, /--code/);

    // Auto-selection: no flags at all, detection alone picks the manual flow.
    const auto = await runCli(['auth'], { env: HEADLESS_ENV, stdin: '' });
    assert.equal(auto.timedOut, false);
    assert.match(auto.stdout, /Authorization \(headless\)/, 'headless hosts default to manual auth');
    assert.doesNotMatch(auto.stderr, /EADDRINUSE/);

    // ...and a non-headless host still gets the callback flow, which is what
    // fails on the busy port. This is the pre-change behaviour, kept intact.
    const desktop = await runCli(['auth', '--no-open'], {
      env: { ...ENV, GOOGLE_HEALTH_HEADLESS: '0', GOOGLE_HEALTH_AUTH_TIMEOUT_MS: '1500' },
      stdin: ''
    });
    assert.equal(desktop.timedOut, false);
    assert.doesNotMatch(desktop.stdout, /Authorization \(headless\)/, 'desktop hosts keep the callback flow');
    assert.match(desktop.stderr, /EADDRINUSE/, 'the callback flow does bind the port');

    // A pasted redirect carrying an error is reported before any token request.
    const denied = await runCli(['auth', '--manual'], {
      env: ENV,
      stdin: `http://127.0.0.1:${PORT}/callback?error=access_denied\n`
    });
    assert.equal(denied.timedOut, false);
    assert.equal(denied.status, 1);
    assert.match(denied.stderr, /Google Health authorization failed: access_denied/);

    // Same for --code, which never prompts at all.
    const badCode = await runCli(['auth', '--code', 'not a code'], { env: ENV });
    assert.equal(badCode.timedOut, false);
    assert.equal(badCode.status, 1);
    assert.match(badCode.stderr, /does not look like an authorization code/);
    assert.doesNotMatch(badCode.stdout, /Authorization \(headless\)/, '--code skips the instructions');
  } catch (error) {
    await new Promise((resolve) => blocker.close(resolve));
    throw error;
  }
}

// --json keeps stdout parseable: instructions and the prompt go to stderr.
{
  const jsonManual = await runCli(['auth', '--manual', '--json'], { env: ENV, stdin: '' });
  assert.equal(jsonManual.timedOut, false);
  assert.equal(jsonManual.stdout, '', '--json must not print instructions on stdout');
  assert.match(jsonManual.stderr, /Authorization \(headless\)/);
}

// --local-callback overrides detection and warns about the SSH tunnel. The
// blocker is released first so the callback server can actually bind.
await new Promise((resolve) => blocker.close(resolve));
{
  const forced = await runCli(['auth', '--local-callback', '--no-open'], {
    env: { ...HEADLESS_ENV, GOOGLE_HEALTH_AUTH_TIMEOUT_MS: '1500' }
  });
  assert.equal(forced.timedOut, false);
  assert.equal(forced.status, 1);
  assert.match(forced.stdout, /headless environment/);
  assert.match(forced.stdout, new RegExp(`ssh -L ${PORT}:127\\.0\\.0\\.1:${PORT}`));
  assert.match(forced.stderr, /Timed out waiting for GOOGLE_HEALTH OAuth callback/);
}

rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, headless_auth: true, detection: true, paste_parsing: true, cli: true }, null, 2));

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import * as authModule from '../dist/cli/auth.js';
import { buildConnectionStatus } from '../dist/services/connection-status.js';
import { DEFAULT_SCOPES } from '../dist/constants.js';

const { parseLocalRedirectUri } = authModule;

const dir = mkdtempSync(join(tmpdir(), 'google-health-mcp-cli-'));
const supportsChmodAssertions = process.platform !== 'win32';

function spawnNode(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

try {
  const missing = await buildConnectionStatus({ env: {}, homeDir: dir, nowMs: 1_000_000 });
  assert.equal(missing.ok, false);
  assert.equal(missing.ready_for_google_health_api, false);
  assert.deepEqual(missing.missing_env, ['GOOGLE_HEALTH_CLIENT_ID', 'GOOGLE_HEALTH_CLIENT_SECRET', 'GOOGLE_HEALTH_REDIRECT_URI']);
  assert.ok(missing.next_steps.some((step) => step.includes('GOOGLE_HEALTH_CLIENT_ID')));

  const tokenPath = join(dir, 'tokens.json');
  writeFileSync(tokenPath, JSON.stringify({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_at: 2_000_000,
    scope: DEFAULT_SCOPES.join(' ')
  }), { mode: 0o600 });

  const ready = await buildConnectionStatus({
    env: {
      GOOGLE_HEALTH_CLIENT_ID: 'client-id',
      GOOGLE_HEALTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_HEALTH_REDIRECT_URI: 'http://127.0.0.1:4567/callback',
      GOOGLE_HEALTH_TOKEN_PATH: tokenPath,
      GOOGLE_HEALTH_PRIVACY_MODE: 'summary',
      GOOGLE_HEALTH_CACHE: 'sqlite'
    },
    homeDir: dir,
    nowMs: 1_000_000
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.ready_for_google_health_api, true);
  assert.equal(ready.privacy_mode, 'summary');
  assert.equal(ready.cache.enabled, true);
  assert.equal(ready.token.exists, true);
  assert.equal(ready.token.secure_permissions, true);
  assert.equal(ready.token.has_refresh_token, true);
  assert.equal(ready.oauth.scope_status, 'ok');

  assert.deepEqual(parseLocalRedirectUri('http://127.0.0.1:4567/callback'), {
    host: '127.0.0.1',
    port: 4567,
    path: '/callback'
  });
  assert.throws(() => parseLocalRedirectUri('https://example.com/callback'), /local redirect URI/i);

  assert.equal(typeof authModule.buildBrowserOpenCommand, 'function');
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/googlehealth.profile.readonly+https://www.googleapis.com/auth/googlehealth.sleep.readonly&response_type=code&client_id=client-id';
  const windowsOpen = authModule.buildBrowserOpenCommand(authUrl, 'win32');
  assert.equal(windowsOpen.command, 'powershell.exe');
  assert.deepEqual(windowsOpen.args, [
    '-NoProfile',
    '-Command',
    'Start-Process -FilePath $env:GOOGLE_HEALTH_MCP_AUTH_URL'
  ]);
  assert.equal(windowsOpen.env.GOOGLE_HEALTH_MCP_AUTH_URL, authUrl.replace(/\+/g, '%20'));
  assert.match(windowsOpen.env.GOOGLE_HEALTH_MCP_AUTH_URL, /response_type=code/);
  assert.doesNotMatch(windowsOpen.args.join(' '), /accounts\.google\.com/);

  const doctor = spawnSync(process.execPath, ['dist/index.js', 'doctor', '--json'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir
    }
  });
  assert.equal(doctor.status, 0, doctor.stderr);
  const doctorPayload = JSON.parse(doctor.stdout);
  assert.equal(doctorPayload.ok, false);
  assert.ok(doctorPayload.next_steps.some((step) => step.includes('GOOGLE_HEALTH_CLIENT_ID')));

  const typo = spawnSync(process.execPath, ['dist/index.js', 'docter'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir
    }
  });
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /Unknown command: docter/);

  const authWithoutEnv = spawnSync(process.execPath, ['dist/index.js', 'auth', '--no-open'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir
    }
  });
  assert.equal(authWithoutEnv.status, 1);
  assert.match(authWithoutEnv.stderr, /Missing required GOOGLE_HEALTH environment variables/);
  assert.doesNotMatch(authWithoutEnv.stderr, new RegExp('at .*dist/'));

  const setup = spawnSync(process.execPath, [
    'dist/index.js',
    'setup',
    '--client',
    'generic',
    '--client-id',
    'client-id-from-setup',
    '--client-secret',
    'client-secret-from-setup',
    '--redirect-uri',
    'http://127.0.0.1:4567/callback',
    '--privacy-mode',
    'summary',
    '--cache',
    'sqlite',
    '--no-auth',
    '--json'
  ], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir
    }
  });
  assert.equal(setup.status, 0, setup.stderr);
  const setupPayload = JSON.parse(setup.stdout);
  assert.equal(setupPayload.ok, true);
  assert.match(setupPayload.config_path, /config\.json$/);
  assert.match(setupPayload.client_config_path, /generic\.json$/);

  const configPath = join(dir, '.google-health-mcp', 'config.json');
  const configMode = (statSync(configPath).mode & 0o777).toString(8);
  if (supportsChmodAssertions) assert.equal(configMode, '600');
  const savedConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(savedConfig.GOOGLE_HEALTH_CLIENT_ID, 'client-id-from-setup');
  assert.equal(savedConfig.GOOGLE_HEALTH_CLIENT_SECRET, 'client-secret-from-setup');
  assert.equal(savedConfig.GOOGLE_HEALTH_SCOPES, DEFAULT_SCOPES.join(' '));
  assert.equal(savedConfig.GOOGLE_HEALTH_PRIVACY_MODE, 'summary');
  assert.equal(savedConfig.GOOGLE_HEALTH_CACHE, 'sqlite');

  const doctorAfterSetup = spawnSync(process.execPath, ['dist/index.js', 'doctor', '--json'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir
    }
  });
  assert.equal(doctorAfterSetup.status, 0, doctorAfterSetup.stderr);
  const doctorAfterSetupPayload = JSON.parse(doctorAfterSetup.stdout);
  assert.deepEqual(doctorAfterSetupPayload.missing_env, []);
  assert.equal(doctorAfterSetupPayload.config.source, 'local_config');
  assert.equal(doctorAfterSetupPayload.automatic_auth_supported, true);
  assert.ok(doctorAfterSetupPayload.next_steps.some((step) => step.includes('auth')));

  const sleepSetup = spawnSync(process.execPath, [
    'dist/index.js',
    'setup',
    '--client',
    'generic',
    '--client-id',
    'sleep-client-id',
    '--client-secret',
    'sleep-client-secret',
    '--redirect-uri',
    'http://127.0.0.1:4567/callback',
    '--scope-preset',
    'sleep',
    '--token-path',
    tokenPath,
    '--no-auth',
    '--json'
  ], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir
    }
  });
  assert.equal(sleepSetup.status, 0, sleepSetup.stderr);
  const sleepConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(sleepConfig.GOOGLE_HEALTH_SCOPES, [
    'https://www.googleapis.com/auth/googlehealth.profile.readonly',
    'https://www.googleapis.com/auth/googlehealth.settings.readonly',
    'https://www.googleapis.com/auth/googlehealth.sleep.readonly'
  ].join(' '));
  assert.doesNotMatch(sleepConfig.GOOGLE_HEALTH_SCOPES, /nutrition/);

  if (supportsChmodAssertions) {
    chmodSync(configPath, 0o644);
    chmodSync(tokenPath, 0o644);
  }
  const fixedDoctor = spawnSync(process.execPath, [
    'dist/index.js',
    'doctor',
    '--fix',
    '--json',
    '--home-dir',
    dir
  ], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH
    }
  });
  assert.equal(fixedDoctor.status, 0, fixedDoctor.stderr);
  const fixedDoctorPayload = JSON.parse(fixedDoctor.stdout);
  assert.equal(fixedDoctorPayload.ok, true);
  if (supportsChmodAssertions) {
    assert.ok(fixedDoctorPayload.fixes_applied.includes(`chmod 600 ${configPath}`));
    assert.ok(fixedDoctorPayload.fixes_applied.includes(`chmod 600 ${tokenPath}`));
    assert.equal((statSync(configPath).mode & 0o777).toString(8), '600');
    assert.equal((statSync(tokenPath).mode & 0o777).toString(8), '600');
  } else {
    assert.ok(fixedDoctorPayload.warnings.some((warning) => /Windows/.test(warning)));
  }

  const support = spawnSync(process.execPath, [
    'dist/index.js',
    'support',
    '--redacted',
    '--json',
    '--home-dir',
    dir
  ], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH
    }
  });
  assert.equal(support.status, 0, support.stderr);
  const supportText = support.stdout;
  const supportPayload = JSON.parse(supportText);
  assert.equal(supportPayload.package.name, 'google-health-mcp-unofficial');
  assert.equal(supportPayload.redacted, true);
  assert.equal(supportPayload.config.required_env.GOOGLE_HEALTH_CLIENT_ID, true);
  assert.equal(supportPayload.config.required_env.GOOGLE_HEALTH_CLIENT_SECRET, true);
  assert.match(supportPayload.issue_body, /Google Health MCP support bundle/);
  assert.doesNotMatch(supportText, /sleep-client-secret/);
  assert.doesNotMatch(supportText, /"access"/);
  assert.doesNotMatch(supportText, /"refresh"/);

  writeFileSync(tokenPath, JSON.stringify({
    access_token: 'live-access-token',
    refresh_token: 'live-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    scope: DEFAULT_SCOPES.join(' ')
  }), { mode: 0o600 });
  const liveServer = createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer live-access-token');
    if (req.url === '/v4/users/me/identity') {
      res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' }).end(JSON.stringify({ userId: 'redacted-user' }));
      return;
    }
    if (req.url === '/v4/users/me/profile') {
      res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' }).end(JSON.stringify({ profile: 'ok' }));
      return;
    }
    if (req.url === '/v4/users/me/settings') {
      res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' }).end(JSON.stringify({ units: 'metric' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json', Connection: 'close' }).end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise((resolve) => liveServer.listen(0, '127.0.0.1', resolve));
  try {
    const address = liveServer.address();
    assert.ok(address && typeof address === 'object');
    const liveDoctor = await spawnNode([
      'dist/index.js',
      'doctor',
      '--live',
      '--json',
      '--home-dir',
      dir
    ], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        GOOGLE_HEALTH_API_BASE_URL: `http://127.0.0.1:${address.port}`
      }
    });
    assert.equal(liveDoctor.status, 0, liveDoctor.stderr);
    const liveDoctorText = liveDoctor.stdout;
    const liveDoctorPayload = JSON.parse(liveDoctorText);
    assert.equal(liveDoctorPayload.live_check.requested, true);
    assert.equal(liveDoctorPayload.live_check.api_reachable, true);
    assert.equal(liveDoctorPayload.live_check.checks.identity.ok, true);
    assert.equal(liveDoctorPayload.live_check.checks.profile.ok, true);
    assert.equal(liveDoctorPayload.live_check.checks.settings.ok, true);
    assert.doesNotMatch(liveDoctorText, /live-access-token/);
    assert.doesNotMatch(liveDoctorText, /live-refresh-token/);
  } finally {
    liveServer.closeAllConnections?.();
    await new Promise((resolve) => liveServer.close(resolve));
  }

  console.log(JSON.stringify({ ok: true, cli_ux: true, doctor: true, status: true, auth_plan: true, setup: true }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

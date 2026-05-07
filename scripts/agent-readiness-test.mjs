import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildConnectionStatus } from '../dist/services/connection-status.js';
import { formatCollection } from '../dist/services/format.js';
import { DEFAULT_SCOPES } from '../dist/constants.js';

const dir = mkdtempSync(join(tmpdir(), 'google-health-mcp-agent-readiness-'));

try {
  const markdown = formatCollection('Google Health Activities', [
    { id: 1, name: 'Morning Tennis', sport_type: 'Tennis', start_date: '2026-04-27T12:30:43Z', distance: 41.3 },
    { id: 2, name: 'Afternoon Tennis', sport_type: 'Tennis', start_date: '2026-04-26T20:05:51Z', distance: 4557 }
  ], {
    endpoint: '/1/user/-/activities/list.json',
    privacy_mode: 'summary',
    count: 2,
    records: [{ id: 1 }, { id: 2 }],
    pages_fetched: 1
  });

  assert.doesNotMatch(markdown, /\[object Object\]/, 'Markdown previews must never leak JavaScript object stringification.');
  assert.doesNotMatch(markdown, /\*\*records\*\*/i, 'Collection markdown should not duplicate full record arrays in metadata.');
  assert.match(markdown, /Morning Tennis/);

  const tokenPath = join(dir, 'tokens.json');
  writeFileSync(tokenPath, JSON.stringify({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_at: 2_000_000,
    scope: 'https://www.googleapis.com/auth/googlehealth.profile.readonly'
  }), { mode: 0o600 });

  const limited = await buildConnectionStatus({
    env: {
      GOOGLE_HEALTH_CLIENT_ID: 'client-id',
      GOOGLE_HEALTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_HEALTH_REDIRECT_URI: 'http://127.0.0.1:4567/callback',
      GOOGLE_HEALTH_TOKEN_PATH: tokenPath
    },
    homeDir: dir,
    nowMs: 1_000_000
  });

  assert.equal(limited.ready_for_google_health_api, false, 'A profile-only token should not be reported as fully ready for Google Health health tools.');
  assert.equal(limited.ok, false);
  assert.deepEqual(limited.oauth.granted_scopes, ['https://www.googleapis.com/auth/googlehealth.profile.readonly']);
  assert.ok(limited.oauth.missing_recommended_scopes.includes('https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly'));
  assert.ok(limited.oauth.missing_recommended_scopes.includes('https://www.googleapis.com/auth/googlehealth.sleep.readonly'));
  assert.equal(limited.oauth.activity_tools_ready, false);
  assert.equal(limited.oauth.profile_tools_ready, true);
  assert.ok(limited.next_steps.some((step) => /re-authorize/i.test(step) && /sleep/.test(step)));

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
      GOOGLE_HEALTH_TOKEN_PATH: tokenPath
    },
    homeDir: dir,
    nowMs: 1_000_000
  });

  assert.equal(ready.ok, true);
  assert.equal(ready.ready_for_google_health_api, true);
  assert.deepEqual(ready.oauth.missing_recommended_scopes, []);
  assert.equal(ready.oauth.activity_tools_ready, true);

  console.log(JSON.stringify({ ok: true, markdown: true, scope_diagnostics: true }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

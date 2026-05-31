import assert from 'node:assert/strict';
import {
  checkRemoteWriteGate,
  isLiveWriteAuthorized,
  GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE
} from '../dist/services/remote-write-gate.js';

const SCOPE = GOOGLE_HEALTH_NUTRITION_WRITE_SCOPE;
const ctx = { response_format: 'json', title: 'Log Nutrition' };

// ---------- (a) missing scope → WRITE_SCOPE_MISSING ----------
{
  const res = checkRemoteWriteGate(
    { explicit_user_intent: true, dry_run: false, granted_scopes: ['https://www.googleapis.com/auth/googlehealth.nutrition.readonly'] },
    ctx
  );
  assert.ok(res, 'missing scope must refuse (non-null)');
  assert.equal(res.structuredContent.ok, false, 'refusal is success-shaped: structuredContent.ok===false');
  assert.equal(res.structuredContent.error, 'WRITE_SCOPE_MISSING');
  assert.equal(res.isError, undefined, 'refusal must NOT be an isError tool failure');
  assert.match(res.structuredContent.message, /Re-authorize with the nutrition-write preset/);
  // scope is checked FIRST even when intent is also present
}

// ---------- (a2) no granted_scopes at all → WRITE_SCOPE_MISSING ----------
{
  const res = checkRemoteWriteGate({ explicit_user_intent: true, dry_run: false }, ctx);
  assert.ok(res);
  assert.equal(res.structuredContent.error, 'WRITE_SCOPE_MISSING');
}

// ---------- (b) scope present + intent undefined/false → USER_ACTION_REQUIRED ----------
for (const intent of [undefined, false]) {
  const res = checkRemoteWriteGate({ explicit_user_intent: intent, dry_run: false, granted_scopes: [SCOPE] }, ctx);
  assert.ok(res, `intent=${intent} must refuse`);
  assert.equal(res.structuredContent.ok, false);
  assert.equal(res.structuredContent.error, 'USER_ACTION_REQUIRED');
  assert.equal(res.isError, undefined, 'USER_ACTION_REQUIRED is success-shaped, not isError');
  assert.match(res.structuredContent.message, /explicit_user_intent=true/);
}

// ---------- (b2) USER_ACTION_REQUIRED markdown body carries the exact hint text ----------
{
  const res = checkRemoteWriteGate(
    { explicit_user_intent: false, dry_run: false, granted_scopes: [SCOPE] },
    { response_format: 'markdown', title: 'Log Nutrition' }
  );
  // markdown response_format → content[0].text is the bulletList, which carries the hint
  assert.match(res.content[0].text, /Set explicit_user_intent=true once the user has confirmed\./);
}

// ---------- (c) scope + intent true + dry_run default → gate null, isLiveWriteAuthorized false ----------
{
  // dry_run omitted entirely (schema default true; gate treats undefined as true)
  const input = { explicit_user_intent: true, granted_scopes: [SCOPE] };
  const res = checkRemoteWriteGate(input, ctx);
  assert.equal(res, null, 'all preconditions pass → null (caller proceeds)');
  assert.equal(isLiveWriteAuthorized(input), false, 'undefined dry_run defaults to TRUE → not a live write');

  const explicitDryRun = { explicit_user_intent: true, dry_run: true, granted_scopes: [SCOPE] };
  assert.equal(checkRemoteWriteGate(explicitDryRun, ctx), null);
  assert.equal(isLiveWriteAuthorized(explicitDryRun), false, 'dry_run:true → not a live write');
}

// ---------- (d) scope + intent true + dry_run:false → isLiveWriteAuthorized true ----------
{
  const input = { explicit_user_intent: true, dry_run: false, granted_scopes: [SCOPE] };
  assert.equal(checkRemoteWriteGate(input, ctx), null, 'gate passes');
  assert.equal(isLiveWriteAuthorized(input), true, 'live write authorized');
}

// ---------- (d2) isLiveWriteAuthorized requires ALL three (defense in depth) ----------
assert.equal(isLiveWriteAuthorized({ explicit_user_intent: true, dry_run: false, granted_scopes: [] }), false, 'no scope → not authorized');
assert.equal(isLiveWriteAuthorized({ explicit_user_intent: false, dry_run: false, granted_scopes: [SCOPE] }), false, 'no intent → not authorized');
assert.equal(isLiveWriteAuthorized({ dry_run: false, granted_scopes: [SCOPE] }), false, 'undefined intent → not authorized');

// ---------- markdown response_format also carries the refusal text ----------
{
  const res = checkRemoteWriteGate(
    { explicit_user_intent: true, dry_run: false, granted_scopes: [] },
    { response_format: 'markdown', title: 'Log Nutrition' }
  );
  assert.match(res.content[0].text, /# Log Nutrition/);
  assert.match(res.content[0].text, /WRITE_SCOPE_MISSING/);
}

console.log(JSON.stringify({ ok: true, remote_write_gate: true }, null, 2));

import assert from 'node:assert/strict';
import { buildDataTypeCoveragePlan, buildLiveDataTypeCoverage } from '../dist/services/coverage-report.js';

const issueThreeSlugs = [
  'steps',
  'sleep',
  'heart-rate',
  'daily-resting-heart-rate',
  'daily-heart-rate-variability',
  'active-zone-minutes',
  'total-calories',
  'weight',
  'exercise'
];

const plan = buildDataTypeCoveragePlan();
assert.equal(plan.kind, 'data_type_coverage');
assert.equal(plan.mode, 'plan');
assert.ok(plan.totals.data_types >= 30);
for (const slug of issueThreeSlugs) {
  assert.ok(plan.data_types.some((entry) => entry.slug === slug), `missing issue #3 slug: ${slug}`);
}

const fakeClient = {
  async listDataPoints() {
    return { dataPoints: [{ value: 123, access_token: 'SHOULD_NOT_LEAK' }] };
  },
  async reconcileDataPoints() {
    throw new Error('Google Health API HTTP 403: client_secret=SHOULD_NOT_LEAK access_token=SHOULD_NOT_LEAK /Users/example/.google-health-mcp/tokens.json');
  },
  async dailyRollup() {
    return { rollupDataPoints: [{ steps: { countSum: '99999' } }] };
  }
};

const NativeDate = Date;
const fixedNow = '2026-07-14T13:30:07.123Z';
globalThis.Date = class extends NativeDate {
  constructor(...args) {
    super(...(args.length === 0 ? [fixedNow] : args));
  }

  static now() {
    return NativeDate.parse(fixedNow);
  }
};

const live = await buildLiveDataTypeCoverage(fakeClient, { date: '2026-06-27', dataTypes: ['steps'] });
globalThis.Date = NativeDate;
assert.equal(live.kind, 'data_type_coverage');
assert.equal(live.mode, 'live');
assert.equal(live.totals.data_types, 1);
assert.equal(live.totals.operations, 3);
assert.equal(live.totals.ok, 2);
assert.equal(live.totals.error, 1);

const serialized = JSON.stringify(live);
assert.equal(serialized.includes('SHOULD_NOT_LEAK'), false);
assert.equal(serialized.includes('/Users/example'), false);
assert.equal(serialized.includes('99999'), false);
assert.equal(serialized.includes('"value":123'), false);

console.log(JSON.stringify({ ok: true, coverage_report: true, data_types: plan.totals.data_types }, null, 2));

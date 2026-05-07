import assert from 'node:assert/strict';
import { buildDailySummary, buildWeeklySummary } from '../dist/services/summary.js';
import { buildWellnessContext } from '../dist/services/context.js';

const fakeClient = {
  async dailyRollup({ dataType }) {
    if (dataType === 'steps') return { rollupDataPoints: [{ steps: { countSum: '9000' } }] };
    if (dataType === 'distance') return { rollupDataPoints: [{ distance: { metersSum: '7200' } }] };
    if (dataType === 'total-calories') return { rollupDataPoints: [{ totalCalories: { kilocaloriesSum: '2400' } }] };
    if (dataType === 'active-zone-minutes') return { rollupDataPoints: [{ activeZoneMinutes: { minutesSum: '60' } }] };
    if (dataType === 'weight') return { rollupDataPoints: [{ weight: { kilogramsAvg: 80 } }] };
    throw new Error(`unexpected rollup ${dataType}`);
  },
  async reconcileDataPoints({ dataType }) {
    if (dataType === 'daily-resting-heart-rate') {
      return { dataPoints: [{ dailyRestingHeartRate: { beatsPerMinute: 58 } }] };
    }
    if (dataType === 'sleep') {
      return { dataPoints: [{ sleep: { summary: { minutesAsleep: '430' } } }] };
    }
    if (dataType === 'daily-heart-rate-variability') {
      return { dataPoints: [{ dailyHeartRateVariability: { rmssd: 48.2 } }] };
    }
    throw new Error(`unexpected reconcile ${dataType}`);
  }
};

const daily = await buildDailySummary(fakeClient, { date: 'today', timezone: 'UTC' });
assert.equal(daily.kind, 'daily_summary');
assert.equal(daily.source, 'google_health');
assert.equal(daily.scorecard.steps, 9000);
assert.equal(daily.scorecard.sleep_minutes, 430);
assert.equal(daily.scorecard.resting_heart_rate, 58);
assert.ok(daily.diagnostic.action_candidates.length >= 2);

const weekly = await buildWeeklySummary(fakeClient, { days: 7, compare_days: 7, timezone: 'UTC' });
assert.equal(weekly.kind, 'weekly_summary');
assert.equal(weekly.scorecard.current.days, 7);
assert.equal(weekly.scorecard.current.avg_sleep_hours, 7.17);
assert.ok(weekly.diagnostic.bottlenecks.length >= 1);

const context = await buildWellnessContext(fakeClient, { days: 7, timezone: 'UTC' });
assert.equal(context.source, 'google_health');
assert.equal(context.sleep_hours, 7.17);
assert.equal(context.recent_training_load, 'normal');

console.log(JSON.stringify({ ok: true, daily: daily.kind, weekly: weekly.kind }, null, 2));

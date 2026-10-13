import assert from 'node:assert/strict';
import { buildDailySummary, buildWeeklySummary } from '../dist/services/summary.js';
import { buildWellnessContext } from '../dist/services/context.js';

const reconcileCalls = [];
const fakeClient = {
  async dailyRollup({ dataType }) {
    if (dataType === 'steps') return { rollupDataPoints: [{ steps: { countSum: '9000' } }] };
    if (dataType === 'distance') return { rollupDataPoints: [{ distance: { metersSum: '7200' } }] };
    if (dataType === 'total-calories') return { rollupDataPoints: [{ totalCalories: { kcalSum: 2400 } }] };
    if (dataType === 'active-zone-minutes') return { rollupDataPoints: [{ activeZoneMinutes: { sumInFatBurnHeartZone: '20', sumInCardioHeartZone: '25', sumInPeakHeartZone: '15' } }] };
    if (dataType === 'weight') return { rollupDataPoints: [{ weight: { weightGramsAvg: 80000 } }] };
    throw new Error(`unexpected rollup ${dataType}`);
  },
  async reconcileDataPoints(query) {
    reconcileCalls.push(query);
    const { dataType } = query;
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

const daily = await buildDailySummary(fakeClient, { date: '2026-08-02', timezone: 'UTC' });
assert.equal(daily.kind, 'daily_summary');
assert.equal(daily.source, 'google_health');
assert.equal(daily.scorecard.steps, 9000);
assert.equal(daily.scorecard.sleep_minutes, 430);
assert.equal(daily.scorecard.resting_heart_rate, 58);
assert.equal(daily.scorecard.calories_out, 2400);
assert.equal(daily.scorecard.active_zone_minutes, 60);
assert.equal(daily.scorecard.weight_kg, 80);
assert.ok(daily.diagnostic.action_candidates.length >= 2);

// issue #19 / @maxgow on #3: daily summary must use kind-correct filter members
const byType = Object.fromEntries(reconcileCalls.map((call) => [call.dataType, call.filter]));
assert.match(byType['daily-resting-heart-rate'], /daily_resting_heart_rate\.date >= "2026-08-02"/);
assert.match(byType['daily-resting-heart-rate'], /daily_resting_heart_rate\.date < "2026-08-03"/);
assert.doesNotMatch(byType['daily-resting-heart-rate'], /civil_start_time/);
assert.match(byType['daily-heart-rate-variability'], /daily_heart_rate_variability\.date >= "2026-08-02"/);
assert.doesNotMatch(byType['daily-heart-rate-variability'], /civil_start_time/);
assert.match(byType.sleep, /sleep\.interval\.civil_end_time >= "2026-08-02"/);
assert.doesNotMatch(byType.sleep, /civil_start_time/);

const weekly = await buildWeeklySummary(fakeClient, { days: 7, compare_days: 7, timezone: 'UTC' });
assert.equal(weekly.kind, 'weekly_summary');
assert.equal(weekly.scorecard.current.days, 7);
assert.equal(weekly.scorecard.current.avg_sleep_hours, 7.17);
assert.ok(weekly.diagnostic.bottlenecks.length >= 1);

const context = await buildWellnessContext(fakeClient, { days: 7, timezone: 'UTC' });
assert.equal(context.source, 'google_health');
assert.equal(context.sleep_hours, 7.17);
assert.equal(context.recent_training_load, 'normal');

// "today" resolves in the caller's timezone, with an injected clock
const justAfterUtcMidnight = Date.parse('2026-08-03T00:30:00Z'); // 20:30 on 2026-08-02 in New York
const nyDaily = await buildDailySummary(fakeClient, { date: 'today', timezone: 'America/New_York', now: justAfterUtcMidnight });
assert.equal(nyDaily.window.date, '2026-08-02');
const utcDaily = await buildDailySummary(fakeClient, { date: 'today', timezone: 'UTC', now: justAfterUtcMidnight });
assert.equal(utcDaily.window.date, '2026-08-03');
reconcileCalls.length = 0;
await buildWeeklySummary(fakeClient, { days: 7, compare_days: 0, timezone: 'America/New_York', now: justAfterUtcMidnight });
const weeklySleepDates = reconcileCalls.filter((c) => c.dataType === 'sleep').map((c) => c.filter.match(/>= "([^"]+)"/)[1]).sort();
assert.equal(weeklySleepDates[0], '2026-07-27');
assert.equal(weeklySleepDates.at(-1), '2026-08-02');
reconcileCalls.length = 0;
await buildWeeklySummary(fakeClient, { days: 7, compare_days: 7, timezone: 'America/New_York', now: justAfterUtcMidnight });
const comparedSleepDates = reconcileCalls.filter((c) => c.dataType === 'sleep').map((c) => c.filter.match(/>= "([^"]+)"/)[1]).sort();
assert.equal(comparedSleepDates.length, 14);
assert.equal(new Set(comparedSleepDates).size, 14, 'current and comparison windows must not overlap');
assert.equal(comparedSleepDates[0], '2026-07-20');
reconcileCalls.length = 0;
await buildWellnessContext(fakeClient, { days: 7, timezone: 'America/New_York', now: justAfterUtcMidnight });
assert.match(reconcileCalls.find((c) => c.dataType === 'sleep').filter, />= "2026-08-02"/);
await assert.rejects(
  buildDailySummary(fakeClient, { date: 'today', timezone: 'Mars/Olympus_Mons' }),
  /Invalid timezone "Mars\/Olympus_Mons".*IANA/
);
await assert.rejects(
  buildDailySummary(fakeClient, { date: '2026-08-01', timezone: 'Mars/Olympus_Mons' }),
  /Invalid timezone/,
  'an explicit date must not skip timezone validation'
);
assert.equal(nyDaily.generated_at, new Date(justAfterUtcMidnight).toISOString());
const nyWeekly = await buildWeeklySummary(fakeClient, { days: 7, compare_days: 0, timezone: 'America/New_York', now: justAfterUtcMidnight });
assert.equal(nyWeekly.window.start_date, '2026-07-27');
assert.equal(nyWeekly.window.end_date, '2026-08-02');
const { todayIn, resolveDate } = await import('../dist/services/dates.js');
assert.equal(resolveDate(''), '', 'empty date must reach client validation, not become today');
const { DailyRollupInputSchema, DailySummaryInputSchema, WeeklySummaryInputSchema, WellnessContextInputSchema } = await import('../dist/schemas/common.js');
for (const schema of [DailyRollupInputSchema, DailySummaryInputSchema, WeeklySummaryInputSchema, WellnessContextInputSchema]) {
  const bad = schema.safeParse({ timezone: 'Mars/Olympus_Mons' });
  assert.equal(bad.success, false);
  assert.match(bad.error.issues[0].message, /Invalid timezone.*IANA/);
  assert.equal(schema.safeParse({ timezone: 'America/New_York' }).success, true);
}
for (const schema of [DailySummaryInputSchema, WeeklySummaryInputSchema, WellnessContextInputSchema]) {
  assert.equal(schema.parse({}).timezone, undefined, 'omitted timezone must stay unset so the profile default applies');
}
// zod 4 applies .default() through .optional(); end_date must stay unset so the client uses start_date + 1.
assert.equal(DailyRollupInputSchema.parse({}).end_date, undefined);
assert.equal(todayIn('Asia/Tokyo', Date.parse('2026-08-02T16:00:00Z')), '2026-08-03');

let capturedStderr = '';
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk) => {
  capturedStderr += String(chunk);
  return true;
};
try {
  const partialClient = {
    ...fakeClient,
    async reconcileDataPoints(query) {
      if (query.dataType === 'sleep') throw new Error('synthetic Google Health sleep failure');
      return fakeClient.reconcileDataPoints(query);
    },
  };
  await buildDailySummary(partialClient, { date: 'today', timezone: 'UTC' });
} finally {
  process.stderr.write = originalStderrWrite;
}
assert.match(capturedStderr, /\[google-health-mcp\] summary domain error: synthetic Google Health sleep failure/);

// profileTimezone reads ~/.delx-wellness/profile.json, whose path is fixed at import, so run it under a temp HOME.
const { execFileSync } = await import('node:child_process');
const { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const profileHome = mkdtempSync(join(tmpdir(), 'ghmcp-tz-'));
try {
  const profileTimezoneIn = (timezone, dir = '.delx-wellness', file = 'profile.json') => {
    mkdirSync(join(profileHome, dir), { recursive: true });
    writeFileSync(join(profileHome, dir, file), JSON.stringify({ schema: 'delx-wellness-profile/v1', profile: { timezone } }));
    return execFileSync(process.execPath, ['--input-type=module', '-e',
      "const { profileTimezone } = await import(process.argv[1]); process.stdout.write(String(await profileTimezone()));",
      new URL('../dist/services/profile-store.js', import.meta.url).href], { env: { ...process.env, HOME: profileHome, USERPROFILE: profileHome }, encoding: 'utf8' });
  };
  assert.equal(profileTimezoneIn('Asia/Tokyo'), 'Asia/Tokyo');
  assert.equal(profileTimezoneIn('Mars/Olympus_Mons'), 'undefined', 'an invalid profile timezone falls back to UTC');
  rmSync(join(profileHome, '.delx-wellness'), { recursive: true });
  assert.equal(profileTimezoneIn('Europe/Budapest', '.openclaw-delx-wellness/workspace', 'wellness-profile.json'), 'Europe/Budapest');
  assert.equal(existsSync(join(profileHome, '.delx-wellness')), false, 'reading the timezone must not migrate the legacy profile');
} finally {
  rmSync(profileHome, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, daily: daily.kind, weekly: weekly.kind }, null, 2));

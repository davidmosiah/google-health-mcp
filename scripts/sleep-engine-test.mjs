import assert from 'node:assert/strict';
import { computeNightMetrics, DEFAULT_SLEEP_CONFIG } from '../dist/services/sleep.js';

const seg = (stage, minutes) => ({ start: '2026-06-01T00:00:00Z', end: '2026-06-01T00:00:00Z', stage, seconds: minutes * 60 });

// Case 1: normal night, no isolated light → asleep = deep+light+rem
const normal = {
  date: '2026-06-01', stagesAvailable: true,
  segments: [seg('light', 60), seg('deep', 90), seg('rem', 60), seg('light', 90)],
  googleSummary: { minutesAsleep: 300, efficiency: 100 }
};
const r1 = computeNightMetrics(normal, DEFAULT_SLEEP_CONFIG);
assert.equal(r1.minutes_asleep, 300);
assert.equal(r1.minutes_by_stage.deep, 90);
assert.equal(r1.stages_available, true);

// Case 2: isolated 4m light bracketed by awake → reclassified to wake
const isolated = {
  date: '2026-06-02', stagesAvailable: true,
  segments: [seg('deep', 100), seg('awake', 10), seg('light', 4), seg('awake', 10), seg('rem', 100)],
  googleSummary: { minutesAsleep: 204 }
};
const r2 = computeNightMetrics(isolated, DEFAULT_SLEEP_CONFIG);
assert.equal(r2.minutes_asleep, 200);          // 204 − 4 reclassified light
assert.equal(r2.minutes_awake_in_bed, 24);     // 10 + 4 + 10

// Case 3: reclassification + trim OFF reproduces Google's stage sum (parsing sanity)
const r3 = computeNightMetrics(isolated, { reclassify_isolated_light: false, isolated_light_window_min: 5, trim_edges: false });
assert.equal(r3.minutes_asleep, 204);

// Case 4: no stages → falls back to google summary, flagged
const noStages = { date: '2026-06-03', stagesAvailable: false, segments: [], googleSummary: { minutesAsleep: 430, efficiency: 88 } };
const r4 = computeNightMetrics(noStages, DEFAULT_SLEEP_CONFIG);
assert.equal(r4.minutes_asleep, 430);
assert.equal(r4.stages_available, false);
assert.equal(r4.google_summary.minutes_asleep, 430);

// Case 5: all awake → 0 asleep
const allWake = { date: '2026-06-04', stagesAvailable: true, segments: [seg('awake', 30)], googleSummary: {} };
assert.equal(computeNightMetrics(allWake, DEFAULT_SLEEP_CONFIG).minutes_asleep, 0);

console.log(JSON.stringify({ ok: true }, null, 2));

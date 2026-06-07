import assert from 'node:assert/strict';
import { fromReconciledSleep, normalizeStage } from '../dist/services/sleep-normalize.js';

// stage label normalization
assert.equal(normalizeStage('DEEP'), 'deep');
assert.equal(normalizeStage('Wake'), 'awake');
assert.equal(normalizeStage('core'), 'light');
assert.equal(normalizeStage('nonsense'), null);

// a night with a stage timeline
const payload = {
  dataPoints: [{
    sleep: {
      interval: { civilStartTime: '2026-06-01T23:30:00Z' },
      summary: { minutesAsleep: '7', efficiency: 90 },
      stages: [
        { stage: 'LIGHT', startTime: '2026-06-01T23:30:00Z', seconds: 120 },
        { stage: 'DEEP',  startTime: '2026-06-01T23:32:00Z', seconds: 180 },
        { stage: 'AWAKE', startTime: '2026-06-01T23:35:00Z', seconds: 60 },
        { stage: 'REM',   startTime: '2026-06-01T23:36:00Z', seconds: 120 }
      ]
    }
  }]
};
const nights = fromReconciledSleep(payload);
assert.equal(nights.length, 1);
assert.equal(nights[0].date, '2026-06-01');
assert.equal(nights[0].stagesAvailable, true);
assert.equal(nights[0].segments.length, 4);
assert.equal(nights[0].segments[1].stage, 'deep');
assert.equal(nights[0].segments[1].seconds, 180);
assert.equal(nights[0].googleSummary.minutesAsleep, 7);

// summary-only record (no stages) → stagesAvailable false
const summaryOnly = fromReconciledSleep({
  dataPoints: [{ sleep: { interval: { civilStartTime: '2026-06-02T23:00:00Z' }, summary: { minutesAsleep: 430 } } }]
});
assert.equal(summaryOnly[0].stagesAvailable, false);
assert.equal(summaryOnly[0].segments.length, 0);
assert.equal(summaryOnly[0].googleSummary.minutesAsleep, 430);

// duration derived from start/end when seconds absent
const derived = fromReconciledSleep({
  dataPoints: [{ sleep: { stages: [
    { level: 'rem', dateTime: '2026-06-03T01:00:00Z', endTime: '2026-06-03T01:30:00Z' }
  ] } }]
});
assert.equal(derived[0].segments[0].seconds, 1800);

console.log(JSON.stringify({ ok: true, nights: nights.length }, null, 2));

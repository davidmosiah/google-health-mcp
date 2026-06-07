import { type SleepNight, type SleepStage, type StageSegment } from "./sleep-normalize.js";

export interface SleepConfig {
  reclassify_isolated_light: boolean;
  isolated_light_window_min: number;
  trim_edges: boolean;
}

export const DEFAULT_SLEEP_CONFIG: SleepConfig = {
  reclassify_isolated_light: true,
  isolated_light_window_min: 5,
  trim_edges: true
};

export interface SleepNightResult {
  date: string;
  minutes_asleep: number;
  minutes_by_stage: { deep: number; light: number; rem: number };
  minutes_awake_in_bed: number;
  time_in_bed: number;
  efficiency: number;
  stages_available: boolean;
  google_summary?: { minutes_asleep?: number; efficiency?: number };
}

interface Run { stage: SleepStage; seconds: number; }

function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && last.stage === run.stage) last.seconds += run.seconds;
    else out.push({ ...run });
  }
  return out;
}

function toRuns(segments: StageSegment[]): Run[] {
  return mergeRuns(segments.map((seg) => ({ stage: seg.stage, seconds: seg.seconds })));
}

function applyReclassification(runs: Run[], config: SleepConfig): Run[] {
  if (!config.reclassify_isolated_light) return runs;
  const windowSec = config.isolated_light_window_min * 60;
  const flipped: Run[] = runs.map((run, i) => {
    if (run.stage !== "light" || run.seconds > windowSec) return run;
    const prev = runs[i - 1];
    const next = runs[i + 1];
    const prevWake = !prev || prev.stage === "awake";   // record edge counts as wake
    const nextWake = !next || next.stage === "awake";
    return prevWake && nextWake ? { stage: "awake" as SleepStage, seconds: run.seconds } : run;
  });
  // flipping a LIGHT run to AWAKE can make it adjacent to existing AWAKE runs — re-merge.
  return mergeRuns(flipped);
}

function computeFromRuns(runs: Run[], config: SleepConfig) {
  const reclassified = applyReclassification(runs, config);
  let startIdx = 0;
  let endIdx = reclassified.length - 1;
  if (config.trim_edges) {
    while (startIdx <= endIdx && reclassified[startIdx].stage === "awake") startIdx++;
    while (endIdx >= startIdx && reclassified[endIdx].stage === "awake") endIdx--;
  }
  const inBed = reclassified.slice(startIdx, endIdx + 1);
  const sum = (stage: SleepStage) => inBed.filter((r) => r.stage === stage).reduce((s, r) => s + r.seconds, 0);
  const deep = sum("deep"), light = sum("light"), rem = sum("rem"), awake = sum("awake");
  const asleepSec = deep + light + rem;
  const inBedSec = asleepSec + awake;
  const toMin = (sec: number) => Math.round(sec / 60);
  return {
    minutes_asleep: toMin(asleepSec),
    minutes_by_stage: { deep: toMin(deep), light: toMin(light), rem: toMin(rem) },
    minutes_awake_in_bed: toMin(awake),
    time_in_bed: toMin(inBedSec),
    efficiency: inBedSec > 0 ? Math.round((asleepSec / inBedSec) * 1000) / 10 : 0
  };
}

export function computeNightMetrics(night: SleepNight, config: SleepConfig = DEFAULT_SLEEP_CONFIG): SleepNightResult {
  const google_summary = night.googleSummary
    ? { minutes_asleep: night.googleSummary.minutesAsleep, efficiency: night.googleSummary.efficiency }
    : undefined;

  if (!night.stagesAvailable || night.segments.length === 0) {
    const gm = night.googleSummary?.minutesAsleep ?? 0;
    const awake = night.googleSummary?.minutesAwake ?? 0;
    return {
      date: night.date,
      minutes_asleep: gm,
      minutes_by_stage: { deep: 0, light: 0, rem: 0 },
      minutes_awake_in_bed: awake,
      time_in_bed: gm + awake,
      efficiency: night.googleSummary?.efficiency ?? 0,
      stages_available: false,
      google_summary
    };
  }

  const metrics = computeFromRuns(toRuns(night.segments), config);
  return { date: night.date, ...metrics, stages_available: true, google_summary };
}

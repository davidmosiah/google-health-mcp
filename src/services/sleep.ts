import type { GoogleHealthClient } from "./google-health-client.js";
import { fromSleepDataPoints, isObject, type SleepNight, type SleepStage, type StageSegment } from "./sleep-normalize.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Transparency-first: the v4 API only exposes Google's own stage verdicts (deep/light/rem/awake),
// not the raw accelerometer/PPG, so we do NOT invent a "corrected" minutes-asleep. Instead we
// surface what Google's single number hides — restorative (deep+REM) vs light, plus the long
// morning light blocks that read as "in and out" dozing — and echo Google's figure for reference.

export interface SleepConfig {
  // Contiguous LIGHT runs at least this long are flagged as likely fragmented/dozing.
  long_light_block_min: number;
}

export const DEFAULT_SLEEP_CONFIG: SleepConfig = {
  long_light_block_min: 45
};

export interface LightBlock {
  start: string;   // local HH:MM
  end: string;     // local HH:MM
  minutes: number;
}

export interface SleepNightResult {
  date: string;
  time_in_bed: number;
  minutes_asleep: number;        // Google's definition: deep + light + rem
  restorative_minutes: number;   // deep + rem
  light_minutes: number;
  awake_in_bed: number;
  efficiency: number;            // asleep / in-bed, %
  restorative_pct: number;       // restorative / asleep, %
  stages_available: boolean;
  long_light_blocks: LightBlock[];
  google_summary?: { minutes_asleep?: number; efficiency?: number };
}

interface TimedRun { stage: SleepStage; start: string; end: string; seconds: number; }

function toTimedRuns(segments: StageSegment[]): TimedRun[] {
  const out: TimedRun[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.stage === seg.stage) {
      last.end = seg.end;
      last.seconds += seg.seconds;
    } else {
      out.push({ stage: seg.stage, start: seg.start, end: seg.end, seconds: seg.seconds });
    }
  }
  return out;
}

function localHHMM(iso: string, offsetSec: number): string {
  const ms = Date.parse(iso) + offsetSec * 1000;
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(11, 16) : iso.slice(11, 16);
}

const toMin = (sec: number) => Math.round(sec / 60);
const round1 = (x: number) => Math.round(x * 10) / 10;

// Google's v4 summary carries no explicit efficiency; derive it from asleep / sleep-period
// here in the metric layer (the parser only surfaces raw fields).
function googleEfficiency(s: SleepNight["googleSummary"]): number | undefined {
  if (!s) return undefined;
  if (s.efficiency !== undefined) return s.efficiency;
  if (s.minutesAsleep !== undefined && s.minutesInSleepPeriod && s.minutesInSleepPeriod > 0) {
    return round1((s.minutesAsleep / s.minutesInSleepPeriod) * 100);
  }
  return undefined;
}

export function computeNightMetrics(night: SleepNight, config: SleepConfig = DEFAULT_SLEEP_CONFIG): SleepNightResult {
  const google_eff = googleEfficiency(night.googleSummary);
  const google_summary = night.googleSummary
    ? { minutes_asleep: night.googleSummary.minutesAsleep, efficiency: google_eff }
    : undefined;

  if (!night.stagesAvailable || night.segments.length === 0) {
    const gm = night.googleSummary?.minutesAsleep ?? 0;
    const awake = night.googleSummary?.minutesAwake ?? 0;
    return {
      date: night.date,
      time_in_bed: gm + awake,
      minutes_asleep: gm,
      restorative_minutes: 0,
      light_minutes: 0,
      awake_in_bed: awake,
      efficiency: google_eff ?? 0,
      restorative_pct: 0,
      stages_available: false,
      long_light_blocks: [],
      google_summary
    };
  }

  let deep = 0, light = 0, rem = 0, awake = 0;
  const runs = toTimedRuns(night.segments);
  for (const r of runs) {
    if (r.stage === "deep") deep += r.seconds;
    else if (r.stage === "light") light += r.seconds;
    else if (r.stage === "rem") rem += r.seconds;
    else awake += r.seconds;
  }
  const asleepSec = deep + light + rem;
  const inBedSec = asleepSec + awake;
  const off = night.utcOffsetSeconds ?? 0;

  const long_light_blocks = runs
    .filter((r) => r.stage === "light" && r.seconds >= config.long_light_block_min * 60)
    .map((r) => ({ start: localHHMM(r.start, off), end: localHHMM(r.end, off), minutes: toMin(r.seconds) }));

  return {
    date: night.date,
    time_in_bed: toMin(inBedSec),
    minutes_asleep: toMin(asleepSec),
    restorative_minutes: toMin(deep + rem),
    light_minutes: toMin(light),
    awake_in_bed: toMin(awake),
    efficiency: inBedSec > 0 ? round1((asleepSec / inBedSec) * 100) : 0,
    restorative_pct: asleepSec > 0 ? round1(((deep + rem) / asleepSec) * 100) : 0,
    stages_available: true,
    long_light_blocks,
    google_summary
  };
}

export interface SleepParams {
  date?: string;
  start?: string;
  end?: string;
  config?: Partial<SleepConfig>;
}

const SLEEP_PAGE_SIZE = 50;
const SLEEP_MAX_PAGES = 40; // safety cap (~2000 nights)

function dateString(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

function normalizeDate(value?: string): string {
  return !value || value === "today" ? dateString(0) : value;
}

// NOTE (verified live against the v4 API, 2026-06): server-side time filtering of the sleep
// (Session) data type does NOT work — every interval member path
// (sleep.interval.civil_start_time / .start_time / .startTime, interval.start_time, ...) is
// rejected with HTTP 400 INVALID_DATA_POINT_FILTER_DATA_TYPE_MEMBER. (summary.ts uses such a
// filter but only "works" because its call is swallowed by a safe() wrapper — it returns no
// sleep.) So do NOT reintroduce a filter here: list newest-first and page until the requested
// range is covered, then filter by local wake date client-side.
async function collectSleepNights(
  client: Pick<GoogleHealthClient, "listDataPoints">,
  keep: (night: SleepNight) => boolean,
  stopWhenBefore?: string
): Promise<SleepNight[]> {
  const out: SleepNight[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < SLEEP_MAX_PAGES; page++) {
    // Do NOT swallow fetch errors here. listDataPoints already retries transient
    // failures internally (fetchWithRetry), so anything that surfaces is a real
    // failure — expired/invalid auth, persistent network, or an API error. Letting
    // it propagate makes the tool return a proper error; swallowing it would mask a
    // dead token as a misleading empty "0 nights" result.
    const payload = await client.listDataPoints({ dataType: "sleep", pageSize: SLEEP_PAGE_SIZE, pageToken });
    const nights = fromSleepDataPoints(payload);
    let passedRange = false;
    for (const night of nights) {
      if (keep(night)) out.push(night);
      if (stopWhenBefore && night.date < stopWhenBefore) passedRange = true;
    }
    pageToken = isObject(payload) && typeof payload.nextPageToken === "string" ? payload.nextPageToken : undefined;
    if (!pageToken || passedRange) break;
  }
  return out;
}

function average(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

export async function buildSleep(
  client: Pick<GoogleHealthClient, "listDataPoints">,
  params: SleepParams
) {
  const config: SleepConfig = { ...DEFAULT_SLEEP_CONFIG, ...(params.config ?? {}) };
  const hasRange = Boolean(params.date || params.start || params.end);

  let start: string;
  let end: string;
  let collected: SleepNight[];

  if (!hasRange) {
    collected = (await collectSleepNights(client, () => true, undefined)).slice(0, 1);
    start = collected[0]?.date ?? dateString(0);
    end = start;
  } else {
    start = normalizeDate(params.start ?? params.date);
    end = normalizeDate(params.end ?? params.date ?? params.start);
    if (end < start) [start, end] = [end, start];
    collected = await collectSleepNights(client, (n) => n.date >= start && n.date <= end, start);
  }

  collected.sort((a, b) => a.date.localeCompare(b.date)); // newest-first API → chronological
  const nights = collected.map((night) => computeNightMetrics(night, config));
  const staged = nights.filter((n) => n.stages_available);

  return {
    kind: "sleep" as const,
    generated_at: new Date().toISOString(),
    source: "google_health",
    window: { start, end },
    beta: true,
    data_quality: {
      nights: nights.length,
      nights_with_stages: staged.length,
      confidence: nights.length === 0 ? "low" : staged.length >= Math.ceil(nights.length / 2) ? "medium" : "low"
    },
    aggregate: staged.length ? {
      avg_minutes_asleep: average(staged.map((n) => n.minutes_asleep)),
      avg_restorative_minutes: average(staged.map((n) => n.restorative_minutes)),
      avg_restorative_pct: average(staged.map((n) => n.restorative_pct)),
      avg_efficiency: average(staged.map((n) => n.efficiency))
    } : undefined,
    config,
    nights,
    interpretation: {
      what_minutes_asleep_means: "Google's figure: deep + light + rem. The API exposes only Google's stage labels, not raw motion/PPG, so this is not independently re-derived.",
      restorative: "deep + REM — the stages most associated with feeling rested.",
      long_light_blocks: `Contiguous light-sleep runs >= ${config.long_light_block_min} min, often experienced as in-and-out/dozing rather than solid sleep.`
    },
    safety: {
      medical_advice: false,
      api_boundary: "Read-only Google Health v4 stage data; not a clinical sleep measure."
    }
  };
}

export function formatSleepMarkdown(result: Awaited<ReturnType<typeof buildSleep>>): string {
  const hm = (mins: number) => {
    const m = Math.round(mins);
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  };
  const lines = [
    "# Google Health Sleep",
    "",
    `Window: ${result.window.start} → ${result.window.end} · nights: ${result.data_quality.nights} (with stages: ${result.data_quality.nights_with_stages})`,
    ""
  ];
  if (result.aggregate) {
    lines.push(
      `**Averages** — asleep ${hm(result.aggregate.avg_minutes_asleep ?? 0)}, ` +
      `restorative ${hm(result.aggregate.avg_restorative_minutes ?? 0)} (${result.aggregate.avg_restorative_pct ?? 0}%), ` +
      `efficiency ${result.aggregate.avg_efficiency ?? 0}%`,
      ""
    );
  }
  for (const n of result.nights) {
    lines.push(`## ${n.date}`);
    if (n.stages_available) {
      lines.push(`- **asleep (Google)**: ${hm(n.minutes_asleep)} (${n.minutes_asleep} min) · efficiency ${n.efficiency}%`);
      lines.push(`- **restorative (deep+REM)**: ${hm(n.restorative_minutes)} (${n.restorative_minutes} min, ${n.restorative_pct}% of asleep)`);
      lines.push(`- **light**: ${hm(n.light_minutes)} · **awake in bed**: ${n.awake_in_bed} min`);
      if (n.long_light_blocks.length) {
        lines.push(`- **long light blocks**: ${n.long_light_blocks.map((b) => `${b.start}–${b.end} (${b.minutes}m)`).join(", ")}`);
      }
    } else {
      lines.push(`- **asleep (Google)**: ${hm(n.minutes_asleep)} — _no stage data this night_`);
    }
    lines.push("");
  }
  lines.push("> Google's number is its own stage verdict, not independently re-derived. Not medical advice.");
  return lines.join("\n");
}

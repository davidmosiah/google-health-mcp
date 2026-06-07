// Pure, network-free parsing of Google Health v4 sleep records into a normalized
// per-night stage timeline. Uses defensive multi-candidate extraction like summary.ts
// because v4 payloads arrive loosely typed (`unknown`). Exact v4 segment field names
// are verified against a captured live response (see plan open items); candidate keys
// below cover the documented v4 shape and the Fitbit levels.data shape.

export type SleepStage = "awake" | "light" | "deep" | "rem";

export interface StageSegment {
  start: string;   // ISO 8601
  end: string;     // ISO 8601
  stage: SleepStage;
  seconds: number;
}

export interface SleepNight {
  date: string;                 // night-of (YYYY-MM-DD)
  segments: StageSegment[];     // ordered
  stagesAvailable: boolean;
  googleSummary?: { minutesAsleep?: number; minutesAwake?: number; efficiency?: number };
}

type UnknownRecord = Record<string, unknown>;

function isObject(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function pickNumber(record: UnknownRecord, candidates: string[]): number | undefined {
  for (const key of candidates) {
    const value = numberFrom(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function pickString(record: UnknownRecord, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

export function normalizeStage(raw: unknown): SleepStage | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "awake" || v === "wake" || v === "wakefulness") return "awake";
  if (v === "light" || v === "core") return "light";
  if (v === "deep") return "deep";
  if (v === "rem") return "rem";
  return null;
}

const SEGMENT_LIST_KEYS = ["stages", "segments", "stageSegments"];

function segmentArray(sleep: UnknownRecord): UnknownRecord[] {
  for (const key of SEGMENT_LIST_KEYS) {
    const value = sleep[key];
    if (Array.isArray(value)) return value.filter(isObject);
  }
  // Fitbit-style: levels.data = [{ dateTime, level, seconds }]
  const levels = sleep.levels;
  if (isObject(levels) && Array.isArray(levels.data)) return levels.data.filter(isObject);
  return [];
}

function toSegment(raw: UnknownRecord): StageSegment | null {
  const stage = normalizeStage(raw.stage ?? raw.level ?? raw.type);
  if (!stage) return null;
  const start = pickString(raw, ["start", "startTime", "dateTime", "civilStartTime"]);
  if (!start) return null;
  let end = pickString(raw, ["end", "endTime", "civilEndTime"]);
  let seconds = pickNumber(raw, ["seconds", "durationSeconds", "durationSec"]);
  if (seconds === undefined) {
    const durationMs = pickNumber(raw, ["durationMillis", "durationMs"]);
    if (durationMs !== undefined) seconds = Math.round(durationMs / 1000);
  }
  if (seconds === undefined && end) {
    seconds = Math.round((Date.parse(end) - Date.parse(start)) / 1000);
  }
  if (seconds === undefined || seconds <= 0) return null;
  if (!end) end = new Date(Date.parse(start) + seconds * 1000).toISOString();
  return { start, end, stage, seconds };
}

function summaryOf(sleep: UnknownRecord): SleepNight["googleSummary"] {
  const summary = isObject(sleep.summary) ? sleep.summary : sleep;
  return {
    minutesAsleep: pickNumber(summary, ["minutesAsleep", "minutesInSleepPeriod"]),
    minutesAwake: pickNumber(summary, ["minutesAwake"]),
    efficiency: pickNumber(summary, ["efficiency"])
  };
}

function nightDate(sleep: UnknownRecord, segments: StageSegment[]): string {
  const interval = isObject(sleep.interval) ? sleep.interval : undefined;
  const start =
    (interval && pickString(interval, ["civilStartTime", "startTime", "start"])) ??
    pickString(sleep, ["startTime", "start", "dateOfSleep"]) ??
    segments[0]?.start;
  return start ? start.slice(0, 10) : "unknown";
}

export function fromReconciledSleep(payload: unknown): SleepNight[] {
  if (!isObject(payload) || !Array.isArray(payload.dataPoints)) return [];
  const nights: SleepNight[] = [];
  for (const point of payload.dataPoints) {
    if (!isObject(point)) continue;
    const sleep = isObject(point.sleep) ? point.sleep : point;
    const segments = segmentArray(sleep)
      .map(toSegment)
      .filter((s): s is StageSegment => s !== null);
    nights.push({
      date: nightDate(sleep, segments),
      segments,
      stagesAvailable: segments.length > 0,
      googleSummary: summaryOf(sleep)
    });
  }
  return nights;
}

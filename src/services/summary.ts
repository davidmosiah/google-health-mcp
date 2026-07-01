import type { GoogleHealthClient } from "./google-health-client.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type UnknownRecord = Record<string, unknown>;

export interface DailySummaryOptions {
  date?: string;
  timezone?: string;
}

export interface WeeklySummaryOptions {
  days: number;
  compare_days?: number;
  timezone?: string;
}

function isObject(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function dateString(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

function normalizeDate(value?: string): string {
  return !value || value === "today" ? dateString(0) : value;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function safe<T>(fn: () => Promise<T>, endpoint: string): Promise<T | { error: string; endpoint: string }> {
  try {
    return await fn();
  } catch (error) {
    return { error: (error as Error).message, endpoint };
  }
}

async function dailyBundle(client: Pick<GoogleHealthClient, "dailyRollup" | "reconcileDataPoints">, date: string) {
  const endDate = addDays(date, 1);
  const [steps, distance, calories, activeZoneMinutes, heartRate, sleep, hrv, weight] = await Promise.all([
    safe(() => client.dailyRollup({ dataType: "steps", startDate: date, endDate }), "dailyRollUp:steps"),
    safe(() => client.dailyRollup({ dataType: "distance", startDate: date, endDate }), "dailyRollUp:distance"),
    safe(() => client.dailyRollup({ dataType: "total-calories", startDate: date, endDate }), "dailyRollUp:total-calories"),
    safe(() => client.dailyRollup({ dataType: "active-zone-minutes", startDate: date, endDate }), "dailyRollUp:active-zone-minutes"),
    safe(() => client.reconcileDataPoints({ dataType: "daily-resting-heart-rate", filter: `daily_resting_heart_rate.interval.civil_start_time >= "${date}" AND daily_resting_heart_rate.interval.civil_start_time < "${endDate}"`, pageSize: 25 }), "reconcile:daily-resting-heart-rate"),
    safe(() => client.reconcileDataPoints({ dataType: "sleep", filter: `sleep.interval.civil_start_time >= "${date}" AND sleep.interval.civil_start_time < "${endDate}"`, pageSize: 25, dataSourceFamily: "users/me/dataSourceFamilies/google-wearables" }), "reconcile:sleep"),
    safe(() => client.reconcileDataPoints({ dataType: "daily-heart-rate-variability", filter: `daily_heart_rate_variability.interval.civil_start_time >= "${date}" AND daily_heart_rate_variability.interval.civil_start_time < "${endDate}"`, pageSize: 25 }), "reconcile:daily-heart-rate-variability"),
    safe(() => client.dailyRollup({ dataType: "weight", startDate: date, endDate }), "dailyRollUp:weight")
  ]);
  return { date, steps, distance, calories, activeZoneMinutes, heartRate, sleep, hrv, weight };
}

function firstRollup(payload: unknown, key: string): UnknownRecord {
  if (!isObject(payload) || !Array.isArray(payload.rollupDataPoints)) return {};
  const point = payload.rollupDataPoints.find((item) => isObject(item) && isObject(item[key])) as UnknownRecord | undefined;
  return isObject(point?.[key]) ? point[key] as UnknownRecord : {};
}

function reconciled(payload: unknown): UnknownRecord[] {
  if (!isObject(payload) || !Array.isArray(payload.dataPoints)) return [];
  return payload.dataPoints.filter(isObject);
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

function findNestedNumber(value: unknown, candidates: string[]): number | undefined {
  if (!isObject(value)) return undefined;
  const direct = pickNumber(value, candidates);
  if (direct !== undefined) return direct;
  for (const nested of Object.values(value)) {
    const found = findNestedNumber(nested, candidates);
    if (found !== undefined) return found;
  }
  return undefined;
}

function sleepMinutes(points: UnknownRecord[]): number | undefined {
  const minutes = points
    .map((point) => isObject(point.sleep) ? point.sleep as UnknownRecord : {})
    .map((sleep) => findNestedNumber(sleep.summary, ["minutesAsleep", "minutesInSleepPeriod"]))
    .filter((value): value is number => value !== undefined);
  if (minutes.length === 0) return undefined;
  return Math.max(...minutes);
}

// ActiveZoneMinutesRollupValue returns three separate heart-zone buckets; total AZM is their sum.
function activeZoneTotal(azm: unknown): number | undefined {
  if (!isObject(azm)) return undefined;
  const zones = ["sumInFatBurnHeartZone", "sumInCardioHeartZone", "sumInPeakHeartZone"];
  const values = zones.map((z) => numberFrom(azm[z])).filter((v): v is number => v !== undefined);
  if (values.length === 0) return findNestedNumber(azm, ["minutesSum", "totalMinutesSum", "valueSum"]);
  return values.reduce((sum, v) => sum + v, 0);
}

// WeightRollupValue.weightGramsAvg is in grams; convert to kg.
function weightKg(weight: unknown): number | undefined {
  const grams = findNestedNumber(weight, ["weightGramsAvg"]);
  if (grams !== undefined) return grams / 1000;
  return findNestedNumber(weight, ["kilogramsAvg", "kilograms", "valueAvg"]);
}

function distanceMeters(distance: unknown): number | undefined {
  // Prefer fields already in meters.
  const meters = findNestedNumber(distance, ["metersSum", "distanceMetersSum"]);
  if (meters !== undefined) return meters;
  // Convert millimeters → meters when that is the only available unit
  // (Google Health API surfaces millimetersSum on some distance streams).
  const millimeters = findNestedNumber(distance, ["millimetersSum"]);
  if (millimeters !== undefined) return Math.round(millimeters / 1000);
  return undefined;
}

function dailyStats(bundle: Awaited<ReturnType<typeof dailyBundle>>) {
  const steps = firstRollup(bundle.steps, "steps");
  const distance = firstRollup(bundle.distance, "distance");
  const calories = firstRollup(bundle.calories, "totalCalories");
  const activeZoneMinutes = firstRollup(bundle.activeZoneMinutes, "activeZoneMinutes");
  const weight = firstRollup(bundle.weight, "weight");
  const heartPoint = reconciled(bundle.heartRate)[0];
  const hrvPoint = reconciled(bundle.hrv)[0];

  const stepsVal = findNestedNumber(steps, ["countSum", "count"]);
  const distanceVal = distanceMeters(distance);
  const caloriesVal = findNestedNumber(calories, ["kcalSum", "kilocaloriesSum", "caloriesSum", "valueSum"]);
  const azmVal = activeZoneTotal(activeZoneMinutes);
  const sleepVal = sleepMinutes(reconciled(bundle.sleep));
  const heartVal = findNestedNumber(heartPoint, ["beatsPerMinute", "bpm", "value", "restingHeartRate"]);
  const hrvVal = findNestedNumber(hrvPoint, ["rmssd", "rmssdMillis", "value"]);
  const weightVal = weightKg(weight);

  return {
    date: bundle.date,
    steps: stepsVal,
    distance_meters: distanceVal,
    calories_out: caloriesVal,
    active_zone_minutes: azmVal,
    sleep_minutes: sleepVal,
    resting_heart_rate: heartVal,
    hrv_rmssd: hrvVal,
    weight_kg: weightVal,
    missing_or_failed: {
      steps: stepsVal === undefined,
      distance: distanceVal === undefined,
      calories: caloriesVal === undefined,
      active_zone_minutes: azmVal === undefined,
      sleep: sleepVal === undefined,
      heart: heartVal === undefined,
      hrv: hrvVal === undefined,
      weight: weightVal === undefined
    }
  };
}

function avg(values: Array<number | undefined>): number | undefined {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return undefined;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function round(value?: number, digits = 1): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function aggregateStats(days: ReturnType<typeof dailyStats>[]) {
  return {
    days: days.length,
    avg_steps: round(avg(days.map((day) => day.steps)), 0),
    avg_sleep_hours: round(avg(days.map((day) => day.sleep_minutes === undefined ? undefined : day.sleep_minutes / 60)), 2),
    avg_active_zone_minutes: round(avg(days.map((day) => day.active_zone_minutes)), 0),
    avg_resting_heart_rate: round(avg(days.map((day) => day.resting_heart_rate)), 0),
    avg_hrv_rmssd: round(avg(days.map((day) => day.hrv_rmssd)), 1),
    days_with_steps: days.filter((day) => day.steps !== undefined).length,
    days_with_sleep: days.filter((day) => day.sleep_minutes !== undefined).length,
    days_with_heart: days.filter((day) => day.resting_heart_rate !== undefined).length
  };
}

function classifyReadiness(stats: ReturnType<typeof dailyStats>): string {
  const sleepHours = (stats.sleep_minutes ?? 0) / 60;
  const active = stats.active_zone_minutes ?? 0;
  if (sleepHours >= 7 && active <= 90) return "good_base";
  if (sleepHours < 6 && active >= 45) return "recovery_risk";
  if (sleepHours < 6) return "sleep_limited";
  if (active >= 120) return "high_load";
  return "neutral";
}

function actions(stats: ReturnType<typeof dailyStats>, weekly?: ReturnType<typeof aggregateStats>): string[] {
  const out: string[] = [];
  const state = classifyReadiness(stats);
  if (state === "recovery_risk") out.push("Keep intensity conservative: sleep was short relative to activity load.");
  if (state === "sleep_limited") out.push("Protect sleep timing before adding more training complexity.");
  if (state === "high_load") out.push("Consider low-intensity recovery before another hard session.");
  if (state === "good_base") out.push("If subjective energy agrees, this is a reasonable base for normal training or focused work.");
  if (weekly?.avg_sleep_hours !== undefined && weekly.avg_sleep_hours < 6.5) out.push("Weekly sleep average is below 6.5h; sleep regularity may have higher leverage than extra optimization.");
  out.push("This is not medical advice; use Google Health as trend context and escalate symptoms to a clinician.");
  return [...new Set(out)];
}

export async function buildDailySummary(client: Pick<GoogleHealthClient, "dailyRollup" | "reconcileDataPoints">, options: DailySummaryOptions) {
  const date = normalizeDate(options.date);
  const bundle = await dailyBundle(client, date);
  const stats = dailyStats(bundle);
  return {
    kind: "daily_summary" as const,
    generated_at: new Date().toISOString(),
    source: "google_health",
    window: { date, timezone: options.timezone ?? "UTC" },
    beta: true,
    data_quality: {
      confidence: Object.values(stats.missing_or_failed).filter(Boolean).length <= 2 ? "partial" : "low",
      missing_or_failed: stats.missing_or_failed
    },
    scorecard: stats,
    diagnostic: {
      readiness_context: classifyReadiness(stats),
      primary_signal: "Google Health v4 data is useful trend context; avoid over-interpreting any single day or single sensor.",
      action_candidates: actions(stats)
    },
    safety: {
      medical_advice: false,
      api_boundary: "Google Health API v4 returns user-authorized health and fitness metrics from Fitbit, Pixel Watch and supported third-party sources; this MCP does not expose raw sensor telemetry."
    }
  };
}

export async function buildWeeklySummary(client: Pick<GoogleHealthClient, "dailyRollup" | "reconcileDataPoints">, options: WeeklySummaryOptions) {
  const days = Math.max(options.days, 7);
  const current = (await Promise.all(Array.from({ length: days }, (_, index) => dailyBundle(client, dateString(index)))))
    .map(dailyStats)
    .reverse();
  const previous = options.compare_days && options.compare_days > 0
    ? (await Promise.all(Array.from({ length: options.compare_days }, (_, index) => dailyBundle(client, dateString(days + index)))))
      .map(dailyStats)
      .reverse()
    : [];
  const currentStats = aggregateStats(current);
  const previousStats = previous.length ? aggregateStats(previous) : undefined;
  return {
    kind: "weekly_summary" as const,
    generated_at: new Date().toISOString(),
    source: "google_health",
    window: { days, compare_days: options.compare_days ?? 0, timezone: options.timezone ?? "UTC" },
    beta: true,
    data_quality: {
      days_with_steps: currentStats.days_with_steps,
      days_with_sleep: currentStats.days_with_sleep,
      days_with_heart: currentStats.days_with_heart,
      confidence: currentStats.days_with_steps >= 5 || currentStats.days_with_sleep >= 5 ? "medium" : "low"
    },
    scorecard: {
      current: currentStats,
      previous: previousStats
    },
    diagnostic: {
      load_classification: classifyWeeklyLoad(currentStats),
      bottlenecks: inferBottlenecks(currentStats),
      action_candidates: actions(current[current.length - 1] ?? current[0], currentStats),
      next_week_success_metrics: [
        "Keep enough valid days to trust trends before optimizing conclusions.",
        "Compare sleep, active minutes and resting heart rate together.",
        "Use reconciled streams for source-specific questions such as watch-only sleep."
      ]
    },
    safety: {
      medical_advice: false,
      beta_notice: "Google Health API v4 may change before the end-of-May 2026 stabilization window."
    }
  };
}

function classifyWeeklyLoad(stats: ReturnType<typeof aggregateStats>): string {
  if ((stats.avg_active_zone_minutes ?? 0) >= 90) return "high";
  if ((stats.avg_steps ?? 0) < 4000 && (stats.avg_active_zone_minutes ?? 0) < 20) return "low";
  return "normal";
}

function inferBottlenecks(stats: ReturnType<typeof aggregateStats>): string[] {
  const out: string[] = [];
  if (stats.days_with_sleep < 4) out.push("sleep_data_sparse");
  if (stats.avg_sleep_hours !== undefined && stats.avg_sleep_hours < 6.5) out.push("sleep_duration");
  if (stats.days_with_steps < 4) out.push("activity_data_sparse");
  if (stats.days_with_heart < 3) out.push("heart_context_sparse");
  return out.length ? out : ["none_obvious_from_available_data"];
}

function labelize(key: string): string {
  return key.replace(/_/g, " ");
}

function scorecardBullets(scorecard: UnknownRecord): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(scorecard)) {
    if (key === "missing_or_failed" || key === "date") continue;
    if (value === undefined || value === null) {
      lines.push(`- **${labelize(key)}**: no data`);
    } else if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      lines.push(`- **${labelize(key)}**: ${value}`);
    }
  }
  return lines;
}

function missingDataLine(scorecard: UnknownRecord): string | undefined {
  const missing = scorecard.missing_or_failed;
  if (!isObject(missing)) return undefined;
  const failed = Object.entries(missing).filter(([, v]) => v === true).map(([k]) => k);
  return failed.length ? `- **missing or failed**: ${failed.join(", ")}` : undefined;
}

export function formatSummaryMarkdown(summary: Awaited<ReturnType<typeof buildDailySummary>> | Awaited<ReturnType<typeof buildWeeklySummary>>): string {
  const isDaily = summary.kind === "daily_summary";
  const lines: string[] = [
    `# Google Health ${isDaily ? "Daily Summary" : "Weekly Summary"}`,
    ""
  ];

  const dq = summary.data_quality as UnknownRecord | undefined;
  if (dq?.confidence) lines.push(`- **confidence**: ${String(dq.confidence)}`);
  lines.push(`- **generated**: ${summary.generated_at}`);
  const window = summary.window as UnknownRecord | undefined;
  if (isObject(window)) {
    if (typeof window.date === "string") lines.push(`- **date**: ${window.date}`);
    if (typeof window.days === "number") lines.push(`- **window**: ${window.days} day(s)${typeof window.compare_days === "number" && window.compare_days > 0 ? `, compared to prior ${window.compare_days}` : ""}`);
  }
  lines.push("");

  // Scorecard as readable bullets, not a JSON blob.
  lines.push("## Scorecard");
  const scorecard = summary.scorecard as UnknownRecord;
  if (isDaily) {
    lines.push(...scorecardBullets(scorecard));
    const missing = missingDataLine(scorecard);
    if (missing) lines.push(missing);
  } else {
    const current = isObject(scorecard.current) ? scorecard.current : {};
    lines.push("### Current window");
    lines.push(...scorecardBullets(current));
    if (isObject(scorecard.previous)) {
      lines.push("");
      lines.push("### Prior window");
      lines.push(...scorecardBullets(scorecard.previous));
    }
  }
  lines.push("");

  // Diagnostic in the whoop-style Primary signal / Signals / Action candidates prose.
  const diagnostic = summary.diagnostic as UnknownRecord | undefined;
  if (diagnostic) {
    if (typeof diagnostic.readiness_context === "string") lines.push(`## Readiness context\n${diagnostic.readiness_context}\n`);
    if (typeof diagnostic.load_classification === "string") lines.push(`## Load classification\n${diagnostic.load_classification}\n`);
    if (typeof diagnostic.primary_signal === "string") lines.push(`## Primary signal\n${diagnostic.primary_signal}\n`);
    if (Array.isArray(diagnostic.bottlenecks) && diagnostic.bottlenecks.length) {
      lines.push("## Bottlenecks");
      for (const item of diagnostic.bottlenecks) lines.push(`- ${String(item)}`);
      lines.push("");
    }
    if (Array.isArray(diagnostic.action_candidates) && diagnostic.action_candidates.length) {
      lines.push("## Action candidates");
      diagnostic.action_candidates.forEach((action, index) => lines.push(`${index + 1}. ${String(action)}`));
      lines.push("");
    }
    if (Array.isArray(diagnostic.next_week_success_metrics) && diagnostic.next_week_success_metrics.length) {
      lines.push("## Success metrics next week");
      for (const metric of diagnostic.next_week_success_metrics) lines.push(`- ${String(metric)}`);
      lines.push("");
    }
  }

  lines.push("> Not medical advice.");
  return lines.join("\n");
}

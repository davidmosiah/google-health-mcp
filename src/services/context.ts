import type { GoogleHealthClient } from "./google-health-client.js";
import { buildDailySummary, type DailySummaryOptions } from "./summary.js";

type ContextOptions = DailySummaryOptions & { days?: number; soreness?: string[]; injury_flags?: string[]; notes?: string };
type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function loadFromActiveMinutes(activeMinutes?: number): "low" | "normal" | "high" | "unknown" {
  if (activeMinutes === undefined) return "unknown";
  if (activeMinutes >= 90) return "high";
  if (activeMinutes <= 20) return "low";
  return "normal";
}

export async function buildWellnessContext(client: Pick<GoogleHealthClient, "dailyRollup" | "reconcileDataPoints">, options: ContextOptions) {
  const summary = await buildDailySummary(client, { date: "today", timezone: options.timezone });
  const scorecard = record(summary.scorecard);
  const activeZoneMinutes = num(scorecard.active_zone_minutes);
  const sleepMinutes = num(scorecard.sleep_minutes);
  const recentTrainingLoad = loadFromActiveMinutes(activeZoneMinutes);

  return {
    source: "google_health" as const,
    generated_at: summary.generated_at,
    sleep_hours: sleepMinutes === undefined ? undefined : Math.round((sleepMinutes / 60) * 100) / 100,
    recent_training_load: recentTrainingLoad,
    soreness: options.soreness ?? [],
    injury_flags: options.injury_flags ?? [],
    notes: [options.notes, "Google Health API v4 beta connector; use as trend context, not diagnosis."].filter((note): note is string => Boolean(note)),
    data_quality: summary.data_quality,
    telegram_summary: [
      "Google Health wellness context",
      sleepMinutes !== undefined ? `Sleep: ${Math.round((sleepMinutes / 60) * 10) / 10}h` : undefined,
      `Load: ${recentTrainingLoad}`
    ].filter(Boolean).join(" | ")
  };
}

export function formatWellnessContextMarkdown(context: Record<string, unknown>): string {
  return ["# Google Health Wellness Context", "", JSON.stringify(context, null, 2)].join("\n");
}

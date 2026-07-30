/**
 * OAuth-free synthetic payloads for agents and contributors.
 * Same contract shape as live tools; always tagged is_demo: true.
 */

export function buildSyntheticDemoPayload(date = new Date().toISOString().slice(0, 10)) {
  return {
    ok: true as const,
    is_demo: true as const,
    sample: {
      google_health_daily_summary: {
        date,
        source: "Pixel Watch 3",
        activity: {
          steps: 9180,
          active_minutes: 44,
          calories_out: 2410,
          distance_km: 7.1,
          floors_climbed: 14
        },
        sleep: {
          score: 81,
          duration_min: 458,
          efficiency: 93,
          stages: { rem_min: 94, deep_min: 71, light_min: 252, awake_min: 41 }
        },
        heart: { resting_heart_rate: 54, hrv_rmssd_ms: 46, max_heart_rate: 158 },
        body: { weight_kg: 76.2, body_fat_pct: 18.4 }
      },
      google_health_wellness_context: {
        window: "last_24h",
        sleep_score: 81,
        sleep_duration_min: 458,
        steps: 9180,
        resting_heart_rate: 54,
        hrv_ms: 46,
        activity_load: "moderate",
        recommendation:
          "Strong overnight recovery — sleep score 81 with HRV trending up from 7-day baseline. Green light for a moderate-to-hard session today. Front-load carbs around the workout window."
      },
      google_health_daily_rollup: {
        date,
        data_source_family: "users/me/dataSourceFamilies/google-wearables",
        rollups: {
          "com.google.step_count.delta": { value: 9180, unit: "count" },
          "com.google.heart_rate.bpm": { resting: 54, max: 158, avg: 71 },
          "com.google.sleep.segment": { total_min: 458, efficiency_pct: 93 },
          "com.google.active_minutes": { value: 44, unit: "minutes" },
          "com.google.calories.expended": { value: 2410, unit: "kcal" }
        }
      }
    },
    notes: [
      "All sample data is synthetic; tagged with is_demo=true.",
      "Real calls return live data from Google Health API v4 after Google Cloud OAuth setup.",
      "Google Health API v4 is in beta; field names and shapes may shift before stable launch."
    ]
  };
}

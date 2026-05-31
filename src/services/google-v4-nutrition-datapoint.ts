// Maps a normalized NutrientMap (from nutrition-normalize.ts) → a Google Health API v4
// create-DataPoint request body, plus the unit shim between NutrientMap units and the units
// Google Health expects.
//
// =====================================================================================
// TO-VERIFY (loud, blocking before any live POST) — the exact v4 CREATE surface is NOT present
// anywhere in this repo. The existing `:rollUp` / `:dailyRollUp` / `:reconcile` POSTs are QUERIES,
// not mutations, so the create envelope below is GUESSED from the read shapes + REST conventions.
// Before this maps to a real POST, verify against:
//   - https://developers.google.com/health/reference/rest
//   - https://developers.google.com/health/data-types
//   - https://developers.google.com/health/scopes
// Specifically confirm:
//   1. Create verb/path — RESTful `POST /v4/users/me/dataTypes/{dataType}/dataPoints`
//      vs a `:create` / `:batchCreate` custom method.
//   2. Nutrition data-type slug (kebab) + value field schema + units.
//   3. DataPoint envelope: originDataSource / dataSource registration requirement,
//      startTime/endTime vs civil {date,time} (reuse the civilDateTime shape seen at
//      google-health-client.ts:343-349).
//   4. Whether a `validateOnly` / dry-run query param exists (drives live-check.ts behavior).
//
// VERIFIED: the mg→g sodium unit-shim direction is correct — it is the inverse of the Open Food
// Facts mapping `sodium_mg = sodium_g * 1000` (wellness-nourish open-food-facts.ts:174). The
// energy field stays in kcal pending #2 above (Google may expect kJ).
// =====================================================================================

import type { MealType, NutrientMap } from "./nutrition-normalize.js";

// TO-VERIFY: exact kebab slug for the nutrition data type.
export const NUTRITION_DATA_TYPE = "nutrition";

export interface NutritionWriteInput {
  /** From STEP 5 (nutrition-normalize). */
  nutrients: NutrientMap;
  food_name?: string;
  meal_type?: MealType;
  /** ISO 8601; falls back to a civil-time {date,time} envelope when absent. */
  start_time?: string;
  end_time?: string;
}

/**
 * Unit shim: NutrientMap (sodium in mg, energy in kcal) → Google Health field units.
 *
 * VERIFIED conversion:
 *   sodium_mg → sodium_g  (× 0.001)   [inverse of OFF sodium_g × 1000 → sodium_mg]
 *
 * The remaining fields are passed through 1:1 with the field-name remap below. The energy unit
 * (kcal vs kJ) and the exact Google field names are TO-VERIFY (#2 in the header).
 */
export function toGoogleHealthNutrientFields(n: NutrientMap): Record<string, number> {
  const fields: Record<string, number> = {};

  // VERIFIED unit conversion: milligrams → grams.
  if (typeof n.sodium_mg === "number") fields.sodium_g = round(n.sodium_mg * 0.001);

  // TO-VERIFY field names + energy unit. Pass-through values; only the keys/units are provisional.
  if (typeof n.calories_kcal === "number") fields.energy_kcal = round(n.calories_kcal);
  if (typeof n.protein_g === "number") fields.protein_g = round(n.protein_g);
  if (typeof n.carbohydrates_g === "number") fields.carbohydrates_g = round(n.carbohydrates_g);
  if (typeof n.fat_g === "number") fields.fat_g = round(n.fat_g);
  if (typeof n.fiber_g === "number") fields.dietary_fiber_g = round(n.fiber_g);
  if (typeof n.sugar_g === "number") fields.sugar_g = round(n.sugar_g);
  if (typeof n.saturated_fat_g === "number") fields.saturated_fat_g = round(n.saturated_fat_g);

  return fields;
}

/**
 * Builds the (TO-VERIFY) v4 create-DataPoint body. The unit-shim portion (`value`) is verified;
 * the envelope (start/end vs civil range, originDataSource registration) is PROVISIONAL and marked
 * with `_to_verify` so callers/tests can assert it is flagged rather than treated as final.
 *
 * Deterministic for a fixed input (no Date.now() / randomness) so it can be snapshot-tested.
 */
export function buildNutritionDataPointBody(input: NutritionWriteInput): Record<string, unknown> {
  const value = toGoogleHealthNutrientFields(input.nutrients);

  // TO-VERIFY: envelope shape. Prefer explicit ISO times when supplied; otherwise leave the
  // range undefined for the live tool to fill (e.g. via civilDateTime) — we do NOT invent a
  // server timestamp here so the body stays deterministic and honest.
  const dataPoint: Record<string, unknown> = { value };
  if (input.start_time !== undefined) dataPoint.startTime = input.start_time;
  if (input.end_time !== undefined) dataPoint.endTime = input.end_time;
  if (input.meal_type !== undefined) dataPoint.mealType = input.meal_type;
  if (input.food_name !== undefined) dataPoint.foodName = input.food_name;

  return {
    dataType: NUTRITION_DATA_TYPE,
    dataPoint,
    // Provenance for downstream verification: makes it unambiguous that the envelope/path/slug
    // are unverified and must be confirmed against Google docs before a live POST is wired.
    _to_verify: {
      create_verb_path: true,
      data_type_slug: true,
      envelope_shape: true,
      validate_only_param: true,
      unit_shim_sodium_mg_to_g: false // verified — inverse of OFF mapping
    }
  };
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6;
}

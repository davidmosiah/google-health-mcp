import assert from 'node:assert/strict';
import {
  toGoogleHealthNutrientFields,
  buildNutritionDataPointBody,
  NUTRITION_DATA_TYPE
} from '../dist/services/google-v4-nutrition-datapoint.js';

// ---------- VERIFIED: mg → g sodium unit shim (inverse of OFF sodium_g*1000) ----------
{
  const fields = toGoogleHealthNutrientFields({ sodium_mg: 500 });
  assert.equal(fields.sodium_g, 0.5, 'sodium_mg:500 → sodium_g:0.5');
  assert.equal(fields.sodium_mg, undefined, 'mg key is not carried through');
}
{
  const fields = toGoogleHealthNutrientFields({ sodium_mg: 2300 });
  assert.equal(fields.sodium_g, 2.3, 'sodium_mg:2300 → sodium_g:2.3');
}

// ---------- field remap + pass-through (TO-VERIFY names, but deterministic) ----------
{
  const fields = toGoogleHealthNutrientFields({
    calories_kcal: 89,
    protein_g: 1.09,
    carbohydrates_g: 22.84,
    fat_g: 0.33,
    fiber_g: 2.6,
    sugar_g: 12.23,
    saturated_fat_g: 0.11
  });
  assert.equal(fields.energy_kcal, 89);
  assert.equal(fields.protein_g, 1.09);
  assert.equal(fields.carbohydrates_g, 22.84);
  assert.equal(fields.fat_g, 0.33);
  assert.equal(fields.dietary_fiber_g, 2.6, 'fiber_g → dietary_fiber_g');
  assert.equal(fields.sugar_g, 12.23);
  assert.equal(fields.saturated_fat_g, 0.11);
}

// ---------- buildNutritionDataPointBody: stable snapshot for a fixed input ----------
{
  const body = buildNutritionDataPointBody({
    nutrients: { calories_kcal: 89, protein_g: 1.09, sodium_mg: 500 },
    food_name: 'banana',
    meal_type: 'snack',
    start_time: '2026-05-31T12:00:00Z',
    end_time: '2026-05-31T12:05:00Z'
  });

  // snapshot-style equality on the structure we control
  assert.deepEqual(body, {
    dataType: 'nutrition',
    dataPoint: {
      value: { sodium_g: 0.5, energy_kcal: 89, protein_g: 1.09 },
      startTime: '2026-05-31T12:00:00Z',
      endTime: '2026-05-31T12:05:00Z',
      mealType: 'snack',
      foodName: 'banana'
    },
    _to_verify: {
      create_verb_path: true,
      data_type_slug: true,
      envelope_shape: true,
      validate_only_param: true,
      unit_shim_sodium_mg_to_g: false
    }
  }, 'deterministic v4 body snapshot');

  assert.equal(NUTRITION_DATA_TYPE, 'nutrition', 'data type slug exported (TO-VERIFY)');
}

// ---------- envelope is deterministic: no times → no timestamp invented ----------
{
  const body = buildNutritionDataPointBody({ nutrients: { calories_kcal: 100 } });
  assert.equal(body.dataPoint.startTime, undefined, 'no start_time → does not invent one');
  assert.equal(body.dataPoint.endTime, undefined, 'no end_time → does not invent one');
  assert.deepEqual(body.dataPoint.value, { energy_kcal: 100 });
}

// ---------- TO-VERIFY flags are present and the verified piece is flagged false ----------
{
  const body = buildNutritionDataPointBody({ nutrients: {} });
  assert.equal(body._to_verify.create_verb_path, true, 'create verb/path is unverified');
  assert.equal(body._to_verify.data_type_slug, true, 'data-type slug is unverified');
  assert.equal(body._to_verify.envelope_shape, true, 'envelope shape is unverified');
  assert.equal(body._to_verify.validate_only_param, true, 'validateOnly param is unverified');
  assert.equal(body._to_verify.unit_shim_sodium_mg_to_g, false, 'sodium mg→g shim is VERIFIED');
}

console.log(JSON.stringify({ ok: true, v4_nutrition_mapping: true }, null, 2));

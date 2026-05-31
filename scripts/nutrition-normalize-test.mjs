import assert from 'node:assert/strict';
import {
  roundNutrient,
  scaleNutrients,
  addNutrients,
  gramsForQuantity,
  nutrientsForGrams,
  listSimpleFoods,
  estimateMeal,
  UNIT_TO_GRAMS
} from '../dist/services/nutrition-normalize.js';

// ---------- catalog size guard (so the count can't silently rot) ----------
// Ground truth verified against the wellness-nourish source: 35 distinct foods (the plan's "37"
// and the critic's "36" both miscounted — the grep that produced 36 included the interface's
// `canonical:` field line; the runtime array has 35 elements).
assert.equal(listSimpleFoods().length, 35, 'SIMPLE_FOODS must have exactly 35 entries');

// ---------- roundNutrient: 2-dp ----------
assert.equal(roundNutrient(1.005), 1.01, 'rounds to 2 decimals');
assert.equal(roundNutrient(89), 89);
assert.equal(roundNutrient(0.545), 0.55);

// ---------- nutrientsForGrams: per-100g → grams ----------
const banana100 = { calories_kcal: 89, protein_g: 1.09, carbohydrates_g: 22.84, fat_g: 0.33, fiber_g: 2.6, sugar_g: 12.23 };

const at100 = nutrientsForGrams(banana100, 100);
assert.deepEqual(at100, banana100, '100g of a per-100g food returns the per-100g values unchanged');

const at50 = nutrientsForGrams(banana100, 50);
assert.equal(at50.calories_kcal, 44.5, '50g → half calories');
assert.equal(at50.carbohydrates_g, 11.42, '50g → half carbs');
assert.equal(at50.fat_g, 0.17, '50g fat = round(0.165) = 0.17');

// two 50g halves sum back to ~the 100g whole (rounding-aware)
const twoHalves = addNutrients([at50, at50]);
assert.equal(twoHalves.calories_kcal, 89, 'two halves recombine to whole calories');
// carbs: 11.42 + 11.42 = 22.84 exact
assert.equal(twoHalves.carbohydrates_g, 22.84);

// ---------- scaleNutrients drops non-finite ----------
assert.deepEqual(scaleNutrients(banana100, NaN), {}, 'non-finite factor → empty');

// ---------- gramsForQuantity: units ----------
assert.equal(gramsForQuantity(100, 'g'), 100, 'grams pass through');
assert.equal(gramsForQuantity(1, 'cup'), 240, 'cup = 240g');
assert.equal(gramsForQuantity(1, 'xícara'), 240, 'pt-BR xícara = 240g');
assert.equal(gramsForQuantity(2, 'serving', 50), 100, 'serving uses servingGrams');
assert.equal(gramsForQuantity(1, 'serving'), undefined, 'serving without servingGrams → undefined');
assert.equal(gramsForQuantity(1, 'frobnicate'), undefined, 'unknown unit → undefined');
assert.ok(UNIT_TO_GRAMS.kg === 1000, 'UNIT_TO_GRAMS exported and sane');

// ---------- estimateMeal: English ----------
{
  const est = estimateMeal({ text: '2 eggs and a banana', meal_type: 'breakfast', locale: 'en' });
  const names = est.items.map((i) => i.name).sort();
  assert.deepEqual(names, ['banana', 'egg'], 'resolves egg + banana');
  const egg = est.items.find((i) => i.name === 'egg');
  assert.equal(egg.quantity, 2, '2 eggs');
  assert.equal(egg.grams, 100, '2 eggs * 50g serving = 100g');
  // total is the addNutrients of item nutrients
  assert.deepEqual(est.total_nutrients, addNutrients(est.items.map((i) => i.nutrients)), 'total = sum of items');
  assert.ok(est.confidence > 0.2 && est.confidence <= 0.7, 'confidence populated for matched meal');
  assert.ok(Array.isArray(est.unresolved), 'unresolved is an array');
}

// ---------- estimateMeal: pt-BR ----------
{
  const est = estimateMeal({ text: '2 ovos e 1 banana', meal_type: 'cafe', locale: 'pt-BR' });
  const names = est.items.map((i) => i.name).sort();
  assert.deepEqual(names, ['banana', 'egg'], 'pt-BR resolves ovos + banana');
  const banana = est.items.find((i) => i.name === 'banana');
  assert.equal(banana.quantity, 1);
  assert.equal(banana.grams, 118, '1 banana = 118g serving');
}

// ---------- estimateMeal: unresolved term lowers coverage ----------
{
  const est = estimateMeal({ text: '1 banana e abacate', meal_type: 'snack', locale: 'pt-BR' });
  assert.ok(est.items.some((i) => i.name === 'banana'), 'banana resolved');
  assert.ok(est.unresolved.includes('abacate'), 'abacate unresolved (not in catalog)');
}

// ---------- estimateMeal: zero quantity rejected ----------
{
  const est = estimateMeal({ text: '0 eggs', meal_type: 'snack', locale: 'en' });
  assert.equal(est.items.length, 0, 'zero quantity rejected');
  assert.ok(est.warnings.some((w) => /non-positive quantity/.test(w)), 'warns on rejected quantity');
}

console.log(JSON.stringify({ ok: true, nutrition_normalize: true, foods: listSimpleFoods().length }, null, 2));

// Offline, pure, zero-network, zero-key bilingual (EN + pt-BR) food → NutrientMap engine.
//
// Ported (MIT → MIT, same author) from wellness-nourish:
//   - src/services/nutrients.ts        → roundNutrient / scaleNutrients / addNutrients
//   - src/services/portion-engine.ts   → UNIT_TO_GRAMS / gramsForQuantity / nutrientsForGrams
//   - src/services/meal-estimator.ts   → SIMPLE_FOODS catalog + estimateMeal (made SYNC here —
//                                         the source had `async` with zero await/fetch/fs)
//   - src/types.ts:5-16                → local NutrientMap / MealType (kept here so this repo's
//                                         src/types.ts is NOT widened)
//
// The future log_nutrition WRITE tool calls estimateMeal(...) for free text or
// nutrientsForGrams(per100g, grams) for a single known food, then hands the NutrientMap to
// google-v4-nutrition-datapoint.ts (buildNutritionDataPointBody).
//
// SEAM (optional, future): online resolution via USDA (FDC_API_KEY) / Open Food Facts and the
// offline TACO table can be added as a lazy-imported sibling module behind a flag. Not needed
// for the foundation — estimateMeal + nutrientsForGrams already yield NutrientMap offline.
// If the TACO table is later added, carry TACO_LICENSE attribution.

// ---------------------------------------------------------------------------
// Local types (copied from wellness-nourish/src/types.ts:5-16). Kept local so the module is
// fully self-contained and does not widen this repo's src/types.ts.
// ---------------------------------------------------------------------------

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "other";

export interface NutrientMap {
  calories_kcal?: number;
  protein_g?: number;
  carbohydrates_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sugar_g?: number;
  saturated_fat_g?: number;
  sodium_mg?: number;
}

// ---------------------------------------------------------------------------
// nutrients.ts — pure scaling/rounding helpers.
// ---------------------------------------------------------------------------

export function roundNutrient(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function scaleNutrients(nutrients: NutrientMap, factor: number): NutrientMap {
  const scaled: NutrientMap = {};

  if (!Number.isFinite(factor)) {
    return scaled;
  }

  for (const [key, value] of Object.entries(nutrients) as Array<[keyof NutrientMap, number | undefined]>) {
    if (typeof value === "number" && Number.isFinite(value)) {
      scaled[key] = roundNutrient(value * factor);
    }
  }

  return scaled;
}

export function addNutrients(items: NutrientMap[]): NutrientMap {
  const totals: Partial<Record<keyof NutrientMap, number>> = {};

  for (const item of items) {
    for (const [key, value] of Object.entries(item) as Array<[keyof NutrientMap, number | undefined]>) {
      if (typeof value === "number" && Number.isFinite(value)) {
        totals[key] = (totals[key] ?? 0) + value;
      }
    }
  }

  const summed: NutrientMap = {};
  for (const [key, value] of Object.entries(totals) as Array<[keyof NutrientMap, number]>) {
    summed[key] = roundNutrient(value);
  }

  return summed;
}

// ---------------------------------------------------------------------------
// portion-engine.ts — unit → grams conversion + per-100g scaling.
// ---------------------------------------------------------------------------

export const UNIT_TO_GRAMS: Readonly<Record<string, number>> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.59,
  ml: 1,
  l: 1000,
  cup: 240,
  cups: 240,
  "xícara": 240,
  "xícaras": 240,
  xicara: 240,
  xicaras: 240,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  colher: 15,
  colheres: 15,
  "colher de sopa": 15,
  "colheres de sopa": 15,
  fatia: 50,
  fatias: 50,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  slice: 30,
  slices: 30,
  piece: 1,
  pieces: 1,
  unidade: 1,
  unidades: 1,
  concha: 100,
  conchas: 100,
  prato: 350,
  pratos: 350,
};

export function gramsForQuantity(
  quantity: number,
  unit: string,
  servingGrams?: number,
): number | undefined {
  if (!Number.isFinite(quantity)) {
    return undefined;
  }

  const normalizedUnit = unit.trim().toLowerCase();
  if (normalizedUnit === "serving" || normalizedUnit === "servings") {
    return typeof servingGrams === "number" && Number.isFinite(servingGrams)
      ? roundGrams(quantity * servingGrams)
      : undefined;
  }

  if (normalizedUnit === "piece" || normalizedUnit === "pieces") {
    return typeof servingGrams === "number" && Number.isFinite(servingGrams)
      ? roundGrams(quantity * servingGrams)
      : undefined;
  }

  const gramsPerUnit = UNIT_TO_GRAMS[normalizedUnit];
  return gramsPerUnit === undefined ? undefined : roundGrams(quantity * gramsPerUnit);
}

export function nutrientsForGrams(per100g: NutrientMap, grams: number): NutrientMap {
  return scaleNutrients(per100g, grams / 100);
}

function roundGrams(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// meal-estimator.ts — simple-food catalog + offline free-text estimator.
// ---------------------------------------------------------------------------

export interface SimpleFood {
  canonical: string;
  /** Human-friendly pt-BR label for foods whose canonical name is English. */
  displayNamePtBr?: string;
  aliases: string[];
  servingGrams: number;
  nutrientsPer100g: NutrientMap;
}

export interface EstimatedMealItem {
  name: string;
  quantity: number;
  grams: number;
  nutrients: NutrientMap;
}

export interface MealEstimate {
  text: string;
  locale: string;
  meal_type: MealType;
  items: EstimatedMealItem[];
  total_nutrients: NutrientMap;
  confidence: number;
  unresolved: string[];
  warnings: string[];
}

const SIMPLE_FOODS: readonly SimpleFood[] = [
  {
    canonical: "egg",
    displayNamePtBr: "ovo",
    aliases: [
      "boiled eggs",
      "boiled egg",
      "scrambled eggs",
      "omelete",
      "omelet",
      "ovos mexidos",
      "ovo mexido",
      "ovos cozidos",
      "ovo cozido",
      "ovos fritos",
      "ovo frito",
      "eggs",
      "egg",
      "ovos",
      "ovo",
    ],
    servingGrams: 50,
    nutrientsPer100g: {
      calories_kcal: 143,
      protein_g: 12.6,
      carbohydrates_g: 0.7,
      fat_g: 9.5,
    },
  },
  {
    canonical: "banana",
    displayNamePtBr: "banana",
    aliases: ["banana prata", "banana-prata", "bananas", "banana"],
    servingGrams: 118,
    nutrientsPer100g: {
      calories_kcal: 89,
      protein_g: 1.09,
      carbohydrates_g: 22.84,
      fat_g: 0.33,
      fiber_g: 2.6,
      sugar_g: 12.23,
    },
  },
  {
    canonical: "pão francês",
    displayNamePtBr: "pão francês",
    aliases: [
      "fatias de pão",
      "fatias de pao",
      "fatia de pão",
      "fatia de pao",
      "pães franceses",
      "paes franceses",
      "pão francês",
      "pao frances",
      "pão na chapa",
      "pao na chapa",
      "misto quente",
      "bauru",
      "french bread",
      "toast",
      "bread roll",
      "bread",
      "pães",
      "paes",
      "pão",
      "pao",
    ],
    servingGrams: 50,
    nutrientsPer100g: {
      calories_kcal: 313,
      protein_g: 13,
      carbohydrates_g: 55,
      fat_g: 4,
    },
  },
  {
    canonical: "olive oil",
    displayNamePtBr: "azeite de oliva",
    aliases: ["azeite de oliva", "azeite", "olive oil"],
    servingGrams: 15,
    nutrientsPer100g: {
      calories_kcal: 884,
      protein_g: 0,
      carbohydrates_g: 0,
      fat_g: 100,
    },
  },
  {
    canonical: "pão de queijo",
    displayNamePtBr: "pão de queijo",
    aliases: ["pães de queijo", "paes de queijo", "pão de queijo", "pao de queijo", "cheese bread"],
    servingGrams: 50,
    nutrientsPer100g: {
      calories_kcal: 330,
      protein_g: 5.1,
      carbohydrates_g: 34,
      fat_g: 18,
    },
  },
  {
    canonical: "black coffee",
    displayNamePtBr: "café preto",
    aliases: ["café preto", "cafe preto", "café sem açúcar", "cafe sem acucar", "black coffee", "coffee"],
    servingGrams: 240,
    nutrientsPer100g: {
      calories_kcal: 1,
      protein_g: 0.1,
      carbohydrates_g: 0,
      fat_g: 0,
    },
  },
  {
    canonical: "tapioca",
    displayNamePtBr: "tapioca",
    aliases: ["tapiocas", "tapioca", "goma de tapioca"],
    servingGrams: 80,
    nutrientsPer100g: {
      calories_kcal: 240,
      protein_g: 0.2,
      carbohydrates_g: 60,
      fat_g: 0.1,
    },
  },
  {
    canonical: "queijo minas",
    displayNamePtBr: "queijo minas",
    aliases: ["queijos minas", "queijo minas", "minas cheese", "queijo branco"],
    servingGrams: 40,
    nutrientsPer100g: {
      calories_kcal: 264,
      protein_g: 17.4,
      carbohydrates_g: 3.2,
      fat_g: 20.2,
    },
  },
  {
    canonical: "queijo coalho",
    displayNamePtBr: "queijo coalho",
    aliases: ["queijos coalho", "queijo coalho", "coalho cheese"],
    servingGrams: 50,
    nutrientsPer100g: {
      calories_kcal: 320,
      protein_g: 21,
      carbohydrates_g: 2,
      fat_g: 25,
    },
  },
  {
    canonical: "coxinha",
    displayNamePtBr: "coxinha",
    aliases: ["coxinhas", "coxinha", "chicken croquette"],
    servingGrams: 100,
    nutrientsPer100g: {
      calories_kcal: 285,
      protein_g: 9,
      carbohydrates_g: 28,
      fat_g: 15,
    },
  },
  {
    canonical: "brigadeiro",
    displayNamePtBr: "brigadeiro",
    aliases: ["brigadeiros", "brigadeiro", "chocolate truffle"],
    servingGrams: 30,
    nutrientsPer100g: {
      calories_kcal: 390,
      protein_g: 6,
      carbohydrates_g: 62,
      fat_g: 13,
      sugar_g: 52,
    },
  },
  {
    canonical: "açaí",
    displayNamePtBr: "açaí",
    aliases: ["açaí", "acai", "açaí na tigela", "acai bowl"],
    servingGrams: 200,
    nutrientsPer100g: {
      calories_kcal: 110,
      protein_g: 1.2,
      carbohydrates_g: 21,
      fat_g: 3.8,
      fiber_g: 2.6,
    },
  },
  {
    canonical: "rice",
    displayNamePtBr: "arroz",
    aliases: [
      "arroz branco cozido",
      "arroz branco",
      "arroz cozido",
      "cooked white rice",
      "white rice",
      "brown rice",
      "arroz",
      "rice",
    ],
    servingGrams: 158,
    nutrientsPer100g: {
      calories_kcal: 130,
      protein_g: 2.7,
      carbohydrates_g: 28,
      fat_g: 0.3,
    },
  },
  {
    canonical: "chicken",
    displayNamePtBr: "frango",
    aliases: [
      "peito de frango grelhado",
      "frango grelhado",
      "grilled chicken breast",
      "chicken breast",
      "peito de frango",
      "frango",
      "chicken",
    ],
    servingGrams: 100,
    nutrientsPer100g: {
      calories_kcal: 165,
      protein_g: 31,
      carbohydrates_g: 0,
      fat_g: 3.6,
    },
  },
  {
    canonical: "pinto beans",
    displayNamePtBr: "feijão carioca",
    aliases: [
      "feijão carioca cozido",
      "feijao carioca cozido",
      "feijão carioca",
      "feijao carioca",
      "cooked pinto beans",
      "pinto beans",
      "feijão",
      "feijao",
      "beans",
    ],
    servingGrams: 120,
    nutrientsPer100g: {
      calories_kcal: 76,
      protein_g: 4.8,
      carbohydrates_g: 13.6,
      fat_g: 0.5,
      fiber_g: 8.5,
    },
  },
  {
    canonical: "black beans",
    displayNamePtBr: "feijão preto",
    aliases: ["feijão preto cozido", "feijao preto cozido", "feijão preto", "feijao preto", "black beans"],
    servingGrams: 120,
    nutrientsPer100g: {
      calories_kcal: 77,
      protein_g: 4.5,
      carbohydrates_g: 14,
      fat_g: 0.5,
      fiber_g: 8.4,
    },
  },
  {
    canonical: "cuscuz",
    displayNamePtBr: "cuscuz",
    aliases: ["cuscuz", "cuscuz nordestino", "couscous"],
    servingGrams: 150,
    nutrientsPer100g: {
      calories_kcal: 112,
      protein_g: 2.2,
      carbohydrates_g: 25,
      fat_g: 0.7,
      fiber_g: 1.8,
    },
  },
  {
    canonical: "macaxeira",
    displayNamePtBr: "macaxeira",
    aliases: ["macaxeira", "aipim", "mandioca", "cassava", "yuca"],
    servingGrams: 150,
    nutrientsPer100g: {
      calories_kcal: 125,
      protein_g: 0.6,
      carbohydrates_g: 30,
      fat_g: 0.3,
      fiber_g: 1.8,
    },
  },
  {
    canonical: "batata doce",
    displayNamePtBr: "batata doce",
    aliases: ["batatas doces", "batata doce", "sweet potato"],
    servingGrams: 130,
    nutrientsPer100g: {
      calories_kcal: 86,
      protein_g: 1.6,
      carbohydrates_g: 20.1,
      fat_g: 0.1,
      fiber_g: 3,
    },
  },
  {
    canonical: "carne moída",
    displayNamePtBr: "carne moída",
    aliases: ["carne moída", "carne moida", "ground beef"],
    servingGrams: 100,
    nutrientsPer100g: {
      calories_kcal: 250,
      protein_g: 26,
      carbohydrates_g: 0,
      fat_g: 15,
    },
  },
  {
    canonical: "peixe grelhado",
    displayNamePtBr: "peixe grelhado",
    aliases: ["peixes grelhados", "peixe grelhado", "fish", "grilled fish"],
    servingGrams: 120,
    nutrientsPer100g: {
      calories_kcal: 130,
      protein_g: 26,
      carbohydrates_g: 0,
      fat_g: 2.7,
    },
  },
  {
    canonical: "picanha",
    displayNamePtBr: "picanha",
    aliases: ["picanhas", "picanha"],
    servingGrams: 150,
    nutrientsPer100g: {
      calories_kcal: 289,
      protein_g: 26,
      carbohydrates_g: 0,
      fat_g: 20,
    },
  },
  {
    canonical: "alcatra",
    displayNamePtBr: "alcatra",
    aliases: ["alcatras", "alcatra"],
    servingGrams: 150,
    nutrientsPer100g: {
      calories_kcal: 220,
      protein_g: 29,
      carbohydrates_g: 0,
      fat_g: 11,
    },
  },
  {
    canonical: "costela",
    displayNamePtBr: "costela",
    aliases: ["costelas", "costela", "beef ribs"],
    servingGrams: 150,
    nutrientsPer100g: {
      calories_kcal: 330,
      protein_g: 24,
      carbohydrates_g: 0,
      fat_g: 26,
    },
  },
  {
    canonical: "feijoada",
    displayNamePtBr: "feijoada",
    aliases: ["feijoadas", "feijoada completa", "feijoada"],
    servingGrams: 250,
    nutrientsPer100g: {
      calories_kcal: 150,
      protein_g: 9,
      carbohydrates_g: 12,
      fat_g: 7,
      fiber_g: 4,
    },
  },
  {
    canonical: "feijão tropeiro",
    displayNamePtBr: "feijão tropeiro",
    aliases: ["feijão tropeiro", "feijao tropeiro"],
    servingGrams: 180,
    nutrientsPer100g: {
      calories_kcal: 210,
      protein_g: 9,
      carbohydrates_g: 22,
      fat_g: 10,
      fiber_g: 5,
    },
  },
  {
    canonical: "farofa",
    displayNamePtBr: "farofa",
    aliases: ["farofas", "farofa"],
    servingGrams: 50,
    nutrientsPer100g: {
      calories_kcal: 360,
      protein_g: 3,
      carbohydrates_g: 72,
      fat_g: 7,
      fiber_g: 5,
    },
  },
  {
    canonical: "couve refogada",
    displayNamePtBr: "couve refogada",
    aliases: ["couve refogada", "couve"],
    servingGrams: 70,
    nutrientsPer100g: {
      calories_kcal: 45,
      protein_g: 2.5,
      carbohydrates_g: 5,
      fat_g: 2,
      fiber_g: 3,
    },
  },
  {
    canonical: "vinagrete",
    displayNamePtBr: "vinagrete",
    aliases: ["vinagretes", "vinagrete"],
    servingGrams: 60,
    nutrientsPer100g: {
      calories_kcal: 35,
      protein_g: 1,
      carbohydrates_g: 6,
      fat_g: 1,
      fiber_g: 1.5,
    },
  },
  {
    canonical: "iogurte natural",
    displayNamePtBr: "iogurte natural",
    aliases: ["iogurtes naturais", "iogurte natural", "iogurtes", "iogurte", "plain yogurt", "yogurt"],
    servingGrams: 170,
    nutrientsPer100g: {
      calories_kcal: 61,
      protein_g: 3.5,
      carbohydrates_g: 4.7,
      fat_g: 3.3,
      sugar_g: 4.7,
    },
  },
  {
    canonical: "salad",
    displayNamePtBr: "salada",
    aliases: ["salada simples", "simple salad", "salada", "salad"],
    servingGrams: 80,
    nutrientsPer100g: {
      calories_kcal: 20,
      protein_g: 1.2,
      carbohydrates_g: 3.5,
      fat_g: 0.2,
      fiber_g: 1.6,
    },
  },
  {
    canonical: "oatmeal",
    displayNamePtBr: "mingau de aveia",
    aliases: ["oatmeal", "oats"],
    servingGrams: 234,
    nutrientsPer100g: {
      calories_kcal: 71,
      protein_g: 2.5,
      carbohydrates_g: 12,
      fat_g: 1.5,
      fiber_g: 1.7,
    },
  },
  {
    canonical: "milk",
    displayNamePtBr: "leite",
    aliases: ["milk"],
    servingGrams: 244,
    nutrientsPer100g: {
      calories_kcal: 61,
      protein_g: 3.2,
      carbohydrates_g: 4.8,
      fat_g: 3.3,
    },
  },
  {
    canonical: "cafezinho",
    displayNamePtBr: "cafezinho",
    aliases: ["cafezinhos", "cafezinho"],
    servingGrams: 50,
    nutrientsPer100g: {
      calories_kcal: 1,
      protein_g: 0.1,
      carbohydrates_g: 0,
      fat_g: 0,
    },
  },
  {
    canonical: "apple",
    displayNamePtBr: "maçã",
    aliases: ["apple", "apples", "maçãs", "macas", "maçã", "maca"],
    servingGrams: 182,
    nutrientsPer100g: {
      calories_kcal: 52,
      protein_g: 0.3,
      carbohydrates_g: 13.8,
      fat_g: 0.2,
      fiber_g: 2.4,
      sugar_g: 10.4,
    },
  },
];

const FOOD_BY_ALIAS = new Map<string, SimpleFood>(
  SIMPLE_FOODS.flatMap((food) => food.aliases.map((alias) => [normalizeAlias(alias), food] as const)),
);

export function listSimpleFoods(): readonly SimpleFood[] {
  return SIMPLE_FOODS;
}

// QUANTITY_PATTERN accepts:
//   - integer or decimal with `.` OR `,` (pt-BR/es-419 decimal comma — N-004)
//   - simple fractions (1/2, 1.5/2)
//   - optional leading `-` so we can DETECT negatives and reject them in
//     parseQuantity instead of silently dropping them (N-005)
const NUMERIC_QUANTITY_PATTERN = String.raw`-?\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?`;
const QUANTITY_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  um: 1,
  uma: 1,
  uns: 1,
  umas: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};
const QUANTITY_WORD_PATTERN = Object.keys(QUANTITY_WORDS)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");
const QUANTITY_PATTERN = String.raw`(?:${NUMERIC_QUANTITY_PATTERN}|${QUANTITY_WORD_PATTERN})`;
const UNIT_PATTERN = [
  "tablespoons",
  "tablespoon",
  "teaspoons",
  "teaspoon",
  "servings",
  "serving",
  "slices",
  "slice",
  "pieces",
  "piece",
  "cups",
  "cup",
  "xícaras",
  "xícara",
  "xicaras",
  "xicara",
  "tbsp",
  "colheres de sopa",
  "colher de sopa",
  "tsp",
  "colheres",
  "colher",
  "fatias",
  "fatia",
  "conchas",
  "concha",
  "pratos",
  "prato",
  "unidades",
  "unidade",
  "ounces",
  "ounce",
  "oz",
  "grams",
  "gram",
  "g",
  "kg",
  "lb",
  "ml",
  "l",
].join("|");
const FOOD_PATTERN = new RegExp(
  String.raw`(?:^|(?<=[^\p{L}\p{N}_\/-]))(?:(${QUANTITY_PATTERN})\s*)?(?:(${UNIT_PATTERN})\s+(?:de\s+)?)?(${[...FOOD_BY_ALIAS.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})(?=$|[^\p{L}\p{N}_-])`,
  "giu",
);

interface MatchSpan {
  start: number;
  end: number;
}

// NOTE: made SYNC here (the wellness-nourish source declared this `async` but performs zero
// awaits / no I/O). Verified leaf-pure: no network, no fs, no dynamic import.
export function estimateMeal(input: {
  text: string;
  meal_type: MealType;
  locale: string;
}): MealEstimate {
  const items: EstimatedMealItem[] = [];
  const matchSpans: MatchSpan[] = [];

  let rejectedQuantities = 0;

  for (const match of input.text.matchAll(FOOD_PATTERN)) {
    const quantity = parseQuantity(match[1]);
    const unit = match[2]?.toLowerCase();
    const alias = match[3];
    const food = alias === undefined ? undefined : FOOD_BY_ALIAS.get(normalizeAlias(alias));

    if (food === undefined) {
      continue;
    }
    // Skip foods with explicitly invalid quantities (zero, negative). The food
    // name then falls into `unresolved` rather than being silently estimated
    // as a default serving — N-005.
    if (quantity === null) {
      rejectedQuantities += 1;
      continue;
    }
    if (isAmbiguousBreadFalsePositive(input.text, match)) {
      continue;
    }

    const grams = unit === undefined
      ? food.servingGrams * quantity
      : (gramsForQuantity(quantity, unit, food.servingGrams) ?? food.servingGrams * quantity);
    items.push({
      name: food.canonical,
      quantity,
      grams,
      nutrients: nutrientsForGrams(food.nutrientsPer100g, grams),
    });
    const start = match.index ?? 0;
    matchSpans.push({
      start,
      end: start + match[0].length,
    });
  }

  const unresolved = findUnresolvedTerms(input.text, matchSpans);
  const baseWarnings = estimateWarnings(items.length, unresolved);
  const warnings = rejectedQuantities > 0
    ? [
        ...baseWarnings,
        `Rejected ${rejectedQuantities} food item(s) with non-positive quantity (zero or negative).`,
      ]
    : baseWarnings;

  return {
    text: input.text,
    locale: input.locale,
    meal_type: input.meal_type,
    items,
    total_nutrients: addNutrients(items.map((item) => item.nutrients)),
    confidence: estimateConfidence(items.length, unresolved.length),
    unresolved,
    warnings,
  };
}

function findUnresolvedTerms(text: string, matchSpans: MatchSpan[]): string[] {
  const unresolved: string[] = [];

  for (const clause of splitMealClauses(text)) {
    let residual = clause.text;
    const localSpans = matchSpans
      .filter((span) => span.start < clause.end && span.end > clause.start)
      .map((span) => ({
        start: Math.max(0, span.start - clause.start),
        end: Math.min(clause.text.length, span.end - clause.start),
      }))
      .sort((left, right) => right.start - left.start);

    for (const span of localSpans) {
      residual = `${residual.slice(0, span.start)} ${residual.slice(span.end)}`;
    }

    const cleaned = cleanUnresolvedTerm(residual);
    if (cleaned !== undefined && !unresolved.includes(cleaned)) {
      unresolved.push(cleaned);
    }
  }

  return unresolved;
}

function splitMealClauses(text: string): Array<{ text: string; start: number; end: number }> {
  const clauses: Array<{ text: string; start: number; end: number }> = [];
  // Don't split on a `,` that sits between two digits — that's a pt-BR decimal
  // separator like "1,5", not a clause boundary. (N-004)
  const separators = /(?<!\d),(?!\d)|;|\+|&|\s+\b(?:e|and|com|with)\b\s+/giu;
  let start = 0;

  for (const match of text.matchAll(separators)) {
    const end = match.index ?? start;
    pushClause(clauses, text, start, end);
    start = end + match[0].length;
  }

  pushClause(clauses, text, start, text.length);

  return clauses;
}

function pushClause(
  clauses: Array<{ text: string; start: number; end: number }>,
  source: string,
  start: number,
  end: number,
): void {
  const raw = source.slice(start, end);
  const trimmedStartOffset = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return;
  }

  clauses.push({
    text: trimmed,
    start: start + trimmedStartOffset,
    end: start + trimmedStartOffset + trimmed.length,
  });
}

function cleanUnresolvedTerm(raw: string): string | undefined {
  // Only strip a leading quantity when it is a standalone token. The main food
  // matcher can safely accept word quantities such as "a"/"uma" before known
  // food aliases, but unresolved cleanup must not turn unknown foods like
  // "abacate" or "atum" into "bacate"/"tum".
  const leadingQuantityPattern = new RegExp(
    String.raw`^\s*(?:${QUANTITY_PATTERN})(?:(?:\s*(?:${UNIT_PATTERN})\s+)|\s+|\s*$)`,
    "iu",
  );
  const cleaned = raw
    .replace(leadingQuantityPattern, "")
    .replace(/^[,;:+&\s]+|[,;:+&\s]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

  if (!/[\p{L}\p{N}]/u.test(cleaned) || isStopword(cleaned)) {
    return undefined;
  }

  return cleaned;
}

function estimateConfidence(matchedCount: number, unresolvedCount: number): number {
  if (matchedCount === 0) {
    return 0.2;
  }

  const coverage = matchedCount / Math.max(1, matchedCount + unresolvedCount);
  return Math.round((0.2 + 0.5 * coverage) * 100) / 100;
}

function estimateWarnings(matchedCount: number, unresolved: string[]): string[] {
  const warnings =
    matchedCount > 0
      ? ["Nutrition values are estimates from simple food defaults."]
      : ["No simple foods matched; nutrition estimate is incomplete."];

  if (unresolved.length > 0) {
    warnings.push(`Unresolved food terms: ${unresolved.join(", ")}.`);
    warnings.push("Estimate confidence was reduced because some meal text was not matched.");
  }

  return warnings;
}

function normalizeAlias(alias: string): string {
  return alias.toLowerCase();
}

function isStopword(value: string): boolean {
  return ["e", "and", "with", "com", "sem", "de", "da", "do", "das", "dos", "a", "o", "as", "os"].includes(
    value.toLowerCase(),
  );
}

function isAmbiguousBreadFalsePositive(text: string, match: RegExpExecArray): boolean {
  const alias = normalizeAlias(match[3] ?? "");
  if (alias !== "pão" && alias !== "pao") {
    return false;
  }

  const after = text.slice((match.index ?? 0) + match[0].length);
  return /^\s+de\s+\p{L}/iu.test(after);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse a captured quantity string.
 *
 * - `undefined` → 1 (no quantity given, default).
 * - explicit zero or negative (e.g. "0", "-100") → `null` (invalid; caller
 *   should skip the food rather than fall back to a default serving — N-005).
 * - decimal comma supported (e.g. "1,5" → 1.5 — N-004).
 *
 * Note: this returns `number | null` instead of always `number` so callers can
 * distinguish "not specified" (default 1) from "explicitly invalid" (skip).
 */
function parseQuantity(raw: string | undefined): number | null {
  if (raw === undefined) {
    return 1;
  }

  const normalized = raw.trim().toLowerCase();
  const wordQuantity = QUANTITY_WORDS[normalized];
  if (wordQuantity !== undefined) {
    return wordQuantity;
  }

  const [numerator, denominator] = normalized.split("/");
  if (numerator === undefined) {
    return null;
  }

  const num = Number.parseFloat(numerator.replace(",", "."));
  const den = denominator === undefined ? 1 : Number.parseFloat(denominator.replace(",", "."));
  const quantity = num / den;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return quantity;
}

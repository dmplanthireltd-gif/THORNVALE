import type { Recipe } from './recipes';

/**
 * Cooking: raw fish and meat become food that heals more. Cook on any
 * campfire (the ones in camps and the ones players light) or on a stove (one
 * in every depot). Every attempt can burn the food, less often the higher your
 * level, and a stove burns less than an open fire. Burnt food is worth almost
 * nothing.
 */
export const BURNT_FOOD = 'burnt_food';

export interface FoodDef {
  raw: string;
  cooked: string;
  level: number;
  xp: number;
}

/** Cheapest first. The cooked items are the old food items (fish from fishing, meat and ham from hunting). */
export const FOODS: FoodDef[] = [
  { raw: 'raw_meat', cooked: 'meat', level: 1, xp: 30 },
  { raw: 'raw_fish', cooked: 'fish', level: 1, xp: 30 },
  { raw: 'raw_trout', cooked: 'trout', level: 10, xp: 50 },
  { raw: 'raw_ham', cooked: 'ham', level: 15, xp: 60 },
  { raw: 'raw_pike', cooked: 'pike', level: 20, xp: 70 },
  { raw: 'raw_salmon', cooked: 'salmon', level: 30, xp: 90 },
  { raw: 'raw_ice_fish', cooked: 'ice_fish', level: 40, xp: 115 },
  { raw: 'raw_swordfish', cooked: 'swordfish', level: 50, xp: 140 },
];

export const RAW_FOOD_ITEMS = FOODS.map((f) => f.raw);

/**
 * Chance not to burn: 55% at the food's level on a campfire (+2% a level, never burns
 * 23 levels above it), 65% on a stove (never burns 18 levels above it).
 */
export const BURN = {
  campfire: { base: 0.55, perLevel: 0.02 },
  stove: { base: 0.65, perLevel: 0.02 },
} as const;

export const COOKING_RECIPES: Recipe[] = (['campfire', 'stove'] as const).flatMap((station) =>
  FOODS.map((f): Recipe => ({
    id: `cook:${station}:${f.cooked}`, skill: 'cooking', station, group: f.raw.includes('meat') || f.raw.includes('ham') ? 'Meat' : 'Fish',
    level: f.level, xp: f.xp, inputs: [{ id: f.raw, qty: 1 }], output: { id: f.cooked, qty: 1 }, success: BURN[station], fail: { id: BURNT_FOOD, qty: 1 },
  })),
);

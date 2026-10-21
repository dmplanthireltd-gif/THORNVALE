import { Ground, Obj, type WorldMap } from '../world/WorldMap';

/**
 * Fishing, the second gathering skill. Same 1–99 curve as woodcutting (see
 * woodcutting.ts: gatherLevelForXp / gatherXpForLevel). Use open water within
 * FISH_RANGE tiles while carrying a fishing rod and you keep casting on a timer.
 * Each cast may get a bite; a bite lands the best fish that lives in that water
 * and that your level allows, with a chance, otherwise a lower one. Catches
 * are raw (cook them on a campfire or stove: production/cooking.ts).
 */
/** Seconds between two casts. */
export const FISH_INTERVAL = 2.5;
/** How far away (tiles, Chebyshev) the water may be. */
export const FISH_RANGE = 3;
/** Item id of the fishing rod. */
export const FISHING_ROD = 'fishing_rod';
/** Chance per cast of a rare catch: an old boot, or a treasure. */
export const JUNK_CHANCE = 0.01;
export const TREASURE_CHANCE = 0.01;
/** A fishing spot (3×3 tiles) gets wary after this many catches… */
export const SPOT_WARY_AFTER = 6;
/** …and forgets one catch every this many seconds. */
export const SPOT_RECOVER_SECONDS = 20;

/** Where a fish lives. */
export type FishWater = 'any' | 'shallow' | 'cold' | 'deep';

export interface FishDef {
  /** Item id of the cooked fish (the food; the fishing items from before cooking existed). */
  item: string;
  /** Item id of the raw fish a catch gives (cook it into `item`, save v9+). */
  raw: string;
  name: string;
  /** Fishing level needed. */
  level: number;
  xp: number;
  where: FishWater;
}

/** Cheapest first. */
export const FISH: FishDef[] = [
  { item: 'fish', raw: 'raw_fish', name: 'small fish', level: 1, xp: 10, where: 'any' },
  { item: 'trout', raw: 'raw_trout', name: 'trout', level: 10, xp: 25, where: 'any' },
  { item: 'pike', raw: 'raw_pike', name: 'pike', level: 20, xp: 40, where: 'shallow' },
  { item: 'salmon', raw: 'raw_salmon', name: 'salmon', level: 30, xp: 60, where: 'shallow' },
  { item: 'ice_fish', raw: 'raw_ice_fish', name: 'ice fish', level: 40, xp: 80, where: 'cold' },
  { item: 'swordfish', raw: 'raw_swordfish', name: 'swordfish', level: 50, xp: 110, where: 'deep' },
];

/** Every (cooked) fish item id, cheapest first. */
export const FISH_ITEMS = FISH.map((f) => f.item);
/** Every raw fish a catch gives, cheapest first. */
export const RAW_FISH_ITEMS = FISH.map((f) => f.raw);

/** Gems and rings a lucky cast can pull up (all existing loot items). */
export const TREASURE_ITEMS = ['small_ruby', 'small_sapphire', 'small_emerald', 'sunstone_ring', 'ring_of_vigor', 'sapphire_ring'];

/** Open water you can fish in: plain or deep water with nothing standing on it. */
export function isFishingWater(world: WorldMap, x: number, y: number, z: number): boolean {
  if (!world.inBounds(x, y)) return false;
  const g = world.getGround(x, y, z);
  return (g === Ground.Water || g === Ground.DeepWater) && world.getObj(x, y, z) === Obj.None;
}

/** Whether snow or ice lies within 3 tiles (ice fish live there). */
export function isColdWater(world: WorldMap, x: number, y: number, z: number): boolean {
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (!world.inBounds(x + dx, y + dy)) continue;
      const g = world.getGround(x + dx, y + dy, z);
      if (g === Ground.Snow || g === Ground.Ice) return true;
    }
  }
  return false;
}

/** The fish that live in this water and that a fisher of `level` can catch, best first. */
export function fishFor(world: WorldMap, x: number, y: number, z: number, level: number): FishDef[] {
  const deep = world.getGround(x, y, z) === Ground.DeepWater;
  const cold = isColdWater(world, x, y, z);
  return FISH.filter((f) => f.level <= level && (
    f.where === 'any' || (f.where === 'shallow' && !deep) || (f.where === 'deep' && deep) || (f.where === 'cold' && cold)
  )).reverse();
}

/** Chance one cast gets a bite: better with level, worse on a spot fished out (wary = recent catches there). */
export function biteChance(level: number, wary: number): number {
  const base = Math.min(0.75, 0.35 + level * 0.004);
  const tired = wary < SPOT_WARY_AFTER ? 1 : Math.max(0.3, 1 - (wary - SPOT_WARY_AFTER + 1) * 0.15);
  return base * tired;
}

/** Chance a bite is this fish rather than a lesser one: 35% at its level, +2% per level above (20–80%). */
export function tierChance(level: number, f: FishDef): number {
  return Math.max(0.2, Math.min(0.8, 0.35 + (level - f.level) * 0.02));
}

/** Picks the fish for a bite from a best-first list (the last one always bites). */
export function rollFish(list: FishDef[], level: number, rnd: () => number = Math.random): FishDef | null {
  for (let i = 0; i < list.length; i++) if (i === list.length - 1 || rnd() < tierChance(level, list[i])) return list[i];
  return null;
}

/** Key of the 3×3 fishing spot a water tile belongs to. */
export function spotKey(x: number, y: number, z: number): string {
  return `${Math.floor(x / 3)},${Math.floor(y / 3)},${z}`;
}

import type { ItemStack } from '../inventory/items';
import type { NonCombatSkill } from '../gathering/skills';
import { Obj } from '../world/WorldMap';
import { SMELTING_RECIPES, SMITHING_RECIPES } from './smithing';

/**
 * Production skills share one model: stand at a station (furnace, anvil, and
 * later ranges, fletching benches, workbenches…), pick a recipe and how many,
 * and the game makes one every few seconds until done, out of materials or
 * interrupted by walking. A new production skill adds its station here and its
 * recipes to RECIPES.
 */
export type Station = 'furnace' | 'anvil';

export interface StationDef {
  id: Station;
  obj: Obj;
  name: string;
  /** Window title. */
  title: string;
  skill: NonCombatSkill;
  /** Seconds per item made. */
  interval: number;
}

export const STATIONS: Record<Station, StationDef> = {
  furnace: { id: 'furnace', obj: Obj.Furnace, name: 'furnace', title: 'Furnace — smelt bars', skill: 'smithing', interval: 2.4 },
  anvil: { id: 'anvil', obj: Obj.Anvil, name: 'anvil', title: 'Anvil — smith', skill: 'smithing', interval: 2.4 },
};

export function stationAt(o: Obj): StationDef | null {
  for (const s of Object.values(STATIONS)) if (s.obj === o) return s;
  return null;
}

export interface Recipe {
  /** Stable id (sent over the wire). */
  id: string;
  skill: NonCombatSkill;
  station: Station;
  /** Heading the recipe is listed under (e.g. "Bronze"). */
  group: string;
  level: number;
  xp: number;
  inputs: ItemStack[];
  output: ItemStack;
  /** Tool you must carry (not used up). */
  tool?: string;
  /** Chance one attempt succeeds: base at the recipe level, + perLevel above it (capped at 1). Absent = always. */
  success?: { base: number; perLevel: number };
}

/** Chance an attempt at a recipe works for a crafter of this level. */
export function recipeChance(r: Recipe, level: number): number {
  if (!r.success) return 1;
  return Math.max(0, Math.min(1, r.success.base + (level - r.level) * r.success.perLevel));
}

/** What a station window shows. */
export interface CraftView {
  station: Station;
  title: string;
  skill: NonCombatSkill;
  level: number;
  /** The batch being made right now, if any. */
  making: { recipe: string; left: number } | null;
  recipes: Array<{
    id: string;
    group: string;
    level: number;
    xp: number;
    inputs: Array<{ id: string; qty: number; have: number }>;
    output: ItemStack;
    tool?: string;
    hasTool: boolean;
    /** Percent chance of success (100 for most). */
    chance: number;
    /** How many you could make now with what you carry (0 when the level is too low). */
    can: number;
  }>;
}

/** Most items one "Make" order may ask for. */
export const MAX_BATCH = 100;

/** Every recipe of every production skill. */
export const RECIPES: Recipe[] = [...SMELTING_RECIPES, ...SMITHING_RECIPES];

const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export function recipeById(id: string): Recipe | null {
  return BY_ID.get(id) ?? null;
}

export function recipesAt(station: Station): Recipe[] {
  return RECIPES.filter((r) => r.station === station);
}

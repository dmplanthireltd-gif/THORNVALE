import type { ItemStack } from '../inventory/items';
import type { NonCombatSkill } from '../gathering/skills';
import { Obj } from '../world/WorldMap';
import { SMELTING_RECIPES, SMITHING_RECIPES } from './smithing';
import { COOKING_RECIPES } from './cooking';
import { FLETCHING_RECIPES } from './fletching';
import { CRAFTING_RECIPES } from './crafting';
import { FIREMAKING_RECIPES } from './firemaking';
import { HERBLORE_RECIPES } from './herblore';
import { CLEAN_HERBS, GRIMY_HERBS } from '../trades/herblore';

const HERB_ITEM_IDS = [...GRIMY_HERBS, ...CLEAN_HERBS];

/**
 * Production skills share one model: open a station window, pick a recipe and
 * how many, and the game makes one every few seconds until done, out of
 * materials or interrupted by walking. A station is either a map object you
 * stand next to (furnace, anvil, campfire, stove, tanning rack) or a hand tool
 * you use from the backpack (knife, needle, chisel, tinderbox: "portable"
 * stations, worked where you stand). A new production skill adds its station
 * here and its recipes to RECIPES.
 */
export type Station = 'furnace' | 'anvil' | 'campfire' | 'stove' | 'tanning' | 'knife' | 'needle' | 'chisel' | 'tinderbox' | 'pestle';

export interface StationDef {
  id: Station;
  /** Map object you use to open it; null for a hand tool (portable station). */
  obj: Obj | null;
  /** Portable stations: the items whose "use" opens the window (the tool first). */
  items?: string[];
  name: string;
  /** Window title. */
  title: string;
  /** The skill whose level the window shows (a recipe may train another, e.g. jewellery at the furnace). */
  skill: NonCombatSkill;
  /** Seconds per item made. */
  interval: number;
  /** One line under the title (what you need). */
  note?: string;
}

export const STATIONS: Record<Station, StationDef> = {
  furnace: { id: 'furnace', obj: Obj.Furnace, name: 'furnace', title: 'Furnace — smelt bars, cast jewellery', skill: 'smithing', interval: 2.4, note: 'Jewellery trains crafting.' },
  anvil: { id: 'anvil', obj: Obj.Anvil, name: 'anvil', title: 'Anvil — smith', skill: 'smithing', interval: 2.4, note: "Smithing needs a smith's hammer in your backpack." },
  campfire: { id: 'campfire', obj: Obj.Campfire, name: 'campfire', title: 'Campfire — cook', skill: 'cooking', interval: 2.4, note: 'Food you burn is lost. A stove burns less.' },
  stove: { id: 'stove', obj: Obj.Stove, name: 'stove', title: 'Stove — cook', skill: 'cooking', interval: 2.4, note: 'A stove burns less food than a campfire.' },
  tanning: { id: 'tanning', obj: Obj.TanningRack, name: 'tanning rack', title: 'Tanning rack — tan hides', skill: 'crafting', interval: 1.8 },
  knife: { id: 'knife', obj: null, items: ['knife', 'arrow_shaft', 'feather'], name: 'knife', title: 'Fletching', skill: 'fletching', interval: 1.8, note: 'Carving needs a knife. Arrows need shafts, feathers and arrowheads.' },
  needle: { id: 'needle', obj: null, items: ['needle', 'thread', 'leather', 'tanned_fur'], name: 'needle', title: 'Leatherwork', skill: 'crafting', interval: 2.4, note: 'Sewing needs a needle; every piece uses thread.' },
  chisel: { id: 'chisel', obj: null, items: ['chisel'], name: 'chisel', title: 'Gem cutting', skill: 'crafting', interval: 2.4, note: 'Cutting needs a chisel.' },
  tinderbox: { id: 'tinderbox', obj: null, items: ['tinderbox'], name: 'tinderbox', title: 'Firemaking', skill: 'firemaking', interval: 2.4, note: 'Lights a fire where you stand (not in towns); you step aside.' },
  pestle: {
    id: 'pestle', obj: null, items: ['pestle', 'empty_vial', ...HERB_ITEM_IDS], name: 'pestle and mortar', title: 'Herblore', skill: 'herblore', interval: 1.8,
    note: 'Clean grimy herbs, then brew a herb with an empty vial (and a monster part for the stronger brews). Brewing needs a pestle and mortar.',
  },
};

const STATION_LIST = Object.values(STATIONS);

export function stationAt(o: Obj): StationDef | null {
  for (const s of STATION_LIST) if (s.obj !== null && s.obj === o) return s;
  return null;
}

/** The hand-tool station an item opens when used from the backpack (knife, needle…), if any. */
export function stationForItem(id: string): StationDef | null {
  for (const s of STATION_LIST) if (s.obj === null && s.items?.includes(id)) return s;
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
  /** What a failed attempt leaves behind (cooking: burnt food); absent = nothing. */
  fail?: ItemStack;
  /** Firemaking: no item is made; the inputs light a campfire burning this many seconds (min, max). */
  fire?: [number, number];
  /** Shown instead of the output's name (e.g. "Light logs"). */
  label?: string;
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
  /** Extra line under the title (what the station needs). */
  note?: string;
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
    /** Display name when it is not the output item's ("Light logs"). */
    label?: string;
    /** The skill this recipe trains and needs (usually the station's). */
    skill: NonCombatSkill;
    /** Level too low for it. */
    locked: boolean;
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
export const RECIPES: Recipe[] = [...SMELTING_RECIPES, ...SMITHING_RECIPES, ...COOKING_RECIPES, ...FLETCHING_RECIPES, ...CRAFTING_RECIPES, ...FIREMAKING_RECIPES, ...HERBLORE_RECIPES];

const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export function recipeById(id: string): Recipe | null {
  return BY_ID.get(id) ?? null;
}

export function recipesAt(station: Station): Recipe[] {
  return RECIPES.filter((r) => r.station === station);
}

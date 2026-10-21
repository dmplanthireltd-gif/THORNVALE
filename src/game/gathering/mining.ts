import { Obj } from '../world/WorldMap';

/**
 * Mining, a gathering skill on the same 1–99 curve as woodcutting. Use an ore
 * rock while carrying a pickaxe and you keep swinging on a timer; each success
 * gives one ore and experience, and the rock is mined out (grey rubble) until it
 * fills again a while later. Now and then a gem falls out of the rock.
 */
/** Seconds between two swings of the pickaxe. */
export const MINE_INTERVAL = 2.4;
/** Chance per ore mined that a gem comes loose as well. */
export const GEM_CHANCE = 1 / 80;
/** Gems a rock can hold (existing loot items), with their weights. */
export const MINING_GEMS: Array<[string, number]> = [['small_sapphire', 40], ['small_emerald', 30], ['small_ruby', 20], ['small_diamond', 10]];

export interface OreDef {
  obj: Obj;
  /** Rock name, e.g. "copper rock". */
  name: string;
  /** Mining level needed. */
  level: number;
  /** Item id of the ore. */
  ore: string;
  xp: number;
  /** Base chance per swing at the required level with a bronze pickaxe. */
  chance: number;
  /** Chance the rock is mined out after giving ore (1 = always). */
  deplete: number;
  /** Seconds until a mined-out rock is full again (min, max). */
  respawn: [number, number];
  /** Vein colour (render). */
  color: number;
}

/** Cheapest first. */
export const ORES: OreDef[] = [
  { obj: Obj.CopperRock, name: 'copper rock', level: 1, ore: 'copper_ore', xp: 18, chance: 0.5, deplete: 1, respawn: [5, 8], color: 0xc8743a },
  { obj: Obj.TinRock, name: 'tin rock', level: 1, ore: 'tin_ore', xp: 18, chance: 0.5, deplete: 1, respawn: [5, 8], color: 0xb8bcc4 },
  { obj: Obj.IronRock, name: 'iron rock', level: 15, ore: 'iron_ore', xp: 35, chance: 0.42, deplete: 1, respawn: [9, 14], color: 0x8a4a34 },
  { obj: Obj.CoalRock, name: 'coal rock', level: 30, ore: 'coal', xp: 50, chance: 0.32, deplete: 0.5, respawn: [25, 40], color: 0x1c1c20 },
  { obj: Obj.SilverRock, name: 'silver rock', level: 40, ore: 'silver_ore', xp: 40, chance: 0.3, deplete: 1, respawn: [45, 75], color: 0xe4e8f0 },
  { obj: Obj.GoldRock, name: 'gold rock', level: 50, ore: 'gold_ore', xp: 65, chance: 0.28, deplete: 1, respawn: [50, 80], color: 0xf0c030 },
  { obj: Obj.StarsteelRock, name: 'starsteel rock', level: 60, ore: 'starsteel_ore', xp: 80, chance: 0.24, deplete: 1, respawn: [100, 150], color: 0x5a8ad8 },
  { obj: Obj.DarkstoneRock, name: 'darkstone rock', level: 75, ore: 'darkstone_ore', xp: 125, chance: 0.2, deplete: 1, respawn: [180, 260], color: 0x5a2a6a },
];

/** Every ore item id, cheapest first. */
export const ORE_ITEMS = ORES.map((o) => o.ore);

const BY_OBJ = new Map<Obj, OreDef>(ORES.map((o) => [o.obj, o]));

export function oreAt(o: Obj): OreDef | null {
  return BY_OBJ.get(o) ?? null;
}

export interface PickaxeDef {
  item: string;
  /** 1 = bronze … 4 = starsteel: each tier above bronze adds to the chance per swing. */
  tier: number;
  /** Mining level needed to use it. */
  level: number;
}

/** Weakest first. */
export const PICKAXES: PickaxeDef[] = [
  { item: 'bronze_pickaxe', tier: 1, level: 1 },
  { item: 'iron_pickaxe', tier: 2, level: 10 },
  { item: 'steel_pickaxe', tier: 3, level: 25 },
  { item: 'starsteel_pickaxe', tier: 4, level: 45 },
];

export function pickaxeDef(item: string): PickaxeDef | null {
  return PICKAXES.find((p) => p.item === item) ?? null;
}

/**
 * Chance one swing gives ore: better with every level above the rock's
 * requirement and with every pickaxe tier above bronze (5–90%).
 */
export function mineChance(level: number, ore: OreDef, tier: number): number {
  const c = ore.chance + (level - ore.level) * 0.008 + Math.max(0, tier - 1) * 0.07;
  return Math.max(0.05, Math.min(0.9, c));
}

/** Picks a gem by weight. */
export function rollGem(rnd: () => number = Math.random): string {
  const total = MINING_GEMS.reduce((n, [, w]) => n + w, 0);
  let r = rnd() * total;
  for (const [id, w] of MINING_GEMS) {
    if (r < w) return id;
    r -= w;
  }
  return MINING_GEMS[0][0];
}

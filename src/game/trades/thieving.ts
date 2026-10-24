import type { StallKind } from './layout';

/**
 * Thieving: pick the pockets of townsfolk (never players), steal from market
 * stalls and pick the locks of strongboxes in bandit camps and old ruins.
 * A failed try is noticed: pickpockets are slapped and stunned, stall thieves
 * near a stall keeper or guard are shoved and stunned, and a strongbox's trap
 * springs. Loot is small change, food and the odd gem — enough to be worth it,
 * not enough to replace hunting. Pure data and rules: no DOM, no three.js.
 */

/** One possible thing in a loot roll: chance, item, quantity range. */
export interface LootRoll {
  id: string;
  chance: number;
  min: number;
  max: number;
}

export interface MarkTier {
  id: string;
  name: string;
  /** Thieving level needed. */
  level: number;
  xp: number;
  /** Gold in the pocket (always some). */
  gold: [number, number];
  /** Other things they may carry (one roll). */
  loot: LootRoll[];
  /** Damage when caught (flat). */
  hit: [number, number];
  /** Seconds stunned when caught. */
  stun: number;
  /** What they shout when they catch you. */
  shout: string;
}

export const MARK_TIERS: Record<string, MarkTier> = {
  farmhand: {
    id: 'farmhand', name: 'farmhand', level: 1, xp: 8, gold: [2, 8], hit: [1, 3], stun: 3, shout: 'Oi! Hands off, you!',
    loot: [{ id: 'bread', chance: 0.25, min: 1, max: 1 }, { id: 'marshwort_seed', chance: 0.15, min: 1, max: 2 }, { id: 'cheese', chance: 0.1, min: 1, max: 1 }],
  },
  dockhand: {
    id: 'dockhand', name: 'dockhand', level: 10, xp: 18, gold: [8, 20], hit: [2, 6], stun: 3, shout: 'Thief! I felt that!',
    loot: [{ id: 'raw_trout', chance: 0.2, min: 1, max: 2 }, { id: 'thread', chance: 0.2, min: 2, max: 5 }, { id: 'lockpick', chance: 0.08, min: 1, max: 1 }],
  },
  merchant: {
    id: 'merchant', name: 'merchant', level: 22, xp: 32, gold: [18, 45], hit: [4, 10], stun: 4, shout: 'Guards! A cutpurse!',
    loot: [{ id: 'silk_cloth', chance: 0.12, min: 1, max: 1 }, { id: 'spice_pouch', chance: 0.08, min: 1, max: 1 }, { id: 'empty_vial', chance: 0.2, min: 1, max: 3 }],
  },
  watchman: {
    id: 'watchman', name: 'watchman', level: 38, xp: 52, gold: [30, 70], hit: [8, 18], stun: 5, shout: 'You picked the wrong pocket, friend.',
    loot: [{ id: 'health_potion', chance: 0.2, min: 1, max: 1 }, { id: 'iron_arrowheads', chance: 0.15, min: 5, max: 10 }, { id: 'lockpick', chance: 0.1, min: 1, max: 1 }],
  },
  scholar: {
    id: 'scholar', name: 'scholar', level: 50, xp: 70, gold: [45, 100], hit: [6, 14], stun: 4, shout: 'Unhand my satchel!',
    loot: [{ id: 'mana_potion', chance: 0.2, min: 1, max: 1 }, { id: 'blank_rune', chance: 0.2, min: 1, max: 2 }, { id: 'mooncress_seed', chance: 0.15, min: 1, max: 2 }],
  },
  noble: {
    id: 'noble', name: 'noble', level: 62, xp: 95, gold: [80, 180], hit: [10, 22], stun: 5, shout: 'How dare you! Guards!',
    loot: [{ id: 'small_ruby', chance: 0.04, min: 1, max: 1 }, { id: 'small_sapphire', chance: 0.04, min: 1, max: 1 }, { id: 'silver_trinket', chance: 0.15, min: 1, max: 1 }],
  },
  foreman: {
    id: 'foreman', name: 'foreman', level: 75, xp: 125, gold: [120, 260], hit: [14, 30], stun: 5, shout: 'By my beard, a thief!',
    loot: [{ id: 'gold_ore', chance: 0.15, min: 1, max: 2 }, { id: 'small_diamond', chance: 0.03, min: 1, max: 1 }, { id: 'small_emerald', chance: 0.05, min: 1, max: 1 }],
  },
};

/** Chance a pickpocket try works (better with every level above the mark's). */
export function pickpocketChance(level: number, need: number): number {
  return Math.max(0.05, Math.min(0.95, 0.6 + (level - need) * 0.015));
}

export interface StallDef {
  kind: StallKind;
  name: string;
  level: number;
  xp: number;
  /** Seconds until it is stocked again (min, max). */
  restock: [number, number];
  /** One roll; the first one that hits is taken (the last always does). */
  loot: LootRoll[];
  /** Cloth colours of the awning (renderer). */
  awning: [number, number];
}

export const STALLS: Record<StallKind, StallDef> = {
  bakery: { kind: 'bakery', name: 'bakery stall', level: 1, xp: 12, restock: [8, 14], awning: [0xc8a060, 0xf0e2c0], loot: [{ id: 'cheese', chance: 0.25, min: 1, max: 1 }, { id: 'bread', chance: 1, min: 1, max: 1 }] },
  fruit: { kind: 'fruit', name: 'greengrocer\'s stall', level: 8, xp: 18, restock: [10, 16], awning: [0x5a8a3a, 0xe8e0c0], loot: [{ id: 'strawberry', chance: 0.3, min: 1, max: 2 }, { id: 'tomato', chance: 0.4, min: 1, max: 2 }, { id: 'cabbage', chance: 1, min: 1, max: 1 }] },
  fish: { kind: 'fish', name: 'fishmonger\'s stall', level: 14, xp: 24, restock: [12, 20], awning: [0x3a6a8a, 0xe8e8e0], loot: [{ id: 'raw_salmon', chance: 0.2, min: 1, max: 1 }, { id: 'raw_pike', chance: 0.35, min: 1, max: 1 }, { id: 'raw_trout', chance: 1, min: 1, max: 2 }] },
  fur: { kind: 'fur', name: 'fur trader\'s stall', level: 24, xp: 38, restock: [15, 25], awning: [0x7a5a3a, 0xd8c8a8], loot: [{ id: 'polar_bear_fur', chance: 0.1, min: 1, max: 1 }, { id: 'winter_wolf_fur', chance: 0.35, min: 1, max: 1 }, { id: 'wolf_pelt', chance: 1, min: 1, max: 2 }] },
  silk: { kind: 'silk', name: 'silk merchant\'s stall', level: 34, xp: 52, restock: [18, 30], awning: [0x8a2a4a, 0xe8c8d8], loot: [{ id: 'thread', chance: 0.3, min: 5, max: 10 }, { id: 'silk_cloth', chance: 1, min: 1, max: 1 }] },
  spice: { kind: 'spice', name: 'spice stall', level: 45, xp: 68, restock: [20, 34], awning: [0xc0601a, 0xf0d8a0], loot: [{ id: 'spice_pouch', chance: 1, min: 1, max: 1 }] },
  silver: { kind: 'silver', name: 'silversmith\'s stall', level: 58, xp: 88, restock: [25, 40], awning: [0x5a6a8a, 0xe0e4ec], loot: [{ id: 'sunstone_ring', chance: 0.05, min: 1, max: 1 }, { id: 'silver_bar', chance: 0.3, min: 1, max: 1 }, { id: 'silver_trinket', chance: 1, min: 1, max: 1 }] },
  gem: { kind: 'gem', name: 'gem dealer\'s stall', level: 72, xp: 120, restock: [35, 55], awning: [0x3a2a6a, 0xd8c8f0], loot: [{ id: 'small_diamond', chance: 0.08, min: 1, max: 1 }, { id: 'small_ruby', chance: 0.3, min: 1, max: 1 }, { id: 'small_sapphire', chance: 0.5, min: 1, max: 1 }, { id: 'small_emerald', chance: 1, min: 1, max: 1 }] },
};

/** Chance a stall theft works; a failed try near a keeper or guard gets you stunned. */
export function stallChance(level: number, need: number): number {
  return Math.max(0.05, Math.min(0.92, 0.6 + (level - need) * 0.012));
}

/** Chance a lock gives way; a failed try springs the box's trap (and may break the pick). */
export function lockChance(level: number, need: number): number {
  return Math.max(0.05, Math.min(0.9, 0.5 + (level - need) * 0.012));
}
export const LOCKPICK = 'lockpick';
export const LOCKPICK_BREAK = 0.2;
/** Seconds a strongbox stays empty once robbed (min, max). */
export const BOX_RESTOCK: [number, number] = [180, 360];

/** Strongbox loot by level: gold and a few valuables. */
export function boxLoot(level: number): { gold: [number, number]; loot: LootRoll[]; xp: number } {
  const k = 1 + level / 15;
  return {
    xp: Math.round(25 + level * 1.8),
    gold: [Math.round(20 * k), Math.round(60 * k)],
    loot: [
      { id: 'small_emerald', chance: 0.04 + level / 2500, min: 1, max: 1 },
      { id: 'small_ruby', chance: 0.03 + level / 2500, min: 1, max: 1 },
      { id: 'silver_trinket', chance: 0.12, min: 1, max: 1 },
      { id: 'lockpick', chance: 0.1, min: 1, max: 2 },
      ...(level >= 40 ? [{ id: 'golden_goblet', chance: 0.02, min: 1, max: 1 }] : []),
    ],
  };
}

/** Seconds of work per try. */
export const PICKPOCKET_TIME = 1.2;
export const STALL_TIME = 1.4;
export const LOCK_TIME = 2.2;

/** Rolls a loot list: every entry is rolled on its own. */
export function rollEach(list: LootRoll[], rnd: () => number = Math.random): Array<{ id: string; qty: number }> {
  const out: Array<{ id: string; qty: number }> = [];
  for (const l of list) if (rnd() < l.chance) out.push({ id: l.id, qty: l.min + Math.floor(rnd() * (l.max - l.min + 1)) });
  return out;
}

/** Rolls a loot list where only the first hit counts (stalls: one thing off the counter). */
export function rollFirst(list: LootRoll[], rnd: () => number = Math.random): { id: string; qty: number } {
  for (const l of list) if (rnd() < l.chance) return { id: l.id, qty: l.min + Math.floor(rnd() * (l.max - l.min + 1)) };
  const last = list[list.length - 1];
  return { id: last.id, qty: last.min };
}

import type { Ability, EnemyDef, LootEntry } from '../enemies/enemyDefs';
import type { Element } from '../inventory/items';
import type { EnemyKind } from '../world/WorldMap';
import type { ShopEntry } from './tasks';

/**
 * Seasonal festivals (pure data). While one runs (by the calendar date, UTC, or
 * when a game master starts it): monsters everywhere may drop the festival's
 * token item, its mini-boss walks out of the wilds at a town every few hours,
 * and the task boards trade the tokens for the festival's costume, its cape,
 * sweets and seals. Every reward only looks or tastes nice: no stats.
 *
 * The festival monsters are merged into ENEMIES by enemyDefs.ts; their models
 * are tinted cousins of existing monsters (render/models/rigs.ts BOSS_LOOK).
 * Ids are stable forever.
 */

export type FestivalKind = 'fest_hollow_king' | 'fest_rimeclaw';

export interface FestivalDef {
  id: 'hollowmoon' | 'winterhearth';
  name: string;
  /** First and last day, [month 1–12, day], UTC, inclusive; may wrap the new year. */
  from: [number, number];
  to: [number, number];
  /** Item every monster may drop while it runs; the boards trade it. */
  token: string;
  boss: FestivalKind;
  /** Helpers that come with the mini-boss. */
  adds: Array<[EnemyKind, number]>;
  /** Board trades for the token (id 'seals' = task seals). */
  shop: ShopEntry[];
  /** Costume item and the creature it lets you look like. */
  guise: string;
  guiseLook: EnemyKind;
  /** What the herald says when the festival begins. */
  begins: string;
  /** What the herald says when the mini-boss comes, and when it is slain. */
  coming: string;
  arrives: string;
  slain: string;
}

/** Minutes a costume lasts; it is never used up. */
export const GUISE_MINUTES = 20;
/** A festival mini-boss leaves after this long if nobody slays it. */
export const FEST_BOSS_LIFETIME = 30 * 60;

export const FESTIVALS: FestivalDef[] = [
  {
    id: 'hollowmoon', name: 'Hollow Moon Festival', from: [10, 20], to: [11, 2], token: 'hollow_pumpkin', boss: 'fest_hollow_king',
    adds: [['skeleton', 4], ['ghoul', 2]],
    shop: [
      { id: 'hollow_guise', qty: 1, price: 25 },
      { id: 'hollowmoon_cape', qty: 1, price: 60 },
      { id: 'candied_apple', qty: 5, price: 3 },
      { id: 'seals', qty: 2, price: 10 },
    ],
    guise: 'hollow_guise', guiseLook: 'skeleton',
    begins: 'The Hollow Moon Festival has begun! Monsters drop hollow pumpkins: trade them at any task board for costumes, capes and sweets.',
    coming: 'Pumpkin lanterns gutter all at once… Gourdmaw the Hollow King is stirring in the wilds.',
    arrives: 'Gourdmaw the Hollow King marches on {town} with his bone court!',
    slain: 'Gourdmaw the Hollow King is smashed to pulp! His pumpkins roll free.',
  },
  {
    id: 'winterhearth', name: 'Winterhearth Festival', from: [12, 15], to: [1, 5], token: 'frost_bauble', boss: 'fest_rimeclaw',
    adds: [['winter_wolf', 4], ['frostkin', 2]],
    shop: [
      { id: 'snowfellow_guise', qty: 1, price: 25 },
      { id: 'winterhearth_cape', qty: 1, price: 60 },
      { id: 'gingerbread_knight', qty: 5, price: 3 },
      { id: 'seals', qty: 2, price: 10 },
    ],
    guise: 'snowfellow_guise', guiseLook: 'frostkin',
    begins: 'The Winterhearth Festival has begun! Monsters drop frost baubles: trade them at any task board for costumes, capes and sweets.',
    coming: 'The hearth-fires flicker blue… Old Rimeclaw has smelled the Winterhearth feasts.',
    arrives: 'Old Rimeclaw the Feast-Thief lumbers into {town}, hungry for the Winterhearth feast!',
    slain: 'Old Rimeclaw is beaten! The stolen baubles spill across the snow.',
  },
];

export const FESTIVAL_BY_ID: Record<string, FestivalDef> = Object.fromEntries(FESTIVALS.map((f) => [f.id, f]));

const md = (now: number): number => {
  const d = new Date(now);
  return (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};

/** The festival the calendar says is on at this moment (UTC dates), if any. */
export function festivalByDate(now: number): FestivalDef | null {
  const v = md(now);
  for (const f of FESTIVALS) {
    const a = f.from[0] * 100 + f.from[1], b = f.to[0] * 100 + f.to[1];
    if (a <= b ? v >= a && v <= b : v >= a || v <= b) return f;
  }
  return null;
}

/** Start and end (ms, end exclusive) of the occurrence of `f` that is running at `now` or comes next. */
export function festivalWindow(f: FestivalDef, now: number): { start: number; end: number } {
  const y = new Date(now).getUTCFullYear();
  for (const yy of [y - 1, y, y + 1]) {
    const start = Date.UTC(yy, f.from[0] - 1, f.from[1]);
    const endYear = f.to[0] < f.from[0] ? yy + 1 : yy;
    const end = Date.UTC(endYear, f.to[0] - 1, f.to[1] + 1);
    if (end > now) return { start, end };
  }
  const start = Date.UTC(y + 1, f.from[0] - 1, f.from[1]);
  return { start, end: start + 14 * 86_400_000 };
}

/** Chance a monster drops the festival token: small for vermin, more for big game. */
export function festivalDropChance(exp: number): number {
  if (exp < 5) return 0;
  return Math.min(0.3, 0.05 + exp / 4000);
}

// ------------------------------------------------------------------ the mini-bosses

const A = (kind: Ability['kind'], name: string, element: Element, min: number, max: number, interval: number, effect: Ability['effect'], range = 4, radius = 0): Ability =>
  ({ kind, name, element, min, max, range, radius, interval, effect });
const S = (name: string, kind: EnemyKind, count: number, maxAlive: number, interval: number): Ability =>
  ({ kind: 'summon', name, element: 'physical', min: 0, max: 0, range: 3, radius: 0, interval, effect: 'death', summon: kind, count, maxAlive });
const L = (id: string, chance: number, min = 1, max = 1): LootEntry => ({ id, chance, min, max });

/**
 * Mid-level party bosses (about level 40–80 for a group): they come to the towns, so they must be
 * beatable by the people who live there, and they never respawn on their own.
 */
export const FESTIVAL_ENEMIES: Record<FestivalKind, EnemyDef> = {
  fest_hollow_king: {
    kind: 'fest_hollow_king', name: 'Gourdmaw', title: 'the Hollow King', boss: 'raid', elite: true, enrage: 0.3,
    maxHp: 16000, minDmg: 18, maxDmg: 80, armor: 12, attackInterval: 1.7, stepTime: 0.36, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 5200, respawn: 999999,
    resist: { death: 60, fire: 20, holy: -25, ice: -10 },
    abilities: [
      A('nova', 'pumpkin burst', 'fire', 30, 80, 6, 'fire', 0, 2),
      A('ranged', 'hurled lantern', 'fire', 25, 70, 4, 'fire', 5),
      S('call the bone court', 'skeleton', 2, 6, 18),
    ],
    loot: [L('hollow_pumpkin', 1, 8, 15), L('candied_apple', 1, 2, 5), L('gold', 1, 300, 800), L('hollow_guise', 0.12), L('small_ruby', 0.5)],
  },
  fest_rimeclaw: {
    kind: 'fest_rimeclaw', name: 'Old Rimeclaw', title: 'the Feast-Thief', boss: 'raid', elite: true, enrage: 0.3,
    maxHp: 18000, minDmg: 20, maxDmg: 88, armor: 16, attackInterval: 1.8, stepTime: 0.38, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 5600, respawn: 999999,
    resist: { ice: 80, physical: 10, fire: -20 },
    abilities: [
      A('nova', 'frost stomp', 'ice', 32, 84, 6, 'ice', 0, 2),
      A('wave', 'snow breath', 'ice', 28, 78, 7, 'ice', 4),
      S('howl for the pack', 'winter_wolf', 2, 5, 20),
    ],
    loot: [L('frost_bauble', 1, 8, 15), L('gingerbread_knight', 1, 2, 5), L('gold', 1, 300, 800), L('snowfellow_guise', 0.12), L('small_sapphire', 0.5)],
  },
};

export const FESTIVAL_KINDS: FestivalKind[] = Object.keys(FESTIVAL_ENEMIES) as FestivalKind[];

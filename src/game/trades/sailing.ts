import type { EnemyKind } from '../world/WorldMap';
import type { LootRoll } from './thieving';

/**
 * Sailing: your own boat on the open sea. Board it at a mooring beside a
 * harbour's pier (with the boat's deed in your pack), sail tile by tile over
 * water (never onto land), and come ashore at any mooring. Every tile sailed
 * teaches sailing; a voyage that ends at another harbour pays a bonus by its
 * length. At sea: salvage floating wreckage, fish from the boat, and now and
 * then something happens (a squall, drifting cargo, a monster surfacing).
 * Pure data and rules: no DOM, no three.js.
 */

export interface BoatDef {
  /** The deed item (inventory/tradeItems.ts). */
  deed: string;
  /** 1 skiff, 2 sloop, 3 cutter (snapshot `bt`, models). */
  n: 1 | 2 | 3;
  name: string;
  level: number;
  /** A step at sea takes this share of a walking step. */
  step: number;
  /** Sailing experience per tile sailed. */
  tileXp: number;
}

export const BOATS: BoatDef[] = [
  { deed: 'skiff_deed', n: 1, name: 'Rowing Skiff', level: 1, step: 0.85, tileXp: 3 },
  { deed: 'sloop_deed', n: 2, name: 'Coastal Sloop', level: 30, step: 0.65, tileXp: 5 },
  { deed: 'cutter_deed', n: 3, name: 'Swift Cutter', level: 60, step: 0.5, tileXp: 8 },
];
export const BOAT_BY_N: Record<number, BoatDef> = Object.fromEntries(BOATS.map((b) => [b.n, b]));

/** The best boat a sailor of this level owns a deed for (null = none they may sail). */
export function bestBoat(level: number, has: (id: string) => boolean): BoatDef | null {
  let best: BoatDef | null = null;
  for (const b of BOATS) if (b.level <= level && has(b.deed)) best = b;
  return best;
}

/** A voyage that ends at another harbour: experience by the straight distance between the two moorings. */
export function voyageXp(boat: BoatDef, dist: number): number {
  return Math.round(Math.max(20, dist * boat.tileXp * 0.6));
}
/** Voyages shorter than this (tiles, straight line) pay no bonus. */
export const VOYAGE_MIN = 25;

// ---------------------------------------------------------------- salvage

/** Seconds per salvage try. */
export const SALVAGE_TIME = 2.4;
/** Seconds the wreckage is gone once salvaged (min, max). */
export const FLOTSAM_RESPAWN: [number, number] = [90, 180];

export function salvageChance(level: number, need: number): number {
  return Math.max(0.1, Math.min(0.9, 0.55 + (level - need) * 0.012));
}
export function salvageXp(level: number): number {
  return Math.round(12 + level * 1.5);
}

/** What floating wreckage of this level may hold (each rolled; gold always). */
export function salvageLoot(level: number): { gold: [number, number]; loot: LootRoll[] } {
  const k = 1 + level / 20;
  return {
    gold: [Math.round(4 * k), Math.round(18 * k)],
    loot: [
      { id: 'logs', chance: 0.35, min: 1, max: 3 },
      { id: 'rope', chance: 0.12, min: 1, max: 1 },
      { id: 'thread', chance: 0.15, min: 2, max: 6 },
      { id: 'raw_trout', chance: 0.12, min: 1, max: 2 },
      { id: 'pearl', chance: 0.03 + level / 2000, min: 1, max: 1 },
      ...(level >= 20 ? [{ id: 'silk_cloth', chance: 0.06, min: 1, max: 1 }, { id: 'spice_pouch', chance: 0.05, min: 1, max: 1 }] : []),
      ...(level >= 30 ? [{ id: 'red_coral', chance: 0.06, min: 1, max: 1 }, { id: 'small_sapphire', chance: 0.02, min: 1, max: 1 }] : []),
      ...(level >= 45 ? [{ id: 'silver_trinket', chance: 0.08, min: 1, max: 1 }] : []),
      ...(level >= 60 ? [{ id: 'black_pearl', chance: 0.01, min: 1, max: 1 }, { id: 'golden_goblet', chance: 0.015, min: 1, max: 1 }] : []),
    ],
  };
}

/** Level of the sea at a tile: grows with the distance from Thornvale's harbour (1 near home, 80 far out). */
export function seaLevel(x: number, y: number): number {
  const d = Math.hypot(x - 135, y - 312);
  return Math.max(1, Math.min(80, Math.round(d / 6 / 5) * 5));
}

// ---------------------------------------------------------------- at sea

/** Chance per tile sailed in open water (3+ tiles from land) that something happens. */
export const ENCOUNTER_CHANCE = 1 / 260;
/** Monsters only come up for characters of this level and above. */
export const ENCOUNTER_MIN_LEVEL = 15;
/** Seconds a surfaced monster stays before it dives again. */
export const ENCOUNTER_LIFETIME = 120;

export type EncounterKind = 'squall' | 'drift' | 'monster';

/** Which thing happens (r in 0..1); a monster only for characters of ENCOUNTER_MIN_LEVEL+. */
export function encounterFor(r: number, charLevel: number): EncounterKind {
  if (r < 0.45) return 'drift';
  if (r < 0.75 || charLevel < ENCOUNTER_MIN_LEVEL) return 'squall';
  return 'monster';
}

/** The monster that surfaces, by the character's level (sea creatures of the Sunken Reach). */
export function seaMonsterFor(charLevel: number, r: number): EnemyKind {
  if (charLevel < 30) return r < 0.5 ? 'lantern_jelly' : 'blight_jelly';
  if (charLevel < 55) return r < 0.6 ? 'deepfin_raider' : 'deepfin_harpooner';
  if (charLevel < 80) return r < 0.5 ? 'deepfin_harpooner' : 'deepfin_tidecaller';
  return r < 0.6 ? 'gloom_eel' : 'deepfin_tidecaller';
}

/** Squall damage: flat plus a share of max health. */
export function squallDamage(maxHp: number): number {
  return Math.round(5 + maxHp * 0.04);
}

/** Sailing experience for a fish caught from the boat. */
export const BOAT_FISH_XP = 6;

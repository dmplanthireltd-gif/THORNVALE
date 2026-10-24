import type { HuntKind } from './layout';
import type { LootRoll } from './thieving';

/**
 * Hunter: set a box trap beside a burrow or a bird snare in a nesting bush,
 * step back and wait. Every few seconds the trap may catch what lives there
 * (better with a higher level); a caught trap is collected for pelts, plumes,
 * feathers, meat and, now and then, a pet morsel (pets learn from it). Traps
 * are your own (other players cannot take them), are never used up, and a
 * trap you walk far away from collapses back into your pack.
 * Pure data and rules: no DOM, no three.js.
 */

export interface PreyDef {
  id: string;
  name: string;
  /** Where it lives: burrows (box traps) or nesting bushes (snares). */
  spot: HuntKind;
  level: number;
  xp: number;
  loot: LootRoll[];
  /** Fur / feather colour (renderer: the tuft in a full trap). */
  color: number;
}

export const PREY: PreyDef[] = [
  { id: 'finch', name: 'crested finch', spot: 'nest', level: 1, xp: 12, color: 0xc8a050, loot: [{ id: 'feather', chance: 1, min: 3, max: 6 }, { id: 'raw_bird', chance: 0.5, min: 1, max: 1 }] },
  { id: 'hare', name: 'meadow hare', spot: 'burrow', level: 8, xp: 22, color: 0xa89070, loot: [{ id: 'hare_pelt', chance: 1, min: 1, max: 1 }, { id: 'raw_meat', chance: 0.6, min: 1, max: 1 }, { id: 'pet_morsel', chance: 0.08, min: 1, max: 1 }] },
  { id: 'grouse', name: 'moor grouse', spot: 'nest', level: 18, xp: 30, color: 0x8a5a3a, loot: [{ id: 'feather', chance: 1, min: 6, max: 10 }, { id: 'raw_bird', chance: 0.8, min: 1, max: 1 }, { id: 'pet_morsel', chance: 0.1, min: 1, max: 1 }] },
  { id: 'ferret', name: 'ash ferret', spot: 'burrow', level: 28, xp: 45, color: 0x6a625a, loot: [{ id: 'ferret_pelt', chance: 1, min: 1, max: 1 }, { id: 'pet_morsel', chance: 0.12, min: 1, max: 1 }] },
  { id: 'ptarmigan', name: 'snow ptarmigan', spot: 'nest', level: 38, xp: 55, color: 0xf0f0f4, loot: [{ id: 'feather', chance: 1, min: 8, max: 14 }, { id: 'raw_bird', chance: 0.8, min: 1, max: 1 }, { id: 'pet_morsel', chance: 0.15, min: 1, max: 1 }] },
  { id: 'skink', name: 'sand skink', spot: 'burrow', level: 45, xp: 70, color: 0xd8b070, loot: [{ id: 'skink_hide', chance: 1, min: 1, max: 1 }, { id: 'pet_morsel', chance: 0.15, min: 1, max: 1 }] },
  { id: 'stoat', name: 'frost stoat', spot: 'burrow', level: 55, xp: 85, color: 0xf0f0f4, loot: [{ id: 'stoat_fur', chance: 1, min: 1, max: 1 }, { id: 'pet_morsel', chance: 0.18, min: 1, max: 1 }] },
  { id: 'sunbird', name: 'sunbird', spot: 'nest', level: 62, xp: 95, color: 0xf0a020, loot: [{ id: 'bright_plume', chance: 1, min: 1, max: 2 }, { id: 'feather', chance: 1, min: 5, max: 10 }, { id: 'pet_morsel', chance: 0.2, min: 1, max: 1 }] },
  { id: 'marten', name: 'ember marten', spot: 'burrow', level: 72, xp: 120, color: 0xa8401a, loot: [{ id: 'marten_pelt', chance: 1, min: 1, max: 1 }, { id: 'pet_morsel', chance: 0.25, min: 1, max: 1 }] },
];
export const PREY_BY_ID: Record<string, PreyDef> = Object.fromEntries(PREY.map((p) => [p.id, p]));

/** Hunting grounds: region → the prey that lives there (cheapest first). */
export const HUNT_REGIONS: Array<[string, string[]]> = [
  ['Thornvale Meadows', ['finch', 'hare']], ['Eastfold', ['finch', 'hare']], ['Bramblewood', ['finch', 'hare', 'grouse']], ['Westmarch Fields', ['finch', 'hare']],
  ['Millbrook Fields', ['finch', 'hare']], ['Glimmer Vale', ['finch', 'hare', 'grouse']], ['Highmoor Downs', ['hare', 'grouse']], ['Chapel Hill', ['hare', 'grouse']],
  ['Briar Hills', ['hare', 'grouse']], ['Corvane Grove', ['finch', 'grouse']], ['Silverbough Woods', ['grouse', 'hare']],
  ['Ashfall Fields', ['ferret']], ['Scorched Crags', ['ferret', 'marten']], ['Cinder Isle', ['ferret', 'marten']],
  ['Snowpine Reach', ['ptarmigan', 'stoat']], ['Frostholm Fields', ['ptarmigan', 'stoat']], ['Valdrheim Outskirts', ['grouse', 'ptarmigan']],
  ['Northern Dunes', ['skink']], ['Sunspire Dunes', ['skink']], ['Dune Isles', ['skink']],
  ['Palmreach Jungle', ['sunbird', 'finch']], ['Mangrove Mire', ['sunbird']], ['Amazon Wilds', ['sunbird', 'grouse']],
];

export const BOX_TRAP = 'box_trap';
export const BIRD_SNARE = 'bird_snare';
/** Seconds to set or collect a trap. */
export const TRAP_TIME = 1.8;
/** Seconds between two chances for a set trap to catch. */
export const TRAP_ROLL = 4;
/** A set trap further than this from its owner collapses. */
export const TRAP_LEASH = 25;

/** How many traps can be set at once (one more every 20 levels, up to 5). */
export function maxTraps(level: number): number {
  return Math.min(5, 1 + Math.floor(level / 20));
}

/** Chance per roll that a set trap catches this prey. */
export function catchChance(level: number, prey: PreyDef): number {
  return Math.max(0.06, Math.min(0.5, 0.18 + (level - prey.level) * 0.006));
}

/** Chance per roll that a set trap is sprung empty (reset it to try again). */
export const TRAP_FAIL = 0.025;

/** The prey a hunter of this level can catch at a spot (the best they can, usually; sometimes a lesser one). */
export function preyFor(spotPrey: string[], level: number, r: number): PreyDef | null {
  const ok = spotPrey.map((id) => PREY_BY_ID[id]).filter((p): p is PreyDef => !!p && p.level <= level);
  if (!ok.length) return null;
  return r < 0.7 ? ok[ok.length - 1] : ok[Math.floor(r * 10) % ok.length];
}

/** Trap item each kind of spot takes. */
export function trapFor(kind: HuntKind): string {
  return kind === 'burrow' ? BOX_TRAP : BIRD_SNARE;
}

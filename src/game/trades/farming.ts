import { CROPS } from '../inventory/tradeItems';
import { HERBS } from './herblore';
import type { PatchKind } from './layout';

/**
 * Farming: plant a seed in a farm patch with a trowel, come back when it has
 * grown (real time — it keeps growing while you are offline and across server
 * restarts, because the planting time is in your save), and harvest a handful
 * of vegetables or grimy herbs. A bucket of compost on a growing patch gives a
 * bigger harvest. Every player has their own crop on each patch (the patch is
 * shared ground, what grows on it is yours), so nobody can steal or trample it.
 * Pure data and rules: no DOM, no three.js.
 */

export interface PlantDef {
  /** The seed item. */
  seed: string;
  /** What a harvest gives (a crop, or a grimy herb). */
  produce: string;
  name: string;
  patch: PatchKind;
  /** Farming level to plant it. */
  level: number;
  /** Real minutes from planting to ripe. */
  minutes: number;
  /** Produce per harvest (min, max) before compost. */
  yield: [number, number];
  plantXp: number;
  /** Experience per item harvested. */
  harvestXp: number;
  /** Leaf and fruit colours (renderer). */
  leaf: number;
  fruit: number;
}

const ALLOT: Record<string, { minutes: number; yield: [number, number]; plantXp: number; harvestXp: number; leaf: number }> = {
  potato: { minutes: 10, yield: [3, 6], plantXp: 8, harvestXp: 9, leaf: 0x4a8a2a },
  onion: { minutes: 12, yield: [3, 6], plantXp: 10, harvestXp: 11, leaf: 0x6aa040 },
  cabbage: { minutes: 15, yield: [3, 6], plantXp: 12, harvestXp: 13, leaf: 0x7ab04a },
  tomato: { minutes: 20, yield: [3, 7], plantXp: 18, harvestXp: 20, leaf: 0x3a7a2a },
  sweetcorn: { minutes: 25, yield: [4, 8], plantXp: 25, harvestXp: 28, leaf: 0x8ab040 },
  strawberry: { minutes: 30, yield: [4, 8], plantXp: 32, harvestXp: 35, leaf: 0x3a8a3a },
  watermelon: { minutes: 40, yield: [3, 6], plantXp: 50, harvestXp: 60, leaf: 0x2a6a2a },
};

export const PLANTS: PlantDef[] = [
  ...CROPS.map(([id, name, level, , , tint]): PlantDef => ({
    seed: `${id}_seed`, produce: id, name, patch: 'allotment', level, ...ALLOT[id], fruit: parseInt(tint.slice(1), 16),
  })),
  ...HERBS.map((h): PlantDef => ({
    seed: `${h.id}_seed`, produce: `grimy_${h.id}`, name: h.name, patch: 'herb', level: h.level,
    minutes: Math.round(15 + h.level / 2), yield: [3, 6], plantXp: 10 + h.level, harvestXp: Math.round(8 + h.level * 0.9),
    leaf: parseInt(h.color.slice(1), 16), fruit: parseInt(h.color.slice(1), 16),
  })),
];

export const PLANT_BY_SEED: Record<string, PlantDef> = Object.fromEntries(PLANTS.map((p) => [p.seed, p]));
/** Seeds in a fixed order (the network sends a seed as its index here; append only). */
export const SEED_ORDER: string[] = PLANTS.map((p) => p.seed);

export const TROWEL = 'trowel';
export const COMPOST = 'compost';
/** Extra produce from compost. */
export const COMPOST_BONUS = 2;
/** Seconds of work to plant, compost or harvest. */
export const FARM_TIME = 1.8;

/** One patch of one player (saved in `trades.farm[patchId]`): seed, planting time (wall-clock ms), compost. */
export interface PatchState {
  s: string;
  t: number;
  c?: 1;
}

/** Growth 0…1 at wall-clock time `now`. */
export function growth(p: PatchState, now: number): number {
  const d = PLANT_BY_SEED[p.s];
  if (!d) return 0;
  return Math.max(0, Math.min(1, (now - p.t) / (d.minutes * 60_000)));
}

/** Stage shown on the patch: 0 seedling, 1 growing, 2 nearly there, 3 ripe. */
export function stage(p: PatchState, now: number): 0 | 1 | 2 | 3 {
  const g = growth(p, now);
  return g >= 1 ? 3 : g >= 0.66 ? 2 : g >= 0.33 ? 1 : 0;
}

/** Minutes left until ripe (rounded up; 0 when ripe). */
export function minutesLeft(p: PatchState, now: number): number {
  const d = PLANT_BY_SEED[p.s];
  if (!d) return 0;
  return Math.max(0, Math.ceil((p.t + d.minutes * 60_000 - now) / 60_000));
}

/** Reads a save's farm block: only patches with a known seed and a sensible time survive (a bad one is dropped, never the seed's item). */
export function parseFarm(raw: unknown): Record<string, PatchState> {
  const out: Record<string, PatchState> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(k) || !v || typeof v !== 'object') continue;
    const p = v as Record<string, unknown>;
    if (typeof p.s !== 'string' || !PLANT_BY_SEED[p.s] || typeof p.t !== 'number' || !Number.isFinite(p.t)) continue;
    out[k] = { s: p.s, t: p.t, ...(p.c === 1 ? { c: 1 as const } : {}) };
  }
  return out;
}

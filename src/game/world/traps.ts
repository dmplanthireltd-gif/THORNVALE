import { hash2 } from '../core/rng';
import { Ground, Obj, type WorldMap } from './WorldMap';

/**
 * Jungle traps: strangling vines (hold you in place for `VINE_ROOT_SECONDS`)
 * and snapping flowers (a mild poison). They grow on a few jungle tiles,
 * chosen from the map alone so the server and every client agree on where
 * they are; only whether a trap is sprung is synced. Players spring them by
 * stepping on them, monsters never do. A sprung trap grows back after
 * `TRAP_REARM_SECONDS`. Never in a protection zone, a town, a house, on or
 * next to a road, or beside stairs and ladders. Not saved.
 */

export type TrapKind = 'vines' | 'flower';

export interface Trap {
  /** Index in the trap list (stable for a given map). */
  i: number;
  x: number;
  y: number;
  z: number;
  kind: TrapKind;
}

/** Share of the eligible jungle tiles that hold a trap. */
export const TRAP_DENSITY = 0.012;
export const VINE_ROOT_SECONDS = 2;
/** Snapping flower: poison `FLOWER_POISON_BASE + level / 15` every 2 s for `FLOWER_POISON_SECONDS`. */
export const FLOWER_POISON_BASE = 3;
export const FLOWER_POISON_SECONDS = 8;
export const TRAP_REARM_SECONDS = 90;

const ROAD = new Set<number>([Ground.Path, Ground.Stone, Ground.Wood, Ground.Marble]);

function eligible(w: WorldMap, x: number, y: number, z: number): boolean {
  if (w.getGround(x, y, z) !== Ground.Jungle || w.getObj(x, y, z) !== Obj.None || !w.isWalkable(x, y, z)) return false;
  if (w.isSafe(x, y, z) || w.houseAt(x, y, z)) return false;
  const r = w.regionAt(x, y, z);
  if (r?.temple) return false;
  // no roads, stairs, holes or ladders within 2 tiles
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const g = w.getGround(x + dx, y + dy, z);
    if (ROAD.has(g)) return false;
    if (w.linkAt(x + dx, y + dy, z)) return false;
    if (w.isSafe(x + dx, y + dy, z)) return false;
  }
  return true;
}

/** Every trap of a map, in tile order (deterministic). */
export function placeTraps(w: WorldMap): Trap[] {
  const out: Trap[] = [];
  const f = w.floor(0);
  if (!f) return out;
  let last = -10;
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      if (f.ground[y * w.width + x] !== Ground.Jungle) continue;
      if (hash2(x, y, 4049) >= TRAP_DENSITY) continue;
      // never two traps side by side
      if (y * w.width + x - last < 3) continue;
      if (out.some((t) => Math.abs(t.x - x) <= 2 && Math.abs(t.y - y) <= 2)) continue;
      if (!eligible(w, x, y, 0)) continue;
      out.push({ i: out.length, x, y, z: 0, kind: hash2(x, y, 4051) < 0.55 ? 'vines' : 'flower' });
      last = y * w.width + x;
    }
  }
  return out;
}

/** Trap state inside a Game: which are sprung and when they grow back. */
export class TrapSystem {
  readonly list: Trap[];
  private byTile = new Map<number, Trap>();
  /** Sprung traps: index → seconds until re-armed (mirror games: until the server says otherwise). */
  private sprung = new Map<number, number>();
  private readonly W: number;

  constructor(w: WorldMap) {
    this.W = w.width;
    this.list = placeTraps(w);
    for (const t of this.list) this.byTile.set(t.y * this.W + t.x, t);
  }

  at(x: number, y: number, z: number): Trap | null {
    if (z !== 0) return null;
    return this.byTile.get(y * this.W + x) ?? null;
  }

  armed(t: Trap): boolean {
    return !this.sprung.has(t.i);
  }

  /** Springs the armed trap on a tile; returns it, or null when there is none (or it is still growing back). */
  spring(x: number, y: number, z: number): Trap | null {
    const t = this.at(x, y, z);
    if (!t || this.sprung.has(t.i)) return null;
    this.sprung.set(t.i, TRAP_REARM_SECONDS);
    return t;
  }

  update(dt: number): void {
    for (const [i, left] of this.sprung) {
      if (left - dt <= 0) this.sprung.delete(i);
      else this.sprung.set(i, left - dt);
    }
  }

  /** Sprung traps within `r` tiles (wire: trap indexes, ascending). */
  sprungNear(x: number, y: number, z: number, r: number): number[] {
    const out: number[] = [];
    if (z !== 0) return out;
    for (const i of this.sprung.keys()) {
      const t = this.list[i];
      if (Math.abs(t.x - x) <= r && Math.abs(t.y - y) <= r) out.push(i);
    }
    return out.sort((a, b) => a - b);
  }

  /** Mirror: the server's list of sprung traps near the player (others in that area are armed again). */
  sync(ids: number[], x: number, y: number, r: number): void {
    const want = new Set(ids.filter((i) => Number.isInteger(i) && i >= 0 && i < this.list.length));
    for (const i of [...this.sprung.keys()]) {
      const t = this.list[i];
      if (!want.has(i) && Math.abs(t.x - x) <= r && Math.abs(t.y - y) <= r) this.sprung.delete(i);
    }
    for (const i of want) if (!this.sprung.has(i)) this.sprung.set(i, TRAP_REARM_SECONDS);
  }

  /** Seconds left before a sprung trap is armed again (0 = armed). */
  rearmIn(t: Trap): number {
    return this.sprung.get(t.i) ?? 0;
  }
}

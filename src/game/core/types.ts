/** Shared, render-independent primitive types. */

export interface TilePos {
  x: number;
  y: number;
}

/** Chebyshev distance: the number of king-moves between two tiles. */
export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/**
 * Facing angle convention: 0 = south (+y), PI/2 = east (+x).
 * Matches a model whose forward axis is +Z with world Z = tile y.
 */
export function facingFromDelta(dx: number, dy: number): number {
  return Math.atan2(dx, dy);
}

export const DIRS8: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

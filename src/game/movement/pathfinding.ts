import type { TilePos } from '../core/types';
import { DIRS8 } from '../core/types';

export interface PathGrid {
  width: number;
  height: number;
  /** Static step test, including the no-corner-cutting rule. */
  canStep(x: number, y: number, dx: number, dy: number): boolean;
}

export interface PathQuery {
  sx: number;
  sy: number;
  /** Tile the heuristic aims at. */
  tx: number;
  ty: number;
  /** Goal test; defaults to reaching (tx,ty). */
  isGoal?: (x: number, y: number) => boolean;
  /** Dynamic blockers (creatures). The start tile is never tested. */
  isBlocked?: (x: number, y: number) => boolean;
  maxNodes?: number;
}

const SQRT2 = Math.SQRT2;

let scratch: { n: number; g: Float32Array; parent: Int32Array; stamp: Uint32Array; closedStamp: Uint32Array; gen: number } | null = null;

/** Minimal binary min-heap keyed on f-score. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      const n = this.items.length;
      while (true) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < n && this.keys[l] < this.keys[s]) s = l;
        if (r < n && this.keys[r] < this.keys[s]) s = r;
        if (s === i) break;
        this.swap(i, s);
        i = s;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * 8-directional A*. Returns the tiles to walk (excluding the start), or null
 * when no path exists within the node budget.
 */
export function findPath(grid: PathGrid, q: PathQuery): TilePos[] | null {
  const { width, height } = grid;
  const isGoal = q.isGoal ?? ((x: number, y: number) => x === q.tx && y === q.ty);
  if (isGoal(q.sx, q.sy)) return [];
  const maxNodes = q.maxNodes ?? 4000;
  // Reused scratch arrays: a whole-map array per search (half a million tiles) was the
  // biggest cost of every path. A tile's g/parent/closed values only count when its
  // stamp matches this search.
  const n = width * height;
  if (!scratch || scratch.n < n) scratch = { n, g: new Float32Array(n), parent: new Int32Array(n), stamp: new Uint32Array(n), closedStamp: new Uint32Array(n), gen: 0 };
  const sc = scratch;
  if (++sc.gen >= 0xffffffff) { sc.stamp.fill(0); sc.closedStamp.fill(0); sc.gen = 1; }
  const gen = sc.gen;
  const g = { get: (i: number) => (sc.stamp[i] === gen ? sc.g[i] : Infinity), set: (i: number, v: number) => { sc.stamp[i] = gen; sc.g[i] = v; } };
  const parent = sc.parent;
  const isClosed = (i: number) => sc.closedStamp[i] === gen;
  const open = new Heap();
  const start = q.sy * width + q.sx;
  g.set(start, 0);
  open.push(start, octile(q.sx, q.sy, q.tx, q.ty));
  let expanded = 0;

  while (open.size > 0) {
    const cur = open.pop();
    if (isClosed(cur)) continue;
    sc.closedStamp[cur] = gen;
    const cx = cur % width;
    const cy = (cur - cx) / width;
    if (isGoal(cx, cy) && cur !== start) {
      const path: TilePos[] = [];
      let c = cur;
      while (c !== start) {
        path.push({ x: c % width, y: Math.floor(c / width) });
        c = parent[c];
      }
      path.reverse();
      return path;
    }
    if (++expanded > maxNodes) return null;
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (isClosed(ni)) continue;
      if (!grid.canStep(cx, cy, dx, dy)) continue;
      if (q.isBlocked && q.isBlocked(nx, ny)) continue;
      const cost = g.get(cur) + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
      if (cost < g.get(ni)) {
        g.set(ni, cost);
        parent[ni] = cur;
        open.push(ni, cost + octile(nx, ny, q.tx, q.ty));
      }
    }
  }
  return null;
}

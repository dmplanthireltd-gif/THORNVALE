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
  const n = width * height;
  const g = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = new Heap();
  const start = q.sy * width + q.sx;
  g[start] = 0;
  open.push(start, octile(q.sx, q.sy, q.tx, q.ty));
  let expanded = 0;

  while (open.size > 0) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
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
      if (closed[ni]) continue;
      if (!grid.canStep(cx, cy, dx, dy)) continue;
      if (q.isBlocked && q.isBlocked(nx, ny)) continue;
      const cost = g[cur] + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
      if (cost < g[ni]) {
        g[ni] = cost;
        parent[ni] = cur;
        open.push(ni, cost + octile(nx, ny, q.tx, q.ty));
      }
    }
  }
  return null;
}

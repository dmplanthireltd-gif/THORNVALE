import type { Rng } from '../core/rng';
import { Builder } from './build';
import { Biome } from './terrain';
import { Ground, Obj, WorldMap, type EnemyKind } from './WorldMap';

/** Objects a road or a carved passage may remove. */
export const SOFT = new Set<number>([
  Obj.Tree, Obj.Pine, Obj.Bush, Obj.Rock, Obj.DeadTree, Obj.JungleTree, Obj.Palm, Obj.Stalagmite, Obj.Fern, Obj.Flowers,
  Obj.Bones, Obj.Cliff, Obj.Wheat, Obj.Hay, Obj.Grave, Obj.Fence,
]);

/** Objects that never get removed (buildings, furniture, floor links). */
const HARD = new Set<number>([
  Obj.Wall, Obj.StoneWall, Obj.Door, Obj.Palisade, Obj.Locker, Obj.Chest, Obj.Counter, Obj.Altar, Obj.Pillar, Obj.StairsUp,
  Obj.StairsDown, Obj.Ladder, Obj.RopeSpot, Obj.Hole, Obj.LooseStone, Obj.Railing, Obj.Well, Obj.Table, Obj.Barrel, Obj.Crate,
  Obj.Lamp, Obj.Torch, Obj.SandWall,
]);

export type Dir = 'N' | 'S' | 'E' | 'W';
export const DIR_V: Record<Dir, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

/** Min-heap over (int item, float key) pairs. */
class Heap {
  items: number[] = [];
  keys: number[] = [];
  get size(): number { return this.items.length; }
  push(it: number, k: number): void {
    const a = this.items, b = this.keys;
    a.push(it); b.push(k);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (b[p] <= k) break;
      a[i] = a[p]; b[i] = b[p];
      i = p;
    }
    a[i] = it; b[i] = k;
  }
  pop(): number {
    const a = this.items, b = this.keys;
    const top = a[0];
    const li = a.pop()!, lk = b.pop()!;
    const n = a.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = -1, sk = lk;
        if (l < n && b[l] < sk) { s = l; sk = b[l]; }
        if (r < n && b[r] < sk) { s = r; sk = b[r]; }
        if (s < 0) break;
        a[i] = a[s]; b[i] = b[s];
        i = s;
      }
      a[i] = li; b[i] = lk;
    }
    return top;
  }
}

/** Shared state and helpers for the world generator. */
export class Gen {
  readonly b: Builder;
  readonly W: number;
  readonly H: number;
  /** Surface tiles where monsters must not be placed (towns, harbours). */
  readonly protectMask: Uint8Array;
  constructor(readonly m: WorldMap, readonly rng: Rng, readonly biome: Uint8Array, readonly land: Uint8Array) {
    this.b = new Builder(m, rng);
    this.W = m.width;
    this.H = m.height;
    this.protectMask = new Uint8Array(m.width * m.height);
  }

  protect(x0: number, y0: number, x1: number, y1: number): void {
    this.b.rect(x0, y0, x1, y1, (x, y) => { this.protectMask[y * this.W + x] = 1; });
  }

  bio(x: number, y: number): Biome {
    if (!this.m.inBounds(x, y)) return Biome.Sea;
    return this.biome[y * this.W + x] as Biome;
  }

  isWater(x: number, y: number, z = 0): boolean {
    const g = this.m.getGround(x, y, z);
    return g === Ground.Water || g === Ground.DeepWater;
  }

  /** Clears an area down to bare ground (turns water into land, removes objects). */
  clearTo(x0: number, y0: number, x1: number, y1: number, g: Ground | ((x: number, y: number) => Ground), z = 0): void {
    this.b.rect(x0, y0, x1, y1, (x, y) => {
      this.m.setGround(x, y, typeof g === 'function' ? g(x, y) : g, z);
      this.m.setObj(x, y, Obj.None, z);
    });
  }

  /** Paints a disc. */
  disc(cx: number, cy: number, r: number, fn: (x: number, y: number, d: number) => void): void {
    this.b.rect(Math.floor(cx - r), Math.floor(cy - r), Math.ceil(cx + r), Math.ceil(cy + r), (x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) fn(x, y, d);
    });
  }

  /** Lays a 2-wide road along the cheapest overland route; rivers get bridges, sea is never crossed. */
  route(ax: number, ay: number, bx: number, by: number, opts: { ground?: Ground; maxNodes?: number; allowCliff?: boolean } = {}): boolean {
    const m = this.m, W = this.W, H = this.H;
    const f0 = m.floor(0)!;
    const n = W * H;
    if (!this.rCost || this.rCost.length !== n) {
      this.rCost = new Float32Array(n);
      this.rParent = new Int32Array(n);
      this.rStamp = new Uint32Array(n);
      this.rClosed = new Uint32Array(n);
    }
    const closed = this.rClosed!;
    const cost = this.rCost, parent = this.rParent!, stamp = this.rStamp!;
    const gen = ++this.rGen;
    const start = ay * W + ax, goal = by * W + bx;
    const open = new Heap();
    cost[start] = 0;
    parent[start] = -1;
    stamp[start] = gen;
    open.push(start, 0);
    let expanded = 0;
    const max = opts.maxNodes ?? 400000;
    const stepCost = (i: number): number => {
      const g = f0.ground[i], o = f0.obj[i];
      if (g === Ground.DeepWater || g === Ground.Lava || g === Ground.Void) return Infinity;
      if (HARD.has(o)) return Infinity;
      let c = 1;
      if (g === Ground.Path) c = 0.35;
      else if (g === Ground.Water) c = 9;
      else if (g === Ground.Swamp) c = 2;
      if (o === Obj.Cliff) c += opts.allowCliff === false ? Infinity : 14;
      else if (o !== Obj.None) c += 1.5;
      return c;
    };
    let found = false;
    while (open.size) {
      const cur = open.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (++expanded > max) break;
      const cx = cur % W, cy = (cur - cx) / W;
      const base = cost[cur];
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const ni = ny * W + nx;
        const sc = ni === goal ? 1 : stepCost(ni);
        if (sc === Infinity) continue;
        const nc = base + sc;
        if (stamp[ni] !== gen || nc < cost[ni]) {
          stamp[ni] = gen;
          cost[ni] = nc;
          parent[ni] = cur;
          open.push(ni, nc + (Math.abs(nx - bx) + Math.abs(ny - by)) * 0.9);
        }
      }
    }
    if (!found) return false;
    const path: number[] = [];
    for (let c = goal; c !== -1 && path.length < n; c = parent[c]) path.push(c);
    for (let k = 0; k < path.length; k++) {
      const i = path[k];
      const x = i % W, y = (i - x) / W;
      // 2-wide brush: the tile and the neighbour "after" it
      this.pave(x, y, opts.ground);
      const nxt = path[k + 1] ?? path[k - 1];
      const ox = nxt % W;
      if (ox !== x) this.pave(x, y + 1, opts.ground); else this.pave(x + 1, y, opts.ground);
    }
    return true;
  }

  pave(x: number, y: number, ground = Ground.Path): void {
    const m = this.m;
    if (!m.inBounds(x, y)) return;
    const o = m.getObj(x, y);
    if (HARD.has(o)) return;
    const g = m.getGround(x, y);
    if (g === Ground.Lava || g === Ground.Void) return;
    if (g === Ground.Water || g === Ground.DeepWater) m.setGround(x, y, Ground.Wood);
    else if (g !== Ground.Stone && g !== Ground.Marble && g !== Ground.Wood) m.setGround(x, y, ground);
    if (o !== Obj.None) m.setObj(x, y, Obj.None);
  }

  /**
   * Builds a wooden pier from a coastal land tile out to open water and
   * returns where ships land and where the boatman stands.
   */
  pier(x: number, y: number, dir: Dir): { dest: { x: number; y: number; z: number }; npc: { x: number; y: number }; region: [number, number, number, number] } {
    const m = this.m;
    const [dx, dy] = DIR_V[dir];
    const px = -dy, py = dx; // perpendicular
    // walk to the water's edge, paving as we go
    let cx = x, cy = y, guard = 200;
    while (!this.isWater(cx, cy) && guard-- > 0) {
      this.pave(cx, cy);
      this.pave(cx + px, cy + py);
      cx += dx; cy += dy;
    }
    // pier: at least 6 long, ending in deep water
    let len = 0, deep = 0;
    const tiles: Array<[number, number]> = [];
    while (len < 16 && m.inBounds(cx + dx * 2, cy + dy * 2)) {
      tiles.push([cx, cy]);
      if (m.getGround(cx, cy) === Ground.DeepWater) deep++;
      len++;
      if (len >= 6 && deep >= 2) break;
      cx += dx; cy += dy;
    }
    for (let k = 0; k < tiles.length; k++) {
      const [tx, ty] = tiles[k];
      for (let o = -2; o <= 2; o++) {
        const ax = tx + px * o, ay = ty + py * o;
        const wasLand = !this.isWater(ax, ay) && m.getGround(ax, ay) !== Ground.Wood;
        if (wasLand && Math.abs(o) === 2) continue;
        m.setGround(ax, ay, Ground.Wood);
        m.setObj(ax, ay, Math.abs(o) === 2 ? Obj.Railing : Obj.None);
      }
    }
    // railing across the far end
    const [ex, ey] = tiles[tiles.length - 1];
    for (let o = -2; o <= 2; o++) {
      m.setGround(ex + dx + px * o, ey + dy + py * o, Ground.Wood);
      m.setObj(ex + dx + px * o, ey + dy + py * o, Obj.Railing);
    }
    const [lx, ly] = tiles[Math.max(0, tiles.length - 3)];
    const npc = { x: ex + px, y: ey + py };
    m.setObj(ex - px, ey - py, Obj.Barrel);
    const xs = tiles.map((t) => t[0]), ys = tiles.map((t) => t[1]);
    const region: [number, number, number, number] = [Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3];
    return { dest: { x: lx, y: ly, z: 0 }, npc, region };
  }

  /** Spawns `n` monsters on open tiles of the given floor inside a box, never inside protection zones. */
  spawn(kind: EnemyKind, n: number, x0: number, y0: number, x1: number, y1: number, z = 0): void {
    const m = this.m;
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 60 + 100) {
      const x = this.rng.int(x0, x1), y = this.rng.int(y0, y1);
      if (!m.isWalkable(x, y, z) || m.isSafe(x, y, z)) continue;
      if (z === 0 && this.protectMask[y * this.W + x]) continue;
      const o = m.getObj(x, y, z);
      if (o === Obj.StairsUp || o === Obj.StairsDown || o === Obj.Hole || o === Obj.Ladder || o === Obj.RopeSpot || o === Obj.LooseStone || o === Obj.Door) continue;
      if (m.linkAt(x, y, z)) continue;
      if (m.getGround(x, y, z) === Ground.Wood && z === 0 && m.houseAt(x, y, z)) continue;
      let crowded = false;
      for (const s of this.recent) if (s.z === z && Math.abs(s.x - x) + Math.abs(s.y - y) < 3) { crowded = true; break; }
      if (crowded) continue;
      this.b.spawn(kind, x, y, z);
      this.recent.push({ x, y, z });
      if (this.recent.length > 60) this.recent.shift();
      placed++;
    }
  }

  private recent: Array<{ x: number; y: number; z: number }> = [];
  private rCost: Float32Array | null = null;
  private rParent: Int32Array | null = null;
  private rStamp: Uint32Array | null = null;
  private rClosed: Uint32Array | null = null;
  private rGen = 0;

  /** Finds the nearest tile (spiral search) matching a test. */
  nearest(x: number, y: number, test: (x: number, y: number) => boolean, maxR = 40): { x: number; y: number } | null {
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.m.inBounds(x + dx, y + dy) && test(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
    return null;
  }

  /** Coast tile reached by walking from (x,y) in a direction. */
  coastFrom(x: number, y: number, dir: Dir): { x: number; y: number } {
    const [dx, dy] = DIR_V[dir];
    let cx = x, cy = y;
    for (let k = 0; k < 300 && this.m.inBounds(cx + dx, cy + dy); k++) {
      if (this.isWater(cx + dx, cy + dy) && this.isWater(cx + dx * 2, cy + dy * 2)) return { x: cx, y: cy };
      cx += dx; cy += dy;
    }
    return { x: cx, y: cy };
  }

  /** Cave system on floor z: organic chambers inside a box, joined by tunnels to the given anchor points. */
  caveSystem(x0: number, y0: number, x1: number, y1: number, z: number, anchors: Array<{ x: number; y: number }>, open = 0.56, ground = Ground.Cave): void {
    this.b.cave(x0, y0, x1, y1, z, open, ground);
    for (let i = 1; i < anchors.length; i++) this.b.tunnel(anchors[i - 1].x, anchors[i - 1].y, anchors[i].x, anchors[i].y, z, ground);
  }

  /** Stairs from the surface down to floor z−1 at (x,y): stairs down on top, stairs up below, both with room around. */
  stairsDown(x: number, y: number, z: number, ground = Ground.Cave): void {
    const m = this.m;
    // the lower landing
    this.b.rect(x - 2, y - 2, x + 2, y + 2, (xx, yy) => {
      if (m.getGround(xx, yy, z - 1) === Ground.Void) m.setGround(xx, yy, ground, z - 1);
      m.setObj(xx, yy, Obj.None, z - 1);
    });
    // clear the top so the stairs can be walked onto
    this.b.rect(x - 1, y - 1, x + 1, y + 1, (xx, yy) => {
      const o = m.getObj(xx, yy, z);
      if (SOFT.has(o)) m.setObj(xx, yy, Obj.None, z);
      const g = m.getGround(xx, yy, z);
      if (g === Ground.Water || g === Ground.DeepWater || g === Ground.Lava || g === Ground.Void) m.setGround(xx, yy, z <= 0 ? Ground.Stone : Ground.Stone, z);
    });
    this.b.stairs({ x, y, z: z - 1 }, { x, y, z }, [1, 0], [1, 0]);
    m.setObj(x, y, Obj.StairsDown, z);
    m.setObj(x, y, Obj.StairsUp, z - 1);
  }
}

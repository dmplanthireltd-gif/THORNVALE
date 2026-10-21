import { hash2, Rng } from '../core/rng';
import { buildAreas } from './areas';
import { Gen, SOFT } from './genKit';
import { buildAllTowns } from './townSites';
import { Biome, computeGeography, fbm } from './terrain';
import { placeOreRocks } from './mines';
import { FLOOR_MAX, FLOOR_MIN, Ground, Obj, SOLID_OBJ, UNWALKABLE_GROUND, WorldMap, type House } from './WorldMap';

/**
 * The world of Thornvale: a 640×800 archipelago across seven floors.
 *
 *   North-west   the frozen isles: Valdrheim, glaciers, giants, frost dragons, barbarians
 *   North        Aurelion, the walled crown city, with an ash field to its west
 *   North-east   Emberhold, the fire fortress, and the wild country around Briarwatch
 *   Centre       the great continent: Thornvale (start), Westmarch, Elderglen, Stonedeep,
 *                Highmoor and Millbrook; the dragon plateau, the Greyspine mountains and
 *                many rivers
 *   East         the isle of Corvane
 *   West         small isles: Fernwick, Cyclops Isle, snowy skerries
 *   South        Saltmere and the Ruins of Varkh (the way down to the demons), the jungle
 *                around Palmreach, and the desert of Sunspire and Dunewatch
 */
export const WORLD_W = 640;
export const WORLD_H = 800;

let template: WorldMap | null = null;
let templateSeed = -1;

/** Builds the world (once per seed) and hands out an independent copy. */
export function buildWorld(seed = 4242): WorldMap {
  if (!template || templateSeed !== seed) {
    template = generate(seed);
    templateSeed = seed;
  }
  return template.clone();
}

function generate(seed: number): WorldMap {
  const m = new WorldMap(WORLD_W, WORLD_H);
  const rng = new Rng(seed);
  const geo = computeGeography(WORLD_W, WORLD_H);
  const g = new Gen(m, rng, geo.biome, geo.land);
  for (let z = FLOOR_MIN; z <= FLOOR_MAX; z++) m.floor(z, true);

  const T = (globalThis as { __GEN_PROFILE?: boolean }).__GEN_PROFILE ? (l: string) => console.log(l, Math.round(performance.now() - t0)) : () => {};
  const t0 = performance.now();
  paintTerrain(g);
  T('terrain');
  carveRivers(g);
  T('rivers');
  const towns = buildAllTowns(g);
  T('towns');
  buildAreas(g, towns);
  T('areas');
  towns.finish();
  placeMarketBoards(m);
  placeSmithies(m);
  settleSpawns(m);
  ensureConnected(m);
  // ore rocks last, once every area is joined up (deep mines are only reachable after
  // ensureConnected); a rock never cuts a path, and spawns standing on one move off it
  const reach = floodFill3D(m);
  placeOreRocks(m, (x, y, z) => reach.at(x, y, z));
  settleSpawns(m);
  ensureConnected(m);
  T('connect');
  return m;
}

// ================================================================== terrain

function paintTerrain(g: Gen): void {
  const { m, rng, W, H } = g;
  const f0 = m.floor(0)!;
  const ground = f0.ground, obj = f0.obj;
  const pick = (r: number, table: Array<[Obj, number]>): Obj => {
    for (const [o, p] of table) {
      if (r < p) return o;
      r -= p;
    }
    return Obj.None;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const bi = g.biome[i] as Biome;
      if (bi === Biome.Sea) {
        ground[i] = Ground.DeepWater;
        continue;
      }
      const r = rng.next();
      switch (bi) {
        case Biome.Temperate: {
          ground[i] = fbm(x, y, 60, 9) > 0.56 || r < 0.08 ? Ground.DarkGrass : Ground.Grass;
          const d = fbm(x, y, 70, 26);
          const p = d < 0.4 ? 0.025 : d < 0.52 ? 0.09 : 0.2;
          const r2 = rng.next();
          if (r2 < p) obj[i] = pick(rng.next(), [[Obj.Tree, 0.55], [Obj.Pine, 0.2], [Obj.Bush, 0.15], [Obj.Rock, 0.06], [Obj.DeadTree, 0.04]]);
          else if (r2 < p + 0.025) obj[i] = Obj.Flowers;
          else if (r2 < p + 0.035) obj[i] = Obj.Fern;
          break;
        }
        case Biome.Snow:
          ground[i] = Ground.Snow;
          obj[i] = pick(r, [[Obj.Pine, 0.045], [Obj.Rock, 0.02], [Obj.DeadTree, 0.006]]);
          break;
        case Biome.Glacier:
          ground[i] = Ground.Ice;
          obj[i] = pick(r, [[Obj.Rock, 0.012]]);
          break;
        case Biome.Mountain: {
          ground[i] = r < 0.2 ? Ground.Dirt : Ground.Stone;
          const n = fbm(x, y, 90, 9);
          if (n > 0.43) obj[i] = Obj.Cliff;
          else obj[i] = pick(rng.next(), [[Obj.Rock, 0.07], [Obj.Pine, 0.02]]);
          break;
        }
        case Biome.Volcanic:
          ground[i] = Ground.Ash;
          if (fbm(x, y, 95, 7) > 0.66) ground[i] = Ground.Lava;
          else obj[i] = pick(r, [[Obj.Rock, 0.04], [Obj.DeadTree, 0.015], [Obj.Bones, 0.01]]);
          break;
        case Biome.Plateau:
          ground[i] = r < 0.25 ? Ground.Ash : Ground.Dirt;
          obj[i] = pick(rng.next(), [[Obj.Rock, 0.04], [Obj.Bones, 0.025], [Obj.DeadTree, 0.012]]);
          break;
        case Biome.Clearing:
          ground[i] = Ground.Sand;
          obj[i] = pick(r, [[Obj.Rock, 0.01], [Obj.DeadTree, 0.004], [Obj.Bones, 0.003]]);
          break;
        case Biome.Hills:
          ground[i] = fbm(x, y, 63, 6) > 0.5 ? Ground.Dirt : Ground.DarkGrass;
          obj[i] = pick(r, [[Obj.Rock, 0.05], [Obj.Pine, 0.05], [Obj.Bush, 0.04], [Obj.Tree, 0.03]]);
          break;
        case Biome.Swamp:
          ground[i] = fbm(x, y, 97, 6) > 0.66 ? Ground.Water : Ground.Swamp;
          if (ground[i] === Ground.Swamp) obj[i] = pick(r, [[Obj.DeadTree, 0.05], [Obj.Fern, 0.08], [Obj.JungleTree, 0.02], [Obj.Bush, 0.02]]);
          break;
        case Biome.Jungle:
          ground[i] = r < 0.3 ? Ground.DarkGrass : Ground.Jungle;
          obj[i] = pick(rng.next(), [[Obj.JungleTree, 0.13], [Obj.Palm, 0.03], [Obj.Fern, 0.12], [Obj.Bush, 0.03]]);
          break;
        case Biome.Desert:
          ground[i] = Ground.Sand;
          obj[i] = pick(r, [[Obj.Rock, 0.012], [Obj.DeadTree, 0.003], [Obj.Bones, 0.004]]);
          break;
        default:
          ground[i] = Ground.Grass;
      }
    }
  }
  // beaches and shallows
  const isSea = (x: number, y: number) => !m.inBounds(x, y) || g.biome[y * W + x] === Biome.Sea;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (isSea(x, y)) continue;
      let coast = false;
      for (let dy = -1; dy <= 1 && !coast; dy++) for (let dx = -1; dx <= 1; dx++) if (isSea(x + dx, y + dy)) { coast = true; break; }
      if (!coast) continue;
      const bi = g.biome[i] as Biome;
      if (bi === Biome.Snow || bi === Biome.Glacier) { obj[i] = Obj.None; continue; }
      if (bi === Biome.Mountain) { ground[i] = Ground.Stone; obj[i] = obj[i] === Obj.Cliff ? Obj.Cliff : Obj.None; continue; }
      if (bi === Biome.Volcanic) { ground[i] = Ground.Ash; obj[i] = Obj.None; continue; }
      ground[i] = Ground.Sand;
      obj[i] = hash2(x, y, 5) < 0.04 && (bi === Biome.Jungle || bi === Biome.Desert) ? Obj.Palm : Obj.None;
    }
  }
  const near = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isSea(x, y)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (m.inBounds(nx, ny) && dx * dx + dy * dy <= 5) near[ny * W + nx] = 1;
    }
  }
  for (let i = 0; i < W * H; i++) if (near[i] && g.biome[i] === Biome.Sea) ground[i] = Ground.Water;
}

// ================================================================== rivers

/** Polylines of river waypoints; each river ends at the sea. */
const RIVERS: Array<Array<[number, number]>> = [
  // central continent
  [[262, 432], [215, 438], [168, 446], [140, 450]],
  [[252, 530], [222, 548], [196, 566]],
  [[256, 396], [300, 392], [336, 384], [366, 362]],
  [[300, 300], [276, 276], [256, 250]],
  [[476, 452], [500, 466], [530, 476]],
  [[432, 470], [424, 490], [418, 512]],
  [[430, 342], [452, 352], [470, 362]],
  [[352, 452], [360, 474], [372, 482], [395, 472]],
  [[230, 440], [236, 462]],
  // the jungle delta
  [[456, 612], [420, 640], [388, 668], [352, 712], [318, 718], [286, 720]],
  [[440, 708], [400, 724], [370, 716], [352, 712]],
  [[388, 640], [370, 612], [362, 588]],
  [[420, 736], [404, 760], [396, 790]],
  // the north-east
  [[578, 118], [598, 112], [624, 108]],
  [[560, 190], [540, 210], [530, 240]],
];

function carveRivers(g: Gen): void {
  for (const pts of RIVERS) {
    for (let k = 1; k < pts.length; k++) g.b.river(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], 1);
  }
}

// ================================================================== connectivity

/** Moves any monster whose spawn tile was later built over (chests, walls) to the nearest free tile. */
/**
 * One market board in every depot (ground floor), against an inside wall. A spot
 * is only taken when the room stays fully walkable around it: every locker, NPC,
 * stair and door can still be reached from the entrance.
 */
function placeMarketBoards(m: WorldMap): void {
  for (const h of m.houses) {
    if (h.z !== 0 || !/depot/i.test(h.name)) continue;
    placeAgainstWall(m, h, Obj.MarketBoard);
  }
}

/** A furnace and, beside it, an anvil in every smithy (blacksmithing). */
function placeSmithies(m: WorldMap): void {
  for (const h of m.houses) {
    if (h.z !== 0 || !/smithy/i.test(h.name)) continue;
    const f = placeAgainstWall(m, h, Obj.Furnace);
    if (f) placeAgainstWall(m, h, Obj.Anvil, f);
  }
}

/**
 * Puts `obj` on a free inside tile of a house, against a wall, where it crowds no
 * door, locker, stair or NPC and the whole room stays reachable from the entrance.
 * With `near`, the closest such tile to it wins. Returns where it went, or null.
 */
function placeAgainstWall(m: WorldMap, h: House, obj: Obj, near?: { x: number; y: number }): { x: number; y: number } | null {
  const isWallish = (o: Obj) => o === Obj.Wall || o === Obj.StoneWall || o === Obj.SandWall;
  const busy = new Set([Obj.Door, Obj.Locker, Obj.StairsUp, Obj.StairsDown, Obj.Ladder]);
  const x0 = h.x + 1, y0 = h.y + 1, x1 = h.x + h.w - 2, y1 = h.y + h.h - 2;
  const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const npcAt = (x: number, y: number) => m.npcs.some((n) => n.z === 0 && n.x === x && n.y === y);
  // the entrance: a walkable inside tile next to a door in the outer wall
  let start: { x: number; y: number } | null = null;
  for (let y = h.y; y < h.y + h.h && !start; y++) for (let x = h.x; x < h.x + h.w && !start; x++) {
    if (m.getObj(x, y, 0) !== Obj.Door) continue;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (inside(x + dx, y + dy) && m.isWalkable(x + dx, y + dy, 0)) { start = { x: x + dx, y: y + dy }; break; }
  }
  if (!start) return null;
  const reachable = (): Set<number> => {
    const seen = new Set<number>([m.idx(start!.x, start!.y)]);
    const q = [start!];
    while (q.length) {
      const c = q.pop()!;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const x = c.x + dx, y = c.y + dy;
        if (!inside(x, y) || !m.isWalkable(x, y, 0) || npcAt(x, y)) continue;
        const k = m.idx(x, y);
        if (seen.has(k)) continue;
        seen.add(k);
        q.push({ x, y });
      }
    }
    return seen;
  };
  // things that must stay reachable: lockers, NPCs, stairs, counters and stations need a free neighbour
  const needs: Array<{ x: number; y: number }> = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const o = m.getObj(x, y, 0);
    if (o === Obj.Locker || o === Obj.Counter || o === Obj.MarketBoard || o === Obj.Furnace || o === Obj.Anvil || npcAt(x, y)) needs.push({ x, y });
    if (o === Obj.StairsUp || o === Obj.StairsDown || o === Obj.Ladder) needs.push({ x, y });
  }
  const before = reachable();
  const ok = (seen: Set<number>) => needs.every((t) => [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => seen.has(m.idx(t.x + dx, t.y + dy))));
  if (!ok(before)) return null;
  const spots: Array<{ x: number; y: number }> = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) spots.push({ x, y });
  if (near) spots.sort((a, b) => Math.max(Math.abs(a.x - near.x), Math.abs(a.y - near.y)) - Math.max(Math.abs(b.x - near.x), Math.abs(b.y - near.y)));
  for (const { x, y } of spots) {
    if (m.getObj(x, y, 0) !== Obj.None || !m.isWalkable(x, y, 0) || npcAt(x, y) || m.linkAt(x, y, 0)) continue;
    if (x === start.x && y === start.y) continue;
    // against a wall, not crowding doors, lockers, stairs or counters
    if (![[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => isWallish(m.getObj(x + dx, y + dy, 0)))) continue;
    let crowded = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const o = m.getObj(x + dx, y + dy, 0);
      const orth = dx === 0 || dy === 0;
      if ((orth && (busy.has(o) || npcAt(x + dx, y + dy))) || o === Obj.Door || o === Obj.StairsUp || o === Obj.StairsDown || o === Obj.Ladder) crowded = true;
    }
    if (crowded) continue;
    m.setObj(x, y, obj, 0);
    const after = reachable();
    // stations are used from a tile beside them, so one must be free
    const usable = obj === Obj.MarketBoard || [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => after.has(m.idx(x + dx, y + dy)));
    if (after.size === before.size - 1 && ok(after) && usable) return { x, y };
    m.setObj(x, y, Obj.None, 0);
  }
  return null;
}

function settleSpawns(m: WorldMap): void {
  const taken = new Set(m.spawns.map((s) => WorldMap.key(s.x, s.y, s.z)));
  for (const s of m.spawns) {
    if (m.isWalkable(s.x, s.y, s.z) && !m.linkAt(s.x, s.y, s.z)) continue;
    let done = false;
    for (let r = 1; r < 6 && !done; r++) {
      for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (!m.isWalkable(x, y, s.z) || m.linkAt(x, y, s.z) || taken.has(WorldMap.key(x, y, s.z)) || m.isSafe(x, y, s.z)) continue;
        taken.delete(WorldMap.key(s.x, s.y, s.z));
        s.x = x; s.y = y;
        taken.add(WorldMap.key(x, y, s.z));
        done = true;
        break;
      }
    }
  }
}

/** Reachable tiles per floor (bitmaps), with the string-key lookup older code uses. */
export class Reach {
  readonly floors = new Map<number, Uint8Array>();
  constructor(readonly width: number, readonly height: number) {
    for (let z = FLOOR_MIN; z <= FLOOR_MAX; z++) this.floors.set(z, new Uint8Array(width * height));
  }
  at(x: number, y: number, z: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const f = this.floors.get(z);
    return !!f && f[y * this.width + x] === 1;
  }
  has(key: string): boolean {
    const [x, y, z] = key.split(',').map(Number);
    return this.at(x, y, z);
  }
  get size(): number {
    let n = 0;
    for (const f of this.floors.values()) for (let i = 0; i < f.length; i++) n += f[i];
    return n;
  }
}

const D8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

const LINK_OBJ = new Uint8Array(256);
for (const o of [Obj.StairsUp, Obj.StairsDown, Obj.Hole, Obj.LooseStone, Obj.Ladder, Obj.RopeSpot]) LINK_OBJ[o] = 1;

/** Every (x,y,z) a player can reach from the spawn, following stairs, ladders, ropes, dig spots and ships. */
export function floodFill3D(m: WorldMap): Reach {
  const W = m.width, H = m.height, N = W * H;
  const reach = new Reach(W, H);
  const stack: number[] = [];
  const zOff = -FLOOR_MIN;
  const push = (x: number, y: number, z: number) => {
    const f = reach.floors.get(z);
    if (!f || !m.floors.has(z) || x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (f[i]) return;
    f[i] = 1;
    stack.push((z + zOff) * N + i);
  };
  push(m.playerSpawn.x, m.playerSpawn.y, m.playerSpawn.z);
  for (const d of Object.values(m.destinations)) push(d.x, d.y, d.z);
  while (stack.length) {
    const v = stack.pop()!;
    const z = Math.floor(v / N) - zOff;
    const i = v - (z + zOff) * N;
    const x = i % W, y = (i - x) / W;
    const fl = m.floors.get(z)!;
    const G = fl.ground, O = fl.obj;
    const seen = reach.floors.get(z)!;
    if (LINK_OBJ[O[i]]) {
      const link = m.linkAt(x, y, z);
      if (link) push(link.to.x, link.to.y, link.to.z);
    }
    for (let d = 0; d < 8; d++) {
      const dx = D8[d][0], dy = D8[d][1];
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = i + dy * W + dx;
      const o = O[ni];
      if (LINK_OBJ[o] && (o === Obj.Ladder || o === Obj.RopeSpot || o === Obj.LooseStone)) {
        // ladders and rope spots are used from an adjacent tile; a shovel opens loose stones
        const l2 = m.linkAt(nx, ny, z);
        if (l2) push(l2.to.x, l2.to.y, l2.to.z);
      }
      if (seen[ni] || UNWALKABLE_GROUND[G[ni]] || SOLID_OBJ[o]) continue;
      if (dx !== 0 && dy !== 0) {
        const a = i + dx, b2 = i + dy * W;
        if (UNWALKABLE_GROUND[G[a]] || SOLID_OBJ[O[a]] || UNWALKABLE_GROUND[G[b2]] || SOLID_OBJ[O[b2]]) continue;
      }
      seen[ni] = 1;
      stack.push((z + zOff) * N + ni);
    }
  }
  return reach;
}

/**
 * Makes every monster, NPC and chest reachable: for anything cut off, finds the
 * cheapest way to the reachable area (through trees, rivers, rock) and carves
 * it, moving only orthogonally so the corner rule never blocks the passage.
 */
function ensureConnected(m: WorldMap): void {
  const W = m.width, H = m.height;
  for (let pass = 0; pass < 7; pass++) {
    const reach = floodFill3D(m);
    const targets: Array<{ x: number; y: number; z: number; adjacent: boolean }> = [
      ...m.spawns.map((s) => ({ x: s.x, y: s.y, z: s.z, adjacent: false })),
      ...m.npcs.map((n) => ({ x: n.x, y: n.y, z: n.z, adjacent: true })),
      ...m.chests.map((c) => ({ x: c.x, y: c.y, z: c.z, adjacent: true })),
      ...[...m.links.keys()].map((k) => {
        const [x, y, z] = k.split(',').map(Number);
        return { x, y, z, adjacent: true };
      }),
    ];
    let fixed = 0;
    const carved = new Uint8Array(W * H);
    for (const t of targets) {
      const ok = t.adjacent ? D8.some(([dx, dy]) => reach.at(t.x + dx, t.y + dy, t.z)) : reach.at(t.x, t.y, t.z);
      if (ok) continue;
      if (carve(m, reach, t.x, t.y, t.z, t.adjacent, carved)) fixed++;
    }
    if ((globalThis as { __GEN_PROFILE?: boolean }).__GEN_PROFILE) console.log('connect pass', pass, 'fixed', fixed);
    if (!fixed) break;
  }
}

function carve(m: WorldMap, reach: Reach, tx: number, ty: number, z: number, adjacent: boolean, carved: Uint8Array): boolean {
  const W = m.width;
  const R = 70;
  const x0 = Math.max(0, tx - R), y0 = Math.max(0, ty - R), x1 = Math.min(W - 1, tx + R), y1 = Math.min(m.height - 1, ty + R);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const dist = new Float32Array(bw * bh).fill(Infinity);
  const prev = new Int32Array(bw * bh).fill(-1);
  const heap: Array<[number, number]> = [];
  const push = (i: number, d: number) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let s = k;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === k) break;
        [heap[s], heap[k]] = [heap[k], heap[s]];
        k = s;
      }
    }
    return top;
  };
  const cost = (x: number, y: number): number => {
    const g = m.getGround(x, y, z), o = m.getObj(x, y, z);
    let c = 1;
    if (g === Ground.Void) c = z < 0 ? 3 : 60;
    else if (g === Ground.DeepWater) c = 40;
    else if (g === Ground.Water) c = 5;
    else if (g === Ground.Lava) c = 8;
    if (o === Obj.None || o === Obj.Flowers || o === Obj.Fern || o === Obj.Bones || o === Obj.Wheat) return c;
    if (SOFT.has(o)) return c + (o === Obj.Cliff ? 6 : 2);
    if (o === Obj.Door) return c;
    if (o === Obj.Fence || o === Obj.Railing) return c + 10;
    return Infinity; // walls, links and furniture stay
  };
  const si = (ty - y0) * bw + (tx - x0);
  dist[si] = 0;
  push(si, 0);
  let goal = -1;
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const x = (i % bw) + x0, y = Math.floor(i / bw) + y0;
    if ((x !== tx || y !== ty) && reach.at(x, y, z)) { goal = i; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
      const c = reach.at(nx, ny, z) ? 0.5 : cost(nx, ny);
      if (c === Infinity) continue;
      const ni = (ny - y0) * bw + (nx - x0);
      if (d + c < dist[ni]) {
        dist[ni] = d + c;
        prev[ni] = i;
        push(ni, d + c);
      }
    }
  }
  if (goal < 0) return false;
  for (let i = goal; i !== -1; i = prev[i]) {
    const x = (i % bw) + x0, y = Math.floor(i / bw) + y0;
    if (adjacent && x === tx && y === ty) continue;
    const o = m.getObj(x, y, z);
    if (o !== Obj.None && o !== Obj.Door && (SOFT.has(o) || o === Obj.Fence || o === Obj.Railing || o === Obj.Flowers || o === Obj.Fern || o === Obj.Bones || o === Obj.Wheat)) m.setObj(x, y, Obj.None, z);
    const g = m.getGround(x, y, z);
    if (g === Ground.Void) m.setGround(x, y, z < 0 ? Ground.Cave : Ground.Stone, z);
    else if (g === Ground.Water || g === Ground.DeepWater) m.setGround(x, y, Ground.Wood, z);
    else if (g === Ground.Lava) m.setGround(x, y, Ground.Ash, z);
    if (z === 0) carved[y * m.width + x] = 1;
  }
  return true;
}

import { Rng } from '../core/rng';
import { Gen } from './genKit';
import { SEA_BOX } from './sea';
import { Ground, Obj, SOLID_OBJ, WorldMap, type EnemyKind, type Region } from './WorldMap';

/**
 * Bigger hunting grounds below ground. Every cave and crypt on floors −1 to −4
 * grows outward into the rock around it:
 *
 * - caves get new chambers (the same cellular automaton that made them), side
 *   passages and loop tunnels between parts that were far apart on foot, so
 *   monsters can be lured round in circles;
 * - crypts, sewers, tombs and the Descent get side chambers, great halls with
 *   pillars and loop corridors;
 * - the new ground is dressed for its region: rails, braziers and torches in
 *   the mines, crystals in the ice, puddles under dripping water, glowing
 *   mushrooms, cobwebs and egg sacs where spiders live, bones everywhere;
 * - new chambers get spawns of the monsters already living there.
 *
 * Rules that keep players safe: only rock (void) is ever carved, so every tile
 * a player could stand on before stays open; nothing solid is put on old
 * ground, only on new; growth stays on the same island (premium land never
 * changes) and keeps 5 tiles of rock between neighbouring dungeons; nothing is
 * touched under Thornvale or Wayfarer's Isle. Stairs, ladders, rope spots,
 * chests, bosses and quest spots stay where they are. Uses its own random
 * numbers, so the rest of the world comes out as before.
 */

type Kind = 'cave' | 'rooms';
type Flavour = 'earth' | 'mine' | 'ice' | 'volcanic' | 'swamp' | 'crypt' | 'tomb' | 'sewer';

interface AreaSpec {
  /** Region name (regions in areas.ts / legacy.ts) and floor. */
  name: string;
  z: number;
  kind: Kind;
  /** How far (tiles) the area may grow beyond its region box. */
  grow: number;
  flavour?: Flavour;
  /** Monsters for the new chambers; default: the kinds already spawning there. */
  monsters?: Array<[EnemyKind, number]>;
  /** New tiles per extra monster (default 48 caves / 40 rooms). */
  density?: number;
  /** Spider country: cobwebs and egg sacs. */
  spiders?: boolean;
}

/** Floors that are enlarged (pushed floor by floor). */
export const DEEPENED_FLOORS: number[] = [-1, -2, -3, -4];

export const UNDERGROUND_AREAS: AreaSpec[] = [
  // ---------------------------------------------------------------- floor −1
  { name: 'Stonedeep Mines', z: -1, kind: 'cave', grow: 12, flavour: 'mine' },
  { name: 'Fernwick Cave', z: -1, kind: 'cave', grow: 10, spiders: true },
  { name: 'Crystal Mines', z: -1, kind: 'cave', grow: 8, flavour: 'ice', spiders: true },
  { name: 'Frost Dragon Lair', z: -1, kind: 'cave', grow: 10, flavour: 'ice' },
  { name: 'Jotun Isle', z: -1, kind: 'cave', grow: 10, flavour: 'ice' },
  { name: 'Cyclops Isle', z: -1, kind: 'cave', grow: 8, flavour: 'volcanic' },
  { name: 'Cinder Isle', z: -1, kind: 'cave', grow: 8, flavour: 'volcanic' },
  { name: 'Bonecrag', z: -1, kind: 'cave', grow: 10 },
  { name: 'Mire Caves', z: -1, kind: 'cave', grow: 10, flavour: 'swamp', spiders: true },
  { name: 'Behemoth Halls', z: -1, kind: 'cave', grow: 10, flavour: 'volcanic' },
  { name: 'Ember Forge', z: -1, kind: 'cave', grow: 8, flavour: 'volcanic' },
  { name: 'Dragon Lair', z: -1, kind: 'cave', grow: 10, flavour: 'volcanic' },
  { name: 'Westmarch Catacombs', z: -1, kind: 'rooms', grow: 12, flavour: 'crypt' },
  { name: 'Hollow Crypt', z: -1, kind: 'rooms', grow: 12, flavour: 'crypt' },
  { name: 'Aurelion Sewers', z: -1, kind: 'rooms', grow: 10, flavour: 'sewer', spiders: true },
  { name: 'Grimtusk Fortress', z: -1, kind: 'rooms', grow: 10, flavour: 'crypt' },
  { name: 'Minotaur Hold', z: -1, kind: 'rooms', grow: 12, flavour: 'crypt' },
  { name: 'Scalemire Sanctum', z: -1, kind: 'rooms', grow: 10, flavour: 'swamp' },
  { name: 'Temple Undercroft', z: -1, kind: 'rooms', grow: 10, flavour: 'crypt' },
  { name: "Smugglers' Cove", z: -1, kind: 'rooms', grow: 8, flavour: 'sewer' },
  { name: 'The Crypt', z: -1, kind: 'rooms', grow: 10, flavour: 'crypt' },
  { name: 'Tomb of Kesh', z: -1, kind: 'rooms', grow: 10, flavour: 'tomb' },
  // ---------------------------------------------------------------- floor −2
  { name: 'Deep Delvings', z: -2, kind: 'cave', grow: 12, flavour: 'mine', spiders: true },
  { name: 'Crystal Depths', z: -2, kind: 'cave', grow: 10, flavour: 'ice', spiders: true },
  { name: 'Aurelion Catacombs', z: -2, kind: 'rooms', grow: 10, flavour: 'crypt' },
  { name: 'Infernal Rift', z: -2, kind: 'cave', grow: 8, flavour: 'volcanic' },
  { name: 'Burning Catacombs', z: -2, kind: 'rooms', grow: 10, flavour: 'crypt' },
  { name: 'Hydra Nest', z: -2, kind: 'cave', grow: 10, flavour: 'swamp' },
  { name: 'Behemoth Depths', z: -2, kind: 'cave', grow: 10, flavour: 'volcanic' },
  { name: 'Kesh Catacombs', z: -2, kind: 'rooms', grow: 10, flavour: 'tomb' },
  // ---------------------------------------------------------------- floor −3
  { name: 'Molten Deep', z: -3, kind: 'cave', grow: 12, flavour: 'volcanic' },
  { name: 'Abyssal Halls', z: -3, kind: 'rooms', grow: 12, flavour: 'crypt' },
  { name: "Pharaoh's Vault", z: -3, kind: 'rooms', grow: 12, flavour: 'tomb' },
  // ---------------------------------------------------------------- floor −4
  { name: 'The Demon Pit', z: -4, kind: 'rooms', grow: 14, flavour: 'volcanic', density: 70 },
];

/** No digging under the starting town and the tutorial island. */
const KEEP_OUT: Array<[number, number, number, number]> = [
  [150, 270, 262, 360], // Thornvale and its sewers
  [66, 300, 134, 366], // Wayfarer's Isle
  [SEA_BOX.x0 - 8, SEA_BOX.y0 - 8, SEA_BOX.x1 + 8, SEA_BOX.y1 + 8], // the Sunken Reach (built after this, world/sea.ts)
];

function keepOut(x: number, y: number): boolean {
  for (const [a, b, c, d] of KEEP_OUT) if (x >= a && x <= c && y >= b && y <= d) return true;
  return false;
}

/** Gap of rock kept between two different dungeons. */
const GAP = 5;

const D4: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const RING: Array<[number, number]> = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

function nameSalt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Summary per area (tests and the Bible). */
export interface DeepenReport { name: string; z: number; before: number; added: number; spawns: number }
/** What the last world build added, per area (tests). */
export const DEEPEN_REPORT: DeepenReport[] = [];

export function deepenUnderground(main: Gen, seed: number, floors: number[] = DEEPENED_FLOORS): DeepenReport[] {
  const m = main.m;
  const isle = islandLabels(m);
  const out: DeepenReport[] = [];
  for (const z of floors) {
    const f = m.floor(z);
    if (!f) continue;
    const specs = UNDERGROUND_AREAS.filter((a) => a.z === z);
    for (const spec of specs) {
      const region = m.regions.find((r) => r.name === spec.name && z >= r.z0 && z <= r.z1);
      if (!region) continue;
      const rng = new Rng((seed ^ nameSalt(spec.name + ':' + z)) >>> 0);
      const g = new Gen(m, rng, main.biome, main.land);
      const rep = deepenArea(g, spec, region, z, isle, specs);
      if (rep) out.push(rep);
    }
  }
  fixLinkArrivals(m);
  DEEPEN_REPORT.length = 0;
  DEEPEN_REPORT.push(...out);
  return out;
}

/** Stairs, ladders and ropes always land on a free tile (a stalagmite once stood on one). */
function fixLinkArrivals(m: WorldMap): void {
  for (const l of m.links.values()) {
    const { x, y, z } = l.to;
    const o = m.getObj(x, y, z);
    if (SOLID_OBJ[o] && (o === Obj.Stalagmite || o === Obj.Rock || o === Obj.Bones || o === Obj.Crystals)) m.setObj(x, y, Obj.None, z);
  }
}

/** Nearest-island label for every tile (like premium/PremiumZone): growth never crosses to another island's ground. */
function islandLabels(m: WorldMap): Int32Array {
  const W = m.width, H = m.height, N = W * H;
  const G = m.floor(0)!.ground;
  const label = new Int32Array(N).fill(-1);
  const q = new Int32Array(N);
  const visit = (j: number, l: number, t: number, sea: boolean): number => {
    if (label[j] !== -1 || (!sea && G[j] === Ground.DeepWater)) return t;
    label[j] = l;
    q[t] = j;
    return t + 1;
  };
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (label[i] !== -1 || G[i] === Ground.DeepWater) continue;
    let h = 0, t = 0;
    label[i] = n;
    q[t++] = i;
    while (h < t) {
      const c = q[h++];
      const x = c % W;
      if (x > 0) t = visit(c - 1, n, t, false);
      if (x < W - 1) t = visit(c + 1, n, t, false);
      if (c >= W) t = visit(c - W, n, t, false);
      if (c < N - W) t = visit(c + W, n, t, false);
    }
    n++;
  }
  let h = 0, t = 0;
  for (let i = 0; i < N; i++) if (label[i] >= 0) q[t++] = i;
  while (h < t) {
    const c = q[h++];
    const x = c % W, l = label[c];
    if (x > 0) t = visit(c - 1, l, t, true);
    if (x < W - 1) t = visit(c + 1, l, t, true);
    if (c >= W) t = visit(c - W, l, t, true);
    if (c < N - W) t = visit(c + W, l, t, true);
  }
  return label;
}

/** A local window over the floor: everything for one area works inside it. */
class Win {
  readonly w: number;
  readonly h: number;
  constructor(readonly x0: number, readonly y0: number, x1: number, y1: number) {
    this.w = x1 - x0 + 1;
    this.h = y1 - y0 + 1;
  }
  in(x: number, y: number): boolean { return x >= this.x0 && y >= this.y0 && x < this.x0 + this.w && y < this.y0 + this.h; }
  i(x: number, y: number): number { return (y - this.y0) * this.w + (x - this.x0); }
  x(i: number): number { return this.x0 + (i % this.w); }
  y(i: number): number { return this.y0 + ((i / this.w) | 0); }
}

function deepenArea(g: Gen, spec: AreaSpec, region: Region, z: number, isle: Int32Array, all: AreaSpec[]): DeepenReport | null {
  const { m, rng } = g;
  const W = m.width, H = m.height;
  const pad = spec.grow + GAP + 2;
  const win = new Win(Math.max(1, region.x0 - pad), Math.max(1, region.y0 - pad), Math.min(W - 2, region.x1 + pad), Math.min(H - 2, region.y1 + pad));
  const N = win.w * win.h;
  // direct reads of the floor arrays (the window never touches the map edge)
  const GZ = m.floor(z)!.ground;
  const ground = (x: number, y: number) => GZ[y * W + x] as Ground;
  const isOpen = (x: number, y: number) => GZ[y * W + x] !== Ground.Void;
  const inBox = (x: number, y: number, r: Region, grow = 0) => x >= r.x0 - grow && x <= r.x1 + grow && y >= r.y0 - grow && y <= r.y1 + grow;

  // --- which open tiles belong to this area: components (4-way) holding its stairs/spawns, or lying inside its box
  const comp = new Int32Array(N).fill(-1);
  const comps: Array<{ tiles: number[]; inside: number; anchor: boolean; foreignAnchor: boolean }> = [];
  const anchorAt = new Set<number>();
  const foreignAt = new Set<number>();
  const others = all.filter((a) => a !== spec).map((a) => m.regions.find((r) => r.name === a.name && z >= r.z0 && z <= r.z1)).filter((r): r is Region => !!r);
  const mark = (x: number, y: number) => {
    if (!win.in(x, y)) return;
    const i = win.i(x, y);
    if (inBox(x, y, region)) anchorAt.add(i);
    else if (others.some((r) => inBox(x, y, r))) foreignAt.add(i);
  };
  for (const [k, l] of m.links) {
    const [lx, ly, lz] = k.split(',').map(Number);
    if (lz === z) mark(lx, ly);
    if (l.to.z === z) mark(l.to.x, l.to.y);
  }
  for (const s of m.spawns) if (s.z === z) mark(s.x, s.y);
  for (let i = 0; i < N; i++) {
    if (comp[i] !== -1) continue;
    const x = win.x(i), y = win.y(i);
    if (!isOpen(x, y)) continue;
    const id = comps.length;
    const c = { tiles: [] as number[], inside: 0, anchor: false, foreignAnchor: false };
    comps.push(c);
    const st = [i];
    comp[i] = id;
    while (st.length) {
      const k = st.pop()!;
      c.tiles.push(k);
      const kx = win.x(k), ky = win.y(k);
      if (inBox(kx, ky, region)) c.inside++;
      if (anchorAt.has(k)) c.anchor = true;
      if (foreignAt.has(k)) c.foreignAnchor = true;
      for (const [dx, dy] of D4) {
        const nx = kx + dx, ny = ky + dy;
        if (!win.in(nx, ny) || !isOpen(nx, ny)) continue;
        const j = win.i(nx, ny);
        if (comp[j] !== -1) continue;
        comp[j] = id;
        st.push(j);
      }
    }
  }
  const own = new Uint8Array(N);
  let before = 0;
  for (const c of comps) {
    const mine = c.anchor || (c.inside === c.tiles.length && !c.foreignAnchor);
    if (!mine) continue;
    for (const k of c.tiles) own[k] = 1;
    before += c.tiles.length;
  }
  if (!before) return null;

  // the island this area belongs to (from its anchors), so growth never reaches under another island
  let isleId = -1;
  for (const k of anchorAt) if (own[k]) { isleId = isle[win.y(k) * W + win.x(k)]; break; }
  if (isleId < 0) for (let k = 0; k < N; k++) if (own[k]) { isleId = isle[win.y(k) * W + win.x(k)]; break; }

  // --- where digging is allowed: rock inside the grown box, same island, GAP tiles from any other dungeon, outside keep-out zones
  const near = new Uint8Array(N).fill(255);
  const q: number[] = [];
  for (let k = 0; k < N; k++) if (!own[k] && isOpen(win.x(k), win.y(k))) { near[k] = 0; q.push(k); }
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (near[k] >= GAP) continue;
    const kx = win.x(k), ky = win.y(k);
    for (const [dx, dy] of RING) {
      const nx = kx + dx, ny = ky + dy;
      if (!win.in(nx, ny)) continue;
      const j = win.i(nx, ny);
      if (near[j] <= near[k] + 1) continue;
      near[j] = near[k] + 1;
      q.push(j);
    }
  }
  const allowed = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    const x = win.x(k), y = win.y(k);
    if (isOpen(x, y) || near[k] <= GAP) continue;
    if (!inBox(x, y, region, spec.grow)) continue;
    if (x < 3 || y < 3 || x > W - 4 || y > H - 4) continue;
    if (isle[y * W + x] !== isleId) continue;
    if (keepOut(x, y)) continue;
    allowed[k] = 1;
  }

  // the floor the area is made of (most common open ground)
  const counts = new Map<Ground, number>();
  for (let k = 0; k < N; k++) if (own[k]) { const gr = ground(win.x(k), win.y(k)); if (gr !== Ground.Lava && gr !== Ground.Water && gr !== Ground.DeepWater) counts.set(gr, (counts.get(gr) ?? 0) + 1); }
  const floorGround = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? Ground.Cave;

  const fresh = new Uint8Array(N);
  const dig = (k: number, gr: Ground = floorGround): boolean => {
    if (!allowed[k] || fresh[k]) return false;
    const x = win.x(k), y = win.y(k);
    m.setGround(x, y, gr, z);
    m.setObj(x, y, Obj.None, z);
    fresh[k] = 1;
    return true;
  };
  const target = Math.round(before * (spec.kind === 'cave' ? 0.6 : 0.75)) + 60;

  if (spec.kind === 'cave') growCave(g, win, own, allowed, fresh, dig, target);
  else growRooms(g, win, own, allowed, fresh, dig, target, spec);
  const tunnels = loops(g, win, own, fresh, allowed, dig, spec);

  let added = 0;
  for (let k = 0; k < N; k++) if (fresh[k]) added++;
  if (!added) return { name: spec.name, z, before, added: 0, spawns: 0 };

  const flavour = spec.flavour ?? (floorGround === Ground.Ice ? 'ice' : floorGround === Ground.Ash ? 'volcanic' : floorGround === Ground.Sand ? 'tomb' : floorGround === Ground.Stone || floorGround === Ground.Marble ? 'crypt' : 'earth');
  dress(g, win, own, fresh, z, flavour, spec, tunnels);

  // --- spawns in the new ground
  const kinds = spec.monsters ?? livingHere(m, region, z);
  let spawned = 0;
  if (kinds.length) {
    // as crowded as the area already is (never denser than one per `density` tiles)
    const living = m.spawns.filter((sp) => sp.z === z && sp.x >= region.x0 && sp.x <= region.x1 && sp.y >= region.y0 && sp.y <= region.y1 && !/^(boss_|wb_|raid_)/.test(sp.kind)).length;
    const perTile = Math.min(living / Math.max(1, before), 1 / (spec.density ?? (spec.kind === 'cave' ? 48 : 40)));
    const want = Math.max(1, Math.round(added * Math.max(perTile, 1 / 90)));
    const total = kinds.reduce((a, [, w]) => a + w, 0);
    const taken: Array<{ x: number; y: number }> = m.spawns.filter((s) => s.z === z && win.in(s.x, s.y)).map((s) => ({ x: s.x, y: s.y }));
    const cand: number[] = [];
    for (let k = 0; k < N; k++) if (fresh[k]) cand.push(k);
    for (let t = 0; t < want * 30 && spawned < want; t++) {
      const k = cand[rng.int(0, cand.length - 1)];
      const x = win.x(k), y = win.y(k);
      if (!m.isWalkable(x, y, z) || m.linkAt(x, y, z) || m.getObj(x, y, z) !== Obj.None) continue;
      if (taken.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < 4)) continue;
      let r = rng.next() * total;
      let kind = kinds[0][0];
      for (const [kk, w] of kinds) { if (r < w) { kind = kk; break; } r -= w; }
      g.b.spawn(kind, x, y, z);
      taken.push({ x, y });
      spawned++;
    }
  }

  // --- the region grows with the area (inserted before the old one, so smaller regions inside keep their names)
  let bx0 = region.x0, by0 = region.y0, bx1 = region.x1, by1 = region.y1;
  for (let k = 0; k < N; k++) if (fresh[k]) {
    const x = win.x(k), y = win.y(k);
    bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
  }
  if (bx0 < region.x0 || by0 < region.y0 || bx1 > region.x1 || by1 > region.y1) {
    const at = m.regions.indexOf(region);
    m.regions.splice(at, 0, { ...region, x0: bx0, y0: by0, x1: bx1, y1: by1, z0: z, z1: z, temple: undefined });
  }
  return { name: spec.name, z, before, added, spawns: spawned };
}

/** The monsters already living in a region on this floor, weighted by how many (no bosses). */
function livingHere(m: WorldMap, r: Region, z: number): Array<[EnemyKind, number]> {
  const n = new Map<EnemyKind, number>();
  for (const s of m.spawns) {
    if (s.z !== z || s.x < r.x0 || s.x > r.x1 || s.y < r.y0 || s.y > r.y1) continue;
    if (/^(boss_|wb_|raid_)/.test(s.kind)) continue;
    n.set(s.kind, (n.get(s.kind) ?? 0) + 1);
  }
  return [...n.entries()];
}

type Dig = (k: number, gr?: Ground) => boolean;

/** New chambers around a cave: the cave automaton run over the rock around it, then joined up. */
function growCave(g: Gen, win: Win, own: Uint8Array, allowed: Uint8Array, fresh: Uint8Array, dig: Dig, target: number): void {
  const { rng } = g;
  const N = win.w * win.h;
  let cells = new Uint8Array(N);
  for (let k = 0; k < N; k++) cells[k] = own[k] ? 1 : allowed[k] && rng.chance(0.53) ? 1 : 0;
  for (let it = 0; it < 5; it++) {
    const next = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      if (own[k]) { next[k] = 1; continue; }
      if (!allowed[k]) continue;
      const x = k % win.w, y = (k / win.w) | 0;
      let n = 0;
      for (const [dx, dy] of RING) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= win.w || ny >= win.h) continue;
        n += cells[ny * win.w + nx];
      }
      next[k] = n >= 5 || (cells[k] && n >= 4) ? 1 : 0;
    }
    cells = next;
  }
  // keep new ground that touches the cave; join bigger detached chambers with a tunnel; drop crumbs
  const seen = new Uint8Array(N);
  const blobs: number[][] = [];
  for (let k = 0; k < N; k++) {
    if (!cells[k] || own[k] || seen[k]) continue;
    const blob: number[] = [];
    const st = [k];
    seen[k] = 1;
    while (st.length) {
      const c = st.pop()!;
      blob.push(c);
      const x = c % win.w, y = (c / win.w) | 0;
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= win.w || ny >= win.h) continue;
        const j = ny * win.w + nx;
        if (!cells[j] || own[j] || seen[j]) continue;
        seen[j] = 1;
        st.push(j);
      }
    }
    blobs.push(blob);
  }
  // biggest first, until the target is met
  blobs.sort((a, b) => b.length - a.length);
  let added = 0;
  for (const blob of blobs) {
    if (added >= target) break;
    if (blob.length < 14) continue;
    const touches = blob.some((c) => {
      const x = c % win.w, y = (c / win.w) | 0;
      return D4.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < win.w && ny < win.h && own[ny * win.w + nx]; });
    });
    // a chamber bigger than what is left of the target is cut back to the part nearest the cave
    const room = Math.round(target * 1.25) - added;
    let take = blob;
    if (blob.length > room) {
      if (!touches || room < 40) continue;
      take = nearestPart(win, own, blob, room);
    }
    if (!touches && !tunnelTo(g, win, own, fresh, allowed, dig, take)) continue;
    for (const c of take) if (dig(c)) added++;
  }
}

/** The `n` tiles of a blob closest (on foot) to the open cave it touches. */
function nearestPart(win: Win, own: Uint8Array, blob: number[], n: number): number[] {
  const inBlob = new Set(blob);
  const seen = new Set<number>();
  const q: number[] = [];
  for (const c of blob) {
    const x = c % win.w, y = (c / win.w) | 0;
    if (D4.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < win.w && ny < win.h && own[ny * win.w + nx]; })) { seen.add(c); q.push(c); }
  }
  for (let h = 0; h < q.length && q.length < n; h++) {
    const c = q[h];
    const x = c % win.w, y = (c / win.w) | 0;
    for (const [dx, dy] of D4) {
      const j = (y + dy) * win.w + (x + dx);
      if (!inBlob.has(j) || seen.has(j)) continue;
      seen.add(j);
      q.push(j);
      if (q.length >= n) break;
    }
  }
  return q;
}

/** Carves a 2-wide tunnel from a detached blob to the nearest open tile of the area (through allowed rock only). */
function tunnelTo(g: Gen, win: Win, own: Uint8Array, fresh: Uint8Array, allowed: Uint8Array, dig: Dig, blob: number[]): boolean {
  const N = win.w * win.h;
  const prev = new Int32Array(N).fill(-2);
  const q: number[] = [];
  for (const c of blob) { prev[c] = -1; q.push(c); }
  let goal = -1;
  for (let h = 0; h < q.length && goal < 0; h++) {
    const c = q[h];
    const x = c % win.w, y = (c / win.w) | 0;
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= win.w || ny >= win.h) continue;
      const j = ny * win.w + nx;
      if (prev[j] !== -2) continue;
      if (own[j] || fresh[j]) { prev[j] = c; goal = j; break; }
      if (!allowed[j]) continue;
      prev[j] = c;
      q.push(j);
    }
    if (h > 6000) break;
  }
  if (goal < 0) return false;
  const path: number[] = [];
  for (let c = prev[goal]; c >= 0 && prev[c] !== -1; c = prev[c]) path.push(c);
  if (path.length > 30) return false;
  for (const c of path) {
    dig(c);
    // two wide where the rock allows
    const x = c % win.w, y = (c / win.w) | 0;
    if (x + 1 < win.w) dig(y * win.w + x + 1);
  }
  void g;
  return true;
}

/** New rooms for crypts, sewers, tombs: side chambers, a great hall with pillars, corridors back. */
function growRooms(g: Gen, win: Win, own: Uint8Array, allowed: Uint8Array, fresh: Uint8Array, dig: Dig, target: number, spec: AreaSpec): void {
  const { rng, m } = g;
  const z = spec.z;
  let added = 0;
  const rooms: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let tries = 0; tries < 900 && added < target; tries++) {
    const hall = rooms.length === 1 || (rooms.length > 2 && rng.chance(0.15));
    const w = hall ? rng.int(11, 15) : rng.int(6, 11), h = hall ? rng.int(8, 11) : rng.int(5, 8);
    const x = win.x0 + rng.int(1, Math.max(1, win.w - w - 2)), y = win.y0 + rng.int(1, Math.max(1, win.h - h - 2));
    // the room and a ring of two tiles around it must be diggable rock
    let ok = true;
    for (let yy = y - 2; yy < y + h + 2 && ok; yy++) for (let xx = x - 2; xx < x + w + 2; xx++) {
      if (!win.in(xx, yy)) { ok = false; break; }
      const k = win.i(xx, yy);
      const inner = xx >= x && xx < x + w && yy >= y && yy < y + h;
      if (inner ? !allowed[k] : own[k] || fresh[k]) { ok = false; break; }
    }
    if (!ok) continue;
    // only rooms that can reach the area with a short corridor
    const centre = win.i(x + (w >> 1), y + (h >> 1));
    const pathTo = corridorPath(win, own, fresh, allowed, centre, 26);
    if (!pathTo) continue;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (dig(win.i(xx, yy))) added++;
    for (const c of pathTo) {
      if (dig(c)) added++;
      const cx = c % win.w, cy = (c / win.w) | 0;
      if (cy + 1 < win.h && dig((cy + 1) * win.w + cx)) added++;
    }
    rooms.push({ x, y, w, h });
    if (hall) {
      // two rows of pillars down a great hall
      for (let xx = x + 2; xx < x + w - 2; xx += 3) for (const yy of [y + 2, y + h - 3]) {
        const k = win.i(xx, yy);
        if (fresh[k]) m.setObj(xx, yy, Obj.Pillar, z);
      }
    }
  }
  // corridors between new rooms close loops
  for (let i = 1; i < rooms.length; i++) {
    if (!rng.chance(0.6)) continue;
    const a = rooms[i - 1], b = rooms[i];
    lCorridor(win, allowed, dig, a.x + (a.w >> 1), a.y + (a.h >> 1), b.x + (b.w >> 1), b.y + (b.h >> 1), rng.chance(0.5));
  }
}

/** Shortest 4-way path (through allowed rock) from a tile to the area; null if longer than `max`. */
function corridorPath(win: Win, own: Uint8Array, fresh: Uint8Array, allowed: Uint8Array, from: number, max: number): number[] | null {
  const N = win.w * win.h;
  const prev = new Int32Array(N).fill(-2);
  const dist = new Int32Array(N);
  const q = [from];
  prev[from] = -1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (dist[c] > max) return null;
    const x = c % win.w, y = (c / win.w) | 0;
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= win.w || ny >= win.h) continue;
      const j = ny * win.w + nx;
      if (prev[j] !== -2) continue;
      if (own[j] || (fresh[j] && j !== from)) {
        const path: number[] = [];
        for (let k = c; k >= 0; k = prev[k]) path.push(k);
        return path;
      }
      if (!allowed[j]) continue;
      prev[j] = c;
      dist[j] = dist[c] + 1;
      q.push(j);
    }
  }
  return null;
}

/** An L-shaped 2-wide corridor through allowed rock (stops where the rock is not allowed). */
function lCorridor(win: Win, allowed: Uint8Array, dig: Dig, ax: number, ay: number, bx: number, by: number, xFirst: boolean): void {
  const pts: Array<[number, number]> = [];
  let x = ax, y = ay;
  const stepX = () => { while (x !== bx) { pts.push([x, y]); x += Math.sign(bx - x); } };
  const stepY = () => { while (y !== by) { pts.push([x, y]); y += Math.sign(by - y); } };
  if (xFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  for (const [px, py] of pts) {
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) {
      if (!win.in(px + ox, py + oy)) continue;
      const k = win.i(px + ox, py + oy);
      if (allowed[k]) dig(k);
    }
  }
}

/**
 * Loop tunnels: pairs of open tiles that are close as the crow flies but far
 * apart on foot get a tunnel between them, so hunters can lure monsters round.
 */
function loops(g: Gen, win: Win, own: Uint8Array, fresh: Uint8Array, allowed: Uint8Array, dig: Dig, spec: AreaSpec): number[][] {
  const { rng } = g;
  const N = win.w * win.h;
  const openK = (k: number) => own[k] || fresh[k];
  const tiles: number[] = [];
  const tunnels: number[][] = [];
  for (let k = 0; k < N; k++) if (openK(k)) tiles.push(k);
  if (tiles.length < 40) return tunnels;
  const want = spec.kind === 'cave' ? 4 : 3;
  let made = 0;
  const dist = new Int32Array(N);
  const q = new Int32Array(N);
  for (let t = 0; t < 12 && made < want; t++) {
    const a = tiles[rng.int(0, tiles.length - 1)];
    // walking distances from a (bounded)
    dist.fill(-1);
    let qt = 0;
    q[qt++] = a;
    dist[a] = 0;
    for (let h = 0; h < qt; h++) {
      const c = q[h];
      if (dist[c] > 120) break;
      const x = c % win.w, y = (c / win.w) | 0;
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= win.w || ny >= win.h) continue;
        const j = ny * win.w + nx;
        if (dist[j] !== -1 || !openK(j)) continue;
        dist[j] = dist[c] + 1;
        q[qt++] = j;
      }
    }
    const ax = a % win.w, ay = (a / win.w) | 0;
    let best = -1, bestScore = 0;
    for (let s = 0; s < 80; s++) {
      const b = tiles[rng.int(0, tiles.length - 1)];
      const bx = b % win.w, by = (b / win.w) | 0;
      const crow = Math.abs(bx - ax) + Math.abs(by - ay);
      if (crow < 6 || crow > 18) continue;
      const walk = dist[b] < 0 ? 400 : dist[b];
      const score = walk / crow;
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (best < 0 || bestScore < 3) continue;
    // the straight-ish tunnel must run through allowed rock (or open ground) all the way
    const bx = best % win.w, by = (best / win.w) | 0;
    const path: number[] = [];
    let x = ax, y = ay, ok = true;
    const xFirst = rng.chance(0.5);
    while ((x !== bx || y !== by) && ok) {
      if ((xFirst && x !== bx) || y === by) x += Math.sign(bx - x); else y += Math.sign(by - y);
      const k = y * win.w + x;
      if (!openK(k) && !allowed[k]) ok = false;
      else path.push(k);
    }
    if (!ok) continue;
    for (const k of path) if (!openK(k)) dig(k);
    tunnels.push(path);
    made++;
  }
  return tunnels;
}

/** Dresses old and new ground for its region; solid things only ever go on new ground. */
function dress(g: Gen, win: Win, own: Uint8Array, fresh: Uint8Array, z: number, flavour: Flavour, spec: AreaSpec, tunnels: number[][]): void {
  const { m, rng } = g;
  const N = win.w * win.h;
  // tiles beside stairs, ladders and rope spots stay bare
  const linked = new Uint8Array(N);
  for (const [key, l] of m.links) {
    const pts: Array<[number, number, number]> = [key.split(',').map(Number) as [number, number, number], [l.to.x, l.to.y, l.to.z]];
    for (const [lx, ly, lz] of pts) {
      if (lz !== z) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (win.in(lx + dx, ly + dy)) linked[win.i(lx + dx, ly + dy)] = 1;
    }
  }
  const nearLink = (x: number, y: number) => !win.in(x, y) || linked[win.i(x, y)] === 1;
  const rockAround = (x: number, y: number) => RING.reduce((n, [dx, dy]) => n + (m.getGround(x + dx, y + dy, z) === Ground.Void ? 1 : 0), 0);
  /** A solid thing may stand here without cutting a passage (open neighbours form one unbroken run). */
  const canBlock = (x: number, y: number) => {
    const open = RING.map(([dx, dy]) => m.isWalkable(x + dx, y + dy, z));
    let runs = 0;
    for (let i = 0; i < 8; i++) if (open[i] && !open[(i + 7) % 8]) runs++;
    if (runs === 0) return open.every(Boolean);
    return runs === 1 && open.filter(Boolean).length <= 6 && [0, 2, 4, 6].some((i) => open[i]);
  };
  const isFree = (x: number, y: number) => m.getObj(x, y, z) === Obj.None && m.isWalkable(x, y, z) && !nearLink(x, y);
  const spiders = spec.spiders === true;
  for (let k = 0; k < N; k++) {
    if (!own[k] && !fresh[k]) continue;
    const x = win.x(k), y = win.y(k);
    if (!isFree(x, y)) continue;
    const walls = rockAround(x, y);
    const r = rng.next();
    if (fresh[k]) {
      // solid dressing on new ground only
      if (walls >= 3 && walls <= 5 && r < 0.05 && canBlock(x, y)) {
        const o = flavour === 'ice' ? (rng.chance(0.6) ? Obj.Crystals : Obj.Stalagmite)
          : flavour === 'crypt' || flavour === 'tomb' ? (rng.chance(0.35) ? Obj.Brazier : Obj.Grave)
          : flavour === 'mine' ? (rng.chance(0.3) ? Obj.Brazier : rng.chance(0.5) ? Obj.Crate : Obj.Stalagmite)
          : flavour === 'volcanic' ? (rng.chance(0.25) ? Obj.FireField : Obj.Stalagmite)
          : flavour === 'sewer' ? (rng.chance(0.5) ? Obj.Barrel : Obj.Crate)
          : Obj.Stalagmite;
        if (o === Obj.FireField) m.setGround(x, y, Ground.Lava, z);
        else m.setObj(x, y, o, z);
        continue;
      }
    }
    // walk-over dressing on any ground
    const p = rng.next();
    if (spiders && walls >= 3 && p < 0.08) m.setObj(x, y, Obj.Cobweb, z);
    else if (spiders && fresh[k] && walls >= 2 && p < 0.1) m.setObj(x, y, Obj.EggSacs, z);
    else if ((flavour === 'crypt' || flavour === 'tomb') && walls >= 3 && p < 0.05) m.setObj(x, y, Obj.Cobweb, z);
    else if ((flavour === 'earth' || flavour === 'swamp' || flavour === 'mine') && walls >= 2 && p < 0.025) m.setObj(x, y, Obj.GlowShrooms, z);
    else if ((flavour === 'earth' || flavour === 'swamp' || flavour === 'ice' || flavour === 'sewer' || flavour === 'mine') && walls >= 1 && p > 0.988) m.setObj(x, y, Obj.Puddle, z);
    else if (p > 0.982 && p <= 0.988) m.setObj(x, y, Obj.Bones, z);
  }
  if (flavour === 'mine') {
    // mine-cart rails along the new loop galleries (a track you can follow round)
    for (const path of tunnels) {
      if (path.length < 8) continue;
      for (const k of path) {
        const x = win.x(k), y = win.y(k);
        if (m.getObj(x, y, z) === Obj.None && m.isWalkable(x, y, z) && !nearLink(x, y)) m.setObj(x, y, Obj.Rails, z);
      }
    }
  }
}

import { Rng } from '../core/rng';
import { OBSTACLE_KINDS, obstacleXp } from '../trades/agility';
import { HERBS } from '../trades/herblore';
import {
  emptyTradeLayout, indexTradeLayout, tileKey, type Obstacle, type ObstacleKind, type StallKind, type TradeLayout,
} from '../trades/layout';
import { STALLS } from '../trades/thieving';
import { TRADE_NPCS } from '../trades/tradeNpcs';
import { TOWNS } from './townList';
import { Ground, Obj, SOLID_OBJ, STRUCTURE_OBJ, UNWALKABLE_GROUND, type Region, type WorldMap } from './WorldMap';

/**
 * Places everything the trade skills need, after the whole world is built (it
 * is the last step of world generation, so every town, monster spawn, chest and
 * NPC that existed before stays exactly where it was). Uses its own random
 * numbers (seeded here), so server and clients build the same layout.
 *
 * - Agility shortcuts where the world has a real detour: a short stretch of
 *   river (balance log, or a swim when it is wider), a thin cliff (climbing
 *   rocks) or a thin wall of rock between two caves (a squeeze), with walkable
 *   ground on both ends and a long way round. Never across the deep sea, so no
 *   shortcut joins two islands.
 * - Market stalls near the town centres, strongboxes in bandit camps and ruins,
 *   wild herbs in the regions where each herb grows, the trade masters and the
 *   townsfolk whose pockets can be picked.
 * Solid things (stalls, boxes) only go where they cannot cut a passage.
 */

const RING: Array<[number, number]> = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

/** Sea floor and tutorial island: no trade spots there. */
function excluded(x: number, y: number, z: number): boolean {
  if (x >= 72 && x <= 127 && y >= 308 && y <= 358) return true;
  if (z === -1 && x >= 240 && x <= 362 && y >= 556 && y <= 642) return true;
  return false;
}

/** Tiles inside houses, per floor (WorldMap.houseAt walks every house; this is read once). */
const houseMasks = new WeakMap<WorldMap, Map<number, Uint8Array>>();
function inHouse(m: WorldMap, x: number, y: number, z: number): boolean {
  let per = houseMasks.get(m);
  if (!per) houseMasks.set(m, (per = new Map()));
  let mask = per.get(z);
  if (!mask) {
    mask = new Uint8Array(m.width * m.height);
    for (const h of m.houses) {
      if (h.z !== z) continue;
      for (let yy = Math.max(0, h.y); yy < Math.min(m.height, h.y + h.h); yy++) mask.fill(1, yy * m.width + Math.max(0, h.x), yy * m.width + Math.min(m.width, h.x + h.w));
    }
    per.set(z, mask);
  }
  return mask[y * m.width + x] === 1;
}

/** A free tile: walkable, nothing on it, not a house, no stairs or ladders near it. */
function isOpen(m: WorldMap, x: number, y: number, z: number): boolean {
  if (!m.inBounds(x, y) || excluded(x, y, z)) return false;
  if (!m.isWalkable(x, y, z) || m.getObj(x, y, z) !== Obj.None || inHouse(m, x, y, z)) return false;
  return !m.linkAt(x, y, z);
}

/** Whether a solid object may stand here without cutting a passage (same rule as the ore rocks). */
function canPlaceSolid(m: WorldMap, x: number, y: number, z: number, used: Set<number>): boolean {
  if (!isOpen(m, x, y, z) || used.has(tileKey(x, y, z))) return false;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (m.linkAt(x + dx, y + dy, z)) return false;
  if (m.npcs.some((n) => n.z === z && Math.abs(n.x - x) <= 1 && Math.abs(n.y - y) <= 1)) return false;
  if (m.chests.some((c) => c.z === z && Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1)) return false;
  const open = RING.map(([dx, dy]) => m.isWalkable(x + dx, y + dy, z) && !used.has(tileKey(x + dx, y + dy, z)));
  let runs = 0;
  for (let i = 0; i < 8; i++) if (open[i] && !open[(i + 7) % 8]) runs++;
  if (runs === 0) return open.every(Boolean);
  return runs === 1 && open.filter(Boolean).length >= 5;
}

/**
 * A tile in the open (an NPC or stall there blocks nobody): every tile within two steps is free
 * ground outside houses, and nothing else of ours or any NPC stands within two tiles.
 */
function roomy(m: WorldMap, x: number, y: number, z: number, used: Set<number>): boolean {
  if (!isOpen(m, x, y, z) || used.has(tileKey(x, y, z))) return false;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (!dx && !dy) continue;
    if (!m.isWalkable(x + dx, y + dy, z) || used.has(tileKey(x + dx, y + dy, z))) return false;
    if (inHouse(m, x + dx, y + dy, z) || m.linkAt(x + dx, y + dy, z)) return false;
  }
  if (m.npcs.some((n) => n.z === z && Math.abs(n.x - x) <= 2 && Math.abs(n.y - y) <= 2)) return false;
  return true;
}

function regionNamed(m: WorldMap, name: string): Region | null {
  return m.regions.find((r) => r.name === name) ?? null;
}

/** The first number of a region's level label ("15+", "15–35"), or null. */
function regionLevel(r: Region | null): number | null {
  const n = r ? /\d+/.exec(r.level ?? '') : null;
  return n ? Number(n[0]) : null;
}

/** Tiles in a square spiral around (cx, cy), nearest first. */
function* spiral(cx: number, cy: number, radius: number): Generator<[number, number]> {
  yield [cx, cy];
  for (let r = 1; r <= radius; r++) {
    for (let i = -r; i < r; i++) yield [cx + i, cy - r];
    for (let i = -r; i < r; i++) yield [cx + r, cy + i];
    for (let i = r; i > -r; i--) yield [cx + i, cy + r];
    for (let i = r; i > -r; i--) yield [cx - r, cy + i];
  }
}

// ================================================================== agility shortcuts

type Barrier = 'water' | 'cliff' | 'rock' | null;

function barrierAt(m: WorldMap, x: number, y: number, z: number): Barrier {
  if (!m.inBounds(x, y) || excluded(x, y, z)) return null;
  const g = m.getGround(x, y, z);
  const o = m.getObj(x, y, z);
  if (z === 0 && g === Ground.Water && o === Obj.None) return 'water';
  if (z >= 0 && o === Obj.Cliff && g !== Ground.Water && g !== Ground.DeepWater && g !== Ground.Void) return 'cliff';
  if (z < 0 && g === Ground.Void) return 'rock';
  return null;
}

const MAX_RUN: Record<Exclude<Barrier, null>, number> = { water: 6, cliff: 3, rock: 2 };

function kindFor(b: Exclude<Barrier, null>, len: number): ObstacleKind {
  if (b === 'water') return len <= 3 ? 'balance' : 'swim';
  return b === 'cliff' ? 'climb' : 'squeeze';
}

/** Walkable tiles (1) and building structure (2) of one floor, read once for the searches. */
function walkMask(m: WorldMap, z: number): Uint8Array {
  const f = m.floor(z)!;
  const n = m.width * m.height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = f.obj[i];
    if (STRUCTURE_OBJ[o]) out[i] = 2;
    else if (!UNWALKABLE_GROUND[f.ground[i]] && !SOLID_OBJ[o]) out[i] = 1;
  }
  return out;
}

/** Breadth-first walking distance from A to B on one floor, inside a window; −1 when not found (same diagonal rule as WorldMap.canStep). */
function walkDistance(W: number, H: number, mask: Uint8Array, ax: number, ay: number, bx: number, by: number, limit: number, buf: { seen: Int32Array; q: Int32Array; d: Int16Array; stamp: number }): number {
  const stamp = ++buf.stamp;
  let head = 0, tail = 0;
  const start = ay * W + ax;
  buf.q[tail++] = start;
  buf.seen[start] = stamp;
  buf.d[start] = 0;
  const target = by * W + bx;
  const x0 = Math.max(1, ax - 40), x1 = Math.min(W - 2, ax + 40), y0 = Math.max(1, ay - 40), y1 = Math.min(H - 2, ay + 40);
  while (head < tail) {
    const c = buf.q[head++];
    const cd = buf.d[c];
    if (c === target) return cd;
    if (cd >= limit) continue;
    const cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of RING) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
      const n = ny * W + nx;
      if (buf.seen[n] === stamp || mask[n] !== 1) continue;
      if (dx && dy) {
        const a = mask[cy * W + nx], b = mask[ny * W + cx];
        if (a !== 1 && b !== 1 && (a === 2 || b === 2)) continue;
      }
      buf.seen[n] = stamp;
      buf.d[n] = cd + 1;
      buf.q[tail++] = n;
    }
  }
  return -1;
}

function placeObstacles(m: WorldMap, l: TradeLayout): void {
  const W = m.width, H = m.height;
  const buf = { seen: new Int32Array(W * H), q: new Int32Array(W * H), d: new Int16Array(W * H), stamp: 0 };
  interface Cand { x: number; y: number; z: number; dx: number; dy: number; len: number; kind: ObstacleKind; k: number }
  const best = new Map<string, Cand>();
  const end = (x: number, y: number, z: number) => isOpen(m, x, y, z) && !m.isSafe(x, y, z);
  const masks = new Map<number, Uint8Array>();
  const tScan = performance.now();
  for (const z of [0, -1, -2, -3]) {
    const f = m.floor(z);
    if (!f) continue;
    const gr = f.ground, ob = f.obj;
    const wm = walkMask(m, z);
    masks.set(z, wm);
    // cheap tests on the raw layers first; the full checks only where a barrier starts
    const quick = (i: number): Barrier => {
      const g = gr[i];
      if (z === 0 && g === Ground.Water) return ob[i] === Obj.None ? 'water' : null;
      if (z >= 0 && ob[i] === Obj.Cliff) return g !== Ground.Water && g !== Ground.DeepWater && g !== Ground.Void ? 'cliff' : null;
      if (z < 0 && g === Ground.Void) return 'rock';
      return null;
    };
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const i = y * W + x;
        if (wm[i] !== 1 || ob[i] !== Obj.None) continue;
        for (let dir = 0; dir < 2; dir++) {
          const dx = dir === 0 ? 1 : 0, dy = dir === 0 ? 0 : 1;
          const b = quick(i + dx + dy * W);
          if (!b) continue;
          let len = 1;
          while (len <= MAX_RUN[b] && x + dx * (len + 1) < W && y + dy * (len + 1) < H && quick(i + (dx + dy * W) * (len + 1)) === b) len++;
          if (len > MAX_RUN[b]) continue;
          const bx = x + dx * (len + 1), by = y + dy * (len + 1);
          if (wm[by * W + bx] !== 1 || !end(x, y, z) || !end(bx, by, z) || barrierAt(m, x + dx, y + dy, z) !== b) continue;
          const kind = kindFor(b, len);
          const cell = `${z}:${Math.floor(x / 12)}:${Math.floor(y / 12)}:${kind}`;
          const k = len + (kind === 'balance' && len === 1 ? 2 : 0);
          const prev = best.get(cell);
          if (!prev || k < prev.k) best.set(cell, { x, y, z, dx, dy, len, kind, k });
        }
      }
    }
  }
  const prof = (globalThis as { __GEN_PROFILE?: boolean }).__GEN_PROFILE;
  if (prof) console.log('  trades candidates', best.size, 'scan ms', Math.round(performance.now() - tScan));
  const scored: Array<Cand & { saves: number }> = [];
  for (const c of best.values()) {
    const bx = c.x + c.dx * (c.len + 1), by = c.y + c.dy * (c.len + 1);
    let mask = masks.get(c.z);
    if (!mask) masks.set(c.z, (mask = walkMask(m, c.z)));
    const d = walkDistance(W, H, mask, c.x, c.y, bx, by, 110, buf);
    const saves = d < 0 ? 160 : d;
    if (saves < Math.max(16, c.len * 5)) continue;
    scored.push({ ...c, saves });
  }
  scored.sort((a, b) => b.saves - a.saves || a.z - b.z || a.y - b.y || a.x - b.x);
  const caps = new Map<number, number>([[0, 80], [-1, 16], [-2, 10], [-3, 6]]);
  const kindCap: Record<ObstacleKind, number> = { balance: 32, swim: 18, climb: 32, squeeze: 30 };
  const taken: Obstacle[] = [];
  const near = (x: number, y: number, z: number) => taken.some((o) => o.z === z && (Math.max(Math.abs(o.ax - x), Math.abs(o.ay - y)) < 12 || Math.max(Math.abs(o.bx - x), Math.abs(o.by - y)) < 12));
  for (const c of scored) {
    if ((caps.get(c.z) ?? 0) <= 0 || kindCap[c.kind] <= 0) continue;
    const bx = c.x + c.dx * (c.len + 1), by = c.y + c.dy * (c.len + 1);
    if (near(c.x, c.y, c.z) || near(bx, by, c.z)) continue;
    // the harder side decides (a beginner meadow on one bank, a dragon plateau on the other)
    const ra = m.regionAt(c.x, c.y, c.z), rb = m.regionAt(bx, by, c.z);
    const r = ra ?? rb;
    const la = regionLevel(ra), lb = regionLevel(rb);
    let area = la === null ? lb : lb === null ? la : Math.max(la, lb);
    if (area === null) {
      // outside named regions: by the distance from Thornvale (the further, the wilder)
      const d = Math.hypot(c.x - 204, c.y - 312);
      area = Math.min(60, Math.round(d / 7));
    }
    const lvl = Math.max(1, Math.min(85, Math.round((area * 0.8 + OBSTACLE_KINDS[c.kind].levelOffset) / 5) * 5));
    taken.push({
      id: taken.length, kind: c.kind, level: lvl, xp: obstacleXp(lvl, c.len), z: c.z, ax: c.x, ay: c.y, bx, by, dx: c.dx, dy: c.dy, len: c.len,
      saves: c.saves, area: r?.name ?? '',
    });
    caps.set(c.z, (caps.get(c.z) ?? 0) - 1);
    kindCap[c.kind]--;
  }
  l.obstacles.push(...taken);
}

// ================================================================== thieving

const TOWN_STALLS: Record<string, StallKind[]> = {
  thornvale: ['bakery', 'fruit'], westmarch: ['bakery', 'silk', 'fur'], elderglen: ['fruit', 'silk'], stonedeep: ['gem', 'silver'],
  highmoor: ['bakery', 'fur'], millbrook: ['fruit', 'bakery', 'fish'], valdrheim: ['fur', 'fish'], aurelion: ['silk', 'silver', 'gem'],
  briarwatch: ['fur', 'fruit'], corvane: ['fish', 'spice'], saltmere: ['fish', 'spice'], palmreach: ['fruit', 'spice'],
  sunspire: ['spice', 'silk', 'gem'], dunewatch: ['spice', 'silver'],
};

const PAVED = new Set<number>([Ground.Path, Ground.Stone, Ground.Marble, Ground.Wood, Ground.Sand, Ground.Dirt]);

/** Where a town's people stand: its rough centre on the surface (Stonedeep's halls are a floor up). */
function townCentre(m: WorldMap, key: string): { x: number; y: number; z: number } | null {
  const t = TOWNS.find((x) => x.key === key);
  if (!t) return null;
  const r = regionNamed(m, t.name);
  const z = r && r.z0 <= 0 && r.z1 >= 0 ? 0 : r?.z0 ?? 0;
  return { x: t.x, y: t.y, z };
}

/**
 * The Thornvale spawn plaza keeps its own look: nothing of ours on the old small plaza; on the grand
 * plaza (world/grandCity.ts) only out on the paved ring, well clear of the great fountain.
 */
function onPlaza(m: WorldMap, x: number, y: number, z: number): boolean {
  const p = m.plaza;
  if (!p || z !== 0 || x < p.x0 - 2 || x > p.x1 + 2 || y < p.y0 - 2 || y > p.y1 + 2) return false;
  if (!p.grand) return true;
  return Math.hypot(x + 0.5 - p.cx, y + 0.5 - p.cy) < p.grand.r + 4;
}

function placeTownFolk(m: WorldMap, l: TradeLayout, used: Set<number>): void {
  // people first (they need the most room), then stalls a little way out
  for (const n of TRADE_NPCS) {
    const c = townCentre(m, n.town);
    if (!c) continue;
    for (const [x, y] of spiral(c.x, c.y, 24)) {
      if (onPlaza(m, x, y, c.z) || !roomy(m, x, y, c.z, used)) continue;
      if (l.stalls.some((s) => s.z === c.z && Math.abs(s.x - x) <= 2 && Math.abs(s.y - y) <= 2)) continue;
      m.npcs.push({ key: n.def.key, x, y, z: c.z });
      used.add(tileKey(x, y, c.z));
      break;
    }
  }
  for (const [town, kinds] of Object.entries(TOWN_STALLS)) {
    const c = townCentre(m, town);
    if (!c) continue;
    const t = TOWNS.find((x) => x.key === town)!;
    let i = 0;
    for (const [x, y] of spiral(c.x, c.y, 22)) {
      if (i >= kinds.length) break;
      if (Math.max(Math.abs(x - c.x), Math.abs(y - c.y)) < 3) continue;
      if (onPlaza(m, x, y, c.z) || !PAVED.has(m.getGround(x, y, c.z)) || !roomy(m, x, y, c.z, used)) continue;
      if (l.stalls.some((s) => s.z === c.z && Math.abs(s.x - x) <= 3 && Math.abs(s.y - y) <= 3)) continue;
      l.stalls.push({ x, y, z: c.z, kind: kinds[i++], town: t.name });
      m.setObj(x, y, Obj.TradeStall, c.z);
      used.add(tileKey(x, y, c.z));
    }
  }
}

/** Bandit camps, smugglers' caves and ruins with a strongbox or three, and the thieving level their locks ask. */
const BOX_AREAS: Array<[string, number, number]> = [
  ['Bandit Hollow', 5, 3], ['Blackroot Camp', 12, 2], ["Smugglers' Cove", 18, 3], ['Grimtusk Fortress', 25, 3], ['Ruins of Varkh', 32, 3],
  ['Dune Raider Camp', 40, 3], ['Temple of the Sunken Eye', 48, 2], ['Lizard Temple', 56, 2], ['Pyramid of Kesh', 64, 3], ['Emberhold', 72, 2],
  ['Valley of Tombs', 80, 2],
];

function placeBoxes(m: WorldMap, l: TradeLayout, used: Set<number>, rng: Rng): void {
  for (const [name, level, count] of BOX_AREAS) {
    const r = regionNamed(m, name);
    if (!r) continue;
    let n = 0;
    for (let z = r.z1; z >= r.z0 && n < count; z--) {
      if (!m.floors.has(z)) continue;
      const cand: Array<[number, number, number]> = [];
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (isOpen(m, x, y, z) && !m.isSafe(x, y, z)) cand.push([x, y, rng.next()]);
      cand.sort((a, b) => a[2] - b[2]);
      for (const [x, y] of cand) {
        if (n >= count) break;
        if (l.boxes.some((b) => b.z === z && Math.abs(b.x - x) < 6 && Math.abs(b.y - y) < 6)) continue;
        if (!canPlaceSolid(m, x, y, z, used)) continue;
        l.boxes.push({ x, y, z, level, area: name });
        m.setObj(x, y, Obj.StrongBox, z);
        used.add(tileKey(x, y, z));
        n++;
      }
    }
  }
}

// ================================================================== herbs

const WILD = new Set<number>([Ground.Grass, Ground.DarkGrass, Ground.Dirt, Ground.Sand, Ground.Snow, Ground.Jungle, Ground.Swamp, Ground.Ash, Ground.Crop]);

function placeHerbs(m: WorldMap, l: TradeLayout, used: Set<number>, rng: Rng): void {
  for (const h of HERBS) {
    for (const name of h.regions) {
      const r = regionNamed(m, name);
      if (!r || r.z0 > 0 || r.z1 < 0) continue;
      const area = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
      const clusters = area > 3000 ? 3 : 2;
      let made = 0;
      for (let tries = 0; tries < 400 && made < clusters; tries++) {
        const cx = r.x0 + Math.floor(rng.next() * (r.x1 - r.x0 + 1));
        const cy = r.y0 + Math.floor(rng.next() * (r.y1 - r.y0 + 1));
        if (!isOpen(m, cx, cy, 0) || m.isSafe(cx, cy, 0) || !WILD.has(m.getGround(cx, cy, 0)) || used.has(tileKey(cx, cy, 0))) continue;
        if (l.herbs.some((o) => Math.abs(o.x - cx) < 9 && Math.abs(o.y - cy) < 9)) continue;
        let put = 0;
        for (const [x, y] of spiral(cx, cy, 2)) {
          if (put >= 4) break;
          if (!isOpen(m, x, y, 0) || m.isSafe(x, y, 0) || !WILD.has(m.getGround(x, y, 0)) || used.has(tileKey(x, y, 0))) continue;
          if (rng.next() < 0.35 && put > 0) continue;
          l.herbs.push({ x, y, z: 0, herb: h.id });
          m.setObj(x, y, Obj.WildHerbs, 0);
          used.add(tileKey(x, y, 0));
          put++;
        }
        if (put) {
          made++;
          l.spots.push({ skill: 'herblore', x: cx, y: cy, z: 0, label: `${h.name} · herblore ${h.level}` });
        }
      }
    }
  }
}

// ================================================================== map spots

function addSpots(l: TradeLayout): void {
  const names: Record<ObstacleKind, string> = { balance: 'Balance log', climb: 'Climbing rocks', swim: 'Swim', squeeze: 'Narrow crack' };
  for (const o of l.obstacles) l.spots.push({ skill: 'agility', x: o.ax + o.dx * Math.floor((o.len + 1) / 2), y: o.ay + o.dy * Math.floor((o.len + 1) / 2), z: o.z, label: `${names[o.kind]} · agility ${o.level}` });
  const towns = new Map<string, { x: number; y: number; z: number; lo: number; hi: number }>();
  for (const s of l.stalls) {
    const lv = STALLS[s.kind].level;
    const t = towns.get(s.town);
    if (!t) towns.set(s.town, { x: s.x, y: s.y, z: s.z, lo: lv, hi: lv });
    else { t.lo = Math.min(t.lo, lv); t.hi = Math.max(t.hi, lv); }
  }
  for (const [town, t] of towns) l.spots.push({ skill: 'thieving', x: t.x, y: t.y, z: t.z, label: `Market stalls of ${town} · thieving ${t.lo === t.hi ? t.lo : `${t.lo}–${t.hi}`}` });
  const areas = new Map<string, { x: number; y: number; z: number; level: number }>();
  for (const b of l.boxes) if (!areas.has(b.area)) areas.set(b.area, { x: b.x, y: b.y, z: b.z, level: b.level });
  for (const [area, a] of areas) l.spots.push({ skill: 'thieving', x: a.x, y: a.y, z: a.z, label: `Strongboxes · ${area} · thieving ${a.level}` });
}

/** Builds `m.trades` (the last step of world generation). */
export function buildTradeSpots(m: WorldMap): void {
  const l = emptyTradeLayout();
  const rng = new Rng(0x7ade5);
  const used = new Set<number>();
  const T = (globalThis as { __GEN_PROFILE?: boolean }).__GEN_PROFILE ? (n: string) => console.log('  trades', n, Math.round(performance.now() - t0)) : () => {};
  const t0 = performance.now();
  placeObstacles(m, l);
  T('obstacles');
  // keep the shortcuts' ends and handles clear of everything else
  for (const o of l.obstacles) for (let i = 0; i <= o.len + 1; i++) used.add(tileKey(o.ax + o.dx * i, o.ay + o.dy * i, o.z));
  placeTownFolk(m, l, used);
  T('town folk');
  placeBoxes(m, l, used, rng);
  T('boxes');
  placeHerbs(m, l, used, rng);
  T('herbs');
  addSpots(l);
  indexTradeLayout(l);
  m.trades = l;
}

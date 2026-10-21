import { Gen, DIR_V, type Dir } from './genKit';
import type { TownInfo } from './townList';
import { Ground, Obj, type Region } from './WorldMap';

export interface TownSpec {
  info: TownInfo;
  x0: number;
  y0: number;
  w: number;
  h: number;
  ground: Ground | ((x: number, y: number) => Ground);
  street?: Ground;
  plaza: Ground;
  wall?: Obj;
  /** Wall object used by houses (Obj.Wall with stone=true gives tinted brick). */
  stone?: boolean;
  roofs: number[];
  walls: number[];
  dock?: Dir;
  /** Coast tile to start the pier from instead of walking out of the gate. */
  dockFrom?: { x: number; y: number };
  fillers?: number;
  /** Runs after the core buildings, before filler houses. */
  extras?: (t: TownCtx) => void;
  /** Lowest/highest floor covered by the protection zone. */
  z0?: number;
  z1?: number;
}

/** Layout state of a town while it is being built. */
export class TownCtx {
  readonly cx: number;
  readonly cy: number;
  readonly x1: number;
  readonly y1: number;
  /** 0 free, 1 street, 2 margin around a building, 3 building. */
  readonly occ: Uint8Array;
  temple = { x: 0, y: 0, z: 0 };
  gates: Record<Dir, { x: number; y: number }>;
  dest: { x: number; y: number; z: number } | null = null;
  harbour: Region | null = null;

  constructor(readonly g: Gen, readonly s: TownSpec) {
    this.cx = s.x0 + (s.w >> 1);
    this.cy = s.y0 + (s.h >> 1);
    this.x1 = s.x0 + s.w - 1;
    this.y1 = s.y0 + s.h - 1;
    this.occ = new Uint8Array(s.w * s.h);
    this.gates = {
      N: { x: this.cx, y: s.y0 - 1 }, S: { x: this.cx, y: this.y1 + 1 },
      W: { x: s.x0 - 1, y: this.cy }, E: { x: this.x1 + 1, y: this.cy },
    };
  }

  inside(x: number, y: number): boolean {
    return x >= this.s.x0 && y >= this.s.y0 && x <= this.x1 && y <= this.y1;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? this.occ[(y - this.s.y0) * this.s.w + (x - this.s.x0)] : 2;
  }

  set(x0: number, y0: number, x1: number, y1: number, v: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (this.inside(x, y)) this.occ[(y - this.s.y0) * this.s.w + (x - this.s.x0)] = v;
    }
  }

  street(x0: number, y0: number, x1: number, y1: number, g?: Ground): void {
    const gr = g ?? this.s.street ?? Ground.Path;
    this.g.b.rect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), (x, y) => {
      if (!this.inside(x, y) || this.get(x, y) === 3) return;
      const cur = this.g.m.getGround(x, y);
      if (cur !== Ground.Marble && cur !== Ground.Stone) this.g.m.setGround(x, y, gr);
      if (this.g.m.getObj(x, y) !== Obj.Door) this.g.m.setObj(x, y, Obj.None);
      this.occ[(y - this.s.y0) * this.s.w + (x - this.s.x0)] = 1;
    });
  }

  /** A building that also blocks the layout grid (with a one-tile margin). */
  house(x: number, y: number, w: number, h: number, doors: Array<[number, number]>, name: string, opts: { stone?: boolean; noRoof?: boolean; roof?: number; wall?: number; floor?: Ground; wallObj?: Obj } = {}): void {
    const s = this.s, rng = this.g.rng;
    this.g.b.building(x, y, w, h, {
      doors, name, stone: opts.stone ?? s.stone, noRoof: opts.noRoof, floor: opts.floor ?? (opts.stone ?? s.stone ? Ground.Stone : Ground.Wood),
      roof: opts.roof ?? rng.pick(s.roofs), wallColor: opts.wall ?? rng.pick(s.walls), wall: opts.wallObj ?? Obj.Wall,
    });
    this.reserve(x, y, w, h);
  }

  reserve(x: number, y: number, w: number, h: number): void {
    for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) {
      if (this.get(xx, yy) === 0) this.set(xx, yy, xx, yy, 2);
    }
    this.set(x, y, x + w - 1, y + h - 1, 3);
  }

  /** Joins a door to the nearest street with a short path (4-neighbour BFS through free tiles). */
  connect(fromX: number, fromY: number, maxLen = 40): boolean {
    if (this.get(fromX, fromY) === 1) return true;
    const s = this.s;
    const W = s.w;
    const prev = new Int32Array(s.w * s.h).fill(-2);
    const sx = fromX - s.x0, sy = fromY - s.y0;
    if (sx < 0 || sy < 0 || sx >= s.w || sy >= s.h) return false;
    const q = [sy * W + sx];
    prev[q[0]] = -1;
    let hit = -1;
    for (let qi = 0; qi < q.length && hit < 0; qi++) {
      const c = q[qi];
      const x = c % W, y = (c - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
        const ni = ny * W + nx;
        if (prev[ni] !== -2) continue;
        const v = this.occ[ni];
        const wx = nx + s.x0, wy = ny + s.y0;
        if (v === 1) { prev[ni] = c; hit = ni; break; }
        if (v === 3) continue;
        const o = this.g.m.getObj(wx, wy);
        if (o === Obj.Wall || o === Obj.StoneWall || o === Obj.Palisade || o === Obj.SandWall) continue;
        prev[ni] = c;
        q.push(ni);
      }
      if (q.length > maxLen * maxLen * 2) break;
    }
    if (hit < 0) return false;
    let len = 0;
    for (let c = prev[hit]; c !== -1; c = prev[c]) len++;
    if (len > maxLen) return false;
    for (let c = prev[hit]; c !== -1; c = prev[c]) {
      const x = (c % W) + s.x0, y = Math.floor(c / W) + s.y0;
      this.street(x, y, x, y);
    }
    return true;
  }
}

/** Builds a complete town: walls, streets, plaza, temple, depot & bank, shops, homes and a harbour. */
export function buildTown(g: Gen, s: TownSpec): TownCtx {
  const t = new TownCtx(g, s);
  const { b, m, rng } = g;
  const { cx, cy, x1, y1 } = t;
  const st = s.info.staff;
  g.clearTo(s.x0, s.y0, x1, y1, s.ground);
  g.protect(s.x0 - 2, s.y0 - 2, x1 + 2, y1 + 2);

  // walls with four gates
  if (s.wall) {
    b.outline(s.x0, s.y0, x1, y1, s.wall);
    t.set(s.x0, s.y0, x1, s.y0, 2); t.set(s.x0, y1, x1, y1, 2); t.set(s.x0, s.y0, s.x0, y1, 2); t.set(x1, s.y0, x1, y1, 2);
    for (const [gx, gy] of [[cx, s.y0], [cx + 1, s.y0], [cx, y1], [cx + 1, y1], [s.x0, cy], [s.x0, cy + 1], [x1, cy], [x1, cy + 1]]) {
      m.setObj(gx, gy, Obj.None);
      t.set(gx, gy, gx, gy, 0);
    }
    // gate towers
    for (const [gx, gy] of [[cx - 1, s.y0], [cx + 2, s.y0], [cx - 1, y1], [cx + 2, y1], [s.x0, cy - 1], [s.x0, cy + 2], [x1, cy - 1], [x1, cy + 2]]) m.setObj(gx, gy, Obj.Pillar);
  }

  // main streets and the plaza
  t.street(s.x0, cy, x1, cy + 1);
  t.street(cx, s.y0, cx + 1, y1);
  b.rect(cx - 6, cy - 3, cx + 7, cy + 4, (x, y) => m.setGround(x, y, s.plaza));
  t.street(cx - 6, cy - 3, cx + 7, cy + 4, s.plaza);
  for (const [lx, ly] of [[cx - 6, cy - 3], [cx + 7, cy - 3], [cx - 6, cy + 4], [cx + 7, cy + 4]]) m.setObj(lx, ly, Obj.Lamp);
  m.setObj(cx - 3, cy + 3, Obj.Well);

  // temple
  t.house(cx - 10, cy - 10, 9, 7, [[cx - 6, cy - 4]], `${s.info.name} Temple`, { stone: true, roof: 0x6a5a8a, wall: 0xe8e2d4, floor: Ground.Marble });
  m.setObj(cx - 6, cy - 9, Obj.Altar);
  m.setObj(cx - 8, cy - 7, Obj.Pillar);
  m.setObj(cx - 4, cy - 7, Obj.Pillar);
  m.setObj(cx - 9, cy - 9, Obj.Torch);
  m.setObj(cx - 3, cy - 9, Obj.Torch);
  t.temple = { x: cx - 6, y: cy - 6, z: 0 };

  // depot & bank with a second storey of lockers
  t.house(cx + 3, cy - 10, 9, 7, [[cx + 7, cy - 4]], `${s.info.name} Depot & Bank`, { stone: true, noRoof: true, roof: 0x8e4a2e, wall: 0xd8ccb0 });
  b.building(cx + 3, cy - 10, 9, 7, { z: 1, name: `${s.info.name} Depot Loft`, stone: true, floor: Ground.Wood, roof: 0x8e4a2e, wallColor: 0xd8ccb0, wall: Obj.Wall });
  // one locker every second tile, so each player has a free spot in front of and beside their locker
  for (let x = cx + 4; x <= cx + 10; x += 2) { m.setObj(x, cy - 9, Obj.Locker, 0); m.setObj(x, cy - 9, Obj.Locker, 1); }
  b.stairs({ x: cx + 10, y: cy - 7, z: 0 }, { x: cx + 10, y: cy - 7, z: 1 }, [-1, 0], [-1, 0]);
  m.setObj(cx + 4, cy - 6, Obj.Counter);
  b.npc(st.bank.key, cx + 5, cy - 7);

  // shops
  t.house(cx - 9, cy + 5, 8, 6, [[cx - 6, cy + 5]], `${st.smith.name}'s Smithy`, { roof: 0x5a6e8c });
  m.setObj(cx - 8, cy + 9, Obj.Barrel);
  m.setObj(cx - 3, cy + 9, Obj.Crate);
  b.npc(st.smith.key, cx - 4, cy + 7);
  t.house(cx + 3, cy + 5, 8, 6, [[cx + 7, cy + 5]], `${st.mage.name}'s Magic Shop`, { roof: 0x6a3a7a });
  m.setObj(cx + 9, cy + 9, Obj.Crate);
  m.setObj(cx + 4, cy + 9, Obj.Table);
  b.npc(st.mage.key, cx + 5, cy + 7);
  t.house(cx - 18, cy - 8, 8, 6, [[cx - 15, cy - 3]], `${st.outfit.name}'s Outfitters`, { roof: 0x3f6b4a });
  m.setObj(cx - 17, cy - 7, Obj.Barrel);
  b.npc(st.outfit.key, cx - 13, cy - 6);
  t.street(cx - 15, cy - 2, cx - 15, cy - 1);
  t.house(cx + 12, cy - 8, 8, 6, [[cx + 15, cy - 3]], `${s.info.name} Hall`, { roof: 0x8e3b2e });
  m.setObj(cx + 18, cy - 7, Obj.Table);
  if (st.quest) b.npc(st.quest.key, cx + 14, cy - 6);
  if (st.trainer) b.npc(st.trainer.key, cx + 17, cy - 5);
  t.street(cx + 15, cy - 2, cx + 15, cy - 1);

  s.extras?.(t);

  // filler homes
  const want = s.fillers ?? Math.floor((s.w * s.h) / 140);
  let built = 0;
  for (let tries = 0; tries < want * 30 && built < want; tries++) {
    const w = rng.int(5, 8), h = rng.int(5, 7);
    const x = rng.int(s.x0 + 2, x1 - 1 - w), y = rng.int(s.y0 + 2, y1 - 1 - h);
    let ok = true;
    for (let yy = y - 1; yy <= y + h && ok; yy++) for (let xx = x - 1; xx <= x + w; xx++) {
      if (t.get(xx, yy) !== 0) { ok = false; break; }
    }
    if (!ok) continue;
    // door on the side facing the nearest main street
    const hx = x + w / 2, hy = y + h / 2;
    const doorX = x + (w >> 1), doorY = y + (h >> 1);
    const vert: Array<[number, number, number, number]> = hy < cy ? [[doorX, y + h - 1, 0, 1], [doorX, y, 0, -1]] : [[doorX, y, 0, -1], [doorX, y + h - 1, 0, 1]];
    const horiz: Array<[number, number, number, number]> = hx < cx ? [[x + w - 1, doorY, 1, 0], [x, doorY, -1, 0]] : [[x, doorY, -1, 0], [x + w - 1, doorY, 1, 0]];
    const sides = Math.abs(hy - cy) < Math.abs(hx - cx) ? [...vert, ...horiz] : [...horiz, ...vert];
    const saved = t.occ.slice();
    t.reserve(x, y, w, h);
    let door: [number, number, number, number] | null = null;
    for (const sd of sides) {
      if (t.connect(sd[0] + sd[2], sd[1] + sd[3], 30)) { door = sd; break; }
    }
    if (!door) {
      t.occ.set(saved);
      continue;
    }
    t.house(x, y, w, h, [[door[0], door[1]]], `${s.info.name} Home`);
    t.street(door[0] + door[2], door[1] + door[3], door[0] + door[2], door[1] + door[3]);
    const fx = door[2] < 0 ? x + w - 2 : x + 1, fy = door[3] < 0 ? y + h - 2 : y + 1;
    if (rng.chance(0.6) && !(fx === door[0] - door[2] && fy === door[1] - door[3])) m.setObj(fx, fy, rng.pick([Obj.Barrel, Obj.Table, Obj.Crate]));
    built++;
  }

  // flowers and lamps
  b.rect(s.x0 + 1, s.y0 + 1, x1 - 1, y1 - 1, (x, y) => {
    if (t.get(x, y) !== 0 || m.getObj(x, y) !== Obj.None) return;
    if (rng.chance(0.05)) m.setObj(x, y, Obj.Flowers);
  });
  for (let x = s.x0 + 4; x < x1 - 3; x += 9) if (t.get(x, cy - 1) === 0 && m.getObj(x, cy - 1) === Obj.None) m.setObj(x, cy - 1, Obj.Lamp);
  for (let y = s.y0 + 4; y < y1 - 3; y += 9) if (t.get(cx - 1, y) === 0 && m.getObj(cx - 1, y) === Obj.None) m.setObj(cx - 1, y, Obj.Lamp);

  // harbour
  if (s.dock) {
    const gate = t.gates[s.dock];
    const from = s.dockFrom ?? gate;
    if (s.dockFrom) g.route(gate.x, gate.y, from.x, from.y, { maxNodes: 60000 });
    const p = g.pier(from.x, from.y, s.dock);
    b.npc(st.travel.key, p.npc.x, p.npc.y);
    m.destinations[s.info.key] = p.dest;
    t.dest = p.dest;
    g.protect(p.region[0], p.region[1], p.region[2], p.region[3]);
    t.harbour = { name: `${s.info.name} Harbour`, x0: p.region[0], y0: p.region[1], x1: p.region[2], y1: p.region[3], z0: 0, z1: 0, level: '—', safe: true };
  } else {
    // inland: the carter waits at the east gate
    const gx = t.gates.E.x + 2, gy = t.gates.E.y;
    g.clearTo(gx - 1, gy - 2, gx + 3, gy + 3, Ground.Stone);
    b.npc(st.travel.key, gx + 1, gy - 1);
    m.setObj(gx + 2, gy + 2, Obj.Crate);
    m.destinations[s.info.key] = { x: gx, y: gy + 1, z: 0 };
    t.dest = m.destinations[s.info.key];
  }
  return t;
}

/** Protection zone and temple for a town; called last so it wins over the surrounding hunting regions. */
export function townRegion(g: Gen, t: TownCtx): void {
  const s = t.s;
  g.b.region({ name: s.info.name, x0: s.x0, y0: s.y0, x1: t.x1, y1: t.y1, level: '—', safe: true, temple: t.temple, z0: s.z0 ?? 0, z1: s.z1 ?? 2 });
}

export { DIR_V };

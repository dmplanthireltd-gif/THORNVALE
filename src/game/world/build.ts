import { Rng } from '../core/rng';
import { DIRS8 } from '../core/types';
import { Ground, Obj, WorldMap, type EnemyKind, type Region } from './WorldMap';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** Map-authoring helpers shared by every region generator. */
export class Builder {
  constructor(readonly m: WorldMap, readonly rng: Rng) {}

  g(x: number, y: number, g: Ground, z = 0): void {
    this.m.setGround(x, y, g, z);
  }

  o(x: number, y: number, o: Obj, z = 0): void {
    this.m.setObj(x, y, o, z);
  }

  rect(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void): void {
    for (let y = Math.max(0, y0); y <= Math.min(this.m.height - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.m.width - 1, x1); x++) fn(x, y);
    }
  }

  fill(x0: number, y0: number, x1: number, y1: number, g: Ground, z = 0, obj: Obj | null = Obj.None): void {
    this.rect(x0, y0, x1, y1, (x, y) => {
      this.g(x, y, g, z);
      if (obj !== null) this.o(x, y, obj, z);
    });
  }

  clear(x0: number, y0: number, x1: number, y1: number, z = 0): void {
    this.rect(x0, y0, x1, y1, (x, y) => this.o(x, y, Obj.None, z));
  }

  /** Outline of a rectangle with an object (walls, fences, palisades). */
  outline(x0: number, y0: number, x1: number, y1: number, o: Obj, z = 0): void {
    this.rect(x0, y0, x1, y1, (x, y) => {
      if (x === x0 || y === y0 || x === x1 || y === y1) this.o(x, y, o, z);
    });
  }

  /** L-shaped road, horizontal first. Clears obstacles. */
  road(x0: number, y0: number, x1: number, y1: number, width = 2, g = Ground.Path, z = 0): void {
    const sx = Math.sign(x1 - x0) || 1;
    for (let x = x0; x !== x1 + sx; x += sx) {
      for (let w = 0; w < width; w++) this.pave(x, y0 + w, g, z);
    }
    const sy = Math.sign(y1 - y0) || 1;
    for (let y = y0; y !== y1 + sy; y += sy) {
      for (let w = 0; w < width; w++) this.pave(x1 + w, y, g, z);
    }
  }

  private pave(x: number, y: number, g: Ground, z: number): void {
    const cur = this.m.getGround(x, y, z);
    if (cur === Ground.Water || cur === Ground.DeepWater) this.g(x, y, Ground.Wood, z); // bridge
    else if (cur !== Ground.Stone && cur !== Ground.Marble && cur !== Ground.Wood) this.g(x, y, g, z);
    const o = this.m.getObj(x, y, z);
    if (o !== Obj.Door && o !== Obj.StairsUp && o !== Obj.StairsDown && o !== Obj.Ladder) this.o(x, y, Obj.None, z);
  }

  /** A walled building. Interior gets the floor ground; doors are gaps with door frames. */
  building(x: number, y: number, w: number, h: number, opts: {
    z?: number; doors?: Array<[number, number]>; floor?: Ground; wall?: Obj; roof?: number; wallColor?: number;
    name: string; stone?: boolean; noRoof?: boolean;
  }): void {
    const z = opts.z ?? 0;
    const wall = opts.wall ?? (opts.stone ? Obj.StoneWall : Obj.Wall);
    if (z === 0) this.clear(x - 1, y - 1, x + w, y + h, z);
    this.rect(x, y, x + w - 1, y + h - 1, (xx, yy) => {
      this.g(xx, yy, opts.floor ?? Ground.Wood, z);
      const border = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1;
      this.o(xx, yy, border ? wall : Obj.None, z);
    });
    for (const [dx, dy] of opts.doors ?? []) this.o(dx, dy, Obj.Door, z);
    this.m.houses.push({
      id: this.m.houses.length, x, y, w, h, z,
      roofColor: opts.roof ?? 0x8e3b2e, wallColor: opts.wallColor ?? (opts.stone ? 0x9a968e : 0xd4c7aa),
      name: opts.name, stone: opts.stone, noRoof: opts.noRoof,
    });
  }

  /** Stairs between two floors. Walking onto either end moves you to the arrival tile beside the other end. */
  stairs(lower: P3, upper: P3, arriveUp: [number, number], arriveDown: [number, number]): void {
    this.o(lower.x, lower.y, Obj.StairsUp, lower.z);
    this.o(upper.x, upper.y, Obj.StairsDown, upper.z);
    this.ensureFloor(upper.x, upper.y, upper.z);
    this.ensureFloor(lower.x, lower.y, lower.z);
    const up = { x: upper.x + arriveUp[0], y: upper.y + arriveUp[1], z: upper.z };
    const down = { x: lower.x + arriveDown[0], y: lower.y + arriveDown[1], z: lower.z };
    this.ensureFloor(up.x, up.y, up.z, true);
    this.ensureFloor(down.x, down.y, down.z, true);
    this.m.addLink(lower.x, lower.y, lower.z, 'walk', up);
    this.m.addLink(upper.x, upper.y, upper.z, 'walk', down);
  }

  /** Ladder on the lower floor (use it to climb) and a hatch on the floor above (walk in to climb down). */
  ladder(x: number, y: number, zLower: number, arrive: [number, number] = [0, 1]): void {
    this.o(x, y, Obj.Ladder, zLower);
    this.ensureFloor(x, y, zLower);
    this.o(x, y, Obj.Hole, zLower + 1);
    this.ensureFloor(x, y, zLower + 1);
    const up = { x: x + arrive[0], y: y + arrive[1], z: zLower + 1 };
    this.ensureFloor(up.x, up.y, up.z, true);
    this.m.addLink(x, y, zLower, 'use', up);
    this.m.addLink(x, y, zLower + 1, 'walk', { x, y, z: zLower });
  }

  /** A rope spot on the lower floor (needs a rope) under a hole in the floor above. */
  ropeSpot(x: number, y: number, zLower: number, arrive: [number, number] = [0, 1]): void {
    this.o(x, y, Obj.RopeSpot, zLower);
    this.ensureFloor(x, y, zLower);
    this.o(x, y, Obj.Hole, zLower + 1);
    this.ensureFloor(x, y, zLower + 1);
    const up = { x: x + arrive[0], y: y + arrive[1], z: zLower + 1 };
    this.ensureFloor(up.x, up.y, up.z, true);
    this.m.addLink(x, y, zLower, 'rope', up);
    this.m.addLink(x, y, zLower + 1, 'walk', { x, y, z: zLower });
  }

  /** Loose stones that a shovel opens into a hole down to the floor below. */
  digSpot(x: number, y: number, z: number): void {
    this.o(x, y, Obj.LooseStone, z);
    this.ensureFloor(x, y, z - 1, true);
    this.m.addLink(x, y, z, 'walk', { x, y, z: z - 1 });
  }

  private ensureFloor(x: number, y: number, z: number, clearObj = false): void {
    const g = this.m.getGround(x, y, z);
    if (g === Ground.Void || g === Ground.Water || g === Ground.DeepWater || g === Ground.Lava) this.g(x, y, z < 0 ? Ground.Cave : Ground.Stone, z);
    if (clearObj) this.o(x, y, Obj.None, z);
  }

  /** Organic cave: cellular automaton inside a box on floor z. */
  cave(x0: number, y0: number, x1: number, y1: number, z: number, open = 0.55, ground = Ground.Cave): void {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    let cells = new Uint8Array(w * h);
    for (let i = 0; i < cells.length; i++) cells[i] = this.rng.chance(open) ? 1 : 0;
    for (let iter = 0; iter < 4; iter++) {
      const next = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let n = 0;
        for (const [dx, dy] of DIRS8) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          n += cells[ny * w + nx];
        }
        next[y * w + x] = n >= 5 || (cells[y * w + x] && n >= 4) ? 1 : 0;
      }
      cells = next;
    }
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (cells[y * w + x]) this.fill(x0 + x, y0 + y, x0 + x, y0 + y, ground, z);
    }
  }

  /** Carves a straight-ish tunnel (2 wide) between two points on floor z. */
  tunnel(ax: number, ay: number, bx: number, by: number, z: number, ground = Ground.Cave, width = 2): void {
    let x = ax, y = ay;
    let guard = 2000;
    while ((x !== bx || y !== by) && guard-- > 0) {
      for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) {
        if (this.m.getGround(x + dx, y + dy, z) === Ground.Void || this.m.getGround(x + dx, y + dy, z) !== ground) {
          const g = this.m.getGround(x + dx, y + dy, z);
          if (g === Ground.Void || g === Ground.Lava) this.g(x + dx, y + dy, ground, z);
        }
        const o = this.m.getObj(x + dx, y + dy, z);
        if (o === Obj.Stalagmite || o === Obj.Rock) this.o(x + dx, y + dy, Obj.None, z);
      }
      if (x !== bx && (y === by || this.rng.chance(0.6))) x += Math.sign(bx - x);
      else if (y !== by) y += Math.sign(by - y);
    }
  }

  /** Rooms joined by corridors, for crypts and catacombs. Returns room centres in creation order. */
  dungeon(x0: number, y0: number, x1: number, y1: number, z: number, rooms: number, ground: Ground): Array<{ x: number; y: number }> {
    const centres: Array<{ x: number; y: number; w: number; h: number }> = [];
    let tries = 0;
    while (centres.length < rooms && tries++ < 400) {
      const w = this.rng.int(6, 11), h = this.rng.int(5, 9);
      const x = this.rng.int(x0 + 1, x1 - w - 1), y = this.rng.int(y0 + 1, y1 - h - 1);
      if (centres.some((c) => x < c.x + c.w + 2 && x + w + 2 > c.x && y < c.y + c.h + 2 && y + h + 2 > c.y)) continue;
      centres.push({ x, y, w, h });
      this.fill(x, y, x + w - 1, y + h - 1, ground, z);
    }
    for (let i = 1; i < centres.length; i++) {
      const a = centres[i - 1], b = centres[i];
      this.tunnel(a.x + (a.w >> 1), a.y + (a.h >> 1), b.x + (b.w >> 1), b.y + (b.h >> 1), z, ground, 2);
    }
    return centres.map((c) => ({ x: c.x + (c.w >> 1), y: c.y + (c.h >> 1) }));
  }

  /** Meandering river from a to b. */
  river(ax: number, ay: number, bx: number, by: number, width: number, z = 0): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = [];
    let x = ax, y = ay;
    let guard = 3000;
    while ((Math.abs(x - bx) > 1 || Math.abs(y - by) > 1) && guard-- > 0) {
      pts.push({ x, y });
      for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) {
        if (dx * dx + dy * dy <= width * width + 1) {
          this.g(x + dx, y + dy, Ground.Water, z);
          this.o(x + dx, y + dy, Obj.None, z);
        }
      }
      const toward = Math.abs(bx - x) > Math.abs(by - y) ? [Math.sign(bx - x), 0] : [0, Math.sign(by - y)];
      if (this.rng.chance(0.7)) { x += toward[0]; y += toward[1]; } else { x += this.rng.int(-1, 1); y += this.rng.int(-1, 1); }
    }
    return pts;
  }

  /** Random scatter of objects over grassy/plain tiles. */
  scatter(x0: number, y0: number, x1: number, y1: number, table: Array<[Obj, number]>, z = 0, onGround?: Ground[]): void {
    this.rect(x0, y0, x1, y1, (x, y) => {
      if (this.m.getObj(x, y, z) !== Obj.None) return;
      const g = this.m.getGround(x, y, z);
      if (g === Ground.Path || g === Ground.Water || g === Ground.DeepWater || g === Ground.Void || g === Ground.Lava || g === Ground.Wood || g === Ground.Stone || g === Ground.Marble) return;
      if (onGround && !onGround.includes(g)) return;
      let r = this.rng.next();
      for (const [o, p] of table) {
        if (r < p) {
          this.o(x, y, o, z);
          return;
        }
        r -= p;
      }
    });
  }

  spawn(kind: EnemyKind, x: number, y: number, z = 0): void {
    const g = this.m.getGround(x, y, z);
    if (g === Ground.Void || g === Ground.Water || g === Ground.Lava || g === Ground.DeepWater) this.g(x, y, z < 0 ? Ground.Cave : Ground.Dirt, z);
    const o = this.m.getObj(x, y, z);
    if (o !== Obj.None && o !== Obj.Bones && o !== Obj.Fern && o !== Obj.Flowers && o !== Obj.Wheat) this.o(x, y, Obj.None, z);
    this.m.spawns.push({ kind, x, y, z });
  }

  /** Spawns `n` monsters at random open tiles inside a box. */
  spawnMany(kind: EnemyKind, n: number, x0: number, y0: number, x1: number, y1: number, z = 0): void {
    let placed = 0, tries = 0;
    while (placed < n && tries++ < 500) {
      const x = this.rng.int(x0, x1), y = this.rng.int(y0, y1);
      if (!this.m.isWalkable(x, y, z)) continue;
      if (this.m.spawns.some((s) => s.z === z && Math.abs(s.x - x) + Math.abs(s.y - y) < 3)) continue;
      const o = this.m.getObj(x, y, z);
      if (o === Obj.StairsUp || o === Obj.StairsDown || o === Obj.Hole || o === Obj.Ladder || o === Obj.RopeSpot || o === Obj.LooseStone) continue;
      this.spawn(kind, x, y, z);
      placed++;
    }
  }

  npc(key: string, x: number, y: number, z = 0): void {
    this.o(x, y, Obj.None, z);
    this.m.npcs.push({ key, x, y, z });
  }

  chest(id: string, x: number, y: number, z: number, items: Array<{ id: string; qty: number }>): void {
    this.o(x, y, Obj.Chest, z);
    this.m.chests.push({ id, x, y, z, items });
  }

  region(r: Omit<Region, 'z0' | 'z1'> & Partial<Pick<Region, 'z0' | 'z1'>>): void {
    this.m.regions.push({ z0: 0, z1: 0, ...r });
  }
}

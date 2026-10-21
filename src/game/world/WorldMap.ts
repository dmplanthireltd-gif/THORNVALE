import type { TilePos } from '../core/types';

/** Ground layer — what the tile floor is made of. */
export enum Ground {
  Grass = 0,
  Path = 1,
  Stone = 2,
  Wood = 3,
  Water = 4,
  Dirt = 5,
  Crop = 6,
  Sand = 7,
  DarkGrass = 8,
  Lava = 9,
  Ash = 10,
  /** Nothing here (open air above ground, solid rock below). */
  Void = 11,
  Swamp = 12,
  Cave = 13,
  Jungle = 14,
  Marble = 15,
  DeepWater = 16,
}

/** Object layer — what stands on the tile. */
export enum Obj {
  None = 0,
  Tree = 1,
  Pine = 2,
  DeadTree = 3,
  Rock = 4,
  Bush = 5,
  Wall = 6,
  Fence = 7,
  Grave = 8,
  Well = 9,
  Barrel = 10,
  Crate = 11,
  Table = 12,
  Flowers = 13,
  Door = 14,
  Hay = 15,
  Wheat = 16,
  Lamp = 17,
  Cliff = 18,
  Palisade = 19,
  Bones = 20,
  Campfire = 21,
  // floors & access
  StairsUp = 22,
  StairsDown = 23,
  Ladder = 24,
  RopeSpot = 25,
  Hole = 26,
  LooseStone = 27,
  // furniture & features
  Chest = 28,
  Locker = 29,
  Palm = 30,
  Fern = 31,
  Pillar = 32,
  FireField = 33,
  Stalagmite = 34,
  Torch = 35,
  StoneWall = 36,
  Counter = 37,
  Altar = 38,
  JungleTree = 39,
  Railing = 40,
}

const SOLID = new Set<number>([
  Obj.Tree, Obj.Pine, Obj.DeadTree, Obj.Rock, Obj.Bush, Obj.Wall, Obj.Fence,
  Obj.Grave, Obj.Well, Obj.Barrel, Obj.Crate, Obj.Table, Obj.Hay, Obj.Lamp,
  Obj.Cliff, Obj.Palisade, Obj.Campfire, Obj.Chest, Obj.Locker, Obj.Palm, Obj.Pillar,
  Obj.Stalagmite, Obj.StoneWall, Obj.Counter, Obj.Altar, Obj.JungleTree, Obj.Railing,
]);

/** Objects that stop arrows and spells. Trees and fences do not. */
const BLOCKS_SIGHT = new Set<number>([Obj.Wall, Obj.Cliff, Obj.Palisade, Obj.Pillar, Obj.StoneWall, Obj.Stalagmite]);

const UNWALKABLE_GROUND = new Set<number>([Ground.Water, Ground.Lava, Ground.Void, Ground.DeepWater]);

export const FLOOR_MIN = -4;
export const FLOOR_MAX = 2;

export interface House {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  roofColor: number;
  wallColor: number;
  name: string;
  /** Stone buildings use brick walls instead of timber and plaster. */
  stone?: boolean;
  /** Buildings with an upper floor get their roof drawn there instead. */
  noRoof?: boolean;
}

export type EnemyKind =
  | 'rat' | 'wolf' | 'skeleton'
  | 'orc' | 'orc_spearman' | 'orc_shaman' | 'orc_warrior' | 'orc_berserker' | 'orc_leader' | 'orc_warlord'
  | 'elf' | 'elf_scout' | 'elf_arcanist' | 'elf_warden'
  | 'crocodile' | 'tarantula' | 'jungle_troll' | 'hydra'
  | 'ghoul' | 'fire_elemental' | 'behemoth' | 'demon'
  | 'dragon' | 'dragon_lord';

export interface Region {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Floors this region covers (inclusive). */
  z0: number;
  z1: number;
  /** Recommended level, shown to players. */
  level: string;
  /** Protection zone: monsters cannot enter, hazards don't hurt. */
  safe?: boolean;
  /** Temple respawn point for towns. */
  temple?: TilePos & { z: number };
}

export interface SpawnPoint {
  kind: EnemyKind;
  x: number;
  y: number;
  z: number;
}

export interface NpcSpawn {
  key: string;
  x: number;
  y: number;
  z: number;
}

export type LinkKind = 'walk' | 'use' | 'rope';

export interface Link {
  kind: LinkKind;
  to: { x: number; y: number; z: number };
}

export interface ChestDef {
  id: string;
  x: number;
  y: number;
  z: number;
  items: Array<{ id: string; qty: number }>;
}

export class Floor {
  readonly ground: Uint8Array;
  readonly obj: Uint8Array;
  constructor(readonly z: number, w: number, h: number, fill: Ground) {
    this.ground = new Uint8Array(w * h).fill(fill);
    this.obj = new Uint8Array(w * h);
  }
}

/** Pure tile data for every floor. No rendering concerns live here. */
export class WorldMap {
  readonly floors = new Map<number, Floor>();
  readonly houses: House[] = [];
  readonly spawns: SpawnPoint[] = [];
  readonly npcs: NpcSpawn[] = [];
  readonly regions: Region[] = [];
  readonly links = new Map<string, Link>();
  readonly chests: ChestDef[] = [];
  /** Named arrival points (ship docks). */
  readonly destinations: Record<string, { x: number; y: number; z: number }> = {};
  playerSpawn: TilePos & { z: number } = { x: 0, y: 0, z: 0 };
  /** Default temple tile where players respawn. */
  temple: TilePos & { z: number } = { x: 0, y: 0, z: 0 };

  constructor(readonly width: number, readonly height: number) {
    this.floors.set(0, new Floor(0, width, height, Ground.Grass));
  }

  floor(z: number, create = false): Floor | null {
    let f = this.floors.get(z);
    if (!f && create && z >= FLOOR_MIN && z <= FLOOR_MAX) {
      f = new Floor(z, this.width, this.height, Ground.Void);
      this.floors.set(z, f);
    }
    return f ?? null;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  getGround(x: number, y: number, z = 0): Ground {
    const f = this.floors.get(z);
    if (!f || !this.inBounds(x, y)) return Ground.Void;
    return f.ground[this.idx(x, y)] as Ground;
  }

  getObj(x: number, y: number, z = 0): Obj {
    const f = this.floors.get(z);
    if (!f || !this.inBounds(x, y)) return Obj.None;
    return f.obj[this.idx(x, y)] as Obj;
  }

  setGround(x: number, y: number, g: Ground, z = 0): void {
    if (!this.inBounds(x, y)) return;
    this.floor(z, true)!.ground[this.idx(x, y)] = g;
  }

  setObj(x: number, y: number, o: Obj, z = 0): void {
    if (!this.inBounds(x, y)) return;
    this.floor(z, true)!.obj[this.idx(x, y)] = o;
  }

  /** Static walkability (terrain + objects), ignoring creatures. */
  isWalkable(x: number, y: number, z = 0): boolean {
    const f = this.floors.get(z);
    if (!f || !this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    if (UNWALKABLE_GROUND.has(f.ground[i])) return false;
    return !SOLID.has(f.obj[i]);
  }

  /**
   * Can a creature step from (x,y) by (dx,dy) on floor z? Diagonal steps are
   * refused when either orthogonal neighbour is blocked — no corner cutting.
   */
  canStep(x: number, y: number, z: number, dx: number, dy: number): boolean {
    if (dx === 0 && dy === 0) return false;
    if (!this.isWalkable(x + dx, y + dy, z)) return false;
    if (dx !== 0 && dy !== 0) {
      if (!this.isWalkable(x + dx, y, z) || !this.isWalkable(x, y + dy, z)) return false;
    }
    return true;
  }

  blocksSight(x: number, y: number, z: number): boolean {
    return BLOCKS_SIGHT.has(this.getObj(x, y, z));
  }

  /** Bresenham line between two tiles; true when no sight-blocking object lies strictly between them. */
  lineOfSight(x0: number, y0: number, x1: number, y1: number, z: number): boolean {
    let x = x0, y = y0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && this.blocksSight(x, y, z)) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  /** Path-finding view of a single floor. */
  grid(z: number): { width: number; height: number; canStep(x: number, y: number, dx: number, dy: number): boolean } {
    return { width: this.width, height: this.height, canStep: (x, y, dx, dy) => this.canStep(x, y, z, dx, dy) };
  }

  static key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  addLink(x: number, y: number, z: number, kind: LinkKind, to: { x: number; y: number; z: number }): void {
    this.links.set(WorldMap.key(x, y, z), { kind, to });
  }

  linkAt(x: number, y: number, z: number): Link | null {
    return this.links.get(WorldMap.key(x, y, z)) ?? null;
  }

  regionAt(x: number, y: number, z = 0): Region | null {
    // later (smaller) regions win, so nested areas override their surroundings
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (z >= r.z0 && z <= r.z1 && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r;
    }
    return null;
  }

  isSafe(x: number, y: number, z: number): boolean {
    for (const r of this.regions) {
      if (r.safe && z >= r.z0 && z <= r.z1 && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return true;
    }
    return false;
  }

  houseAt(x: number, y: number, z = 0): House | null {
    for (const h of this.houses) {
      if (h.z === z && x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h;
    }
    return null;
  }
}

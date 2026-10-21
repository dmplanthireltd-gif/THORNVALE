import { offsetPlaza } from './spawnPlaza';
import { buildVillage, MAP_H as VH, MAP_W as VW } from './villageMap';
import { Gen, type Dir } from './genKit';
import { FERRIES, townByKey } from './townList';
import { buildTown, townRegion, TownCtx, type TownSpec } from './towns';
import { Ground, Obj, type Region } from './WorldMap';

export interface TownSet {
  ctx: Record<string, TownCtx>;
  /** Thornvale's layout (the stamped village). */
  thornvale: { x0: number; y0: number; plaza: { x: number; y: number }; gates: Record<Dir, { x: number; y: number }> };
  /** Adds the protection zones last so they win over surrounding hunting regions. */
  finish(): void;
  /** Regions to add at the very end (harbours). */
  late: Region[];
}

const TIMBER_ROOFS = [0x8e3b2e, 0x7d5a3a, 0x9a4a2c, 0x5a6e8c, 0x3f6b4a, 0x6b3a26];
const TIMBER_WALLS = [0xd8cbb0, 0xcfc2a4, 0xd4c7aa, 0xd2c4a8, 0xcbb994];
const STONE_WALLS = [0xb8b0a0, 0xa8a090, 0xc4bcae, 0x9a948a];
const SAND_WALLS = [0xe8d4a0, 0xf0dcae, 0xdcc48c];
const SAND_ROOFS = [0xc9a04a, 0xb8863a, 0xd8b060, 0xa86a3a];
const NORSE_ROOFS = [0x4a3a2a, 0x5a4632, 0x3a3a3a, 0x6a4a2a];
const ELF_ROOFS = [0x3f7a3a, 0x4a8a46, 0x2f6a3a, 0x5a7a3a];

export const TV = { x0: 176, y0: 290 };

export function buildAllTowns(g: Gen): TownSet {
  const ctx: Record<string, TownCtx> = {};
  const late: Region[] = [];
  const info = (k: string) => townByKey(k)!;
  const add = (spec: TownSpec) => {
    const t = buildTown(g, spec);
    ctx[spec.info.key] = t;
    if (t.harbour) late.push(t.harbour);
    return t;
  };
  const tv = buildThornvale(g, late);

  add({
    info: info('westmarch'), x0: 190, y0: 468, w: 56, h: 48, ground: Ground.Grass, street: Ground.Stone, plaza: Ground.Marble,
    wall: Obj.StoneWall, stone: true, roofs: [0x8e3b2e, 0x6b3a26, 0x5a4a6a, 0x7d5a3a], walls: STONE_WALLS, dock: 'W', fillers: 18,
  });
  add({
    info: info('elderglen'), x0: 408, y0: 298, w: 44, h: 34, ground: (x, y) => ((x * 7 + y * 3) % 5 === 0 ? Ground.DarkGrass : Ground.Grass),
    plaza: Ground.Stone, wall: Obj.Palisade, roofs: ELF_ROOFS, walls: [0x8a6a46, 0x9a7a52, 0xa88a5c], dock: 'E', fillers: 8,
    extras: (t) => elderglenPlatforms(g, t),
  });
  add({
    info: info('stonedeep'), x0: 280, y0: 350, w: 44, h: 28, ground: Ground.Stone, street: Ground.Path, plaza: Ground.Marble,
    wall: Obj.StoneWall, stone: true, roofs: [0x5a5048, 0x6a5a48, 0x4a4440], walls: [0x8a8478, 0x7a746a, 0x9a9488], fillers: 6, z0: -1, z1: 2,
  });
  add({
    info: info('highmoor'), x0: 436, y0: 412, w: 44, h: 28, ground: Ground.DarkGrass, plaza: Ground.Stone, wall: Obj.Palisade,
    roofs: TIMBER_ROOFS, walls: TIMBER_WALLS, dock: 'E', fillers: 8,
  });
  add({
    info: info('millbrook'), x0: 342, y0: 494, w: 44, h: 28, ground: Ground.Grass, plaza: Ground.Stone, roofs: TIMBER_ROOFS, walls: TIMBER_WALLS,
    dock: 'S', fillers: 8,
  });
  add({
    info: info('valdrheim'), x0: 138, y0: 26, w: 48, h: 42, ground: Ground.Snow, plaza: Ground.Stone, wall: Obj.Palisade,
    roofs: NORSE_ROOFS, walls: [0x8a6a46, 0x7a5a3a, 0x9a7a52], dock: 'N', fillers: 9, extras: (t) => valdrheimHall(g, t),
  });
  add({
    info: info('aurelion'), x0: 346, y0: 32, w: 94, h: 94, ground: Ground.Grass, street: Ground.Stone, plaza: Ground.Marble,
    wall: Obj.StoneWall, stone: true, roofs: [0x8e3b2e, 0x5a4a6a, 0x3f5a8a, 0x7d5a3a, 0x6b3a26], walls: STONE_WALLS, dock: 'S', fillers: 46,
    extras: (t) => aurelionCore(g, t),
  });
  add({
    info: info('briarwatch'), x0: 552, y0: 140, w: 44, h: 28, ground: Ground.DarkGrass, plaza: Ground.Stone, wall: Obj.Palisade,
    roofs: TIMBER_ROOFS, walls: TIMBER_WALLS, dock: 'E', fillers: 8,
  });
  add({
    info: info('corvane'), x0: 534, y0: 300, w: 46, h: 34, ground: Ground.Grass, plaza: Ground.Stone, wall: Obj.StoneWall,
    roofs: TIMBER_ROOFS, walls: TIMBER_WALLS, dock: 'W', fillers: 10,
  });
  add({
    info: info('saltmere'), x0: 152, y0: 668, w: 48, h: 32, ground: Ground.Grass, plaza: Ground.Stone, roofs: TIMBER_ROOFS, walls: TIMBER_WALLS,
    dock: 'W', fillers: 10,
  });
  add({
    info: info('palmreach'), x0: 300, y0: 674, w: 44, h: 28, ground: (x, y) => ((x + y) % 3 === 0 ? Ground.Sand : Ground.Jungle),
    plaza: Ground.Marble, wall: Obj.Palisade, roofs: SAND_ROOFS, walls: [0xe8dcc0, 0xd8c8a0], dock: 'W', fillers: 8,
  });
  add({
    info: info('sunspire'), x0: 500, y0: 720, w: 76, h: 42, ground: Ground.Sand, street: Ground.Path, plaza: Ground.Marble,
    wall: Obj.SandWall, stone: true, roofs: SAND_ROOFS, walls: SAND_WALLS, dock: 'S', fillers: 20, extras: (t) => sunspirePalace(g, t),
  });
  add({
    info: info('dunewatch'), x0: 548, y0: 544, w: 44, h: 26, ground: Ground.Sand, plaza: Ground.Stone, wall: Obj.StoneWall, stone: true,
    roofs: SAND_ROOFS, walls: SAND_WALLS, dock: 'N', fillers: 6,
  });

  // ferry landings on islands without a town
  const FERRY_SITES: Record<string, { x: number; y: number; dir: Dir }> = {
    frostholm: { x: 48, y: 152, dir: 'W' },
    fernwick: { x: 92, y: 470, dir: 'S' },
    cinder_isle: { x: 100, y: 622, dir: 'N' },
    gull_isle: { x: 596, y: 398, dir: 'W' },
    cyclops_isle: { x: 66, y: 554, dir: 'E' },
    bonecrag: { x: 62, y: 716, dir: 'N' },
    dune_isles: { x: 226, y: 766, dir: 'N' },
    jotun_isle: { x: 222, y: 140, dir: 'S' },
  };
  for (const f of FERRIES) {
    const site = FERRY_SITES[f.key];
    const p = g.pier(site.x, site.y, site.dir);
    g.b.npc(f.npc.key, p.npc.x, p.npc.y);
    g.m.destinations[f.key] = p.dest;
    g.protect(p.region[0], p.region[1], p.region[2], p.region[3]);
    late.push({ name: `${f.name} Landing`, x0: p.region[0], y0: p.region[1], x1: p.region[2], y1: p.region[3], z0: 0, z1: 0, level: '—', safe: true });
  }

  // roads across the central continent and between the southern towns
  const G = (k: string, d: Dir) => ctx[k].gates[d];
  const roads: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
    [tv.gates.S, G('westmarch', 'N')],
    [tv.gates.E, G('stonedeep', 'W')],
    [G('stonedeep', 'E'), G('elderglen', 'W')],
    [G('stonedeep', 'S'), G('millbrook', 'N')],
    [G('stonedeep', 'E'), G('highmoor', 'W')],
    [G('highmoor', 'S'), G('millbrook', 'E')],
    [G('westmarch', 'E'), G('millbrook', 'W')],
    [G('dunewatch', 'S'), G('sunspire', 'N')],
    [G('palmreach', 'E'), G('sunspire', 'W')],
    [tv.gates.N, { x: 230, y: 283 }],
    [tv.gates.E, { x: 270, y: 311 }],
  ];
  for (const [a, c] of roads) g.route(a.x, a.y, c.x, c.y);

  const set: TownSet = {
    ctx, late, thornvale: { ...TV, plaza: { x: TV.x0 + 28, y: TV.y0 + 13 }, gates: tv.gates },
    finish() {
      for (const t of Object.values(ctx)) townRegion(g, t);
      tv.regions();
      for (const r of late) g.m.regions.push(r);
    },
  };
  return set;
}

// ================================================================== Thornvale (the original village)

function buildThornvale(g: Gen, late: Region[]): { gates: Record<Dir, { x: number; y: number }>; regions: () => void } {
  const { m, b } = g;
  const OX = TV.x0, OY = TV.y0;
  const v = buildVillage();
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    m.setGround(x + OX, y + OY, v.getGround(x, y));
    m.setObj(x + OX, y + OY, v.getObj(x, y));
  }
  for (const h of v.houses) m.houses.push({ ...h, id: m.houses.length, x: h.x + OX, y: h.y + OY });
  for (const s of v.spawns) m.spawns.push({ ...s, x: s.x + OX, y: s.y + OY });
  for (const n of v.npcs) m.npcs.push({ ...n, x: n.x + OX, y: n.y + OY });
  m.playerSpawn = { x: v.playerSpawn.x + OX, y: v.playerSpawn.y + OY, z: 0 };
  m.temple = { ...m.playerSpawn };
  m.plaza = v.plaza ? offsetPlaza(v.plaza, OX, OY) : null;
  const houses = m.houses.filter((h) => h.x >= OX && h.y >= OY && h.x < OX + VW && h.y < OY + VH);
  // the depot has a second floor with more lockers
  const depot = houses.find((h) => h.name === 'Thornvale Depot Hall')!;
  depot.noRoof = true;
  b.building(depot.x, depot.y, depot.w, depot.h, { z: 1, name: 'Depot Loft', roof: depot.roofColor, wallColor: depot.wallColor, stone: depot.stone, wall: Obj.Wall });
  b.stairs({ x: depot.x + depot.w - 2, y: depot.y + depot.h - 3, z: 0 }, { x: depot.x + depot.w - 2, y: depot.y + depot.h - 3, z: 1 }, [-1, 0], [-1, 0]);
  for (let i = 1; i < depot.w - 3; i += 2) b.o(depot.x + i, depot.y + 1, Obj.Locker, 1);
  // gates through the pine ring
  const nx = OX + 27;
  const gates: Record<Dir, { x: number; y: number }> = {
    N: { x: nx, y: OY - 1 }, S: { x: nx, y: OY + VH }, W: { x: OX - 1, y: OY + 22 }, E: { x: OX + VW, y: OY + 22 },
  };
  b.road(nx, OY - 1, nx, OY + 2);
  b.road(nx, OY + VH - 3, nx, OY + VH);
  b.road(OX - 1, OY + 22, OX + 3, OY + 22);
  b.road(OX + VW - 4, OY + 22, OX + VW, OY + 22);
  // the sewers beneath the village (rats for beginners)
  g.stairsDown(OX + 12, OY + 24, 0, Ground.Stone);
  const sewerRooms = b.dungeon(OX + 4, OY + 12, OX + 50, OY + 42, -1, 8, Ground.Stone);
  b.tunnel(OX + 13, OY + 24, sewerRooms[0].x, sewerRooms[0].y, -1, Ground.Stone);
  b.rect(OX + 4, OY + 14, OX + 50, OY + 42, (x, y) => {
    if (m.getGround(x, y, -1) === Ground.Stone && g.rng.chance(0.05)) m.setGround(x, y, Ground.Swamp, -1);
  });
  for (const r of sewerRooms) g.spawn('rat', 2, r.x - 2, r.y - 2, r.x + 2, r.y + 2, -1);
  g.spawn('rat', 8, OX + 4, OY + 14, OX + 50, OY + 42, -1);
  b.chest('thornvale_sewer', sewerRooms[sewerRooms.length - 1].x + 1, sewerRooms[sewerRooms.length - 1].y, -1, [{ id: 'leather_helmet', qty: 1 }, { id: 'health_potion', qty: 3 }, { id: 'gold', qty: 30 }]);

  // harbour on the west coast
  const coast = g.coastFrom(gates.W.x, gates.W.y, 'W');
  g.route(gates.W.x, gates.W.y, coast.x + 1, coast.y);
  const p = g.pier(coast.x, coast.y, 'W');
  b.npc('hask', p.npc.x, p.npc.y);
  m.destinations.thornvale = p.dest;
  g.protect(p.region[0], p.region[1], p.region[2], p.region[3]);
  g.protect(OX + 5, OY + 8, OX + 44, OY + 41);
  late.push({ name: 'Thornvale Harbour', x0: p.region[0], y0: p.region[1], x1: p.region[2], y1: p.region[3], z0: 0, z1: 0, level: '—', safe: true });

  return {
    gates,
    regions: () => {
      b.region({ name: 'Thornvale', x0: OX, y0: OY, x1: OX + VW - 1, y1: OY + VH - 1, level: '1+', z0: 0, z1: 2, temple: m.temple });
      b.region({ name: 'Greywood', x0: OX + 2, y0: OY + 2, x1: OX + VW - 3, y1: OY + 10, level: '3+' });
      b.region({ name: "Miller's Farm", x0: OX + 40, y0: OY + 25, x1: OX + 53, y1: OY + 39, level: '1+' });
      b.region({ name: 'Old Graveyard', x0: OX + 3, y0: OY + 31, x1: OX + 17, y1: OY + 40, level: '5+' });
      b.region({ name: 'Thornvale Sewers', x0: OX + 4, y0: OY + 14, x1: OX + 50, y1: OY + 42, level: '1+', z0: -1, z1: -1 });
      b.region({ name: 'Temple Plaza', x0: OX + 21, y0: OY + 9, x1: OX + 34, y1: OY + 29, level: '—', safe: true, temple: m.temple });
      for (const h of houses) {
        if (h.name !== 'Miller Barn' && !/temple/i.test(h.name)) b.region({ name: h.name, x0: h.x, y0: h.y, x1: h.x + h.w - 1, y1: h.y + h.h - 1, level: '—', safe: true, z0: 0, z1: 1 });
      }
    },
  };
}

// ================================================================== town extras

function elderglenPlatforms(g: Gen, t: TownCtx): void {
  const { b, m } = g;
  // two tree-top platforms (z+1) with a rope bridge, in the town's south-west corner
  const px = t.s.x0 + 3, py = t.y1 - 9;
  t.reserve(px, py, 13, 7);
  b.rect(px, py, px + 12, py + 6, (x, y) => { m.setGround(x, y, Ground.DarkGrass); m.setObj(x, y, Obj.None); });
  for (const [ax, ay] of [[px, py], [px + 8, py + 1]]) {
    b.fill(ax, ay, ax + 4, ay + 4, Ground.Wood, 1);
    b.outline(ax, ay, ax + 4, ay + 4, Obj.Railing, 1);
    b.ladder(ax + 2, ay + 3, 0, [0, -1]);
    m.setObj(ax + 2, ay + 4, Obj.Railing, 1);
  }
  for (let x = px + 4; x <= px + 8; x++) { m.setGround(x, py + 2, Ground.Wood, 1); m.setObj(x, py + 2, Obj.None, 1); }
  for (const x of [px + 5, px + 6, px + 7]) { m.setGround(x, py + 1, Ground.Wood, 1); m.setObj(x, py + 1, Obj.Railing, 1); m.setGround(x, py + 3, Ground.Wood, 1); m.setObj(x, py + 3, Obj.Railing, 1); }
  b.chest('elderglen_canopy', px + 11, py + 2, 1, [{ id: 'elven_scroll', qty: 1 }, { id: 'small_emerald', qty: 1 }]);
  t.connect(px + 6, py + 7);
}

function valdrheimHall(g: Gen, t: TownCtx): void {
  const { b, m } = g;
  // the Jarl's longhouse with a mead-hall loft
  const x = t.cx - 8, y = t.y1 - 8;
  t.house(x, y, 17, 7, [[t.cx, y]], 'Longhouse of Valdrheim', { roof: 0x3a2a1a, wall: 0x7a5a3a, noRoof: true });
  b.building(x, y, 17, 7, { z: 1, name: 'Mead Hall Loft', roof: 0x3a2a1a, wallColor: 0x7a5a3a, floor: Ground.Wood });
  b.stairs({ x: x + 15, y: y + 3, z: 0 }, { x: x + 15, y: y + 3, z: 1 }, [-1, 0], [-1, 0]);
  for (const [cx, cy] of [[x + 3, y + 3], [x + 8, y + 2], [x + 11, y + 4]]) m.setObj(cx, cy, Obj.Table);
  m.setObj(x + 2, y + 5, Obj.Campfire);
  b.chest('valdrheim_loft', x + 1, y + 1, 1, [{ id: 'chain_helmet', qty: 1 }, { id: 'strong_health_potion', qty: 2 }]);
}

function aurelionCore(g: Gen, t: TownCtx): void {
  const { b, m } = g;
  const { cx, cy } = t;
  // ring road
  b.rect(cx - 33, cy - 33, cx + 33, cy + 33, (x, y) => {
    const d = Math.hypot(x - cx - 0.5, y - cy - 0.5);
    if (d >= 30 && d < 32.2) t.street(x, y, x, y);
  });
  // diagonal avenues from the ring to the corners
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (let k = 23; k < 44; k++) t.street(cx + sx * k, cy + sy * k, cx + sx * k + 1, cy + sy * k);
  }
  // the palace: three floors, the top a tower over the west wing
  const px = cx - 11, py = cy - 27, pw = 23, ph = 12;
  t.house(px, py, pw, ph, [[cx, py + ph - 1], [cx + 1, py + ph - 1]], 'Palace of Aurelion', { stone: true, noRoof: true, roof: 0x3f5a8a, wall: 0xe8e2d4, floor: Ground.Marble });
  for (const [ix, iy] of [[px + 4, py + 4], [px + 4, py + 8], [px + 18, py + 4], [px + 18, py + 8], [cx - 3, py + 3], [cx + 4, py + 3]]) m.setObj(ix, iy, Obj.Pillar);
  m.setObj(cx, py + 1, Obj.Altar);
  for (const [ix, iy] of [[px + 1, py + 1], [px + pw - 2, py + 1]]) m.setObj(ix, iy, Obj.Torch);
  b.building(px, py, pw, ph, { z: 1, name: 'Palace Gallery', stone: true, floor: Ground.Marble, roof: 0x3f5a8a, wallColor: 0xe8e2d4, noRoof: true });
  b.stairs({ x: px + 2, y: py + ph - 3, z: 0 }, { x: px + 2, y: py + ph - 3, z: 1 }, [1, 0], [1, 0]);
  for (const [ix, iy] of [[px + 6, py + 2], [px + 16, py + 2], [px + 12, py + 8]]) m.setObj(ix, iy, Obj.Table, 1);
  b.building(px, py, 9, 7, { z: 2, name: 'Palace Tower', stone: true, floor: Ground.Marble, roof: 0x3f5a8a, wallColor: 0xe8e2d4 });
  b.stairs({ x: px + 6, y: py + 4, z: 1 }, { x: px + 6, y: py + 4, z: 2 }, [-1, 0], [-1, 0]);
  b.chest('aurelion_tower', px + 1, py + 1, 2, [{ id: 'amulet_of_warding', qty: 1 }, { id: 'great_mana_potion', qty: 3 }]);
  // gardens either side of the palace
  for (const gx of [px - 8, px + pw + 1]) {
    t.reserve(gx, py + 2, 7, 8);
    b.rect(gx, py + 2, gx + 6, py + 9, (x, y) => {
      m.setGround(x, y, Ground.Grass);
      m.setObj(x, y, (x + y) % 4 === 0 ? Obj.Flowers : (x - gx) % 3 === 0 && (y - py) % 3 === 0 ? Obj.Bush : Obj.None);
    });
  }
  // the city's sewers lie beneath the south-west district
  const sx = cx - 26, sy = cy + 20;
  t.reserve(sx - 1, sy - 1, 3, 3);
  g.stairsDown(sx, sy, 0, Ground.Stone);
  t.connect(sx, sy + 2);
}

function sunspirePalace(g: Gen, t: TownCtx): void {
  const { m } = g;
  const { cx } = t;
  // the Vizier's palace in the north of the city, behind a garden of palms
  const px = cx - 9, py = t.s.y0 + 2, pw = 19, ph = 8;
  if (py + ph >= t.cy - 11) return;
  t.house(px, py, pw, ph, [[cx, py + ph - 1]], 'Sunspire Palace', { stone: true, roof: 0xd8b060, wall: 0xf0dcae, floor: Ground.Marble });
  for (const [ix, iy] of [[px + 3, py + 3], [px + 15, py + 3], [px + 3, py + 5], [px + 15, py + 5]]) m.setObj(ix, iy, Obj.Pillar);
  m.setObj(cx, py + 1, Obj.Altar);
  for (const x of [px - 2, px + pw + 1]) for (let y = py; y < py + ph; y += 3) if (t.get(x, y) === 0) m.setObj(x, y, Obj.Palm);
}

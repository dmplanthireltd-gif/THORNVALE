import { DIR_V, Gen, type Dir } from './genKit';
import { legacyCinderreach, legacyDescent, legacyGrimtusk, stamp } from './legacy';
import type { TownSet } from './townSites';
import { Ground, Obj, type EnemyKind } from './WorldMap';

/**
 * Hunting grounds, dungeons and treasure across the world, from rats under
 * Thornvale to demons four floors beneath the Ruins of Varkh.
 */
export function buildAreas(g: Gen, towns: TownSet): void {
  centralNorth(g);
  centralMountains(g);
  centralSouth(g);
  elderglenWoods(g);
  frozenNorth(g);
  capital(g, towns);
  northEast(g);
  eastIsle(g);
  westIsles(g);
  southIsles(g);
  jungle(g);
  desert(g);
}

// ================================================================== helpers

type Box = [number, number, number, number];

function region(g: Gen, name: string, [x0, y0, x1, y1]: Box, level: string, z0 = 0, z1 = z0): void {
  g.b.region({ name, x0, y0, x1, y1, level, z0, z1 });
}

function spawns(g: Gen, box: Box, list: Array<[EnemyKind, number]>, z = 0): void {
  for (const [k, n] of list) g.spawn(k, n, box[0], box[1], box[2], box[3], z);
}

/**
 * Places a dungeon boss (bosses/bosses.ts) on the first open tile spiralling out
 * from x, y: walkable, not a protection zone, no stairs. Uses no randomness, so
 * the rest of the map comes out exactly as before.
 */
function bossLair(g: Gen, kind: EnemyKind, x: number, y: number, z: number): void {
  const m = g.m;
  for (let r = 0; r <= 10; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const tx = x + dx, ty = y + dy;
      if (!m.isWalkable(tx, ty, z) || m.isSafe(tx, ty, z) || m.linkAt(tx, ty, z)) continue;
      const o = m.getObj(tx, ty, z);
      if (o === Obj.Door || o === Obj.Hole || o === Obj.LooseStone) continue;
      g.b.spawn(kind, tx, ty, z);
      return;
    }
  }
  throw new Error(`no room for ${kind} near ${x},${y},${z}`);
}

/** A palisade camp with tents and a campfire; returns the tent interiors. */
function camp(g: Gen, [x0, y0, x1, y1]: Box, opts: { name: string; ground?: Ground; wall?: Obj; gates?: Dir[]; tents?: number; roof?: number }): Array<{ x: number; y: number }> {
  const { b, m, rng } = g;
  const ground = opts.ground ?? Ground.Dirt;
  g.clearTo(x0, y0, x1, y1, () => (rng.chance(0.25) ? Ground.DarkGrass : ground));
  b.outline(x0, y0, x1, y1, opts.wall ?? Obj.Palisade);
  const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
  for (const d of opts.gates ?? ['S', 'N']) {
    const [dx, dy] = DIR_V[d];
    const gx = dx ? (dx > 0 ? x1 : x0) : cx, gy = dy ? (dy > 0 ? y1 : y0) : cy;
    for (let k = 0; k < 2; k++) m.setObj(gx + (dy ? k : 0), gy + (dx ? k : 0), Obj.None);
  }
  const tents: Array<{ x: number; y: number }> = [];
  const n = opts.tents ?? 3;
  let tx = x0 + 2;
  for (let i = 0; i < n && tx + 4 < x1 - 1; i++) {
    if (Math.abs(tx + 2 - cx) <= 2) tx = cx + 3;
    if (tx + 4 >= x1 - 1) break;
    b.building(tx, y0 + 2, 5, 4, { name: `${opts.name} Tent`, roof: opts.roof ?? 0x8a6a3e, wallColor: 0x8a7050, doors: [[tx + 2, y0 + 5]], floor: Ground.Dirt });
    tents.push({ x: tx + 2, y: y0 + 3 });
    tx += 7;
  }
  m.setObj(cx, cy + 1, Obj.Campfire);
  for (const [bx, by] of [[x0 + 2, y1 - 2], [x1 - 2, y1 - 2]]) m.setObj(bx, by, rng.pick([Obj.Barrel, Obj.Crate]));
  return tents;
}

/**
 * Stairs down from floor z+1 at the entrance to an organic cave on floor z,
 * with tunnels to every anchor so the whole cave hangs together.
 */
function cave(g: Gen, entrance: { x: number; y: number }, z: number, box: Box, anchors: Array<{ x: number; y: number }>, opts: { open?: number; ground?: Ground; deco?: Array<[Obj, number]> } = {}): void {
  const { b, m } = g;
  const ground = opts.ground ?? Ground.Cave;
  b.cave(box[0], box[1], box[2], box[3], z, opts.open ?? 0.55, ground);
  g.stairsDown(entrance.x, entrance.y, z + 1, ground);
  let prev = { x: entrance.x + 1, y: entrance.y };
  for (const a of anchors) {
    b.tunnel(prev.x, prev.y, a.x, a.y, z, ground);
    b.rect(a.x - 2, a.y - 2, a.x + 2, a.y + 2, (x, y) => { if (m.getGround(x, y, z) === Ground.Void) m.setGround(x, y, ground, z); });
    prev = a;
  }
  b.scatter(box[0], box[1], box[2], box[3], opts.deco ?? [[Obj.Stalagmite, 0.035], [Obj.Bones, 0.008]], z, [ground]);
}

/** Room-and-corridor dungeon on floor z below an entrance on floor z+1. Returns room centres (first is nearest the entrance). */
function crypt(g: Gen, entrance: { x: number; y: number }, z: number, box: Box, rooms: number, ground = Ground.Stone): Array<{ x: number; y: number }> {
  const { b, m, rng } = g;
  const cs = b.dungeon(box[0], box[1], box[2], box[3], z, rooms, ground);
  g.stairsDown(entrance.x, entrance.y, z + 1, ground);
  if (cs.length) b.tunnel(entrance.x + 1, entrance.y, cs[0].x, cs[0].y, z, ground);
  b.rect(box[0], box[1], box[2], box[3], (x, y) => {
    if (m.getGround(x, y, z) !== ground || m.getObj(x, y, z) !== Obj.None || m.linkAt(x, y, z)) return;
    const r = rng.next();
    if (r < 0.015) m.setObj(x, y, Obj.Bones, z);
    else if (r < 0.02) m.setObj(x, y, Obj.Grave, z);
    else if (r < 0.026) m.setObj(x, y, Obj.Torch, z);
  });
  return cs;
}

/** Turns water along an L-shaped line into a 3-wide ice (or wood) bridge. */
function bridge(g: Gen, ax: number, ay: number, bx: number, by: number, ground = Ground.Ice): void {
  const { m } = g;
  const put = (x: number, y: number) => {
    for (let d = -1; d <= 1; d++) for (const [px, py] of [[x + d, y], [x, y + d]]) {
      const gr = m.getGround(px, py);
      if (gr === Ground.Water || gr === Ground.DeepWater) { m.setGround(px, py, ground); m.setObj(px, py, Obj.None); }
    }
  };
  let x = ax, y = ay;
  while (x !== bx) { put(x, y); x += Math.sign(bx - x); }
  while (y !== by) { put(x, y); y += Math.sign(by - y); }
  put(x, y);
}

/** A tower of several floors with stairs between them; returns the centre of each floor. */
function tower(g: Gen, x: number, y: number, w: number, h: number, floors: number, name: string, opts: { roof?: number; wall?: number; ground?: Ground; door?: [number, number] } = {}): Array<{ x: number; y: number; z: number }> {
  const { b } = g;
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (let z = 0; z < floors; z++) {
    b.building(x, y, w, h, {
      z, name: z === 0 ? name : `${name} (floor ${z})`, stone: true, wall: Obj.Wall, floor: opts.ground ?? Ground.Stone,
      roof: opts.roof ?? 0x4a4a6a, wallColor: opts.wall ?? 0xb8b8c8, noRoof: z < floors - 1, doors: z === 0 ? [opts.door ?? [x + (w >> 1), y + h - 1]] : [],
    });
    out.push({ x: x + (w >> 1), y: y + (h >> 1), z });
  }
  for (let z = 0; z < floors - 1; z++) {
    const sx = z % 2 === 0 ? x + 1 : x + w - 2;
    b.stairs({ x: sx, y: y + 1, z }, { x: sx, y: y + 1, z: z + 1 }, [0, 1], [0, 1]);
  }
  return out;
}

/** Dig spot over a sealed cell one floor down, with a rope spot back up and a chest. */
function hiddenCell(g: Gen, x: number, y: number, z: number, id: string, items: Array<{ id: string; qty: number }>, guard?: EnemyKind): void {
  const { b, m } = g;
  b.digSpot(x, y, z);
  b.rect(x - 2, y - 2, x + 2, y + 2, (xx, yy) => { m.setGround(xx, yy, Ground.Stone, z - 1); m.setObj(xx, yy, Obj.None, z - 1); });
  b.ropeSpot(x - 1, y - 1, z - 1, [1, 1]);
  m.addLink(x, y, z, 'walk', { x, y, z: z - 1 });
  b.chest(id, x + 1, y + 1, z - 1, items);
  if (guard) b.spawn(guard, x + 1, y - 1, z - 1);
}

// ================================================================== central continent: the north lobe around Thornvale

function centralNorth(g: Gen): void {
  const { b, m } = g;
  // Grimtusk Fortress north of the village
  stamp(m, legacyGrimtusk(), 7, 5, 57, 43, 198, 237);
  region(g, 'Grimtusk Fortress', [205, 242, 255, 280], '10+', -1, 1);
  bossLair(g, 'boss_ironjaw', 230, 252, 0);
  spawns(g, [196, 232, 266, 288], [['orc', 6], ['orc_spearman', 2]]);

  // Dragonspire Plateau with the Caldera: dragons in the heart of the north lobe
  stamp(m, legacyCinderreach(), 170, 60, 220, 93, 102, 238);
  b.rect(274, 299, 301, 330, (x, y) => { if (m.getGround(x, y) === Ground.Ash && g.rng.chance(0.75)) m.setGround(x, y, Ground.Dirt); });
  region(g, 'Dragonspire Plateau', [272, 298, 322, 331], '35+');
  region(g, 'The Caldera', [302, 301, 320, 327], '70+');
  // the dragons' lair below
  cave(g, { x: 290, y: 326 }, -1, [272, 298, 324, 334], [{ x: 280, y: 310 }, { x: 300, y: 304 }, { x: 314, y: 316 }, { x: 306, y: 328 }], { ground: Ground.Ash, deco: [[Obj.Bones, 0.03], [Obj.Stalagmite, 0.02], [Obj.FireField, 0.006]] });
  spawns(g, [272, 298, 324, 334], [['dragon', 5], ['dragon_lord', 1]], -1);
  b.chest('dragon_lair', 315, 317, -1, [{ id: 'dragon_helm', qty: 1 }, { id: 'small_ruby', qty: 3 }, { id: 'gold', qty: 1500 }]);
  region(g, 'Dragon Lair', [272, 298, 324, 334], '50+', -1);
  bossLair(g, 'boss_ember_matriarch', 312, 314, -1);

  // meadows and woods around Thornvale (beginners)
  spawns(g, [140, 292, 175, 340], [['deer', 6], ['snake', 4], ['rat', 3], ['wolf', 2]]);
  region(g, 'Thornvale Meadows', [140, 290, 175, 345], '2+');
  spawns(g, [233, 286, 268, 345], [['deer', 4], ['snake', 3], ['wolf', 3]]);
  region(g, 'Eastfold', [232, 284, 270, 345], '3+');
  spawns(g, [140, 244, 204, 288], [['bear', 5], ['wolf', 5], ['snake', 3], ['deer', 3]]);
  region(g, 'Bramblewood', [140, 244, 204, 288], '6+');
  // Bandit Hollow south-west of the village
  const tents = camp(g, [142, 336, 168, 354], { name: 'Bandit', gates: ['N', 'E'] });
  spawns(g, [140, 334, 172, 362], [['bandit', 10]]);
  if (tents[0]) b.chest('bandit_hollow', tents[0].x, tents[0].y, 0, [{ id: 'iron_helmet', qty: 1 }, { id: 'gold', qty: 120 }]);
  region(g, 'Bandit Hollow', [140, 334, 172, 362], '8+');
  // Cyclops Ridge in the north-east of the lobe
  spawns(g, [324, 244, 364, 292], [['cyclops', 8], ['bear', 2]]);
  b.chest('cyclops_ridge', 352, 258, 0, [{ id: 'battle_axe', qty: 1 }, { id: 'small_emerald', qty: 1 }]);
  region(g, 'Cyclops Ridge', [322, 242, 366, 294], '25+');
}

// ================================================================== the Greyspine and the mines of Stonedeep

function centralMountains(g: Gen): void {
  const { b } = g;
  // Stonedeep Mines: entrance south-east of the town walls
  cave(g, { x: 326, y: 384 }, -1, [250, 336, 346, 398], [
    { x: 316, y: 388 }, { x: 290, y: 392 }, { x: 262, y: 384 }, { x: 258, y: 356 }, { x: 278, y: 342 }, { x: 310, y: 346 }, { x: 338, y: 352 },
  ]);
  spawns(g, [250, 336, 346, 398], [['dwarf', 10], ['dwarf_soldier', 6]], -1);
  region(g, 'Stonedeep Mines', [250, 336, 346, 398], '10+', -1);
  // Deep Delvings (z−2)
  cave(g, { x: 262, y: 360 }, -2, [256, 340, 342, 396], [{ x: 280, y: 372 }, { x: 304, y: 360 }, { x: 330, y: 372 }, { x: 312, y: 390 }], { open: 0.52 });
  spawns(g, [256, 340, 342, 396], [['dwarf_guard', 6], ['dwarf_soldier', 4], ['tarantula', 3]], -2);
  region(g, 'Deep Delvings', [256, 340, 342, 396], '20+', -2);
  bossLair(g, 'boss_delving_king', 330, 372, -2);
  // Molten Deep (z−3)
  cave(g, { x: 312, y: 392 }, -3, [270, 348, 334, 396], [{ x: 300, y: 380 }, { x: 284, y: 362 }, { x: 318, y: 358 }], { ground: Ground.Ash, open: 0.5, deco: [[Obj.FireField, 0.015], [Obj.Stalagmite, 0.02]] });
  spawns(g, [270, 348, 334, 396], [['fire_elemental', 4], ['behemoth', 2]], -3);
  b.chest('molten_deep', 318, 357, -3, [{ id: 'fiery_heart', qty: 1 }, { id: 'small_ruby', qty: 3 }, { id: 'gold', qty: 2500 }]);
  region(g, 'Molten Deep', [270, 348, 334, 396], '60+', -3);
  // the mountain flanks
  spawns(g, [250, 338, 280, 398], [['dwarf', 3], ['bear', 2]]);
  spawns(g, [324, 338, 350, 398], [['dwarf', 3], ['wolf', 2]]);
  region(g, 'Greyspine Mountains', [248, 336, 350, 400], '8+');
}

// ================================================================== the south and west of the continent

function centralSouth(g: Gen): void {
  const { b } = g;
  // Sunscar Clearing: the amazon camp in the sands
  const tents = camp(g, [314, 434, 342, 452], { name: 'Amazon', ground: Ground.Sand, gates: ['S', 'W', 'E'], roof: 0x9a3a3a });
  spawns(g, [298, 424, 356, 468], [['amazon', 10], ['valkyrie', 6]]);
  if (tents[1]) b.chest('sunscar_camp', tents[1].x, tents[1].y, 0, [{ id: 'royal_javelin', qty: 20 }, { id: 'small_sapphire', qty: 2 }]);
  region(g, 'Sunscar Clearing', [296, 424, 358, 470], '25+');

  // Westmarch
  spawns(g, [190, 410, 264, 464], [['wolf', 6], ['deer', 6], ['bear', 3], ['snake', 3]]);
  region(g, 'Westmarch Fields', [190, 410, 264, 466], '3+');
  spawns(g, [148, 470, 188, 556], [['tarantula', 7], ['snake', 5]]);
  region(g, 'Mistwood', [148, 470, 189, 556], '15+');
  const bt = camp(g, [158, 448, 182, 464], { name: 'Blackroot', gates: ['E', 'S'] });
  spawns(g, [154, 444, 186, 468], [['bandit', 7]]);
  if (bt[0]) b.chest('blackroot_camp', bt[0].x, bt[0].y, 0, [{ id: 'chain_armor', qty: 1 }, { id: 'gold', qty: 150 }]);
  region(g, 'Blackroot Camp', [154, 444, 186, 468], '10+');
  // Westmarch Catacombs beneath a ruined chapel south of the walls
  const chx = 222, chy = 530;
  g.clearTo(chx - 4, chy - 3, chx + 4, chy + 3, Ground.Stone);
  b.rect(chx - 4, chy - 3, chx + 4, chy + 3, (x, y) => {
    if ((x === chx - 4 || x === chx + 4 || y === chy - 3) && g.rng.chance(0.7)) b.o(x, y, Obj.StoneWall);
  });
  const rooms = crypt(g, { x: chx, y: chy }, -1, [196, 518, 262, 562], 8);
  rooms.slice(1).forEach((r, i) => spawns(g, [r.x - 3, r.y - 2, r.x + 3, r.y + 2], [[i % 2 ? 'ghoul' : 'skeleton', 2]], -1));
  const last = rooms[rooms.length - 1];
  b.chest('westmarch_catacombs', last.x + 1, last.y, -1, [{ id: 'iron_shield', qty: 1 }, { id: 'strong_health_potion', qty: 3 }, { id: 'gold', qty: 200 }]);
  region(g, 'Westmarch Catacombs', [196, 518, 262, 562], '15+', -1);
  bossLair(g, 'boss_bonebound', last.x - 1, last.y, -1);
  spawns(g, [196, 522, 262, 562], [['skeleton', 2], ['snake', 3]]);
  region(g, 'Chapel Hill', [196, 520, 262, 562], '10+');

  // Highmoor
  spawns(g, [440, 444, 492, 502], [['wolf', 5], ['bear', 5], ['deer', 6]]);
  region(g, 'Highmoor Downs', [438, 442, 494, 504], '5+');
  const ot = camp(g, [492, 470, 514, 490], { name: 'Orc', gates: ['W', 'N'] });
  spawns(g, [488, 462, 520, 500], [['orc_warrior', 5], ['orc_berserker', 3], ['orc_shaman', 2], ['orc', 4]]);
  if (ot[0]) b.chest('orc_ridge', ot[0].x, ot[0].y, 0, [{ id: 'orc_warhelm', qty: 1 }, { id: 'gold', qty: 250 }]);
  region(g, 'Orc Ridge', [486, 460, 522, 502], '20+');
  spawns(g, [404, 390, 436, 412], [['deer', 3], ['wolf', 2]]);

  // Millbrook
  const fx = 352, fy = 476;
  g.clearTo(fx, fy, fx + 22, fy + 12, Ground.Crop);
  b.rect(fx, fy, fx + 22, fy + 12, (x, y) => { if ((y - fy) % 2 === 1 && g.rng.chance(0.8)) b.o(x, y, Obj.Wheat); });
  b.outline(fx - 1, fy - 1, fx + 23, fy + 13, Obj.Fence);
  for (const y of [fy + 5, fy + 6]) { b.o(fx - 1, y, Obj.None); b.o(fx + 23, y, Obj.None); }
  b.building(fx + 25, fy + 2, 7, 6, { name: 'Millbrook Barn', roof: 0x6b3a26, wallColor: 0xa77a52, doors: [[fx + 28, fy + 7]] });
  spawns(g, [fx, fy, fx + 22, fy + 12], [['rat', 6]]);
  spawns(g, [330, 460, 404, 492], [['deer', 4], ['wolf', 3], ['snake', 2]]);
  region(g, 'Millbrook Fields', [330, 460, 404, 492], '1+');
  spawns(g, [316, 512, 342, 550], [['tarantula', 7], ['snake', 2]]);
  region(g, 'Spider Glade', [314, 510, 342, 552], '18+');
  const hc = crypt(g, { x: 396, y: 512 }, -1, [376, 494, 414, 548], 6);
  hc.slice(1).forEach((r) => spawns(g, [r.x - 3, r.y - 2, r.x + 3, r.y + 2], [['skeleton', 1], ['ghoul', 1]], -1));
  b.chest('hollow_crypt', hc[hc.length - 1].x, hc[hc.length - 1].y + 1, -1, [{ id: 'bone', qty: 5 }, { id: 'great_health_potion', qty: 2 }, { id: 'gold', qty: 300 }]);
  region(g, 'Hollow Crypt', [376, 494, 414, 548], '15+', -1);
}

// ================================================================== Elderglen and the elves of Silverbough

function elderglenWoods(g: Gen): void {
  const { b, m, rng } = g;
  const x0 = 372, y0 = 300, x1 = 402, y1 = 332;
  g.clearTo(x0, y0, x1, y1, () => (rng.chance(0.5) ? Ground.Grass : Ground.DarkGrass));
  b.rect(x0, y0, x1, y1, (x, y) => { if (rng.chance(0.06)) b.o(x, y, Obj.Tree); else if (rng.chance(0.06)) b.o(x, y, Obj.Fern); });
  b.outline(x0, y0, x1, y1, Obj.Bush);
  b.outline(x0 + 1, y0 + 1, x1 - 1, y1 - 1, Obj.Palisade);
  for (const y of [316, 317]) for (const x of [x1, x1 - 1]) { b.o(x, y, Obj.None); b.g(x, y, Ground.Path); }
  // tree platforms (z+1), bridges, and the warden's crown (z+2)
  const plats: Box[] = [[376, 304, 381, 309], [392, 304, 397, 309], [376, 322, 381, 327], [392, 322, 397, 327], [383, 312, 390, 319]];
  for (const [px0, py0, px1, py1] of plats) {
    b.fill(px0, py0, px1, py1, Ground.Wood, 1);
    b.outline(px0, py0, px1, py1, Obj.Railing, 1);
    b.clear(px0, py0, px1, py1, 0);
    b.ladder(px0 + 1, py1 - 1, 0, [1, 0]);
  }
  const walk = (ax: number, ay: number, bx: number, by: number) => {
    b.rect(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), (x, y) => {
      m.setGround(x, y, Ground.Wood, 1);
      m.setObj(x, y, Obj.None, 1);
    });
  };
  walk(381, 307, 386, 307); walk(386, 307, 386, 312);
  walk(392, 307, 388, 307); walk(388, 307, 388, 312);
  walk(381, 324, 385, 324); walk(385, 319, 385, 324);
  walk(392, 324, 389, 324); walk(389, 319, 389, 324);
  // railings along the bridges
  for (let z = 1; z <= 1; z++) b.rect(374, 302, 400, 330, (x, y) => {
    if (m.getGround(x, y, z) !== Ground.Void) return;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (m.getGround(x + dx, y + dy, z) === Ground.Wood && m.getObj(x + dx, y + dy, z) === Obj.None) {
        m.setGround(x, y, Ground.Wood, z);
        m.setObj(x, y, Obj.Railing, z);
        return;
      }
    }
  });
  b.fill(384, 313, 389, 318, Ground.Wood, 2);
  b.outline(384, 313, 389, 318, Obj.Railing, 2);
  b.ladder(386, 316, 1, [1, 0]);
  b.spawn('elf_warden', 385, 314, 2);
  b.chest('silverbough_crown', 388, 314, 2, [{ id: 'elven_leggings', qty: 1 }, { id: 'small_emerald', qty: 3 }]);
  for (const [px0, py0, px1] of plats.slice(0, 4)) b.spawn(rng.chance(0.5) ? 'elf_scout' : 'elf_arcanist', (px0 + px1) >> 1, py0 + 1, 1);
  // lodges and the vault beneath them
  b.building(394, 312, 6, 5, { name: 'Elf Lodge', roof: 0x3f7a3a, wallColor: 0x8a6a46, doors: [[396, 316]] });
  b.building(374, 312, 6, 5, { name: 'Elf Lodge', roof: 0x3f7a3a, wallColor: 0x8a6a46, doors: [[379, 314]] });
  hiddenCell(g, 377, 330, 0, 'silverbough_vault', [{ id: 'elven_mail', qty: 1 }, { id: 'small_emerald', qty: 2 }], 'elf_arcanist');
  spawns(g, [x0 + 2, y0 + 2, x1 - 2, y1 - 2], [['elf', 7], ['elf_scout', 4], ['elf_arcanist', 2]]);
  region(g, 'Silverbough Fortress', [x0, y0, x1, y1], '15+', -1, 2);
  // the woods around
  spawns(g, [372, 268, 466, 297], [['elf', 5], ['elf_scout', 3], ['deer', 4]]);
  region(g, 'Silverbough Woods', [370, 266, 468, 298], '12+');
  spawns(g, [404, 334, 468, 364], [['bear', 4], ['deer', 4], ['wolf', 4]]);
  region(g, 'Glimmer Vale', [402, 334, 468, 366], '5+');
}

// ================================================================== the frozen isles

function frozenNorth(g: Gen): void {
  const { b, m } = g;
  // Snowpine Reach: the eastern arm beyond Valdrheim
  spawns(g, [188, 16, 268, 60], [['silver_rabbit', 8], ['dire_penguin', 5], ['winter_wolf', 5], ['polar_bear', 2]]);
  region(g, 'Snowpine Reach', [186, 14, 270, 62], '5+');
  bridge(g, 257, 50, 262, 72);
  spawns(g, [254, 70, 270, 88], [['dire_penguin', 4]]);
  region(g, 'Penguin Rock', [252, 68, 272, 90], '8+');
  // Frostfang Glacier and the frost dragons beneath it
  spawns(g, [54, 66, 112, 126], [['ice_golem', 5], ['winter_wolf', 3], ['frost_dragon', 2]]);
  region(g, 'Frostfang Glacier', [52, 64, 114, 128], '40+');
  cave(g, { x: 98, y: 112 }, -1, [54, 68, 112, 126], [{ x: 86, y: 104 }, { x: 70, y: 92 }, { x: 64, y: 76 }, { x: 90, y: 80 }, { x: 104, y: 92 }], { ground: Ground.Ice, deco: [[Obj.Stalagmite, 0.03], [Obj.Bones, 0.015]] });
  spawns(g, [54, 68, 112, 126], [['frost_dragon', 7], ['ice_golem', 2]], -1);
  b.chest('frostfang_hoard', 64, 76, -1, [{ id: 'rod_of_glaciers', qty: 1 }, { id: 'small_sapphire', qty: 4 }, { id: 'gold', qty: 3000 }]);
  region(g, 'Frost Dragon Lair', [54, 68, 112, 126], '60+', -1);
  bossLair(g, 'boss_rime_wyrm', 66, 78, -1);
  // Crystal Mines under the central peaks
  cave(g, { x: 136, y: 72 }, -1, [106, 52, 150, 140], [{ x: 126, y: 80 }, { x: 118, y: 104 }, { x: 130, y: 126 }, { x: 140, y: 100 }], { deco: [[Obj.Stalagmite, 0.04]] });
  spawns(g, [106, 52, 150, 140], [['crystal_spider', 8], ['ice_golem', 3], ['frostkin_toolshaper', 3], ['frostkin', 3]], -1);
  region(g, 'Crystal Mines', [106, 52, 150, 140], '35+', -1);
  cave(g, { x: 130, y: 126 }, -2, [108, 70, 148, 136], [{ x: 122, y: 112 }, { x: 116, y: 88 }, { x: 134, y: 84 }], { open: 0.5 });
  spawns(g, [108, 70, 148, 136], [['crystal_spider', 6], ['ice_golem', 2]], -2);
  b.chest('crystal_heart', 134, 84, -2, [{ id: 'frost_pendant', qty: 1 }, { id: 'small_diamond', qty: 2 }]);
  region(g, 'Crystal Depths', [108, 70, 148, 136], '50+', -2);
  // Skullfell: the barbarian camp
  const bt = camp(g, [70, 128, 96, 146], { name: 'Barbarian', ground: Ground.Snow, gates: ['N', 'E', 'S'] });
  spawns(g, [62, 124, 104, 152], [['barbarian_raider', 6], ['barbarian_skullhunter', 4], ['barbarian_brutetamer', 3], ['barbarian_headsplitter', 2], ['polar_bear', 2], ['winter_wolf', 3]]);
  if (bt[0]) b.chest('skullfell_camp', bt[0].x, bt[0].y, 0, [{ id: 'battle_axe', qty: 1 }, { id: 'gold', qty: 400 }]);
  region(g, 'Skullfell', [60, 122, 106, 154], '20+');
  // Hexspire: the ice witch's tower
  const fl = tower(g, 58, 160, 7, 7, 3, 'Hexspire', { roof: 0x4a6a9a, wall: 0xc8d8e8 });
  b.spawn('frostkin_windcaller', fl[0].x + 1, fl[0].y + 1, 0);
  b.spawn('ice_witch', fl[1].x, fl[1].y + 1, 1);
  b.spawn('ice_witch', fl[2].x, fl[2].y + 1, 2);
  b.chest('hexspire_top', 58 + 5, 160 + 5, 2, [{ id: 'mage_robe', qty: 1 }, { id: 'wand_of_storms', qty: 1 }]);
  spawns(g, [36, 150, 80, 178], [['winter_wolf', 3], ['silver_rabbit', 4]]);
  region(g, 'Hexspire', [56, 158, 66, 168], '30+', 0, 2);
  region(g, 'Frostholm Fields', [32, 140, 82, 180], '5+');
  // Jotun Isle: the giants
  spawns(g, [194, 72, 250, 134], [['frost_giant', 7], ['frost_giantess', 5]]);
  cave(g, { x: 212, y: 128 }, -1, [200, 82, 246, 134], [{ x: 220, y: 116 }, { x: 230, y: 98 }, { x: 214, y: 90 }]);
  spawns(g, [200, 82, 246, 134], [['frost_giant', 3], ['frost_giantess', 1]], -1);
  b.chest('jotun_cave', 214, 90, -1, [{ id: 'war_hammer', qty: 1 }, { id: 'small_sapphire', qty: 2 }, { id: 'gold', qty: 1200 }]);
  region(g, 'Jotun Isle', [192, 70, 252, 156], '40+', -1, 0);
  // the Frostkin Floes: icy skerries joined by frozen bridges
  bridge(g, 128, 150, 146, 170);
  bridge(g, 156, 170, 166, 166);
  bridge(g, 176, 164, 186, 158);
  spawns(g, [140, 150, 200, 180], [['frostkin', 6], ['frostkin_toolshaper', 3], ['frostkin_windcaller', 3]]);
  b.chest('frostkin_cache', 190, 156, 0, [{ id: 'spider_silk', qty: 3 }, { id: 'great_mana_potion', qty: 2 }]);
  region(g, 'Frostkin Floes', [138, 148, 202, 182], '25+');
  spawns(g, [112, 20, 186, 70], [['silver_rabbit', 3], ['winter_wolf', 2], ['frostkin', 4], ['dire_penguin', 3]]);
  region(g, 'Valdrheim Outskirts', [110, 18, 187, 72], '3+');
  m.setObj(190, 156, Obj.Chest);
}

// ================================================================== Aurelion and its island

function capital(g: Gen, towns: TownSet): void {
  const { b } = g;
  spawns(g, [320, 34, 345, 84], [['fire_elemental', 4], ['ghoul', 3]]);
  region(g, 'Ashfall Fields', [318, 32, 345, 86], '30+');
  const a = towns.ctx.aurelion;
  // sewers (z−1) and catacombs (z−2) beneath the city
  const ex = a.cx - 26, ey = a.cy + 20;
  const sew = g.b.dungeon(352, 40, 434, 120, -1, 10, Ground.Stone);
  b.tunnel(ex + 1, ey, sew[0].x, sew[0].y, -1, Ground.Stone);
  b.rect(352, 40, 434, 120, (x, y) => { if (g.m.getGround(x, y, -1) === Ground.Stone && g.rng.chance(0.06)) g.m.setGround(x, y, Ground.Swamp, -1); });
  sew.slice(1).forEach((r, i) => spawns(g, [r.x - 3, r.y - 2, r.x + 3, r.y + 2], [[(['rat', 'rat', 'ghoul', 'skeleton', 'tarantula'] as EnemyKind[])[i % 5], 2]], -1));
  region(g, 'Aurelion Sewers', [352, 40, 434, 120], '8+', -1);
  const deep = sew[sew.length - 1];
  const cat = crypt(g, deep, -2, [356, 44, 430, 116], 8);
  cat.slice(1).forEach((r, i) => spawns(g, [r.x - 3, r.y - 2, r.x + 3, r.y + 2], [[i % 2 ? 'ghoul' : 'skeleton', 2]], -2));
  b.chest('aurelion_catacombs', cat[cat.length - 1].x, cat[cat.length - 1].y + 1, -2, [{ id: 'bastard_sword', qty: 1 }, { id: 'small_diamond', qty: 1 }, { id: 'gold', qty: 600 }]);
  region(g, 'Aurelion Catacombs', [356, 44, 430, 116], '20+', -2);
  spawns(g, [440, 60, 466, 152], [['deer', 5], ['bear', 3], ['wolf', 4]]);
  region(g, 'Royal Hunting Grounds', [440, 58, 468, 154], '5+');
  spawns(g, [330, 100, 352, 150], [['wolf', 3], ['snake', 3]]);
}

// ================================================================== the north-east: Emberhold and the wilds of Briarwatch

function northEast(g: Gen): void {
  const { b, m, rng } = g;
  // Emberhold: a walled fortress inside a moat of lava
  const x0 = 487, y0 = 30, x1 = 525, y1 = 116;
  g.clearTo(x0, y0, x1, y1, Ground.Ash);
  b.rect(x0, y0, x1, y1, (x, y) => {
    const edge = Math.min(x - x0, x1 - x, y - y0, y1 - y);
    if (edge <= 1) m.setGround(x, y, Ground.Lava);
    else if (edge === 3) m.setObj(x, y, Obj.StoneWall);
  });
  // the gate and a stone bridge over the lava
  for (const x of [505, 506, 507]) for (let y = y1 - 3; y <= y1 + 2; y++) { m.setGround(x, y, Ground.Stone); m.setObj(x, y, Obj.None); }
  for (const x of [504, 508]) { m.setObj(x, y1 - 3, Obj.Pillar); }
  b.rect(x0 + 4, y0 + 4, x1 - 4, y1 - 4, (x, y) => {
    if (m.getObj(x, y) !== Obj.None) return;
    const r = rng.next();
    if (r < 0.012) m.setObj(x, y, Obj.FireField);
    else if (r < 0.03) m.setObj(x, y, Obj.Bones);
    else if (r < 0.04) m.setGround(x, y, Ground.Lava);
  });
  // the keep: throne hall above, forge below
  const kx = 496, ky = 48, kw = 21, kh = 15;
  b.building(kx, ky, kw, kh, { name: 'Emberhold Keep', stone: true, wall: Obj.StoneWall, floor: Ground.Stone, doors: [[kx + 10, ky + kh - 1]], noRoof: true });
  for (const [px, py] of [[kx + 5, ky + 4], [kx + 15, ky + 4], [kx + 5, ky + 10], [kx + 15, ky + 10]]) m.setObj(px, py, Obj.Pillar);
  b.building(kx, ky, kw, kh, { z: 1, name: 'Ember Throne', stone: true, wall: Obj.StoneWall, floor: Ground.Stone, roof: 0x5a2a1a });
  b.stairs({ x: kx + 2, y: ky + 2, z: 0 }, { x: kx + 2, y: ky + 2, z: 1 }, [1, 1], [1, 1]);
  m.setObj(kx + 10, ky + 2, Obj.Altar, 1);
  b.spawn('dragon_lord', kx + 10, ky + 7, 1);
  b.spawn('fire_elemental', kx + 15, ky + 10, 1);
  b.chest('ember_throne', kx + kw - 2, ky + 1, 1, [{ id: 'emberwalk_boots', qty: 1 }, { id: 'small_ruby', qty: 3 }, { id: 'gold', qty: 2000 }]);
  spawns(g, [x0 + 5, y0 + 5, x1 - 5, y1 - 5], [['fire_elemental', 8], ['dragon', 2]]);
  region(g, 'Emberhold', [x0, y0, x1, y1], '50+', 0, 1);
  const fx = kx + kw - 3, fy = ky + kh - 3;
  cave(g, { x: fx, y: fy }, -1, [x0, y0, x1, y1], [{ x: 505, y: 80 }, { x: 498, y: 100 }, { x: 515, y: 96 }, { x: 494, y: 40 }], { ground: Ground.Ash, deco: [[Obj.FireField, 0.012], [Obj.Stalagmite, 0.02]] });
  spawns(g, [x0, y0, x1, y1], [['behemoth', 3], ['fire_elemental', 4]], -1);
  region(g, 'Ember Forge', [x0, y0, x1, y1], '65+', -1);
  cave(g, { x: 498, y: 100 }, -2, [x0 + 2, 60, x1 - 2, y1], [{ x: 510, y: 90 }, { x: 500, y: 72 }], { ground: Ground.Ash, open: 0.5, deco: [[Obj.FireField, 0.02]] });
  spawns(g, [x0 + 2, 60, x1 - 2, y1], [['behemoth', 2], ['fire_elemental', 3]], -2);
  b.chest('infernal_rift', 500, 72, -2, [{ id: 'demon_horn', qty: 1 }, { id: 'small_diamond', qty: 3 }, { id: 'gold', qty: 4000 }]);
  region(g, 'Infernal Rift', [x0 + 2, 60, x1 - 2, y1], '80+', -2);

  // Briar Hills and the charred wood to the north
  spawns(g, [528, 98, 610, 138], [['wolf', 5], ['bear', 4], ['bandit', 5]]);
  region(g, 'Briar Hills', [526, 96, 612, 138], '8+');
  spawns(g, [530, 16, 610, 62], [['ghoul', 4], ['skeleton', 4], ['deer', 3]]);
  region(g, 'Charwood', [528, 14, 612, 64], '12+');
  // Scalemire: the lizard swamp
  spawns(g, [560, 176, 620, 250], [['lizard_sentinel', 7], ['lizard_templar', 3], ['crocodile', 5], ['snake', 3]]);
  const lx = 590, ly = 206;
  b.rect(lx - 6, ly - 5, lx + 6, ly + 5, (x, y) => {
    m.setGround(x, y, rng.chance(0.6) ? Ground.Stone : Ground.Swamp);
    const border = x === lx - 6 || x === lx + 6 || y === ly - 5 || y === ly + 5;
    m.setObj(x, y, border && rng.chance(0.6) ? Obj.StoneWall : Obj.None);
  });
  for (const [px, py] of [[lx - 3, ly - 2], [lx + 3, ly - 2], [lx - 3, ly + 2], [lx + 3, ly + 2]]) m.setObj(px, py, Obj.Pillar);
  const sanct = crypt(g, { x: lx, y: ly }, -1, [lx - 22, ly - 18, lx + 20, ly + 20], 5);
  sanct.slice(1).forEach((r) => spawns(g, [r.x - 2, r.y - 2, r.x + 2, r.y + 2], [['lizard_templar', 1], ['lizard_sentinel', 1]], -1));
  b.chest('scalemire_sanctum', sanct[sanct.length - 1].x, sanct[sanct.length - 1].y + 1, -1, [{ id: 'jade_amulet', qty: 1 }, { id: 'small_emerald', qty: 3 }]);
  region(g, 'Scalemire', [558, 174, 622, 252], '25+');
  region(g, 'Scalemire Sanctum', [lx - 22, ly - 18, lx + 20, ly + 20], '35+', -1);
  // Minotaur Hold in the rocky west
  const hx0 = 466, hy0 = 166, hx1 = 494, hy1 = 192;
  g.clearTo(hx0, hy0, hx1, hy1, () => (rng.chance(0.3) ? Ground.Dirt : Ground.Stone));
  b.outline(hx0, hy0, hx1, hy1, Obj.StoneWall);
  for (const y of [178, 179]) { m.setObj(hx1, y, Obj.None); m.setGround(hx1, y, Ground.Path); }
  for (const [tx, ty] of [[hx0 + 2, hy0 + 2], [hx1 - 7, hy0 + 2], [hx0 + 2, hy1 - 6]]) {
    b.building(tx, ty, 6, 5, { name: 'Minotaur Barracks', stone: true, roof: 0x6a4a3a, wallColor: 0x9a8a7a, doors: [[tx + 3, ty + 4 === hy1 - 2 ? ty : ty + 4]] });
  }
  const mh = crypt(g, { x: hx1 - 5, y: hy1 - 4 }, -1, [452, 150, 508, 210], 7);
  mh.slice(1).forEach((r, i) => spawns(g, [r.x - 3, r.y - 2, r.x + 3, r.y + 2], [[i % 3 === 2 ? 'minotaur_mage' : 'minotaur', 2]], -1));
  b.chest('minotaur_hold', mh[mh.length - 1].x, mh[mh.length - 1].y + 1, -1, [{ id: 'plate_legs', qty: 1 }, { id: 'gold', qty: 700 }]);
  bossLair(g, 'boss_labyrinth_lord', mh[mh.length - 1].x - 1, mh[mh.length - 1].y - 1, -1);
  spawns(g, [hx0 + 1, hy0 + 1, hx1 - 1, hy1 - 1], [['minotaur', 6], ['minotaur_archer', 4], ['minotaur_mage', 3]]);
  spawns(g, [448, 140, 512, 226], [['minotaur', 4], ['minotaur_archer', 2]]);
  region(g, 'Minotaur Hold', [446, 138, 514, 228], '25+', -1, 0);
  g.route(hx1 + 1, 178, 551, 153);
}

// ================================================================== the isle of Corvane and Gull Isle

function eastIsle(g: Gen): void {
  const { b } = g;
  const t = camp(g, [548, 268, 574, 286], { name: 'Amazon', gates: ['S', 'E'], roof: 0x9a3a3a });
  spawns(g, [514, 258, 600, 298], [['amazon', 8], ['valkyrie', 5]]);
  if (t[0]) b.chest('amazon_wilds', t[0].x, t[0].y, 0, [{ id: 'composite_bow', qty: 1 }, { id: 'gold', qty: 300 }]);
  region(g, 'Amazon Wilds', [512, 256, 602, 299], '20+');
  spawns(g, [514, 335, 600, 370], [['deer', 4], ['snake', 4], ['bear', 3]]);
  region(g, 'Corvane Grove', [512, 334, 602, 372], '4+');
  spawns(g, [582, 380, 622, 418], [['bandit', 6]]);
  const sc = crypt(g, { x: 604, y: 392 }, -1, [586, 380, 622, 416], 4);
  spawns(g, [sc[1].x - 2, sc[1].y - 2, sc[1].x + 2, sc[1].y + 2], [['bandit', 2]], -1);
  b.chest('smugglers_cove', sc[sc.length - 1].x, sc[sc.length - 1].y + 1, -1, [{ id: 'golden_goblet', qty: 1 }, { id: 'gold', qty: 400 }]);
  region(g, "Smugglers' Cove", [580, 378, 624, 418], '10+', -1, 0);
}

// ================================================================== the western isles

function westIsles(g: Gen): void {
  const { b } = g;
  spawns(g, [52, 436, 134, 488], [['snake', 4], ['deer', 4], ['bear', 3], ['wolf', 3]]);
  region(g, 'Fernwick Isle', [50, 434, 136, 492], '4+');
  cave(g, { x: 70, y: 452 }, -1, [54, 438, 120, 486], [{ x: 84, y: 448 }, { x: 102, y: 460 }, { x: 88, y: 476 }]);
  spawns(g, [54, 438, 120, 486], [['tarantula', 5], ['snake', 2]], -1);
  b.chest('fernwick_cave', 88, 476, -1, [{ id: 'poison_arrow', qty: 50 }, { id: 'small_emerald', qty: 1 }]);
  region(g, 'Fernwick Cave', [54, 438, 120, 486], '15+', -1);
  // Cyclops Isle
  spawns(g, [34, 536, 78, 574], [['cyclops', 7]]);
  cave(g, { x: 46, y: 548 }, -1, [34, 538, 76, 572], [{ x: 54, y: 556 }, { x: 64, y: 566 }], { ground: Ground.Ash, deco: [[Obj.Bones, 0.03]] });
  spawns(g, [34, 538, 76, 572], [['cyclops', 3]], -1);
  b.chest('cyclops_forge', 64, 566, -1, [{ id: 'war_hammer', qty: 1 }, { id: 'gold', qty: 500 }]);
  region(g, 'Cyclops Isle', [32, 534, 80, 576], '25+', -1, 0);
  // Cinder Isle
  spawns(g, [76, 612, 130, 654], [['fire_elemental', 5], ['dragon', 3]]);
  cave(g, { x: 110, y: 640 }, -1, [78, 614, 128, 652], [{ x: 98, y: 632 }, { x: 86, y: 622 }], { ground: Ground.Ash, deco: [[Obj.FireField, 0.01], [Obj.Stalagmite, 0.03]] });
  spawns(g, [78, 614, 128, 652], [['behemoth', 2], ['fire_elemental', 2]], -1);
  b.chest('cinder_isle', 86, 622, -1, [{ id: 'wand_of_embers', qty: 1 }, { id: 'small_ruby', qty: 2 }]);
  region(g, 'Cinder Isle', [74, 610, 132, 656], '40+', -1, 0);
}

// ================================================================== Saltmere, the Ruins of Varkh and the southern isles

function southIsles(g: Gen): void {
  const { b, m } = g;
  // the Ruins of Varkh and the Descent beneath
  stamp(m, legacyDescent(), 14, 108, 52, 140, 194, 554, { underground: [6, 98, 72, 162] });
  region(g, 'Ruins of Varkh', [208, 662, 246, 694], '10+');
  region(g, 'The Crypt', [200, 652, 266, 716], '25+', -1);
  region(g, 'Burning Catacombs', [200, 652, 266, 716], '45+', -2);
  region(g, 'Abyssal Halls', [200, 652, 266, 716], '65+', -3);
  region(g, 'The Demon Pit', [200, 652, 266, 716], '100+', -4);
  bossLair(g, 'boss_ashen_sovereign', 233, 684, -4);
  spawns(g, [130, 700, 206, 728], [['snake', 4], ['wolf', 3], ['deer', 3]]);
  region(g, 'Saltmere Shore', [128, 700, 206, 730], '3+');
  // Bonecrag
  spawns(g, [28, 706, 98, 778], [['ghoul', 5], ['skeleton', 5]]);
  cave(g, { x: 56, y: 730 }, -1, [30, 708, 96, 776], [{ x: 70, y: 744 }, { x: 52, y: 760 }, { x: 80, y: 766 }], { deco: [[Obj.Bones, 0.04], [Obj.Grave, 0.01]] });
  spawns(g, [30, 708, 96, 776], [['behemoth', 2], ['ghoul', 3]], -1);
  b.chest('bone_pit', 80, 766, -1, [{ id: 'demonbone_amulet', qty: 1 }, { id: 'gold', qty: 1500 }]);
  region(g, 'Bonecrag', [26, 704, 100, 780], '20+', -1, 0);
  // Dune Isles
  spawns(g, [202, 754, 252, 794], [['scorpion', 5], ['scarab', 3], ['snake', 3]]);
  hiddenCell(g, 236, 780, 0, 'dune_tomb', [{ id: 'golden_goblet', qty: 2 }, { id: 'gold', qty: 600 }], 'mummy');
  region(g, 'Dune Isles', [200, 752, 254, 796], '15+');
}

// ================================================================== the jungle around Palmreach

function jungle(g: Gen): void {
  const { b, m, rng } = g;
  spawns(g, [290, 590, 470, 790], [['jungle_troll', 12], ['tarantula', 6], ['snake', 6]]);
  // crocodiles along the river banks
  let crocs = 0;
  for (let i = 0; i < 4000 && crocs < 10; i++) {
    const x = rng.int(300, 470), y = rng.int(600, 780);
    if (!m.isWalkable(x, y) || g.protectMask[y * g.W + x]) continue;
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.getGround(x + dx * 2, y + dy * 2) === Ground.Water)) continue;
    g.spawn('crocodile', 1, x, y, x, y);
    crocs++;
  }
  region(g, 'Palmreach Jungle', [284, 586, 500, 792], '20+');
  // the Lizard Temple
  const tx = 412, ty = 612;
  b.rect(tx - 9, ty - 7, tx + 9, ty + 7, (x, y) => {
    m.setGround(x, y, rng.chance(0.55) ? Ground.Stone : Ground.Jungle);
    const border = x === tx - 9 || x === tx + 9 || y === ty - 7 || y === ty + 7;
    m.setObj(x, y, border && rng.chance(0.6) ? Obj.StoneWall : Obj.None);
  });
  for (const [px, py] of [[tx - 5, ty - 3], [tx + 5, ty - 3], [tx - 5, ty + 3], [tx + 5, ty + 3]]) m.setObj(px, py, Obj.Pillar);
  m.setObj(tx, ty - 5, Obj.Altar);
  for (const y of [ty, ty + 1]) m.setObj(tx + 9, y, Obj.None);
  spawns(g, [tx - 14, ty - 12, tx + 14, ty + 12], [['lizard_sentinel', 6], ['lizard_templar', 4]]);
  const lt = crypt(g, { x: tx - 2, y: ty + 2 }, -1, [tx - 24, ty - 18, tx + 24, ty + 18], 6);
  lt.slice(1).forEach((r) => spawns(g, [r.x - 2, r.y - 2, r.x + 2, r.y + 2], [['lizard_templar', 1]], -1));
  b.chest('lizard_temple', lt[lt.length - 1].x, lt[lt.length - 1].y + 1, -1, [{ id: 'jade_amulet', qty: 1 }, { id: 'small_emerald', qty: 2 }, { id: 'gold', qty: 800 }]);
  region(g, 'Lizard Temple', [tx - 14, ty - 12, tx + 14, ty + 12], '30+');
  region(g, 'Temple Undercroft', [tx - 24, ty - 18, tx + 24, ty + 18], '40+', -1);
  bossLair(g, 'boss_venom_oracle', lt[lt.length - 1].x - 1, lt[lt.length - 1].y - 1, -1);
  // the Hydra Bog, the Mire Caves and the Hydra Nest
  spawns(g, [414, 668, 466, 712], [['hydra', 4], ['crocodile', 2]]);
  region(g, 'Hydra Bog', [412, 666, 468, 714], '50+');
  cave(g, { x: 418, y: 676 }, -1, [398, 646, 472, 728], [{ x: 430, y: 690 }, { x: 452, y: 668 }, { x: 460, y: 700 }, { x: 440, y: 716 }, { x: 412, y: 706 }]);
  b.rect(398, 646, 472, 728, (x, y) => { if (m.getGround(x, y, -1) === Ground.Cave && rng.chance(0.06)) m.setGround(x, y, Ground.Swamp, -1); });
  spawns(g, [398, 646, 472, 728], [['hydra', 4], ['crocodile', 3], ['tarantula', 4]], -1);
  region(g, 'Mire Caves', [398, 646, 472, 728], '45+', -1);
  cave(g, { x: 452, y: 668 }, -2, [414, 652, 468, 724], [{ x: 446, y: 690 }, { x: 430, y: 712 }], { open: 0.58 });
  spawns(g, [414, 652, 468, 724], [['hydra', 5]], -2);
  b.chest('hydra_nest', 430, 712, -2, [{ id: 'hydra_egg', qty: 2 }, { id: 'rod_of_glaciers', qty: 1 }, { id: 'small_sapphire', qty: 3 }]);
  b.ropeSpot(428, 714, -2, [0, -1]);
  region(g, 'Hydra Nest', [414, 652, 468, 724], '60+', -2);
  bossLair(g, 'boss_mire_hydra', 446, 690, -2);
  // the southern mangroves
  spawns(g, [332, 744, 390, 778], [['crocodile', 4], ['snake', 3]]);
  region(g, 'Mangrove Mire', [330, 742, 392, 780], '22+');
  // Temple of the Sunken Eye
  const sx = 362, sy = 646;
  b.rect(sx - 7, sy - 6, sx + 7, sy + 6, (x, y) => {
    m.setGround(x, y, rng.chance(0.5) ? Ground.Stone : Ground.Jungle);
    const border = x === sx - 7 || y === sy - 6 || x === sx + 7 || y === sy + 6;
    m.setObj(x, y, border && rng.chance(0.55) ? Obj.StoneWall : Obj.None);
  });
  m.setObj(sx, sy - 4, Obj.Altar);
  spawns(g, [sx - 10, sy - 9, sx + 10, sy + 9], [['amazon', 4], ['jungle_troll', 3]]);
  b.chest('sunken_eye', sx + 1, sy - 4, 0, [{ id: 'healing_rune', qty: 10 }, { id: 'gold', qty: 250 }]);
  region(g, 'Temple of the Sunken Eye', [sx - 7, sy - 6, sx + 7, sy + 6], '25+');
}

// ================================================================== the desert of Sunspire

function desert(g: Gen): void {
  const { b, m } = g;
  spawns(g, [540, 505, 607, 620], [['scorpion', 7], ['snake', 3]]);
  region(g, 'Northern Dunes', [538, 503, 609, 622], '12+');
  const dr = camp(g, [560, 588, 584, 604], { name: 'Raider', ground: Ground.Sand, gates: ['N', 'W'], roof: 0xb8863a });
  spawns(g, [556, 584, 590, 610], [['bandit', 7]]);
  if (dr[0]) b.chest('dune_raiders', dr[0].x, dr[0].y, 0, [{ id: 'light_crossbow', qty: 1 }, { id: 'gold', qty: 350 }]);
  region(g, 'Dune Raider Camp', [556, 584, 590, 610], '15+');
  // the Scorched Crags and the Behemoth Halls below
  spawns(g, [470, 600, 514, 724], [['cyclops', 4], ['scorpion', 2]]);
  region(g, 'Scorched Crags', [468, 598, 516, 726], '30+');
  cave(g, { x: 512, y: 640 }, -1, [470, 610, 516, 722], [{ x: 496, y: 650 }, { x: 486, y: 676 }, { x: 498, y: 704 }], { ground: Ground.Ash, deco: [[Obj.Stalagmite, 0.03], [Obj.Bones, 0.02]] });
  spawns(g, [470, 610, 516, 722], [['behemoth', 4], ['fire_elemental', 3]], -1);
  region(g, 'Behemoth Halls', [470, 610, 516, 722], '70+', -1);
  cave(g, { x: 498, y: 704 }, -2, [472, 640, 514, 720], [{ x: 488, y: 684 }, { x: 494, y: 660 }], { ground: Ground.Ash, open: 0.52 });
  spawns(g, [472, 640, 514, 720], [['behemoth', 3]], -2);
  b.chest('behemoth_halls', 494, 660, -2, [{ id: 'plate_armor', qty: 1 }, { id: 'small_diamond', qty: 3 }, { id: 'gold', qty: 3000 }]);
  region(g, 'Behemoth Depths', [472, 640, 514, 720], '85+', -2);
  // the southern dunes and the Valley of Tombs
  spawns(g, [516, 612, 605, 716], [['scorpion', 8], ['scarab', 5], ['snake', 3]]);
  region(g, 'Sunspire Dunes', [514, 610, 607, 718], '15+');
  hiddenCell(g, 526, 676, 0, 'valley_tomb_1', [{ id: 'golden_goblet', qty: 1 }, { id: 'small_ruby', qty: 1 }], 'mummy');
  hiddenCell(g, 540, 694, 0, 'valley_tomb_2', [{ id: 'mana_potion', qty: 5 }, { id: 'small_sapphire', qty: 1 }], 'mummy');
  spawns(g, [516, 664, 552, 706], [['mummy', 3]]);
  region(g, 'Valley of Tombs', [514, 662, 554, 708], '30+');
  // the Pyramid of Kesh: three floors up, three floors down
  const px = 562, py = 640, n = 21;
  g.clearTo(px - 2, py - 2, px + n + 1, py + n + 1, Ground.Sand);
  b.building(px, py, n, n, { name: 'Pyramid of Kesh', stone: true, wall: Obj.SandWall, floor: Ground.Sand, noRoof: true, doors: [[px + 10, py + n - 1]] });
  for (let z = 1; z <= 2; z++) {
    const k = z * 3;
    b.fill(px + k, py + k, px + n - 1 - k, py + n - 1 - k, Ground.Sand, z);
    b.outline(px + k, py + k, px + n - 1 - k, py + n - 1 - k, Obj.SandWall, z);
  }
  b.stairs({ x: px + 4, y: py + 4, z: 0 }, { x: px + 4, y: py + 4, z: 1 }, [1, 1], [1, 1]);
  b.stairs({ x: px + 7, y: py + 7, z: 1 }, { x: px + 7, y: py + 7, z: 2 }, [1, 1], [1, 1]);
  b.chest('kesh_apex', px + 10, py + 10, 2, [{ id: 'sunstone_ring', qty: 1 }, { id: 'gold', qty: 800 }]);
  b.spawn('mummy', px + 12, py + 8, 1);
  b.spawn('scarab', px + 13, py + 12, 1);
  for (const [ix, iy] of [[px + 5, py + 10], [px + 15, py + 10]]) m.setObj(ix, iy, Obj.Pillar);
  spawns(g, [px + 1, py + 1, px + n - 2, py + n - 2], [['scarab', 3], ['mummy', 2]]);
  const t1 = crypt(g, { x: px + 10, y: py + 6 }, -1, [546, 626, 600, 680], 7, Ground.Sand);
  t1.slice(1).forEach((r, i) => spawns(g, [r.x - 3, r.y - 2, r.x + 3, r.y + 2], [[i % 2 ? 'scarab' : 'mummy', 2]], -1));
  const t2 = crypt(g, t1[t1.length - 1], -2, [548, 628, 598, 678], 6, Ground.Sand);
  t2.slice(1).forEach((r, i) => spawns(g, [r.x - 3, r.y - 2, r.x + 3, r.y + 2], [[i % 2 ? 'ghoul' : 'mummy', 2]], -2));
  const t3 = crypt(g, t2[t2.length - 1], -3, [552, 632, 594, 674], 4, Ground.Marble);
  t3.slice(1).forEach((r) => spawns(g, [r.x - 2, r.y - 2, r.x + 2, r.y + 2], [['mummy', 2]], -3));
  b.spawn('behemoth', t3[t3.length - 1].x, t3[t3.length - 1].y, -3);
  b.chest('pharaohs_vault', t3[t3.length - 1].x + 2, t3[t3.length - 1].y, -3, [{ id: 'kings_edge', qty: 1 }, { id: 'small_diamond', qty: 4 }, { id: 'gold', qty: 6000 }]);
  bossLair(g, 'boss_sand_king', t3[t3.length - 1].x - 2, t3[t3.length - 1].y, -3);
  region(g, 'Pyramid of Kesh', [px - 2, py - 2, px + n + 1, py + n + 1], '30+', 0, 2);
  region(g, 'Tomb of Kesh', [546, 626, 600, 680], '35+', -1);
  region(g, 'Kesh Catacombs', [548, 628, 598, 678], '50+', -2);
  region(g, "Pharaoh's Vault", [552, 632, 594, 674], '75+', -3);
  g.route(px + 10, py + n, 537, 719);
}

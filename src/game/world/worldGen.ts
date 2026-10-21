import { hash2, Rng } from '../core/rng';
import { DIRS8 } from '../core/types';
import { Builder } from './build';
import { buildVillage, MAP_H as VH, MAP_W as VW } from './villageMap';
import { Ground, Obj, WorldMap } from './WorldMap';

/**
 * The world of Thornvale — one connected map across seven floors.
 *
 *   Thornvale (city, depot, bank, shops, harbour)       beginners
 *   Howling Hills (wolves), farm, graveyard               levels 1–10
 *   Grimtusk Fortress: walls, towers (z+1), keep (z+1, z−1)  orcs 10–40
 *   Grimpeak Mountains: plateau (z+1), watchtower (z+2), caves (z−1)
 *   Watchpost Brann (outpost)
 *   Silverbough Fortress: tree platforms (z+1/z+2), bridges, hidden grove, vault (z−1)   elves 15–45
 *   Cinderreach + The Caldera                              dragons 35+, dragon lords 70+
 *   Ruins of Varkh → the Descent (z−1 … z−4)              ghouls → fire elementals → behemoths → demons
 *   Palmreach (jungle port, by ship) and the jungle: rivers, swamps, ruins,
 *     Mire Caves (z−1) and the Hydra Nest (z−2)            crocodiles, tarantulas, trolls, hydras
 */
export const WORLD_W = 224;
export const WORLD_H = 176;
const OX = 64;
const OY = 50;

export function buildWorld(seed = 4242): WorldMap {
  const m = new WorldMap(WORLD_W, WORLD_H);
  const rng = new Rng(seed);
  const b = new Builder(m, rng);

  // --- terrain: meadows, sea and the jungle continent -------------------------
  const jungleLand = (x: number, y: number) => {
    const n = Math.floor(hash2(x >> 2, y >> 2, 99) * 4);
    return x >= 140 + n && x <= 219 && y >= 100 + n && y <= 171 - (n >> 1);
  };
  const isSea = (x: number, y: number) => (y >= 150 || (x >= 128 && y >= 94)) && !jungleLand(x, y);
  b.rect(0, 0, WORLD_W - 1, WORLD_H - 1, (x, y) => {
    if (isSea(x, y)) {
      b.g(x, y, Ground.DeepWater);
      return;
    }
    b.g(x, y, rng.chance(0.14) ? Ground.DarkGrass : Ground.Grass);
  });
  // shallow water and beaches along every coast
  b.rect(0, 0, WORLD_W - 1, WORLD_H - 1, (x, y) => {
    const g = m.getGround(x, y);
    if (g === Ground.DeepWater) {
      if (DIRS8.some(([dx, dy]) => m.inBounds(x + dx, y + dy) && m.getGround(x + dx, y + dy) !== Ground.DeepWater && m.getGround(x + dx, y + dy) !== Ground.Water)) b.g(x, y, Ground.Water);
    }
  });
  b.rect(0, 0, WORLD_W - 1, WORLD_H - 1, (x, y) => {
    const g = m.getGround(x, y);
    if (g !== Ground.Water && g !== Ground.DeepWater && DIRS8.some(([dx, dy]) => m.getGround(x + dx, y + dy) === Ground.Water)) b.g(x, y, Ground.Sand);
  });
  // jungle ground
  b.rect(140, 100, 219, 171, (x, y) => {
    const g = m.getGround(x, y);
    if (g === Ground.Grass || g === Ground.DarkGrass) b.g(x, y, rng.chance(0.3) ? Ground.DarkGrass : Ground.Jungle);
  });
  b.scatter(0, 0, 139, 149, [[Obj.Tree, 0.05], [Obj.Pine, 0.025], [Obj.Bush, 0.015], [Obj.Rock, 0.007], [Obj.Flowers, 0.04]]);

  // --- Thornvale ---------------------------------------------------------------------
  const v = buildVillage();
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    b.g(x + OX, y + OY, v.getGround(x, y));
    b.o(x + OX, y + OY, v.getObj(x, y));
  }
  for (const h of v.houses) m.houses.push({ ...h, id: m.houses.length, x: h.x + OX, y: h.y + OY });
  for (const s of v.spawns) m.spawns.push({ ...s, x: s.x + OX, y: s.y + OY });
  for (const n of v.npcs) m.npcs.push({ ...n, x: n.x + OX, y: n.y + OY });
  m.playerSpawn = { x: v.playerSpawn.x + OX, y: v.playerSpawn.y + OY, z: 0 };
  m.temple = { ...m.playerSpawn };
  b.region({ name: 'Thornvale', x0: OX, y0: OY, x1: OX + VW - 1, y1: OY + VH - 1, level: '1+', z0: 0, z1: 2, temple: m.temple });
  b.region({ name: 'Greywood', x0: OX + 2, y0: OY + 2, x1: OX + VW - 3, y1: OY + 10, level: '3+' });
  b.region({ name: "Miller's Farm", x0: OX + 40, y0: OY + 25, x1: OX + 53, y1: OY + 39, level: '1+' });
  b.region({ name: 'Old Graveyard', x0: OX + 3, y0: OY + 31, x1: OX + 17, y1: OY + 40, level: '5+' });
  // protection zones: the plaza and every shop, depot and hall
  b.region({ name: 'Temple Plaza', x0: OX + 21, y0: OY + 17, x1: OX + 34, y1: OY + 28, level: '—', safe: true, temple: m.temple });
  for (const h of m.houses) {
    if (h.name !== 'Miller Barn') b.region({ name: h.name, x0: h.x, y0: h.y, x1: h.x + h.w - 1, y1: h.y + h.h - 1, level: '—', safe: true, z0: 0, z1: 1 });
  }
  // the depot has a second floor with more lockers
  const depot = m.houses.find((h) => h.name === 'Thornvale Depot & Bank')!;
  depot.noRoof = true;
  b.building(depot.x, depot.y, depot.w, depot.h, { z: 1, name: 'Depot Loft', roof: 0x9a4a2c, wallColor: 0xcbb994 });
  b.stairs({ x: depot.x + depot.w - 2, y: depot.y + depot.h - 3, z: 0 }, { x: depot.x + depot.w - 2, y: depot.y + depot.h - 3, z: 1 }, [-1, 0], [-1, 0]);
  for (let i = 1; i < depot.w - 3; i += 2) b.o(depot.x + i, depot.y + 1, Obj.Locker, 1);
  // gates through the village's pine ring
  const nx = OX + 27; // north–south road x
  b.road(nx, OY - 1, nx, OY + 2);
  b.road(nx, OY + VH - 3, nx, OY + VH);
  b.road(OX - 1, OY + 22, OX + 3, OY + 22);
  b.road(OX + VW - 4, OY + 22, OX + VW, OY + 22);

  // --- harbour -------------------------------------------------------------------------
  b.road(nx, OY + VH, nx, 146);
  b.fill(nx - 3, 145, nx + 4, 152, Ground.Wood);
  b.rect(nx - 3, 145, nx + 4, 152, (x, y) => {
    if ((x === nx - 3 || x === nx + 4 || y === 152) && m.getGround(x, y + 1) !== Ground.Wood) b.o(x, y, Obj.Railing);
  });
  b.npc('hask', nx + 2, 149);
  for (const [x, y] of [[nx - 2, 146], [nx + 3, 146]]) b.o(x, y, Obj.Barrel);
  m.destinations.thornvale = { x: nx, y: 148, z: 0 };
  b.region({ name: 'Thornvale Harbour', x0: nx - 4, y0: 142, x1: nx + 5, y1: 153, level: '—', safe: true });

  // --- Howling Hills ---------------------------------------------------------------------
  b.rect(98, 98, 127, 140, (x, y) => {
    const g = m.getGround(x, y);
    if (g === Ground.Grass || g === Ground.DarkGrass) {
      b.g(x, y, rng.chance(0.3) ? Ground.Dirt : Ground.DarkGrass);
      const r = rng.next();
      b.o(x, y, r < 0.07 ? Obj.Rock : r < 0.14 ? Obj.Pine : r < 0.18 ? Obj.Bush : Obj.None);
    }
  });
  b.road(nx + 2, 118, 112, 118);
  b.spawnMany('wolf', 8, 100, 100, 126, 138);
  b.region({ name: 'Howling Hills', x0: 98, y0: 98, x1: 127, y1: 140, level: '3+' });

  buildGrimtusk(b);
  buildMountains(b);
  buildWatchpost(b);
  buildSilverbough(b);
  buildCinderreach(b);
  buildDescent(b);
  buildJungle(b, jungleLand);

  // roads joining everything
  b.road(57, 22, nx, 22);                // west to Grimtusk's east gate
  b.road(nx, 22, nx, OY - 1);            // north road
  b.road(32, 42, 32, OY + 22);           // Grimtusk south gate down to the west road
  b.road(33, OY + 22, OX - 1, OY + 22);  // west road
  b.road(33, OY + 23, 33, 108);          // down to the Ruins of Varkh
  b.road(OX + VW, OY + 22, 171, OY + 22); // east road through the pass to Cinderreach
  b.road(158, 64, 158, 56);
  b.road(158, 56, 192, 51);              // north to Silverbough

  // --- outer ring of pines on land ---------------------------------------------------------
  b.rect(0, 0, WORLD_W - 1, WORLD_H - 1, (x, y) => {
    if ((x < 2 || y < 2 || x >= WORLD_W - 2 || y >= WORLD_H - 2) && m.getGround(x, y) !== Ground.DeepWater && m.getGround(x, y) !== Ground.Water) {
      b.o(x, y, Obj.Pine);
      b.g(x, y, Ground.DarkGrass);
    }
  });

  ensureConnected(m);
  return m;
}

// ================================================================== Grimtusk Fortress

function buildGrimtusk(b: Builder): void {
  const m = b.m;
  const x0 = 8, y0 = 6, x1 = 56, y1 = 42;
  b.clear(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  b.rect(x0, y0, x1, y1, (x, y) => b.g(x, y, b.rng.chance(0.65) ? Ground.Dirt : Ground.DarkGrass));
  b.outline(x0, y0, x1, y1, Obj.StoneWall);
  for (const x of [32, 33]) { b.o(x, y1, Obj.None); b.g(x, y1, Ground.Path); }
  for (const y of [22, 23]) { b.o(x1, y, Obj.None); b.g(x1, y, Ground.Path); }

  // corner towers: 5×5 stone, ladder to an open platform with railings
  const towers: Array<[number, number, [number, number]]> = [[x0 + 1, y0 + 1, [x0 + 3, y0 + 5]], [x1 - 5, y0 + 1, [x1 - 3, y0 + 5]], [x0 + 1, y1 - 5, [x0 + 3, y1 - 5]], [x1 - 5, y1 - 5, [x1 - 3, y1 - 5]]];
  for (const [tx, ty, door] of towers) {
    b.building(tx, ty, 5, 5, { name: 'Orc Tower', stone: true, doors: [door], noRoof: true });
    b.fill(tx, ty, tx + 4, ty + 4, Ground.Stone, 1);
    b.outline(tx, ty, tx + 4, ty + 4, Obj.Railing, 1);
    b.ladder(tx + 2, ty + 2, 0, [0, 1]);
    b.spawn('orc_spearman', tx + 1, ty + 1, 1);
  }

  // the keep: two floors above ground and chambers below
  const kx = 22, ky = 14, kw = 21, kh = 17;
  b.building(kx, ky, kw, kh, { name: 'Grimtusk Keep', stone: true, doors: [[kx + 10, ky + kh - 1]], floor: Ground.Stone, noRoof: true });
  for (const [px, py] of [[kx + 5, ky + 5], [kx + 15, ky + 5], [kx + 5, ky + 11], [kx + 15, ky + 11]]) b.o(px, py, Obj.Pillar);
  for (const [px, py] of [[kx + 1, ky + 2], [kx + kw - 2, ky + 2]]) b.o(px, py, Obj.Torch);
  b.building(kx, ky, kw, kh, { z: 1, name: 'Keep Upper Hall', stone: true, floor: Ground.Stone, roof: 0x5a4a3a });
  b.stairs({ x: kx + 2, y: ky + 2, z: 0 }, { x: kx + 2, y: ky + 2, z: 1 }, [1, 1], [1, 1]);
  b.o(kx + kw - 3, ky + 2, Obj.Table, 1);
  b.chest('grimtusk_hall', kx + kw - 2, ky + 1, 1, [{ id: 'orc_warhelm', qty: 1 }, { id: 'gold', qty: 300 }]);
  b.spawn('orc_leader', kx + 8, ky + 6, 1);
  b.spawn('orc_leader', kx + 14, ky + 10, 1);
  b.spawn('orc_shaman', kx + 5, ky + 12, 1);
  // stairs down to the chambers
  const sx = kx + kw - 3, sy = ky + kh - 3;
  const rooms = b.dungeon(12, 9, 52, 40, -1, 7, Ground.Stone);
  b.stairs({ x: sx, y: sy, z: -1 }, { x: sx, y: sy, z: 0 }, [-1, 0], [-1, 0]);
  b.tunnel(sx - 1, sy, rooms[0].x, rooms[0].y, -1, Ground.Stone);
  const last = rooms[rooms.length - 1];
  b.spawn('orc_warlord', last.x, last.y, -1);
  b.chest('grimtusk_treasury', last.x + 2, last.y - 1, -1, [{ id: 'double_axe', qty: 1 }, { id: 'tower_shield', qty: 1 }, { id: 'gold', qty: 800 }]);
  for (let i = 1; i < rooms.length - 1; i++) {
    b.spawn(i % 2 ? 'orc_berserker' : 'orc_leader', rooms[i].x, rooms[i].y, -1);
    b.spawn('orc_warrior', rooms[i].x + 1, rooms[i].y + 1, -1);
  }
  b.rect(12, 9, 52, 40, (x, y) => { if (m.getGround(x, y, -1) === Ground.Stone && b.rng.chance(0.02)) b.o(x, y, Obj.Bones, -1); });

  // barracks huts
  for (const [hx, hy, door] of [[11, 26, [13, 26]], [47, 26, [49, 26]], [17, 33, [19, 33]]] as Array<[number, number, [number, number]]>) {
    b.building(hx, hy, 6, 5, { name: 'Orc Barracks', roof: 0x8a6a3e, wallColor: 0x6e4f33, doors: [door] });
  }
  for (const [x, y] of [[30, 36], [44, 10], [15, 18]]) b.o(x, y, Obj.Campfire);
  b.scatter(x0 + 1, y0 + 1, x1 - 1, y1 - 1, [[Obj.Bones, 0.01], [Obj.Barrel, 0.004], [Obj.Crate, 0.004]]);

  // patrols in the yard
  b.spawnMany('orc', 7, x0 + 2, y0 + 7, x1 - 2, y1 - 2);
  b.spawnMany('orc_warrior', 5, x0 + 2, y0 + 7, x1 - 2, y1 - 2);
  b.spawnMany('orc_spearman', 3, x0 + 2, y0 + 7, x1 - 2, y1 - 2);
  b.spawnMany('orc_shaman', 3, x0 + 2, y0 + 7, x1 - 2, y1 - 2);
  b.spawnMany('orc_berserker', 2, kx + 1, ky + 1, kx + kw - 2, ky + kh - 2);
  b.spawnMany('orc', 4, 4, 44, 60, 60);
  b.region({ name: 'Grimtusk Fortress', x0, y0, x1, y1, level: '10+', z0: -1, z1: 1 });
}

// ================================================================== Grimpeak Mountains

function buildMountains(b: Builder): void {
  const x0 = 124, x1 = 148, y0 = 4, y1 = 92;
  // solid rock on the surface with a plateau on the floor above
  b.rect(x0, y0, x1, y1, (x, y) => {
    const edge = Math.floor(hash2(x, y >> 2, 7) * 2);
    if (x < x0 + edge || x > x1 - edge) return;
    if (y >= 70 && y <= 76) return; // the pass
    b.o(x, y, Obj.Cliff);
    b.g(x, y, Ground.Dirt);
    b.g(x, y, b.rng.chance(0.25) ? Ground.DarkGrass : Ground.Stone, 1);
  });
  b.rect(x0, 70, x1, 76, (x, y) => {
    b.g(x, y, b.rng.chance(0.4) ? Ground.Dirt : Ground.Path);
    b.o(x, y, y === 70 || y === 76 ? Obj.Rock : Obj.None);
  });
  b.scatter(x0, y0, x1, y1, [[Obj.Pine, 0.08], [Obj.Rock, 0.05]], 1);
  // ramps up to the plateau on both sides
  b.stairs({ x: x0 - 1, y: 40, z: 0 }, { x: x0 + 1, y: 40, z: 1 }, [1, 0], [-1, 0]);
  b.stairs({ x: x1 + 1, y: 40, z: 0 }, { x: x1 - 1, y: 40, z: 1 }, [-1, 0], [1, 0]);
  b.clear(x0 - 3, 38, x0 - 1, 42);
  b.clear(x1 + 1, 38, x1 + 3, 42);
  // watchtower on the plateau
  const tx = 134, ty = 28;
  b.building(tx, ty, 5, 5, { z: 1, name: 'Grimpeak Watchtower', stone: true, floor: Ground.Stone, doors: [[tx + 2, ty + 4]], noRoof: true });
  b.fill(tx, ty, tx + 4, ty + 4, Ground.Stone, 2);
  b.outline(tx, ty, tx + 4, ty + 4, Obj.Railing, 2);
  b.ladder(tx + 2, ty + 2, 1, [0, 1]);
  b.chest('grimpeak_top', tx + 1, ty + 1, 2, [{ id: 'traveler_boots', qty: 1 }, { id: 'great_health_potion', qty: 2 }]);
  b.spawnMany('wolf', 4, x0 + 2, 10, x1 - 2, 66, 1);
  b.spawnMany('skeleton', 2, x0 + 2, 10, x1 - 2, 66, 1);
  // caves below the mountain (z−1): in from the west foot, out by rope on the east
  b.cave(x0, 8, x1 + 4, 66, -1, 0.56);
  b.stairs({ x: x0, y: 20, z: -1 }, { x: x0 - 1, y: 20, z: 0 }, [-1, 0], [1, 0]);
  b.clear(x0 - 3, 18, x0 - 1, 22);
  b.tunnel(x0 + 1, 20, x0 + 10, 30, -1);
  b.tunnel(x0 + 10, 30, x1, 50, -1);
  b.tunnel(x1, 50, x1 + 3, 50, -1);
  b.clear(x1 + 2, 49, x1 + 4, 53);
  b.ropeSpot(x1 + 3, 50, -1, [0, 1]);
  b.scatter(x0, 8, x1 + 4, 66, [[Obj.Stalagmite, 0.04], [Obj.Bones, 0.01]], -1, [Ground.Cave]);
  b.spawnMany('skeleton', 5, x0, 8, x1, 66, -1);
  b.spawnMany('tarantula', 3, x0, 30, x1, 66, -1);
  b.spawnMany('ghoul', 2, x0, 40, x1, 66, -1);
  b.chest('grimpeak_cave', x1 - 3, 60, -1, [{ id: 'shovel', qty: 1 }, { id: 'small_emerald', qty: 2 }]);
  b.region({ name: 'Grimpeak Mountains', x0, y0, x1, y1, level: '8+', z0: 1, z1: 2 });
  b.region({ name: 'Grimpeak Pass', x0, y0: 70, x1, y1: 76, level: '—' });
  b.region({ name: 'Grimpeak Caves', x0, y0: 8, x1: x1 + 4, y1: 66, level: '15+', z0: -1, z1: -1 });
}

// ================================================================== Watchpost Brann

function buildWatchpost(b: Builder): void {
  const x0 = 151, y0 = 63, x1 = 165, y1 = 82;
  b.clear(x0, y0, x1, y1);
  b.rect(x0, y0, x1, y1, (x, y) => b.g(x, y, Ground.Dirt));
  b.outline(x0, y0, x1, y1, Obj.Palisade);
  for (const y of [72, 73]) { b.o(x0, y, Obj.None); b.o(x1, y, Obj.None); }
  for (const x of [158, 159]) b.o(x, y0, Obj.None);
  b.building(154, 65, 8, 5, { name: 'Watchpost Hall', roof: 0x3f6b4a, doors: [[157, 69]] });
  b.npc('brann', 158, 67);
  b.o(155, 66, Obj.Locker);
  b.o(160, 66, Obj.Barrel);
  b.o(156, 77, Obj.Campfire);
  b.region({ name: 'Watchpost Brann', x0, y0, x1, y1, level: '—', safe: true, temple: { x: 158, y: 75, z: 0 } });
}

// ================================================================== Silverbough Fortress

function buildSilverbough(b: Builder): void {
  const m = b.m;
  // the surrounding woods
  b.rect(152, 4, 221, 58, (x, y) => {
    if (m.getObj(x, y) === Obj.Cliff) return;
    b.g(x, y, b.rng.chance(0.4) ? Ground.DarkGrass : Ground.Grass);
    const r = b.rng.next();
    b.o(x, y, r < 0.16 ? Obj.Tree : r < 0.2 ? Obj.Bush : r < 0.27 ? Obj.Fern : r < 0.3 ? Obj.Flowers : Obj.None);
  });
  const x0 = 172, y0 = 10, x1 = 216, y1 = 50;
  b.clear(x0, y0, x1, y1);
  b.rect(x0, y0, x1, y1, (x, y) => {
    b.g(x, y, b.rng.chance(0.5) ? Ground.Grass : Ground.DarkGrass);
    if (b.rng.chance(0.06)) b.o(x, y, Obj.Tree);
    else if (b.rng.chance(0.06)) b.o(x, y, Obj.Fern);
  });
  // living hedge wall with a wooden gate
  b.outline(x0, y0, x1, y1, Obj.Bush);
  b.outline(x0 + 1, y0 + 1, x1 - 1, y1 - 1, Obj.Palisade);
  for (const x of [192, 193]) for (const y of [y1, y1 - 1]) { b.o(x, y, Obj.None); b.g(x, y, Ground.Path); }
  // hidden grove in the north-east corner, reached through an overgrown gap
  const gx0 = 206, gy0 = 12, gx1 = 214, gy1 = 18;
  b.clear(gx0, gy0, gx1, gy1);
  b.outline(gx0, gy0, gx1 + 1, gy1, Obj.Bush);
  b.o(gx0, gy0 + 3, Obj.Fern);
  b.rect(gx0 + 1, gy0 + 1, gx1, gy1 - 1, (x, y) => b.g(x, y, Ground.Grass));
  b.o(gx0 + 4, gy0 + 2, Obj.Flowers);
  b.chest('silverbough_grove', gx1 - 1, gy0 + 2, 0, [{ id: 'ring_of_swiftness', qty: 1 }, { id: 'elven_scroll', qty: 2 }]);

  // tree platforms (z+1) joined by bridges, and the warden's crown (z+2)
  const plats: Array<[number, number, number, number]> = [
    [178, 16, 184, 22], [196, 14, 202, 20], [207, 28, 213, 34], [184, 36, 190, 42], [193, 25, 201, 33],
  ];
  for (const [px0, py0, px1, py1] of plats) {
    b.fill(px0, py0, px1, py1, Ground.Wood, 1);
    b.outline(px0, py0, px1, py1, Obj.Railing, 1);
    b.clear(px0, py0, px1, py1, 0);
    b.rect(px0, py0, px1, py1, (x, y) => b.g(x, y, Ground.DarkGrass));
    b.ladder(px0 + 1, py1 - 1, 0, [1, 0]);
  }
  const [cx0, cy0, cx1, cy1] = plats[4];
  const bridge = (ax: number, ay: number, bx: number, by: number) => {
    // two-segment walkway with railings
    const sx = Math.sign(bx - ax) || 1;
    for (let x = ax; x !== bx + sx; x += sx) {
      b.g(x, ay, Ground.Wood, 1);
      b.o(x, ay, Obj.None, 1);
      for (const dy of [-1, 1]) if (m.getGround(x, ay + dy, 1) === Ground.Void) { b.g(x, ay + dy, Ground.Wood, 1); b.o(x, ay + dy, Obj.Railing, 1); }
    }
    const sy = Math.sign(by - ay) || 1;
    for (let y = ay; y !== by + sy; y += sy) {
      b.g(bx, y, Ground.Wood, 1);
      b.o(bx, y, Obj.None, 1);
      for (const dx of [-1, 1]) if (m.getGround(bx + dx, y, 1) === Ground.Void) { b.g(bx + dx, y, Ground.Wood, 1); b.o(bx + dx, y, Obj.Railing, 1); }
    }
  };
  bridge(184, 19, cx0 + 2, cy0);
  bridge(199, 20, 199, cy0);
  bridge(cx1, 30, 207, 30);
  bridge(187, 36, 187, cy1);
  b.o(187, cy1, Obj.None, 1);
  bridge(188, cy1, cx0 + 2, cy1);
  // crown platform
  b.fill(195, 27, 199, 31, Ground.Wood, 2);
  b.outline(195, 27, 199, 31, Obj.Railing, 2);
  b.ladder(197, 29, 1, [0, 1]);
  b.spawn('elf_warden', 196, 28, 2);
  b.chest('silverbough_crown', 198, 28, 2, [{ id: 'elven_leggings', qty: 1 }, { id: 'small_emerald', qty: 3 }]);
  // elf lodges
  for (const [lx, ly, door] of [[176, 26, [179, 30]], [204, 40, [207, 40]], [180, 44, [183, 44]]] as Array<[number, number, [number, number]]>) {
    b.building(lx, ly, 7, 5, { name: 'Elf Lodge', roof: 0x3f7a3a, wallColor: 0x8a6a46, doors: [door] });
  }
  // the vault beneath the lodges, opened with a shovel
  b.digSpot(210, 46, 0);
  b.cave(203, 41, 215, 49, -1, 0.75, Ground.Stone);
  b.fill(208, 44, 212, 48, Ground.Stone, -1);
  b.ropeSpot(213, 47, -1, [1, 0]);
  b.tunnel(213, 47, 210, 46, -1, Ground.Stone);
  b.chest('silverbough_vault', 209, 48, -1, [{ id: 'elven_mail', qty: 1 }, { id: 'small_emerald', qty: 2 }]);
  b.spawn('elf_arcanist', 209, 44, -1);
  b.spawn('elf_arcanist', 212, 45, -1);

  // garrison
  b.spawnMany('elf', 8, x0 + 3, y0 + 3, x1 - 3, y1 - 3);
  b.spawnMany('elf_scout', 4, x0 + 3, y0 + 3, x1 - 3, y1 - 3);
  for (const [px0, py0, px1, py1] of plats) b.spawnMany(px0 === cx0 ? 'elf_arcanist' : 'elf_scout', 1, px0 + 1, py0 + 1, px1 - 1, py1 - 1, 1);
  b.spawnMany('elf_arcanist', 2, x0 + 3, y0 + 3, x1 - 3, y1 - 3);
  b.spawnMany('elf', 3, 154, 6, 170, 56);
  b.region({ name: 'Silverbough Woods', x0: 152, y0: 4, x1: 221, y1: 58, level: '12+' });
  b.region({ name: 'Silverbough Fortress', x0, y0, x1, y1, level: '15+', z0: -1, z1: 2 });
}

// ================================================================== Cinderreach & the Caldera

function buildCinderreach(b: Builder): void {
  const m = b.m;
  const x0 = 170, y0 = 60, x1 = 220, y1 = 93;
  b.rect(x0, y0, x1, y1, (x, y) => {
    b.o(x, y, Obj.None);
    b.g(x, y, Ground.Ash);
    if (x <= x0 + 1 || x >= x1 || y <= y0 || y >= y1 - 1) b.o(x, y, Obj.Cliff);
  });
  for (const y of [72, 73]) for (const x of [x0, x0 + 1]) { b.o(x, y, Obj.None); b.g(x, y, Ground.Path); }
  const blob = (cx: number, cy: number, r: number, g: Ground | null, o: Obj | null) => {
    b.rect(cx - r, cy - r, cx + r, cy + r, (x, y) => {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + b.rng.next() * 2) {
        if (g !== null) b.g(x, y, g);
        if (o !== null) b.o(x, y, o);
      }
    });
  };
  blob(182, 66, 2, Ground.Lava, Obj.None);
  blob(188, 86, 3, Ground.Lava, Obj.None);
  blob(178, 84, 1, null, Obj.Cliff);
  blob(186, 76, 1, null, Obj.Cliff);
  b.scatter(x0 + 2, y0 + 1, 198, y1 - 2, [[Obj.Rock, 0.03], [Obj.Bones, 0.04], [Obj.FireField, 0.01]], 0, [Ground.Ash]);
  // the caldera: walled crater with one narrow pass
  const cx0 = 200, cy0 = 63, cx1 = 218, cy1 = 89;
  b.rect(cx0, cy0, cx1, cy1, (x, y) => {
    b.o(x, y, x === cx0 || y === cy0 || x === cx1 || y === cy1 ? Obj.Cliff : Obj.None);
    b.g(x, y, Ground.Ash);
  });
  for (const y of [75, 76]) b.o(cx0, y, Obj.None);
  blob(210, 70, 2, Ground.Lava, Obj.None);
  blob(212, 83, 2, Ground.Lava, Obj.None);
  for (const [x, y] of [[204, 68], [214, 76], [206, 85]]) b.o(x, y, Obj.Bones);
  b.chest('caldera_hoard', 216, 65, 0, [{ id: 'dragonhide_pack', qty: 1 }, { id: 'small_ruby', qty: 4 }, { id: 'gold', qty: 2000 }]);
  b.spawnMany('dragon', 6, x0 + 3, y0 + 2, cx0 - 2, y1 - 3);
  b.spawnMany('dragon_lord', 3, cx0 + 2, cy0 + 2, cx1 - 2, cy1 - 2);
  b.region({ name: 'Cinderreach', x0, y0, x1, y1, level: '35+' });
  b.region({ name: 'The Caldera', x0: cx0, y0: cy0, x1: cx1, y1: cy1, level: '70+' });
  void m;
}

// ================================================================== Ruins of Varkh & the Descent

function buildDescent(b: Builder): void {
  const m = b.m;
  // surface ruins
  const rx0 = 14, ry0 = 108, rx1 = 52, ry1 = 140;
  b.rect(rx0, ry0, rx1, ry1, (x, y) => {
    b.o(x, y, Obj.None);
    b.g(x, y, b.rng.chance(0.4) ? Ground.Dirt : b.rng.chance(0.5) ? Ground.Stone : Ground.DarkGrass);
  });
  for (const [x, y, w, h] of [[18, 112, 9, 7], [36, 114, 10, 8], [22, 127, 12, 9], [40, 128, 8, 8]]) {
    b.rect(x, y, x + w - 1, y + h - 1, (xx, yy) => {
      const border = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1;
      if (border && b.rng.chance(0.65)) b.o(xx, yy, Obj.StoneWall);
    });
  }
  b.scatter(rx0, ry0, rx1, ry1, [[Obj.Pillar, 0.015], [Obj.DeadTree, 0.015], [Obj.Bones, 0.03], [Obj.Grave, 0.01]]);
  b.spawnMany('skeleton', 6, rx0, ry0, rx1, ry1);
  b.spawnMany('ghoul', 2, rx0, ry0 + 10, rx1, ry1);

  // four floors down, each with the way onward at the far end
  const area: [number, number, number, number] = [6, 98, 72, 162];
  const themes: Array<{ z: number; ground: Ground; rooms: number }> = [
    { z: -1, ground: Ground.Stone, rooms: 9 },
    { z: -2, ground: Ground.Ash, rooms: 9 },
    { z: -3, ground: Ground.Cave, rooms: 8 },
    { z: -4, ground: Ground.Ash, rooms: 6 },
  ];
  let entry = { x: 33, y: 124 };
  b.clear(32, 123, 35, 126);
  let prevLast: { x: number; y: number } | null = null;
  for (const t of themes) {
    const rooms = b.dungeon(area[0], area[1], area[2], area[3], t.z, t.rooms, t.ground);
    // arrival from above lands at `entry`; connect it to the first room
    b.stairs({ x: entry.x, y: entry.y, z: t.z }, { x: entry.x, y: entry.y, z: t.z + 1 }, [1, 0], [1, 0]);
    b.fill(entry.x - 1, entry.y - 1, entry.x + 2, entry.y + 1, t.ground, t.z);
    b.o(entry.x, entry.y, Obj.StairsUp, t.z);
    b.tunnel(entry.x + 1, entry.y, rooms[0].x, rooms[0].y, t.z, t.ground);
    if (prevLast === null) b.o(entry.x, entry.y, Obj.StairsDown, t.z + 1);
    const last = rooms[rooms.length - 1];
    prevLast = last;
    entry = { x: last.x, y: last.y };
    // hazards and decoration per floor
    b.rect(area[0], area[1], area[2], area[3], (x, y) => {
      if (m.getGround(x, y, t.z) === Ground.Void) return;
      if (m.getObj(x, y, t.z) !== Obj.None) return;
      const r = b.rng.next();
      if (t.z === -1 && r < 0.02) b.o(x, y, Obj.Bones, t.z);
      else if (t.z === -1 && r < 0.025) b.o(x, y, Obj.Grave, t.z);
      else if (t.z === -2 && r < 0.035) b.o(x, y, Obj.FireField, t.z);
      else if (t.z === -3 && r < 0.03) b.o(x, y, Obj.Stalagmite, t.z);
      else if (t.z === -4 && r < 0.02) b.o(x, y, Obj.FireField, t.z);
      else if (r < 0.006) b.o(x, y, Obj.Torch, t.z);
    });
    if (t.z <= -2) {
      for (let i = 2; i < rooms.length - 1; i += 2) {
        const c = rooms[i];
        b.rect(c.x - 1, c.y - 1, c.x + 1, c.y + 1, (x, y) => { if (b.rng.chance(0.7)) b.g(x, y, Ground.Lava, t.z); });
      }
    }
    // monsters, away from the arrival room
    const inner = rooms.slice(1);
    const roster: Record<number, Array<[Parameters<Builder['spawn']>[0], number]>> = {
      [-1]: [['ghoul', 2], ['skeleton', 1]],
      [-2]: [['fire_elemental', 2], ['ghoul', 1]],
      [-3]: [['behemoth', 1], ['fire_elemental', 1]],
      [-4]: [['demon', 1]],
    };
    inner.forEach((c, i) => {
      for (const [kind, n] of roster[t.z]) {
        if (t.z === -4 && i === 0) continue; // a breather before the demons
        b.spawnMany(kind, n, c.x - 3, c.y - 2, c.x + 3, c.y + 2, t.z);
      }
    });
  }
  // the bottom: two treasure chests among the demons
  if (prevLast) {
    b.chest('abyss_hoard', prevLast.x + 1, prevLast.y - 1, -4, [{ id: 'demon_shield', qty: 1 }, { id: 'gold', qty: 5000 }]);
    b.chest('abyss_reliquary', prevLast.x - 2, prevLast.y + 1, -4, [{ id: 'demonbone_amulet', qty: 1 }, { id: 'small_diamond', qty: 5 }]);
  }
  // a hidden passage on the catacomb floor: dig down to a sealed cell with a rope back up
  const secret = findOpen(m, -2, area);
  if (secret) {
    b.digSpot(secret.x, secret.y, -2);
    b.fill(secret.x - 2, secret.y - 2, secret.x + 2, secret.y + 2, Ground.Stone, -3);
    b.ropeSpot(secret.x - 1, secret.y - 1, -3, [-1, -1]);
    b.chest('descent_secret', secret.x + 1, secret.y + 1, -3, [{ id: 'emberwalk_boots', qty: 1 }, { id: 'fireball_rune', qty: 20 }]);
  }
  b.region({ name: 'Ruins of Varkh', x0: rx0, y0: ry0, x1: rx1, y1: ry1, level: '10+' });
  b.region({ name: 'The Crypt', x0: area[0], y0: area[1], x1: area[2], y1: area[3], level: '25+', z0: -1, z1: -1 });
  b.region({ name: 'Burning Catacombs', x0: area[0], y0: area[1], x1: area[2], y1: area[3], level: '45+', z0: -2, z1: -2 });
  b.region({ name: 'Abyssal Halls', x0: area[0], y0: area[1], x1: area[2], y1: area[3], level: '65+', z0: -3, z1: -3 });
  b.region({ name: 'The Demon Pit', x0: area[0], y0: area[1], x1: area[2], y1: area[3], level: '100+', z0: -4, z1: -4 });
}

function findOpen(m: WorldMap, z: number, area: [number, number, number, number]): { x: number; y: number } | null {
  for (let y = area[1] + 6; y < area[3] - 6; y++) {
    for (let x = area[0] + 6; x < area[2] - 6; x++) {
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!m.isWalkable(x + dx, y + dy, z) || m.getObj(x + dx, y + dy, z) !== Obj.None) { ok = false; break; }
      }
      if (ok && m.getGround(x, y, z - 1) === Ground.Void) return { x, y };
    }
  }
  return null;
}

// ================================================================== Palmreach & the jungle

function buildJungle(b: Builder, jungleLand: (x: number, y: number) => boolean): void {
  const m = b.m;
  // vegetation
  b.rect(140, 100, 219, 171, (x, y) => {
    if (!jungleLand(x, y)) return;
    const g = m.getGround(x, y);
    if (g === Ground.Sand || g === Ground.Water) return;
    const r = b.rng.next();
    b.o(x, y, r < 0.14 ? Obj.JungleTree : r < 0.19 ? Obj.Palm : r < 0.33 ? Obj.Fern : r < 0.36 ? Obj.Bush : Obj.None);
  });
  // rivers
  const r1 = b.river(186, 101, 192, 170, 1);
  const r2 = b.river(150, 118, 186, 132, 1);
  // swamps and the hydra bog
  const swamp = (cx: number, cy: number, r: number) => b.rect(cx - r, cy - r, cx + r, cy + r, (x, y) => {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && jungleLand(x, y) && m.getGround(x, y) !== Ground.Water) {
      b.g(x, y, Ground.Swamp);
      if (b.rng.chance(0.6)) b.o(x, y, b.rng.chance(0.3) ? Obj.Fern : Obj.None);
    }
  });
  swamp(205, 116, 7);
  swamp(160, 108, 4);
  swamp(212, 158, 5);

  // Palmreach
  const tx0 = 146, ty0 = 140, tx1 = 178, ty1 = 167;
  b.rect(tx0, ty0, tx1, ty1, (x, y) => {
    if (!jungleLand(x, y) && m.getGround(x, y) === Ground.DeepWater) return;
    b.o(x, y, Obj.None);
    if (m.getGround(x, y) === Ground.Water || m.getGround(x, y) === Ground.DeepWater) b.g(x, y, Ground.Sand);
    else b.g(x, y, b.rng.chance(0.3) ? Ground.Sand : Ground.Jungle);
  });
  b.fill(158, 148, 168, 158, Ground.Marble);
  b.o(160, 150, Obj.Palm);
  b.o(166, 156, Obj.Palm);
  b.o(160, 156, Obj.Lamp);
  b.o(166, 150, Obj.Lamp);
  // pier to the west
  b.fill(134, 151, 147, 153, Ground.Wood);
  b.rect(134, 150, 147, 154, (x, y) => { if ((y === 150 || y === 154) && m.getGround(x, y) !== Ground.Wood) { b.g(x, y, Ground.Wood); b.o(x, y, Obj.Railing); } });
  b.npc('mara', 137, 152);
  m.destinations.palmreach = { x: 149, y: 152, z: 0 };
  b.road(147, 152, 158, 152, 2, Ground.Sand);
  // buildings
  b.building(149, 142, 8, 6, { name: "Zuri's Trading Post", roof: 0xc9a04a, wallColor: 0xe8dcc0, doors: [[152, 147]] });
  b.npc('zuri', 152, 144);
  b.building(169, 142, 9, 7, { name: 'Palmreach Depot & Bank', roof: 0xa8603a, wallColor: 0xe8dcc0, doors: [[172, 148]], stone: true });
  for (const x of [170, 171, 173, 174]) b.o(x, 143, Obj.Locker);
  b.npc('pell', 175, 145);
  b.building(149, 159, 7, 6, { name: "Tomas's Hut", roof: 0x8a6a3e, wallColor: 0xd8c8a0, doors: [[152, 159]] });
  b.npc('tomas', 152, 161);
  b.building(169, 159, 7, 6, { name: 'Fisher House', roof: 0x6a8a4a, wallColor: 0xd8c8a0, doors: [[172, 159]] });
  b.region({ name: 'Palmreach', x0: tx0, y0: ty0, x1: tx1, y1: ty1, level: '—', safe: true, temple: { x: 163, y: 153, z: 0 } });

  // jungle paths
  b.road(168, 152, 178, 152, 2, Ground.Path);
  b.road(178, 152, 199, 146, 2, Ground.Path);
  b.road(178, 152, 178, 120, 2, Ground.Path);
  b.road(178, 120, 200, 120, 2, Ground.Path);
  for (const p of [...r1, ...r2]) if (m.getGround(p.x, p.y) === Ground.Path) b.g(p.x, p.y, Ground.Wood);

  // temple ruins with the way down to the Mire Caves
  const ux0 = 194, uy0 = 138, ux1 = 210, uy1 = 152;
  b.rect(ux0, uy0, ux1, uy1, (x, y) => {
    b.o(x, y, Obj.None);
    b.g(x, y, b.rng.chance(0.5) ? Ground.Stone : Ground.Jungle);
  });
  b.rect(ux0, uy0, ux1, uy1, (x, y) => {
    const border = x === ux0 || y === uy0 || x === ux1 || y === uy1;
    if (border && b.rng.chance(0.6)) b.o(x, y, Obj.StoneWall);
  });
  for (const [x, y] of [[198, 142], [206, 142], [198, 148], [206, 148]]) b.o(x, y, Obj.Pillar);
  b.o(202, 141, Obj.Altar);
  for (const y of [145, 146]) b.o(ux0, y, Obj.None);

  // Mire Caves (z−1) and Hydra Nest (z−2)
  b.cave(176, 104, 219, 168, -1, 0.57);
  b.stairs({ x: 202, y: 145, z: -1 }, { x: 202, y: 145, z: 0 }, [1, 0], [1, 1]);
  b.tunnel(203, 145, 190, 130, -1);
  b.tunnel(190, 130, 210, 112, -1);
  b.tunnel(203, 145, 214, 160, -1);
  b.scatter(176, 104, 219, 168, [[Obj.Stalagmite, 0.035], [Obj.Bones, 0.01]], -1, [Ground.Cave]);
  b.rect(176, 104, 219, 168, (x, y) => { if (m.getGround(x, y, -1) === Ground.Cave && hash2(x, y, 31) < 0.06) b.g(x, y, Ground.Swamp, -1); });
  b.spawnMany('hydra', 4, 180, 106, 218, 166, -1);
  b.spawnMany('tarantula', 4, 180, 106, 218, 166, -1);
  b.spawnMany('crocodile', 2, 180, 106, 218, 166, -1);
  b.cave(192, 118, 219, 166, -2, 0.6);
  b.stairs({ x: 210, y: 112, z: -2 }, { x: 210, y: 112, z: -1 }, [0, 1], [0, 1]);
  b.tunnel(210, 113, 205, 140, -2);
  b.tunnel(205, 140, 214, 160, -2);
  b.spawnMany('hydra', 5, 194, 120, 218, 166, -2);
  b.chest('hydra_nest', 214, 160, -2, [{ id: 'hydra_egg', qty: 2 }, { id: 'rod_of_glaciers', qty: 1 }, { id: 'small_sapphire', qty: 3 }]);
  b.ropeSpot(213, 158, -2, [0, 1]);

  // surface hunting
  for (const p of r1.concat(r2)) {
    if (b.rng.chance(0.06)) {
      const bank = { x: p.x + 3, y: p.y };
      if (m.isWalkable(bank.x, bank.y) && !m.isSafe(bank.x, bank.y, 0)) b.spawn('crocodile', bank.x, bank.y);
    }
  }
  b.spawnMany('tarantula', 6, 180, 102, 218, 136);
  b.spawnMany('jungle_troll', 7, 150, 102, 218, 138);
  b.spawnMany('jungle_troll', 3, 180, 154, 218, 170);
  b.spawnMany('hydra', 2, 199, 110, 211, 122);
  b.region({ name: 'Palmreach Jungle', x0: 140, y0: 100, x1: 219, y1: 171, level: '20+' });
  b.region({ name: 'Hydra Bog', x0: 198, y0: 109, x1: 212, y1: 123, level: '50+' });
  b.region({ name: 'Temple of the Sunken Eye', x0: ux0, y0: uy0, x1: ux1, y1: uy1, level: '25+' });
  b.region({ name: 'Mire Caves', x0: 176, y0: 104, x1: 219, y1: 168, level: '45+', z0: -1, z1: -1 });
  b.region({ name: 'Hydra Nest', x0: 192, y0: 118, x1: 219, y1: 166, level: '60+', z0: -2, z1: -2 });
  b.region({ name: 'Palmreach', x0: tx0, y0: ty0, x1: tx1, y1: ty1, level: '—', safe: true, temple: { x: 163, y: 153, z: 0 } });
}

// ================================================================== connectivity

/** Every (x,y,z) a player can reach from the temple, following stairs, ladders, ropes, dig spots and ships. */
export function floodFill3D(m: WorldMap): Set<string> {
  const seen = new Set<string>();
  const stack: Array<[number, number, number]> = [[m.playerSpawn.x, m.playerSpawn.y, m.playerSpawn.z]];
  const push = (x: number, y: number, z: number) => {
    const k = WorldMap.key(x, y, z);
    if (seen.has(k)) return;
    seen.add(k);
    stack.push([x, y, z]);
  };
  seen.add(WorldMap.key(m.playerSpawn.x, m.playerSpawn.y, m.playerSpawn.z));
  for (const d of Object.values(m.destinations)) push(d.x, d.y, d.z);
  while (stack.length) {
    const [x, y, z] = stack.pop()!;
    const link = m.linkAt(x, y, z);
    if (link) push(link.to.x, link.to.y, link.to.z);
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (m.canStep(x, y, z, dx, dy)) push(nx, ny, z);
      // ladders and rope spots are used from an adjacent tile
      const l2 = m.linkAt(nx, ny, z);
      if (l2 && (l2.kind === 'use' || l2.kind === 'rope')) push(l2.to.x, l2.to.y, l2.to.z);
    }
  }
  return seen;
}

/** Carves through trees and rocks so every monster spawn and NPC is reachable on the surface. */
function ensureConnected(m: WorldMap): void {
  const soft = new Set<Obj>([Obj.Tree, Obj.Pine, Obj.Bush, Obj.Rock, Obj.DeadTree, Obj.JungleTree, Obj.Palm, Obj.Stalagmite]);
  for (let pass = 0; pass < 3; pass++) {
    const reach = floodFill3D(m);
    const targets = [...m.spawns, ...m.npcs, ...m.chests.map((c) => ({ ...c, adjacent: true }))];
    let fixed = 0;
    for (const t of targets) {
      const ok = 'adjacent' in t
        ? DIRS8.some(([dx, dy]) => reach.has(WorldMap.key(t.x + dx, t.y + dy, t.z)))
        : reach.has(WorldMap.key(t.x, t.y, t.z));
      if (ok) continue;
      // walk toward the nearest reachable tile on the same floor, clearing soft blockers
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (const k of reach) {
        const [rx, ry, rz] = k.split(',').map(Number);
        if (rz !== t.z) continue;
        const d = Math.abs(rx - t.x) + Math.abs(ry - t.y);
        if (d < bestD) { bestD = d; best = [rx, ry]; }
      }
      if (!best) continue;
      let x = t.x, y = t.y;
      let guard = 300;
      while ((x !== best[0] || y !== best[1]) && guard-- > 0) {
        if (Math.abs(best[0] - x) > Math.abs(best[1] - y)) x += Math.sign(best[0] - x); else y += Math.sign(best[1] - y);
        if (soft.has(m.getObj(x, y, t.z))) m.setObj(x, y, Obj.None, t.z);
        const g = m.getGround(x, y, t.z);
        if (g === Ground.Void) m.setGround(x, y, t.z < 0 ? Ground.Cave : Ground.Stone, t.z);
      }
      fixed++;
    }
    if (!fixed) break;
  }
}

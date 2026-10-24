import { hash2 } from '../core/rng';
import { activePlazaStyle, type PlazaProp, type SpawnPlaza } from './spawnPlaza';
import { FLOOR_MAX, Ground, Obj, SOLID_OBJ, WorldMap, type House, type Region } from './WorldMap';

/**
 * Grand Thornvale (owner request 2026-10-24): the spawn city rebuilt round a fountain
 * ten times wider than the old one (diameter 4 → 40 tiles), with a plaza grown round it
 * and, in the middle of the water, the Gilded Exchange on its island, reached by four
 * bridges.
 *
 * Built after the rest of the world stands (worldGen.generate, after the last
 * ensureConnected) and with no random numbers, so nothing outside the city moves. It
 * overwrites the old village (which is still built first, so every random number the
 * world uses after it stays the same), takes in some meadow and fills in the sea south
 * of the old village and the west side of the bay. Everything the old village had is
 * here again: the temple (respawn), depot hall, bank, magic shop, outfitter, smithy,
 * general store, trainers' hall, the market board, the Founders' Stone, Captain Aldric
 * and the other NPCs (same keys), the sewer entrance (same tile), the farm with its rats,
 * the graveyard with its skeletons and the Greywood with its wolves. Roads join the city
 * to the harbour road (west), the Grimtusk gate (north), Eastfold (east) and the
 * Westmarch road (south-east).
 *
 * Saves from before the rebuild (v15) with a position inside `CITY_BOX` wake at the
 * temple (save/migrate.ts), so nobody is left inside a new wall.
 */

/** Fountain centre (a tile corner: the basin is an even 40 tiles across). */
export const GRAND_CX = 209.5;
export const GRAND_CY = 326.5;
/** Basin radius in tiles (diameter 40; the old fountain was 4 across). */
export const GRAND_R = 20;
/** Radius of the island in the middle of the basin. */
export const ISLAND_R = 9;
/**
 * The Exchange's round wall: tiles between these radii (doorways on the four axes). The
 * ring is thicker than a tile's diagonal (1.45 > √2), so no tile inside touches one
 * outside, not even corner to corner: nobody slips through the wall diagonally.
 */
export const ROTUNDA_IN = 5.9;
export const ROTUNDA_OUT = 7.45;
/** Bridges are 4 tiles wide (2 either side of the axis). */
export const BRIDGE_HALF = 2;
/** The paved plaza round the fountain (inclusive). */
export const GRAND_PLAZA = { x0: 180, y0: 297, x1: 239, y1: 356 } as const;
/** Every tile the rebuild may have changed (old village included); saves inside it wake at the temple. */
export const CITY_BOX = { x0: 164, y0: 280, x1: 256, y1: 378 } as const;
/** The temple's respawn tile (inside its south doors). */
export const GRAND_TEMPLE = { x: 209, y: 294, z: 0 } as const;
/** The Exchange building (house rectangle round the rotunda). */
export const EXCHANGE_HOUSE = { x: 203, y: 320, w: 14, h: 14 } as const;
export const EXCHANGE_NAME = 'The Gilded Exchange';
/** The Exchange clerks (NPC keys) and where they stand behind their counters. */
export const EXCHANGE_CLERKS: ReadonlyArray<{ key: string; x: number; y: number }> = [
  { key: 'exchange_odile', x: 209, y: 324 },
  { key: 'exchange_benedek', x: 212, y: 326 },
  { key: 'exchange_sabine', x: 210, y: 329 },
  { key: 'exchange_wendel', x: 207, y: 327 },
];

/** Is this tile inside the box the rebuild touched (any floor above ground)? Used by the save migration. */
export function inRebuiltThornvale(x: number, y: number, z: number): boolean {
  return z >= 0 && x >= CITY_BOX.x0 && x <= CITY_BOX.x1 && y >= CITY_BOX.y0 && y <= CITY_BOX.y1;
}

const rad = (x: number, y: number) => Math.hypot(x - GRAND_CX, y - GRAND_CY);

/** East edge of the city (a wobbly coast in the bay). */
function eastEdge(y: number): number {
  return 253 + Math.round(1.4 * Math.sin(y * 0.31) + 1.1 * Math.sin(y * 0.13 + 2));
}

/** South edge of the city (a wobbly coast on the filled-in sea). */
function southEdge(x: number): number {
  return 374 + Math.round(1.6 * Math.sin(x * 0.23) + 1.3 * Math.sin(x * 0.07 + 1));
}

/** The city's own land: the box, less the Bandit Hollow corner, inside the wobbly coasts. */
export function inGrandCore(x: number, y: number): boolean {
  if (x < CITY_BOX.x0 || y < 281 || x > eastEdge(y) || y > southEdge(x)) return false;
  if (x < 170 && y > 333) return false; // Bandit Hollow's stockade stays as it was
  return true;
}

/** What a fountain tile is: water, bridge deck, island walkway, the rotunda wall or the hall floor. */
export function fountainPart(x: number, y: number): 'water' | 'bridge' | 'walk' | 'wall' | 'floor' | null {
  const r = rad(x, y);
  if (r >= GRAND_R) return null;
  if (r >= ISLAND_R) {
    // the bridges run along the axes, BRIDGE_HALF tiles either side of the centre line
    const onNS = x >= Math.floor(GRAND_CX) - (BRIDGE_HALF - 1) && x <= Math.ceil(GRAND_CX) + (BRIDGE_HALF - 1);
    const onEW = y >= Math.floor(GRAND_CY) - (BRIDGE_HALF - 1) && y <= Math.ceil(GRAND_CY) + (BRIDGE_HALF - 1);
    return onNS || onEW ? 'bridge' : 'water';
  }
  if (r >= ROTUNDA_OUT) return 'walk';
  if (r >= ROTUNDA_IN) {
    // doorways: the two middle tiles of every axis
    const door = (x === Math.floor(GRAND_CX) || x === Math.ceil(GRAND_CX)) || (y === Math.floor(GRAND_CY) || y === Math.ceil(GRAND_CY));
    return door ? 'floor' : 'wall';
  }
  return 'floor';
}

const P = (k: string, x: number, y: number, r = 0, v = 0): PlazaProp => ({ k, x, y, r, v });
const FACE = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
/** Turn that makes a prop at (x,y) face the fountain. */
const faceIn = (x: number, y: number) => Math.atan2(GRAND_CX - x, GRAND_CY - y);
const SIGN = { bell: 0, chest: 1, coin: 2, smith: 3, star: 4, sack: 5, bow: 6, swords: 7, notice: 8, anchor: 9 };

/** Hook for the furniture worldGen places by itself (stove, furnace, anvil, tanning rack). */
export type Furnish = (houses: House[]) => void;

export function buildGrandThornvale(m: WorldMap, furnish: Furnish): void {
  if (activePlazaStyle() !== 2) return;
  const B = CITY_BOX;
  const oldTemple = { ...m.temple };
  // ---- 1. remember the sea, then clear the city's land
  const wasWater = (x: number, y: number) => {
    const g = m.getGround(x, y, 0);
    return g === Ground.Water || g === Ground.DeepWater;
  };
  const W = B.x1 - B.x0 + 1, H = B.y1 - B.y0 + 1;
  const sea = new Uint8Array(W * H);
  for (let y = B.y0; y <= B.y1; y++) for (let x = B.x0; x <= B.x1; x++) sea[(y - B.y0) * W + (x - B.x0)] = wasWater(x, y) ? 1 : 0;
  const origSea = (x: number, y: number) => x >= B.x0 && x <= B.x1 && y >= B.y0 && y <= B.y1 ? sea[(y - B.y0) * W + (x - B.x0)] === 1 : wasWater(x, y);
  for (let y = B.y0; y <= B.y1; y++) for (let x = B.x0; x <= B.x1; x++) {
    if (!inGrandCore(x, y)) continue;
    m.setGround(x, y, hash2(x, y, 901) < 0.14 ? Ground.DarkGrass : Ground.Grass, 0);
    m.setObj(x, y, Obj.None, 0);
    for (let z = 1; z <= FLOOR_MAX; z++) if (m.floors.has(z)) { m.setGround(x, y, Ground.Void, z); m.setObj(x, y, Obj.None, z); }
  }
  // links above ground inside the city go (the depot loft stairs); the sewer stairs come back below
  for (const k of [...m.links.keys()]) {
    const [x, y, z] = k.split(',').map(Number);
    if (z >= 0 && inGrandCore(x, y)) m.links.delete(k);
  }
  // monsters above ground inside the city are placed again below (wolves, rats, skeletons)
  for (let i = m.spawns.length - 1; i >= 0; i--) {
    const s = m.spawns[i];
    if (s.z >= 0 && inGrandCore(s.x, s.y)) m.spawns.splice(i, 1);
  }
  for (let i = m.chests.length - 1; i >= 0; i--) {
    const c = m.chests[i];
    if (c.z >= 0 && inGrandCore(c.x, c.y)) m.chests.splice(i, 1);
  }

  // ---- helpers
  const street = new Uint8Array(m.width * m.height);
  const G = (x: number, y: number, g: Ground) => m.setGround(x, y, g, 0);
  const O = (x: number, y: number, o: Obj) => m.setObj(x, y, o, 0);
  const pave = (x0: number, y0: number, x1: number, y1: number, g = Ground.Stone) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!m.inBounds(x, y)) continue;
      G(x, y, g);
      O(x, y, Obj.None);
      street[m.idx(x, y)] = 1;
    }
  };
  const byName = (name: string, z = 0) => m.houses.find((h) => h.name === name && h.z === z);
  const placeHouse = (h: House | undefined, nh: Omit<House, 'id'>, doors: Array<[number, number]>, floor: Ground): House => {
    const house = h ?? (() => { const n = { ...nh, id: m.houses.length } as House; m.houses.push(n); return n; })();
    Object.assign(house, nh);
    if (!nh.noRoof) delete house.noRoof;
    if (!nh.stone) delete house.stone;
    for (let y = house.y; y < house.y + house.h; y++) for (let x = house.x; x < house.x + house.w; x++) {
      const border = x === house.x || y === house.y || x === house.x + house.w - 1 || y === house.y + house.h - 1;
      G(x, y, floor);
      O(x, y, border ? Obj.Wall : Obj.None);
    }
    for (const [x, y] of doors) O(x, y, Obj.Door);
    return house;
  };
  const props: PlazaProp[] = [];
  /** A solid prop: blocks its tile (or the listed tiles). */
  const solid = (p: PlazaProp, tiles?: Array<[number, number]>) => {
    props.push(p);
    for (const [x, y] of tiles ?? [[Math.round(p.x), Math.round(p.y)]]) if (m.getObj(x, y, 0) === Obj.None) O(x, y, Obj.PlazaDecor);
  };
  const open = (p: PlazaProp) => props.push(p);

  // ---- 2. streets round the plaza and out of town
  const PZ = GRAND_PLAZA;
  pave(PZ.x0 - 1, PZ.y0 - 1, PZ.x1 + 2, PZ.y0 - 1); // north street (y 296)
  pave(PZ.x0 - 1, PZ.y0 - 1, PZ.x0 - 1, PZ.y1 + 3); // west street (x 179)
  pave(PZ.x1 + 1, PZ.y0 - 1, PZ.x1 + 2, PZ.y1 + 3); // east street (x 240–241)
  pave(PZ.x0 - 1, PZ.y1 + 1, PZ.x1 + 2, PZ.y1 + 3); // south street (y 357–359)
  pave(B.x0, 312, PZ.x0 - 1, 313); // west avenue to the harbour road
  pave(PZ.x1 + 1, 317, eastEdge(317), 318); // east avenue to Eastfold
  pave(PZ.x1 + 3, 357, 247, 358); // south-east road towards Westmarch…
  pave(246, 357, 247, southEdge(246) - 1, Ground.Path);
  pave(200, 283, 231, 283, Ground.Path); // behind the temple, to the Grimtusk gate
  pave(230, 281, 231, 283, Ground.Path);
  pave(209, 284, 210, 284);
  for (const x of [230, 231]) { G(x, 280, Ground.Path); if (SOLID_OBJ[m.getObj(x, 280, 0)]) O(x, 280, Obj.None); }

  // ---- 3. the plaza and its corner gardens
  for (let y = PZ.y0; y <= PZ.y1; y++) for (let x = PZ.x0; x <= PZ.x1; x++) { G(x, y, Ground.Marble); O(x, y, Obj.None); }
  const gardens: Array<[number, number]> = [[182, 299], [230, 299], [182, 347], [230, 347]];
  for (const [gx, gy] of gardens) {
    for (let y = gy; y < gy + 8; y++) for (let x = gx; x < gx + 8; x++) G(x, y, Ground.Grass);
    const cx = gx + 3.5, cy = gy + 3.5;
    solid(P('tree_blossom', Math.round(cx), Math.round(cy), 0, (gx + gy) % 2), [[Math.round(cx), Math.round(cy)]]);
    for (const [dx, dy] of [[0, 0], [7, 0], [0, 7], [7, 7]]) solid(P('flower_tub', gx + dx, gy + dy, 0, (dx + dy) % 3));
    for (let y = gy + 1; y < gy + 7; y++) for (let x = gx + 1; x < gx + 7; x++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (d > 2.4 && m.getObj(x, y, 0) === Obj.None && (x + y) % 2 === 0) open(P('flowerbed', x, y, 0, (x * 3 + y * 5) % 4));
    }
  }

  // ---- 4. the fountain, its island, the bridges and the Exchange
  for (let y = Math.floor(GRAND_CY - GRAND_R); y <= Math.ceil(GRAND_CY + GRAND_R); y++) for (let x = Math.floor(GRAND_CX - GRAND_R); x <= Math.ceil(GRAND_CX + GRAND_R); x++) {
    const part = fountainPart(x, y);
    if (!part) continue;
    G(x, y, Ground.Marble);
    O(x, y, part === 'water' ? Obj.Fountain : part === 'wall' ? Obj.PlazaDecor : Obj.None);
  }
  const ex = placeHouse(byName('Depot Loft', 1), { ...EXCHANGE_HOUSE, z: 0, roofColor: 0xc9a24a, wallColor: 0xe8e2d4, name: EXCHANGE_NAME, stone: true, noRoof: true }, [], Ground.Marble);
  // placeHouse walls the rectangle: the Exchange is round, so give the tiles back to the fountain
  for (let y = ex.y; y < ex.y + ex.h; y++) for (let x = ex.x; x < ex.x + ex.w; x++) {
    const part = fountainPart(x, y);
    G(x, y, Ground.Marble);
    O(x, y, part === 'water' ? Obj.Fountain : part === 'wall' ? Obj.PlazaDecor : Obj.None);
  }
  // the clerks' counters: four straight counters round the centrepiece, a clerk behind each one;
  // a gap by each corner stays open (the clerks' way in and out, like the bank's)
  for (let y = 323; y <= 330; y++) for (let x = 206; x <= 213; x++) {
    const gap = (x === 207 && y === 323) || (x === 213 && y === 324) || (x === 212 && y === 330) || (x === 206 && y === 329);
    if (!gap && (x === 206 || x === 213 || y === 323 || y === 330)) O(x, y, Obj.Counter);
  }
  for (const [x, y] of [[209, 326], [210, 326], [209, 327], [210, 327]] as const) O(x, y, Obj.PlazaDecor);
  open(P('grand_fountain', GRAND_CX, GRAND_CY));
  open(P('exchange_hall', GRAND_CX, GRAND_CY));
  open(P('exchange_centre', GRAND_CX, GRAND_CY));

  // ---- 5. the buildings round the plaza (same records, same names: regions, music and NPC homes follow)
  const temple = placeHouse(byName('Temple of Thornvale'), { x: 201, y: 284, w: 18, h: 12, z: 0, roofColor: 0x3c5a8c, wallColor: 0xe6dfcc, name: 'Temple of Thornvale', stone: true }, [[209, 284], [210, 284], [209, 295], [210, 295]], Ground.Marble);
  const depot = placeHouse(byName('Thornvale Depot'), { x: 165, y: 304, w: 14, h: 18, z: 0, roofColor: 0x9a4a2c, wallColor: 0xcbb994, name: 'Thornvale Depot', stone: true }, [[165, 312], [165, 313], [178, 312], [178, 313]], Ground.Stone);
  const bank = placeHouse(byName('Thornvale Bank'), { x: 242, y: 302, w: 9, h: 10, z: 0, roofColor: 0x6a5a2a, wallColor: 0xe0d6bc, name: 'Thornvale Bank', stone: true }, [[242, 306], [242, 307]], Ground.Marble);
  const magic = placeHouse(byName("Mirella's Curiosities"), { x: 224, y: 285, w: 10, h: 8, z: 0, roofColor: 0x5a3a7a, wallColor: 0xd6cbe0, name: "Mirella's Curiosities" }, [[228, 292]], Ground.Wood);
  const outfit = placeHouse(byName("Garrick's Outfitters"), { x: 186, y: 285, w: 10, h: 8, z: 0, roofColor: 0x3f6b4a, wallColor: 0xd2c4a8, name: "Garrick's Outfitters" }, [[190, 292]], Ground.Wood);
  const smithy = placeHouse(byName("Brunhild's Smithy"), { x: 242, y: 333, w: 10, h: 9, z: 0, roofColor: 0x5a6e8c, wallColor: 0xb8aa94, name: "Brunhild's Smithy", stone: true }, [[242, 336], [242, 337]], Ground.Stone);
  const store = placeHouse(byName('General Store'), { x: 170, y: 335, w: 9, h: 9, z: 0, roofColor: 0x8e3b2e, wallColor: 0xd8cbb0, name: 'General Store' }, [[178, 339]], Ground.Wood);
  const trainers = placeHouse(byName("Trainers' Hall"), { x: 200, y: 360, w: 14, h: 8, z: 0, roofColor: 0x7d5a3a, wallColor: 0xd4c7aa, name: "Trainers' Hall" }, [[206, 360], [207, 360]], Ground.Wood);
  const barn = placeHouse(byName('Miller Barn'), { x: 234, y: 361, w: 8, h: 6, z: 0, roofColor: 0x6b3a26, wallColor: 0xa77a52, name: 'Miller Barn' }, [[237, 361], [238, 361]], Ground.Wood);
  // paths from the side doors to the streets
  pave(190, 293, 191, 295, Ground.Path);
  pave(228, 293, 229, 295, Ground.Path);
  pave(237, 360, 238, 360, Ground.Path);

  // temple: altar, pews, candles, pillars, holy light over the respawn
  O(209, 286, Obj.Altar); O(210, 286, Obj.Altar);
  for (const [x, y] of [[203, 288], [216, 288], [203, 292], [216, 292]] as const) O(x, y, Obj.Pillar);
  for (const y of [289, 291]) for (const x of [204, 205, 206, 213, 214, 215]) solid(P('pew', x, y, FACE.N));
  solid(P('candles', 203, 286)); solid(P('candles', 216, 286));
  open(P('holy_light', 209.5, 293.5));
  open(P('wall_banner', 205, 285, FACE.S, 0)); open(P('wall_banner', 214, 285, FACE.S, 0));
  open(P('wall_sign', 207.5, 295, 0, SIGN.bell));
  solid(P('bell_tower', 220, 286));
  // depot hall: four rows of lockers with aisles, the hall's market board by the west doors
  for (const x of [167, 169, 171, 173, 175, 177]) { O(x, 305, Obj.Locker); O(x, 320, Obj.Locker); }
  for (const x of [168, 170, 172, 174, 176]) { O(x, 308, Obj.Locker); O(x, 317, Obj.Locker); }
  O(166, 309, Obj.MarketBoard);
  solid(P('signpost', 180, 309, 0, SIGN.chest));
  solid(P('signpost', 164, 310, 0, SIGN.anchor));
  // bank: counter with a way round its end, scales
  for (let y = 303; y <= 309; y++) O(246, y, Obj.Counter);
  solid(P('scales', 249, 303));
  solid(P('signpost', 239, 303, 0, SIGN.coin));
  // magic shop and its tower
  O(226, 287, Obj.Table);
  solid(P('potion_shelf', 225, 286)); solid(P('potion_shelf', 232, 286));
  solid(P('crystals', 226, 293, 0, 0)); solid(P('crystals', 231, 293, 0, 1));
  solid(P('mage_tower', 236, 289));
  open(P('wall_sign', 229.5, 292, 0, SIGN.star));
  // outfitter
  O(188, 287, Obj.Table); O(194, 290, Obj.Crate);
  solid(P('mannequin', 187, 291, 0, 0)); solid(P('mannequin', 194, 286, 0, 1)); solid(P('fabric', 192, 286));
  solid(P('signpost', 192, 294, 0, SIGN.bow));
  // smithy: chimney on its east wall, forge yard on the plaza in front
  solid(P('chimney', 251, 336));
  solid(P('anvil_coals', 236, 335)); solid(P('weapon_rack', 236, 338)); solid(P('armour_stand', 236, 339)); solid(P('armour_stand', 236, 340, 0, 1));
  solid(P('signpost', 239, 333, 0, SIGN.smith));
  // general store
  O(172, 337, Obj.Counter); O(173, 337, Obj.Counter); O(176, 342, Obj.Barrel); O(171, 342, Obj.Crate);
  solid(P('crates', 180, 343)); solid(P('barrels', 180, 344)); solid(P('sacks', 181, 344));
  solid(P('signpost', 180, 337, 0, SIGN.sack));
  open(P('awning', 178, 340));
  // trainers' hall: dummies, the sparring ring
  for (const [x, y] of [[209, 363], [211, 363], [209, 365], [211, 365]] as const) solid(P('dummy', x, y));
  open(P('ring', 210, 364));
  solid(P('signpost', 204, 359, 0, SIGN.swords));
  // the barn's hay
  for (const [x, y] of [[235, 364], [236, 365], [240, 365]] as const) O(x, y, Obj.Hay);

  // ---- 6. the plaza's dressing
  // gilded braziers at every bridge head
  for (const [x, y] of [[206, 304], [213, 304], [206, 349], [213, 349], [187, 323], [187, 330], [232, 323], [232, 330]] as const) solid(P('brazier_gold', x, y));
  // lantern posts round the rim and benches looking at the water
  for (let k = 0; k < 8; k++) {
    const a = ((22.5 + 45 * k) * Math.PI) / 180;
    const x = Math.round(GRAND_CX + Math.cos(a) * 21.8), y = Math.round(GRAND_CY + Math.sin(a) * 21.8);
    solid(P('lamp_double', x, y));
  }
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
    const a = ((45 + 90 * k + s * 8) * Math.PI) / 180;
    const x = Math.round(GRAND_CX + Math.cos(a) * 23.6), y = Math.round(GRAND_CY + Math.sin(a) * 23.6);
    solid(P('bench', x, y, faceIn(x, y)));
  }
  // columns with banners at the four entrances of the plaza
  const gate: Array<[number, number, number, number]> = [[205, 298, FACE.S, 0], [214, 298, FACE.S, 0], [205, 355, FACE.N, 1], [214, 355, FACE.N, 1], [181, 322, FACE.E, 0], [181, 331, FACE.E, 1], [238, 322, FACE.W, 0], [238, 331, FACE.W, 1]];
  for (const [x, y, r, v] of gate) { solid(P('column', x, y, r)); open(P('banner_column', x, y, r, v)); }
  // guardian statues in the corners
  for (const [x, y] of [[181, 298], [238, 298], [181, 355], [238, 355]] as const) solid(P('statue_guard', x, y, faceIn(x, y)));
  // themed trading stalls along the south promenade and by the store
  const stalls: Array<[number, number, number]> = [[192, 353, 0], [196, 353, 1], [200, 353, 2], [218, 353, 3], [222, 353, 0], [226, 353, 1]];
  for (const [x, y, v] of stalls) solid(P('stall', x + 0.5, y, FACE.N, v), [[x, y], [x + 1, y]]);
  solid(P('crates', 194, 354)); solid(P('barrels', 198, 354)); solid(P('sacks', 202, 354)); solid(P('crates', 220, 354)); solid(P('barrels', 224, 354)); solid(P('sacks', 228, 354));
  open(P('produce', 196, 352, 0, 0)); open(P('produce', 222, 352, 0, 1));
  solid(P('stall', 182, 337.5, FACE.E, 2), [[182, 337], [182, 338]]);
  solid(P('stall', 182, 341.5, FACE.E, 3), [[182, 341], [182, 342]]);
  // the market board under its pavilion, by the store corner
  open(P('pavilion', 185, 345));
  O(185, 345, Obj.MarketBoard);
  // the Founders' Stone, on the plaza before the temple
  const founders = { x: 216, y: 300 };
  O(founders.x, founders.y, Obj.FoundersStone);

  // ---- 7. the green belt: Greywood (wolves), the farm (rats), the graveyard (skeletons), Mirror Pond
  /** Trees and flowers on open grass, never in the plaza, the graveyard or the farm, nor beside a street, door, fence or wall. */
  const builtNear = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!m.inBounds(nx, ny)) continue;
      const o = m.getObj(nx, ny, 0);
      if (street[m.idx(nx, ny)] || m.houseAt(nx, ny, 0) || o === Obj.Door || o === Obj.Fence || o === Obj.Wall || o === Obj.PlazaDecor) return true;
    }
    return false;
  };
  const wild = (x0: number, y0: number, x1: number, y1: number, p: number, salt: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!inGrandCore(x, y) || m.getObj(x, y, 0) !== Obj.None || builtNear(x, y)) continue;
      if (x >= PZ.x0 - 1 && x <= PZ.x1 + 2 && y >= PZ.y0 - 1 && y <= PZ.y1 + 3) continue;
      if (x >= 172 && x <= 194 && y >= 360 && y <= 371) continue;
      if (x >= 216 && x <= 232 && y >= 361 && y <= 370) continue;
      const g = m.getGround(x, y, 0);
      if (g !== Ground.Grass && g !== Ground.DarkGrass) continue;
      const r = hash2(x, y, salt);
      if (r < p * 0.62) O(x, y, Obj.Pine);
      else if (r < p * 0.85) O(x, y, Obj.Tree);
      else if (r < p) O(x, y, Obj.Bush);
      else if (r < p + 0.05) O(x, y, Obj.Flowers);
    }
  };
  const pcx = 171, pcy = 297;
  for (let y = pcy - 4; y <= pcy + 4; y++) for (let x = pcx - 5; x <= pcx + 5; x++) {
    const d = ((x - pcx) / 3.4) ** 2 + ((y - pcy) / 2.6) ** 2;
    if (d <= 1) { G(x, y, Ground.Water); O(x, y, Obj.None); } else if (d <= 1.6) { G(x, y, Ground.Sand); O(x, y, Obj.None); }
  }
  wild(164, 281, 185, 301, 0.3, 77);
  // keep the forest walkable: a ring of clearings for the wolves and a trail to the pond
  for (const [cx, cy] of [[167, 286], [178, 285], [182, 294]] as const) for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= 5 && m.getObj(x, y, 0) !== Obj.Door) { O(x, y, Obj.None); if (hash2(x, y, 5) < 0.5) G(x, y, Ground.Dirt); }
  pave(176, 296, 179, 296, Ground.Path);
  pave(176, 283, 176, 296, Ground.Path);
  pave(166, 286, 185, 286, Ground.Path);
  // the graveyard
  const gx0 = 172, gy0 = 360, gx1 = 194, gy1 = 371;
  for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
    const border = x === gx0 || y === gy0 || x === gx1 || y === gy1;
    G(x, y, hash2(x, y, 33) < 0.35 ? Ground.Dirt : Ground.DarkGrass);
    O(x, y, border ? Obj.Fence : Obj.None);
  }
  O(gx1, 364, Obj.None); O(gx1, 365, Obj.None);
  pave(195, 360, 196, 365, Ground.Path);
  for (const gx of [175, 178, 181, 184, 187, 190]) for (const gy of [362, 365, 368]) if (hash2(gx, gy, 41) < 0.85) O(gx, gy, Obj.Grave);
  O(174, 369, Obj.DeadTree); O(192, 361, Obj.DeadTree); O(183, 370, Obj.DeadTree);
  // Miller's farm
  const fx0 = 216, fy0 = 361, fx1 = 232, fy1 = 370;
  for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) {
    const border = x === fx0 || y === fy0 || x === fx1 || y === fy1;
    if (border) O(x, y, Obj.Fence);
    else { G(x, y, Ground.Crop); O(x, y, (y - fy0) % 2 === 1 && hash2(x, y, 51) < 0.8 ? Obj.Wheat : Obj.None); }
  }
  O(224, fy0, Obj.None); O(225, fy0, Obj.None);
  // a little woodland and flowers on the rest of the land
  wild(B.x0, 281, B.x1, B.y1, 0.06, 91);

  // ---- 8. the coast of the filled-in sea: sand along the water
  for (let y = B.y0; y <= B.y1 + 1; y++) for (let x = B.x0; x <= B.x1 + 1; x++) {
    if (!inGrandCore(x, y) || street[m.idx(x, y)] || m.houseAt(x, y, 0)) continue;
    const g = m.getGround(x, y, 0);
    if (g !== Ground.Grass && g !== Ground.DarkGrass) continue;
    let near = 9;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!inGrandCore(nx, ny) && origSea(nx, ny)) near = Math.min(near, Math.max(Math.abs(dx), Math.abs(dy)));
    }
    if (near <= 1 || (near === 2 && hash2(x, y, 61) < 0.5)) {
      G(x, y, Ground.Sand);
      if (m.getObj(x, y, 0) !== Obj.None && !SOLID_OBJ[m.getObj(x, y, 0)]) O(x, y, Obj.None);
      if (m.getObj(x, y, 0) === Obj.Pine || m.getObj(x, y, 0) === Obj.Tree || m.getObj(x, y, 0) === Obj.Bush) O(x, y, Obj.None);
    }
  }

  // ---- 9. the sewer entrance stays on its tile (the sewers below did not move)
  G(183, 315, Ground.Stone); O(183, 315, Obj.StairsDown);
  O(184, 315, Obj.None);
  m.addLink(183, 315, 0, 'walk', { x: 184, y: 315, z: -1 });

  // ---- 10. people
  const npcAt: Record<string, [number, number]> = {
    aldric: [207, 299], orwin: [247, 306], mirella: [228, 288], garrick: [190, 288], brunhild: [247, 338], elias: [203, 364],
  };
  for (const [key, [x, y]] of Object.entries(npcAt)) {
    const n = m.npcs.find((q) => q.key === key);
    if (n) { n.x = x; n.y = y; n.z = 0; } else m.npcs.push({ key, x, y, z: 0 });
    O(x, y, Obj.None);
  }
  for (const c of EXCHANGE_CLERKS) {
    if (!m.npcs.some((q) => q.key === c.key)) m.npcs.push({ key: c.key, x: c.x, y: c.y, z: 0 });
    O(c.x, c.y, Obj.None);
  }
  const sp = (kind: 'rat' | 'wolf' | 'skeleton', x: number, y: number) => {
    if (SOLID_OBJ[m.getObj(x, y, 0)] && m.getObj(x, y, 0) !== Obj.Fence) O(x, y, Obj.None);
    m.spawns.push({ kind, x, y, z: 0 });
  };
  sp('wolf', 167, 286); sp('wolf', 178, 285); sp('wolf', 182, 294); sp('wolf', 168, 289); sp('wolf', 180, 288);
  sp('rat', 219, 363); sp('rat', 226, 366); sp('rat', 230, 363); sp('rat', 222, 368); sp('rat', 237, 364); sp('rat', 239, 363);
  sp('skeleton', 176, 363); sp('skeleton', 183, 366); sp('skeleton', 189, 363); sp('skeleton', 180, 369);

  // ---- 11. the temple is where everyone respawns
  m.temple = { ...GRAND_TEMPLE };
  m.playerSpawn = { ...GRAND_TEMPLE };
  O(GRAND_TEMPLE.x, GRAND_TEMPLE.y, Obj.None);

  // ---- 12. regions (the same entries, moved; later entries win, so the order is kept)
  const reg = (name: string, r: Partial<Region>) => {
    const e = m.regions.find((q) => q.name === name && (r.z0 === undefined || q.z0 === r.z0));
    if (e) Object.assign(e, r);
    else m.regions.push({ name, x0: 0, y0: 0, x1: 0, y1: 0, z0: 0, z1: 0, level: '—', ...r });
  };
  for (const r of m.regions) if (r.temple && r.temple.x === oldTemple.x && r.temple.y === oldTemple.y && r.temple.z === oldTemple.z) r.temple = { ...GRAND_TEMPLE };
  reg('Thornvale', { x0: 170, y0: 281, x1: 252, y1: 376 });
  reg('Greywood', { x0: 164, y0: 281, x1: 185, y1: 301 });
  reg("Miller's Farm", { x0: 216, y0: 360, x1: 243, y1: 371 });
  reg('Old Graveyard', { x0: gx0, y0: gy0, x1: gx1, y1: gy1 });
  reg('Temple Plaza', { x0: PZ.x0 - 1, y0: PZ.y0 - 1, x1: PZ.x1 + 1, y1: PZ.y1 + 1, safe: true, temple: { ...GRAND_TEMPLE } });
  for (const h of [temple, depot, bank, magic, outfit, smithy, store, trainers]) reg(h.name, { x0: h.x, y0: h.y, x1: h.x + h.w - 1, y1: h.y + h.h - 1, z0: 0, z1: 1, level: '—', safe: true });
  void barn;
  m.regions.push({ name: EXCHANGE_NAME, x0: ex.x, y0: ex.y, x1: ex.x + ex.w - 1, y1: ex.y + ex.h - 1, z0: 0, z1: 0, level: '—', safe: true });
  m.invalidateSafeZones();

  // ---- 13. furniture worldGen places by itself (stove in the depot; furnace, anvil and tanning rack in the smithy)
  furnish([depot, smithy]);

  // ---- 14. the plaza layout for the renderer
  const plaza: SpawnPlaza = {
    style: 2, x0: PZ.x0, y0: PZ.y0, x1: PZ.x1, y1: PZ.y1, cx: GRAND_CX, cy: GRAND_CY, founders, props,
    grand: { r: GRAND_R, island: ISLAND_R, wallIn: ROTUNDA_IN, wallOut: ROTUNDA_OUT, bridge: BRIDGE_HALF, hall: { x0: ex.x, y0: ex.y, x1: ex.x + ex.w - 1, y1: ex.y + ex.h - 1 } },
  };
  m.plaza = plaza;

  // ---- 15. roads from the old road network into the city
  connectRoads(m, street);
}

/**
 * Joins every road that ran into the old village (and now stops at the city's edge) to
 * the city's streets: the cheapest way over open land (round buildings, fences and the
 * fountain), paving it; water on the way is bridged with planks.
 */
function connectRoads(m: WorldMap, street: Uint8Array): void {
  const B = CITY_BOX;
  const isRoad = (g: Ground) => g === Ground.Path || g === Ground.Stone || g === Ground.Wood;
  const stubs: Array<[number, number]> = [];
  for (let y = B.y0 - 2; y <= B.y1 + 2; y++) for (let x = B.x0 - 2; x <= B.x1 + 3; x++) {
    if (inGrandCore(x, y) || !m.inBounds(x, y) || !isRoad(m.getGround(x, y, 0)) || !m.isWalkable(x, y, 0)) continue;
    let touches = false;
    for (let dy = -1; dy <= 1 && !touches; dy++) for (let dx = -1; dx <= 1; dx++) if (inGrandCore(x + dx, y + dy)) { touches = true; break; }
    if (touches) stubs.push([x, y]);
  }
  for (const [sx, sy] of stubs) {
    if (street[m.idx(sx, sy)]) continue;
    // Dijkstra on a small window, four directions
    const R = 40;
    const x0 = Math.max(0, sx - R), y0 = Math.max(0, sy - R), x1 = Math.min(m.width - 1, sx + R), y1 = Math.min(m.height - 1, sy + R);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const dist = new Float32Array(bw * bh).fill(Infinity);
    const prev = new Int32Array(bw * bh).fill(-1);
    const open: number[] = [];
    const si = (sy - y0) * bw + (sx - x0);
    dist[si] = 0;
    open.push(si);
    let goal = -1;
    const cost = (x: number, y: number): number => {
      if (street[m.idx(x, y)]) return 0.2;
      if (!inGrandCore(x, y)) return isRoad(m.getGround(x, y, 0)) && m.isWalkable(x, y, 0) ? 0.5 : Infinity;
      if (m.houseAt(x, y, 0)) return Infinity;
      const g = m.getGround(x, y, 0), o = m.getObj(x, y, 0);
      let c = g === Ground.Water || g === Ground.DeepWater ? 8 : g === Ground.Crop ? 4 : 1;
      if (o === Obj.None || o === Obj.Flowers || o === Obj.Fern) return c;
      if (o === Obj.Pine || o === Obj.Tree || o === Obj.Bush || o === Obj.Rock || o === Obj.DeadTree || o === Obj.Wheat) return c + 2;
      return Infinity;
    };
    while (open.length) {
      // tiny window: a linear scan for the nearest open node is fast enough
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
      const i = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      const x = (i % bw) + x0, y = Math.floor(i / bw) + y0;
      if (street[m.idx(x, y)]) { goal = i; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
        const c = cost(nx, ny);
        if (c === Infinity) continue;
        const ni = (ny - y0) * bw + (nx - x0);
        if (dist[i] + c < dist[ni]) {
          if (dist[ni] === Infinity) open.push(ni);
          dist[ni] = dist[i] + c;
          prev[ni] = i;
        }
      }
    }
    if (goal < 0) continue;
    for (let i = goal; i !== -1; i = prev[i]) {
      const x = (i % bw) + x0, y = Math.floor(i / bw) + y0;
      if (!inGrandCore(x, y) || street[m.idx(x, y)]) continue;
      const g = m.getGround(x, y, 0);
      m.setGround(x, y, g === Ground.Water || g === Ground.DeepWater ? Ground.Wood : Ground.Path, 0);
      if (m.getObj(x, y, 0) !== Obj.Door) m.setObj(x, y, Obj.None, 0);
      street[m.idx(x, y)] = 1;
    }
  }
}

import { Ground, Obj, type WorldMap } from './WorldMap';

/**
 * The Thornvale spawn plaza: the square in front of the temple where new players
 * appear. A fountain stands in its exact centre (the old crossroads), with paving,
 * benches, lights, greenery and the like around it.
 *
 * Five designs exist so the owner can pick one; `SPAWN_PLAZA_STYLE` switches them
 * (0 = the old plain stone plaza with the well). Only the tiles and the prop list
 * live here (pure data, no DOM/three.js); the renderer draws the fountain, the
 * paving and every prop from `WorldMap.plaza` (render/models/spawnPlaza.ts).
 *
 * Rules every design keeps:
 * - the temple spawn tile, Captain Aldric, the altar and every door stay where
 *   they were and stay reachable; the four roads still cross the square;
 * - only the fountain basin (`Obj.Fountain`) and solid props (`Obj.PlazaDecor`)
 *   block; everything else is walkable;
 * - the Founders' Stone gets a fixed spot per design (worldGen.placeFoundersStone).
 */
export type PlazaStyle = 0 | 1 | 2 | 3 | 4 | 5;

/** Which spawn plaza design is built. 1 classic, 2 temple court, 3 garden, 4 market, 5 ashen (gothic). */
export const SPAWN_PLAZA_STYLE: PlazaStyle = 2;

let preview: PlazaStyle | null = null;

/**
 * Preview another design without changing `SPAWN_PLAZA_STYLE` (the client's `?plaza=N`
 * URL option, for comparing designs offline). Call before the world is built.
 */
export function previewPlazaStyle(n: number): void {
  if (Number.isInteger(n) && n >= 0 && n <= 5) preview = n as PlazaStyle;
}

/** The design the world is built with. */
export function activePlazaStyle(): PlazaStyle {
  return preview ?? SPAWN_PLAZA_STYLE;
}

export const PLAZA_STYLE_NAMES: Record<PlazaStyle, string> = {
  0: 'Old plaza', 1: 'Town Square', 2: 'Temple Court', 3: 'Garden Plaza', 4: 'Market Square', 5: 'Ashen Square',
};

/** One drawn decoration. Coordinates are tiles (fractions allowed); `r` turns it about the vertical axis (0 = front faces south, toward the camera). */
export interface PlazaProp {
  k: string;
  x: number;
  y: number;
  r?: number;
  /** Variant (colour, size) — meaning depends on the kind. */
  v?: number;
  /** Second end point (strings of bunting, chains). */
  x2?: number;
  y2?: number;
}

export interface SpawnPlaza {
  style: PlazaStyle;
  /** Paved area (inclusive tile bounds). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Fountain centre (between four tiles). */
  cx: number;
  cy: number;
  /** Where the Founders' Stone stands (null = worldGen picks a spot near the altar). */
  founders: { x: number; y: number } | null;
  props: PlazaProp[];
}

/** Moves a plaza laid out on the village map into world coordinates. */
export function offsetPlaza(p: SpawnPlaza, ox: number, oy: number): SpawnPlaza {
  return {
    ...p, x0: p.x0 + ox, y0: p.y0 + oy, x1: p.x1 + ox, y1: p.y1 + oy, cx: p.cx + ox, cy: p.cy + oy,
    founders: p.founders ? { x: p.founders.x + ox, y: p.founders.y + oy } : null,
    props: p.props.map((q) => ({ ...q, x: q.x + ox, y: q.y + oy, x2: q.x2 === undefined ? undefined : q.x2 + ox, y2: q.y2 === undefined ? undefined : q.y2 + oy })),
  };
}

// ------------------------------------------------------------------ layout (village coordinates)

/** Paved square: x 21..34, y 18..27 (the smithy's corner at 21,18 stays a wall). */
const X0 = 21, Y0 = 18, X1 = 34, Y1 = 27;
/** Fountain centre: the old crossroads (roads at x 27–28 and y 22–23). */
const CX = 27.5, CY = 22.5;

const S = Math.PI;
const FACE = { S: 0, N: S, E: S / 2, W: -S / 2 };

/** 4×4 round basin without its corners (12 tiles). */
const ROUND4: Array<[number, number]> = [];
for (let y = 21; y <= 24; y++) for (let x = 26; x <= 29; x++) if (!((x === 26 || x === 29) && (y === 21 || y === 24))) ROUND4.push([x, y]);
/** 6×4 oval pond without its corners (20 tiles). */
const POND: Array<[number, number]> = [];
for (let y = 21; y <= 24; y++) for (let x = 25; x <= 30; x++) if (!((x === 25 || x === 30) && (y === 21 || y === 24))) POND.push([x, y]);
/** 2×2 well-fountain. */
const SMALL: Array<[number, number]> = [[27, 22], [28, 22], [27, 23], [28, 23]];

interface Layout {
  ground: (x: number, y: number) => Ground;
  basin: Array<[number, number]>;
  fountain: PlazaProp;
  /** Solid props: every tile listed in `tiles` (default: the prop's own tile) is blocked. */
  solid: Array<PlazaProp & { tiles?: Array<[number, number]> }>;
  /** Walk-over props (flowers, rugs, bunting, banners on columns). */
  open: PlazaProp[];
  founders: { x: number; y: number };
}

const P = (k: string, x: number, y: number, r = 0, v = 0): PlazaProp => ({ k, x, y, r, v });

function classic(): Layout {
  return {
    ground: () => Ground.Stone,
    basin: ROUND4,
    fountain: P('fountain_tiered', CX, CY),
    solid: [
      // double-lantern posts at the four corners of the fountain ring
      P('lamp_double', 24, 19), P('lamp_double', 31, 19), P('lamp_double', 24, 26), P('lamp_double', 32, 27),
      // benches along the north and south edges, facing the fountain
      P('bench', 25, 18, FACE.S), P('bench', 30, 18, FACE.S), P('bench', 26, 27, FACE.N), P('bench', 29, 27, FACE.N),
      // stone planters guarding the west and east entrances
      P('planter', 21, 21, 0, 0), P('planter', 21, 24, 0, 1), P('planter', 34, 21, 0, 1), P('planter', 34, 24, 0, 0),
      // flower tubs in the corners
      P('flower_tub', 22, 19, 0, 0), P('flower_tub', 33, 19, 0, 1), P('flower_tub', 34, 27, 0, 2),
    ],
    open: [],
    founders: { x: 33, y: 25 },
  };
}

function templeCourt(): Layout {
  const cols: Array<[number, number]> = [[22, 18], [24, 18], [26, 18], [29, 18], [31, 18], [33, 18], [24, 27], [26, 27], [29, 27], [31, 27], [33, 27]];
  return {
    ground: () => Ground.Marble,
    basin: ROUND4,
    fountain: P('fountain_statue', CX, CY),
    solid: [
      ...cols.map(([x, y]) => P('column', x, y, y === 18 ? FACE.S : FACE.N)),
      // gilded braziers on the processional way between the temple and the fountain
      P('brazier_gold', 25, 20), P('brazier_gold', 30, 20), P('brazier_gold', 25, 25), P('brazier_gold', 30, 25),
      // guardian statues at the side entrances
      P('statue_guard', 21, 20, FACE.E), P('statue_guard', 21, 25, FACE.E), P('statue_guard', 34, 20, FACE.W),
    ],
    open: [
      // banners hang from the columns that flank the north and south gates
      P('banner_column', 26, 18, FACE.S, 0), P('banner_column', 29, 18, FACE.S, 0),
      P('banner_column', 26, 27, FACE.N, 1), P('banner_column', 29, 27, FACE.N, 1),
    ],
    founders: { x: 33, y: 24 },
  };
}

function garden(): Layout {
  const bed = (x: number, y: number) =>
    (x <= 24 && y <= 20) || (x >= 31 && y <= 20) || (x <= 24 && y >= 25) || (x >= 32 && y >= 25);
  const hedges: Array<[number, number]> = [
    [22, 18], [23, 18], [24, 18], [25, 18], [30, 18], [31, 18], [32, 18], [33, 18],
    [24, 27], [25, 27], [30, 27], [31, 27], [32, 27], [33, 27],
    [21, 19], [21, 20], [21, 25], [21, 26], [34, 19], [34, 20], [34, 25], [34, 26],
  ];
  const flowers: PlazaProp[] = [];
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    if (!bed(x, y) || hedges.some(([a, b]) => a === x && b === y)) continue;
    if ((x === 22 && y === 19) || (x === 33 && y === 19) || (x === 23 && y === 26) || (x === 33 && y === 26)) continue;
    flowers.push(P('flowerbed', x, y, 0, (x * 3 + y * 5) % 4));
  }
  return {
    ground: (x, y) => (bed(x, y) ? Ground.Grass : Ground.Path),
    basin: POND,
    fountain: P('fountain_pond', CX, CY),
    solid: [
      ...hedges.map(([x, y]) => P('hedge', x, y)),
      // blossom trees in the four beds
      P('tree_blossom', 22, 19, 0, 0), P('tree_blossom', 33, 19, 0, 1), P('tree_blossom', 23, 26, 0, 1), P('tree_blossom', 33, 26, 0, 0),
      // garden arches over the north and south gates (their posts block)
      { ...P('arch_post', 26, 18), tiles: [[26, 18]] }, { ...P('arch_post', 29, 18), tiles: [[29, 18]] },
      { ...P('arch_post', 26, 27), tiles: [[26, 27]] }, { ...P('arch_post', 29, 27), tiles: [[29, 27]] },
      // benches looking at the pond
      P('bench', 24, 21, FACE.E), P('bench', 31, 24, FACE.W),
    ],
    open: [
      ...flowers,
      { k: 'arch', x: 26, y: 18, x2: 29, y2: 18 }, { k: 'arch', x: 26, y: 27, x2: 29, y2: 27 },
    ],
    founders: { x: 31, y: 21 },
  };
}

function market(): Layout {
  return {
    ground: () => Ground.Stone,
    basin: SMALL,
    fountain: P('fountain_well', CX, CY),
    solid: [
      // market stalls (two tiles each), counters facing the fountain
      { ...P('stall', 23.5, 18, FACE.S, 0), tiles: [[23, 18], [24, 18]] },
      { ...P('stall', 31.5, 18, FACE.S, 1), tiles: [[31, 18], [32, 18]] },
      { ...P('stall', 21, 25.5, FACE.E, 2), tiles: [[21, 25], [21, 26]] },
      { ...P('stall', 34, 19.5, FACE.W, 3), tiles: [[34, 19], [34, 20]] },
      { ...P('stall', 24.5, 27, FACE.N, 1), tiles: [[24, 27], [25, 27]] },
      { ...P('stall', 32.5, 27, FACE.N, 2), tiles: [[32, 27], [33, 27]] },
      // goods stacked beside the stalls
      P('crates', 22, 18), P('barrels', 25, 18), P('sacks', 33, 18), P('crates', 21, 24), P('barrels', 34, 21),
      P('sacks', 23, 27), P('crates', 34, 27),
      // bunting poles
      P('pole', 22, 21), P('pole', 33, 21), P('pole', 22, 24), P('pole', 33, 24),
    ],
    open: [
      { k: 'bunting', x: 22, y: 21, x2: 33, y2: 21, v: 0 }, { k: 'bunting', x: 22, y: 24, x2: 33, y2: 24, v: 1 },
      { k: 'bunting', x: 22, y: 21, x2: 22, y2: 24, v: 2 }, { k: 'bunting', x: 33, y: 21, x2: 33, y2: 24, v: 3 },
      P('produce', 26, 19, 0, 0), P('produce', 29, 26, 0, 1),
    ],
    founders: { x: 33, y: 25 },
  };
}

function ashen(): Layout {
  return {
    ground: () => Ground.Stone,
    basin: ROUND4,
    fountain: P('fountain_gargoyle', CX, CY),
    solid: [
      // iron fire baskets on the diagonals of the fountain ring
      P('brazier_iron', 24, 19), P('brazier_iron', 31, 19), P('brazier_iron', 24, 26), P('brazier_iron', 32, 27),
      // hooded warden statues at the side entrances
      P('statue_warden', 21, 21, FACE.E), P('statue_warden', 21, 24, FACE.E), P('statue_warden', 34, 21, FACE.W), P('statue_warden', 34, 24, FACE.W),
      // war banners on iron poles flanking the north gate
      P('banner_pole', 26, 18, FACE.S), P('banner_pole', 29, 18, FACE.S),
      // gnarled dead trees in iron cages
      P('tree_caged', 22, 19), P('tree_caged', 33, 19),
      // spiked iron railings along the south edge
      P('railing_spiked', 30, 27, FACE.N), P('railing_spiked', 31, 27, FACE.N), P('railing_spiked', 24, 27, FACE.N), P('railing_spiked', 25, 27, FACE.N),
    ],
    open: [],
    founders: { x: 33, y: 25 },
  };
}

// ------------------------------------------------------------------ the city around the plaza

/**
 * The themed outsides of the spawn city (same for every design): signs, the bell
 * tower, the forge yard, the magic tower, the store front, training dummies, the
 * market board pavilion. Solid ones block their tile (only where it was empty or a
 * wall they stand on); `board` puts a working market board under the pavilion.
 * Sign emblems (`v`): 0 bell, 1 chest, 2 coin, 3 sword & hammer, 4 star, 5 sack,
 * 6 bow, 7 crossed swords, 8 notice, 9 anchor.
 */
const SIGN = { bell: 0, chest: 1, coin: 2, smith: 3, star: 4, sack: 5, bow: 6, swords: 7, notice: 8, anchor: 9 };

function cityProps(): { solid: PlazaProp[]; open: PlazaProp[]; board: { x: number; y: number } } {
  return {
    solid: [
      // temple: bell tower on its north-east corner, pews, candles
      P('bell_tower', 32, 11), P('pew', 24, 15), P('pew', 25, 15), P('pew', 30, 15), P('pew', 31, 15), P('candles', 31, 12), P('candles', 24, 12),
      // depot hall sign by its plaza doors
      P('signpost', 21, 21, 0, SIGN.chest),
      // bank: sign and portico column at its door
      P('signpost', 34, 25, 0, SIGN.coin), P('column', 34, 27, FACE.W),
      P('scales', 38, 26),
      // magic tower: the tower itself, crystals by the door, potion shelves inside
      P('mage_tower', 40, 13), P('crystals', 37, 18, 0, 0), P('crystals', 39, 18, 0, 1), P('potion_shelf', 36, 16), P('potion_shelf', 40, 16),
      // outfitter: sign, mannequins, fabric bolts
      P('signpost', 21, 14, 0, SIGN.bow), P('mannequin', 21, 13, 0, 0), P('fabric', 21, 12), P('mannequin', 15, 16, 0, 1), P('fabric', 18, 13),
      // smithy forge yard in front of its door
      P('chimney', 31, 32), P('anvil_coals', 32, 29), P('signpost', 35, 29, 0, SIGN.smith), P('weapon_rack', 36, 29), P('armour_stand', 37, 29), P('armour_stand', 38, 29, 0, 1),
      // general store front
      P('crates', 19, 28), P('barrels', 20, 28), P('sacks', 23, 28), P('signpost', 24, 28, 0, SIGN.sack),
      // trainers' hall: dummies inside and out
      P('dummy', 19, 38), P('dummy', 24, 38), P('dummy', 24, 40), P('dummy', 26, 38), P('dummy', 26, 40), P('signpost', 24, 36, 0, SIGN.swords),
      // the way to the harbour
      P('signpost', 4, 21, 0, SIGN.anchor),
    ],
    open: [
      P('holy_light', 28, 16), P('wall_banner', 24, 17, 0, 0), P('wall_banner', 31, 17, 0, 0), P('wall_sign', 25.5, 17, 0, SIGN.bell),
      P('wall_sign', 37, 17, 0, SIGN.star),
      P('awning', 21, 29), P('ring', 21.5, 39),
      P('pavilion', 25, 29),
    ],
    board: { x: 25, y: 29 },
  };
}

/** Open lawn north of the temple (village coordinates; world = +176, +290). */
export const NORTH_GREEN = { x0: 10, y0: 2, x1: 37, y1: 10 } as const;

const LAYOUTS: Record<Exclude<PlazaStyle, 0>, () => Layout> = { 1: classic, 2: templeCourt, 3: garden, 4: market, 5: ashen };

/**
 * Lays out the spawn plaza on the village map (called once the houses, roads and
 * scatter exist). Style 0 keeps the old plaza untouched.
 */
export function buildSpawnPlaza(m: WorldMap, style: PlazaStyle = activePlazaStyle()): void {
  if (style === 0) return;
  const L = LAYOUTS[style]();
  const inPlaza = (x: number, y: number) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1 && !m.houseAt(x, y);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    if (!inPlaza(x, y)) continue;
    m.setGround(x, y, L.ground(x, y));
    m.setObj(x, y, Obj.None);
  }
  for (const [x, y] of L.basin) m.setObj(x, y, Obj.Fountain);
  for (const p of L.solid) for (const [x, y] of p.tiles ?? [[Math.round(p.x), Math.round(p.y)]]) if (inPlaza(x, y)) m.setObj(x, y, Obj.PlazaDecor);
  const C = cityProps();
  for (const p of C.solid) {
    const x = Math.round(p.x), y = Math.round(p.y);
    if (m.getObj(x, y) === Obj.None) m.setObj(x, y, Obj.PlazaDecor);
  }
  m.setObj(C.board.x, C.board.y, Obj.MarketBoard);
  // the North Green behind the temple (its north doors open onto it): an open lawn
  // open to real players (the arena bots that used to fight here were removed 2026-10-24)
  for (let y = NORTH_GREEN.y0; y <= NORTH_GREEN.y1; y++) for (let x = NORTH_GREEN.x0; x <= NORTH_GREEN.x1; x++) {
    const o = m.getObj(x, y);
    if (o === Obj.Pine || o === Obj.Tree || o === Obj.Bush || o === Obj.Rock) m.setObj(x, y, Obj.None);
  }
  const props = [L.fountain, ...L.solid.map(({ tiles: _t, ...p }) => p), ...L.open, ...C.solid, ...C.open];
  m.plaza = { style, x0: X0, y0: Y0, x1: X1, y1: Y1, cx: CX, cy: CY, founders: L.founders, props };
}

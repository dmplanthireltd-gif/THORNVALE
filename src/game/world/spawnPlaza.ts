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
export const SPAWN_PLAZA_STYLE: PlazaStyle = 1;

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

// ------------------------------------------------------------------ the town (village coordinates)

/** One building of the Thornvale market town (village coordinates; world = + townSites TV). */
export interface CityBuilding {
  x: number;
  y: number;
  w: number;
  h: number;
  doors: Array<[number, number]>;
  roof: number;
  wall: number;
  name: string;
  stone?: boolean;
  floor?: Ground;
  /** Furniture placed inside after the walls. */
  inside?: ReadonlyArray<readonly [number, number, Obj]>;
  npc?: { key: string; x: number; y: number };
}

/**
 * The agreed town plan (owner, 2026-10-21): the fountain plaza in the middle, the
 * temple and respawn north of it, one big depot hall west (the west road runs
 * through it), the bank east, the smithy south-east, Mirella's magic shop north-east,
 * the general store south-west, the outfitter north-west, the trainers' hall by the
 * south wall and the market board just south of the plaza. Every NPC keeps its key
 * and dialogue and stands in the building that matches what it offers.
 * House names matter: /depot/ gets the market board and stove, /smithy/ the furnace
 * and anvil (worldGen), 'Thornvale Depot Hall' gets the loft (townSites).
 */
export const CITY = {
  spawn: { x: 28, y: 17 },
  aldric: { x: 25, y: 29 },
  marketBoard: { x: 31, y: 30 },
  buildings: {
    temple: {
      x: 23, y: 9, w: 10, h: 7, doors: [[27, 15], [28, 15]], roof: 0x3f5a8a, wall: 0xe8e2d4, name: 'Temple of Thornvale', stone: true, floor: Ground.Marble,
      inside: [[24, 11, Obj.Pillar], [31, 11, Obj.Pillar], [24, 13, Obj.Pillar], [31, 13, Obj.Pillar]],
    },
    depot: {
      x: 11, y: 17, w: 10, h: 12, doors: [[11, 22], [11, 23], [20, 22], [20, 23]], roof: 0x9a4a2c, wall: 0xcbb994, name: 'Thornvale Depot Hall', stone: true, floor: Ground.Stone,
      // two long rows of lockers either side of the aisle (the west road), with gaps
      inside: [13, 15, 17].flatMap((x) => [[x, 20, Obj.Locker], [x, 25, Obj.Locker]] as Array<[number, number, Obj]>).concat([[19, 20, Obj.Locker], [19, 25, Obj.Locker]]),
    },
    bank: {
      x: 36, y: 14, w: 8, h: 7, doors: [[36, 17]], roof: 0x34506e, wall: 0xe2dccd, name: 'Bank of Thornvale', stone: true, floor: Ground.Marble,
      inside: [[40, 16, Obj.Counter], [40, 17, Obj.Counter], [40, 18, Obj.Counter]], npc: { key: 'orwin', x: 41, y: 17 },
    },
    smith: {
      x: 35, y: 25, w: 7, h: 6, doors: [[35, 27]], roof: 0x4a4e56, wall: 0xa89a86, name: "Brunhild's Smithy", stone: true, floor: Ground.Stone,
      npc: { key: 'brunhild', x: 38, y: 28 },
    },
    magic: {
      x: 37, y: 8, w: 6, h: 5, doors: [[39, 12]], roof: 0x5a3a7a, wall: 0xd8cfe0, name: "Mirella's Curiosities",
      inside: [[41, 9, Obj.Table]], npc: { key: 'mirella', x: 40, y: 10 },
    },
    store: {
      x: 20, y: 30, w: 7, h: 5, doors: [[23, 30]], roof: 0xa83a2a, wall: 0xd4c7aa, name: 'Thornvale General Store',
      inside: [[21, 31, Obj.Barrel], [21, 33, Obj.Crate], [25, 33, Obj.Barrel], [25, 31, Obj.Table]],
    },
    outfit: {
      x: 14, y: 9, w: 7, h: 6, doors: [[20, 12]], roof: 0x3f6b4a, wall: 0xd2c4a8, name: "Garrick's Outfitters",
      inside: [[15, 10, Obj.Table], [15, 13, Obj.Crate]], npc: { key: 'garrick', x: 17, y: 11 },
    },
    trainers: {
      x: 19, y: 37, w: 8, h: 5, doors: [[23, 37]], roof: 0x8e3b2e, wall: 0xd8cbb0, name: 'Hall of Learning',
      npc: { key: 'elias', x: 25, y: 39 },
    },
  } satisfies Record<string, CityBuilding>,
};

// ------------------------------------------------------------------ layout (village coordinates)

/** Paved square: x 21..34, y 18..27 (the smithy's corner at 21,18 stays a wall). */
const X0 = 21, Y0 = 18, X1 = 34, Y1 = 27;
/** Fountain centre: the old crossroads (roads at x 27–28 and y 22–23). */
const CX = 27.5, CY = 22.5;
/** The temple shrine, inside the temple north of the plaza (CITY). */
export const PLAZA_ALTAR = { x: 28, y: 10 };

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
  /** Paved area when it is bigger than the square (default X0..X1, Y0..Y1). */
  bounds?: { x0: number; y0: number; x1: number; y1: number };
  /** Which tiles of the area the design repaves and clears (default: every non-house tile). */
  area?: (m: WorldMap, x: number, y: number) => boolean;
  /** Extra tiles (market board, second altar). */
  extra?: (m: WorldMap) => void;
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
      // gilded braziers either side of the altar
      P('brazier_gold', 30, 25), P('brazier_gold', 32, 25),
      // guardian statues at the side entrances
      P('statue_guard', 21, 20, FACE.E), P('statue_guard', 21, 25, FACE.E), P('statue_guard', 34, 20, FACE.W), P('statue_guard', 34, 25, FACE.W),
    ],
    open: [
      // banners hang from the columns that flank the north and south gates
      P('banner_column', 26, 18, FACE.S, 0), P('banner_column', 29, 18, FACE.S, 0),
      P('banner_column', 26, 27, FACE.N, 1), P('banner_column', 29, 27, FACE.N, 1),
      // the altar dais
      P('dais', PLAZA_ALTAR.x, PLAZA_ALTAR.y),
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

/**
 * Market Square: the whole town is the market. Stalls with striped awnings ring the
 * well-fountain, bunting runs from the fountain's roof to every stall, carts and
 * goods stand about, and every building is dressed for its trade (CITY).
 */
function market(): Layout {
  const B = CITY.buildings;
  const toC = (x: number, y: number) => Math.atan2(CX - x, CY - y);
  const stalls: Array<[number, number, number, number, Array<[number, number]>]> = [
    [23.5, 18, FACE.S, 0, [[23, 18], [24, 18]]], [31.5, 18, FACE.S, 1, [[31, 18], [32, 18]]],
    [21, 19.5, FACE.E, 2, [[21, 19], [21, 20]]], [34, 19.5, FACE.W, 3, [[34, 19], [34, 20]]],
    [21, 25.5, FACE.E, 1, [[21, 25], [21, 26]]], [34, 25.5, FACE.W, 0, [[34, 25], [34, 26]]],
    [23.5, 28, FACE.N, 3, [[23, 28], [24, 28]]], [31.5, 28, FACE.N, 2, [[31, 28], [32, 28]]],
  ];
  const solid: Layout['solid'] = [
    ...stalls.map(([x, y, r, v, tiles]) => ({ ...P('stall', x, y, r, v), tiles })),
    // the ring round the fountain: lantern posts and benches looking at the water
    ...([[24, 20], [31, 20], [24, 25], [31, 25]] as const).map(([x, y]) => P('lamp_post', x, y, toC(x, y))),
    P('bench', 25, 19, FACE.S), P('bench', 30, 19, FACE.S), P('bench', 25, 26, FACE.N), P('bench', 30, 26, FACE.N),
    // goods beside the stalls
    P('crates', 22, 18), P('barrels', 33, 18), P('sacks', 21, 21), P('barrels', 34, 21), P('barrels', 21, 24), P('crates', 34, 24),
    P('sacks', 22, 28), P('crates', 21, 29), P('barrels', 20, 29), P('sacks', 24, 33.9),
    // carts
    { ...P('cart', 33.5, 32, 0, 0), tiles: [[33, 32], [34, 32]] }, { ...P('cart', 38.5, 33, 0, 1), tiles: [[38, 33], [39, 33]] },
    { ...P('cart', 16.5, 15.5, 0.2, 1), tiles: [[16, 15], [17, 15]] },
    // bunting poles over the south road, the east road and the temple steps
    P('pole', 26, 29), P('pole', 29, 29), P('pole', 35, 21), P('pole', 35, 24), P('pole', 25, 16), P('pole', 30, 16),
    // town banners on the four roads
    P('banner_road', 26, 7, FACE.S), P('banner_road', 29, 7, FACE.S), P('banner_road', 9, 21, FACE.S), P('banner_road', 9, 24, FACE.S),
    P('banner_road', 45, 21, FACE.S), P('banner_road', 45, 24, FACE.S), P('banner_road', 29, 34, FACE.S), P('banner_road', 26, 41, FACE.S),
    // temple: flower tubs either side of the steps
    P('flower_tub', 24, 16, 0, 0), P('flower_tub', 31, 16, 0, 1),
    // bank: columns either side of the heavy door
    P('column_small', 35, 16), P('column_small', 35, 18),
    // smithy: anvil and glowing coals at the door, weapon racks and an armour stand
    P('anvil_out', 34, 28, FACE.W), P('coal_brazier', 33, 28), P('weapon_rack', 37, 31, FACE.S), P('weapon_rack', 39, 31, FACE.S), P('armour_stand', 41, 31, FACE.S),
    // magic shop: the slim tower with coloured windows, a potion shelf at the door
    { ...P('magic_turret', 35.5, 11.5), tiles: [[35, 11], [36, 11], [35, 12], [36, 12]] }, P('potion_shelf', 41, 13, FACE.S),
    // outfitter: mannequins and bolts of cloth
    P('mannequin', 15, 15, FACE.S, 0), P('fabric', 18, 15, FACE.S), P('mannequin', 19, 15, FACE.S, 1),
    // trainers: dummies in the hall and round the sparring ring
    P('dummy', 20, 38, FACE.E), P('dummy', 20, 40, FACE.E), P('dummy', 36, 37, FACE.W), P('dummy', 36, 39, FACE.W),
    P('ring_post', 30, 35), P('ring_post', 34, 35), P('ring_post', 30, 39), P('ring_post', 34, 39),
    // trees in planters soften the stone
    P('planter', 22, 8, 0, 0), P('planter', 33, 8, 0, 0), P('planter', 33, 14, 0, 1), P('planter', 12, 29, 0, 0), P('planter', 42, 21, 0, 1),
  ];
  const open: PlazaProp[] = [
    // bunting from the fountain's roof to every stall, and across the roads
    ...stalls.map(([x, y], i) => ({ k: 'bunting', x: CX, y: CY, x2: x, y2: y, v: i })),
    { k: 'bunting', x: 26, y: 29, x2: 29, y2: 29, v: 1 }, { k: 'bunting', x: 35, y: 21, x2: 35, y2: 24, v: 2 },
    { k: 'bunting', x: 25, y: 16, x2: 30, y2: 16, v: 3 },
    { k: 'bunting', x: 20.5, y: 18, x2: 21, y2: 19.5, v: 4 },
    P('produce', 26, 18, 0, 0), P('produce', 29, 27, 0, 1), P('produce', 22, 27, 0, 1),
    // temple: wide steps, holy light over the door, the bell tower on the roof
    { k: 'steps', x: 27.5, y: 16, v: 6 }, P('holy_glow', 27.5, 15, FACE.S), P('bell_tower', 27.5, 12),
    // signs (icon = v) beside every door
    P('sign', 26, 15.5, FACE.S, 7),
    P('sign', 20.5, 21, FACE.E, 0), P('emblem_chest', 20.5, 22.5, FACE.E), P('emblem_chest', 10.5, 22.5, FACE.W),
    P('coin_sign', 35.5, 17, FACE.W), P('scales', 40, 17),
    P('sign', 34.5, 26, FACE.W, 2), P('chimney', 40, 26.5),
    P('sign', 38, 12.5, FACE.S, 3), P('crystals', 37.5, 13.6),
    P('awning', 23, 29.5, FACE.S), P('sign', 21.5, 29.5, FACE.S, 4),
    P('sign', 20.5, 11, FACE.E, 5),
    P('sign', 22, 36.5, FACE.N, 6),
    // the market board's little roof (the board itself is Obj.MarketBoard)
    P('board_roof', CITY.marketBoard.x, CITY.marketBoard.y),
    // sparring ring ropes
    { k: 'rope', x: 30, y: 35, x2: 34, y2: 35 }, { k: 'rope', x: 34, y: 35, x2: 34, y2: 39 },
    { k: 'rope', x: 34, y: 39, x2: 30, y2: 39 }, { k: 'rope', x: 30, y: 39, x2: 30, y2: 35 },
  ];
  void B;
  return {
    ground: () => Ground.Stone,
    basin: ROUND4,
    fountain: P('fountain_market', CX, CY),
    solid,
    open,
    founders: { x: 32, y: 17 },
    bounds: { x0: 10, y0: 7, x1: 44, y1: 41 },
    area: (m, x, y) => m.getGround(x, y) === Ground.Stone && !m.houseAt(x, y),
    extra: (m) => { m.setObj(CITY.marketBoard.x, CITY.marketBoard.y, Obj.MarketBoard); m.setObj(27, 10, Obj.Altar); },
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

const LAYOUTS: Record<Exclude<PlazaStyle, 0>, () => Layout> = { 1: classic, 2: templeCourt, 3: garden, 4: market, 5: ashen };

/**
 * Lays out the spawn plaza on the village map (called once the houses, roads and
 * scatter exist). Style 0 keeps the old plaza untouched.
 */
export function buildSpawnPlaza(m: WorldMap, style: PlazaStyle = activePlazaStyle()): void {
  if (style === 0) return;
  const L = LAYOUTS[style]();
  const bb = L.bounds ?? { x0: X0, y0: Y0, x1: X1, y1: Y1 };
  const ok = new Set<number>();
  for (let y = bb.y0; y <= bb.y1; y++) for (let x = bb.x0; x <= bb.x1; x++) {
    if (L.area ? L.area(m, x, y) : x >= X0 && x <= X1 && y >= Y0 && y <= Y1 && !m.houseAt(x, y)) ok.add(y * 4096 + x);
  }
  const inPlaza = (x: number, y: number) => ok.has(y * 4096 + x);
  for (let y = bb.y0; y <= bb.y1; y++) for (let x = bb.x0; x <= bb.x1; x++) {
    if (!inPlaza(x, y)) continue;
    m.setGround(x, y, L.ground(x, y));
    m.setObj(x, y, Obj.None);
  }
  for (const [x, y] of L.basin) m.setObj(x, y, Obj.Fountain);
  for (const p of L.solid) for (const [x, y] of p.tiles ?? [[Math.round(p.x), Math.round(p.y)]]) if (inPlaza(x, y)) m.setObj(x, y, Obj.PlazaDecor);
  m.setObj(PLAZA_ALTAR.x, PLAZA_ALTAR.y, Obj.Altar);
  L.extra?.(m);
  const props = [L.fountain, ...L.solid.map(({ tiles: _t, ...p }) => p), ...L.open];
  m.plaza = { style, x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, cx: CX, cy: CY, founders: L.founders, props };
}

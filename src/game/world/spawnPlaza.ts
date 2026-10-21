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
export const SPAWN_PLAZA_STYLE: PlazaStyle = 5;

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

// ------------------------------------------------------------------ the city round the plaza

/** One themed building of the Thornvale centre (village coordinates; villageMap builds them). */
export interface CityBuilding {
  key: 'temple' | 'depot' | 'bank' | 'smith' | 'magic' | 'store' | 'outfit' | 'hall';
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  doors: Array<[number, number]>;
  roof: number;
  wall: number;
  stone: boolean;
}

/**
 * The buildings round the fountain, each themed after what its NPC offers:
 * temple (spawn) north, the big depot hall west, bank east, smithy south-east,
 * Mirella's magic tower north-east, Tilda's general store south-west, Garrick's
 * outfitters north-west and the trainers' Hall of Learning by the south-west wall.
 * Names matter: worldGen finds depots and smithies by name (market board, stove,
 * furnace, anvil, tanning rack) and townSites gives the depot hall its loft.
 */
export const CITY: CityBuilding[] = [
  { key: 'temple', name: 'Temple of Thornvale', x: 23, y: 9, w: 10, h: 7, doors: [[27, 15], [28, 15]], roof: 0x2b2932, wall: 0x56535e, stone: true },
  { key: 'depot', name: 'Thornvale Depot Hall', x: 6, y: 15, w: 13, h: 7, doors: [[18, 18], [12, 21]], roof: 0x3d2723, wall: 0x4e4a54, stone: true },
  { key: 'bank', name: 'Thornvale Bank', x: 36, y: 17, w: 8, h: 5, doors: [[36, 19]], roof: 0x2b2932, wall: 0x5c5862, stone: true },
  { key: 'smith', name: "Brunhild's Smithy", x: 36, y: 25, w: 8, h: 6, doors: [[39, 25]], roof: 0x3d2723, wall: 0x4a4448, stone: true },
  { key: 'magic', name: "Mirella's Curiosities", x: 36, y: 10, w: 6, h: 6, doors: [[38, 15]], roof: 0x2f2842, wall: 0x4f4a5e, stone: true },
  { key: 'store', name: "Tilda's General Store", x: 14, y: 25, w: 7, h: 5, doors: [[17, 25]], roof: 0x4a2622, wall: 0x57504e, stone: true },
  { key: 'outfit', name: "Garrick's Outfitters", x: 12, y: 9, w: 8, h: 5, doors: [[19, 11]], roof: 0x2e3529, wall: 0x514c52, stone: true },
  { key: 'hall', name: 'Hall of Learning', x: 19, y: 37, w: 7, h: 5, doors: [[22, 37]], roof: 0x2b2932, wall: 0x56535e, stone: true },
];

// ------------------------------------------------------------------ layout (village coordinates)

/** Paved square: x 21..34, y 18..27 (the smithy's corner at 21,18 stays a wall). */
const X0 = 21, Y0 = 18, X1 = 34, Y1 = 27;
/** Fountain centre: the old crossroads (roads at x 27–28 and y 22–23). */
const CX = 27.5, CY = 22.5;
/** The temple shrine stays where it always was. */
export const PLAZA_ALTAR = { x: 31, y: 25 };

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
  /** Paved bounds when they differ from the default square. */
  bounds?: [number, number, number, number];
  /** Solid props may stand outside the paved square too (the whole city is dressed). */
  city?: boolean;
  /** No shrine on the plaza (the altar is inside the temple). */
  noAltar?: boolean;
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

/**
 * Design 5, the Ashen Square: the dark gothic city. Basalt flagstones in a round
 * plaza, the gargoyle fountain, iron braziers with real fire, spiked railings,
 * heavy banners on the four roads, and every building dressed after its trade
 * (signs, candlelit windows, the forge chimney, the magic tower, the belfry).
 */
function ashen(): Layout {
  const R = (x: number, y: number) => Math.hypot(x - CX, y - CY);
  const solid: Layout['solid'] = [
    // iron fire baskets ring the plaza
    P('brazier_iron', 24, 19), P('brazier_iron', 31, 19), P('brazier_iron', 24, 26), P('brazier_iron', 31, 26),
    P('brazier_iron', 22, 17), P('brazier_iron', 33, 17), P('brazier_iron', 22, 28), P('brazier_iron', 33, 28),
    // benches looking at the fountain
    P('bench_dark', 25, 19, FACE.S), P('bench_dark', 30, 19, FACE.S), P('bench_dark', 25, 26, FACE.N), P('bench_dark', 30, 26, FACE.N),
    P('bench_dark', 23, 21, FACE.E), P('bench_dark', 23, 24, FACE.E), P('bench_dark', 32, 21, FACE.W), P('bench_dark', 32, 24, FACE.W),
    // hooded wardens and war banners at the temple steps
    P('statue_warden', 24, 16, FACE.S), P('statue_warden', 31, 16, FACE.S),
    P('banner_pole', 26, 16, FACE.S), P('banner_pole', 29, 16, FACE.S),
    // war banners where the roads leave the plaza
    P('banner_pole', 21, 21, FACE.E), P('banner_pole', 21, 24, FACE.E), P('banner_pole', 34, 21, FACE.W), P('banner_pole', 34, 24, FACE.W),
    P('banner_pole', 26, 29, FACE.S), P('banner_pole', 29, 29, FACE.S),
    // spiked railings in the plaza corners
    P('railing_spiked', 23, 29, FACE.N), P('railing_spiked', 24, 29, FACE.N), P('railing_spiked', 31, 29, FACE.N), P('railing_spiked', 32, 29, FACE.N),
    P('railing_spiked', 21, 26, FACE.E), P('railing_spiked', 21, 27, FACE.E), P('railing_spiked', 34, 26, FACE.W), P('railing_spiked', 34, 27, FACE.W),
    // banners at the town gates
    P('banner_pole', 26, 40, FACE.S), P('banner_pole', 29, 40, FACE.S), P('banner_pole', 4, 21, FACE.E), P('banner_pole', 4, 24, FACE.E),
    P('banner_pole', 51, 21, FACE.W), P('banner_pole', 51, 24, FACE.W),
    // iron street lanterns
    P('lamp_iron', 26, 33), P('lamp_iron', 29, 36), P('lamp_iron', 8, 24), P('lamp_iron', 16, 24), P('lamp_iron', 44, 24), P('lamp_iron', 48, 21),
    P('lamp_iron', 22, 13), P('lamp_iron', 34, 13),
    // bank: dark columns flank the heavy door
    P('column_dark', 35, 18), P('column_dark', 35, 20),
    // smithy: anvil and glowing coals at the door, weapon racks and armour stands
    P('anvil_coals', 38, 24), P('coal_brazier', 40, 24), P('weapon_rack', 35, 26, FACE.W), P('armour_stand', 35, 28, FACE.W),
    P('weapon_rack', 42, 24, FACE.S),
    // general store: goods piled at the door
    P('crates', 15, 24), P('barrels', 19, 24), P('sacks', 20, 24), P('crates', 14, 30), P('barrels', 20, 30),
    // outfitters: mannequins and bolts of cloth
    P('mannequin', 13, 14, FACE.S, 0), P('mannequin', 15, 14, FACE.S, 1), P('fabric', 17, 14, FACE.S), P('mannequin', 18, 14, FACE.S, 2),
    // magic shop: crystal plinth and potion shelf
    P('potion_shelf', 40, 16, FACE.S), P('crystal_plinth', 41, 16),
    // trainers: sparring ring of spiked railing with dummies
    ...[19, 20, 21, 22, 23, 24].map((x) => P('railing_spiked', x, 31, FACE.S)),
    ...[19, 20, 21, 22, 23, 24].map((x) => P('railing_spiked', x, 34, FACE.S)),
    P('railing_spiked', 19, 32, FACE.E), P('railing_spiked', 19, 33, FACE.E),
    P('dummy', 20, 32, FACE.E), P('dummy', 22, 33, FACE.E),
  ];
  const open: PlazaProp[] = [
    // the temple: lancet windows, a pointed arch over the door, steps, the belfry
    P('arch_gothic', 27.5, 15, FACE.S, 0), P('steps', 27.5, 16), P('belfry', 27.5, 10),
    P('window_lancet', 24, 15), P('window_lancet', 25.5, 15), P('window_lancet', 29.5, 15), P('window_lancet', 31, 15),
    P('banner_wall', 26, 15, FACE.S, 0), P('banner_wall', 29, 15, FACE.S, 0),
    // depot hall: chest crest over the door, sign, candlelit windows
    P('crest', 12, 21, FACE.S, 0), P('sign', 13.5, 21, FACE.S, 0), P('arch_gothic', 18, 18, FACE.E, 1),
    ...[7.5, 9.5, 15, 16.5].map((x) => P('window', x, 21, FACE.S, 0)),
    P('banner_wall', 10.5, 21, FACE.S, 1),
    // bank: gold coin, scales on the counter, barred windows
    P('crest', 39.5, 21, FACE.S, 1), P('sign', 37, 21, FACE.S, 1), P('arch_gothic', 36, 19, FACE.W, 1), P('scales', 40, 18),
    P('window', 41.5, 21, FACE.S, 0), P('window', 38, 21, FACE.S, 0),
    // smithy: anvil crest, forge-lit windows, chimney with smoke
    P('crest', 39.5, 30, FACE.S, 2), P('window', 37.5, 30, FACE.S, 4), P('window', 41.5, 30, FACE.S, 4), P('chimney', 42.5, 25),
    P('sign', 38, 25, FACE.N, 2),
    // magic shop: the slim tower, coloured windows, floating runes
    P('tower_magic', 41, 15), P('window', 37, 15, FACE.S, 1), P('window', 39.5, 15, FACE.S, 2), P('sign', 37.8, 15, FACE.S, 3),
    P('rune_circle', 38, 16.6),
    // general store: awning over the door, sack crest, windows
    { k: 'awning', x: 16, y: 24.3, x2: 18, y2: 24.3, r: FACE.N, v: 0 }, P('crest', 17, 29, FACE.S, 5),
    P('window', 15.5, 29, FACE.S, 0), P('window', 18.5, 29, FACE.S, 0), P('sign', 18, 25, FACE.N, 5),
    // outfitters: bow sign, windows
    P('crest', 15.5, 13, FACE.S, 4), P('window', 13.5, 13, FACE.S, 0), P('window', 17.5, 13, FACE.S, 0), P('sign', 19, 12, FACE.E, 4),
    // hall of learning: crossed swords, windows
    P('crest', 22, 41, FACE.S, 6), P('window', 20.5, 41, FACE.S, 0), P('window', 23.5, 41, FACE.S, 0), P('sign', 23, 37, FACE.N, 6),
    // the market board's little roof
    P('board_roof', 25, 31),
  ];
  return {
    ground: (x, y) => (R(x, y) < 6.4 ? Ground.Stone : Ground.Stone),
    basin: ROUND4,
    fountain: P('fountain_gargoyle', CX, CY),
    solid,
    open,
    founders: { x: 33, y: 19 },
    bounds: [21, 16, 34, 29],
    city: true,
    noAltar: true,
  };
}

const LAYOUTS: Record<Exclude<PlazaStyle, 0>, () => Layout> = { 1: classic, 2: templeCourt, 3: garden, 4: market, 5: ashen };

/**
 * Lays out the spawn plaza on the village map (called once the houses, roads and
 * scatter exist). Style 0 keeps the old plaza untouched.
 */
const SOFT = new Set<Obj>([Obj.None, Obj.Flowers, Obj.Bush, Obj.Tree, Obj.Rock]);

export function buildSpawnPlaza(m: WorldMap, style: PlazaStyle = activePlazaStyle()): void {
  if (style === 0) return;
  const L = LAYOUTS[style]();
  const [x0, y0, x1, y1] = L.bounds ?? [X0, Y0, X1, Y1];
  const inPlaza = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && !m.houseAt(x, y);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inPlaza(x, y)) continue;
    m.setGround(x, y, L.ground(x, y));
    m.setObj(x, y, Obj.None);
  }
  for (const [x, y] of L.basin) m.setObj(x, y, Obj.Fountain);
  const canBlock = (x: number, y: number) => inPlaza(x, y) || (!!L.city && m.inBounds(x, y) && !m.houseAt(x, y) && SOFT.has(m.getObj(x, y)));
  for (const p of L.solid) for (const [x, y] of p.tiles ?? [[Math.round(p.x), Math.round(p.y)]]) if (canBlock(x, y)) m.setObj(x, y, Obj.PlazaDecor);
  if (!L.noAltar) m.setObj(PLAZA_ALTAR.x, PLAZA_ALTAR.y, Obj.Altar);
  const props = [L.fountain, ...L.solid.map(({ tiles: _t, ...p }) => p), ...L.open];
  m.plaza = { style, x0, y0, x1, y1, cx: CX, cy: CY, founders: L.founders, props };
}

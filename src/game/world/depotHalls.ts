import type { Gen } from './genKit';
import type { TownCtx } from './towns';
import { Ground, Obj, type House } from './WorldMap';

/**
 * The big depot halls of every town except Thornvale (owner request 2026-10-22:
 * "in every city one BIG building for the depot, not a tiny hut").
 *
 * The towns are generated with their old small depot first (so the world's random
 * numbers, and with them every other town, area, monster and chest, stay exactly
 * as they were); then, once the whole world exists, `rebuildDepots` replaces the
 * old depot and its loft with a large themed hall on the town's plaza:
 *
 * - one long row of lockers against the back wall and a free-standing row in the
 *   middle, one locker on every second tile, so there is a walking gap beside every
 *   locker and nobody blocks anyone (15 lockers, 19 in the three big cities);
 * - a market board and the banker behind a counter in the front, a cooking stove
 *   (placed later by worldGen.placeSmithies), double doors onto the plaza;
 * - the town hall that stood beside the old depot moves to the mirror spot
 *   south-east of the plaza with its NPCs; homes in the way are taken down.
 *
 * Only tiles and a list of decorations live here (pure data, no DOM/three.js); the
 * renderer draws signs, lanterns, banners and themed details from `WorldMap.depotHalls`
 * (render/models/depotHalls.ts). Lockers, counters, the board and doors are ordinary
 * map objects, so every depot rule (lockers open the shared depot) is unchanged.
 */
export type DepotTheme =
  | 'citadel' | 'grove' | 'dwarven' | 'hill' | 'barn' | 'norse' | 'grand'
  | 'frontier' | 'harbour' | 'saltworn' | 'jungle' | 'sandstone' | 'outpost';

/** One drawn decoration (tile coordinates, fractions allowed; `r` turns it about the vertical axis, 0 = faces south). */
export interface HallProp {
  k: string;
  x: number;
  y: number;
  r?: number;
  v?: number;
  x2?: number;
  y2?: number;
}

export interface DepotHall {
  town: string;
  theme: DepotTheme;
  x: number;
  y: number;
  w: number;
  h: number;
  doors: Array<{ x: number; y: number }>;
  lockers: Array<{ x: number; y: number }>;
  props: HallProp[];
}

interface ThemeDef {
  wall: number;
  roof: number;
  floor: Ground;
  stone: boolean;
}

/** Walls, roof and floor per style. Stone halls get brick walls (tinted by `wall`). */
export const DEPOT_THEMES: Record<DepotTheme, ThemeDef> = {
  citadel: { wall: 0xa8a090, roof: 0x5a4a6a, floor: Ground.Stone, stone: true },
  grove: { wall: 0x9a7a52, roof: 0x3f7a3a, floor: Ground.Wood, stone: false },
  dwarven: { wall: 0x7a746a, roof: 0x4a4440, floor: Ground.Stone, stone: true },
  hill: { wall: 0xd2c4a8, roof: 0x7d5a3a, floor: Ground.Wood, stone: false },
  barn: { wall: 0xcfc2a4, roof: 0x8e3b2e, floor: Ground.Wood, stone: false },
  norse: { wall: 0x7a5a3a, roof: 0x3a2a1a, floor: Ground.Wood, stone: false },
  grand: { wall: 0xc4bcae, roof: 0x3f5a8a, floor: Ground.Marble, stone: true },
  frontier: { wall: 0xcbb994, roof: 0x6b3a26, floor: Ground.Wood, stone: false },
  harbour: { wall: 0xd4c7aa, roof: 0x3f5a6e, floor: Ground.Wood, stone: false },
  saltworn: { wall: 0x9a948a, roof: 0x5a6e8c, floor: Ground.Stone, stone: true },
  jungle: { wall: 0xd8c8a0, roof: 0xb8863a, floor: Ground.Wood, stone: false },
  sandstone: { wall: 0xdcc48c, roof: 0xd8b060, floor: Ground.Marble, stone: true },
  outpost: { wall: 0xc8b07c, roof: 0xa86a3a, floor: Ground.Stone, stone: true },
};

/** Every town that gets a hall: its style, and the three big cities get a wider one. */
export const DEPOT_TOWNS: Record<string, { theme: DepotTheme; wide?: boolean }> = {
  westmarch: { theme: 'citadel', wide: true },
  elderglen: { theme: 'grove' },
  stonedeep: { theme: 'dwarven' },
  highmoor: { theme: 'hill' },
  millbrook: { theme: 'barn' },
  valdrheim: { theme: 'norse' },
  aurelion: { theme: 'grand', wide: true },
  briarwatch: { theme: 'frontier' },
  corvane: { theme: 'harbour' },
  saltmere: { theme: 'saltworn' },
  palmreach: { theme: 'jungle' },
  sunspire: { theme: 'sandstone', wide: true },
  dunewatch: { theme: 'outpost' },
};

/** Where a town's hall stands (also used by the tests). */
export function hallRect(t: TownCtx): { x: number; y: number; w: number; h: number } {
  const cfg = DEPOT_TOWNS[t.s.info.key];
  const w = cfg?.wide ? 21 : 17;
  const top = Math.max(t.s.y0 + 2, t.cy - 12);
  return { x: t.cx + 3, y: top, w, h: t.cy - 4 - top + 1 };
}

/** The town hall's new place, mirrored across the main street from where it stood. */
export function townHallRect(t: TownCtx): { x: number; y: number; w: number; h: number } {
  return { x: t.cx + 12, y: t.cy + 4, w: 8, h: 6 };
}

const overlaps = (h: { x: number; y: number; w: number; h: number }, r: { x: number; y: number; w: number; h: number }, margin = 0) =>
  h.x <= r.x + r.w - 1 + margin && h.x + h.w - 1 >= r.x - margin && h.y <= r.y + r.h - 1 + margin && h.y + h.h - 1 >= r.y - margin;

/** Replaces the small depot of every town (but Thornvale) with its big hall. Uses no random numbers. */
export function rebuildDepots(g: Gen, towns: Record<string, TownCtx>): void {
  for (const [key, t] of Object.entries(towns)) if (DEPOT_TOWNS[key]) rebuildDepot(g, t);
  g.m.houses.forEach((h, i) => { h.id = i; });
}

function rebuildDepot(g: Gen, t: TownCtx): void {
  const { m, b } = g;
  const s = t.s, name = s.info.name, st = s.info.staff;
  const { cx, cy } = t;
  const cfg = DEPOT_TOWNS[s.info.key];
  const th = DEPOT_THEMES[cfg.theme];
  const H = hallRect(t), TH = townHallRect(t);
  const groundAt = (x: number, y: number) => (typeof s.ground === 'function' ? s.ground(x, y) : s.ground);

  // ---- take down the old depot (and its loft), the town hall and any home in the way
  const oldDepot = m.houses.find((h) => h.z === 0 && h.name === `${name} Depot & Bank`);
  const oldLoft = m.houses.find((h) => h.z === 1 && h.name === `${name} Depot Loft`);
  const oldHall = m.houses.find((h) => h.z === 0 && h.name === `${name} Hall`);
  if (!oldDepot || !oldLoft || !oldHall) throw new Error(`depot hall: ${name} has no old depot/loft/hall`);
  const victims: House[] = [oldDepot, oldLoft, oldHall];
  for (const h of m.houses) {
    if (victims.includes(h) || h.z !== 0) continue;
    if (!overlaps(h, H, 1) && !overlaps(h, TH, 1)) continue;
    if (h.name !== `${name} Home`) throw new Error(`depot hall of ${name} would cover ${h.name}`);
    victims.push(h);
  }
  for (const c of m.chests) if (victims.some((h) => c.z === h.z && overlaps(h, { x: c.x, y: c.y, w: 1, h: 1 }))) throw new Error(`depot hall of ${name} would cover chest ${c.id}`);
  for (const h of victims) {
    for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) {
      m.links.delete(`${x},${y},${h.z}`);
      if (h.z === 0) {
        m.setGround(x, y, groundAt(x, y), 0);
        m.setObj(x, y, Obj.None, 0);
        if (t.inside(x, y)) t.set(x, y, x, y, 0);
      } else {
        m.setGround(x, y, Ground.Void, h.z);
        m.setObj(x, y, Obj.None, h.z);
      }
    }
    m.houses.splice(m.houses.indexOf(h), 1);
  }
  // the old depot's stairs pointed into the loft (and back): those links are gone with it
  for (const [k, l] of m.links) {
    if (l.to.z === 1 && overlaps(oldLoft, { x: l.to.x, y: l.to.y, w: 1, h: 1 })) m.links.delete(k);
  }

  // ---- the hall
  const { x, y, w, h } = H;
  const doors: Array<[number, number]> = [[x + 4, y + h - 1], [x + 5, y + h - 1]];
  b.building(x, y, w, h, { doors, name: `${name} Depot Hall`, stone: th.stone, floor: th.floor, roof: th.roof, wallColor: th.wall, wall: Obj.Wall });
  t.reserve(x, y, w, h);
  const lockers: Array<{ x: number; y: number }> = [];
  const locker = (lx: number, ly: number) => { m.setObj(lx, ly, Obj.Locker, 0); lockers.push({ x: lx, y: ly }); };
  // back row against the north wall (odd columns) and the middle row (even columns):
  // each locker has free tiles beside it, the rows have an aisle between them
  for (let ix = 1; ix <= w - 2; ix += 2) locker(x + ix, y + 1);
  for (let ix = 2; ix <= w - 3; ix += 2) locker(x + ix, y + 3);
  // the front: market board on the west wall, the banker in the east corner behind a counter
  const front = y + h - 3;
  m.setObj(x + 1, front, Obj.MarketBoard, 0);
  m.setObj(x + w - 3, front, Obj.Counter, 0);
  m.setObj(x + w - 2, front - 1, Obj.Counter, 0);
  const banker = m.npcs.find((n) => n.key === st.bank.key);
  if (banker) { banker.x = x + w - 2; banker.y = front; banker.z = 0; }
  // the doors open onto the plaza, and a paved walk runs along the front
  t.street(x + 4, y + h, x + w - 1, y + h);

  // ---- the town hall, moved south-east of the plaza with its people
  b.building(TH.x, TH.y, TH.w, TH.h, {
    doors: [[cx + 15, TH.y]], name: `${name} Hall`, stone: s.stone, floor: s.stone ? Ground.Stone : Ground.Wood,
    roof: oldHall.roofColor, wallColor: oldHall.wallColor, wall: Obj.Wall,
  });
  t.reserve(TH.x, TH.y, TH.w, TH.h);
  m.setObj(cx + 18, TH.y + 4, Obj.Table, 0);
  const move = (key: string | undefined, nx: number, ny: number) => {
    const n = key ? m.npcs.find((q) => q.key === key) : undefined;
    if (n) { n.x = nx; n.y = ny; n.z = 0; }
  };
  move(st.quest?.key, cx + 14, TH.y + 3);
  move(st.trainer?.key, cx + 17, TH.y + 2);
  t.street(cx + 15, cy + 2, cx + 15, TH.y - 1);

  m.depotHalls.push({
    town: s.info.key, theme: cfg.theme, x, y, w, h,
    doors: doors.map(([dx, dy]) => ({ x: dx, y: dy })), lockers, props: hallProps(H),
  });
}

/** Signs, lights, banners and the themed details of one hall (drawn by render/models/depotHalls.ts). */
function hallProps(H: { x: number; y: number; w: number; h: number }): HallProp[] {
  const { x, y, w, h } = H;
  const S = y + h - 1; // the south wall: the façade the camera looks at
  const props: HallProp[] = [];
  const P = (k: string, px: number, py: number, r = 0, v = 0) => props.push({ k, x: px, y: py, r, v });
  // façade: the big sign over the double doors, lanterns either side, banners at the ends
  P('sign', x + 4.5, S);
  P('lantern', x + 3, S);
  P('lantern', x + 6, S);
  P('banner', x + 1, S);
  P('banner', x + w - 2, S);
  P('banner', x + w - 6, S);
  P('plaque', x + w - 3.5, S);
  // inside: a sconce on the back wall between every two lockers, two on each side wall
  for (let ix = 2; ix <= w - 3; ix += 2) P('sconce', x + ix, y);
  for (const sy of [y + 2, y + h - 3]) { P('sconce', x, sy, Math.PI / 2); P('sconce', x + w - 1, sy, -Math.PI / 2); }
  // pools of lamplight along the aisles and the front
  for (let ix = 2; ix <= w - 3; ix += 4) { P('glow', x + ix + 0.5, y + 2); P('glow', x + ix + 1.5, y + h - 3); }
  // a runner from the doors into the hall, up to the middle row of lockers
  props.push({ k: 'rug', x: x + 4.5, y: y + h - 2, x2: x + 4.5, y2: y + 4 });
  return props;
}

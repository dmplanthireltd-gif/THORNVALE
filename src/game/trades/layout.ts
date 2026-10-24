/**
 * Where the trade skills happen in the world: agility shortcuts, market stalls,
 * strongboxes, wild herbs, farm patches, hunting grounds, moorings, salvage and
 * the training spots shown on the maps. Built once by world/tradeSpots.ts after
 * the whole world (so nothing that existed before moves), kept on
 * `WorldMap.trades`, read by the game rules (trades/), the renderer
 * (render/trades/) and the maps (ui/). Pure data: no DOM, no three.js.
 */

/** How an agility shortcut is crossed. */
export type ObstacleKind = 'balance' | 'climb' | 'swim' | 'squeeze';

export interface Obstacle {
  /** Index in `TradeLayout.obstacles` (stable for a given world). */
  id: number;
  kind: ObstacleKind;
  /** Agility level needed. */
  level: number;
  /** Experience for one crossing. */
  xp: number;
  z: number;
  /** The two ends (walkable tiles); the shortcut runs straight from A to B along (dx, dy). */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  dx: number;
  dy: number;
  /** Blocked tiles crossed between the ends (river, cliff, rock). */
  len: number;
  /** Tiles you would walk the long way round (for the map label). */
  saves: number;
  /** Region it lies in (map label). */
  area: string;
}

export type StallKind = 'bakery' | 'fruit' | 'fish' | 'fur' | 'silk' | 'spice' | 'silver' | 'gem';

export interface StallSpot {
  x: number;
  y: number;
  z: number;
  kind: StallKind;
  town: string;
}

export interface BoxSpot {
  x: number;
  y: number;
  z: number;
  /** Thieving level needed to pick the lock. */
  level: number;
  area: string;
}

export interface HerbSpot {
  x: number;
  y: number;
  z: number;
  /** Herb id (trades/herblore.ts HERBS). */
  herb: string;
}

export type PatchKind = 'allotment' | 'herb';

export interface PatchSpot {
  /** Index in `TradeLayout.patches`: the key of the patch in every save (stable for a given world). */
  id: number;
  x: number;
  y: number;
  z: number;
  kind: PatchKind;
  area: string;
}

export type HuntKind = 'burrow' | 'nest';

export interface HuntSpot {
  id: number;
  x: number;
  y: number;
  z: number;
  kind: HuntKind;
  /** Prey ids that live here, cheapest first (trades/hunter.ts PREY). */
  prey: string[];
  area: string;
}

export interface MooringSpot {
  id: number;
  /** The mooring post (a water tile). */
  x: number;
  y: number;
  z: number;
  /** The dock tile beside it where you step on and off. */
  dockX: number;
  dockY: number;
  name: string;
}

export interface FlotsamSpot {
  x: number;
  y: number;
  z: number;
  /** Sailing level needed to salvage it (trades/sailing.ts seaLevel). */
  level: number;
}

/** A training spot on the minimap and the world map (one icon per spot). */
export interface MapSpot {
  /** Skill id (gathering/skills.ts) or a combat-free service ('slayer' masters count as slayer). */
  skill: string;
  x: number;
  y: number;
  z: number;
  /** What is there ("Balance log", "Mine", "Captain Maren Tallow"); the map translates it as a name. */
  what: string;
  /** Where (a region, town or harbour name), if the spot is not just "here". */
  place?: string;
  /** The skill level it asks for ("20", "1–35"); none = any level. */
  level?: string;
}

/** What one tile holds for the trade rules (fast lookup by tile). */
export type TradeTile =
  | { t: 'ob'; i: number; end: 'a' | 'b' }
  | { t: 'stall'; i: number }
  | { t: 'box'; i: number }
  | { t: 'herb'; i: number }
  | { t: 'patch'; i: number }
  | { t: 'hunt'; i: number }
  | { t: 'moor'; i: number }
  | { t: 'flot'; i: number };

export interface TradeLayout {
  obstacles: Obstacle[];
  stalls: StallSpot[];
  boxes: BoxSpot[];
  herbs: HerbSpot[];
  patches: PatchSpot[];
  hunts: HuntSpot[];
  moorings: MooringSpot[];
  flotsam: FlotsamSpot[];
  spots: MapSpot[];
  /** tileKey → what is there (built by indexTradeLayout). */
  index: Map<number, TradeTile>;
}

/** Numeric tile key: unique per (x, y, z) for x, y < 4096 and floors −8…7. */
export function tileKey(x: number, y: number, z: number): number {
  return ((z + 8) * 4096 + y) * 4096 + x;
}

export function emptyTradeLayout(): TradeLayout {
  return { obstacles: [], stalls: [], boxes: [], herbs: [], patches: [], hunts: [], moorings: [], flotsam: [], spots: [], index: new Map() };
}

/** The tiles a shortcut is used from: the first blocked tile beside each end ("handles"). */
export function obstacleHandles(o: Obstacle): Array<{ x: number; y: number; end: 'a' | 'b' }> {
  return [
    { x: o.ax + o.dx, y: o.ay + o.dy, end: 'a' },
    { x: o.bx - o.dx, y: o.by - o.dy, end: 'b' },
  ];
}

/** Every tile a crossing passes, from A to B (both ends included). */
export function obstaclePath(o: Obstacle, fromA = true): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= o.len + 1; i++) out.push({ x: o.ax + o.dx * i, y: o.ay + o.dy * i });
  return fromA ? out : out.reverse();
}

/** Fills `index` from the lists (call after building or cloning). */
export function indexTradeLayout(l: TradeLayout): void {
  const m = l.index;
  m.clear();
  l.obstacles.forEach((o, i) => {
    for (const h of obstacleHandles(o)) if (!m.has(tileKey(h.x, h.y, o.z))) m.set(tileKey(h.x, h.y, o.z), { t: 'ob', i, end: h.end });
  });
  l.stalls.forEach((s, i) => m.set(tileKey(s.x, s.y, s.z), { t: 'stall', i }));
  l.boxes.forEach((s, i) => m.set(tileKey(s.x, s.y, s.z), { t: 'box', i }));
  l.herbs.forEach((s, i) => m.set(tileKey(s.x, s.y, s.z), { t: 'herb', i }));
  l.patches.forEach((s, i) => m.set(tileKey(s.x, s.y, s.z), { t: 'patch', i }));
  l.hunts.forEach((s, i) => m.set(tileKey(s.x, s.y, s.z), { t: 'hunt', i }));
  l.moorings.forEach((s, i) => m.set(tileKey(s.x, s.y, s.z), { t: 'moor', i }));
  l.flotsam.forEach((s, i) => m.set(tileKey(s.x, s.y, s.z), { t: 'flot', i }));
}

/** Deep copy (WorldMap.clone). */
export function cloneTradeLayout(l: TradeLayout): TradeLayout {
  const c: TradeLayout = {
    obstacles: l.obstacles.map((o) => ({ ...o })),
    stalls: l.stalls.map((o) => ({ ...o })),
    boxes: l.boxes.map((o) => ({ ...o })),
    herbs: l.herbs.map((o) => ({ ...o })),
    patches: l.patches.map((o) => ({ ...o })),
    hunts: l.hunts.map((o) => ({ ...o, prey: [...o.prey] })),
    moorings: l.moorings.map((o) => ({ ...o })),
    flotsam: l.flotsam.map((o) => ({ ...o })),
    spots: l.spots.map((o) => ({ ...o })),
    index: new Map(),
  };
  indexTradeLayout(c);
  return c;
}

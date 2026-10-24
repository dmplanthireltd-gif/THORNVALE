import { hash2 } from '../core/rng';
import { Ground, Obj, WorldMap, type EnemyKind, type Region } from './WorldMap';

/**
 * The Sunken Reach: a sea floor (floor −1) under the open bay west of Millbrook.
 *
 * Way in: walk south along Pearl Pier (Millbrook's south shore, beside the harbour)
 * and step into the whirlpool at its end. Way out: the column of rising bubbles in
 * Pearl Grotto, right under the whirlpool. No item is needed; Nerissa the pearl
 * diver on the pier explains it and buys what you bring up.
 *
 * Layout (all floor −1, levels 40–90, every area joined by 3-wide channels so
 * monsters come at you in groups — made for area runes, arrows and knight spells):
 *
 *   Pearl Grotto      landing under the whirlpool (protection zone), bubble column up
 *   Kelpwood          swaying kelp forest: jelly swarms and ironshell crabs        40+
 *   Coral Gardens     coral heads and anemones: deepfin war bands, jellies         50+
 *   Saltmaid Shoals   the small Wreck of the Saltmaid (two hull rooms, a chest)    50+
 *   Deepfin Warrens   the deepfins' home waters: big mixed bands, crabs            60+
 *   Eel Trench        a long rocky canyon: gloom eels, crabs, blight jellies       60+
 *   Graveyard of Keels  wreck-strewn deep; inside lies the Drowned Crown, a great
 *                     ship with hold, crew deck and the captain's cabin where
 *                     Ulmaroth, the Drowned Tyrant waits (dungeon boss)            70+
 *
 * Everything here is placed from fixed positions and tile hashes (no random numbers
 * from the world generator) and touches only open sea, so it is built last and the
 * rest of the world stays exactly as it was. Weather never reaches it (it is under
 * water: `isUnderwater`).
 */

export type SeaKind =
  | 'lantern_jelly' | 'blight_jelly' | 'ironshell_crab' | 'deepfin_raider' | 'deepfin_harpooner' | 'deepfin_tidecaller' | 'gloom_eel'
  | 'boss_drowned_tyrant';

/** Every monster of the Sunken Reach (the boss last). */
export const SEA_KINDS: SeaKind[] = ['lantern_jelly', 'blight_jelly', 'ironshell_crab', 'deepfin_raider', 'deepfin_harpooner', 'deepfin_tidecaller', 'gloom_eel', 'boss_drowned_tyrant'];

/** Decorations drawn by render/sea/seaView.ts. Solid ones stand on an `Obj.Coral` tile. */
export type SeaPropKind =
  // walk-through
  | 'kelp' | 'anemone' | 'coralFan' | 'coralTube' | 'shell' | 'starfish' | 'urchin' | 'vent' | 'ribs' | 'plank' | 'clam' | 'mast' | 'cannon'
  // solid (Obj.Coral)
  | 'kelpTall' | 'coralBranch' | 'coralBrain' | 'spire' | 'anchor';

export const SOLID_SEA_PROPS: ReadonlySet<SeaPropKind> = new Set<SeaPropKind>(['kelpTall', 'coralBranch', 'coralBrain', 'spire', 'anchor']);

export interface SeaProp {
  x: number;
  y: number;
  k: SeaPropKind;
  /** Yaw (radians). */
  r: number;
  /** Size multiplier. */
  s: number;
}

export interface SeaWreck {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Bow end: +1 east, −1 west. */
  bow: 1 | -1;
}

export interface SeaArea {
  name: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Look of the floor and props. */
  biome: 'grotto' | 'kelp' | 'coral' | 'shoal' | 'warren' | 'trench' | 'grave';
}

export interface SeaLayout {
  z: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  props: SeaProp[];
  wrecks: SeaWreck[];
  areas: SeaArea[];
  /** Pier end (floor 0) and bubble column (floor −1). */
  whirlpool: { x: number; y: number; z: number };
  column: { x: number; y: number; z: number };
}

export const SEA_Z = -1;
/** The whole sea floor (box on floor −1). */
export const SEA_BOX = { name: 'The Sunken Reach', x0: 244, y0: 560, x1: 358, y1: 638 } as const;
/** Step in here (end of Pearl Pier, floor 0) to dive. */
export const SEA_WHIRLPOOL = { x: 350, y: 566, z: 0 } as const;
/** Where a diver lands on the sea floor. */
export const SEA_ARRIVAL = { x: 350, y: 568, z: SEA_Z } as const;
/** The rising bubble column (floor −1) that carries you back up… */
export const SEA_COLUMN = { x: 350, y: 566, z: SEA_Z } as const;
/** …onto the pier, beside the whirlpool. */
export const SEA_SURFACE = { x: 350, y: 565, z: 0 } as const;
/** The pearl diver on the pier (npc/npcs.ts). */
export const SEA_DIVER = 'pearl_diver';
/** The safe landing (region name). */
export const SEA_GROTTO = 'Pearl Grotto';
export const SEA_PIER = 'Pearl Pier';
/** The great wreck (dungeon boss region, bosses/bosses.ts). */
export const SEA_BOSS_REGION = 'The Drowned Crown';

/** Treasure chests (opened once per character). */
export const SEA_CHESTS: Array<{ id: string; items: Array<{ id: string; qty: number }> }> = [
  { id: 'sea_chest_saltmaid', items: [{ id: 'gold', qty: 250 }, { id: 'pearl', qty: 2 }, { id: 'strong_health_potion', qty: 2 }] },
  { id: 'sea_chest_kelpwood', items: [{ id: 'gold', qty: 120 }, { id: 'pearl', qty: 1 }, { id: 'red_coral', qty: 2 }] },
  { id: 'sea_chest_crown_hold', items: [{ id: 'gold', qty: 400 }, { id: 'pearl', qty: 3 }, { id: 'small_sapphire', qty: 1 }] },
  { id: 'sea_chest_crown_cabin', items: [{ id: 'gold', qty: 800 }, { id: 'black_pearl', qty: 1 }, { id: 'great_mana_potion', qty: 2 }] },
];

/** True on the sea floor (no rain, fog and blue light, bubbles; the player swims). */
export function isUnderwater(m: WorldMap, x: number, y: number, z: number): boolean {
  const s = m.sea;
  if (!s || z !== s.z || x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) return false;
  return m.getGround(x, y, z) !== Ground.Void;
}

/** Same test without a map, from the fixed box (weather, audio). */
export function inSeaBox(x: number, y: number, z: number): boolean {
  return z === SEA_Z && x >= SEA_BOX.x0 && x <= SEA_BOX.x1 && y >= SEA_BOX.y0 && y <= SEA_BOX.y1;
}

// ================================================================== layout data

const AREAS: SeaArea[] = [
  { name: SEA_GROTTO, cx: 350, cy: 568, rx: 4, ry: 3, biome: 'grotto' },
  { name: 'Kelpwood', cx: 322, cy: 575, rx: 13, ry: 8, biome: 'kelp' },
  { name: 'Coral Gardens', cx: 287, cy: 573, rx: 15, ry: 8, biome: 'coral' },
  { name: 'Saltmaid Shoals', cx: 292, cy: 599, rx: 13, ry: 8, biome: 'shoal' },
  { name: 'Deepfin Warrens', cx: 321, cy: 601, rx: 10, ry: 9, biome: 'warren' },
  { name: 'Graveyard of Keels', cx: 290, cy: 625, rx: 18, ry: 9, biome: 'grave' },
];

const LEVELS: Record<string, string> = {
  Kelpwood: '25+', 'Coral Gardens': '25+', 'Saltmaid Shoals': '40+', 'Deepfin Warrens': '35+', 'Graveyard of Keels': '30+', 'Eel Trench': '35+',
};

/** 3-wide channels between the areas (and the winding Eel Trench, 4 wide). */
const CHANNELS: Array<{ pts: Array<[number, number]>; w: number; trench?: boolean }> = [
  { pts: [[346, 569], [334, 574]], w: 3 },
  { pts: [[310, 574], [301, 573]], w: 3 },
  { pts: [[289, 580], [291, 592]], w: 3 },
  { pts: [[323, 582], [321, 593]], w: 3 },
  { pts: [[304, 600], [312, 601]], w: 3 },
  { pts: [[318, 609], [306, 620]], w: 3 },
  { pts: [[273, 577], [263, 592]], w: 3 },
  { pts: [[280, 600], [263, 596], [256, 607], [259, 618], [272, 625]], w: 4, trench: true },
];

/** Monster groups: centre and members. */
const GROUPS: Array<{ at: [number, number]; kinds: SeaKind[] }> = [
  // Kelpwood: jelly swarms and crabs
  { at: [315, 572], kinds: ['lantern_jelly', 'lantern_jelly', 'lantern_jelly', 'lantern_jelly', 'lantern_jelly', 'lantern_jelly'] },
  { at: [327, 579], kinds: ['blight_jelly', 'blight_jelly', 'blight_jelly', 'blight_jelly', 'blight_jelly'] },
  { at: [330, 571], kinds: ['lantern_jelly', 'lantern_jelly', 'lantern_jelly', 'lantern_jelly', 'blight_jelly'] },
  { at: [317, 580], kinds: ['ironshell_crab', 'ironshell_crab'] },
  { at: [324, 569], kinds: ['ironshell_crab'] },
  // Coral Gardens: deepfin war bands and jellies
  { at: [280, 570], kinds: ['deepfin_raider', 'deepfin_raider', 'deepfin_harpooner', 'deepfin_tidecaller'] },
  { at: [295, 576], kinds: ['deepfin_raider', 'deepfin_raider', 'deepfin_harpooner', 'deepfin_tidecaller'] },
  { at: [288, 568], kinds: ['deepfin_raider', 'deepfin_raider', 'deepfin_raider', 'deepfin_harpooner'] },
  { at: [277, 577], kinds: ['lantern_jelly', 'lantern_jelly', 'lantern_jelly', 'lantern_jelly', 'lantern_jelly'] },
  { at: [299, 569], kinds: ['blight_jelly', 'blight_jelly', 'blight_jelly', 'blight_jelly', 'blight_jelly'] },
  // Saltmaid Shoals (and inside the Saltmaid)
  { at: [283, 605], kinds: ['ironshell_crab', 'ironshell_crab', 'ironshell_crab'] },
  { at: [302, 605], kinds: ['deepfin_raider', 'deepfin_harpooner', 'deepfin_harpooner'] },
  { at: [300, 593], kinds: ['gloom_eel', 'gloom_eel'] },
  { at: [289, 598], kinds: ['deepfin_raider', 'deepfin_raider'] },
  { at: [296, 599], kinds: ['deepfin_tidecaller'] },
  // Deepfin Warrens
  { at: [317, 597], kinds: ['deepfin_raider', 'deepfin_raider', 'deepfin_harpooner', 'deepfin_harpooner', 'deepfin_tidecaller'] },
  { at: [324, 605], kinds: ['deepfin_raider', 'deepfin_raider', 'deepfin_raider', 'deepfin_tidecaller'] },
  { at: [327, 597], kinds: ['deepfin_harpooner', 'deepfin_harpooner', 'deepfin_raider'] },
  { at: [316, 607], kinds: ['ironshell_crab', 'ironshell_crab'] },
  // Eel Trench
  { at: [267, 597], kinds: ['gloom_eel', 'gloom_eel'] },
  { at: [257, 604], kinds: ['gloom_eel', 'ironshell_crab'] },
  { at: [258, 611], kinds: ['blight_jelly', 'blight_jelly', 'blight_jelly', 'blight_jelly'] },
  { at: [262, 619], kinds: ['gloom_eel', 'gloom_eel'] },
  // Graveyard of Keels (outside the Drowned Crown)
  { at: [276, 618], kinds: ['deepfin_raider', 'deepfin_raider', 'deepfin_harpooner', 'deepfin_tidecaller'] },
  { at: [303, 617], kinds: ['deepfin_raider', 'deepfin_raider', 'deepfin_harpooner'] },
  { at: [306, 630], kinds: ['gloom_eel', 'gloom_eel'] },
  { at: [285, 632], kinds: ['ironshell_crab', 'ironshell_crab'] },
  { at: [296, 632], kinds: ['lantern_jelly', 'lantern_jelly', 'lantern_jelly', 'lantern_jelly', 'lantern_jelly', 'lantern_jelly'] },
  { at: [274, 630], kinds: ['blight_jelly', 'blight_jelly', 'blight_jelly', 'blight_jelly'] },
  // inside the Drowned Crown: hold (bow, east), crew deck (middle), captain's cabin (stern, the boss)
  { at: [300, 625], kinds: ['deepfin_raider', 'deepfin_raider', 'deepfin_raider', 'deepfin_harpooner'] },
  { at: [291, 625], kinds: ['deepfin_tidecaller', 'deepfin_tidecaller', 'deepfin_raider', 'deepfin_raider'] },
  { at: [281, 625], kinds: ['boss_drowned_tyrant'] },
];

// ================================================================== building

type Biome = SeaArea['biome'] | 'channel';

/** Builds the Sunken Reach and Pearl Pier into the map. Called once, at the very end of world generation. */
export function buildSunkenReach(m: WorldMap): void {
  const Z = SEA_Z;
  const B = SEA_BOX;
  const W = m.width;
  if (!m.floor(Z)) return;
  const water = (x: number, y: number) => {
    const g = m.getGround(x, y, 0);
    return g === Ground.Water || g === Ground.DeepWater;
  };
  /** Only open sea above, and nothing built down here yet. */
  const canOpen = (x: number, y: number) =>
    x > B.x0 && x < B.x1 && y > B.y0 && y < B.y1 && water(x, y) && (m.getGround(x, y, Z) === Ground.Void || m.getGround(x, y, Z) === Ground.Seabed);
  const biome = new Map<number, Biome>();
  const open = (x: number, y: number, b: Biome) => {
    if (!canOpen(x, y)) return;
    m.setGround(x, y, Ground.Seabed, Z);
    m.setObj(x, y, Obj.None, Z);
    const k = y * W + x;
    if (!biome.has(k) || b !== 'channel') biome.set(k, b);
  };

  // ---- areas: ellipses with a ragged rim
  for (const a of AREAS) {
    for (let y = a.cy - a.ry - 2; y <= a.cy + a.ry + 2; y++) for (let x = a.cx - a.rx - 2; x <= a.cx + a.rx + 2; x++) {
      const dx = (x - a.cx) / a.rx, dy = (y - a.cy) / a.ry;
      const rim = a.biome === 'grotto' ? 1.15 : 0.82 + 0.3 * hash2(x >> 1, y >> 1, 401);
      if (dx * dx + dy * dy <= rim) open(x, y, a.biome);
    }
  }
  // ---- channels (and the trench), wobbling a little
  for (const c of CHANNELS) {
    for (let i = 1; i < c.pts.length; i++) {
      const [ax, ay] = c.pts[i - 1], [bx, by] = c.pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      const nx = -(by - ay) / len, ny = (bx - ax) / len;
      for (let t = 0; t <= len; t += 0.5) {
        const wob = Math.sin((ax + ay + t) * 0.45) * (c.trench ? 1.2 : 0.6);
        const px = ax + ((bx - ax) * t) / len + nx * wob, py = ay + ((by - ay) * t) / len + ny * wob;
        const r = c.w / 2 + (c.trench ? 0.4 * hash2(Math.round(px), Math.round(py), 402) : 0);
        for (let yy = Math.floor(py - r - 1); yy <= Math.ceil(py + r + 1); yy++) for (let xx = Math.floor(px - r - 1); xx <= Math.ceil(px + r + 1); xx++) {
          if ((xx - px) ** 2 + (yy - py) ** 2 <= r * r + 0.25) open(xx, yy, c.trench ? 'trench' : 'channel');
        }
      }
    }
  }

  // ---- wrecks
  const wrecks: SeaWreck[] = [];
  const props: SeaProp[] = [];
  const wreck = (name: string, x0: number, cy: number, len: number, hw: number, bow: 1 | -1, bulkheads: number[], breaches: Array<[number, number]>): SeaWreck => {
    const inShip = (x: number, y: number) => {
      const i = x - x0;
      if (i < 0 || i >= len) return false;
      const fromBow = bow > 0 ? len - 1 - i : i;
      const w = fromBow >= 4 ? hw : hw - Math.floor(((4 - fromBow) * hw) / 4);
      return Math.abs(y - cy) <= w;
    };
    for (let y = cy - hw; y <= cy + hw; y++) for (let x = x0; x < x0 + len; x++) {
      if (!inShip(x, y)) continue;
      open(x, y, 'grave');
      if (m.getGround(x, y, Z) !== Ground.Seabed) continue;
      m.setGround(x, y, Ground.Wood, Z);
      const edge = !inShip(x + 1, y) || !inShip(x - 1, y) || !inShip(x, y + 1) || !inShip(x, y - 1);
      if (edge) m.setObj(x, y, Obj.Hull, Z);
    }
    for (const bx of bulkheads) for (let y = cy - hw + 1; y <= cy + hw - 1; y++) if (y !== cy && inShip(bx, y)) m.setObj(bx, y, Obj.Hull, Z);
    for (const [x, y] of breaches) {
      m.setObj(x, y, Obj.None, Z);
      props.push({ x, y, k: 'plank', r: hash2(x, y, 403) * 6.28, s: 1 });
    }
    const w: SeaWreck = { name, x0, y0: cy - hw, x1: x0 + len - 1, y1: cy + hw, bow };
    wrecks.push(w);
    return w;
  };
  const saltmaid = wreck('Wreck of the Saltmaid', 285, 598, 15, 2, -1, [293], [[285, 598], [292, 600], [297, 596]]);
  const crown = wreck(SEA_BOSS_REGION, 277, 625, 28, 4, 1, [286, 296], [[304, 625], [300, 621], [291, 629]]);
  // cargo, tables and the chests inside
  for (const [x, y, o] of [
    [290, 597, Obj.Barrel], [287, 599, Obj.Crate], [298, 597, Obj.Table],
    [299, 623, Obj.Crate], [300, 627, Obj.Crate], [298, 628, Obj.Barrel], [302, 626, Obj.Barrel],
    [290, 622, Obj.Table], [293, 628, Obj.Barrel], [278, 623, Obj.Table],
  ] as Array<[number, number, Obj]>) if (m.getObj(x, y, Z) === Obj.None && m.getGround(x, y, Z) === Ground.Wood) m.setObj(x, y, o, Z);
  const chestAt: Record<string, [number, number]> = {
    sea_chest_saltmaid: [298, 599], sea_chest_kelpwood: [330, 576], sea_chest_crown_hold: [301, 624], sea_chest_crown_cabin: [278, 626],
  };
  for (const c of SEA_CHESTS) {
    const [x, y] = chestAt[c.id];
    if (m.getGround(x, y, Z) === Ground.Void) continue;
    m.setObj(x, y, Obj.Chest, Z);
    m.chests.push({ id: c.id, x, y, z: Z, items: c.items.map((i) => ({ ...i })) });
  }
  // broken masts and cannons on and around the decks
  props.push({ x: 291, y: 598, k: 'mast', r: 0.35, s: 1 });
  props.push({ x: 289, y: 625, k: 'mast', r: -0.2, s: 1.5 });
  props.push({ x: 299, y: 619, k: 'mast', r: 1.1, s: 1.1 });
  for (const [x, y, r] of [[288, 622, 1.57], [294, 628, -1.57], [299, 622, 1.57], [282, 628, -1.57]] as Array<[number, number, number]>) props.push({ x, y, k: 'cannon', r, s: 1 });

  // ---- the whirlpool, the bubble column and Pearl Pier
  const pierTop = buildPier(m);
  m.setGround(SEA_COLUMN.x, SEA_COLUMN.y, Ground.Seabed, Z);
  m.setObj(SEA_COLUMN.x, SEA_COLUMN.y, Obj.Whirlpool, Z);
  m.addLink(SEA_COLUMN.x, SEA_COLUMN.y, Z, 'walk', { ...SEA_SURFACE });
  m.addLink(SEA_WHIRLPOOL.x, SEA_WHIRLPOOL.y, 0, 'walk', { ...SEA_ARRIVAL });

  // ---- seal off any scrap of sea floor a diver could never swim to
  {
    const seen = new Set<number>([SEA_ARRIVAL.y * W + SEA_ARRIVAL.x]);
    const q: Array<[number, number]> = [[SEA_ARRIVAL.x, SEA_ARRIVAL.y]];
    while (q.length) {
      const [x, y] = q.pop()!;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = (y + dy) * W + x + dx;
        if ((dx || dy) && !seen.has(k) && m.canStep(x, y, Z, dx, dy) && m.isWalkable(x + dx, y, Z) && m.isWalkable(x, y + dy, Z)) {
          seen.add(k);
          q.push([x + dx, y + dy]);
        }
      }
    }
    for (let y = B.y0; y <= B.y1; y++) for (let x = B.x0; x <= B.x1; x++) {
      if (m.getGround(x, y, Z) === Ground.Seabed && m.getObj(x, y, Z) === Obj.None && !seen.has(y * W + x)) m.setGround(x, y, Ground.Void, Z);
    }
  }

  // ---- regions (later ones win where they overlap)
  const reg = (r: Region) => m.regions.push(r);
  reg({ name: SEA_BOX.name, x0: B.x0, y0: B.y0, x1: B.x1, y1: B.y1, z0: Z, z1: Z, level: '25+' });
  for (const a of AREAS) {
    if (a.biome === 'grotto') continue;
    reg({ name: a.name, x0: a.cx - a.rx - 1, y0: a.cy - a.ry - 1, x1: a.cx + a.rx + 1, y1: a.cy + a.ry + 1, z0: Z, z1: Z, level: LEVELS[a.name] ?? '25+' });
  }
  const trench = CHANNELS.find((c) => c.trench)!.pts;
  reg({ name: 'Eel Trench', x0: Math.min(...trench.map((p) => p[0])) - 3, y0: 592, x1: 268, y1: Math.max(...trench.map((p) => p[1])) - 3, z0: Z, z1: Z, level: LEVELS['Eel Trench'] });
  reg({ name: saltmaid.name, x0: saltmaid.x0, y0: saltmaid.y0, x1: saltmaid.x1, y1: saltmaid.y1, z0: Z, z1: Z, level: '40+' });
  reg({ name: crown.name, x0: crown.x0, y0: crown.y0, x1: crown.x1, y1: crown.y1, z0: Z, z1: Z, level: '30+' });
  const g = AREAS[0];
  reg({ name: SEA_GROTTO, x0: g.cx - g.rx, y0: g.cy - g.ry - 1, x1: g.cx + g.rx, y1: g.cy + g.ry, z0: Z, z1: Z, level: '—', safe: true });
  reg({ name: SEA_PIER, x0: 347, y0: pierTop - 1, x1: 353, y1: SEA_WHIRLPOOL.y + 1, z0: 0, z1: 0, level: '—', safe: true });

  // ---- reef: solid coral heads, tall kelp and rock spires (never next to another solid,
  // so every tile stays reachable), then the walk-through life on the floor
  const solidOk = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = x + dx, gy = y + dy;
      const gr = m.getGround(gx, gy, Z);
      if (gr !== Ground.Seabed || m.getObj(gx, gy, Z) !== Obj.None || m.linkAt(gx, gy, Z) || m.isSafe(gx, gy, Z)) return false;
    }
    return true;
  };
  const near = (x: number, y: number, r: number) => GROUPS.some((gr) => Math.abs(gr.at[0] - x) <= r && Math.abs(gr.at[1] - y) <= r);
  const SOLID_TABLE: Record<Biome, Array<[SeaPropKind, number]>> = {
    grotto: [], channel: [],
    kelp: [['kelpTall', 0.07], ['spire', 0.01]],
    coral: [['coralBranch', 0.045], ['coralBrain', 0.03], ['spire', 0.01]],
    shoal: [['spire', 0.02], ['coralBrain', 0.015], ['kelpTall', 0.015]],
    warren: [['spire', 0.025], ['coralBrain', 0.02], ['kelpTall', 0.02]],
    trench: [['spire', 0.07], ['coralBranch', 0.01]],
    grave: [['spire', 0.02], ['anchor', 0.006], ['coralBranch', 0.01]],
  };
  const FLOOR_TABLE: Record<Biome, Array<[SeaPropKind, number]>> = {
    grotto: [['shell', 0.05], ['starfish', 0.05], ['anemone', 0.06]],
    channel: [['kelp', 0.06], ['shell', 0.02], ['urchin', 0.02]],
    kelp: [['kelp', 0.32], ['shell', 0.02], ['starfish', 0.015], ['clam', 0.008]],
    coral: [['anemone', 0.09], ['coralFan', 0.05], ['coralTube', 0.05], ['shell', 0.02], ['starfish', 0.02], ['urchin', 0.02]],
    shoal: [['kelp', 0.07], ['shell', 0.025], ['ribs', 0.012], ['urchin', 0.02], ['plank', 0.02], ['vent', 0.006]],
    warren: [['kelp', 0.1], ['shell', 0.03], ['clam', 0.015], ['anemone', 0.03], ['vent', 0.006]],
    trench: [['anemone', 0.03], ['urchin', 0.035], ['vent', 0.02], ['coralTube', 0.02]],
    grave: [['plank', 0.025], ['ribs', 0.015], ['kelp', 0.05], ['urchin', 0.02], ['vent', 0.008], ['shell', 0.015]],
  };
  const pick = (r: number, table: Array<[SeaPropKind, number]>): SeaPropKind | null => {
    for (const [k, p] of table) {
      if (r < p) return k;
      r -= p;
    }
    return null;
  };
  for (let y = B.y0; y <= B.y1; y++) for (let x = B.x0; x <= B.x1; x++) {
    const b = biome.get(y * W + x);
    if (!b || m.getGround(x, y, Z) !== Ground.Seabed || near(x, y, 1)) continue;
    const k = pick(hash2(x, y, 404), SOLID_TABLE[b]);
    if (!k || !solidOk(x, y)) continue;
    m.setObj(x, y, Obj.Coral, Z);
    props.push({ x, y, k, r: hash2(x, y, 405) * 6.283, s: 0.85 + hash2(x, y, 406) * 0.45 });
  }
  for (let y = B.y0; y <= B.y1; y++) for (let x = B.x0; x <= B.x1; x++) {
    const b = biome.get(y * W + x);
    if (!b || m.getGround(x, y, Z) !== Ground.Seabed || m.getObj(x, y, Z) !== Obj.None) continue;
    const k = pick(hash2(x, y, 407), FLOOR_TABLE[b]);
    if (k) props.push({ x, y, k, r: hash2(x, y, 408) * 6.283, s: 0.75 + hash2(x, y, 409) * 0.6 });
  }

  // ---- monsters, in groups
  const taken = new Set<number>();
  const spawnAt = (kind: EnemyKind, cx: number, cy: number) => {
    for (let r = 0; r <= 4; r++) {
      const ring: Array<[number, number]> = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([cx + dx, cy + dy]);
      ring.sort((a, b) => hash2(a[0], a[1], 410) - hash2(b[0], b[1], 410));
      for (const [x, y] of ring) {
        const k = y * W + x;
        if (taken.has(k) || !m.isWalkable(x, y, Z) || m.isSafe(x, y, Z) || m.linkAt(x, y, Z) || m.getObj(x, y, Z) !== Obj.None) continue;
        taken.add(k);
        m.spawns.push({ kind, x, y, z: Z });
        return;
      }
    }
    throw new Error(`Sunken Reach: no room for ${kind} near ${cx},${cy}`);
  };
  for (const gr of GROUPS) {
    gr.kinds.forEach((k, i) => {
      // spread a group out a little so it fills its patch of sea
      const a = i * 2.4;
      const d = gr.kinds.length > 1 ? 1 + (i % 3) : 0;
      spawnAt(k, gr.at[0] + Math.round(Math.cos(a) * d), gr.at[1] + Math.round(Math.sin(a) * d));
    });
  }

  m.sea = { z: Z, x0: B.x0, y0: B.y0, x1: B.x1, y1: B.y1, props, wrecks, areas: AREAS.map((a) => ({ ...a })), whirlpool: { ...SEA_WHIRLPOOL }, column: { ...SEA_COLUMN } };
}

/**
 * Pearl Pier on Millbrook's south shore: a little deck at the beach with the pearl
 * diver, then a 3-wide walkway with railings out to the whirlpool. Returns the
 * first row of the deck.
 */
function buildPier(m: WorldMap): number {
  const X = SEA_WHIRLPOOL.x;
  // the first water tile south of the beach
  let shore = SEA_WHIRLPOOL.y - 1;
  for (let y = 540; y < SEA_WHIRLPOOL.y; y++) {
    const g = m.getGround(X, y, 0);
    if (g === Ground.Water || g === Ground.DeepWater) { shore = y; break; }
  }
  const deck0 = shore - 1;
  const wood = (x: number, y: number) => {
    m.setGround(x, y, Ground.Wood, 0);
    m.setObj(x, y, Obj.None, 0);
  };
  const isWet = (x: number, y: number) => {
    const g = m.getGround(x, y, 0);
    return g === Ground.Water || g === Ground.DeepWater;
  };
  // the deck (3 rows, 7 wide) and the walkway (3 wide) with railings on the water side
  for (let y = deck0; y <= deck0 + 2; y++) for (let x = X - 3; x <= X + 3; x++) {
    const wet = isWet(x, y);
    wood(x, y);
    if (wet && (x === X - 3 || x === X + 3 || (y === deck0 + 2 && Math.abs(x - X) >= 2))) m.setObj(x, y, Obj.Railing, 0);
  }
  for (let y = deck0 + 3; y <= SEA_WHIRLPOOL.y + 1; y++) for (let x = X - 2; x <= X + 2; x++) {
    wood(x, y);
    const side = Math.abs(x - X) === 2 || y === SEA_WHIRLPOOL.y + 1;
    if (side) m.setObj(x, y, Obj.Railing, 0);
  }
  m.setObj(SEA_WHIRLPOOL.x, SEA_WHIRLPOOL.y, Obj.Whirlpool, 0);
  // the land end joins the beach
  for (let x = X - 1; x <= X + 1; x++) {
    if (!m.isWalkable(x, deck0 - 1, 0)) { m.setGround(x, deck0 - 1, Ground.Sand, 0); m.setObj(x, deck0 - 1, Obj.None, 0); }
  }
  // the diver's things: a barrel, a crate and coiled rope
  m.setObj(X + 2, deck0, Obj.Barrel, 0);
  m.setObj(X + 2, deck0 + 1, Obj.Crate, 0);
  m.npcs.push({ key: SEA_DIVER, x: X - 2, y: deck0 + 1, z: 0 });
  return deck0;
}

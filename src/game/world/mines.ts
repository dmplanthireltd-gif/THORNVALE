import { hash2 } from '../core/rng';
import { Ground, Obj, type WorldMap } from './WorldMap';

/**
 * Ore rocks for mining, placed by the world generator after towns and areas, so
 * the world stays the same for every server and client. Copper and tin lie in
 * the fields around the beginner towns; iron and coal on the Greyspine slopes
 * and in the upper mines; silver, gold, starsteel and darkstone deeper down.
 *
 * A rock is only put where it cannot cut a path: on an existing boulder, or on a
 * free tile whose walkable neighbours stay joined around it, never in a house,
 * on a road, in a protection zone or next to stairs.
 */
type Box = [number, number, number, number];

interface MineSpot {
  name: string;
  box: Box;
  z: number;
  count: number;
  /** Ore rock → weight. */
  ores: Array<[Obj, number]>;
}

const C = Obj.CopperRock, T = Obj.TinRock, I = Obj.IronRock, K = Obj.CoalRock, S = Obj.SilverRock, G = Obj.GoldRock, X = Obj.StarsteelRock, D = Obj.DarkstoneRock;

export const MINE_SPOTS: MineSpot[] = [
  // around the beginner towns: copper and tin
  { name: 'Thornvale Meadows', box: [140, 290, 175, 345], z: 0, count: 12, ores: [[C, 1], [T, 1]] },
  { name: 'Eastfold', box: [232, 284, 270, 345], z: 0, count: 10, ores: [[C, 1], [T, 1]] },
  { name: 'Westmarch Fields', box: [190, 410, 264, 466], z: 0, count: 10, ores: [[C, 1], [T, 1]] },
  { name: 'Millbrook Fields', box: [330, 460, 404, 492], z: 0, count: 8, ores: [[C, 1], [T, 1]] },
  { name: 'Glimmer Vale', box: [402, 334, 468, 366], z: 0, count: 8, ores: [[C, 1], [T, 1]] },
  { name: 'Highmoor Downs', box: [438, 442, 494, 504], z: 0, count: 8, ores: [[C, 2], [T, 2], [I, 1]] },
  { name: 'Corvane Grove', box: [512, 334, 602, 372], z: 0, count: 6, ores: [[C, 1], [T, 1]] },
  { name: 'Fernwick Cave', box: [54, 438, 120, 486], z: -1, count: 12, ores: [[C, 2], [T, 2], [I, 2]] },
  // the Greyspine and the mines of Stonedeep, getting richer the deeper you go
  { name: 'Greyspine Mountains', box: [248, 336, 350, 400], z: 0, count: 22, ores: [[C, 2], [T, 2], [I, 3], [K, 1]] },
  { name: 'Stonedeep Mines', box: [250, 336, 346, 398], z: -1, count: 42, ores: [[C, 3], [T, 3], [I, 4], [K, 3]] },
  { name: 'Deep Delvings', box: [256, 340, 342, 396], z: -2, count: 32, ores: [[I, 2], [K, 4], [S, 2], [G, 2]] },
  { name: 'Molten Deep', box: [270, 348, 334, 396], z: -3, count: 18, ores: [[K, 2], [G, 2], [X, 3], [D, 2]] },
  // the north
  { name: 'Valdrheim Outskirts', box: [110, 18, 187, 72], z: 0, count: 10, ores: [[I, 2], [K, 1], [T, 1]] },
  { name: 'Crystal Mines', box: [106, 52, 150, 140], z: -1, count: 20, ores: [[K, 2], [S, 3], [G, 1]] },
  { name: 'Crystal Depths', box: [108, 70, 148, 136], z: -2, count: 14, ores: [[S, 1], [G, 2], [X, 2]] },
  // fire and desert
  { name: 'Infernal Rift', box: [470, 30, 530, 130], z: -2, count: 8, ores: [[X, 1], [D, 2]] },
  { name: 'Scorched Crags', box: [468, 598, 516, 726], z: 0, count: 12, ores: [[K, 2], [S, 2], [G, 2]] },
  { name: 'Behemoth Depths', box: [472, 640, 514, 720], z: -2, count: 10, ores: [[X, 1], [D, 2]] },
];

const RING: Array<[number, number]> = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
const ROADS = new Set<number>([Ground.Path, Ground.Marble, Ground.Wood, Ground.Water, Ground.DeepWater, Ground.Lava, Ground.Void, Ground.Ice]);

/** Whether a solid rock may stand here without cutting anyone off (see the file comment). */
function canPlace(m: WorldMap, x: number, y: number, z: number, reachable: Reachable): boolean {
  if (!m.inBounds(x, y)) return false;
  const o = m.getObj(x, y, z);
  const g = m.getGround(x, y, z);
  if (o !== Obj.Rock && (o !== Obj.None || !m.isWalkable(x, y, z))) return false;
  if (ROADS.has(g) || m.isSafe(x, y, z) || m.houseAt(x, y, z)) return false;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (m.linkAt(x + dx, y + dy, z)) return false;
  if (m.npcs.some((n) => n.z === z && Math.abs(n.x - x) <= 1 && Math.abs(n.y - y) <= 1)) return false;
  if (m.chests.some((c) => c.z === z && Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1)) return false;
  const open = RING.map(([dx, dy]) => m.isWalkable(x + dx, y + dy, z));
  // a miner needs a free tile beside the rock, one players can actually get to
  if (![0, 2, 4, 6].some((i) => open[i] && reachable(x + RING[i][0], y + RING[i][1], z))) return false;
  if (o === Obj.Rock) return true;
  // the open neighbours must form one unbroken run around the tile, joined edge to edge
  // (orthogonal → diagonal → orthogonal), so blocking the tile cannot split a passage
  let runs = 0;
  for (let i = 0; i < 8; i++) if (open[i] && !open[(i + 7) % 8]) runs++;
  if (runs === 0) return open.every(Boolean);
  return runs === 1 && open.filter(Boolean).length <= 6;
}

/** The ore that is furthest behind its share so far (keeps every mine's mix close to its weights). */
function pickOre(table: Array<[Obj, number]>, have: Map<Obj, number>, r: number): Obj {
  let best = table[0][0], bestScore = Infinity;
  for (const [o, w] of table) {
    const score = ((have.get(o) ?? 0) + r) / w;
    if (score < bestScore) { best = o; bestScore = score; }
  }
  return best;
}

/** Whether players can walk to a tile (from the world generator's flood fill). */
export type Reachable = (x: number, y: number, z: number) => boolean;

/** Puts every mine's ore rocks into the world. Returns how many went into each mine. */
export function placeOreRocks(m: WorldMap, reachable: Reachable): Record<string, number> {
  const placed: Record<string, number> = {};
  MINE_SPOTS.forEach((spot, si) => {
    if (!m.floors.has(spot.z)) return;
    const [x0, y0, x1, y1] = spot.box;
    const cand: Array<{ x: number; y: number; k: number }> = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const o = m.getObj(x, y, spot.z);
      if (o !== Obj.None && o !== Obj.Rock) continue;
      // boulders first (they are rocks already), then free tiles near the walls
      cand.push({ x, y, k: hash2(x, y, 9100 + si) + (o === Obj.Rock ? -1 : 0) });
    }
    cand.sort((a, b) => a.k - b.k);
    let n = 0;
    const have = new Map<Obj, number>();
    for (const c of cand) {
      if (n >= spot.count) break;
      if (!canPlace(m, c.x, c.y, spot.z, reachable)) continue;
      const ore = pickOre(spot.ores, have, hash2(c.x, c.y, 9200 + si));
      have.set(ore, (have.get(ore) ?? 0) + 1);
      m.setObj(c.x, c.y, ore, spot.z);
      n++;
    }
    placed[spot.name] = n;
  });
  return placed;
}

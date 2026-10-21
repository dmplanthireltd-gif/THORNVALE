import { Rng } from '../core/rng';
import { DIRS8 } from '../core/types';
import { buildSpawnPlaza, CITY } from './spawnPlaza';
import { Ground, Obj, WorldMap, type EnemyKind } from './WorldMap';

/**
 * Builds the original village of Thornvale procedurally (deterministic seed).
 *
 *   North : Greywood forest (wolves)
 *   Centre: the spawn plaza (fountain, temple respawn, Captain Aldric; world/spawnPlaza.ts)
 *   East  : Miller's farm and barn (rats)
 *   South-west: the old graveyard (skeletons)
 *   West  : Mirror pond
 */
export const MAP_W = 56;
export const MAP_H = 44;

export function buildVillage(seed = 1337): WorldMap {
  const m = new WorldMap(MAP_W, MAP_H);
  const rng = new Rng(seed);

  const fillRect = (x0: number, y0: number, x1: number, y1: number, g: Ground) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.setGround(x, y, g);
  };
  const clearObj = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.setObj(x, y, Obj.None);
  };
  const pathLine = (x0: number, y0: number, x1: number, y1: number) => {
    // L-shaped path: horizontal then vertical.
    const sx = Math.sign(x1 - x0);
    let x = x0;
    while (x !== x1) {
      if (m.getGround(x, y0) !== Ground.Stone) m.setGround(x, y0, Ground.Path);
      m.setObj(x, y0, Obj.None);
      x += sx;
    }
    const sy = Math.sign(y1 - y0);
    let y = y0;
    while (true) {
      if (m.getGround(x1, y) !== Ground.Stone) m.setGround(x1, y, Ground.Path);
      m.setObj(x1, y, Obj.None);
      if (y === y1) break;
      y += sy;
    }
  };

  // --- base grass with darker patches -------------------------------------
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      m.setGround(x, y, rng.chance(0.12) ? Ground.DarkGrass : Ground.Grass);
    }
  }

  // --- northern forest ------------------------------------------------------
  for (let y = 2; y <= 7; y++) {
    for (let x = 2; x < MAP_W - 2; x++) {
      const edge = y >= 7 ? 0.5 : 1;
      const r = rng.next();
      if (r < 0.27 * edge) m.setObj(x, y, Obj.Pine);
      else if (r < 0.33 * edge) m.setObj(x, y, Obj.Tree);
      else if (r < 0.37 * edge) m.setObj(x, y, Obj.Bush);
      else if (r < 0.39 * edge) m.setObj(x, y, Obj.Rock);
      if (m.getObj(x, y) === Obj.None && rng.chance(0.25)) m.setGround(x, y, Ground.DarkGrass);
    }
  }
  // wolf dens (clearings)
  const clearing = (cx: number, cy: number, r: number) => {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1) {
          m.setObj(x, y, Obj.None);
          if (rng.chance(0.6)) m.setGround(x, y, Ground.Dirt);
        }
      }
    }
  };
  clearing(12, 6, 3);
  clearing(42, 6, 3);
  clearing(33, 5, 2);
  // forest trails linking the dens to the north road
  pathLine(15, 7, 27, 7);
  pathLine(28, 6, 39, 6);

  // --- roads -----------------------------------------------------------------
  // north road: from the forest it skirts the temple on its west side to the plaza
  fillRect(27, 2, 28, 8, Ground.Path);
  clearObj(26, 2, 29, 8);
  fillRect(21, 8, 28, 8, Ground.Path);
  fillRect(20, 8, 21, 16, Ground.Path);
  clearObj(19, 8, 29, 8);
  // the south road and the east–west road cross at the fountain
  fillRect(27, 16, 28, MAP_H - 3, Ground.Path);
  clearObj(26, 16, 29, MAP_H - 3);
  fillRect(3, 22, MAP_W - 4, 23, Ground.Path);
  clearObj(3, 21, MAP_W - 4, 24);

  // --- plaza -------------------------------------------------------------------
  fillRect(21, 16, 34, 29, Ground.Stone);
  clearObj(20, 16, 35, 30);
  // the respawn point lies inside the temple, north of the fountain
  m.temple = { x: 28, y: 13, z: 0 };
  m.playerSpawn = { x: 28, y: 13, z: 0 };
  // Captain Aldric greets newcomers at the temple steps
  m.npcs.push({ key: 'aldric', x: 25, y: 17, z: 0 });

  // --- houses: every trade in its own themed building round the plaza (world/spawnPlaza.ts CITY)
  let houseId = 0;
  const house = (
    x: number, y: number, w: number, h: number,
    door: { x: number; y: number }[], roofColor: number, wallColor: number, name: string, stone = false,
  ) => {
    clearObj(x - 1, y - 1, x + w, y + h);
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const border = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1;
        m.setGround(xx, yy, stone ? Ground.Stone : Ground.Wood);
        m.setObj(xx, yy, border ? Obj.Wall : Obj.None);
      }
    }
    for (const d of door) m.setObj(d.x, d.y, Obj.Door);
    m.houses.push({ id: houseId++, x, y, w, h, z: 0, roofColor, wallColor, name, ...(stone ? { stone: true } : {}) });
  };
  for (const b of CITY) house(b.x, b.y, b.w, b.h, b.doors.map(([x, y]) => ({ x, y })), b.roof, b.wall, b.name, b.stone);
  house(44, 34, 8, 6, [{ x: 47, y: 34 }, { x: 48, y: 34 }], 0x6b3a26, 0xa77a52, 'Miller Barn');

  // furniture (blocking props inside)
  const props: Array<[number, number, Obj]> = [
    // temple: altar, pillars and torches
    [27, 10, Obj.Altar], [28, 10, Obj.Altar], [25, 11, Obj.Pillar], [30, 11, Obj.Pillar], [25, 13, Obj.Pillar], [30, 13, Obj.Pillar],
    [24, 10, Obj.Torch], [31, 10, Obj.Torch],
    // depot hall: two long rows of lockers with gaps
    [7, 16, Obj.Locker], [9, 16, Obj.Locker], [11, 16, Obj.Locker], [13, 16, Obj.Locker], [15, 16, Obj.Locker], [17, 16, Obj.Locker],
    [7, 19, Obj.Locker], [9, 19, Obj.Locker], [11, 19, Obj.Locker], [13, 19, Obj.Locker],
    // bank counter
    [40, 18, Obj.Counter], [40, 20, Obj.Counter],
    // shops
    [37, 11, Obj.Table], [40, 14, Obj.Barrel],
    [13, 10, Obj.Table], [18, 12, Obj.Crate],
    [15, 26, Obj.Barrel], [19, 26, Obj.Crate], [15, 28, Obj.Crate],
    [20, 38, Obj.Table], [24, 40, Obj.Barrel],
    [45, 38, Obj.Hay], [46, 38, Obj.Hay], [50, 38, Obj.Hay], [50, 35, Obj.Crate],
  ];
  for (const [x, y, o] of props) m.setObj(x, y, o);
  m.npcs.push(
    { key: 'elias', x: 22, y: 39, z: 0 }, { key: 'brunhild', x: 40, y: 28, z: 0 }, { key: 'mirella', x: 39, y: 12, z: 0 },
    { key: 'garrick', x: 15, y: 11, z: 0 }, { key: 'orwin', x: 41, y: 19, z: 0 }, { key: 'tilda', x: 17, y: 27, z: 0 },
  );
  // the market board stands under a little roof just south of the plaza
  m.setObj(25, 31, Obj.MarketBoard);

  // door paths to the roads and the plaza
  pathLine(35, 18, 35, 19);
  fillRect(36, 16, 38, 16, Ground.Path);
  pathLine(39, 24, 39, 24);
  pathLine(17, 24, 17, 24);
  pathLine(12, 22, 12, 22);
  pathLine(19, 18, 20, 18);
  pathLine(20, 11, 20, 11);
  pathLine(22, 35, 22, 36);

  // --- the sparring ring of the trainers (spiked railing drawn by the plaza model)
  for (let x = 19; x <= 24; x++) for (let y = 31; y <= 34; y++) {
    m.setGround(x, y, Ground.Dirt);
    m.setObj(x, y, Obj.None);
  }

  // --- pond --------------------------------------------------------------------
  const pcx = 5, pcy = 11;
  for (let y = pcy - 4; y <= pcy + 4; y++) {
    for (let x = pcx - 5; x <= pcx + 5; x++) {
      const d = ((x - pcx) / 3.2) ** 2 + ((y - pcy) / 2.4) ** 2;
      if (!m.inBounds(x, y) || x < 2 || y < 2) continue;
      if (d <= 1) {
        m.setGround(x, y, Ground.Water);
        m.setObj(x, y, Obj.None);
      } else if (d <= 1.6) {
        m.setGround(x, y, Ground.Sand);
        m.setObj(x, y, Obj.None);
      }
    }
  }

  // --- graveyard -------------------------------------------------------------
  const gx0 = 3, gy0 = 31, gx1 = 17, gy1 = 40;
  clearObj(gx0, gy0, gx1, gy1);
  for (let y = gy0; y <= gy1; y++) {
    for (let x = gx0; x <= gx1; x++) {
      const border = x === gx0 || y === gy0 || x === gx1 || y === gy1;
      m.setGround(x, y, rng.chance(0.35) ? Ground.Dirt : Ground.DarkGrass);
      if (border) m.setObj(x, y, Obj.Fence);
    }
  }
  m.setObj(gx1, 35, Obj.None);
  m.setObj(gx1, 36, Obj.None);
  pathLine(gx1, 35, 26, 35);
  pathLine(gx1, 36, 26, 36);
  for (const gx of [6, 9, 12, 15]) {
    for (const gy of [33, 36, 39]) {
      if (rng.chance(0.85)) m.setObj(gx, gy, Obj.Grave);
    }
  }
  m.setObj(5, 38, Obj.DeadTree);
  m.setObj(15, 32, Obj.DeadTree);
  m.setObj(11, 34, Obj.DeadTree);

  // --- farm --------------------------------------------------------------------
  const fx0 = 45, fy0 = 25, fx1 = 53, fy1 = 31;
  clearObj(fx0, fy0, fx1, fy1);
  for (let y = fy0; y <= fy1; y++) {
    for (let x = fx0; x <= fx1; x++) {
      const border = x === fx0 || y === fy0 || x === fx1 || y === fy1;
      if (border) {
        m.setObj(x, y, Obj.Fence);
      } else {
        m.setGround(x, y, Ground.Crop);
        if ((y - fy0) % 2 === 1 && rng.chance(0.8)) m.setObj(x, y, Obj.Wheat);
      }
    }
  }
  m.setObj(fx0, 28, Obj.None);
  m.setObj(fx0, 29, Obj.None);
  pathLine(fx0 - 1, 28, fx0 - 1, 24);
  pathLine(47, 33, 47, 32);
  pathLine(48, 33, 48, 32);
  m.setObj(47, 31, Obj.None);
  m.setObj(48, 31, Obj.None);

  // --- village scatter -----------------------------------------------------------
  for (let y = 11; y < MAP_H - 2; y++) {
    for (let x = 2; x < MAP_W - 2; x++) {
      if (m.getObj(x, y) !== Obj.None) continue;
      const g = m.getGround(x, y);
      if (g !== Ground.Grass && g !== Ground.DarkGrass) continue;
      if (m.houseAt(x, y)) continue;
      if (nearGround(m, x, y, Ground.Path) || nearGround(m, x, y, Ground.Stone) || nearHouse(m, x, y)) {
        if (rng.chance(0.08)) m.setObj(x, y, Obj.Flowers);
        continue;
      }
      if (x >= gx0 && x <= gx1 && y >= gy0 && y <= gy1) continue;
      const r = rng.next();
      if (r < 0.045) m.setObj(x, y, Obj.Tree);
      else if (r < 0.06) m.setObj(x, y, Obj.Bush);
      else if (r < 0.068) m.setObj(x, y, Obj.Rock);
      else if (r < 0.13) m.setObj(x, y, Obj.Flowers);
    }
  }

  // --- the spawn plaza: fountain and decorations (replaces the plain square above) --
  buildSpawnPlaza(m);

  // --- border wall of pines ---------------------------------------------------
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) {
        m.setObj(x, y, rng.chance(0.85) ? Obj.Pine : Obj.Tree);
        m.setGround(x, y, Ground.DarkGrass);
      }
    }
  }

  // --- monster spawns ---------------------------------------------------------
  const sp = (kind: EnemyKind, x: number, y: number) => {
    m.spawns.push({ kind, x, y, z: 0 });
    if (m.getObj(x, y) !== Obj.None && m.getObj(x, y) !== Obj.Wheat) m.setObj(x, y, Obj.None);
  };
  sp('rat', 47, 27); sp('rat', 49, 29); sp('rat', 51, 27); sp('rat', 46, 36); sp('rat', 50, 30); sp('rat', 48, 37);
  sp('wolf', 11, 5); sp('wolf', 14, 7); sp('wolf', 41, 5); sp('wolf', 44, 7); sp('wolf', 33, 5);
  sp('skeleton', 7, 34); sp('skeleton', 11, 37); sp('skeleton', 14, 34); sp('skeleton', 8, 39);

  ensureReachable(m);
  return m;
}

function nearGround(m: WorldMap, x: number, y: number, g: Ground): boolean {
  for (const [dx, dy] of DIRS8) {
    if (m.inBounds(x + dx, y + dy) && m.getGround(x + dx, y + dy) === g) return true;
  }
  return false;
}

function nearHouse(m: WorldMap, x: number, y: number): boolean {
  for (const [dx, dy] of DIRS8) if (m.houseAt(x + dx, y + dy)) return true;
  return false;
}

/** Flood fill from the player spawn; carve through soft obstacles to any unreachable spawn. */
export function ensureReachable(m: WorldMap): void {
  const soft = new Set<Obj>([Obj.Tree, Obj.Pine, Obj.Bush, Obj.Rock, Obj.DeadTree]);
  const reach = floodFill(m);
  const targets = [...m.spawns, ...m.npcs];
  for (const t of targets) {
    if (reach[m.idx(t.x, t.y)]) continue;
    let x = t.x, y = t.y;
    let guard = 200;
    while (!reach[m.idx(x, y)] && guard-- > 0) {
      if (soft.has(m.getObj(x, y))) m.setObj(x, y, Obj.None);
      const dx = Math.sign(m.playerSpawn.x - x);
      const dy = Math.sign(m.playerSpawn.y - y);
      // step orthogonally so carved corridors never rely on corner-cutting
      if (Math.abs(m.playerSpawn.y - y) > Math.abs(m.playerSpawn.x - x)) y += dy; else x += dx;
      if (soft.has(m.getObj(x, y))) m.setObj(x, y, Obj.None);
    }
  }
}

export function floodFill(m: WorldMap): Uint8Array {
  const seen = new Uint8Array(m.width * m.height);
  const stack = [m.playerSpawn.x, m.playerSpawn.y];
  seen[m.idx(m.playerSpawn.x, m.playerSpawn.y)] = 1;
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (!m.inBounds(nx, ny) || seen[m.idx(nx, ny)]) continue;
      if (!m.canStep(x, y, 0, dx, dy)) continue;
      seen[m.idx(nx, ny)] = 1;
      stack.push(nx, ny);
    }
  }
  return seen;
}

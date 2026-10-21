import { Rng } from '../core/rng';
import { DIRS8 } from '../core/types';
import { Ground, Obj, WorldMap, type EnemyKind } from './WorldMap';

/**
 * Builds the original village of Thornvale procedurally (deterministic seed).
 *
 *   North : Greywood forest (wolves)
 *   Centre: stone plaza with the well, temple respawn and Captain Aldric
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
  for (let y = 2; y <= 10; y++) {
    for (let x = 2; x < MAP_W - 2; x++) {
      const edge = y >= 9 ? 0.5 : 1;
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
  fillRect(27, 2, 28, MAP_H - 3, Ground.Path);
  clearObj(26, 2, 29, MAP_H - 3);
  fillRect(3, 22, MAP_W - 4, 23, Ground.Path);
  clearObj(3, 21, MAP_W - 4, 24);

  // --- plaza -----------------------------------------------------------------
  fillRect(22, 18, 33, 27, Ground.Stone);
  clearObj(21, 17, 34, 28);
  m.setObj(25, 20, Obj.Well);
  m.temple = { x: 28, y: 25, z: 0 };
  m.playerSpawn = { x: 28, y: 25, z: 0 };
  m.npcs.push({ key: 'aldric', x: 30, y: 20, z: 0 });

  // --- houses ------------------------------------------------------------------
  let houseId = 0;
  const house = (
    x: number, y: number, w: number, h: number,
    door: { x: number; y: number }[], roofColor: number, wallColor: number, name: string,
  ) => {
    clearObj(x - 1, y - 1, x + w, y + h);
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const border = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1;
        m.setGround(xx, yy, Ground.Wood);
        m.setObj(xx, yy, border ? Obj.Wall : Obj.None);
      }
    }
    for (const d of door) m.setObj(d.x, d.y, Obj.Door);
    m.houses.push({ id: houseId++, x, y, w, h, z: 0, roofColor, wallColor, name });
  };

  house(33, 12, 8, 6, [{ x: 36, y: 17 }], 0x8e3b2e, 0xd8cbb0, 'Hall of Learning');
  house(15, 13, 7, 6, [{ x: 18, y: 18 }], 0x5a6e8c, 0xcfc2a4, "Brunhild's Smithy");
  house(19, 29, 7, 6, [{ x: 22, y: 29 }], 0x7d5a3a, 0xd4c7aa, "Mirella's Curiosities");
  house(33, 28, 7, 6, [{ x: 36, y: 28 }], 0x3f6b4a, 0xd2c4a8, "Garrick's Outfitters");
  house(42, 13, 9, 7, [{ x: 46, y: 19 }], 0x9a4a2c, 0xcbb994, 'Thornvale Depot & Bank');
  house(44, 34, 8, 6, [{ x: 47, y: 34 }, { x: 48, y: 34 }], 0x6b3a26, 0xa77a52, 'Miller Barn');

  // furniture (blocking props inside)
  const props: Array<[number, number, Obj]> = [
    [34, 13, Obj.Table], [39, 13, Obj.Barrel], [39, 16, Obj.Crate], [34, 16, Obj.Barrel],
    [16, 14, Obj.Table], [20, 14, Obj.Crate],
    [20, 33, Obj.Barrel], [24, 33, Obj.Crate], [24, 30, Obj.Table],
    [34, 32, Obj.Table], [38, 29, Obj.Barrel], [38, 32, Obj.Barrel],
    [43, 14, Obj.Locker], [44, 14, Obj.Locker], [45, 14, Obj.Locker], [47, 14, Obj.Locker], [48, 14, Obj.Locker], [43, 17, Obj.Counter], [44, 17, Obj.Counter],
    [45, 38, Obj.Hay], [46, 38, Obj.Hay], [50, 38, Obj.Hay], [50, 35, Obj.Crate],
  ];
  for (const [x, y, o] of props) m.setObj(x, y, o);
  m.npcs.push({ key: 'elias', x: 37, y: 15, z: 0 }, { key: 'brunhild', x: 18, y: 15, z: 0 }, { key: 'mirella', x: 22, y: 31, z: 0 }, { key: 'garrick', x: 36, y: 31, z: 0 }, { key: 'orwin', x: 44, y: 16, z: 0 });
  for (const [x, y] of [[22, 19], [32, 19], [23, 27], [32, 26]]) m.setObj(x, y, Obj.Lamp);

  // door paths to the roads
  pathLine(36, 18, 36, 21);
  pathLine(18, 19, 18, 21);
  pathLine(22, 28, 22, 24);
  pathLine(36, 27, 36, 24);
  pathLine(46, 20, 46, 21);

  // --- pond --------------------------------------------------------------------
  const pcx = 8, pcy = 15;
  for (let y = pcy - 5; y <= pcy + 5; y++) {
    for (let x = pcx - 6; x <= pcx + 6; x++) {
      const d = ((x - pcx) / 4.3) ** 2 + ((y - pcy) / 3.1) ** 2;
      if (d <= 1) {
        m.setGround(x, y, Ground.Water);
        m.setObj(x, y, Obj.None);
      } else if (d <= 1.55 && m.inBounds(x, y) && x >= 2 && y >= 11) {
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
  const fx0 = 40, fy0 = 25, fx1 = 53, fy1 = 31;
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
  sp('rat', 44, 27); sp('rat', 49, 29); sp('rat', 51, 27); sp('rat', 46, 36); sp('rat', 42, 30); sp('rat', 48, 37);
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

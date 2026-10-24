import { TASKBOARD_NPCS } from '../liveops/liveNpcs';
import { tileKey } from '../trades/layout';
import { TOWNS } from './townList';
import { Obj, type WorldMap } from './WorldMap';

/**
 * Places the task-board keepers (liveops/liveNpcs.ts): one near the centre of every
 * town, on open ground. The very last step of world generation (after the trade
 * skills), with no random numbers, so everything placed before stays where it was
 * and server and clients agree. A keeper stands where nobody's way is blocked: every
 * tile around is walkable, nothing of the trade skills is there, and no other NPC
 * stands within two tiles.
 */

/** The Thornvale fountain and the Exchange island stay clear (same rule as the trade-skill people). */
function onPlaza(m: WorldMap, x: number, y: number, z: number): boolean {
  const p = m.plaza;
  if (!p || z !== 0 || x < p.x0 - 2 || x > p.x1 + 2 || y < p.y0 - 2 || y > p.y1 + 2) return false;
  if (!p.grand) return true;
  return Math.hypot(x + 0.5 - p.cx, y + 0.5 - p.cy) < p.grand.r + 4;
}

function inHouse(m: WorldMap, x: number, y: number, z: number): boolean {
  return m.houses.some((h) => h.z === z && x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
}

function free(m: WorldMap, x: number, y: number, z: number): boolean {
  if (!m.inBounds(x, y) || !m.isWalkable(x, y, z) || m.getObj(x, y, z) !== Obj.None || m.linkAt(x, y, z)) return false;
  if (m.trades?.index.has(tileKey(x, y, z))) return false;
  return true;
}

function roomy(m: WorldMap, x: number, y: number, z: number): boolean {
  if (!free(m, x, y, z) || inHouse(m, x, y, z) || onPlaza(m, x, y, z)) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && (!free(m, x + dx, y + dy, z) || inHouse(m, x + dx, y + dy, z))) return false;
  }
  if (m.npcs.some((n) => n.z === z && Math.abs(n.x - x) <= 2 && Math.abs(n.y - y) <= 2)) return false;
  if (m.chests.some((c) => c.z === z && Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1)) return false;
  if (m.spawns.some((s) => s.z === z && s.x === x && s.y === y)) return false;
  return true;
}

/** Ring by ring around (cx, cy), up to `r` tiles out. */
function* spiral(cx: number, cy: number, r: number): Generator<[number, number]> {
  yield [cx, cy];
  for (let d = 1; d <= r; d++) {
    for (let i = -d; i <= d; i++) {
      yield [cx + i, cy - d];
      yield [cx + i, cy + d];
    }
    for (let i = -d + 1; i <= d - 1; i++) {
      yield [cx - d, cy + i];
      yield [cx + d, cy + i];
    }
  }
}

export function placeTaskBoards(m: WorldMap): void {
  for (const b of TASKBOARD_NPCS) {
    const t = TOWNS.find((x) => x.key === b.town);
    if (!t) continue;
    const r = m.regions.find((x) => x.name === t.name);
    const z = r && r.z0 <= 0 && r.z1 >= 0 ? 0 : r?.z0 ?? 0;
    // a little way from the very centre (the market stalls and the masters are there), never the plaza
    for (const [x, y] of spiral(t.x, t.y, 30)) {
      if (Math.max(Math.abs(x - t.x), Math.abs(y - t.y)) < 3) continue;
      if (!roomy(m, x, y, z)) continue;
      m.npcs.push({ key: b.def.key, x, y, z });
      break;
    }
  }
}

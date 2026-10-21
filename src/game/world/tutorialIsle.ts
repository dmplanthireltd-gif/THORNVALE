import { hash2, Rng } from '../core/rng';
import { Builder } from './build';
import { Ground, Obj, WorldMap, type EnemyKind } from './WorldMap';

/**
 * Wayfarer's Isle: the small tutorial island every new character starts on.
 *
 * It sits in open sea west of Thornvale, inside the existing 640×800 world, and is
 * reached only by being born there: no ship from the mainland sails to it, and the
 * captain on its jetty sails one way, to Thornvale. Every position is fixed (no
 * random numbers from the world generator), so it is built last and changes
 * nothing else in the world.
 *
 * Layout (all floor 0 unless noted):
 *   north   the shrine clearing (protection zone, respawn), Guide Maren, the supply chest
 *   east    the trading post: Tobin (shop and bank) and depot lockers
 *   west    a copse of trees and the shore (woodcutting, fishing)
 *   south   the rat meadow, with an old cellar under it (floor −1: rats and a snake, rope spot out)
 *   south-east  the jetty, where Captain Wren sails to Thornvale
 */

/** The whole island, sea margin included (floors −1 and 0). */
export const ISLE = { name: "Wayfarer's Isle", x0: 72, y0: 308, x1: 127, y1: 358 } as const;
/** The protection zone around the shrine and the trading post (also the respawn region). */
export const ISLE_REST = { name: "Wayfarer's Rest", x0: 94, y0: 315, x1: 119, y1: 332 } as const;
/** Where new characters wake up (the shrine), and where they respawn while on the island. */
export const ISLE_START = { x: 100, y: 322, z: 0 } as const;
/** Destination key (WorldMap.destinations) of the shrine. */
export const ISLE_DEST = 'wayfarers_isle';
/** The supply chest beside the shrine (contents depend on vocation, see tutorial.ts). */
export const ISLE_CHEST = { id: 'isle_supply_chest', x: 97, y: 319, z: 0 } as const;
/** The rat meadow (centre). */
export const ISLE_MEADOW = { x: 89, y: 342, z: 0 } as const;
/** The hole down into the old cellar, and the rope spot that leads back up. */
export const ISLE_CELLAR_HOLE = { x: 88, y: 337, z: 0 } as const;
export const ISLE_ROPE_SPOT = { x: 96, y: 344, z: -1 } as const;
/** A good fishing place on the west shore. */
export const ISLE_SHORE = { x: 81, y: 327, z: 0 } as const;

/** NPC keys (definitions in npc/npcs.ts). */
export const ISLE_GUIDE = 'isle_guide';
export const ISLE_TRADER = 'isle_trader';
export const ISLE_CAPTAIN = 'isle_captain';

/** True on any tile of the island (both floors). */
export function onIsle(x: number, y: number, z: number): boolean {
  return z >= -1 && z <= 0 && x >= ISLE.x0 && x <= ISLE.x1 && y >= ISLE.y0 && y <= ISLE.y1;
}

const CX = 100, CY = 333, RX = 22, RY = 19;

function isLand(x: number, y: number): boolean {
  const dx = (x - CX) / RX, dy = (y - CY) / RY;
  // a gently ragged coast
  return dx * dx + dy * dy <= 1 - 0.14 * hash2(x, y, 91);
}

/** Builds the island into the map. Called once, at the very end of world generation. */
export function buildTutorialIsle(m: WorldMap): void {
  const b = new Builder(m, new Rng(9137));
  // ---- sea, shallows, sand and grass
  b.rect(ISLE.x0, ISLE.y0, ISLE.x1, ISLE.y1, (x, y) => {
    m.setObj(x, y, Obj.None, 0);
    if (isLand(x, y)) {
      let coast = false;
      for (let dy = -1; dy <= 1 && !coast; dy++) for (let dx = -1; dx <= 1; dx++) if (!isLand(x + dx, y + dy)) { coast = true; break; }
      m.setGround(x, y, coast ? Ground.Sand : hash2(x, y, 92) < 0.3 ? Ground.DarkGrass : Ground.Grass, 0);
      return;
    }
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5 && isLand(x + dx, y + dy)) { near = true; break; }
    m.setGround(x, y, near ? Ground.Water : Ground.DeepWater, 0);
  });
  // a little greenery (kept off the paths and buildings laid below)
  b.rect(ISLE.x0, ISLE.y0, ISLE.x1, ISLE.y1, (x, y) => {
    if (m.getGround(x, y, 0) !== Ground.Grass && m.getGround(x, y, 0) !== Ground.DarkGrass) return;
    const r = hash2(x, y, 93);
    if (r < 0.04) m.setObj(x, y, Obj.Flowers, 0);
    else if (r < 0.06) m.setObj(x, y, Obj.Fern, 0);
    else if (r < 0.072) m.setObj(x, y, Obj.Bush, 0);
  });

  // ---- the shrine clearing
  b.rect(94, 315, 106, 326, (x, y) => {
    const d = Math.hypot(x - 100, y - 320.5);
    if (d <= 5.2) {
      m.setGround(x, y, d <= 1.8 ? Ground.Marble : Ground.Path, 0);
      m.setObj(x, y, Obj.None, 0);
    }
  });
  m.setObj(100, 318, Obj.Altar, 0);
  m.setObj(97, 317, Obj.Torch, 0);
  m.setObj(103, 317, Obj.Torch, 0);
  for (const [x, y] of [[95, 322], [105, 322], [96, 324], [104, 324]] as const) m.setObj(x, y, Obj.Flowers, 0);
  b.chest(ISLE_CHEST.id, ISLE_CHEST.x, ISLE_CHEST.y, 0, []);
  b.npc(ISLE_GUIDE, 104, 320, 0);

  // ---- the trading post: shop, bank and depot lockers
  b.building(108, 324, 11, 8, { name: 'Trading Post', doors: [[113, 331]], roof: 0x6b4a2e, wallColor: 0xcbb994 });
  for (const x of [109, 110, 111]) m.setObj(x, 325, Obj.Locker, 0);
  m.setObj(117, 325, Obj.Barrel, 0);
  m.setObj(117, 330, Obj.Crate, 0);
  m.setObj(110, 329, Obj.Table, 0);
  b.npc(ISLE_TRADER, 116, 327, 0);

  // ---- paths: shrine → trading post, shrine → meadow, post → jetty
  const path = (x0: number, y0: number, x1: number, y1: number) => b.road(x0, y0, x1, y1, 1, Ground.Path, 0);
  path(100, 326, 100, 333);
  path(100, 333, 113, 333);
  path(113, 332, 113, 333);
  path(99, 333, 90, 335);
  path(113, 334, 112, 349);

  // ---- the copse and the west shore
  for (const [x, y] of [[85, 325], [87, 327], [89, 324], [86, 329], [90, 328], [84, 328], [88, 322]] as const) {
    if (isLand(x, y)) m.setObj(x, y, Obj.Tree, 0);
  }

  // ---- the rat meadow
  const rats: Array<[number, number]> = [[84, 340], [88, 344], [92, 340], [95, 346], [88, 347], [91, 347], [97, 341], [85, 343]];
  for (const [x, y] of rats) spawnAt(m, 'rat', x, y, 0);

  // ---- the old cellar (floor −1): in through a hole, out by rope
  b.rect(85, 336, 98, 347, (x, y) => {
    const edge = x === 85 || x === 98 || y === 336 || y === 347;
    m.setGround(x, y, Ground.Cave, -1);
    m.setObj(x, y, edge ? Obj.StoneWall : Obj.None, -1);
  });
  m.setObj(ISLE_CELLAR_HOLE.x, ISLE_CELLAR_HOLE.y, Obj.Hole, 0);
  m.addLink(ISLE_CELLAR_HOLE.x, ISLE_CELLAR_HOLE.y, 0, 'walk', { x: ISLE_CELLAR_HOLE.x, y: ISLE_CELLAR_HOLE.y + 1, z: -1 });
  b.ropeSpot(ISLE_ROPE_SPOT.x, ISLE_ROPE_SPOT.y, -1, [0, 1]);
  for (const [x, y, o] of [[87, 341, Obj.Barrel], [93, 338, Obj.Crate], [90, 345, Obj.Bones], [97, 338, Obj.Torch], [86, 344, Obj.Torch]] as const) m.setObj(x, y, o, -1);
  for (const [x, y] of [[90, 340], [94, 342], [89, 343]] as const) spawnAt(m, 'rat', x, y, -1);
  spawnAt(m, 'snake', 93, 345, -1);

  // ---- the jetty
  for (let y = 349; y <= 357; y++) {
    for (let x = 110; x <= 114; x++) {
      const side = x === 110 || x === 114 || y === 357;
      if (y <= 349 && isLand(x, y)) continue;
      m.setGround(x, y, Ground.Wood, 0);
      m.setObj(x, y, side ? Obj.Railing : Obj.None, 0);
    }
  }
  m.setObj(111, 356, Obj.Barrel, 0);
  b.npc(ISLE_CAPTAIN, 113, 356, 0);

  // ---- regions and the arrival point
  b.region({ name: ISLE.name, x0: ISLE.x0, y0: ISLE.y0, x1: ISLE.x1, y1: ISLE.y1, z0: -1, z1: 0, level: 'Tutorial' });
  b.region({ name: ISLE_REST.name, x0: ISLE_REST.x0, y0: ISLE_REST.y0, x1: ISLE_REST.x1, y1: ISLE_REST.y1, level: 'Tutorial', safe: true, temple: { ...ISLE_START } });
  m.setObj(ISLE_START.x, ISLE_START.y, Obj.None, 0);
  m.destinations[ISLE_DEST] = { ...ISLE_START };
}

function spawnAt(m: WorldMap, kind: EnemyKind, x: number, y: number, z: number): void {
  if (z === 0) m.setObj(x, y, Obj.None, 0);
  m.spawns.push({ kind, x, y, z });
}

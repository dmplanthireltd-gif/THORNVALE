import * as THREE from 'three';
import type { House, WorldMap } from '../../game/world/WorldMap';
import { TOWNS } from '../../game/world/townList';
import { Cell } from './builtAtlas';

/**
 * Painted style: what each building is made of. The map only knows "stone or
 * timber" and a wall / roof colour, so the town a house stands in picks the
 * materials: plaster and timber frame in Thornvale and Millbrook, brick in
 * Westmarch, carved pale wood in Elderglen, dark rune-cut basalt in Stonedeep,
 * logs and wooden shingles in Valdrheim and Briarwatch, marble in Aurelion,
 * sandstone in the desert towns, thatch on farm and jungle roofs.
 */
export interface HouseStyle {
  wall: Cell;
  /** Base course / plinth material. */
  plinth: Cell;
  roof: Cell;
  /** Timber frame beams on the walls (plaster houses). */
  timber: boolean;
  wallTint: THREE.Color;
  roofTint: THREE.Color;
}

type Kind = { wall: Cell; stoneWall: Cell; roof: Cell; stoneRoof?: Cell };
const TOWN_KIND: Record<string, Kind> = {
  thornvale: { wall: Cell.Plaster, stoneWall: Cell.Brick, roof: Cell.RoofTile },
  westmarch: { wall: Cell.Plaster, stoneWall: Cell.Brick, roof: Cell.Slate },
  elderglen: { wall: Cell.Elven, stoneWall: Cell.Fieldstone, roof: Cell.Shingle },
  stonedeep: { wall: Cell.Dwarven, stoneWall: Cell.Dwarven, roof: Cell.Slate },
  highmoor: { wall: Cell.Plaster, stoneWall: Cell.Fieldstone, roof: Cell.Slate },
  millbrook: { wall: Cell.Plaster, stoneWall: Cell.Fieldstone, roof: Cell.Thatch },
  valdrheim: { wall: Cell.Logs, stoneWall: Cell.Fieldstone, roof: Cell.Shingle },
  aurelion: { wall: Cell.Plaster, stoneWall: Cell.Marble, roof: Cell.RoofTile, stoneRoof: Cell.Slate },
  briarwatch: { wall: Cell.Logs, stoneWall: Cell.Fieldstone, roof: Cell.Shingle },
  corvane: { wall: Cell.Plaster, stoneWall: Cell.Fieldstone, roof: Cell.RoofTile },
  saltmere: { wall: Cell.Plaster, stoneWall: Cell.Fieldstone, roof: Cell.Slate },
  palmreach: { wall: Cell.Plaster, stoneWall: Cell.Sandstone, roof: Cell.Thatch },
  sunspire: { wall: Cell.Sandstone, stoneWall: Cell.Sandstone, roof: Cell.RoofTile },
  dunewatch: { wall: Cell.Sandstone, stoneWall: Cell.Sandstone, roof: Cell.RoofTile },
};
const WILD: Kind = { wall: Cell.Logs, stoneWall: Cell.Fieldstone, roof: Cell.Thatch, stoneRoof: Cell.Slate };

const cache = new WeakMap<WorldMap, Map<number, HouseStyle>>();
const _c = new THREE.Color();

/** A colour pulled toward white (the painted cells carry their own colour; the map colour only tints them). */
function soften(hex: number, k: number): THREE.Color {
  _c.setHex(hex);
  const l = Math.max(0.05, (_c.r + _c.g + _c.b) / 3);
  const t = new THREE.Color(Math.min(1.4, _c.r / l), Math.min(1.4, _c.g / l), Math.min(1.4, _c.b / l));
  return new THREE.Color(1, 1, 1).lerp(t, k);
}

export function townKindAt(x: number, y: number): Kind {
  let best: Kind = WILD, bd = 46;
  for (const t of TOWNS) {
    const d = Math.max(Math.abs(t.x - x), Math.abs(t.y - y));
    if (d < bd) { bd = d; best = TOWN_KIND[t.key] ?? WILD; }
  }
  return best;
}

export function houseStyle(world: WorldMap, h: House): HouseStyle {
  let m = cache.get(world);
  if (!m) cache.set(world, (m = new Map()));
  const hit = m.get(h.id);
  if (hit) return hit;
  const k = townKindAt(h.x + h.w / 2, h.y + h.h / 2);
  const tent = /tent/i.test(h.name);
  const wall = tent ? Cell.Leather : h.stone ? k.stoneWall : k.wall;
  const roof = tent ? Cell.Leather : h.stone && k.stoneRoof !== undefined ? k.stoneRoof : k.roof;
  const plinth = wall === Cell.Dwarven ? Cell.Dwarven : wall === Cell.Sandstone ? Cell.Sandstone : wall === Cell.Marble ? Cell.Marble : Cell.Fieldstone;
  const st: HouseStyle = {
    wall, plinth, roof,
    timber: wall === Cell.Plaster,
    wallTint: soften(h.wallColor, wall === Cell.Plaster ? 0.5 : wall === Cell.Leather ? 0.8 : 0.3),
    roofTint: soften(h.roofColor, roof === Cell.RoofTile ? 0.35 : roof === Cell.Leather ? 0.8 : 0.25).multiplyScalar(0.9),
  };
  m.set(h.id, st);
  return st;
}

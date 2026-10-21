import * as THREE from 'three';
import type { GameEvent } from '../game/core/events';
import { oreAt } from '../game/gathering/mining';
import { stationAt } from '../game/production/recipes';
import { Obj, type WorldMap } from '../game/world/WorldMap';
import type { Effects } from './Effects';

/**
 * Visuals for the trade skills (mining, blacksmithing), kept apart from the
 * combat effects in Renderer/Effects. Each event swings the worker's arm and
 * throws a few particles at the rock or station.
 */
export interface SkillFxContext {
  effects: Effects;
  world: WorldMap;
  /** Vertical offset of a floor, or null while it is hidden. */
  floorOffset(z: number): number | null;
  /** Whether a tile is close enough to the camera to bother drawing. */
  near(x: number, y: number): boolean;
  /** Plays the worker's swing (the attack animation). */
  swing(id: number): void;
}

export function playSkillFx(ctx: SkillFxContext, e: Extract<GameEvent, { type: 'mine' | 'craft' }>): void {
  ctx.swing(e.id);
  const off = ctx.floorOffset(e.z);
  if (off === null || !ctx.near(e.x, e.y)) return;
  if (e.type === 'mine') {
    // stone chips on every swing; a puff of the ore's colour when a lump comes loose, dust when the rock is spent
    const ore = oreAt(ctx.world.getObj(e.x, e.y, e.z));
    ctx.effects.burst(new THREE.Vector3(e.x, off + 0.45, e.y), 0x9a948c, e.got ? 9 : 5, 1.9, 8, 0.05);
    if (e.got) ctx.effects.burst(new THREE.Vector3(e.x, off + 0.5, e.y), ore?.color ?? 0xc8743a, 8, 1.4, 6, 0.06);
    if (e.depleted || ctx.world.getObj(e.x, e.y, e.z) === Obj.DepletedRock) ctx.effects.ring(new THREE.Vector3(e.x, off + 0.05, e.y), 0xb0a89c, 0.2, 0.8, 0.6);
    return;
  }
  const st = stationAt(ctx.world.getObj(e.x, e.y, e.z));
  if (st?.id === 'anvil') {
    // hammer on hot metal: bright sparks fly
    ctx.effects.burst(new THREE.Vector3(e.x, off + 0.75, e.y), 0xffc04a, e.made ? 14 : 6, 2.4, 9, 0.04);
    if (e.made) ctx.effects.sparkle(new THREE.Vector3(e.x, off + 0.8, e.y), 0xfff0b0, 6, 0.3);
  } else {
    // the furnace roars: flame and smoke from its mouth
    ctx.effects.burst(new THREE.Vector3(e.x, off + 0.45, e.y + 0.4), 0xff7a1a, 10, 1.2, -1.5, 0.07);
    if (e.made) ctx.effects.ring(new THREE.Vector3(e.x, off + 0.05, e.y), 0xffa040, 0.2, 0.7, 0.5);
  }
}

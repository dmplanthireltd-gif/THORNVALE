import * as THREE from 'three';
import type { CreatureView } from '../CreatureView';
import type { Effects } from '../Effects';
import { BLOCK_RAISE } from './blockAnim';

/**
 * What a blocked melee/distance blow looks like: the defender raises its shield
 * (or parries) toward the attacker, and as the shield comes up a short metal
 * spark and flash (wood: splinters) bursts on its face. The clang itself is the
 * existing block sound in audio/Sfx.ts (played for every 'blocked' damage event).
 */
const at = new THREE.Vector3();

export function blockReaction(v: CreatureView, from: { x: number; y: number } | null, effects: Effects): void {
  const c = v.creature;
  const p = c.visualPos();
  const fromYaw = from && (from.x !== p.x || from.y !== p.y) ? Math.atan2(from.x - p.x, from.y - p.y) : null;
  v.onBlock(fromYaw);
  if (v.rig.type !== 'biped') {
    effects.block(v.labelAnchor(at).setY(at.y * 0.5));
    return;
  }
  const rig = v.rig;
  // the spark lands when the shield is nearly up (matrices are from the last frame drawn)
  setTimeout(() => {
    if (!rig.root.parent || c.dead) return;
    const kind = (c as { enemyKind?: string }).enemyKind ?? null;
    const pos = v.block.point(rig, kind, at);
    const wood = v.block.wooden(rig);
    effects.block(pos);
    effects.burst(pos, wood ? 0xb08050 : 0xfff0b8, wood ? 6 : 9, 2.6, 6, wood ? 0.06 : 0.045);
    if (!wood) effects.light(pos, 0xfff0c8, 2.2, 2.5, 0.14);
  }, BLOCK_RAISE * 750);
}

let stance: string | null = null;
let stanceAt = -1e9;

/**
 * 1 while your own character stands in Defensive stance with a target (shield
 * held a little higher), else 0. The stance is the one the HUD remembers in
 * this browser (it is not part of snapshots); offline the game's own value.
 */
export function defensiveGuard(p: { fightMode?: string; targetId: number | null; moving: boolean; dead: boolean }): number {
  const now = performance.now();
  if (now - stanceAt > 1000) {
    stanceAt = now;
    try { stance = localStorage.getItem('thornvale.fightMode'); } catch { stance = null; }
  }
  const mode = stance ?? p.fightMode;
  return mode === 'defensive' && p.targetId !== null && !p.moving && !p.dead ? 1 : 0;
}

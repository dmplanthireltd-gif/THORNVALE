import * as THREE from 'three';
import type { BipedRig } from '../models/rigs';
import { SHIELD_HOLD, SHIELD_REST } from '../models/shields3d';

/**
 * Block / parry animation for bipeds (players, humanoid monsters).
 *
 * When a melee or distance attack is blocked, the defender snaps its shield up
 * toward the attacker (raise ~0.28 s, short hold, lower), turning the upper
 * body that way. Without a shield the weapon arm parries instead. A guard
 * value (Defensive stance in combat) holds the shield a little higher at rest.
 *
 * CreatureView owns one BlockAnim per creature and calls `tick` + `apply` after
 * its own pose, so this only blends on top of the walk/attack pose.
 */

/** Dark monster models whose shield is baked into the left arm mesh (no separate hold). */
export const DARK_SHIELD_KINDS = new Set(['skeleton', 'orc', 'orc_leader', 'orc_warlord', 'valkyrie']);

export const BLOCK_RAISE = 0.28;
export const BLOCK_HOLD = 0.14;
export const BLOCK_LOWER = 0.3;
const TOTAL = BLOCK_RAISE + BLOCK_HOLD + BLOCK_LOWER;

// left arm forward and a little across the chest; the hold turns the shield face toward the attacker
const ARM_X = -1.25;
const ARM_Z = -0.32;
const armQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(ARM_X, 0, ARM_Z));
/** Shield face (+Z of the model) forward and a little up in the body frame. */
const faceQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, -0.12, 0, 'YXZ'));
const BLOCK_Q = armQ.clone().invert().multiply(faceQ);

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}
function wrap(a: number): number {
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}
const mix = (a: number, b: number, w: number) => a + (b - a) * w;

export class BlockAnim {
  /** Seconds since the block started; < 0 = not blocking. */
  private t = -1;
  /** World yaw toward the attacker, or null to block straight ahead. */
  private fromYaw: number | null = null;
  /** 0..1: Defensive stance guard (set by the renderer for your own character). */
  guard = 0;
  private g = 0;
  private hold: THREE.Object3D | null | undefined;
  private holdOf: THREE.Object3D | null = null;
  /** The left arm's own y/z rotation (captured before the first blend) and whether we moved it. */
  private armBase: { y: number; z: number } | null = null;
  private touched = false;
  private rigOf: BipedRig | null = null;

  /** Starts (or restarts) a block toward a world-space yaw. */
  start(fromYaw: number | null): void {
    // a block already up stays up instead of dropping and snapping again
    this.t = this.t >= 0 && this.t < BLOCK_RAISE + BLOCK_HOLD ? Math.min(this.t, BLOCK_RAISE) : 0;
    this.fromYaw = fromYaw;
  }

  get active(): boolean {
    return this.t >= 0;
  }

  tick(dt: number): void {
    if (this.t >= 0) {
      this.t += dt;
      if (this.t >= TOTAL) this.t = -1;
    }
    this.g += (this.guard - this.g) * (1 - Math.exp(-dt * 6));
  }

  /** Current block weight 0..1. */
  weight(): number {
    const t = this.t;
    if (t < 0) return 0;
    if (t < BLOCK_RAISE) return easeOut(t / BLOCK_RAISE);
    if (t < BLOCK_RAISE + BLOCK_HOLD) return 1;
    return 1 - easeInOut((t - BLOCK_RAISE - BLOCK_HOLD) / BLOCK_LOWER);
  }

  private findHold(rig: BipedRig): THREE.Object3D | null {
    const mount = rig.gear?.shieldMount ?? null;
    const first = mount?.children[0] ?? null;
    if (this.hold !== undefined && this.holdOf === first) return this.hold;
    this.holdOf = first;
    this.hold = first?.getObjectByName(SHIELD_HOLD) ?? null;
    return this.hold;
  }

  /** True when the worn shield is wooden (splinters instead of sparks). */
  wooden(rig: BipedRig): boolean {
    return !!rig.gear?.shieldMount.children[0]?.userData.wood;
  }

  /** World point where a blocked blow lands: the shield face, or the weapon for a parry. */
  point(rig: BipedRig, kind: string | null, out: THREE.Vector3): THREE.Vector3 {
    const hold = this.findHold(rig);
    if (hold) return hold.localToWorld(out.set(0, 0, 0.14));
    if (kind !== null && DARK_SHIELD_KINDS.has(kind)) return rig.armL.localToWorld(out.set(0.22, -0.34, 0.2));
    const wm = rig.gear?.weaponMount;
    return wm ? wm.localToWorld(out.set(0, 0, 0.35)) : rig.armR.localToWorld(out.set(0, -0.45, 0.1));
  }

  /**
   * Blends the block pose over the rig's current pose. `yaw` is the creature's
   * current facing, `kind` the enemy kind (dark models carry baked shields),
   * `attacking` = the weapon arm is mid-swing (a parry then stays out of it).
   */
  apply(rig: BipedRig, yaw: number, kind: string | null, attacking: boolean): void {
    if (this.rigOf !== rig) { this.rigOf = rig; this.armBase = null; this.touched = false; }
    const hold = this.findHold(rig);
    const w = this.weight();
    const shield = !!hold || (kind !== null && DARK_SHIELD_KINDS.has(kind));
    // guard: shield a bit higher and more in front while standing in Defensive stance
    const gw = shield ? this.g * 0.35 : 0;
    const k = Math.max(w, gw);
    if (hold) {
      hold.quaternion.slerpQuaternions(SHIELD_REST, BLOCK_Q, k);
    }
    if (k <= 0.001) {
      if (this.touched && this.armBase) {
        rig.armL.rotation.y = this.armBase.y;
        rig.armL.rotation.z = this.armBase.z;
        rig.body.rotation.y = 0;
      }
      this.touched = false;
      return;
    }
    if (!this.armBase) this.armBase = { y: rig.armL.rotation.y, z: rig.armL.rotation.z };
    this.touched = true;
    const base = this.armBase;
    if (shield) {
      if (hold) {
        rig.armL.rotation.x = mix(rig.armL.rotation.x, ARM_X, k);
        rig.armL.rotation.y = base.y;
        rig.armL.rotation.z = mix(base.z, ARM_Z, k);
      } else {
        // baked dark shield: twist the forearm so the face turns forward
        rig.armL.rotation.x = mix(rig.armL.rotation.x, -0.8, k);
        rig.armL.rotation.y = mix(base.y, -0.95, k);
        rig.armL.rotation.z = mix(base.z, -0.35, k);
      }
    } else if (!attacking && w > 0) {
      // no shield: the weapon comes up across the body to turn the blow aside
      rig.armR.rotation.x = mix(rig.armR.rotation.x, -1.7, w);
      rig.armR.rotation.z = mix(rig.armR.rotation.z, 0.7, w);
    }
    // the body turns toward the blow (nothing else drives body.rotation.y while alive)
    const d = this.fromYaw === null ? 0 : Math.max(-0.7, Math.min(0.7, wrap(this.fromYaw - yaw)));
    rig.body.rotation.y = d * 0.6 * w;
  }
}

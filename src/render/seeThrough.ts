import * as THREE from 'three';
import type { CreatureView } from './CreatureView';

/**
 * "Always see your character" (owner 2026-10-23: "some monsters are much too big — you can't
 * see your character when you fight them"): a monster standing in front of the local player
 * (south of it, toward the camera) whose model covers the player on screen turns see-through
 * (CreatureView.cover), and comes back solid as soon as it stops covering.
 *
 * Cheap on purpose: the monster is treated as an upright cylinder (its horizontal reach and
 * height, measured once per model), the player as a box, both projected with the game camera;
 * only monsters within a few tiles in front of the player are tested.
 */

/** How solid a covering monster stays. */
export const SEE_THROUGH_ALPHA = 0.55;
/** Share of the player's on-screen box that must be covered before the monster fades. */
const MIN_COVER = 0.12;

const _box = new THREE.Box3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Horizontal reach (world units, from the model's centre) of a creature's model, measured once. */
function reach(v: CreatureView): number {
  const ud = v.rig.root.userData;
  if (ud.coverR !== undefined) return ud.coverR as number;
  const root = v.rig.root;
  const hb = v.rig.hitbox;
  root.updateMatrixWorld(true);
  let r = 0.4;
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || me === hb || (o as unknown as THREE.Points).isPoints || o.userData.noShadow) return;
    if (!me.geometry.boundingBox) me.geometry.computeBoundingBox();
    _box.copy(me.geometry.boundingBox!).applyMatrix4(me.matrixWorld);
    r = Math.max(r, Math.abs(_box.min.x - root.position.x), Math.abs(_box.max.x - root.position.x), Math.abs(_box.min.z - root.position.z), Math.abs(_box.max.z - root.position.z));
  });
  ud.coverR = r;
  return r;
}

function ndc(x: number, y: number, z: number, cam: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
  return out.set(x, y, z).project(cam);
}

/**
 * Sets `v.cover` for a monster against the local player's view `me`: SEE_THROUGH_ALPHA while it
 * hides the player, else 1.
 */
export function seeThrough(v: CreatureView, me: CreatureView | undefined, cam: THREE.Camera, sameFloor: boolean): void {
  if (!me || !sameFloor || v.creature.dead || me.creature.dead) {
    v.cover = 1;
    return;
  }
  const rp = v.rig.root.position;
  const pp = me.rig.root.position;
  const dx = Math.abs(rp.x - pp.x);
  const dz = rp.z - pp.z;
  // quick reject: far to the side, behind the player (north) or far in front
  if (dx > 4 || dz < -0.25 || dz > 4.5) {
    v.cover = 1;
    return;
  }
  const R = reach(v);
  if (dx > R + 0.45 || dz > R + 2.5) {
    v.cover = 1;
    return;
  }
  // the player's box on screen (feet to head, shoulder width)
  const ph = me.rig.height;
  const y0 = me.yOffset;
  ndc(pp.x - 0.32, y0, pp.z, cam, _a);
  ndc(pp.x + 0.32, y0 + ph, pp.z, cam, _b);
  const px0 = Math.min(_a.x, _b.x), px1 = Math.max(_a.x, _b.x), py0 = Math.min(_a.y, _b.y), py1 = Math.max(_a.y, _b.y);
  // the monster's: its reach left/right, from its front edge on the ground to the top of its back edge
  ndc(rp.x - R, v.yOffset, rp.z + R, cam, _a);
  ndc(rp.x + R, v.yOffset + v.rig.height, rp.z - Math.min(R, Math.max(0, dz) + 0.2), cam, _b);
  const mx0 = Math.min(_a.x, _b.x), mx1 = Math.max(_a.x, _b.x), my0 = Math.min(_a.y, _b.y), my1 = Math.max(_a.y, _b.y);
  const ox = Math.max(0, Math.min(px1, mx1) - Math.max(px0, mx0));
  const oy = Math.max(0, Math.min(py1, my1) - Math.max(py0, my0));
  const share = (ox * oy) / Math.max(1e-6, (px1 - px0) * (py1 - py0));
  v.cover = share > MIN_COVER ? SEE_THROUGH_ALPHA : 1;
}

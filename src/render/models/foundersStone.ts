import * as THREE from 'three';
import type { Mat } from './parts';

/** Makes a cel material; WorldView passes its floor-tracked factory so the stone dims with its floor. */
export type MatFn = (color: number, opts?: { emissive?: number; map?: THREE.Texture | null }) => Mat;

/**
 * The Founders' Stone: an upright carved memorial standing about 1.2 tiles tall.
 * Its face looks south (+Z) because the camera looks north, so the gold crest and
 * the engraved name lines are what players see first.
 */
export function buildFoundersStone(m: MatFn, rockMap: THREE.Texture | null = null): THREE.Group {
  const g = new THREE.Group();
  const stone = m(0x77726c, { map: rockMap });
  const darkStone = m(0x56514c, { map: rockMap });
  const groove = m(0x2a2624);
  const gold = m(0xe0b440, { emissive: 0x3a2800 });

  const mesh = (geo: THREE.BufferGeometry, mm: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const me = new THREE.Mesh(geo, mm);
    me.position.set(x, y, z);
    g.add(me);
    return me;
  };

  // two-step plinth
  mesh(new THREE.BoxGeometry(0.92, 0.1, 0.62), darkStone, 0, 0.05, 0);
  mesh(new THREE.BoxGeometry(0.78, 0.1, 0.5), stone, 0, 0.15, 0);

  // slab with a rounded crown; the face is at z = 0.15
  const F = 0.15;
  mesh(new THREE.BoxGeometry(0.64, 0.84, 0.3), stone, 0, 0.62, 0);
  const crown = new THREE.CylinderGeometry(0.32, 0.32, 0.3, 12);
  crown.rotateX(Math.PI / 2);
  const arch = mesh(crown, stone, 0, 1.04, 0);
  arch.scale.set(1, 0.5, 1); // gentle arch so the top sits near 1.2 tiles
  // dark border cut round the face
  mesh(new THREE.BoxGeometry(0.56, 0.03, 0.02), groove, 0, 0.27, F);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.03, 0.76, 0.02), groove, s * 0.27, 0.65, F);

  // gold crest: a small shield with an engraved cross and a star point above
  mesh(new THREE.BoxGeometry(0.2, 0.14, 0.03), gold, 0, 0.98, F + 0.005);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.1, 4), gold);
  tip.rotation.set(Math.PI, Math.PI / 4, 0);
  tip.scale.set(1, 1, 0.2);
  tip.position.set(0, 0.86, F + 0.005);
  g.add(tip);
  mesh(new THREE.BoxGeometry(0.025, 0.2, 0.02), groove, 0, 0.94, F + 0.02);
  mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), groove, 0, 0.98, F + 0.02);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), gold);
  star.position.set(0, 1.13, F + 0.01);
  g.add(star);

  // engraved name lines, gold-filled, of uneven length like carved names
  const lens = [0.4, 0.3, 0.36, 0.26, 0.38, 0.3];
  lens.forEach((w, i) => mesh(new THREE.BoxGeometry(w, 0.026, 0.02), i % 2 ? groove : gold, 0, 0.72 - i * 0.07, F + 0.002));

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

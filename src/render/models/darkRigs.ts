import * as THREE from 'three';
import type { EnemyKind } from '../../game/world/WorldMap';
import type { BipedRig, Rig } from './rigs';
import { bipedRig, C, hitbox, Kit, type Mesher, type V3 } from './darkRigsCore';

import { DARK_BEASTS } from './darkRigsBeasts';
import { DARK_ORCS } from './darkRigsOrcs';
import { darkHydra } from './darkRigsHydra';
import { DARK_FOLK } from './darkRigsFolk';
import { DARK_NORTH } from './darkRigsNorth';
import { DARK_BRUTES } from './darkRigsBrutes';
import { DARK_CRAWLERS } from './darkRigsCrawlers';

export { DARK_MONSTERS } from './darkRigsCore';

/**
 * Dark realistic monster models — the default look for every monster.
 * Shared machinery is in darkRigsCore.ts / darkRigsParts.ts; the models are
 * split by family over darkRigs*.ts. This file holds the four approved
 * originals (skeleton, orc warrior, demon, wolf) and the dispatcher.
 */

// ------------------------------------------------------------------ skeleton

const BONE = 0xdcd0ac;
const BONE_D = 0x7e7058;
const SOCKET = C.SOCKET;
const RUST = 0x8a4a22;
const IRON_OLD = 0x5a564e;
const ROT_CLOTH = 0x3a352c;

function darkSkeleton(): BipedRig {
  const K = new Kit('skeleton', 0x6ad8ff, 1.8);
  const leg = (side: number) => (m: Mesher) => {
    m.seg([0, 0, 0], [0, -0.3, 0.05], 0.055, 0.045, BONE);
    m.sph(0.05, BONE_D, [0, -0.3, 0.05]);
    m.seg([0.017, -0.3, 0.05], [0.017, -0.56, 0.0], 0.028, 0.022, BONE);
    m.seg([-0.02, -0.3, 0.05], [-0.02, -0.56, 0.0], 0.02, 0.018, BONE_D);
    m.box(0.1, 0.045, 0.13, BONE, [0, -0.58, 0.04]);
    for (const dx of [-0.033, 0, 0.033]) m.spike([dx, -0.585, 0.1], [0, -0.2, 1], 0.08, 0.016, BONE_D);
    if (side < 0) {
      // a rusted greave strapped to one shin
      m.box(0.11, 0.17, 0.04, RUST, [0, -0.42, 0.055], { grit: 0.35 });
      m.box(0.12, 0.028, 0.1, ROT_CLOTH, [0, -0.36, 0.02]);
    }
  };
  const legL = K.limb('legL', [0.11, 0.6, 0], leg(1));
  const legR = K.limb('legR', [-0.11, 0.6, 0], leg(-1));

  const torso = K.limb('torso', [0, 0.6, 0], (m) => {
    m.ao = 0.1;
    // pelvis
    m.box(0.28, 0.08, 0.13, BONE, [0, 0.02, 0]);
    m.sph(0.085, BONE_D, [0.1, 0.05, -0.02], { s: [1, 0.8, 0.5] });
    m.sph(0.085, BONE_D, [-0.1, 0.05, -0.02], { s: [1, 0.8, 0.5] });
    // tattered loincloth
    for (const [x, l, z] of [[-0.09, 0.3, 0.07], [-0.02, 0.4, 0.075], [0.06, 0.24, 0.07], [0.1, 0.34, 0.065], [-0.07, 0.36, -0.07], [0.04, 0.44, -0.075]] as const) {
      m.box(0.06, l, 0.012, ROT_CLOTH, [x, -l / 2 + 0.02, z], { r: [z > 0 ? 0.08 : -0.08, 0, x * 0.6], grit: 0.3, two: true });
    }
    // hunched upper body
    m.push([0, 0.05, -0.02], [0.32, 0, 0]);
    for (let i = 0; i < 7; i++) m.box(0.055, 0.05, 0.055, i % 2 ? BONE_D : BONE, [0, 0.04 + i * 0.07, -0.08 - Math.sin(i / 6 * Math.PI) * 0.03]);
    // dark hollow chest behind the ribs, with a cold soul-light inside
    m.sph(0.15, SOCKET, [0, 0.33, -0.02], { s: [1.05, 1.2, 0.8], flat: true });
    m.sph(0.06, 0xffffff, [0, 0.34, 0.04], { glow: true }, 0);
    for (let i = 0; i < 5; i++) {
      const R = 0.18 - Math.abs(i - 2.2) * 0.02;
      const g = new THREE.TorusGeometry(R, 0.026, 3, 9, Math.PI * 1.55);
      g.rotateX(Math.PI / 2);
      g.rotateY(Math.PI * 1.275);
      m.add(g, i % 2 ? BONE_D : BONE, [0, 0.2 + i * 0.065, -0.01], { s: [1.15, 1, 0.85] });
    }
    m.box(0.045, 0.24, 0.03, BONE_D, [0, 0.32, 0.13], { r: [-0.12, 0, 0] }); // sternum
    m.box(0.56, 0.05, 0.065, BONE, [0, 0.53, -0.02]); // collar bones
    m.sph(0.09, BONE_D, [0.13, 0.46, -0.12], { s: [1, 1.2, 0.35] }); // shoulder blades
    m.sph(0.09, BONE_D, [-0.13, 0.46, -0.12], { s: [1, 1.2, 0.35] });
    // rusted pauldron with big spikes on the left shoulder
    m.sph(0.14, RUST, [0.28, 0.55, 0], { s: [1.1, 0.55, 1.1], grit: 0.35 });
    m.sph(0.12, IRON_OLD, [0.32, 0.5, 0], { s: [1.1, 0.5, 1.1], grit: 0.35 });
    m.spike([0.28, 0.6, 0], [0.4, 1, -0.2], 0.22, 0.04, IRON_OLD);
    m.spike([0.34, 0.56, -0.06], [0.7, 0.8, -0.4], 0.17, 0.035, RUST);
    // torn cloak strips down the back
    for (const [x, l] of [[-0.14, 0.62], [-0.04, 0.78], [0.07, 0.55], [0.16, 0.7]] as const) {
      m.box(0.09, l, 0.012, ROT_CLOTH, [x, 0.52 - l / 2, -0.17 - l * 0.08], { r: [0.16, 0, x * 0.3], grit: 0.3, two: true });
    }
    m.pop();
  });

  const head = K.limb('head', [0, 1.22, 0.13], (m) => {
    m.ao = 0.08;
    m.push([0, 0, 0], [-0.3, 0, 0], [1.25, 1.25, 1.25]); // big skull, chin up, glaring at the viewer
    m.sph(0.17, BONE, [0, 0.04, -0.02], { s: [1, 1.02, 1.15] });
    m.box(0.31, 0.05, 0.08, BONE_D, [0, 0.07, 0.14]); // brow ridge
    m.box(0.09, 0.08, 0.06, SOCKET, [0.068, 0.012, 0.15], { flat: true });
    m.box(0.09, 0.08, 0.06, SOCKET, [-0.068, 0.012, 0.15], { flat: true });
    // big burning eyes that read through the pixel pass
    m.sph(0.048, 0xffffff, [0.068, 0.012, 0.18], { glow: true }, 0);
    m.sph(0.048, 0xffffff, [-0.068, 0.012, 0.18], { glow: true }, 0);
    m.cone(0.028, 0.055, SOCKET, [0, -0.045, 0.18], { r: [Math.PI, 0, 0] }, 3); // nose hole
    m.box(0.18, 0.05, 0.1, BONE, [0, -0.08, 0.1]); // upper jaw
    for (let i = 0; i < 5; i++) m.box(0.024, 0.04, 0.02, 0xece2c4, [-0.06 + i * 0.03, -0.115, 0.15]);
    m.push([0, -0.1, 0.03], [0.32, 0, 0]); // hanging jaw
    m.box(0.17, 0.045, 0.15, BONE_D, [0, -0.04, 0.06]);
    for (let i = 0; i < 4; i++) m.box(0.024, 0.032, 0.02, 0xece2c4, [-0.045 + i * 0.03, -0.005, 0.12]);
    m.pop();
    // a crack across the cranium
    m.box(0.024, 0.014, 0.17, SOCKET, [0.05, 0.2, 0.0], { r: [0.3, 0.5, 0.2] });
    m.box(0.018, 0.014, 0.09, SOCKET, [0.09, 0.17, 0.08], { r: [0.6, -0.4, 0] });
    m.pop();
  });

  const arm = (side: number) => (m: Mesher) => {
    m.sph(0.05, BONE_D, [0, 0, 0]);
    m.seg([0, 0, 0], [0, -0.28, 0.02], 0.05, 0.04, BONE);
    m.sph(0.04, BONE_D, [0, -0.28, 0.02]);
    m.seg([0.013, -0.28, 0.02], [0.013, -0.48, 0.04], 0.024, 0.02, BONE);
    m.seg([-0.015, -0.28, 0.02], [-0.015, -0.48, 0.04], 0.018, 0.016, BONE_D);
    for (const dx of [-0.027, 0, 0.027]) m.spike([dx, -0.49, 0.04], [0, -1, 0.5], 0.1, 0.014, BONE);
    if (side < 0) {
      // rusty notched sword, bloodied at the point
      m.push([0, -0.5, 0.04]);
      m.cyl(0.024, 0.024, 0.16, 0x2a2018, [0, 0, -0.01], { r: [Math.PI / 2, 0, 0] });
      m.sph(0.04, RUST, [0, 0, -0.1]);
      m.box(0.22, 0.045, 0.045, RUST, [0, 0, 0.08], { r: [0, 0, 0.12], grit: 0.3 });
      m.box(0.085, 0.026, 0.66, IRON_OLD, [0, 0, 0.43], { grit: 0.35 });
      m.box(0.03, 0.03, 0.55, 0x8e8a80, [0, 0.002, 0.4], { flat: true });
      m.box(0.06, 0.028, 0.18, RUST, [0.01, 0, 0.24], { grit: 0.35 });
      m.box(0.055, 0.028, 0.14, RUST, [-0.012, 0, 0.52], { grit: 0.35 });
      m.box(0.07, 0.028, 0.2, IRON_OLD, [0, 0, 0.66], { blood: 0.9, grit: 0.25 });
      m.spike([0, 0, 0.76], [0, 0, 1], 0.12, 0.045, IRON_OLD, { blood: 0.8 });
      for (const z of [0.3, 0.45, 0.58]) m.box(0.022, 0.03, 0.035, SOCKET, [0.04, 0, z]); // notches
      m.pop();
    } else {
      // cracked round shield, split by a blow, a broken arrow still in it
      m.push([0.1, -0.36, 0.08], [0, -0.6, 1.0]);
      m.add(new THREE.CylinderGeometry(0.25, 0.25, 0.045, 9, 1, false, 0.25, 2.9), 0x4a3a2a, [0, 0, 0], { grit: 0.3 });
      m.add(new THREE.CylinderGeometry(0.25, 0.25, 0.045, 9, 1, false, 3.3, 2.75), 0x3e3024, [0.015, 0, 0.01], { grit: 0.3 });
      m.ring(0.25, 0.025, RUST, [0, 0, 0], { grit: 0.4 }, Math.PI * 1.7, 12);
      m.sph(0.065, IRON_OLD, [0, 0.03, 0], { s: [1, 0.6, 1] });
      m.box(0.014, 0.05, 0.3, SOCKET, [0.04, 0, -0.03], { r: [0, 0.35, 0] });
      m.box(0.014, 0.05, 0.14, SOCKET, [-0.08, 0, 0.09], { r: [0, -0.6, 0] });
      m.seg([0.1, 0.02, 0.08], [0.16, 0.22, 0.12], 0.01, 0.01, 0x3a2a1a);
      m.pop();
    }
  };
  const armL = K.limb('armL', [0.28, 1.09, 0.08], arm(1));
  const armR = K.limb('armR', [-0.28, 1.09, 0.08], arm(-1));
  return bipedRig(K, { torso, head, armL, armR, legL, legR }, hitbox(0.75, 1.55, 0.75), 1.7, -0.6);
}

// ------------------------------------------------------------------ orc warrior

export const ORC_SKIN = 0x667440;
export const ORC_SKIN_D = 0x3e4826;
const IRON = 0x5c6066;
const IRON_D = 0x33363b;
const LEATHER = 0x33261b;
const TABARD = 0x5a1a12;
const TUSK = 0xc4b48c;
const SCAR = C.SCAR;

function darkOrcWarrior(): BipedRig {
  const K = new Kit('orc_warrior', 0xff2010);
  const leg = (side: number) => (m: Mesher) => {
    m.box(0.21, 0.3, 0.23, LEATHER, [0, -0.14, 0], { grit: 0.2 });
    m.sph(0.08, IRON, [0, -0.3, 0.1], { s: [1, 0.9, 0.7] });
    m.spike([0, -0.3, 0.14], [0, 0.15, 1], 0.12, 0.035, IRON_D);
    m.box(0.22, 0.2, 0.22, IRON, [0, -0.42, 0.01], { grit: 0.25 });
    m.box(0.12, 0.2, 0.04, IRON_D, [0, -0.42, 0.125]);
    m.box(0.25, 0.14, 0.34, LEATHER, [0, -0.55, 0.05], { blood: 0.1 });
    m.box(0.25, 0.06, 0.12, IRON_D, [0, -0.5, 0.17]);
    m.spike([side * 0.12, -0.42, 0], [side, 0.2, 0], 0.08, 0.025, IRON_D);
  };
  const legL = K.limb('legL', [0.15, 0.6, 0], leg(1));
  const legR = K.limb('legR', [-0.15, 0.6, 0], leg(-1));

  const torso = K.limb('torso', [0, 0.6, 0], (m) => {
    m.cyl(0.31, 0.37, 0.3, 0x3a3c40, [0, -0.02, 0], { grit: 0.4 }, 8); // mail skirt
    for (const [x, l, z] of [[-0.12, 0.42, 1], [0.02, 0.5, 1], [0.14, 0.36, 1], [-0.1, 0.46, -1], [0.1, 0.52, -1]] as const) {
      m.box(0.12, l, 0.015, TABARD, [x, 0.04 - l / 2, z * 0.2], { r: [z * 0.1, 0, 0], grit: 0.3, blood: 0.2, two: true });
    }
    m.box(0.66, 0.09, 0.42, LEATHER, [0, 0.06, 0]);
    m.sph(0.065, TUSK, [0, 0.06, 0.22], { flat: true }); // skull buckle
    m.box(0.06, 0.022, 0.02, SOCKET, [0, 0.07, 0.28], { flat: true });
    m.push([0, 0.06, -0.02], [0.24, 0, 0]);
    m.box(0.58, 0.32, 0.36, ORC_SKIN, [0, 0.2, 0]);
    // layered breastplate
    m.box(0.6, 0.15, 0.4, IRON, [0, 0.22, 0.01], { r: [0.08, 0, 0], grit: 0.25, blood: 0.06 });
    m.box(0.64, 0.15, 0.42, IRON_D, [0, 0.34, 0.015], { r: [0.08, 0, 0], grit: 0.25 });
    m.box(0.68, 0.15, 0.44, IRON, [0, 0.46, 0.02], { r: [0.08, 0, 0], grit: 0.25 });
    m.box(0.06, 0.38, 0.05, IRON_D, [0, 0.34, 0.24]);
    for (const x of [-0.2, 0.2]) m.box(0.035, 0.035, 0.02, RUST, [x, 0.46, 0.245]);
    // spiked collar
    m.cyl(0.22, 0.28, 0.1, IRON_D, [0, 0.58, 0], {}, 8);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.15 + i * 0.175);
      m.spike([Math.cos(a) * 0.25, 0.6, -Math.sin(a) * 0.22], [Math.cos(a) * 0.5, 1, -Math.sin(a) * 0.8], 0.16, 0.03, IRON);
    }
    for (let i = 0; i < 3; i++) m.spike([0, 0.18 + i * 0.13, -0.21], [0, 0.6, -1], 0.13 + i * 0.03, 0.035, IRON_D);
    // layered spiked pauldrons
    for (const s of [-1, 1]) {
      m.sph(0.15, IRON, [s * 0.38, 0.52, 0], { s: [1.1, 0.5, 1.05], grit: 0.3 });
      m.sph(0.13, RUST, [s * 0.43, 0.45, 0], { s: [1.1, 0.45, 1.0], grit: 0.35 });
      m.sph(0.115, IRON_D, [s * 0.47, 0.39, 0], { s: [1, 0.42, 1], grit: 0.25 });
      m.spike([s * 0.4, 0.57, 0.02], [s * 0.45, 1, 0.1], 0.24, 0.04, 0x9a9c9e);
      m.spike([s * 0.47, 0.52, -0.06], [s * 0.9, 0.7, -0.3], 0.18, 0.035, 0x9a9c9e);
      m.spike([s * 0.5, 0.45, 0.08], [s * 1, 0.4, 0.3], 0.13, 0.03, IRON);
    }
    m.pop();
  });

  const head = K.limb('head', [0, 1.24, 0.13], (m) => {
    m.ao = 0.1;
    m.push([0, 0, 0], [-0.25, 0, 0]);
    m.sph(0.2, ORC_SKIN, [0, 0, 0], { s: [1.1, 1, 1] });
    m.box(0.32, 0.15, 0.2, ORC_SKIN, [0, -0.11, 0.08]); // heavy jaw
    m.box(0.34, 0.06, 0.1, ORC_SKIN_D, [0, 0.06, 0.15]); // brow
    m.eyes(0.08, 0.02, 0.2, 0.095, 0.055, 0.25);
    m.box(0.08, 0.06, 0.06, ORC_SKIN_D, [0, -0.03, 0.21]); // flat nose
    m.box(0.2, 0.025, 0.02, 0x1a0e0a, [0, -0.1, 0.19]); // mouth
    m.spike([0.09, -0.1, 0.17], [0.15, 1, 0.25], 0.16, 0.034, TUSK);
    m.spike([-0.09, -0.1, 0.17], [-0.15, 1, 0.25], 0.14, 0.034, TUSK);
    m.box(0.02, 0.2, 0.015, SCAR, [0.1, -0.02, 0.2], { r: [0, 0, 0.5], flat: true }); // scar over the eye
    m.box(0.12, 0.016, 0.015, SCAR, [-0.12, -0.12, 0.17], { r: [0, -0.5, 0.3], flat: true });
    for (const s of [-1, 1]) m.spike([s * 0.2, 0.0, -0.02], [s, 0.4, -0.5], 0.17, 0.045, ORC_SKIN, {}, 3); // torn ears
    // iron helm with cheek guards and a spiked crest
    m.sph(0.215, 0x4a4a4c, [0, 0.11, -0.03], { s: [1.04, 0.62, 1.06], grit: 0.35, blood: 0.12 });
    m.box(0.05, 0.03, 0.4, RUST, [0, 0.245, -0.03], { grit: 0.3 });
    m.box(0.46, 0.05, 0.05, IRON_D, [0, 0.07, 0.17]);
    m.box(0.04, 0.12, 0.05, IRON_D, [0, 0.03, 0.22]);
    for (const s of [-1, 1]) m.box(0.05, 0.18, 0.14, IRON_D, [s * 0.2, -0.05, 0.08], { r: [0, 0, s * 0.15] });
    for (let i = 0; i < 4; i++) m.spike([0, 0.22 - i * 0.02, 0.08 - i * 0.09], [0, 1, -0.35], 0.16 - i * 0.015, 0.03, IRON_D);
    m.pop();
  });

  const arm = (side: number) => (m: Mesher) => {
    m.sph(0.1, ORC_SKIN, [0, -0.04, 0]);
    m.box(0.18, 0.3, 0.19, ORC_SKIN, [0, -0.17, 0]);
    m.box(0.014, 0.16, 0.01, SCAR, [side * 0.07, -0.16, 0.096], { r: [0, 0, 0.4], flat: true });
    m.box(0.2, 0.2, 0.21, IRON_D, [0, -0.36, 0], { grit: 0.25, blood: side < 0 ? 0.15 : 0 });
    m.spike([side * 0.1, -0.33, 0], [side, 0.3, 0], 0.13, 0.035, IRON);
    m.spike([side * 0.1, -0.41, -0.04], [side, 0, -0.4], 0.1, 0.03, IRON);
    m.box(0.16, 0.14, 0.17, ORC_SKIN_D, [0, -0.5, 0.01]);
    if (side > 0) for (const dx of [-0.05, 0, 0.05]) m.spike([dx, -0.5, 0.09], [0, 0, 1], 0.08, 0.02, IRON); // knuckle spikes
    if (side < 0) {
      // heavy notched cleaver
      m.push([0, -0.5, 0.04]);
      m.cyl(0.028, 0.028, 0.34, LEATHER, [0, 0, 0.06], { r: [Math.PI / 2, 0, 0] });
      m.sph(0.04, IRON_D, [0, 0, -0.12]);
      m.box(0.05, 0.4, 0.52, IRON, [0, -0.13, 0.42], { grit: 0.3, blood: 0.25 });
      m.box(0.055, 0.08, 0.52, IRON_D, [0, 0.04, 0.42]);
      m.box(0.054, 0.07, 0.5, 0xaaa8a0, [0, -0.31, 0.42], { blood: 0.5, grit: 0.2, flat: true });
      for (const z of [0.26, 0.44, 0.6]) m.box(0.06, 0.05, 0.04, SOCKET, [0, -0.33, z]);
      m.spike([0, 0.06, 0.66], [0, 0.6, 1], 0.1, 0.03, IRON_D);
      m.sph(0.03, RUST, [0, 0.0, 0.2]);
      m.pop();
    }
  };
  const armL = K.limb('armL', [0.44, 1.04, 0.08], arm(1));
  const armR = K.limb('armR', [-0.44, 1.04, 0.08], arm(-1));
  return bipedRig(K, { torso, head, armL, armR, legL, legR }, hitbox(0.8, 1.6, 0.8), 1.75, -0.6);
}

// ------------------------------------------------------------------ demon

const DEM_SKIN = 0x6e2216;
const DEM_SKIN_D = 0x3a100c;
const DEM_PLATE = 0x261410;
const HORN = 0x2a221c;
const HORN_TIP = 0x7a6a52;
const CLAW = C.CLAW;
const MEMBRANE = 0x2e1612;

function darkDemon(): BipedRig {
  const K = new Kit('demon', 0xff6a14);
  const leg = (side: number) => (m: Mesher) => {
    // digitigrade legs with hooves
    m.sph(0.15, DEM_SKIN, [0, -0.04, 0], { s: [1, 1.2, 1.1] });
    m.seg([0, 0, 0], [0, -0.33, 0.15], 0.14, 0.1, DEM_SKIN);
    m.sph(0.09, DEM_SKIN_D, [0, -0.33, 0.15]);
    m.spike([0, -0.33, 0.2], [0, 0.4, 1], 0.12, 0.035, HORN);
    m.seg([0, -0.33, 0.15], [0, -0.6, -0.02], 0.085, 0.065, DEM_SKIN_D);
    m.seg([0, -0.6, -0.02], [0, -0.7, 0.05], 0.06, 0.06, DEM_PLATE);
    m.box(0.17, 0.08, 0.2, CLAW, [0, -0.74, 0.07]);
    m.spike([side * 0.07, -0.6, -0.04], [side * 0.3, 0.2, -1], 0.1, 0.03, HORN);
    m.box(0.14, 0.014, 0.02, 0xffffff, [0, -0.2, 0.14], { glow: true, r: [0.8, 0, side * 0.4] });
  };
  const legL = K.limb('legL', [0.21, 0.78, 0], leg(1));
  const legR = K.limb('legR', [-0.21, 0.78, 0], leg(-1));

  const torso = K.limb('torso', [0, 0.78, 0], (m) => {
    m.box(0.52, 0.18, 0.34, DEM_PLATE, [0, 0.02, 0]);
    for (const [x, l, z] of [[-0.14, 0.42, 1], [0.0, 0.52, 1], [0.15, 0.38, 1], [-0.12, 0.5, -1], [0.12, 0.44, -1]] as const) {
      m.box(0.15, l, 0.015, 0x1e0e0a, [x, -l / 2, z * 0.18], { r: [z * 0.12, 0, 0], grit: 0.3, two: true });
    }
    m.horn([[0, 0.02, -0.16], [0, -0.2, -0.4], [0.1, -0.5, -0.55], [0.22, -0.7, -0.45]], 0.07, DEM_SKIN_D, HORN);
    m.spike([0.22, -0.7, -0.45], [0.6, -0.5, 0.5], 0.14, 0.05, HORN);
    m.push([0, 0.08, -0.04], [0.34, 0, 0]);
    m.box(0.5, 0.42, 0.34, DEM_SKIN, [0, 0.24, 0]);
    for (let i = 0; i < 4; i++) m.box(0.36 - i * 0.02, 0.08, 0.06, DEM_PLATE, [0, 0.08 + i * 0.1, 0.17], { grit: 0.25 });
    m.sph(0.42, DEM_SKIN, [0, 0.62, 0.0], { s: [1.3, 0.75, 0.85], grit: 0.18 });
    m.sph(0.2, DEM_SKIN_D, [0.17, 0.6, 0.2], { s: [1.1, 0.8, 0.5] });
    m.sph(0.2, DEM_SKIN_D, [-0.17, 0.6, 0.2], { s: [1.1, 0.8, 0.5] });
    m.box(0.16, 0.022, 0.02, 0xffffff, [0.08, 0.52, 0.31], { glow: true, r: [0, 0, 0.7] });
    m.box(0.12, 0.022, 0.02, 0xffffff, [-0.06, 0.46, 0.3], { glow: true, r: [0, 0, -0.5] });
    m.box(0.1, 0.022, 0.02, 0xffffff, [0.0, 0.64, 0.33], { glow: true, r: [0, 0, 1.2] });
    m.sph(0.05, 0xffffff, [0, 0.55, 0.32], { glow: true }, 0);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) m.box(0.04, 0.035, 0.24, HORN, [s * 0.27, 0.3 + i * 0.09, 0.02], { r: [0, 0, s * 0.3] });
    for (const s of [-1, 1]) {
      m.sph(0.2, DEM_SKIN_D, [s * 0.44, 0.74, 0], { s: [1.1, 0.85, 1] });
      m.sph(0.16, DEM_PLATE, [s * 0.47, 0.82, -0.02], { s: [1.15, 0.6, 1.1], grit: 0.25 });
      m.spike([s * 0.42, 0.95, 0.02], [s * 0.3, 1, 0.1], 0.36, 0.06, HORN);
      m.spike([s * 0.55, 0.9, -0.04], [s * 0.9, 0.8, -0.3], 0.28, 0.05, HORN);
      m.spike([s * 0.6, 0.8, 0.08], [s * 1, 0.4, 0.4], 0.2, 0.04, HORN);
    }
    for (let i = 0; i < 4; i++) m.spike([0, 0.3 + i * 0.16, -0.24], [0, 0.7, -1], 0.16 + i * 0.03, 0.045, HORN);
    m.pop();
  });

  const head = K.limb('head', [0, 1.74, 0.34], (m) => {
    m.ao = 0.1;
    m.push([0, 0, 0], [-0.25, 0, 0], [1.1, 1.1, 1.1]);
    m.sph(0.2, DEM_SKIN, [0, 0, 0], { s: [1, 0.95, 1.1] });
    m.box(0.36, 0.07, 0.12, DEM_PLATE, [0, 0.07, 0.15], { r: [0.2, 0, 0] });
    for (const s of [-1, 1]) m.spike([s * 0.13, 0.1, 0.18], [s * 0.4, 1, 0.4], 0.09, 0.025, HORN);
    m.eyes(0.085, 0.025, 0.21, 0.1, 0.055, 0.35);
    m.box(0.26, 0.1, 0.18, DEM_SKIN_D, [0, -0.08, 0.14]);
    m.box(0.07, 0.04, 0.04, 0x140806, [0, -0.04, 0.235]);
    m.push([0, -0.14, 0.04], [0.28, 0, 0]);
    m.box(0.24, 0.07, 0.2, DEM_SKIN_D, [0, -0.02, 0.1]);
    m.box(0.18, 0.02, 0.16, 0x220806, [0, 0.018, 0.1]);
    for (const x of [-0.08, 0.08]) m.spike([x, 0.0, 0.18], [0, 1, 0.1], 0.08, 0.02, 0xc0b090);
    m.pop();
    for (const x of [-0.09, -0.04, 0.04, 0.09]) m.spike([x, -0.13, 0.2], [0, -1, 0.1], Math.abs(x) > 0.06 ? 0.1 : 0.06, 0.018, 0xc0b090, { blood: 0.4 });
    for (const s of [-1, 1]) {
      m.horn([[s * 0.13, 0.12, -0.02], [s * 0.3, 0.26, -0.08], [s * 0.44, 0.42, -0.2], [s * 0.5, 0.6, -0.12], [s * 0.45, 0.74, 0.04], [s * 0.36, 0.8, 0.14]], 0.09, HORN, HORN_TIP);
      m.spike([s * 0.16, 0.0, -0.1], [s * 0.6, -0.2, -1], 0.14, 0.03, HORN);
    }
    m.pop();
  });

  const arm = (side: number) => (m: Mesher) => {
    m.sph(0.15, DEM_SKIN_D, [0, -0.02, 0]);
    m.seg([0, 0, 0], [0, -0.36, 0.02], 0.14, 0.11, DEM_SKIN);
    m.sph(0.1, DEM_SKIN_D, [0, -0.36, 0.02]);
    m.spike([0, -0.36, -0.06], [0, -0.2, -1], 0.16, 0.04, HORN);
    m.seg([0, -0.36, 0.02], [0, -0.66, 0.06], 0.11, 0.085, DEM_SKIN_D);
    m.box(0.014, 0.18, 0.02, 0xffffff, [side * 0.09, -0.5, 0.06], { glow: true, r: [0, 0, side * 0.3] });
    for (let i = 0; i < 3; i++) m.spike([side * 0.09, -0.42 - i * 0.08, 0], [side, 0.5, -0.2], 0.12, 0.03, HORN);
    m.box(0.17, 0.1, 0.16, DEM_SKIN_D, [0, -0.72, 0.07]);
    for (const dx of [-0.06, 0, 0.06]) m.horn([[dx, -0.74, 0.13], [dx, -0.8, 0.24], [dx, -0.9, 0.29]], 0.028, CLAW, CLAW, { blood: 0.6 });
    m.spike([side * 0.08, -0.72, 0.06], [side * 0.5, -0.6, 0.6], 0.12, 0.022, CLAW);
  };
  const armL = K.limb('armL', [0.6, 1.46, 0.12], arm(1));
  const armR = K.limb('armR', [-0.6, 1.46, 0.12], arm(-1));

  const wings = [-1, 1].map((s) => {
    const w = K.limb(s < 0 ? 'wingR' : 'wingL', [s * 0.18, 1.48, -0.26], (m) => batWing(m, s, 1.2, MEMBRANE, DEM_SKIN_D, HORN));
    w.rotation.y = s * 0.3;
    return w;
  });
  return bipedRig(K, { torso, head, armL, armR, legL, legR, wings }, hitbox(0.8, 1.6, 0.8), 2.0, -0.45);
}

/** Bat wing: bone fingers with a jagged, torn membrane, spreading toward ±X. */
export function batWing(m: Mesher, s: number, S: number, membrane: number, arm: number, bone: number): void {
  const P = (x: number, y: number): V3 => [s * x * S, y * S, 0];
  const outline: [number, number][] = [[0, 0.05], [0.42, 0.4], [1.05, 0.72], [0.86, 0.38], [1.12, 0.14], [0.84, -0.04], [0.92, -0.38], [0.62, -0.26], [0.52, -0.58], [0.4, -0.36], [0.22, -0.46], [0.12, -0.24], [0, -0.22]];
  m.poly(outline.map(([x, y]) => [s * x * S, y * S] as [number, number]), membrane, [0, 0, 0], { grit: 0.25 });
  m.seg(P(0, 0), P(0.42, 0.4), 0.05, 0.04, arm);
  for (const t of [[1.05, 0.72], [1.12, 0.14], [0.92, -0.38], [0.52, -0.58]] as const) m.seg(P(0.42, 0.4), P(t[0], t[1]), 0.03, 0.012, bone);
  m.spike(P(0.42, 0.4), [s * 0.2, 1, 0.3], 0.14, 0.03, bone);
}

// ------------------------------------------------------------------ dispatch

const DARK: Partial<Record<EnemyKind, () => Rig>> = {
  skeleton: darkSkeleton,
  orc_warrior: darkOrcWarrior,
  demon: darkDemon,
  ...DARK_BEASTS,
  ...DARK_ORCS,
  hydra: darkHydra,
  ...DARK_FOLK,
  ...DARK_NORTH,
  ...DARK_BRUTES,
  ...DARK_CRAWLERS,
};

/** The dark model for a monster kind, or null to use the classic one. */
export function buildDarkEnemy(kind: EnemyKind): Rig | null {
  const f = DARK[kind];
  return f ? f() : null;
}

/** Kinds that have a dark model (tests / debug). */
export function darkKinds(): EnemyKind[] {
  return Object.keys(DARK) as EnemyKind[];
}

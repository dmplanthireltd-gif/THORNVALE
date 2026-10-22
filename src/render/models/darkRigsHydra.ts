import * as THREE from 'three';
import type { QuadRig } from './rigs';
import { C, hitbox, Kit, quadRig, type Mesher, type V3 } from './darkRigsCore';

/**
 * The hydra (owner request 2026-10-22: "something like a basilisk with 3 heads").
 * A heavy, low, armour-scaled reptile body on four thick clawed legs with a long
 * ridged tail, and three long serpent necks rising from the shoulders, each
 * ending in a big horned, crested basilisk head with burning eyes and a fanged
 * jaw that gapes when it strikes.
 *
 * Each neck is its own pivot (rig.necks) so CreatureView sways them
 * independently and makes them strike one after another; all three share
 * one cached neck geometry and one jaw geometry.
 */

const SCALE = 0x40603a; // deep moss green
const SCALE_D = 0x1c2a1c; // near-black green
const SCALE_L = 0x6a8a4a; // sun-dulled ridge scales (tops of heads and necks)
const PLATE = 0x26361f; // dark armour plates
const BRONZE = 0xb08638;
const BRONZE_D = 0x6a4c22;
const BELLY = 0xb4ac74;
const MAW = 0xa01e16;
const THROAT = 0x2a0806;

/**
 * Neck bases on the shoulders: the outer two lean out (z) and turn out (yaw)
 * so the three heads stay well apart and readable from the top-down camera.
 */
const NECKS: { at: V3; yaw: number; lean: number; s: number }[] = [
  { at: [0.24, 0.6, 0.4], yaw: 0.6, lean: -0.3, s: 0.92 },
  { at: [0, 0.66, 0.48], yaw: 0, lean: 0, s: 1.04 },
  { at: [-0.24, 0.6, 0.4], yaw: -0.6, lean: 0.3, s: 0.92 },
];

/** Where the skull sits at the end of the neck (neck frame), and the jaw hinge under it. */
const HEAD: V3 = [0, 0.66, 0.74];
const HEAD_S = 1.9;
const HEAD_PITCH = 0.22; // snout tipped down toward the prey
/** Jaw hinge in the neck frame: the skull's rear underside. */
const HINGE: V3 = [0, HEAD[1] - 0.045 * HEAD_S, HEAD[2] - 0.0 * HEAD_S];

function backPlates(m: Mesher, z0: number, z1: number, y: number, w: number, n: number): void {
  // overlapping armour plates down the back, bronze-edged, a ridge of spines down the middle
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const z = z0 + (z1 - z0) * t;
    const hump = 1 - Math.abs(t - 0.35) * 1.1;
    const yy = y - (1 - hump) * 0.12;
    const ww = w * (0.55 + hump * 0.45);
    m.box(ww, 0.06, 0.15, i % 2 ? PLATE : SCALE, [0, yy, z], { r: [-0.22, 0, 0], grit: 0.3 });
    m.spike([0, yy + 0.03, z], [0, 1, -0.55], 0.08 + hump * 0.1, 0.034, i % 2 ? BRONZE : SCALE_L);
    for (const s of [-1, 1]) m.box(0.1, 0.05, 0.12, i % 2 ? SCALE : PLATE, [s * ww * 0.5, yy - 0.04, z], { r: [0, 0, s * 0.5], grit: 0.3 }); // side plates
  }
}

function neck(m: Mesher): void {
  m.ao = 0.1;
  // long serpent neck: rising off the shoulders, then arching far forward toward
  // the target (forward reach is what reads as "long" from the top-down camera)
  const pts: V3[] = [[0, 0, 0], [0, 0.2, 0.08], [0, 0.4, 0.17], [0, 0.55, 0.32], [0, 0.63, 0.5], [0, 0.65, 0.66]];
  const r = [0.14, 0.115, 0.1, 0.09, 0.082, 0.078];
  m.tube(pts, r, SCALE, { grit: 0.22 }, 7);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const mid: V3 = [0, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const tilt = Math.atan2(b[2] - a[2], b[1] - a[1]);
    const rr = (r[i] + r[i + 1]) / 2;
    // pale throat scutes on the front of the neck
    m.box(rr * 1.3, 0.075, 0.05, BELLY, [0, mid[1], mid[2] + rr * 0.82], { r: [tilt, 0, 0], grit: 0.18 });
    // lighter scale band down the back of the neck, with spines
    m.box(rr * 1.25, 0.09, 0.05, SCALE_L, [0, mid[1], mid[2] - rr * 0.8], { r: [tilt, 0, 0], grit: 0.3 });
    m.spike([0, mid[1], mid[2] - rr * 0.95], [0, 0.35, -1], 0.07, 0.024, i % 2 ? BRONZE : SCALE_L);
    // dark scale rows on the sides
    for (const s of [-1, 1]) m.box(0.03, 0.06, rr * 1.2, SCALE_D, [s * rr * 0.92, mid[1], mid[2]], { r: [tilt, 0, 0], grit: 0.3 });
  }

  // ---- the basilisk head: long wedge skull, heavy brows, swept horns, a bronze crest frill
  m.push(HEAD, [HEAD_PITCH, 0, 0], [HEAD_S, HEAD_S, HEAD_S]);
  m.sph(0.08, SCALE, [0, 0.0, 0.0], { s: [1.15, 0.8, 1.15], grit: 0.2 }); // braincase
  // long tapering wedge snout
  m.push([0, 0, 0], [0, 0, 0], [1, 0.62, 1]);
  m.seg([0, 0.0, 0.02], [0, -0.01, 0.23], 0.072, 0.036, SCALE, { grit: 0.2 }, 6);
  m.pop();
  m.box(0.055, 0.02, 0.17, SCALE_L, [0, 0.036, 0.08], { r: [0.1, 0, 0], grit: 0.3 }); // pale ridge down the skull (reads from above)
  m.box(0.1, 0.012, 0.16, MAW, [0, -0.032, 0.11], { flat: true }); // gums under the lip
  m.box(0.08, 0.026, 0.13, THROAT, [0, -0.02, 0.1], { flat: true }); // the dark of the mouth
  for (const s of [-1, 1]) {
    m.sph(0.012, 0x0a0806, [s * 0.028, 0.025, 0.232], { flat: true }, 0); // nostrils
    m.box(0.06, 0.035, 0.09, SCALE_D, [s * 0.055, 0.055, 0.04], { r: [0.1, 0, s * 0.4] }); // heavy brow ridges
    for (let i = 0; i < 4; i++) m.spike([s * 0.052, -0.032, 0.06 + i * 0.045], [0, -1, 0.12], 0.04 + (i === 2 ? 0.03 : 0), 0.011, C.FANG, { flat: true }); // upper fangs
    m.spike([s * 0.07, -0.015, -0.01], [s, -0.3, -0.35], 0.09, 0.022, SCALE_L); // cheek spurs
  }
  // burning slit eyes, set high on the sides so they read from above
  m.box(0.06, 0.03, 0.04, 0xffffff, [0.058, 0.032, 0.075], { glow: true, r: [0.2, 0.35, -0.45] });
  m.box(0.06, 0.03, 0.04, 0xffffff, [-0.058, 0.032, 0.075], { glow: true, r: [0.2, -0.35, 0.45] });
  // pale swept-back horns
  for (const s of [-1, 1]) {
    m.horn([[s * 0.045, 0.05, -0.01], [s * 0.1, 0.1, -0.1], [s * 0.12, 0.12, -0.23]], 0.028, C.HORN_L, 0xc8b890);
    m.horn([[s * 0.075, 0.005, -0.04], [s * 0.16, 0.02, -0.11], [s * 0.21, 0.0, -0.19]], 0.018, C.HORN, C.HORN_L);
  }
  m.horn([[0, 0.06, 0.04], [0, 0.11, -0.03], [0, 0.13, -0.12]], 0.02, C.HORN, C.HORN_L); // nose-to-crest horn
  // the crest frill: a bronze fan laid back behind the skull, ribbed with spines
  const fan: [number, number][] = [[0, 0], [0.08, 0.015], [0.1, 0.055], [0.075, 0.095], [0.025, 0.115], [-0.025, 0.115], [-0.075, 0.095], [-0.1, 0.055], [-0.08, 0.015]];
  m.poly(fan, 0x3a3018, [0, 0.03, -0.05], { r: [-1.1, 0, 0], grit: 0.3 }, 0.01);
  for (let i = 0; i < 5; i++) {
    const a = -1.0 + i * 0.5;
    const tip: V3 = [Math.sin(a) * 0.12, 0.03 + Math.cos(a) * 0.06, -0.05 - Math.cos(a) * 0.11];
    m.seg([0, 0.035, -0.05], tip, 0.011, 0.004, BRONZE, { flat: true });
  }
  m.pop();
}

function jaw(m: Mesher): void {
  m.ao = 0;
  // the jaw's frame is the hinge; the skull is pitched, so the jaw is too
  m.push([0, 0, 0], [HEAD_PITCH, 0, 0], [HEAD_S, HEAD_S, HEAD_S]);
  m.box(0.11, 0.032, 0.21, SCALE_D, [0, -0.018, 0.1], { grit: 0.2 });
  m.box(0.085, 0.012, 0.18, MAW, [0, 0.004, 0.1], { flat: true, blood: 0.35 }); // tongue and gums
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) m.spike([s * 0.045, 0.0, 0.05 + i * 0.045], [0, 1, 0.1], 0.035 + (i === 1 ? 0.02 : 0), 0.009, C.FANG, { flat: true });
  m.box(0.09, 0.02, 0.12, BELLY, [0, -0.036, 0.07]); // pale chin
  m.pop();
}

export function darkHydra(): QuadRig {
  const K = new Kit('hydra', 0xffb020, 2.4);
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.ao = 0.25;
    m.sph(0.5, SCALE, [0, 0.44, 0.14], { s: [0.92, 0.56, 0.74], grit: 0.2 }); // massive shoulders
    m.sph(0.5, SCALE, [0, 0.42, -0.24], { s: [0.86, 0.52, 0.8], grit: 0.2 }); // belly / hips
    m.sph(0.5, BELLY, [0, 0.28, -0.04], { s: [0.72, 0.22, 1.04], grit: 0.15 }); // underbelly
    for (let i = 0; i < 6; i++) m.box(0.54 - Math.abs(i - 2.5) * 0.05, 0.02, 0.07, 0x8a845a, [0, 0.18, 0.3 - i * 0.12], { flat: true }); // belly scutes
    backPlates(m, 0.36, -0.6, 0.72, 0.56, 8);
    // flank scale rows
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
      m.box(0.03, 0.08, 0.11, j ? SCALE_D : PLATE, [s * (0.44 - j * 0.05), 0.46 - j * 0.12, 0.3 - i * 0.14], { r: [0, 0, s * (0.35 + j * 0.2)], grit: 0.3 });
    }
    for (const s of [-1, 1]) m.spike([s * 0.4, 0.58, 0.22], [s, 0.6, 0.1], 0.13, 0.045, BRONZE); // shoulder horns
    // old scars and a fresh wound on one flank
    for (let i = 0; i < 3; i++) m.box(0.016, 0.014, 0.2, MAW, [0.45, 0.45 - i * 0.04, -0.15], { r: [0.35, 0, 0], blood: 1, flat: true });
    m.box(0.012, 0.012, 0.24, C.SCAR, [-0.44, 0.5, 0.0], { r: [-0.3, 0, 0], flat: true });
    // the collar where the three necks join the body
    m.sph(0.5, SCALE, [0, 0.58, 0.42], { s: [0.74, 0.34, 0.34], grit: 0.2 });
    m.sph(0.5, BELLY, [0, 0.48, 0.54], { s: [0.48, 0.22, 0.14], grit: 0.2 }); // pale chest
    for (const s of [-1, 0, 1]) m.ring(0.1, 0.014, BRONZE_D, [s * 0.24, 0.62, 0.42], { flat: true }, Math.PI * 2, 8); // bronze neck bands
  });

  // three necks, each its own pivot for independent sway and staggered strikes
  const head = new THREE.Group();
  const necks: { neck: THREE.Group; jaw: THREE.Group | null; yaw: number; crest: THREE.Group }[] = [];
  for (const n of NECKS) {
    // the holder carries the fixed outward lean; the neck inside it sways
    const holder = new THREE.Group();
    holder.position.set(...n.at);
    holder.rotation.z = n.lean;
    holder.scale.setScalar(n.s);
    const g = K.limb('neck', [0, 0, 0], neck);
    g.rotation.y = n.yaw;
    const j = K.limb('jaw', HINGE, jaw);
    g.add(j);
    // an empty pivot on top of the skull (a boss's crown goes here)
    const crest = new THREE.Group();
    crest.position.set(HEAD[0], HEAD[1] + 0.07 * HEAD_S, HEAD[2] - 0.01 * HEAD_S);
    crest.rotation.x = HEAD_PITCH;
    g.add(crest);
    holder.add(g);
    head.add(holder);
    necks.push({ neck: g, jaw: j, yaw: n.yaw, crest });
  }

  const leg = (front: boolean, side: number) => (m: Mesher) => {
    // sprawling reptile leg: thick upper limb out to the side, forearm down, splayed claws
    m.ao = 0.2;
    const out = 0.16 * side;
    const fz = front ? 0.05 : -0.05;
    m.sph(0.15, SCALE, [0, -0.02, 0], { s: [1.1, 1, 1.2], grit: 0.2 });
    m.seg([0, 0, 0], [out, -0.14, fz], 0.14, 0.1, SCALE, { grit: 0.2 });
    m.sph(0.095, PLATE, [out, -0.14, fz]);
    m.spike([out + 0.05 * side, -0.12, fz - 0.03], [side, 0.4, -0.6], 0.11, 0.032, BRONZE_D); // elbow spur
    m.seg([out, -0.14, fz], [out, -0.36, fz + 0.04], 0.1, 0.08, SCALE_D, { grit: 0.2 });
    for (let i = 0; i < 3; i++) m.box(0.12, 0.02, 0.05, PLATE, [out, -0.2 - i * 0.05, fz + 0.09], { flat: true }); // shin scutes
    m.box(0.2, 0.06, 0.22, SCALE_D, [out, -0.38, fz + 0.06]);
    for (const dx of [-0.07, -0.025, 0.025, 0.07]) m.horn([[out + dx, -0.38, fz + 0.15], [out + dx * 1.3, -0.4, fz + 0.23], [out + dx * 1.4, -0.43, fz + 0.28]], 0.02, C.CLAW, 0x9a8a68);
  };
  const legs = [
    K.limb('frontL', [0.32, 0.4, 0.26], leg(true, 1)),
    K.limb('frontR', [-0.32, 0.4, 0.26], leg(true, -1)),
    K.limb('backL', [0.32, 0.4, -0.38], leg(false, 1)),
    K.limb('backR', [-0.32, 0.4, -0.38], leg(false, -1)),
  ];

  const tail = K.limb('tail', [0, 0.4, -0.62], (m) => {
    m.ao = 0.2;
    const pts: V3[] = [[0, 0, 0], [0.05, -0.08, -0.32], [0.16, -0.18, -0.64], [0.32, -0.26, -0.9], [0.5, -0.3, -1.08]];
    const r = [0.21, 0.16, 0.115, 0.075, 0.045];
    m.tube(pts, r, SCALE, { grit: 0.25 }, 7);
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      m.box(r[i + 1] * 1.3, 0.04, 0.12, i % 2 ? PLATE : SCALE_L, [mid[0], mid[1] + r[i + 1] * 0.85, mid[2]], { grit: 0.3 }); // back plates
      m.spike([mid[0], mid[1] + r[i + 1] * 0.95, mid[2]], [0, 1, -0.6], 0.12 - i * 0.02, 0.03, i % 2 ? BRONZE : SCALE_D);
      m.box(r[i + 1] * 1.4, 0.02, 0.06, BELLY, [mid[0], mid[1] - r[i + 1] * 0.9, mid[2]], { flat: true });
    }
    // a bony barbed club at the tip
    m.sph(0.065, C.HORN_L, [0.5, -0.3, -1.08], { s: [1, 0.8, 1.4] });
    for (const d of [[1, 0.3, -0.5], [-0.3, 0.6, -0.8], [0.2, -0.2, -1], [-0.8, 0.2, -0.4]] as V3[]) m.spike([0.5, -0.3, -1.08], d, 0.11, 0.026, 0xc8b890);
  });

  const rig = quadRig(K, { body, head, legs, tail }, hitbox(1.1, 1.6, 1.4), 1.95);
  rig.necks = necks;
  return rig;
}

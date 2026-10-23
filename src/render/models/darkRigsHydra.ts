import * as THREE from 'three';
import type { QuadRig } from './rigs';
import { C, hitbox, Kit, quadRig, type Mesher, type V3 } from './darkRigsCore';
import { PAINTED } from '../style';

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
  if (PAINTED) return paintedHydra();
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

// ------------------------------------------------------------------ painted style

/**
 * Painted style hydra (owner 2026-10-23: "some monsters still look square, e.g. hydras" and
 * "much too big"): the same three-headed basilisk, but organic — one smooth curved neck per head,
 * rounded skulls with long tapering snouts, the body covered in overlapping rounded scales
 * instead of box plates, clawed rounded feet and a tail that curls round to the side instead
 * of trailing three tiles behind. Compact: about 1.7 × 2.3 tiles at its game size.
 */
const P_NECKS: { at: V3; yaw: number; lean: number; s: number }[] = [
  { at: [0.2, 0.56, 0.3], yaw: 0.62, lean: -0.22, s: 0.92 },
  { at: [0, 0.62, 0.36], yaw: 0, lean: 0, s: 1.04 },
  { at: [-0.2, 0.56, 0.3], yaw: -0.62, lean: 0.22, s: 0.92 },
];
const P_NECK: V3[] = [[0, 0, 0], [0, 0.2, 0.05], [0, 0.38, 0.13], [0, 0.5, 0.27], [0, 0.55, 0.42]];
const P_NECK_R = [0.13, 0.11, 0.095, 0.085, 0.078];
const P_HEAD: V3 = [0, 0.56, 0.48];
const P_HEAD_S = 1.55;
const P_HINGE: V3 = [0, P_HEAD[1] - 0.04 * P_HEAD_S, P_HEAD[2] - 0.01 * P_HEAD_S];

/** Overlapping rounded scales over the top of an ellipsoid (centre c, radii r), rows along z. */
function scaleCoat(m: Mesher, c: V3, r: V3, rows: number, per: number, size: number, cols: number[], spread = 1.15): void {
  for (let i = 0; i < rows; i++) {
    const u = -0.85 + (1.7 * i) / Math.max(1, rows - 1);
    const k = Math.sqrt(Math.max(0.05, 1 - u * u));
    for (let j = 0; j < per; j++) {
      const v = -spread + (2 * spread * j) / Math.max(1, per - 1) + (i % 2 ? spread / per : 0);
      if (Math.abs(v) > spread) continue;
      const x = c[0] + Math.sin(v) * r[0] * k * 1.01;
      const y = c[1] + Math.cos(v) * r[1] * k * 1.01;
      const z = c[2] + u * r[2];
      const sz = size * (0.75 + 0.25 * k) * (1 - Math.abs(v) * 0.18);
      m.sph(sz, cols[(i + j) % cols.length], [x, y, z], { s: [1.1, 0.34, 1.25], r: [-0.35 - u * 0.4, 0, -v], grit: 0.25 }, 1);
    }
  }
}

function paintedNeck(m: Mesher): void {
  m.ao = 0.1;
  m.tube(P_NECK, P_NECK_R, SCALE, { grit: 0.2 });
  // pale throat scutes down the front and a lighter, spined scale band down the back
  for (let i = 0; i < P_NECK.length - 1; i++) {
    const a = P_NECK[i];
    const b = P_NECK[i + 1];
    const tilt = Math.atan2(b[2] - a[2], b[1] - a[1]);
    const rr = (P_NECK_R[i] + P_NECK_R[i + 1]) / 2;
    for (const t of [0.25, 0.75]) {
      const y = a[1] + (b[1] - a[1]) * t;
      const z = a[2] + (b[2] - a[2]) * t;
      m.sph(rr * 0.62, BELLY, [0, y - Math.sin(tilt) * rr * 0.55, z + Math.cos(tilt) * rr * 0.72], { s: [1.25, 0.5, 0.55], r: [tilt, 0, 0], grit: 0.16 }, 1);
      m.sph(rr * 0.5, SCALE_L, [0, y + Math.sin(tilt) * rr * 0.6, z - Math.cos(tilt) * rr * 0.72], { s: [1.2, 0.55, 0.5], r: [tilt, 0, 0], grit: 0.25 }, 1);
      for (const s of [-1, 1]) m.sph(rr * 0.42, SCALE_D, [s * rr * 0.8, y, z], { s: [0.35, 0.8, 1.1], r: [tilt, 0, 0], grit: 0.25 }, 1);
    }
    m.spike([0, (a[1] + b[1]) / 2 + Math.sin(tilt) * rr * 0.85, (a[2] + b[2]) / 2 - Math.cos(tilt) * rr * 0.9], [0, 0.4, -1], 0.07, 0.022, i % 2 ? BRONZE : SCALE_L);
  }
  // ---- the head: a rounded skull, long tapering snout, heavy brows, swept horns, a curved frill
  m.push(P_HEAD, [0.2, 0, 0], [P_HEAD_S, P_HEAD_S, P_HEAD_S]);
  m.sph(0.075, SCALE, [0, 0.005, 0], { s: [1.2, 0.85, 1.2], grit: 0.18 }, 2); // braincase
  m.sph(0.07, SCALE, [0, -0.004, 0.1], { s: [0.95, 0.62, 1.55], grit: 0.18 }, 2); // snout
  m.sph(0.04, SCALE, [0, -0.01, 0.19], { s: [1.05, 0.7, 1.2], grit: 0.18 }, 1); // blunt muzzle tip
  m.sph(0.03, SCALE_L, [0, 0.042, 0.07], { s: [1.1, 0.4, 2.6], grit: 0.25 }, 1); // pale ridge (reads from above)
  m.sph(0.05, MAW, [0, -0.034, 0.11], { s: [1.05, 0.25, 1.6], flat: true }, 1); // gums under the lip
  for (const s of [-1, 1]) {
    m.sph(0.009, 0x0a0806, [s * 0.026, 0.02, 0.222], { flat: true }, 1); // nostrils
    m.sph(0.034, SCALE_D, [s * 0.05, 0.045, 0.04], { s: [0.9, 0.55, 1.5], r: [0.1, 0, s * 0.4], grit: 0.2 }, 1); // brow ridges
    for (let i = 0; i < 4; i++) m.spike([s * 0.047, -0.03, 0.06 + i * 0.042], [0, -1, 0.12], 0.036 + (i === 2 ? 0.026 : 0), 0.01, C.FANG, { flat: true }, 5); // upper fangs
    m.spike([s * 0.066, -0.012, -0.012], [s, -0.3, -0.35], 0.08, 0.02, SCALE_L); // cheek spurs
    m.sph(0.017, 0xffffff, [s * 0.056, 0.03, 0.074], { glow: true, s: [0.9, 0.6, 1.4], r: [0.2, s * 0.35, -s * 0.45] }, 1); // burning slit eyes
    m.horn([[s * 0.042, 0.048, -0.012], [s * 0.095, 0.095, -0.1], [s * 0.115, 0.115, -0.21]], 0.026, C.HORN_L, 0xc8b890);
    m.horn([[s * 0.07, 0.004, -0.04], [s * 0.15, 0.02, -0.105], [s * 0.2, 0.0, -0.18]], 0.017, C.HORN, C.HORN_L);
  }
  m.horn([[0, 0.058, 0.04], [0, 0.105, -0.03], [0, 0.125, -0.115]], 0.019, C.HORN, C.HORN_L); // nose-to-crest horn
  // the crest frill: a curved bronze fan behind the skull, ribbed with spines
  const fan: [number, number][] = [[0, 0], [0.08, 0.015], [0.1, 0.055], [0.075, 0.095], [0.025, 0.115], [-0.025, 0.115], [-0.075, 0.095], [-0.1, 0.055], [-0.08, 0.015]];
  m.membrane(fan, 0x3a3018, [0, 0.03, -0.05], { r: [-1.1, 0, 0], grit: 0.3 }, 0.12, 0.05, 5);
  for (let i = 0; i < 5; i++) {
    const a = -1.0 + i * 0.5;
    m.seg([0, 0.035, -0.05], [Math.sin(a) * 0.12, 0.03 + Math.cos(a) * 0.06, -0.05 - Math.cos(a) * 0.11], 0.011, 0.004, BRONZE, { flat: true });
  }
  m.pop();
}

function paintedJaw(m: Mesher): void {
  m.ao = 0;
  m.push([0, 0, 0], [0.2, 0, 0], [P_HEAD_S, P_HEAD_S, P_HEAD_S]);
  m.sph(0.055, SCALE_D, [0, -0.02, 0.1], { s: [1.0, 0.36, 2.0], grit: 0.2 }, 2);
  m.sph(0.045, MAW, [0, 0.002, 0.1], { s: [0.95, 0.2, 1.9], flat: true, blood: 0.35 }, 1); // tongue and gums
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) m.spike([s * 0.042, 0.0, 0.05 + i * 0.042], [0, 1, 0.1], 0.032 + (i === 1 ? 0.018 : 0), 0.009, C.FANG, { flat: true }, 5);
  m.sph(0.04, BELLY, [0, -0.035, 0.07], { s: [1.0, 0.35, 1.5] }, 1); // pale chin
  m.pop();
}

function paintedHydra(): QuadRig {
  const K = new Kit('hydra', 0xffb020, 2.4);
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.ao = 0.25;
    m.sph(0.5, SCALE, [0, 0.42, 0.1], { s: [0.84, 0.54, 0.66], grit: 0.18 }, 2); // massive shoulders
    m.sph(0.5, SCALE, [0, 0.4, -0.22], { s: [0.78, 0.5, 0.66], grit: 0.18 }, 2); // belly / hips
    m.sph(0.5, BELLY, [0, 0.27, -0.05], { s: [0.66, 0.2, 0.92], grit: 0.14 }, 2); // underbelly
    // overlapping scales over the back, bigger bronze-edged plates down the spine
    scaleCoat(m, [0, 0.42, -0.06], [0.4, 0.27, 0.52], 7, 7, 0.075, [SCALE, PLATE, SCALE_D]);
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const z = 0.3 - t * 0.78;
      const y = 0.69 - Math.abs(t - 0.35) * 0.16;
      m.sph(0.07, i % 2 ? PLATE : SCALE_L, [0, y, z], { s: [1.5, 0.42, 1.3], r: [-0.25, 0, 0], grit: 0.28 }, 1);
      m.spike([0, y + 0.02, z], [0, 1, -0.55], 0.08 + (1 - Math.abs(t - 0.35)) * 0.08, 0.03, i % 2 ? BRONZE : SCALE_L, {}, 6);
    }
    for (const s of [-1, 1]) m.spike([s * 0.36, 0.56, 0.2], [s, 0.6, 0.1], 0.12, 0.042, BRONZE); // shoulder horns
    // old scars and a fresh wound on one flank
    for (let i = 0; i < 3; i++) m.seg([0.4, 0.46 - i * 0.04, -0.06], [0.37, 0.4 - i * 0.04, -0.26], 0.009, 0.006, MAW, { blood: 1, flat: true });
    m.seg([-0.4, 0.52, 0.08], [-0.37, 0.44, -0.12], 0.007, 0.005, C.SCAR, { flat: true });
    // the collar where the three necks join the body, and the pale chest
    m.sph(0.5, SCALE, [0, 0.55, 0.32], { s: [0.7, 0.32, 0.34], grit: 0.18 }, 2);
    m.sph(0.5, BELLY, [0, 0.46, 0.44], { s: [0.46, 0.22, 0.14], grit: 0.18 }, 1);
    for (const s of [-1, 0, 1]) m.ring(0.095, 0.014, BRONZE_D, [s * 0.2, 0.58, 0.32], { flat: true }, Math.PI * 2, 10); // bronze neck bands
  });

  const head = new THREE.Group();
  const necks: { neck: THREE.Group; jaw: THREE.Group | null; yaw: number; crest: THREE.Group }[] = [];
  for (const n of P_NECKS) {
    const holder = new THREE.Group();
    holder.position.set(...n.at);
    holder.rotation.z = n.lean;
    holder.scale.setScalar(n.s);
    const g = K.limb('neck', [0, 0, 0], paintedNeck);
    g.rotation.y = n.yaw;
    const j = K.limb('jaw', P_HINGE, paintedJaw);
    g.add(j);
    const crest = new THREE.Group();
    crest.position.set(P_HEAD[0], P_HEAD[1] + 0.065 * P_HEAD_S, P_HEAD[2] - 0.01 * P_HEAD_S);
    crest.rotation.x = 0.2;
    g.add(crest);
    holder.add(g);
    head.add(holder);
    necks.push({ neck: g, jaw: j, yaw: n.yaw, crest });
  }

  const leg = (front: boolean, side: number) => (m: Mesher) => {
    // a sprawling, thick reptile leg ending in a rounded clawed foot
    m.ao = 0.2;
    const out = 0.12 * side;
    const fz = front ? 0.04 : -0.04;
    m.sph(0.14, SCALE, [0, -0.02, 0], { s: [1.1, 1, 1.2], grit: 0.18 }, 2);
    m.seg([0, 0, 0], [out, -0.13, fz], 0.13, 0.095, SCALE, { grit: 0.18 }, 10);
    m.sph(0.09, PLATE, [out, -0.13, fz], {}, 1);
    m.spike([out + 0.05 * side, -0.11, fz - 0.03], [side, 0.4, -0.6], 0.09, 0.028, BRONZE_D); // elbow spur
    m.seg([out, -0.13, fz], [out, -0.33, fz + 0.04], 0.09, 0.07, SCALE_D, { grit: 0.18 }, 10);
    for (let i = 0; i < 2; i++) m.sph(0.045, PLATE, [out, -0.18 - i * 0.07, fz + 0.075], { s: [1.3, 0.45, 0.6] }, 1); // shin scutes
    m.sph(0.1, SCALE_D, [out, -0.36, fz + 0.06], { s: [1.0, 0.42, 1.15] }, 2); // rounded foot
    for (const dx of [-0.06, -0.02, 0.02, 0.06]) m.horn([[out + dx, -0.37, fz + 0.13], [out + dx * 1.25, -0.385, fz + 0.2], [out + dx * 1.35, -0.405, fz + 0.24]], 0.019, C.CLAW, 0x9a8a68);
  };
  const legs = [
    K.limb('frontL', [0.29, 0.38, 0.2], leg(true, 1)),
    K.limb('frontR', [-0.29, 0.38, 0.2], leg(true, -1)),
    K.limb('backL', [0.29, 0.38, -0.34], leg(false, 1)),
    K.limb('backR', [-0.29, 0.38, -0.34], leg(false, -1)),
  ];

  const tail = K.limb('tail', [0, 0.38, -0.52], (m) => {
    // a heavy tail that sweeps back and curls round beside the body (a short footprint)
    m.ao = 0.2;
    const pts: V3[] = [[0, 0, 0], [0.04, -0.08, -0.22], [0.16, -0.18, -0.4], [0.36, -0.25, -0.46], [0.52, -0.29, -0.36], [0.58, -0.32, -0.2]];
    const r = [0.19, 0.15, 0.115, 0.085, 0.06, 0.04];
    m.tube(pts, r, SCALE, { grit: 0.22 });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const rr = (r[i] + r[i + 1]) / 2;
      m.sph(rr * 0.6, i % 2 ? PLATE : SCALE_L, [mid[0], mid[1] + rr * 0.8, mid[2]], { s: [1.2, 0.4, 1.3], grit: 0.28 }, 1); // back scales
      m.spike([mid[0], mid[1] + rr * 0.92, mid[2]], [0, 1, -0.4], 0.1 - i * 0.014, 0.026, i % 2 ? BRONZE : SCALE_D);
    }
    // a bony barbed club at the tip
    m.sph(0.06, C.HORN_L, [0.58, -0.32, -0.2], { s: [1, 0.8, 1.35] }, 1);
    for (const d of [[1, 0.3, 0.2], [0.3, 0.7, 0.5], [0.6, -0.2, 0.8], [0.2, 0.3, 1]] as V3[]) m.spike([0.58, -0.32, -0.2], d, 0.1, 0.024, 0xc8b890);
  });

  const rig = quadRig(K, { body, head, legs, tail }, hitbox(1.1, 1.4, 1.3), 1.7);
  rig.necks = necks;
  return rig;
}

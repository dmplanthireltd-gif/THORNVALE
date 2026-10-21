import type { EnemyKind } from '../../game/world/WorldMap';
import type { BipedRig, QuadRig, Rig } from './rigs';
import { bipedRig, C, hitbox, Kit, quadRig, type Mesher, type V3 } from './darkRigsCore';

/**
 * Dark models, batch (a): beasts of field, forest and ice — wolves, rat,
 * snake, deer, silver rabbit, bears and the dire penguin. Animals stay
 * animals: no glow on deer or rabbits, but texture, scars and blood.
 */

// ------------------------------------------------------------------ wolves

interface WolfPal { fur: number; furD: number; furL: number; gum: number; fang: number; scar: number; glow: number; frost?: number }

function wolfLike(kind: string, P: WolfPal): QuadRig {
  const K = new Kit(kind, P.glow, 1.8);
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, P.fur, [0, 0.6, 0.18], { s: [0.38, 0.44, 0.52], grit: 0.2 }); // deep chest
    m.sph(0.5, P.furD, [0, 0.47, 0.2], { s: [0.26, 0.2, 0.4] });
    m.sph(0.5, P.fur, [0, 0.6, -0.16], { s: [0.25, 0.23, 0.44], grit: 0.2 }); // tucked waist
    m.sph(0.5, P.fur, [0, 0.6, -0.36], { s: [0.32, 0.31, 0.3], grit: 0.2 }); // haunches
    // pale saddle over the back so the shape reads against the ground
    m.sph(0.5, P.furL, [0, 0.7, -0.02], { s: [0.24, 0.12, 0.6], grit: 0.25 });
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) m.box(0.018, 0.16, 0.022, P.furD, [s * 0.175, 0.56, 0.24 - i * 0.07], { r: [0, 0, s * 0.25] });
    // fresh claw wounds on the flank and shoulder
    for (let i = 0; i < 3; i++) m.box(0.016, 0.016, 0.22, P.scar, [0.16, 0.63 - i * 0.045, -0.06], { r: [0.4, 0, 0], blood: 1, flat: true });
    m.box(0.016, 0.16, 0.016, P.scar, [-0.185, 0.62, 0.22], { r: [0.4, 0, 0], blood: 1, flat: true });
    // raised hackles along the spine, pale-tipped
    for (let i = 0; i < 9; i++) {
      const z = 0.34 - i * 0.075;
      const h = 0.17 - Math.abs(i - 2) * 0.015;
      m.spike([0, 0.77 - Math.max(0, i - 3) * 0.02, z], [0, 1, -0.7], Math.max(0.07, h), 0.04, i % 2 ? P.furL : P.fur, {}, 3);
      if (i < 6) for (const s of [-1, 1]) m.spike([s * 0.07, 0.75, z], [s * 0.6, 1, -0.7], Math.max(0.06, h * 0.75), 0.034, i % 2 ? P.fur : P.furD, {}, 3);
      if (P.frost !== undefined && i % 2 === 0) m.spike([0, 0.78, z - 0.03], [0.2 * (i % 4 ? 1 : -1), 1, -0.5], h * 0.9, 0.022, P.frost, { flat: true }, 4);
    }
    m.seg([0, 0.66, 0.34], [0, 0.6, 0.6], 0.12, 0.1, P.fur);
    m.sph(0.11, P.furL, [0, 0.68, 0.4], { s: [1.2, 1, 1] });
  });
  const head = K.limb('head', [0, 0.58, 0.64], (m) => {
    m.ao = 0.1;
    m.push([0, 0, 0], [0, 0, 0], [1.18, 1.18, 1.18]);
    m.sph(0.14, P.fur, [0, 0, 0], { s: [1, 0.9, 1.15], grit: 0.2 });
    m.cyl(0.06, 0.085, 0.22, P.fur, [0, -0.02, 0.17], { r: [Math.PI / 2, 0, 0] });
    m.box(0.11, 0.022, 0.16, P.furD, [0, 0.04, 0.17], { r: [0.12, 0, 0] }); // snarl ridges
    m.box(0.1, 0.022, 0.1, P.furD, [0, 0.05, 0.12], { r: [0.4, 0, 0] });
    m.sph(0.032, 0x0e0c0a, [0, 0.0, 0.29]);
    m.box(0.13, 0.04, 0.2, P.gum, [0, -0.07, 0.17], { blood: 0.4, flat: true }); // raised lips, bare gums
    for (const x of [-0.05, 0.05]) m.spike([x, -0.06, 0.25], [0, -1, 0.25], 0.12, 0.026, P.fang, { flat: true });
    for (let i = 0; i < 4; i++) m.box(0.018, 0.022, 0.018, P.fang, [(i % 2 ? 1 : -1) * 0.045, -0.09, 0.12 + Math.floor(i / 2) * 0.05], { flat: true });
    m.push([0, -0.09, 0.07], [0.42, 0, 0]); // snapping lower jaw
    m.box(0.09, 0.035, 0.18, P.furD, [0, -0.03, 0.1], { blood: 0.6 });
    for (const x of [-0.04, 0.04]) m.spike([x, -0.015, 0.17], [0, 1, 0.2], 0.09, 0.022, P.fang, { flat: true });
    m.pop();
    m.eyes(0.068, 0.045, 0.125, 0.09, 0.055, 0.4); // big burning eyes
    m.box(0.24, 0.032, 0.05, P.furD, [0, 0.08, 0.11], { r: [0.3, 0, 0] }); // scowling brow
    m.box(0.014, 0.14, 0.014, P.scar, [0.075, 0.04, 0.13], { r: [0.3, 0, 0.3], flat: true }); // scar across the eye
    m.spike([0.08, 0.08, -0.04], [0.4, 0.6, -1], 0.16, 0.045, P.furD, {}, 3); // pinned-back ears
    m.spike([-0.08, 0.08, -0.04], [-0.4, 0.6, -1], 0.11, 0.045, P.furD, {}, 3); // torn ear
    m.sph(0.075, P.furL, [0, -0.06, -0.06], { s: [1.4, 1, 1], grit: 0.25 }); // ruff
    m.pop();
  });
  const front = (m: Mesher) => {
    m.sph(0.075, P.fur, [0, -0.02, 0], { s: [1, 1.4, 1.1] });
    m.seg([0, 0, 0], [0, -0.26, 0.02], 0.055, 0.038, P.fur);
    m.seg([0, -0.26, 0.02], [0, -0.48, 0.0], 0.033, 0.028, P.furD);
    m.sph(0.048, P.furD, [0, -0.5, 0.03], { s: [1, 0.55, 1.3] });
    for (const dx of [-0.025, 0, 0.025]) m.spike([dx, -0.51, 0.07], [0, -0.3, 1], 0.05, 0.011, C.CLAW);
  };
  const back = (m: Mesher) => {
    m.sph(0.095, P.fur, [0, -0.04, -0.02], { s: [0.8, 1.3, 1.2] });
    m.seg([0, 0, 0], [0, -0.22, 0.07], 0.065, 0.045, P.fur);
    m.seg([0, -0.22, 0.07], [0, -0.36, -0.07], 0.038, 0.032, P.furD);
    m.seg([0, -0.36, -0.07], [0, -0.49, -0.02], 0.03, 0.027, P.furD);
    m.sph(0.048, P.furD, [0, -0.5, 0.01], { s: [1, 0.55, 1.3] });
    for (const dx of [-0.025, 0, 0.025]) m.spike([dx, -0.51, 0.05], [0, -0.3, 1], 0.045, 0.011, C.CLAW);
  };
  const legs = [
    K.limb('front', [0.12, 0.52, 0.28], front),
    K.limb('front', [-0.12, 0.52, 0.28], front),
    K.limb('back', [0.12, 0.52, -0.34], back),
    K.limb('back', [-0.12, 0.52, -0.34], back),
  ];
  const tail = K.limb('tail', [0, 0.64, -0.5], (m) => {
    m.seg([0, 0, 0], [0, -0.14, -0.2], 0.055, 0.065, P.fur);
    m.seg([0, -0.14, -0.2], [0, -0.32, -0.3], 0.065, 0.035, P.furD);
    for (let i = 0; i < 5; i++) m.spike([0, -0.06 - i * 0.06, -0.1 - i * 0.045], [(i % 2 ? 1 : -1) * 0.5, -0.6, -1], 0.11, 0.034, i % 2 ? P.furL : P.furD, {}, 3);
  });
  return quadRig(K, { body, head, legs, tail }, hitbox(0.7, 1.15, 1.0), 1.25);
}

export function darkWolf(): QuadRig {
  return wolfLike('wolf', { fur: 0x6a645a, furD: 0x2a2723, furL: 0x9e9482, gum: 0x8a1a14, fang: 0xe8dcc0, scar: 0x8a1a14, glow: 0xffcc22 });
}

function darkWinterWolf(): QuadRig {
  return wolfLike('winter_wolf', { fur: 0xa8b4bc, furD: 0x4a5866, furL: 0xe4ecf0, gum: 0x8a1a1c, fang: 0xf0f0e8, scar: 0x8a1a1c, glow: 0x7adcff, frost: 0xc8f0ff });
}

// ------------------------------------------------------------------ rat

function darkRat(): QuadRig {
  const K = new Kit('rat', 0xff2a14, 1.6);
  const FUR = 0x5e5040;
  const FUR_D = 0x2e261e;
  const FUR_L = 0x8a7a64;
  const SKIN = 0xa07068;
  const SORE = 0x7a2418;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, FUR, [0, 0.24, -0.06], { s: [0.32, 0.27, 0.44], grit: 0.25 }); // bloated rump
    m.sph(0.5, FUR, [0, 0.26, 0.12], { s: [0.25, 0.23, 0.26], grit: 0.25 }); // shoulders
    m.sph(0.5, FUR_L, [0, 0.33, -0.02], { s: [0.2, 0.1, 0.42], grit: 0.3 }); // hunched pale back
    m.sph(0.5, FUR_D, [0, 0.16, 0.0], { s: [0.24, 0.12, 0.44] }); // belly
    // mange: raw sores and bald patches
    m.sph(0.045, SORE, [0.14, 0.27, -0.1], { s: [0.4, 1, 1.2], blood: 0.6, flat: true });
    m.sph(0.035, SKIN, [-0.14, 0.24, 0.04], { s: [0.4, 1, 1.3], flat: true });
    m.sph(0.03, SORE, [-0.12, 0.3, -0.16], { s: [0.5, 1, 1], blood: 0.8, flat: true });
    // bristling tufts along the spine
    for (let i = 0; i < 7; i++) m.spike([0, 0.37 - Math.abs(i - 3) * 0.012, 0.16 - i * 0.06], [(i % 2 ? 0.3 : -0.3), 1, -0.8], 0.08, 0.025, i % 2 ? FUR_D : FUR_L, {}, 3);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) m.box(0.012, 0.09, 0.014, FUR_D, [s * 0.13, 0.25, 0.1 - i * 0.05], { r: [0, 0, s * 0.3] }); // ribs
  });
  const head = K.limb('head', [0, 0.27, 0.27], (m) => {
    m.ao = 0.08;
    m.push([0, 0, 0], [0, 0, 0], [1.25, 1.25, 1.25]);
    m.sph(0.09, FUR, [0, 0, 0], { s: [1, 0.85, 1.15], grit: 0.25 });
    m.cone(0.06, 0.15, FUR, [0, -0.015, 0.13], { r: [Math.PI / 2, 0, 0] }, 6);
    m.sph(0.022, SKIN, [0, -0.01, 0.21], { flat: true }); // nose
    // long yellow gnawing teeth
    m.box(0.016, 0.055, 0.014, 0xe0c048, [0.01, -0.06, 0.18], { flat: true });
    m.box(0.016, 0.055, 0.014, 0xe0c048, [-0.01, -0.06, 0.18], { flat: true, blood: 0.5 });
    m.box(0.05, 0.02, 0.06, C.GUM, [0, -0.04, 0.15], { flat: true });
    m.eyes(0.045, 0.03, 0.075, 0.035, 0.03, 0.3);
    m.box(0.12, 0.018, 0.03, FUR_D, [0, 0.05, 0.07], { r: [0.3, 0, 0] });
    // ears: one round, one torn
    m.sph(0.04, SKIN, [0.065, 0.07, -0.02], { s: [1, 1, 0.35], grit: 0.2 });
    m.sph(0.034, SKIN, [-0.065, 0.065, -0.02], { s: [0.8, 0.7, 0.35], grit: 0.2 });
    m.box(0.02, 0.02, 0.02, FUR_D, [-0.07, 0.09, -0.02]);
    for (const s of [-1, 1]) for (const a of [-0.25, 0.15]) m.box(0.12, 0.005, 0.005, 0x1a1612, [s * 0.06, -0.01, 0.17], { r: [0, -s * 0.4, a], flat: true }); // whiskers
    m.pop();
  });
  const leg = (front: boolean) => (m: Mesher) => {
    const h = front ? 0.17 : 0.2;
    m.sph(0.05, FUR, [0, -0.02, 0], { s: [1, 1.4, 1.2] });
    m.seg([0, 0, 0], [0, -h + 0.03, front ? 0.03 : -0.03], 0.03, 0.02, FUR_D);
    m.box(0.05, 0.02, 0.07, SKIN, [0, -h + 0.01, 0.02]);
    for (const dx of [-0.016, 0, 0.016]) m.spike([dx, -h + 0.01, 0.05], [0, -0.2, 1], 0.035, 0.007, C.CLAW);
  };
  const legs = [
    K.limb('front', [0.08, 0.17, 0.14], leg(true)),
    K.limb('front', [-0.08, 0.17, 0.14], leg(true)),
    K.limb('back', [0.1, 0.2, -0.17], leg(false)),
    K.limb('back', [-0.1, 0.2, -0.17], leg(false)),
  ];
  const tail = K.limb('tail', [0, 0.22, -0.34], (m) => {
    const pts: V3[] = [[0, 0, 0], [0, -0.08, -0.16], [0.04, -0.15, -0.34], [0.12, -0.18, -0.5], [0.2, -0.17, -0.62]];
    m.horn(pts, 0.032, SKIN, 0x7a5248, { grit: 0.2 });
    for (let i = 1; i < 4; i++) m.sph(0.03 * (1 - i / 5) + 0.006, 0x6a4840, pts[i], {}, 0); // ring bands
  });
  return quadRig(K, { body, head, legs, tail }, hitbox(0.7, 0.7, 0.8), 0.75);
}

// ------------------------------------------------------------------ snake

function darkSnake(): QuadRig {
  const K = new Kit('snake', 0xffd040, 1.0);
  const SC = 0x4a5a26;
  const SC_D = 0x22281a;
  const BAND = 0x8a7a3a;
  const BELLY = 0xb8a868;
  const coil = (m: Mesher, pts: V3[], r0: number, r1: number) => {
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const ra = r0 + (r1 - r0) * (i / n);
      const rb = r0 + (r1 - r0) * ((i + 1) / n);
      const c = i % 3 === 1 ? BAND : i % 3 === 2 ? SC_D : SC;
      m.seg(pts[i], pts[i + 1], ra, rb, c, { grit: 0.3 }, 7);
      m.sph(rb * 1.02, c, pts[i + 1], { grit: 0.3 }, 1);
      // diamond markings along the back
      m.box(rb * 0.9, 0.01, rb * 0.9, i % 2 ? SC_D : BAND, [pts[i + 1][0], pts[i + 1][1] + rb * 0.98, pts[i + 1][2]], { r: [0, 0.78, 0], flat: true });
    }
  };
  const body = K.limb('body', [0, 0, 0], (m) => {
    // raised neck rising out of a coil on the ground
    coil(m, [[0.0, 0.07, -0.12], [0.16, 0.07, -0.02], [0.14, 0.07, 0.14], [0.0, 0.08, 0.2], [-0.08, 0.16, 0.24], [-0.02, 0.28, 0.28], [0, 0.34, 0.31]], 0.085, 0.06);
    m.sph(0.08, BELLY, [0.0, 0.03, 0.04], { s: [2.2, 0.4, 2.0] }); // pale underside of the coil
    // shed skin hanging off the neck
    m.box(0.07, 0.08, 0.01, 0x8a8460, [-0.07, 0.2, 0.24], { r: [0.3, 0.5, 0.2], two: true, grit: 0.3 });
  });
  const head = K.limb('head', [0, 0.36, 0.33], (m) => {
    m.ao = 0.05;
    m.push([0, 0, 0], [0.15, 0, 0], [1.3, 1.3, 1.3]);
    m.sph(0.075, SC, [0, 0, 0.02], { s: [1.25, 0.65, 1.45], grit: 0.25 }); // wedge-shaped viper head
    m.box(0.13, 0.025, 0.07, SC_D, [0, 0.035, 0.0], { grit: 0.2 });
    for (const s of [-1, 1]) m.box(0.04, 0.025, 0.05, SC_D, [s * 0.05, 0.04, 0.06], { r: [0, 0, s * 0.35] }); // brow scales
    // bright yellow eyes with slit pupils
    for (const s of [-1, 1]) {
      m.sph(0.022, 0xf0d040, [s * 0.058, 0.02, 0.06], { flat: true }, 0);
      m.box(0.006, 0.03, 0.01, 0x0a0806, [s * 0.064, 0.02, 0.078], { flat: true });
    }
    // gaping mouth with fangs and a forked tongue
    m.push([0, -0.025, 0.02], [0.55, 0, 0]);
    m.box(0.1, 0.02, 0.1, SC_D, [0, -0.02, 0.05]);
    m.box(0.08, 0.008, 0.08, 0xa02a28, [0, -0.008, 0.05], { flat: true });
    m.pop();
    for (const s of [-1, 1]) m.spike([s * 0.035, -0.02, 0.1], [0, -1, 0.3], 0.06, 0.008, 0xf0ece0, { flat: true });
    m.box(0.008, 0.006, 0.1, 0xc02020, [0, -0.04, 0.14], { r: [0.4, 0, 0], flat: true });
    for (const s of [-1, 1]) m.box(0.006, 0.006, 0.04, 0xc02020, [s * 0.01, -0.06, 0.2], { r: [0.4, s * 0.4, 0], flat: true });
    m.pop();
  });
  const tail = K.limb('tail', [0, 0, -0.12], (m) => {
    coil(m, [[0, 0.07, 0], [-0.18, 0.065, -0.1], [-0.2, 0.06, -0.3], [-0.02, 0.05, -0.42], [0.16, 0.045, -0.5], [0.22, 0.04, -0.66]], 0.085, 0.02);
    m.spike([0.22, 0.04, -0.66], [0.3, 0.1, -1], 0.08, 0.02, 0x8a7a50); // rattle-like tip
  });
  return quadRig(K, { body, head, legs: [], tail }, hitbox(0.7, 0.7, 0.8), 0.62);
}

// ------------------------------------------------------------------ deer

function darkDeer(): QuadRig {
  const K = new Kit('deer', 0xffffff, 1);
  const FUR = 0x7a5232;
  const FUR_D = 0x40281a;
  const FUR_L = 0xd8c4a0;
  const ANT = 0xc4ac84;
  const ANT_D = 0x6a5038;
  const HOOF = 0x1e1612;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, FUR, [0, 0.8, 0.12], { s: [0.34, 0.38, 0.44], grit: 0.18 }); // chest
    m.sph(0.5, FUR, [0, 0.82, -0.18], { s: [0.32, 0.34, 0.5], grit: 0.18 }); // barrel
    m.sph(0.5, FUR_L, [0, 0.68, -0.05], { s: [0.26, 0.16, 0.62] }); // pale belly
    m.sph(0.5, FUR_L, [0, 0.84, -0.42], { s: [0.24, 0.24, 0.12] }); // white rump patch
    m.sph(0.5, FUR_D, [0, 0.98, -0.08], { s: [0.12, 0.06, 0.76] }); // dark stripe along the spine
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) m.box(0.012, 0.12, 0.012, FUR_D, [s * 0.17, 0.82, 0.12 - i * 0.09], { r: [0, 0, s * 0.2] }); // lean ribs
    // a hunter's broken arrow in the haunch, blood running down
    m.seg([0.15, 0.86, -0.3], [0.32, 1.02, -0.36], 0.009, 0.009, C.WOOD);
    for (const a of [-0.5, 0.5]) m.box(0.004, 0.05, 0.03, 0x8a8478, [0.31, 1.02, -0.36], { r: [0, a, 0.7], flat: true, two: true });
    m.box(0.02, 0.14, 0.03, C.GUM, [0.16, 0.8, -0.3], { blood: 1, flat: true });
    // neck rising to the head, with a pale throat
    m.tube([[0, 0.9, 0.26], [0, 1.04, 0.4], [0, 1.14, 0.48]], [0.12, 0.09, 0.075], FUR, { grit: 0.18 });
    m.sph(0.07, FUR_L, [0, 1.0, 0.43], { s: [0.9, 1.3, 0.6] });
  });
  const head = K.limb('head', [0, 1.18, 0.52], (m) => {
    m.ao = 0.05;
    m.sph(0.085, FUR, [0, 0, 0], { s: [1, 1, 1.2], grit: 0.15 });
    m.cyl(0.04, 0.065, 0.17, FUR, [0, -0.03, 0.12], { r: [Math.PI / 2 + 0.25, 0, 0] });
    m.sph(0.034, 0x14100c, [0, -0.06, 0.2], { s: [1.1, 0.8, 0.8], flat: true }); // wet nose
    m.box(0.07, 0.02, 0.05, FUR_L, [0, -0.08, 0.16], { flat: true }); // pale chin
    for (const s of [-1, 1]) {
      m.sph(0.022, 0x0c0806, [s * 0.065, 0.015, 0.05], { flat: true }, 0); // big dark eyes
      m.box(0.008, 0.008, 0.008, 0xe8e0d0, [s * 0.07, 0.025, 0.07], { flat: true });
      m.sph(0.045, FUR, [s * 0.09, 0.07, -0.04], { s: [0.7, 1.4, 0.4], r: [0, 0, -s * 0.8], grit: 0.2 }); // ears
      m.sph(0.03, FUR_L, [s * 0.095, 0.07, -0.025], { s: [0.5, 1.2, 0.3], r: [0, 0, -s * 0.8] });
      // branching antlers
      const b: V3[] = [[s * 0.04, 0.07, -0.03], [s * 0.12, 0.17, -0.07], [s * 0.2, 0.3, -0.06], [s * 0.24, 0.44, -0.02], [s * 0.22, 0.56, 0.04]];
      m.horn(b, 0.022, ANT_D, ANT);
      m.horn([b[1], [s * 0.13, 0.25, 0.04], [s * 0.12, 0.31, 0.09]], 0.012, ANT, ANT);
      m.horn([b[2], [s * 0.24, 0.38, 0.06], [s * 0.25, 0.44, 0.11]], 0.011, ANT, ANT);
      m.horn([b[3], [s * 0.32, 0.52, -0.02], [s * 0.36, 0.58, -0.02]], 0.01, ANT, ANT);
    }
  });
  const front = (m: Mesher) => {
    m.sph(0.07, FUR, [0, -0.05, 0], { s: [0.9, 1.6, 1.1] });
    m.seg([0, 0, 0], [0, -0.34, 0.03], 0.05, 0.03, FUR);
    m.sph(0.028, FUR_D, [0, -0.34, 0.03]);
    m.seg([0, -0.34, 0.03], [0, -0.64, 0.01], 0.022, 0.018, FUR_D);
    m.box(0.04, 0.05, 0.05, HOOF, [0, -0.66, 0.02]);
  };
  const back = (m: Mesher) => {
    m.sph(0.09, FUR, [0, -0.06, -0.02], { s: [0.8, 1.6, 1.2] });
    m.seg([0, 0, 0], [0, -0.3, 0.07], 0.06, 0.035, FUR);
    m.seg([0, -0.3, 0.07], [0, -0.44, -0.06], 0.03, 0.025, FUR_D);
    m.seg([0, -0.44, -0.06], [0, -0.64, -0.02], 0.022, 0.018, FUR_D);
    m.box(0.04, 0.05, 0.05, HOOF, [0, -0.66, -0.01]);
  };
  const legs = [
    K.limb('front', [0.1, 0.68, 0.18], front),
    K.limb('front', [-0.1, 0.68, 0.18], front),
    K.limb('back', [0.1, 0.68, -0.3], back),
    K.limb('back', [-0.1, 0.68, -0.3], back),
  ];
  const tail = K.limb('tail', [0, 0.92, -0.46], (m) => {
    m.sph(0.05, FUR_D, [0, -0.02, -0.02], { s: [0.8, 1.3, 0.6] });
    m.sph(0.045, 0xf0ece4, [0, -0.04, -0.04], { s: [0.8, 1.2, 0.5], flat: true });
  });
  return quadRig(K, { body, head, legs, tail }, hitbox(0.7, 1.5, 0.95), 1.85);
}

// ------------------------------------------------------------------ silver rabbit

function darkRabbit(): QuadRig {
  const K = new Kit('silver_rabbit', 0xffffff, 1);
  const FUR = 0x9aa0aa;
  const FUR_D = 0x4e545e;
  const FUR_L = 0xe2e6ec;
  const PINK = 0xb08890;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, FUR, [0, 0.22, -0.04], { s: [0.3, 0.3, 0.38], grit: 0.22 }); // crouched body
    m.sph(0.5, FUR, [0, 0.24, -0.16], { s: [0.32, 0.3, 0.26], grit: 0.22 }); // big haunches
    m.sph(0.5, FUR_L, [0, 0.14, 0.02], { s: [0.22, 0.14, 0.32] }); // white belly
    m.sph(0.5, FUR_D, [0, 0.35, -0.08], { s: [0.16, 0.06, 0.3], grit: 0.3 }); // darker back
    // silver-tipped fur tufts
    for (let i = 0; i < 6; i++) m.spike([(i % 2 ? 0.05 : -0.05), 0.34, 0.06 - i * 0.05], [(i % 2 ? 0.4 : -0.4), 1, -0.9], 0.05, 0.02, i % 2 ? FUR_L : FUR, {}, 3);
    for (const s of [-1, 1]) m.spike([s * 0.15, 0.22, -0.18], [s, 0.3, -0.5], 0.05, 0.02, FUR_L, {}, 3);
    m.box(0.012, 0.012, 0.08, C.SCAR, [0.15, 0.27, -0.06], { r: [0.3, 0, 0], flat: true }); // old scratch
  });
  const head = K.limb('head', [0, 0.32, 0.17], (m) => {
    m.ao = 0.05;
    m.push([0, 0, 0], [0, 0, 0], [1.15, 1.15, 1.15]);
    m.sph(0.085, FUR, [0, 0, 0], { s: [1, 0.95, 1.15], grit: 0.2 });
    for (const s of [-1, 1]) m.sph(0.04, FUR_L, [s * 0.035, -0.035, 0.07], { s: [1, 0.9, 0.9] }); // cheeks
    m.sph(0.016, PINK, [0, -0.015, 0.1], { flat: true });
    m.box(0.024, 0.024, 0.01, 0xf4f0e8, [0, -0.06, 0.09], { flat: true }); // incisors
    for (const s of [-1, 1]) {
      m.sph(0.022, 0x0c0808, [s * 0.058, 0.02, 0.05], { flat: true }, 0);
      m.box(0.008, 0.008, 0.008, 0xf0f0f0, [s * 0.062, 0.03, 0.068], { flat: true });
      for (const a of [-0.2, 0.15]) m.box(0.09, 0.004, 0.004, 0x2a2a2a, [s * 0.05, -0.03, 0.08], { r: [0, -s * 0.4, a], flat: true });
    }
    // long ears laid back; the left one notched
    for (const s of [-1, 1]) {
      m.push([s * 0.035, 0.06, -0.03], [-0.55, 0, -s * 0.18]);
      m.sph(0.04, FUR, [0, 0.12, 0], { s: [0.75, 3.2, 0.4], grit: 0.2 });
      m.sph(0.026, PINK, [0, 0.12, 0.012], { s: [0.75, 3.6, 0.3] });
      if (s > 0) m.box(0.03, 0.025, 0.03, FUR_D, [0.025, 0.17, 0], { r: [0, 0, 0.6] });
      m.pop();
    }
    m.pop();
  });
  const front = (m: Mesher) => {
    m.seg([0, 0, 0], [0, -0.11, 0.03], 0.03, 0.022, FUR);
    m.box(0.04, 0.02, 0.06, FUR_L, [0, -0.115, 0.04]);
  };
  const back = (m: Mesher) => {
    m.sph(0.06, FUR, [0, -0.04, 0], { s: [0.9, 1.3, 1.5] });
    m.box(0.05, 0.03, 0.16, FUR_L, [0, -0.145, 0.05]); // long hind feet
  };
  const legs = [
    K.limb('front', [0.06, 0.12, 0.12], front),
    K.limb('front', [-0.06, 0.12, 0.12], front),
    K.limb('back', [0.1, 0.16, -0.12], back),
    K.limb('back', [-0.1, 0.16, -0.12], back),
  ];
  const tail = K.limb('tail', [0, 0.25, -0.28], (m) => {
    m.sph(0.06, FUR_L, [0, 0, -0.02], { grit: 0.3, flat: true });
  });
  return quadRig(K, { body, head, legs, tail }, hitbox(0.7, 0.7, 0.8), 0.78);
}

// ------------------------------------------------------------------ bears

interface BearPal { fur: number; furD: number; furL: number; muzzle: number; blood: number }

function bearLike(kind: string, P: BearPal): QuadRig {
  const K = new Kit(kind, 0xffffff, 1);
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, P.fur, [0, 0.64, 0.14], { s: [0.66, 0.64, 0.58], grit: 0.2 }); // chest
    m.sph(0.5, P.fur, [0, 0.62, -0.26], { s: [0.6, 0.58, 0.56], grit: 0.2 }); // rump
    m.sph(0.5, P.furL, [0, 0.9, 0.16], { s: [0.48, 0.3, 0.4], grit: 0.22 }); // shoulder hump
    m.sph(0.5, P.furD, [0, 0.42, -0.04], { s: [0.5, 0.24, 0.8] }); // belly
    // shaggy fur over the back and flanks
    for (let i = 0; i < 9; i++) {
      const z = 0.3 - i * 0.075;
      for (const s of [-1, 0, 1]) m.spike([s * 0.16, 0.9 - Math.abs(s) * 0.08 - Math.abs(i - 2) * 0.008, z], [s * 0.6, 0.7, -1], 0.12, 0.05, (i + s) % 2 ? P.fur : P.furD, { grit: 0.3 }, 3);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) m.spike([s * 0.3, 0.52, 0.28 - i * 0.14], [s, -0.6, -0.2], 0.11, 0.045, P.furD, {}, 3);
    // old claw scars and blood matted on the chest
    for (let i = 0; i < 3; i++) m.box(0.014, 0.014, 0.24, C.SCAR, [0.33, 0.72 - i * 0.05, -0.2], { r: [0.35, 0.1, 0], flat: true });
    m.sph(0.14, P.furL, [0, 0.58, 0.42], { s: [1.2, 1.4, 0.5], blood: P.blood });
    // neck
    m.seg([0, 0.78, 0.3], [0, 0.72, 0.52], 0.2, 0.17, P.fur, { grit: 0.2 });
  });
  const head = K.limb('head', [0, 0.72, 0.6], (m) => {
    m.ao = 0.1;
    m.sph(0.2, P.fur, [0, 0.02, 0], { s: [1.05, 0.9, 1], grit: 0.2 });
    m.box(0.16, 0.12, 0.2, P.muzzle, [0, -0.04, 0.2], { grit: 0.15, blood: P.blood * 0.6 });
    m.sph(0.045, 0x0c0a08, [0, 0.0, 0.31], { s: [1.3, 0.8, 0.8], flat: true }); // nose
    m.box(0.26, 0.05, 0.08, P.furD, [0, 0.09, 0.12], { r: [0.3, 0, 0] }); // heavy brow
    for (const s of [-1, 1]) {
      m.sph(0.026, 0x1a0e08, [s * 0.085, 0.05, 0.16], { flat: true }, 0); // small mean eyes
      m.box(0.022, 0.012, 0.01, 0xc08030, [s * 0.085, 0.055, 0.183], { flat: true });
      m.sph(0.06, P.fur, [s * 0.15, 0.17, -0.04], { s: [1, 1, 0.5], grit: 0.2 }); // round ears
      m.sph(0.035, P.furD, [s * 0.15, 0.17, -0.02], { s: [1, 1, 0.3] });
    }
    // snarling open jaw, fangs and gore
    m.box(0.15, 0.03, 0.14, C.GUM, [0, -0.1, 0.2], { blood: 0.6, flat: true });
    for (const s of [-1, 1]) {
      m.spike([s * 0.055, -0.08, 0.28], [0, -1, 0.1], 0.07, 0.018, C.FANG, { flat: true });
      m.spike([s * 0.05, -0.15, 0.25], [0, 1, 0.15], 0.06, 0.016, C.FANG, { flat: true });
    }
    m.push([0, -0.12, 0.06], [0.35, 0, 0]);
    m.box(0.14, 0.05, 0.2, P.muzzle, [0, -0.03, 0.12], { blood: P.blood });
    m.pop();
    m.box(0.012, 0.14, 0.012, C.SCAR, [-0.07, 0.07, 0.17], { r: [0.3, 0, -0.4], flat: true });
  });
  const leg = (front: boolean) => (m: Mesher) => {
    const h = front ? 0.56 : 0.6;
    m.sph(0.15, P.fur, [0, -0.06, 0], { s: [0.9, 1.4, 1.1], grit: 0.2 });
    m.seg([0, 0, 0], [0, -h + 0.08, front ? 0.04 : -0.02], 0.12, 0.1, P.fur, { grit: 0.2 });
    m.seg([0, -h * 0.5, 0], [0, -h + 0.06, 0.02], 0.1, 0.1, P.furD);
    m.box(0.2, 0.08, 0.24, P.furD, [0, -h + 0.04, 0.06], { blood: front ? P.blood * 0.5 : 0 });
    for (const dx of [-0.06, -0.02, 0.02, 0.06]) m.spike([dx, -h + 0.04, 0.17], [0, -0.4, 1], 0.1, 0.018, 0xc8bca0, { flat: true, blood: front ? P.blood : 0 });
  };
  const legs = [
    K.limb('front', [0.2, 0.56, 0.26], leg(true)),
    K.limb('front', [-0.2, 0.56, 0.26], leg(true)),
    K.limb('back', [0.2, 0.6, -0.34], leg(false)),
    K.limb('back', [-0.2, 0.6, -0.34], leg(false)),
  ];
  const tail = K.limb('tail', [0, 0.72, -0.52], (m) => {
    m.sph(0.07, P.furD, [0, 0, -0.02], { grit: 0.3 });
  });
  return quadRig(K, { body, head, legs, tail }, hitbox(1.0, 1.1, 1.05), 1.3);
}

function darkBear(): QuadRig {
  return bearLike('bear', { fur: 0x5a3c22, furD: 0x2a1a10, furL: 0x7a5432, muzzle: 0x8a6a48, blood: 0.35 });
}

function darkPolarBear(): QuadRig {
  return bearLike('polar_bear', { fur: 0xd4ccb8, furD: 0x8a8270, furL: 0xece6d6, muzzle: 0xc8bea8, blood: 0.55 });
}

// ------------------------------------------------------------------ dire penguin

function darkPenguin(): BipedRig {
  const K = new Kit('dire_penguin', 0xff3020, 1.4);
  const BLACK = 0x1c2028;
  const BLACK_L = 0x3a4250;
  const WHITE = 0xd8d8d0;
  const BEAK = 0xc87828;
  const FROST = 0xc8eaf8;
  const leg = (side: number) => (m: Mesher) => {
    m.seg([0, 0, 0], [0, -0.07, 0.02], 0.04, 0.03, 0x4a3a2a);
    m.box(0.13, 0.03, 0.17, 0x8a5020, [0, -0.1, 0.06], { grit: 0.2 });
    for (const dx of [-0.045, 0, 0.045]) m.spike([dx, -0.1, 0.14], [0, -0.3, 1], 0.06, 0.012, C.CLAW);
    m.spike([side * 0.05, -0.1, -0.02], [side * 0.4, 0, -1], 0.05, 0.01, C.CLAW);
  };
  const legL = K.limb('legL', [0.1, 0.12, 0], leg(1));
  const legR = K.limb('legR', [-0.1, 0.12, 0], leg(-1));
  const torso = K.limb('torso', [0, 0.12, 0], (m) => {
    m.ao = 0.15;
    m.sph(0.3, BLACK, [0, 0.32, -0.02], { s: [1, 1.35, 0.95], grit: 0.2 });
    m.sph(0.25, WHITE, [0, 0.29, 0.07], { s: [0.95, 1.22, 0.82], grit: 0.18, blood: 0.18 }); // blood-spattered breast
    m.sph(0.1, C.GUM, [0.06, 0.4, 0.26], { s: [1.2, 0.8, 0.3], blood: 1, flat: true });
    // ragged feathers and frost crust on the back and shoulders
    for (let i = 0; i < 6; i++) m.spike([(i % 3 - 1) * 0.12, 0.5 - Math.floor(i / 3) * 0.18, -0.25], [(i % 3 - 1) * 0.3, -0.4, -1], 0.08, 0.035, BLACK_L, {}, 3);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) m.spike([s * (0.14 + i * 0.04), 0.66 - i * 0.03, -0.04], [s * 0.3, 1, -0.2], 0.06, 0.02, FROST, { flat: true });
    m.box(0.012, 0.18, 0.012, C.SCAR, [-0.12, 0.34, 0.26], { r: [0.2, 0, 0.5], flat: true });
  });
  const head = K.limb('head', [0, 0.82, 0.02], (m) => {
    m.ao = 0.05;
    m.push([0, 0, 0], [-0.15, 0, 0], [1.1, 1.1, 1.1]);
    m.sph(0.19, BLACK, [0, 0, 0], { s: [1, 1, 1.05], grit: 0.15 });
    for (const s of [-1, 1]) m.sph(0.09, WHITE, [s * 0.085, 0.03, 0.13], { s: [0.8, 0.9, 0.5] });
    // angry red-ringed eyes under a hard brow
    m.eyes(0.08, 0.035, 0.18, 0.06, 0.035, 0.45);
    m.box(0.32, 0.045, 0.06, BLACK, [0, 0.085, 0.15], { r: [0.2, 0, 0] });
    // heavy hooked beak, serrated
    m.cone(0.06, 0.2, BEAK, [0, -0.04, 0.27], { r: [Math.PI / 2, 0, 0] }, 5);
    m.spike([0, -0.02, 0.34], [0, -1, 0.4], 0.06, 0.02, 0x5a3010);
    m.push([0, -0.08, 0.17], [0.3, 0, 0]);
    m.cone(0.045, 0.16, 0x9a5a1a, [0, 0, 0.06], { r: [Math.PI / 2, 0, 0] }, 5);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) m.spike([s * 0.025, 0.02, 0.0 + i * 0.04], [0, 1, 0.2], 0.03, 0.008, 0xece0c0, { flat: true });
    m.pop();
    m.box(0.07, 0.02, 0.09, C.GUM, [0, -0.06, 0.25], { blood: 1, flat: true });
    m.pop();
  });
  const arm = (side: number) => (m: Mesher) => {
    m.push([0, 0, 0], [0, 0, side * 0.3]);
    m.box(0.05, 0.38, 0.15, BLACK, [0, -0.17, 0], { grit: 0.2 });
    m.box(0.052, 0.3, 0.05, WHITE, [-side * 0.002, -0.17, 0.06], { grit: 0.2 });
    // jagged trailing edge, like blades
    for (let i = 0; i < 4; i++) m.spike([0, -0.06 - i * 0.08, -0.07], [0, -0.5, -1], 0.06, 0.02, BLACK_L, { blood: side < 0 ? 0.3 : 0 }, 3);
    m.spike([0, -0.36, 0], [0, -1, 0.2], 0.08, 0.04, BLACK, {}, 4);
    m.pop();
  };
  const armL = K.limb('armL', [0.3, 0.62, 0], arm(1));
  const armR = K.limb('armR', [-0.3, 0.62, 0], arm(-1));
  return bipedRig(K, { torso, head, armL, armR, legL, legR }, hitbox(0.6, 1.0, 0.6), 1.15, -0.2);
}

export const DARK_BEASTS: Partial<Record<EnemyKind, () => Rig>> = {
  wolf: darkWolf,
  winter_wolf: darkWinterWolf,
  rat: darkRat,
  snake: darkSnake,
  deer: darkDeer,
  silver_rabbit: darkRabbit,
  bear: darkBear,
  polar_bear: darkPolarBear,
  dire_penguin: darkPenguin,
};

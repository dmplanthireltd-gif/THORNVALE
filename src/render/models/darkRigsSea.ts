import type * as THREE from 'three';
import type { EnemyKind } from '../../game/world/WorldMap';
import type { BipedRig, QuadRig, Rig } from './rigs';
import { bipedRig, C, empty, hitbox, Kit, quadRig, type Mesher, type V3 } from './darkRigsCore';
import { arm, belt, leg, man, strips } from './darkRigsParts';

/**
 * Dark realistic models for the Sunken Reach (game/world/sea.ts): two jellies,
 * the ironshell crab, three deepfins (raider, harpooner, tidecaller) and the
 * gloom eel. Ulmaroth, the Drowned Tyrant reuses the raider (BOSS_LOOK in rigs.ts).
 * Muted, wet, barnacled colours; light only from bioluminescence and the eyes.
 */

// ------------------------------------------------------------------ jellies (floating bipeds)

interface JellyLook { kind: string; bell: number; bellD: number; frill: number; glow: number }

function darkJelly(L: JellyLook): BipedRig {
  const K = new Kit(L.kind, L.glow, 2.2);
  // the bell: a ribbed dome with glowing radial canals and a lantern organ inside
  const torso = K.limb('torso', [0, 1.0, 0], (m) => {
    m.ao = 0.05;
    m.sph(0.42, L.bell, [0, 0.16, 0], { s: [1, 0.62, 1], grit: 0.18 });
    m.sph(0.36, L.bellD, [0, 0.07, 0], { s: [1, 0.42, 1], grit: 0.1 }); // dark hollow under the dome
    m.sph(0.13, 0xffffff, [0, 0.14, 0], { glow: true }, 1); // the lantern organ
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      // canals run from the crown down to the rim
      m.box(0.02, 0.018, 0.34, 0xffffff, [Math.sin(a) * 0.2, 0.33, Math.cos(a) * 0.2], { r: [0.62 * -Math.cos(a), a, 0], glow: true, s: [1, 1, 1] });
      m.ring(0.05, 0.012, L.bellD, [Math.sin(a) * 0.3, 0.27, Math.cos(a) * 0.3], { r: [0, a, 0.9] }, Math.PI, 5); // ribs
      // scalloped rim frill
      m.box(0.13, 0.08, 0.02, L.frill, [Math.sin(a + 0.4) * 0.41, 0.04, Math.cos(a + 0.4) * 0.41], { r: [0.35, a + 0.4, 0], two: true, grit: 0.25 });
    }
    // a few torn scars where something has fed on it
    m.box(0.12, 0.02, 0.04, L.bellD, [0.18, 0.3, 0.2], { r: [0.4, 0.7, 0.2], flat: true });
  });
  const head = K.limb('head', [0, 1.36, 0], (m) => {
    // the crown of the bell: bright spots like distant lanterns
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      m.sph(0.03, 0xffffff, [Math.sin(a) * 0.12, 0.02, Math.cos(a) * 0.12], { glow: true }, 0);
    }
    m.sph(0.09, L.bell, [0, 0, 0], { s: [1, 0.45, 1], grit: 0.15 });
  });
  // trailing tentacles (legs) and two frilled stinging arms (arms)
  const tentacles = (seed: number) => (m: Mesher) => {
    for (let i = 0; i < 4; i++) {
      const a = seed + i * 1.6;
      const x0 = Math.sin(a) * 0.1, z0 = Math.cos(a) * 0.1;
      const pts: V3[] = [];
      for (let k = 0; k <= 5; k++) pts.push([x0 + Math.sin(k * 1.3 + a) * 0.05, -k * 0.17, z0 + Math.cos(k * 1.1 + a) * 0.05]);
      m.horn(pts, 0.022, L.frill, L.bellD, { grit: 0.2 });
      m.sph(0.018, 0xffffff, pts[3], { glow: true }, 0);
    }
  };
  const legL = K.limb('legL', [0.16, 1.02, -0.06], tentacles(0.3));
  const legR = K.limb('legR', [-0.16, 1.02, -0.06], tentacles(2.1));
  const oral = (m: Mesher) => {
    // a ruffled curtain hanging from the rim, nettle-cells glowing along its edge
    for (let k = 0; k < 7; k++) {
      const y = -0.06 - k * 0.11;
      m.box(0.1 - k * 0.006, 0.12, 0.02, L.frill, [Math.sin(k * 1.7) * 0.03, y, 0], { r: [0, k * 0.6, Math.sin(k) * 0.3], two: true, grit: 0.25 });
      m.sph(0.016, 0xffffff, [0.05, y, 0.01], { glow: true }, 0);
    }
  };
  const armL = K.limb('armL', [0.2, 1.04, 0.12], oral);
  const armR = K.limb('armR', [-0.2, 1.04, 0.12], oral);
  return bipedRig(K, { torso, head, armL, armR, legL, legR }, hitbox(0.8, 1.4, 0.8), 1.5, 0, true);
}

// ------------------------------------------------------------------ ironshell crab (quad)

function darkCrab(): QuadRig {
  const K = new Kit('ironshell_crab', 0xffa040, 1.8);
  const SH = 0x4a3428;
  const SH_L = 0x6e4c34;
  const SH_D = 0x24180f;
  const BELLY = 0x8a7a64;
  const BARN = 0xa8a090;
  const ALGAE = 0x3a5034;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.ao = 0.32;
    // a broad armoured carapace, ridged and spiked at the front edge
    m.sph(0.5, SH, [0, 0.44, -0.02], { s: [0.66, 0.22, 0.52], grit: 0.32 });
    m.sph(0.5, SH_L, [0, 0.5, 0.0], { s: [0.46, 0.13, 0.36], grit: 0.3 });
    m.sph(0.5, BELLY, [0, 0.34, -0.02], { s: [0.56, 0.12, 0.42], grit: 0.2 });
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + i * 0.3;
      m.spike([Math.sin(a) * 0.3, 0.46, Math.cos(a) * 0.24 - 0.02], [Math.sin(a), 0.3, Math.cos(a)], 0.1, 0.03, SH_D);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) m.box(0.16, 0.015, 0.02, SH_D, [s * (0.08 + i * 0.07), 0.55 - i * 0.02, -0.08 + i * 0.05], { r: [0, s * 0.5, 0], flat: true });
    // barnacles and weed grown over the old shell
    for (const [x, z, r] of [[0.14, -0.12, 0.04], [0.2, -0.06, 0.03], [-0.16, -0.15, 0.045], [-0.08, -0.2, 0.03], [0.05, -0.22, 0.035], [-0.22, 0.02, 0.03]] as const) {
      m.cyl(r * 0.6, r, r * 1.1, BARN, [x, 0.55, z], { grit: 0.3 }, 6);
      m.cyl(r * 0.3, r * 0.3, 0.012, C.SOCKET, [x, 0.55 + r * 0.56, z], { flat: true }, 6);
    }
    for (const [x, z] of [[-0.05, -0.05], [0.24, 0.1], [-0.26, -0.1]] as const) m.sph(0.06, ALGAE, [x, 0.53, z], { s: [1.4, 0.3, 1], grit: 0.4 });
  });
  const head = K.limb('head', [0, 0.42, 0.24], (m) => {
    // mouthparts and stalked glowing eyes
    m.box(0.16, 0.08, 0.06, SH_D, [0, -0.02, 0.04], { grit: 0.3 });
    for (let i = 0; i < 4; i++) m.box(0.025, 0.06, 0.012, BELLY, [-0.045 + i * 0.03, -0.06, 0.07], { r: [0.3, 0, 0] });
    for (const s of [-1, 1]) {
      m.seg([s * 0.05, 0.03, 0.04], [s * 0.07, 0.14, 0.08], 0.016, 0.014, SH);
      m.sph(0.03, 0xffffff, [s * 0.07, 0.15, 0.09], { glow: true }, 0);
    }
    // two great claws, the right one bigger; open pincers with serrated edges
    for (const s of [-1, 1]) {
      const big = s < 0 ? 1.25 : 0.95;
      m.push([s * 0.2, -0.02, 0.02], [0, s * 0.35, 0]);
      m.seg([0, 0, 0], [s * 0.12, 0.02, 0.14], 0.05, 0.045, SH, { grit: 0.3 });
      m.sph(0.05, SH_D, [s * 0.12, 0.02, 0.14], {}, 0);
      m.seg([s * 0.12, 0.02, 0.14], [s * 0.1, 0.03, 0.3], 0.05 * big, 0.06 * big, SH_L, { grit: 0.3 });
      m.push([s * 0.1, 0.03, 0.32], [0, 0, 0], [big, big, big]);
      m.sph(0.1, SH, [0, 0, 0.05], { s: [0.8, 0.72, 1.25], grit: 0.32 });
      m.spike([0, 0.02, 0.15], [s * -0.15, 0.25, 1], 0.2, 0.04, SH_D); // upper (fixed) finger
      m.spike([0, -0.04, 0.12], [s * 0.1, -0.35, 1], 0.17, 0.035, SH_D, { blood: 0.3 }); // lower finger, gaping
      for (let i = 0; i < 3; i++) m.spike([0, 0, 0.12 + i * 0.04], [0, -1, 0.3], 0.03, 0.01, BARN, { flat: true });
      m.pop();
      m.pop();
    }
  });
  const legs: THREE.Group[] = [];
  const legZ = [0.12, 0.02, -0.08, -0.18];
  for (let p = 0; p < 4; p++) for (const s of [1, -1]) {
    const g = K.limb('leg' + p, [s * 0.26, 0.4, legZ[p]], (m) => {
      m.seg([0, 0, 0], [0.24, 0.14, 0], 0.04, 0.034, SH, { grit: 0.3 });
      m.sph(0.035, SH_D, [0.24, 0.14, 0], {}, 0);
      m.seg([0.24, 0.14, 0], [0.4, -0.38, 0], 0.03, 0.012, SH_L, { grit: 0.3 });
      m.spike([0.4, -0.38, 0], [0.1, -1, 0], 0.05, 0.012, SH_D);
    });
    g.rotation.y = s > 0 ? -(0.55 - p * 0.36) : Math.PI + (0.55 - p * 0.36);
    legs.push(g);
  }
  return quadRig(K, { body, head, legs, tail: empty([0, 0.4, -0.3]) }, hitbox(1.0, 0.8, 1.0), 0.9);
}

// ------------------------------------------------------------------ deepfins (fish-folk bipeds)

const DF = 0x2c4648;
const DF_D = 0x162426;
const DF_L = 0x52726a;
const BELLY = 0x8a957e;
const FIN = 0x4a2632;
const SHELL = 0x8a7656;
const CORAL = 0x9a3a2e;
const KELP = 0x2c3c1c;
const PEARL = 0xe8e2d4;

interface FinOpt { eye: number; crest?: number; fat?: number }

function finHead(o: FinOpt, extra?: (m: Mesher) => void) {
  return (m: Mesher): void => {
    m.ao = 0.1;
    m.push([0, 0, 0.03], [-0.12, 0, 0], [1.12, 1.12, 1.12]);
    // a broad flat fish skull, the mouth a wide downturned slit full of needles
    m.sph(0.17, DF, [0, 0.02, 0.0], { s: [1.08, 0.82, 1.2], grit: 0.28 });
    m.sph(0.15, BELLY, [0, -0.06, 0.05], { s: [1, 0.5, 1.05], grit: 0.2 });
    m.box(0.26, 0.03, 0.1, C.MOUTH, [0, -0.06, 0.16], { r: [0.12, 0, 0], flat: true });
    for (let i = 0; i < 7; i++) {
      const x = -0.11 + i * 0.037;
      m.spike([x, -0.045, 0.19], [0, -1, 0.15], 0.045, 0.008, C.FANG, { flat: true });
      m.spike([x + 0.018, -0.08, 0.18], [0, 1, 0.15], 0.035, 0.007, C.FANG, { flat: true });
    }
    // big round eyes set to the sides, glowing pale in the dark water
    for (const s of [-1, 1]) {
      m.sph(0.06, DF_D, [s * 0.13, 0.05, 0.08], { flat: true }, 1);
      m.sph(0.048, o.eye, [s * 0.15, 0.05, 0.1], { glow: true }, 1);
      m.box(0.012, 0.05, 0.012, 0x050808, [s * 0.18, 0.05, 0.13], { flat: true });
    }
    // gill slits and a spined crest fin along the skull
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) m.box(0.008, 0.07, 0.03, DF_D, [s * 0.17, -0.03, -0.03 - i * 0.04], { flat: true });
    m.poly([[0, 0], [0.08, 0.18], [0.16, 0.14], [0.26, 0.16], [0.34, 0.04], [0.3, -0.02]], o.crest ?? FIN, [0, 0.1, 0.1], { r: [0, Math.PI / 2, 0], grit: 0.3 });
    for (let i = 0; i < 4; i++) m.spike([0, 0.12, 0.08 - i * 0.08], [0, 1, -0.4], 0.16 - i * 0.02, 0.01, DF_D, { flat: true }, 3);
    // drooping barbels at the chin
    for (const s of [-1, 1]) m.horn([[s * 0.08, -0.09, 0.15], [s * 0.1, -0.16, 0.18], [s * 0.09, -0.25, 0.14]], 0.012, DF_D, DF_L);
    extra?.(m);
    m.pop();
  };
}

function finTorso(o: { wear?: (m: Mesher) => void; hunch?: number }) {
  return (m: Mesher): void => {
    m.push([0, 0, 0], [o.hunch ?? 0.12, 0, 0]);
    m.box(0.42, 0.52, 0.28, DF, [0, 0.3, 0], { grit: 0.28 });
    m.box(0.3, 0.46, 0.03, BELLY, [0, 0.28, 0.14], { grit: 0.2 });
    // scale rows on the flanks
    for (let r = 0; r < 5; r++) for (const s of [-1, 1]) m.box(0.03, 0.05, 0.22, r % 2 ? DF_D : DF_L, [s * 0.215, 0.1 + r * 0.1, 0], { grit: 0.3 });
    // a dorsal fin down the spine, torn and spined
    m.poly([[0, 0], [0.12, 0.2], [0.3, 0.26], [0.42, 0.18], [0.52, 0.22], [0.6, 0.0]], FIN, [0, 0.6, -0.12], { r: [0, Math.PI / 2, -1.5], grit: 0.3 });
    for (let i = 0; i < 5; i++) m.spike([0, 0.58 - i * 0.11, -0.15], [0, 0.3, -1], 0.18, 0.012, DF_D, { flat: true }, 3);
    // a short fish tail behind
    m.horn([[0, 0.05, -0.12], [0, -0.06, -0.3], [0, -0.14, -0.42]], 0.07, DF, DF_D);
    m.poly([[0, 0], [-0.12, -0.14], [0.12, -0.14]], FIN, [0, -0.14, -0.44], { r: [0.4, Math.PI / 2, 0] });
    o.wear?.(m);
    m.pop();
  };
}

function finArm(o: { weapon?: (m: Mesher) => void; off?: (m: Mesher) => void; bracer?: number }) {
  return (m: Mesher, side: number): void => {
    arm(m, side, { upper: DF, fore: DF_L, hand: DF_D, shoulder: DF, bracer: o.bracer, w: 0.13 });
    // a fin along the forearm and webbed, clawed fingers
    m.poly([[0, 0], [0.08, -0.04], [0.06, -0.2], [0, -0.22]], FIN, [side * 0.065, -0.24, -0.02], { r: [0, side * Math.PI / 2, 0] });
    for (const dx of [-0.035, 0, 0.035]) m.spike([dx, -0.52, 0.04], [0, -1, 0.35], 0.07, 0.01, C.CLAW);
    m.box(0.1, 0.06, 0.01, FIN, [0, -0.54, 0.04], { r: [0.3, 0, 0], two: true });
    if (side < 0 && o.weapon) { m.push([0, -0.46, 0.04]); o.weapon(m); m.pop(); }
    if (side > 0 && o.off) o.off(m);
  };
}

function finLeg(m: Mesher, side: number, L: number): void {
  leg(m, side, L, { thigh: DF, shin: DF_D, claws: C.CLAW, wraps: KELP, w: 0.15 });
  // webbed feet
  m.poly([[0, 0], [0.09, 0.14], [-0.09, 0.14]], FIN, [0, -L + 0.02, 0.06], { r: [-Math.PI / 2, 0, 0] });
}

/** A trident: barbed tines with coral grown over the haft. */
function wTrident(m: Mesher, len = 1.45): void {
  m.cyl(0.022, 0.026, len, C.WOOD_D, [0, 0, len / 2 - 0.4], { r: [Math.PI / 2, 0, 0], grit: 0.3 });
  m.push([0, 0, len - 0.4]);
  m.box(0.22, 0.04, 0.05, C.RUST, [0, 0, 0], { grit: 0.3 });
  for (const x of [-0.1, 0, 0.1]) {
    m.spike([x, 0, 0.02], [x * 0.6, 0, 1], x === 0 ? 0.32 : 0.26, 0.026, C.IRON, { blood: 0.3 });
    m.spike([x + (x >= 0 ? 0.012 : -0.012), 0, 0.12], [x >= 0 ? 1 : -1, 0, -1.2], 0.06, 0.012, C.IRON);
  }
  m.pop();
  for (const z of [0.3, 0.62]) m.sph(0.04, CORAL, [0.02, 0.01, z], { s: [1, 0.8, 1.3], grit: 0.4 });
  m.sph(0.03, BELLY, [-0.02, 0.0, 0.48], { grit: 0.4 });
}

/** A turtle-shell shield on the forearm. */
function shTurtle(m: Mesher): void {
  m.push([0.13, -0.34, 0.1], [0, -0.6, 1.0], [1.5, 1.5, 1.5]);
  m.sph(0.26, 0x3e4a2a, [0, 0, 0], { s: [1, 0.24, 1.2], grit: 0.3 });
  for (const [x, z] of [[0, 0], [0.12, 0.1], [-0.12, 0.1], [0.12, -0.12], [-0.12, -0.12], [0, 0.2], [0, -0.22]] as const) m.box(0.08, 0.02, 0.08, 0x5a6a3a, [x, 0.06, z], { r: [0, 0.78, 0], grit: 0.25 });
  m.ring(0.26, 0.018, SHELL, [0, 0, 0], { s: [1, 1, 1.2] }, Math.PI * 2, 12);
  m.cyl(0.03, 0.04, 0.05, BELLY, [0.08, 0.07, -0.05], {}, 6); // a barnacle
  m.pop();
}

function darkDeepfinRaider(): BipedRig {
  const K = new Kit('deepfin_raider', 0xd8ff7a, 1.9);
  return man(K, {
    bulk: 1.06,
    leg: finLeg,
    torso: finTorso({
      wear: (m) => {
        // a breastplate of lashed shells, a kelp-rope belt hung with teeth
        for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) m.sph(0.07, r % 2 ? SHELL : 0x6a5a40, [-0.1 + i * 0.1 + (r % 2) * 0.05, 0.3 + r * 0.08, 0.16], { s: [1, 0.8, 0.35], grit: 0.3 });
        belt(m, 0.46, 0.32, 0.06, KELP, PEARL);
        for (const x of [-0.12, -0.04, 0.05, 0.13]) m.spike([x, 0.02, 0.17], [0, -1, 0.1], 0.07, 0.014, C.FANG);
        m.sph(0.12, SHELL, [0.25, 0.5, 0], { s: [1.1, 0.55, 1.1], grit: 0.35 }); // a giant cockle pauldron
        for (let i = 0; i < 4; i++) m.box(0.012, 0.02, 0.2, 0x5a4a34, [0.2 + i * 0.03, 0.55, 0], { r: [0, 0, 0.5], flat: true });
        strips(m, [[-0.12, 0.3, 0.16], [0.0, 0.36, 0.17], [0.12, 0.28, 0.16]], KELP, 0.04);
      },
    }),
    head: finHead({ eye: 0xffffff }),
    arm: finArm({ weapon: (m) => wTrident(m), off: shTurtle, bracer: SHELL }),
    height: 1.85,
  });
}

function darkDeepfinHarpooner(): BipedRig {
  const K = new Kit('deepfin_harpooner', 0xd8ff7a, 1.9);
  return man(K, {
    bulk: 0.94,
    leg: finLeg,
    torso: finTorso({
      wear: (m) => {
        belt(m, 0.44, 0.3, 0.06, KELP, SHELL);
        // a sling of spare harpoons across the back and a coil of line at the hip
        for (let i = 0; i < 3; i++) {
          m.cyl(0.012, 0.012, 0.9, C.WOOD, [-0.12 + i * 0.06, 0.42, -0.18], { r: [0.2, 0, 0.6] });
          m.spike([-0.12 + i * 0.06 + 0.26, 0.78, -0.1], [0.6, 0.8, 0.2], 0.12, 0.02, C.IRON);
        }
        m.ring(0.08, 0.02, 0x8a7a5a, [0.22, 0.05, 0.05], { r: [0, 0, 1.4] }, Math.PI * 2, 10);
        m.box(0.06, 0.62, 0.03, KELP, [0, 0.32, 0.15], { r: [0, 0, -0.6] }); // sling strap
        strips(m, [[-0.1, 0.26, 0.15], [0.1, 0.3, 0.15]], 0x3a2a24, 0.04);
      },
    }),
    head: finHead({ eye: 0xffffff, crest: 0x5a3a2a }, (m) => {
      m.sph(0.15, 0x3a2a24, [0, 0.1, -0.02], { s: [1.05, 0.4, 1.1], grit: 0.3 }); // a sharkskin cap
    }),
    arm: finArm({
      weapon: (m) => {
        m.cyl(0.02, 0.022, 1.5, C.WOOD, [0, 0, 0.35], { r: [Math.PI / 2, 0, 0], grit: 0.3 });
        m.spike([0, 0, 1.1], [0, 0, 1], 0.26, 0.05, C.IRON, { blood: 0.4 });
        for (const s of [-1, 1]) m.spike([s * 0.03, 0, 1.16], [s * 0.7, 0, -1], 0.12, 0.016, C.IRON);
        m.ring(0.05, 0.012, 0x8a7a5a, [0, 0, 0.95], { r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 8);
      },
    }),
    height: 1.8,
  });
}

function darkDeepfinTidecaller(): BipedRig {
  const K = new Kit('deepfin_tidecaller', 0x7af0ff, 2.2);
  return man(K, {
    leg: finLeg,
    torso: finTorso({
      hunch: 0.32,
      wear: (m) => {
        // a long robe of kelp and sharkskin, strung with shells and pearls
        m.box(0.46, 0.4, 0.31, 0x2a3424, [0, 0.12, 0], { grit: 0.35 });
        strips(m, [[-0.16, 0.6, 0.16], [-0.06, 0.66, 0.17], [0.05, 0.62, 0.17], [0.15, 0.58, 0.16], [-0.14, 0.6, -0.15], [0.0, 0.7, -0.16], [0.14, 0.62, -0.15]], KELP, 0.12);
        for (let i = 0; i < 7; i++) {
          const a = -1.1 + i * 0.37;
          m.sph(0.024, i % 2 ? PEARL : SHELL, [Math.sin(a) * 0.16, 0.5 - Math.cos(a) * 0.08, 0.17], { flat: true }, 0);
        }
        m.sph(0.04, 0xffffff, [0, 0.42, 0.19], { glow: true }, 1); // a glowing pearl at the throat
      },
    }),
    head: finHead({ eye: 0xffffff, crest: 0x2a4a5a }, (m) => {
      // a crown of spiral shells and coral
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        m.cone(0.035, 0.16, i % 2 ? SHELL : CORAL, [Math.sin(a) * 0.14, 0.15, Math.cos(a) * 0.06 - 0.02], { r: [0, 0, -Math.sin(a) * 0.4] }, 6);
      }
    }),
    arm: finArm({
      weapon: (m) => {
        // a driftwood staff topped by a caged glowing pearl
        m.cyl(0.024, 0.03, 1.5, 0x5a4a38, [0, 0.52, 0.04], { grit: 0.35 });
        m.sph(0.07, 0xffffff, [0, 1.3, 0.04], { glow: true }, 1);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          m.horn([[Math.sin(a) * 0.03, 1.2, 0.04 + Math.cos(a) * 0.03], [Math.sin(a) * 0.1, 1.3, 0.04 + Math.cos(a) * 0.1], [Math.sin(a) * 0.03, 1.42, 0.04 + Math.cos(a) * 0.03]], 0.014, 0x5a4a38, CORAL);
        }
        m.cone(0.04, 0.14, SHELL, [0, -0.25, 0.04], { r: [Math.PI, 0, 0] }, 6);
      },
      bracer: KELP,
    }),
    height: 1.75,
  });
}

// ------------------------------------------------------------------ gloom eel (quad, legless)

function darkEel(): QuadRig {
  const K = new Kit('gloom_eel', 0x7affd8, 2.0);
  const SK = 0x1c2830;
  const SK_D = 0x0c1216;
  const BELLY2 = 0x4a5a58;
  const FIN2 = 0x2a2030;
  const spots = (m: Mesher, a: V3, b: V3, n: number, r: number) => {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      for (const s of [-1, 1]) m.sph(0.016, 0xffffff, [a[0] + (b[0] - a[0]) * t + s * r, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], { glow: true }, 0);
    }
  };
  // the front half rises from the floor as it swims
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.tube([[0, 0.5, 0.36], [0, 0.48, 0.14], [0, 0.42, -0.08], [0, 0.34, -0.24]], [0.12, 0.13, 0.12, 0.11], SK, { grit: 0.22 });
    m.sph(0.1, BELLY2, [0, 0.4, 0.12], { s: [1, 0.6, 2.4] });
    spots(m, [0, 0.5, 0.34], [0, 0.36, -0.22], 5, 0.11);
    m.poly([[0, 0], [0.2, 0.1], [0.42, 0.08], [0.6, 0.0]], FIN2, [0, 0.6, 0.3], { r: [0, Math.PI / 2, -0.1], grit: 0.3 });
  });
  const head = K.limb('head', [0, 0.52, 0.42], (m) => {
    m.ao = 0.08;
    m.push([0, 0, 0], [-0.1, 0, 0], [1.15, 1.15, 1.15]);
    m.sph(0.12, SK, [0, 0.02, 0.06], { s: [1, 0.85, 1.6], grit: 0.25 });
    m.sph(0.1, BELLY2, [0, -0.04, 0.1], { s: [0.95, 0.5, 1.5] });
    // a gaping underslung jaw with hooked teeth
    m.push([0, -0.05, 0.02], [0.45, 0, 0]);
    m.box(0.16, 0.04, 0.24, SK_D, [0, -0.03, 0.12], { grit: 0.25 });
    m.box(0.12, 0.012, 0.18, C.GUM, [0, -0.006, 0.12], { flat: true });
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) m.spike([s * 0.06, 0, 0.04 + i * 0.045], [0, 1, 0.3], 0.05, 0.009, C.FANG, { flat: true });
    m.pop();
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) m.spike([s * 0.065, -0.04, 0.06 + i * 0.045], [0, -1, 0.2], 0.045, 0.008, C.FANG, { flat: true });
    // small pale eyes and a glowing lure lobe
    m.eyes(0.08, 0.06, 0.14, 0.035, 0.02, 0.2);
    m.sph(0.028, 0xffffff, [0, 0.12, 0.08], { glow: true }, 0);
    m.pop();
  });
  // the long tail swings behind, a ribbon fin along its whole length
  const tail = K.limb('tail', [0, 0.32, -0.26], (m) => {
    const pts: V3[] = [[0, 0, 0], [0.08, -0.06, -0.26], [0.02, -0.12, -0.54], [-0.1, -0.16, -0.8], [-0.08, -0.2, -1.06], [0.06, -0.22, -1.3]];
    m.tube(pts, [0.11, 0.1, 0.085, 0.07, 0.05, 0.03], SK, { grit: 0.22 });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      m.poly([[0, 0], [0.12, 0.09], [0.28, 0.07], [0.3, 0]], FIN2, [a[0], a[1] + 0.06, a[2]], { r: [0, Math.atan2(-(b[0] - a[0]), -(b[2] - a[2])) + Math.PI / 2, 0], grit: 0.3 });
      spots(m, a, b, 2, 0.08 - i * 0.012);
    }
    m.poly([[0, 0], [-0.1, -0.16], [0.1, -0.16]], FIN2, [0.06, -0.2, -1.34], { r: [0.3, Math.PI / 2, 0] });
  });
  return quadRig(K, { body, head, legs: [], tail }, hitbox(0.7, 0.9, 1.4), 0.95);
}

export const DARK_SEA: Partial<Record<EnemyKind, () => Rig>> = {
  lantern_jelly: () => darkJelly({ kind: 'lantern_jelly', bell: 0x6a8296, bellD: 0x24323e, frill: 0x8aa4b4, glow: 0x7ad8ff }),
  blight_jelly: () => darkJelly({ kind: 'blight_jelly', bell: 0x6a6a46, bellD: 0x2a2a1a, frill: 0x8a7a5a, glow: 0xa8ff4a }),
  ironshell_crab: darkCrab,
  deepfin_raider: darkDeepfinRaider,
  deepfin_harpooner: darkDeepfinHarpooner,
  deepfin_tidecaller: darkDeepfinTidecaller,
  gloom_eel: darkEel,
};

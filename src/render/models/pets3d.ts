import * as THREE from 'three';
import { Kit, type Mesher, type V3 } from './darkRigsCore';
import type { PetId } from '../../game/pets/petDefs';

/**
 * Pet models: small low-poly companions in the dark realistic style of the monsters (muted,
 * gritty natural colours, merged vertex-coloured limbs from darkRigsCore), made cute by big heads,
 * round bodies and bright, friendly eyes. Each pet is one rig with pivots for the idle / walk
 * (and, for birds, flight) animation in `animatePet`. Limb geometry is cached per pet kind and
 * shared by every instance; each instance owns two materials.
 *
 * Pets face +Z like every rig; 1 unit = 1 tile.
 */
export interface PetRig {
  id: PetId;
  root: THREE.Group;
  /** Bobs and sways (and flies, for birds). */
  body: THREE.Group;
  head: THREE.Group;
  /** Front-left, front-right, back-left, back-right (birds: two feet). */
  legs: THREE.Group[];
  tail: THREE.Group | null;
  wings: THREE.Group[];
  /** Flies at this height above the ground (0 = walks). */
  fly: number;
  materials: THREE.Material[];
  /** Height of the top of the head (labels, sizing). */
  height: number;
}

const EYE = 0x1a1410;
/** Friendly eye: dark glossy ball with a warm glint (glows a little so it reads through the pixel pass). */
function eyes(m: Mesher, x: number, y: number, z: number, r: number, glint = 0xfff0c8): void {
  for (const s of [-1, 1]) {
    m.sph(r, EYE, [s * x, y, z], { flat: true, grit: 0 }, 1);
    m.sph(r * 0.38, glint, [s * x + s * r * 0.25, y + r * 0.35, z + r * 0.75], { glow: true }, 0);
  }
}

function rig(id: PetId, K: Kit, parts: { body: THREE.Group; head: THREE.Group; legs: THREE.Group[]; tail?: THREE.Group | null; wings?: THREE.Group[] }, height: number, fly = 0): PetRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(parts.body, parts.head, ...parts.legs, ...(parts.tail ? [parts.tail] : []), ...(parts.wings ?? []));
  for (const l of parts.legs) l.userData.rest = l.rotation.x;
  return { id, root, body, head: parts.head, legs: parts.legs, tail: parts.tail ?? null, wings: parts.wings ?? [], fly, materials: K.materials, height };
}

// ------------------------------------------------------------------ tortoise

function tortoise(): PetRig {
  const K = new Kit('pet_tortoise', 0xffe0a0, 1.2);
  const SHELL = 0x5a5236;
  const SHELL_D = 0x2e2a1c;
  const SHELL_L = 0x8a7a4e;
  const MOSS = 0x4a6a2a;
  const SKIN = 0x6e7650;
  const SKIN_D = 0x3a4028;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, SHELL, [0, 0.2, 0], { s: [0.5, 0.36, 0.58], grit: 0.2 }); // dome
    m.ring(0.25, 0.035, SHELL_D, [0, 0.16, 0], { s: [1, 1, 1.18] }); // rim
    m.sph(0.5, SKIN_D, [0, 0.12, 0], { s: [0.46, 0.12, 0.54] }); // belly plate
    // scute plates on the dome
    const plates: V3[] = [[0, 0.37, 0], [0, 0.35, 0.12], [0, 0.35, -0.12], [0.11, 0.33, 0.06], [-0.11, 0.33, 0.06], [0.11, 0.33, -0.07], [-0.11, 0.33, -0.07]];
    for (const p of plates) m.cyl(0.06, 0.07, 0.025, SHELL_L, p, { r: [Math.atan2(p[2], 0.5) * 0.6, 0, -Math.atan2(p[0], 0.5) * 0.8], grit: 0.25 }, 6);
    // moss tufts and a little sprout (cute)
    for (const [x, z] of [[0.08, -0.14], [-0.12, 0.02], [0.04, 0.16]]) m.sph(0.045, MOSS, [x, 0.36, z], { s: [1, 0.5, 1], grit: 0.3 }, 0);
    m.seg([0.02, 0.38, 0.02], [0.03, 0.47, 0.03], 0.008, 0.006, 0x5a7a2a);
    m.sph(0.03, 0x7aa83a, [0.05, 0.47, 0.03], { s: [1.4, 0.4, 0.8], r: [0, 0, -0.4] }, 0);
    m.sph(0.026, 0x7aa83a, [0.0, 0.48, 0.04], { s: [1.4, 0.4, 0.8], r: [0, 0, 0.5] }, 0);
    // the pouch: a leather bag strapped to the right of the shell
    m.box(0.12, 0.12, 0.14, 0x5a4028, [0.25, 0.2, -0.02], { grit: 0.2 });
    m.box(0.13, 0.04, 0.15, 0x3a2a1c, [0.25, 0.27, -0.02]);
    m.sph(0.016, 0xb08a34, [0.32, 0.24, -0.02], { flat: true }, 0);
    m.box(0.02, 0.02, 0.36, 0x3a2a1c, [0.17, 0.3, -0.02], { r: [0, 0, 0.5] }); // strap
  });
  const head = K.limb('head', [0, 0.17, 0.3], (m) => {
    m.seg([0, -0.02, -0.08], [0, 0.03, 0.02], 0.05, 0.045, SKIN);
    m.sph(0.075, SKIN, [0, 0.06, 0.07], { s: [1, 0.9, 1.15], grit: 0.18 });
    m.box(0.09, 0.012, 0.05, SKIN_D, [0, 0.02, 0.13]); // smiling beak line
    eyes(m, 0.045, 0.085, 0.12, 0.022);
  });
  const leg = (m: Mesher) => {
    m.cyl(0.045, 0.05, 0.12, SKIN, [0, -0.04, 0], { grit: 0.2 }, 6);
    for (const dx of [-0.02, 0, 0.02]) m.sph(0.014, 0x2a2418, [dx, -0.1, 0.04], {}, 0);
  };
  const legs = [
    K.limb('leg', [0.17, 0.12, 0.17], leg), K.limb('leg', [-0.17, 0.12, 0.17], leg),
    K.limb('leg', [0.17, 0.12, -0.17], leg), K.limb('leg', [-0.17, 0.12, -0.17], leg),
  ];
  const tail = K.limb('tail', [0, 0.12, -0.3], (m) => m.spike([0, 0, 0], [0, -0.3, -1], 0.08, 0.025, SKIN));
  return rig('tortoise', K, { body, head, legs, tail }, 0.5);
}

// ------------------------------------------------------------------ fox

function fox(): PetRig {
  const K = new Kit('pet_fox', 0xffd070, 1.3);
  const FUR = 0xa8541e;
  const FUR_D = 0x5a2a10;
  const WHITE = 0xe0d6c4;
  const SOCK = 0x221a14;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, FUR, [0, 0.28, -0.02], { s: [0.24, 0.22, 0.46], grit: 0.2 });
    m.sph(0.5, WHITE, [0, 0.24, 0.13], { s: [0.17, 0.18, 0.18], grit: 0.15 }); // chest ruff
    m.sph(0.5, FUR_D, [0, 0.36, -0.04], { s: [0.14, 0.06, 0.36], grit: 0.25 }); // darker back
  });
  const head = K.limb('head', [0, 0.38, 0.2], (m) => {
    m.sph(0.1, FUR, [0, 0.02, 0], { s: [1.15, 0.95, 1], grit: 0.2 });
    m.sph(0.07, WHITE, [0.05, -0.02, 0.05], { s: [1, 0.7, 1] }, 0); // cheeks
    m.sph(0.07, WHITE, [-0.05, -0.02, 0.05], { s: [1, 0.7, 1] }, 0);
    m.cone(0.05, 0.12, FUR, [0, -0.02, 0.12], { r: [Math.PI / 2, 0, 0] }, 6); // snout
    m.sph(0.018, SOCK, [0, -0.01, 0.185], { flat: true }, 0); // nose
    for (const s of [-1, 1]) {
      m.cone(0.045, 0.13, FUR, [s * 0.065, 0.13, -0.01], { r: [-0.15, 0, -s * 0.25] }, 4); // big ears
      m.cone(0.025, 0.08, SOCK, [s * 0.066, 0.12, 0.004], { r: [-0.15, 0, -s * 0.25] }, 4);
    }
    eyes(m, 0.045, 0.04, 0.075, 0.022);
  });
  const leg = (front: boolean) => (m: Mesher) => {
    m.seg([0, 0, 0], [0, -0.17, front ? 0.01 : -0.01], 0.032, 0.022, FUR);
    m.seg([0, -0.1, 0], [0, -0.19, 0.01], 0.024, 0.02, SOCK); // black socks
    m.box(0.04, 0.02, 0.05, SOCK, [0, -0.19, 0.015]);
  };
  const legs = [
    K.limb('front', [0.07, 0.2, 0.13], leg(true)), K.limb('front', [-0.07, 0.2, 0.13], leg(true)),
    K.limb('back', [0.08, 0.2, -0.16], leg(false)), K.limb('back', [-0.08, 0.2, -0.16], leg(false)),
  ];
  const tail = K.limb('tail', [0, 0.3, -0.24], (m) => {
    m.tube([[0, 0, 0], [0, 0.0, -0.12], [0, 0.02, -0.25]], [0.04, 0.075, 0.07], FUR, { grit: 0.25 });
    m.sph(0.065, WHITE, [0, 0.03, -0.33], { s: [1, 1, 1.3], grit: 0.15 }); // white tip
  });
  return rig('fox', K, { body, head, legs, tail }, 0.55);
}

// ------------------------------------------------------------------ birds (owl, raven)

function bird(id: 'owl' | 'raven'): PetRig {
  const owl = id === 'owl';
  const K = new Kit('pet_' + id, owl ? 0xffb030 : 0xc8d0ff, owl ? 1.6 : 1.1);
  // the raven is black with a blue-violet sheen and a pale grey beak, so it still reads on dark ground
  const F = owl ? 0x7a6448 : 0x2c2c3c;
  const F_D = owl ? 0x3e3022 : 0x16161e;
  const F_L = owl ? 0xc8b48c : 0x50506e;
  const BEAK = owl ? 0x3a3020 : 0x8a8a90;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, F, [0, 0.18, 0], { s: owl ? [0.3, 0.36, 0.28] : [0.22, 0.24, 0.34], grit: 0.25 });
    m.sph(0.5, F_L, [0, 0.16, 0.06], { s: owl ? [0.22, 0.28, 0.18] : [0.14, 0.14, 0.18], grit: 0.3 }); // breast
    if (owl) for (let i = 0; i < 4; i++) m.box(0.1 - i * 0.012, 0.012, 0.02, F_D, [0, 0.24 - i * 0.05, 0.15]); // barring
  });
  const head = K.limb('head', [0, owl ? 0.38 : 0.32, owl ? 0.02 : 0.12], (m) => {
    m.sph(owl ? 0.14 : 0.1, F, [0, 0, 0], { s: [1, 0.92, 0.95], grit: 0.2 });
    if (owl) {
      for (const s of [-1, 1]) {
        m.sph(0.065, F_L, [s * 0.06, 0, 0.09], { s: [1, 1, 0.4] }, 1); // facial discs
        m.cone(0.035, 0.09, F_D, [s * 0.085, 0.13, 0], { r: [0, 0, -s * 0.35] }, 4); // ear tufts
      }
      for (const s of [-1, 1]) {
        m.sph(0.034, 0xe0a020, [s * 0.06, 0.005, 0.115], { glow: true }, 1); // amber eyes
        m.sph(0.018, EYE, [s * 0.06, 0.005, 0.14], { flat: true }, 0);
      }
      m.cone(0.018, 0.05, BEAK, [0, -0.04, 0.13], { r: [Math.PI * 0.8, 0, 0] }, 4);
    } else {
      m.cone(0.028, 0.13, BEAK, [0, -0.01, 0.15], { r: [Math.PI / 2 + 0.15, 0, 0] }, 5); // heavy beak
      eyes(m, 0.055, 0.025, 0.06, 0.018, 0xc8d8ff);
    }
  });
  const foot = (m: Mesher) => {
    m.seg([0, 0, 0], [0, -0.07, 0.01], 0.012, 0.01, owl ? 0x8a7a50 : 0x2a2a2e);
    for (const a of [-0.5, 0, 0.5]) m.spike([0, -0.07, 0.01], [Math.sin(a), 0, Math.cos(a)], 0.04, 0.008, 0x1a1612);
  };
  const legs = [K.limb('foot', [0.06, 0.08, 0.02], foot), K.limb('foot', [-0.06, 0.08, 0.02], foot)];
  // each side is its own cached limb, built with x mirrored (never a negative scale: it would flip the faces)
  const wing = (s: number) => K.limb(s > 0 ? 'wingR' : 'wingL', [s * (owl ? 0.14 : 0.1), 0.24, 0], (m) => {
    m.sph(0.5, F_D, [s * 0.05, -0.04, -0.03], { s: [0.07, 0.24, 0.3], grit: 0.25 });
    for (let i = 0; i < 3; i++) m.box(0.02, 0.05, 0.16 - i * 0.03, F, [s * (0.07 + i * 0.03), -0.14 - i * 0.015, -0.08], { grit: 0.2 });
  });
  const tail = K.limb('tail', [0, 0.12, -0.15], (m) => m.poly([[-0.05, 0], [0.05, 0], [0.07, -0.16], [-0.07, -0.16]], F_D, [0, 0, 0], { r: [-Math.PI / 2 + 0.4, 0, 0] }, 0.02));
  // wings are drawn mirrored: the left one with x flipped
  const wings = [wing(1), wing(-1)];
  return rig(id, K, { body, head, legs, tail, wings }, owl ? 0.55 : 0.45, owl ? 0.95 : 0.8);
}

// ------------------------------------------------------------------ beaver, mole, otter

function beaver(): PetRig {
  const K = new Kit('pet_beaver', 0xffd090, 1.2);
  const FUR = 0x6a4428;
  const FUR_D = 0x3a2416;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, FUR, [0, 0.22, -0.02], { s: [0.32, 0.3, 0.44], grit: 0.25 });
    m.sph(0.5, 0x8a6040, [0, 0.18, 0.08], { s: [0.22, 0.2, 0.22], grit: 0.2 });
  });
  const head = K.limb('head', [0, 0.3, 0.2], (m) => {
    m.sph(0.11, FUR, [0, 0, 0], { s: [1.1, 0.95, 1], grit: 0.2 });
    m.sph(0.06, 0x8a6040, [0, -0.03, 0.08], { s: [1.2, 0.8, 0.9] }, 1); // muzzle
    m.sph(0.02, 0x1a1210, [0, -0.005, 0.135], { flat: true }, 0);
    m.box(0.022, 0.05, 0.012, 0xe08a2a, [0.012, -0.08, 0.11], { flat: true }); // orange teeth
    m.box(0.022, 0.05, 0.012, 0xe08a2a, [-0.012, -0.08, 0.11], { flat: true });
    for (const s of [-1, 1]) m.sph(0.03, FUR_D, [s * 0.08, 0.08, -0.02], { s: [1, 1, 0.5] }, 0);
    eyes(m, 0.05, 0.035, 0.07, 0.02);
  });
  const leg = (m: Mesher) => {
    m.sph(0.045, FUR_D, [0, -0.06, 0.01], { s: [1, 1.2, 1.2] }, 0);
    m.box(0.06, 0.02, 0.07, 0x2a1e14, [0, -0.11, 0.025]);
  };
  const legs = [
    K.limb('leg', [0.11, 0.12, 0.12], leg), K.limb('leg', [-0.11, 0.12, 0.12], leg),
    K.limb('leg', [0.12, 0.12, -0.14], leg), K.limb('leg', [-0.12, 0.12, -0.14], leg),
  ];
  const tail = K.limb('tail', [0, 0.09, -0.24], (m) => {
    m.sph(0.5, 0x2e2a28, [0, 0, -0.12], { s: [0.17, 0.04, 0.24], grit: 0.35 }); // flat scaly paddle
    for (let i = 0; i < 3; i++) m.box(0.12, 0.006, 0.006, 0x1a1816, [0, 0.022, -0.06 - i * 0.05]);
  });
  return rig('beaver', K, { body, head, legs, tail }, 0.48);
}

function mole(): PetRig {
  const K = new Kit('pet_mole', 0xffe0e0, 1.0);
  const FUR = 0x3a3640;
  const PINK = 0xd08a8a;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, FUR, [0, 0.15, -0.02], { s: [0.26, 0.22, 0.4], grit: 0.15 });
    m.sph(0.5, 0x4a4652, [0, 0.21, -0.02], { s: [0.18, 0.1, 0.3], grit: 0.2 });
  });
  const head = K.limb('head', [0, 0.17, 0.18], (m) => {
    m.sph(0.08, FUR, [0, 0, 0], { s: [1, 0.9, 1.1], grit: 0.15 });
    m.cone(0.04, 0.09, 0x5a4a50, [0, -0.01, 0.1], { r: [Math.PI / 2, 0, 0] }, 6);
    // pink star nose
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; m.sph(0.012, PINK, [Math.cos(a) * 0.022, -0.01 + Math.sin(a) * 0.022, 0.15], { flat: true }, 0); }
    m.sph(0.016, 0xe0a0a0, [0, -0.01, 0.155], { flat: true }, 0);
    eyes(m, 0.035, 0.03, 0.06, 0.011);
  });
  const claw = (front: boolean) => (m: Mesher) => {
    if (front) {
      m.box(0.09, 0.025, 0.08, PINK, [0, -0.06, 0.04], { r: [0, 0, 0], grit: 0.15 }); // big digging paws
      for (const dx of [-0.03, -0.01, 0.01, 0.03]) m.spike([dx, -0.06, 0.08], [0, -0.2, 1], 0.05, 0.009, 0xe8d8c0);
    } else m.sph(0.03, PINK, [0, -0.05, 0], { s: [1, 0.6, 1.3] }, 0);
  };
  const legs = [
    K.limb('front', [0.12, 0.1, 0.1], claw(true)), K.limb('front', [-0.12, 0.1, 0.1], claw(true)),
    K.limb('back', [0.09, 0.08, -0.16], claw(false)), K.limb('back', [-0.09, 0.08, -0.16], claw(false)),
  ];
  const tail = K.limb('tail', [0, 0.12, -0.22], (m) => m.spike([0, 0, 0], [0, 0.2, -1], 0.07, 0.012, PINK));
  return rig('mole', K, { body, head, legs, tail }, 0.32);
}

function otter(): PetRig {
  const K = new Kit('pet_otter', 0xffe0b0, 1.2);
  const FUR = 0x5a3a22;
  const FACE = 0xb09878;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.tube([[0, 0.2, 0.14], [0, 0.2, -0.02], [0, 0.18, -0.18]], [0.09, 0.11, 0.09], FUR, { grit: 0.2 });
    m.sph(0.5, FACE, [0, 0.16, 0.08], { s: [0.12, 0.12, 0.2], grit: 0.15 }); // pale chest
  });
  const head = K.limb('head', [0, 0.27, 0.24], (m) => {
    m.sph(0.085, FUR, [0, 0, 0], { s: [1.1, 0.9, 1], grit: 0.2 });
    m.sph(0.06, FACE, [0, -0.025, 0.06], { s: [1.2, 0.8, 0.9] }, 1);
    m.sph(0.018, 0x1a1210, [0, 0.0, 0.11], { flat: true }, 0);
    for (const s of [-1, 1]) {
      m.sph(0.02, FUR, [s * 0.07, 0.05, -0.02], {}, 0); // tiny ears
      for (const a of [-0.2, 0.15]) m.box(0.09, 0.004, 0.004, 0xe8e0d0, [s * 0.05, -0.03, 0.09], { r: [0, -s * 0.3, a], flat: true }); // whiskers
    }
    eyes(m, 0.04, 0.025, 0.06, 0.018);
  });
  const leg = (m: Mesher) => {
    m.seg([0, 0, 0], [0, -0.1, 0.01], 0.025, 0.02, FUR);
    m.box(0.04, 0.015, 0.05, 0x2a1c12, [0, -0.1, 0.02]);
  };
  const legs = [
    K.limb('leg', [0.07, 0.11, 0.1], leg), K.limb('leg', [-0.07, 0.11, 0.1], leg),
    K.limb('leg', [0.07, 0.11, -0.13], leg), K.limb('leg', [-0.07, 0.11, -0.13], leg),
  ];
  const tail = K.limb('tail', [0, 0.17, -0.24], (m) => m.horn([[0, 0, 0], [0, -0.04, -0.12], [0, -0.07, -0.24], [0, -0.08, -0.34]], 0.055, FUR, 0x3a2414, { grit: 0.2 }));
  return rig('otter', K, { body, head, legs, tail }, 0.4);
}

// ------------------------------------------------------------------ dragon whelp

function whelp(): PetRig {
  const K = new Kit('pet_whelp', 0xff7a1a, 2.0);
  const SCALE = 0x7a2a18;
  const SCALE_D = 0x3a140c;
  const BELLY = 0xc89050;
  const HORN = 0xd8c8a0;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, SCALE, [0, 0.26, -0.02], { s: [0.28, 0.27, 0.38], grit: 0.25 });
    m.sph(0.5, BELLY, [0, 0.22, 0.07], { s: [0.18, 0.2, 0.2], grit: 0.15 });
    m.sph(0.03, 0xff8a2a, [0, 0.24, 0.16], { glow: true, s: [1.6, 1, 0.5] }, 0); // ember glowing in the belly
    for (let i = 0; i < 5; i++) m.spike([0, 0.39 - Math.abs(i - 1) * 0.02, 0.08 - i * 0.07], [0, 1, -0.4], 0.06, 0.022, SCALE_D, {}, 4); // back ridge
  });
  const head = K.limb('head', [0, 0.42, 0.18], (m) => {
    m.sph(0.12, SCALE, [0, 0, 0], { s: [1.05, 0.95, 1], grit: 0.2 });
    m.box(0.11, 0.07, 0.1, SCALE, [0, -0.03, 0.1], { grit: 0.2 }); // short snout
    for (const s of [-1, 1]) {
      m.sph(0.012, 0x1a0a06, [s * 0.025, -0.01, 0.155], { flat: true }, 0); // nostrils
      m.horn([[s * 0.06, 0.08, -0.04], [s * 0.08, 0.13, -0.09], [s * 0.085, 0.15, -0.14]], 0.022, HORN, HORN); // little horns
    }
    for (const s of [-1, 1]) {
      m.sph(0.03, 0xffb030, [s * 0.055, 0.035, 0.075], { glow: true }, 1); // big ember eyes
      m.sph(0.014, EYE, [s * 0.058, 0.035, 0.1], { flat: true, s: [0.5, 1.3, 1] }, 0);
    }
  });
  const leg = (front: boolean) => (m: Mesher) => {
    m.seg([0, 0, 0], [0, -0.17, front ? 0.02 : -0.01], 0.04, 0.03, SCALE);
    m.box(0.05, 0.02, 0.06, SCALE_D, [0, -0.18, 0.02]);
    for (const dx of [-0.015, 0.015]) m.spike([dx, -0.18, 0.05], [0, -0.3, 1], 0.03, 0.007, HORN);
  };
  const legs = [
    K.limb('front', [0.1, 0.2, 0.12], leg(true)), K.limb('front', [-0.1, 0.2, 0.12], leg(true)),
    K.limb('back', [0.11, 0.2, -0.14], leg(false)), K.limb('back', [-0.11, 0.2, -0.14], leg(false)),
  ];
  const wing = (s: number) => K.limb(s > 0 ? 'wingR' : 'wingL', [s * 0.12, 0.36, -0.02], (m) => {
    m.seg([0, 0, 0], [s * 0.2, 0.12, -0.06], 0.016, 0.01, SCALE_D);
    m.poly([[0, 0], [s * 0.2, 0.12], [s * 0.22, -0.02], [s * 0.14, -0.06], [s * 0.06, -0.05]], 0x5a1e12, [0, 0, -0.03], { grit: 0.15 });
  });
  const tail = K.limb('tail', [0, 0.24, -0.2], (m) => m.horn([[0, 0, 0], [0.03, -0.05, -0.12], [0.08, -0.1, -0.22], [0.12, -0.12, -0.3]], 0.05, SCALE, SCALE_D, { grit: 0.2 }));
  return rig('whelp', K, { body, head, legs, tail, wings: [wing(1), wing(-1)] }, 0.6);
}

const BUILDERS: Record<PetId, () => PetRig> = { tortoise, fox, owl: () => bird('owl'), beaver, mole, otter, whelp, raven: () => bird('raven') };

/** Every pet is drawn a bit larger than life so it reads at 32 art pixels per tile. */
const PET_SCALE = 1.35;

/** A new instance of a pet's model. Level 1–10 grows it a little (×1.0 → ×1.18). */
export function buildPet(id: PetId, level = 1): PetRig {
  const r = BUILDERS[id]();
  r.root.scale.setScalar(PET_SCALE * (1 + 0.02 * (Math.max(1, Math.min(10, level)) - 1)));
  return r;
}

/** Frees the per-instance materials (geometry is shared and cached). */
export function disposePet(r: PetRig): void {
  for (const m of r.materials) m.dispose();
}

/**
 * Idle and walk animation. `walk` 0..1 blends from standing to walking; `t` is the pet's own clock.
 * Birds fly: they hover at `fly` height and flap (faster while moving).
 */
export function animatePet(r: PetRig, t: number, walk: number): void {
  const ph = t * (6 + walk * 6);
  if (r.fly > 0) {
    r.body.position.y = r.fly + Math.sin(t * 2.2) * 0.05 + walk * 0.05;
    const flap = Math.sin(t * (walk > 0.3 ? 14 : 7)) * (walk > 0.3 ? 0.9 : 0.55);
    r.wings.forEach((w, i) => { w.rotation.z = (i === 0 ? -1 : 1) * (0.9 + flap); });
    r.body.rotation.x = 0.15 * walk;
    for (const l of r.legs) l.rotation.x = 0.6;
    r.head.rotation.y = Math.sin(t * 0.7) * 0.4 * (1 - walk);
  } else {
    const step = Math.sin(ph) * 0.55 * walk;
    // diagonal pairs move together (trot)
    r.legs.forEach((l, i) => { l.rotation.x = (l.userData.rest as number) + ((i === 0 || i === 3) ? step : -step); });
    r.body.position.y = Math.abs(Math.sin(ph)) * 0.025 * walk + Math.sin(t * 2) * 0.006;
    r.head.rotation.x = Math.sin(t * 1.3) * 0.06 * (1 - walk) + Math.sin(ph * 2) * 0.04 * walk;
    r.head.rotation.y = Math.sin(t * 0.5) * 0.25 * (1 - walk);
    r.wings.forEach((w, i) => { w.rotation.z = (i === 0 ? -1 : 1) * (0.15 + Math.sin(t * 1.5) * 0.05); });
  }
  if (r.tail) r.tail.rotation.y = Math.sin(t * (2 + walk * 6)) * (0.2 + walk * 0.2);
}

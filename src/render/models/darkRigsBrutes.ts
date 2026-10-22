import type { EnemyKind } from '../../game/world/WorldMap';
import type { BipedRig, Rig } from './rigs';
import { C, Kit, type Mesher } from './darkRigsCore';
import { arm, belt, leg, man, skull, strips, wAxe, wCrossbow, wMaul, wStaff } from './darkRigsParts';

/**
 * Dark models, batch (e): the labyrinth minotaurs (warrior, archer, mage),
 * the cyclops, the jungle troll and the restless dead (ghoul, mummy).
 */

// ------------------------------------------------------------------ minotaurs

const M_FUR = 0x3a2416;
const M_FUR_D = 0x22140c;
const M_SKIN = 0x5a3a26;
const M_MUZZLE = 0x6a5040;
const M_HORN = 0xd0c4a4;
const HOOF = 0x1a1410;
const M_EYE = 0xff3010;

function bullHead(o: { ring?: number; hornRing?: number; helm?: (m: Mesher) => void; big?: number }) {
  return (m: Mesher): void => {
    const s = o.big ?? 1.2;
    m.ao = 0.1;
    m.push([0, 0, 0.06], [-0.05, 0, 0], [s, s, s]);
    m.sph(0.17, M_FUR, [0, 0.02, -0.02], { s: [1.15, 1.0, 1.05], grit: 0.35 }); // skull and forelock
    m.box(0.2, 0.18, 0.2, M_SKIN, [0, -0.06, 0.13], { r: [0.25, 0, 0], grit: 0.2 }); // long face
    m.box(0.18, 0.12, 0.1, M_MUZZLE, [0, -0.12, 0.24], { r: [0.2, 0, 0], grit: 0.2 }); // wet muzzle
    for (const sd of [-1, 1]) m.sph(0.022, 0x0a0806, [sd * 0.045, -0.1, 0.295], { flat: true }, 0); // nostrils
    if (o.ring !== undefined) m.ring(0.045, 0.01, o.ring, [0, -0.17, 0.29], { r: [Math.PI / 2, 0, 0], flat: true }, Math.PI * 2, 8); // nose ring
    m.box(0.26, 0.06, 0.1, M_FUR_D, [0, 0.06, 0.12]); // heavy brow
    m.box(0.07, 0.05, 0.04, C.SOCKET, [0.07, 0.02, 0.17], { r: [0, 0, -0.3], flat: true });
    m.box(0.07, 0.05, 0.04, C.SOCKET, [-0.07, 0.02, 0.17], { r: [0, 0, 0.3], flat: true });
    m.eyes(0.07, 0.02, 0.19, 0.06, 0.035, 0.3);
    m.box(0.16, 0.025, 0.02, C.MOUTH, [0, -0.17, 0.22], { flat: true });
    for (const sd of [-1, 1]) {
      m.spike([sd * 0.15, 0.0, 0.0], [sd, 0.1, -0.3], 0.13, 0.04, M_SKIN, {}, 3); // ears
      // great forward-curving horns
      m.horn([[sd * 0.12, 0.1, 0.02], [sd * 0.28, 0.14, 0.0], [sd * 0.38, 0.24, 0.08], [sd * 0.36, 0.38, 0.18]], 0.055, M_HORN, 0x6a5a40);
      if (o.hornRing !== undefined) m.ring(0.05, 0.012, o.hornRing, [sd * 0.25, 0.135, 0.0], { r: [0, 0, Math.PI / 2], flat: true }, Math.PI * 2, 8);
    }
    m.sph(0.5, M_FUR, [0, -0.06, -0.12], { s: [0.4, 0.4, 0.3], grit: 0.4 }); // shaggy neck mane
    o.helm?.(m);
    m.pop();
  };
}

function minoTorso(o: { wear?: (m: Mesher) => void; kilt?: number; bulk?: number }) {
  return (m: Mesher): void => {
    const w = 0.58 * (o.bulk ?? 1.2);
    strips(m, [[-w * 0.36, 0.36, 0.18], [-w * 0.12, 0.42, 0.19], [w * 0.12, 0.34, 0.19], [w * 0.36, 0.4, 0.18], [-w * 0.24, 0.38, -0.18], [w * 0.24, 0.36, -0.18]], o.kilt ?? 0x4a3020, 0.04, { blood: 0.1 });
    belt(m, w + 0.06, 0.38, 0.07, C.LEATHER, C.IRON_L, true);
    m.push([0, 0.06, -0.02], [0.18, 0, 0]);
    m.box(w * 0.88, 0.3, 0.32, M_SKIN, [0, 0.18, 0], { grit: 0.15 });
    m.sph(0.5, M_SKIN, [0, 0.42, 0], { s: [w * 1.2, 0.36, 0.42], grit: 0.15 }); // massive chest
    m.sph(0.5, M_FUR, [0, 0.45, 0.04], { s: [w * 0.8, 0.28, 0.36], grit: 0.45 }); // chest fur
    m.sph(0.5, M_FUR, [0, 0.6, -0.04], { s: [w * 1.3, 0.24, 0.42], grit: 0.4 }); // hump of the shoulders
    for (let i = 0; i < 3; i++) m.box(0.014, 0.24, 0.01, C.SCAR, [0.1 + i * 0.04, 0.32, 0.215], { r: [0, 0, 0.5], flat: true });
    o.wear?.(m);
    m.pop();
  };
}

function minoArm(o: { upper?: number; bracer?: number; weapon?: (m: Mesher) => void; off?: (m: Mesher) => void }) {
  return (m: Mesher, side: number): void => {
    arm(m, side, { upper: o.upper ?? M_SKIN, fore: M_SKIN, hand: M_FUR_D, shoulder: o.upper === undefined ? M_FUR : undefined, bracer: o.bracer ?? C.IRON_D, spikes: o.bracer === undefined ? C.IRON : undefined, w: 0.19, blood: side < 0 ? 0.2 : 0 });
    if (side < 0 && o.weapon) { m.push([0, -0.48, 0.04]); o.weapon(m); m.pop(); }
    if (side > 0 && o.off) o.off(m);
  };
}

function minoLeg(m: Mesher, side: number, L: number): void {
  // furred digitigrade legs ending in split hooves
  leg(m, side, L, { thigh: M_FUR, shin: M_FUR_D, boot: HOOF, w: 0.21, grit: 0.4 });
  m.box(0.1, 0.06, 0.03, 0x0a0806, [0, -L + 0.06, 0.18], { flat: true }); // hoof split
}

function harness(m: Mesher): void {
  m.box(0.08, 0.7, 0.05, C.LEATHER, [0, 0.36, 0.22], { r: [0, 0, 0.7] });
  m.box(0.08, 0.7, 0.05, C.LEATHER, [0, 0.36, -0.2], { r: [0, 0, -0.7] });
  m.sph(0.06, C.IRON, [0, 0.36, 0.25], { s: [1, 1, 0.5] });
}

function darkMinotaur(): BipedRig {
  const K = new Kit('minotaur', M_EYE, 1.6);
  return man(K, {
    bulk: 1.22, legScale: 1.05,
    leg: minoLeg,
    torso: minoTorso({ wear: harness }),
    head: bullHead({ ring: C.IRON_L }),
    arm: minoArm({ weapon: (m) => wAxe(m, { len: 0.8, size: 1.25, double: true, head: 0x5a5c60, blood: 0.6 }) }),
    height: 2.0,
    hb: [0.9, 1.8, 0.9],
  });
}

function darkMinotaurArcher(): BipedRig {
  const K = new Kit('minotaur_archer', M_EYE, 1.6);
  const LEA = 0x3a3a24;
  return man(K, {
    bulk: 1.15, legScale: 1.05,
    leg: minoLeg,
    torso: minoTorso({
      bulk: 1.15, kilt: 0x2e2e1c, wear: (m) => {
        m.box(0.62, 0.3, 0.42, LEA, [0, 0.36, 0.0], { grit: 0.35 }); // studded leather jerkin
        for (let i = 0; i < 6; i++) m.box(0.03, 0.03, 0.02, C.IRON_L, [-0.2 + (i % 3) * 0.2, 0.3 + Math.floor(i / 3) * 0.12, 0.215], { flat: true });
        // a quiver of heavy bolts on the back
        m.push([0.12, 0.42, -0.26], [0.2, 0, -0.4]);
        m.cyl(0.08, 0.07, 0.48, C.LEATHER, [0, 0, 0], { grit: 0.3 }, 7);
        for (let i = 0; i < 5; i++) m.seg([(i - 2) * 0.025, 0.2, (i % 2) * 0.025], [(i - 2) * 0.03, 0.34, (i % 2) * 0.025], 0.009, 0.009, C.WOOD);
        m.pop();
      },
    }),
    head: bullHead({ ring: C.BRASS, helm: (m) => m.box(0.3, 0.05, 0.04, 0x6a1a12, [0, 0.07, 0.15], { flat: true }) }),
    arm: minoArm({ upper: LEA, bracer: C.LEATHER, weapon: (m) => { m.push([0, 0, 0], [0, 0, 0], [1.3, 1.3, 1.3]); wCrossbow(m, { wood: 0x3a2a1a, metal: C.IRON_D }); m.pop(); } }),
    height: 1.95,
    hb: [0.9, 1.75, 0.9],
  });
}

function darkMinotaurMage(): BipedRig {
  const K = new Kit('minotaur_mage', 0xc070ff, 2.0);
  const ROBE = 0x2a1e3a;
  const ROBE_L = 0x46325a;
  return man(K, {
    bulk: 1.12, legScale: 1.05,
    restArm: -0.12,
    leg: minoLeg,
    torso: (m) => {
      m.cyl(0.26, 0.4, 0.66, ROBE, [0, -0.28, 0], { grit: 0.35 }, 8);
      strips(m, [[-0.24, 0.34, 0.3], [0, 0.4, 0.33], [0.24, 0.34, 0.3]], ROBE_L, -0.44);
      minoTorso({
        bulk: 1.12, kilt: ROBE, wear: (mm) => {
          mm.box(0.64, 0.36, 0.44, ROBE, [0, 0.3, 0], { grit: 0.35 });
          mm.box(0.1, 0.36, 0.45, C.GOLD_D, [0, 0.3, 0.001]);
          for (let i = 0; i < 3; i++) mm.box(0.04, 0.04, 0.01, 0xffffff, [0, 0.2 + i * 0.1, 0.23], { glow: true, r: [0, 0, 0.78] }); // runes
          mm.sph(0.5, 0x1a1424, [0, 0.58, -0.04], { s: [0.84, 0.2, 0.46], grit: 0.3 }); // mantle
          for (let i = 0; i < 5; i++) mm.spike([-0.2 + i * 0.1, 0.5, 0.22], [0, -1, 0.2], 0.08, 0.014, M_HORN, { flat: true }); // bone charms
        },
      })(m);
    },
    head: bullHead({ ring: C.GOLD, hornRing: C.GOLD }),
    arm: (m, side) => {
      arm(m, side, { upper: ROBE, fore: ROBE_L, hand: M_FUR_D, w: 0.18 });
      if (side < 0) {
        m.push([0, -0.48, 0.0]);
        wStaff(m, {
          len: 1.2, wood: 0x2a1e14, top: (mm, at) => {
            // a ram's skull with a violet flame between its horns
            mm.sph(0.08, C.BONE, [at[0], at[1], at[2] + 0.02], { s: [1, 0.9, 1.3] });
            for (const s of [-1, 1]) mm.horn([[s * 0.06, at[1] + 0.02, at[2]], [s * 0.14, at[1] + 0.1, at[2] - 0.04], [s * 0.12, at[1] - 0.02, at[2] - 0.08]], 0.025, C.BONE, C.HORN_L);
            mm.cone(0.07, 0.24, 0xffffff, [at[0], at[1] + 0.18, at[2]], { glow: true }, 5);
          },
        });
        m.pop();
      }
    },
    height: 2.0,
    hb: [0.9, 1.8, 0.9],
  });
}

// ------------------------------------------------------------------ cyclops

const CY_SKIN = 0x9a7a5c;
const CY_SKIN_D = 0x5e4834;

function darkCyclops(): BipedRig {
  const K = new Kit('cyclops', 0xffc040, 1.6);
  return man(K, {
    bulk: 1.45, legScale: 1.15,
    restArm: -0.4,
    leg: (m, side, L) => {
      leg(m, side, L, { thigh: CY_SKIN, shin: CY_SKIN, w: 0.26, claws: 0x2a2018, wraps: C.LEATHER });
    },
    torso: (m) => {
      strips(m, [[-0.28, 0.44, 0.24], [-0.08, 0.5, 0.26], [0.12, 0.42, 0.26], [0.3, 0.46, 0.24], [-0.2, 0.42, -0.24], [0.2, 0.46, -0.24]], 0x4a3624, 0.04, { blood: 0.15 });
      belt(m, 0.86, 0.5, 0.06, 0x2a1e14, C.BONE, true);
      m.push([0, 0.06, -0.02], [0.24, 0, 0]);
      m.sph(0.5, CY_SKIN, [0, 0.22, 0.04], { s: [0.86, 0.56, 0.56], grit: 0.15 }); // pot belly
      m.sph(0.5, CY_SKIN, [0, 0.5, -0.02], { s: [0.96, 0.4, 0.54], grit: 0.15 }); // chest
      m.sph(0.5, CY_SKIN_D, [0, 0.66, -0.06], { s: [1.1, 0.26, 0.5], grit: 0.2 }); // hunched shoulders
      // a hide slung over one shoulder, scars and a crude bone necklace
      m.box(0.2, 0.7, 0.58, 0x5a4430, [0.24, 0.42, 0], { r: [0, 0, -0.5], grit: 0.4 });
      for (let i = 0; i < 4; i++) m.box(0.016, 0.3, 0.01, C.SCAR, [-0.25 + i * 0.05, 0.36, 0.3], { r: [0, 0, -0.4], flat: true });
      for (let i = 0; i < 6; i++) m.spike([-0.2 + i * 0.08, 0.66, 0.24], [0, -1, 0.2], 0.09, 0.02, C.BONE, { flat: true });
      m.pop();
    },
    head: (m) => {
      m.ao = 0.08;
      m.push([0, -0.06, 0.12], [-0.1, 0, 0], [1.4, 1.4, 1.4]);
      m.sph(0.17, CY_SKIN, [0, 0.02, 0], { s: [1.05, 1.0, 1.0], grit: 0.15 });
      m.box(0.28, 0.12, 0.18, CY_SKIN, [0, -0.1, 0.06], { grit: 0.12 }); // heavy jaw
      m.box(0.24, 0.06, 0.08, CY_SKIN_D, [0, 0.07, 0.13]); // single brow
      // the one great eye
      m.sph(0.065, 0xe8dcc0, [0, 0.01, 0.15], { s: [1.15, 1, 0.6], flat: true });
      m.sph(0.03, 0xffffff, [0, 0.01, 0.185], { glow: true, s: [1, 1, 0.5] });
      m.box(0.2, 0.04, 0.03, C.MOUTH, [0, -0.11, 0.155], { flat: true });
      for (const sd of [-1, 1]) {
        m.spike([sd * 0.05, -0.12, 0.15], [sd * 0.2, 1, 0.1], 0.06, 0.018, C.FANG, { flat: true }); // crooked teeth
        m.sph(0.04, CY_SKIN_D, [sd * 0.17, 0.0, 0.0], { s: [0.5, 1, 0.8] }); // ears
      }
      m.box(0.035, 0.08, 0.03, CY_SKIN_D, [0, -0.04, 0.17]); // nose
      for (let i = 0; i < 4; i++) m.box(0.012, 0.08, 0.012, 0x1a1410, [-0.04 + i * 0.025, 0.18, -0.04 + i * 0.01], { r: [0.4, 0, (i - 1.5) * 0.3] }); // a few lank hairs
      m.pop();
    },
    arm: (m, side) => {
      arm(m, side, { upper: CY_SKIN, fore: CY_SKIN, hand: CY_SKIN_D, shoulder: CY_SKIN, bracer: C.LEATHER, w: 0.24, blood: side < 0 ? 0.2 : 0 });
      if (side < 0) { m.push([0, -0.5, 0.04], [0, 0, 0], [1.4, 1.4, 1.4]); wMaul(m, { len: 0.75, w: 0.34, head: 0x6a6660, haft: 0x3a2a1a, blood: 0.45 }); m.pop(); }
    },
    height: 2.3,
    hb: [1.1, 2.1, 1.0],
  });
}

// ------------------------------------------------------------------ jungle troll

const T_SKIN = 0x56705a;
const T_SKIN_D = 0x34463a;

function darkJungleTroll(): BipedRig {
  const K = new Kit('jungle_troll', 0xffd040, 1.6);
  return man(K, {
    bulk: 1.1, legScale: 0.85,
    restArm: -0.35,
    headOff: [0, -0.08, 0.1],
    leg: (m, side, L) => leg(m, side, L, { thigh: T_SKIN, shin: T_SKIN_D, claws: 0x1a1410, wraps: 0x6a5a30, w: 0.16 }),
    torso: (m) => {
      // a grass and leaf skirt over a loincloth
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        m.box(0.06, 0.34, 0.012, i % 3 ? 0x5a5a24 : 0x3a4a1a, [Math.sin(a) * 0.2, -0.13, Math.cos(a) * 0.15], { r: [Math.cos(a) * 0.15, a, 0], two: true, grit: 0.4 });
      }
      belt(m, 0.46, 0.32, 0.06, 0x4a3a1a, C.BONE, true);
      m.push([0, 0.06, -0.02], [0.35, 0, 0]); // hunched
      m.box(0.38, 0.3, 0.24, T_SKIN, [0, 0.18, 0], { grit: 0.2 });
      m.sph(0.5, T_SKIN, [0, 0.42, 0], { s: [0.54, 0.3, 0.34], grit: 0.2 });
      for (let i = 0; i < 4; i++) m.box(0.3 - i * 0.03, 0.015, 0.02, T_SKIN_D, [0, 0.24 + i * 0.05, 0.13], { flat: true }); // ribs showing
      // war paint, a necklace of teeth and a strap of shrunken heads
      m.box(0.04, 0.2, 0.02, 0x8a1a10, [0.08, 0.36, 0.165], { flat: true });
      m.box(0.04, 0.2, 0.02, 0x8a1a10, [-0.08, 0.36, 0.165], { flat: true });
      for (let i = 0; i < 6; i++) m.spike([-0.14 + i * 0.056, 0.52, 0.15], [0, -1, 0.2], 0.06, 0.012, C.FANG, { flat: true });
      skull(m, [0.2, 0.05, 0.14], 0.05, 0x7a5a3a);
      m.pop();
    },
    head: (m) => {
      m.ao = 0.08;
      m.push([0, 0, 0.04], [-0.1, 0, 0], [1.05, 1.05, 1.05]);
      m.sph(0.15, T_SKIN, [0, 0.02, 0], { s: [1, 1.05, 1.05], grit: 0.15 });
      m.box(0.22, 0.12, 0.16, T_SKIN, [0, -0.08, 0.08], { grit: 0.12 }); // underslung jaw
      m.box(0.24, 0.05, 0.08, T_SKIN_D, [0, 0.05, 0.12]); // brow
      m.spike([0, -0.01, 0.15], [0, -0.45, 1], 0.2, 0.04, T_SKIN, {}, 4); // long hooked nose
      m.box(0.06, 0.04, 0.04, C.SOCKET, [0.06, 0.02, 0.14], { r: [0, 0, -0.3], flat: true });
      m.box(0.06, 0.04, 0.04, C.SOCKET, [-0.06, 0.02, 0.14], { r: [0, 0, 0.3], flat: true });
      m.eyes(0.06, 0.02, 0.16, 0.05, 0.03, 0.35);
      for (const sd of [-1, 1]) {
        m.spike([sd * 0.07, -0.12, 0.13], [sd * 0.3, 1, 0.3], 0.13, 0.025, C.FANG, { flat: true }); // tusks
        m.spike([sd * 0.14, 0.04, -0.02], [sd, 0.25, -0.35], 0.26, 0.05, T_SKIN, {}, 3); // long ears
        m.ring(0.03, 0.008, C.BONE, [sd * 0.24, 0.05, -0.08], { flat: true }, Math.PI * 2, 6);
      }
      // a red-dyed mohawk with bones knotted in
      for (let i = 0; i < 5; i++) m.spike([0, 0.14 - i * 0.01, 0.08 - i * 0.06], [0, 1, -0.2 - i * 0.15], 0.16 - i * 0.015, 0.03, 0x8a2a14, { grit: 0.3 }, 3);
      m.seg([0.0, 0.2, -0.08], [0.06, 0.28, -0.14], 0.012, 0.01, C.BONE);
      m.pop();
    },
    arm: (m, side) => {
      // long, sinewy arms that hang to the knees
      arm(m, side, { upper: T_SKIN, fore: T_SKIN, hand: T_SKIN_D, shoulder: T_SKIN, bracer: 0x6a5a30, w: 0.13, blood: side < 0 ? 0.3 : 0 });
      m.box(0.12, 0.14, 0.13, T_SKIN, [0, -0.56, 0.02], { grit: 0.2 });
      for (const dx of [-0.04, 0, 0.04]) m.spike([dx, -0.64, 0.05], [0, -1, 0.3], 0.07, 0.012, 0x1a1410);
      if (side < 0) { m.push([0, -0.58, 0.04]); wAxe(m, { len: 0.42, size: 0.75, head: 0x6a6a60, haft: 0x3a2a14, blood: 0.6 }); m.pop(); }
    },
    height: 1.75,
  });
}

// ------------------------------------------------------------------ the dead

const G_SKIN = 0x6e7462;
const G_SKIN_D = 0x3e4436;
const ROT = 0x3a352c;

function darkGhoul(): BipedRig {
  const K = new Kit('ghoul', 0xb0ff6a, 1.8);
  return man(K, {
    bulk: 0.95, legScale: 0.85,
    restArm: -0.9,
    headOff: [0, -0.16, 0.2],
    leg: (m, side, L) => leg(m, side, L, { thigh: ROT, shin: G_SKIN, claws: 0x1a1410, w: 0.14, blood: 0.2 }),
    torso: (m) => {
      strips(m, [[-0.14, 0.4, 0.13], [0.04, 0.48, 0.14], [0.16, 0.36, 0.13], [-0.1, 0.44, -0.13], [0.1, 0.38, -0.13]], ROT, 0.04, { blood: 0.2 });
      m.box(0.3, 0.1, 0.2, ROT, [0, 0.02, 0]);
      m.push([0, 0.06, -0.02], [0.6, 0, 0]); // deeply hunched
      m.box(0.24, 0.28, 0.18, G_SKIN, [0, 0.16, 0], { grit: 0.25 }); // sunken gut
      m.sph(0.5, G_SKIN, [0, 0.4, 0], { s: [0.46, 0.3, 0.3], grit: 0.25 });
      // ribs through torn skin, a spine of knobs
      m.box(0.2, 0.2, 0.02, 0x1a120e, [0.0, 0.32, 0.14], { flat: true });
      for (let i = 0; i < 4; i++) m.box(0.22, 0.02, 0.03, C.BONE, [0, 0.25 + i * 0.045, 0.15], { r: [0, 0, (i % 2 ? 0.05 : -0.05)] });
      for (let i = 0; i < 6; i++) m.sph(0.03, G_SKIN_D, [0, 0.12 + i * 0.07, -0.16], { s: [1, 0.8, 0.8] });
      for (let i = 0; i < 3; i++) m.box(0.12, 0.012, 0.012, 0x9a120c, [-0.08 + i * 0.06, 0.2, 0.1], { blood: 1, flat: true });
      m.sph(0.5, ROT, [0, 0.5, -0.04], { s: [0.5, 0.14, 0.32], grit: 0.4 }); // rag over the shoulders
      m.pop();
    },
    head: (m) => {
      m.ao = 0.05;
      m.push([0, 0, 0.02], [0.2, 0, 0], [1.05, 1.05, 1.05]);
      m.sph(0.15, G_SKIN, [0, 0.03, 0], { s: [0.95, 1.05, 1.05], grit: 0.25 });
      m.box(0.16, 0.06, 0.12, G_SKIN_D, [0, -0.11, 0.08], { r: [0.5, 0, 0] }); // jaw hanging open
      m.box(0.16, 0.08, 0.04, 0x1a0806, [0, -0.06, 0.13], { flat: true }); // gaping maw
      for (let i = 0; i < 5; i++) m.spike([-0.06 + i * 0.03, -0.03, 0.13], [0, -1, 0.1], 0.04, 0.008, 0xb8ac88, { flat: true });
      m.box(0.07, 0.05, 0.04, C.SOCKET, [0.055, 0.04, 0.12], { flat: true });
      m.box(0.07, 0.05, 0.04, C.SOCKET, [-0.055, 0.04, 0.12], { flat: true });
      m.eyes(0.055, 0.04, 0.135, 0.035, 0.03, 0.1);
      m.box(0.03, 0.04, 0.03, 0x1a120e, [0, -0.0, 0.15], { flat: true }); // rotted-off nose
      for (let i = 0; i < 6; i++) m.box(0.01, 0.12, 0.01, 0x2a2620, [-0.08 + i * 0.03, 0.12, -0.06], { r: [0.6, 0, (i - 2.5) * 0.25] }); // lank hair
      m.pop();
    },
    arm: (m, side) => {
      arm(m, side, { upper: G_SKIN, fore: G_SKIN, hand: G_SKIN_D, shoulder: G_SKIN, w: 0.11, blood: 0.35 });
      for (const dx of [-0.035, 0, 0.035]) m.horn([[dx, -0.5, 0.02], [dx * 1.3, -0.6, 0.06], [dx * 1.4, -0.66, 0.12]], 0.014, 0x1a1410, 0x5a4a3a); // long claws
    },
    height: 1.55,
    hb: [0.75, 1.4, 0.75],
  });
}

const LINEN = 0x9a8e70;
const LINEN_D = 0x6a6048;
const DRY = 0x4a3a2a;

function wraps(m: Mesher, w: number, y0: number, y1: number, d: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const y = y0 + (y1 - y0) * (i / Math.max(1, n - 1));
    m.box(w * 1.04, 0.04, d * 1.04, i % 2 ? LINEN : LINEN_D, [0, y, 0], { r: [0, 0, (i % 2 ? 0.1 : -0.1)], grit: 0.3 });
  }
}

function darkMummy(): BipedRig {
  const K = new Kit('mummy', 0x6af0a0, 2.0);
  return man(K, {
    restArm: -1.35,
    leg: (m, side, L) => {
      leg(m, side, L, { thigh: LINEN_D, shin: LINEN, boot: DRY, w: 0.15 });
      wraps(m, 0.16, -0.48, -0.08, 0.17, 5);
      m.box(0.03, 0.3, 0.012, LINEN, [0.05, -0.3, 0.1], { r: [0.2, 0, 0.2], two: true }); // a trailing strip
    },
    torso: (m) => {
      m.box(0.36, 0.14, 0.24, LINEN_D, [0, 0.04, 0]);
      m.box(0.38, 0.5, 0.24, DRY, [0, 0.3, 0], { grit: 0.3 }); // desiccated body
      wraps(m, 0.38, 0.08, 0.5, 0.25, 8);
      m.box(0.12, 0.1, 0.02, 0x1a120e, [0.1, 0.3, 0.13], { flat: true }); // a gap in the wraps
      for (let i = 0; i < 3; i++) m.box(0.08, 0.012, 0.012, C.BONE_D, [0.1, 0.27 + i * 0.03, 0.135], { flat: true }); // ribs within
      // a gold-and-lapis collar and a scarab amulet
      m.sph(0.5, C.GOLD_D, [0, 0.52, 0.0], { s: [0.46, 0.08, 0.3] });
      for (let i = 0; i < 7; i++) m.box(0.04, 0.04, 0.02, i % 2 ? 0x1e3a6a : C.GOLD, [-0.15 + i * 0.05, 0.5 - Math.abs(i - 3) * 0.015, 0.14], { flat: true });
      m.sph(0.04, 0x2a8a6a, [0, 0.42, 0.14], { s: [1, 1.3, 0.5] });
      strips(m, [[-0.12, 0.6, 0.13], [0.14, 0.5, -0.13], [-0.06, 0.7, -0.13]], LINEN, 0.04, { blood: 0.05 }); // hanging rags
    },
    head: (m) => {
      m.ao = 0.05;
      m.push([0, 0, 0.02], [-0.1, 0, 0]);
      m.sph(0.17, LINEN_D, [0, 0.02, 0], { s: [0.95, 1.05, 1.0], grit: 0.3 });
      for (let i = 0; i < 5; i++) m.box(0.34, 0.035, 0.34, i % 2 ? LINEN : LINEN_D, [0, -0.1 + i * 0.06, 0], { r: [0.1 * (i % 2 ? 1 : -1), 0, (i % 2 ? 0.12 : -0.12)], grit: 0.3 });
      // a dark slit between the wraps with burning green eyes
      m.box(0.24, 0.06, 0.05, 0x0a0806, [0, 0.03, 0.15], { flat: true });
      m.eyes(0.055, 0.03, 0.175, 0.05, 0.03, 0.15);
      m.box(0.1, 0.04, 0.03, 0x0a0806, [0, -0.08, 0.16], { flat: true }); // mouth hole
      m.box(0.03, 0.3, 0.01, LINEN, [0.12, -0.18, -0.12], { r: [0.2, 0, -0.2], two: true });
      m.pop();
    },
    arm: (m, side) => {
      arm(m, side, { upper: LINEN_D, fore: LINEN, hand: DRY, w: 0.12 });
      wraps(m, 0.13, -0.42, -0.06, 0.13, 5);
      for (const dx of [-0.03, 0, 0.03]) m.spike([dx, -0.52, 0.02], [0, -1, 0.2], 0.06, 0.011, 0x1a1410); // shrivelled fingers
      m.box(0.025, 0.36, 0.01, LINEN, [side * 0.05, -0.62, 0.0], { r: [0, 0, side * 0.15], two: true }); // a strip trailing from the arm
    },
    height: 1.75,
  });
}

export const DARK_BRUTES: Partial<Record<EnemyKind, () => Rig>> = {
  minotaur: darkMinotaur,
  minotaur_archer: darkMinotaurArcher,
  minotaur_mage: darkMinotaurMage,
  cyclops: darkCyclops,
  jungle_troll: darkJungleTroll,
  ghoul: darkGhoul,
  mummy: darkMummy,
};

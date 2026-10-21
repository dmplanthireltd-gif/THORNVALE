import type { EnemyKind } from '../../game/world/WorldMap';
import type { BipedRig, Rig } from './rigs';
import { C, Kit, type Mesher } from './darkRigsCore';
import { arm, belt, face, leg, man, pauldron, shKite, shRound, shTower, skull, strips, wAxe, wSpear, wStaff, wSword } from './darkRigsParts';

/**
 * Dark models, batch (b): the orc horde (orc, spearman, shaman, berserker,
 * leader, warlord) and human raiders (bandit, amazon, valkyrie).
 */

const SKIN = 0x667440;
const SKIN_D = 0x3e4826;
const TUSK = 0xd4c49c;
const RED_EYE = 0xff2010;

// ------------------------------------------------------------------ shared orc parts

interface OrcHead {
  skin?: number;
  helm?: (m: Mesher) => void;
  /** Hair: topknot, mohawk or none. */
  hair?: 'topknot' | 'mohawk' | 'none';
  hairColor?: number;
  paint?: number;
  big?: number;
}

/** A brutish orc head facing +Z: heavy jaw, underbite tusks, glowing slit eyes. */
function orcHead(o: OrcHead) {
  return (m: Mesher): void => {
    const sk = o.skin ?? SKIN;
    const s = o.big ?? 1.12;
    m.ao = 0.1;
    m.push([0, 0, 0.04], [-0.22, 0, 0], [s, s, s]);
    m.sph(0.19, sk, [0, 0, 0], { s: [1.1, 1, 1], grit: 0.15 });
    m.box(0.31, 0.15, 0.2, sk, [0, -0.11, 0.07], { grit: 0.12 }); // heavy jaw
    m.box(0.34, 0.065, 0.11, SKIN_D, [0, 0.06, 0.14]); // brow
    if (o.paint !== undefined) m.box(0.3, 0.05, 0.02, o.paint, [0, 0.02, 0.205], { flat: true });
    m.box(0.11, 0.07, 0.04, C.SOCKET, [0.08, 0.02, 0.19], { r: [0, 0, -0.25], flat: true });
    m.box(0.11, 0.07, 0.04, C.SOCKET, [-0.08, 0.02, 0.19], { r: [0, 0, 0.25], flat: true });
    m.eyes(0.08, 0.02, 0.205, 0.09, 0.05, 0.25);
    m.box(0.08, 0.065, 0.06, SKIN_D, [0, -0.03, 0.21]); // flat nose
    m.box(0.2, 0.028, 0.02, C.MOUTH, [0, -0.1, 0.18], { flat: true });
    m.spike([0.09, -0.11, 0.16], [0.15, 1, 0.25], 0.16, 0.035, TUSK, { flat: true });
    m.spike([-0.09, -0.11, 0.16], [-0.15, 1, 0.25], 0.14, 0.035, TUSK, { flat: true });
    m.box(0.02, 0.2, 0.015, C.SCAR, [0.1, -0.02, 0.2], { r: [0, 0, 0.5], flat: true });
    for (const sd of [-1, 1]) m.spike([sd * 0.19, 0.0, -0.02], [sd, 0.4, -0.5], 0.17, 0.045, sk, {}, 3); // ears
    m.box(0.03, 0.03, 0.03, C.GOLD, [0.27, -0.02, -0.05], { flat: true }); // earring
    if (o.hair === 'topknot') {
      m.sph(0.07, o.hairColor ?? 0x1a1410, [0, 0.19, -0.1], { grit: 0.3 });
      m.horn([[0, 0.2, -0.12], [0, 0.3, -0.2], [0, 0.18, -0.34], [0, 0.0, -0.36]], 0.045, o.hairColor ?? 0x1a1410, o.hairColor ?? 0x1a1410, { grit: 0.3 });
    } else if (o.hair === 'mohawk') {
      for (let i = 0; i < 6; i++) m.spike([0, 0.17 - i * 0.012, 0.1 - i * 0.07], [0, 1, -0.25 - i * 0.12], 0.17 - i * 0.012, 0.035, o.hairColor ?? 0x6a1410, { grit: 0.3 }, 3);
    }
    o.helm?.(m);
    m.pop();
  };
}

interface OrcBody {
  bulk: number;
  /** Clothing / armour drawn in the hunched chest frame. */
  wear?: (m: Mesher, w: number, d: number) => void;
  kilt?: number;
  kiltLen?: number;
  tabard?: number;
  /** Cape strips hanging down the back. */
  cape?: number;
  belt?: number;
  skullBelt?: boolean;
  skin?: number;
}

function orcTorso(o: OrcBody) {
  return (m: Mesher): void => {
    const b = o.bulk;
    const w = 0.56 * b;
    const d = 0.34 * b;
    const sk = o.skin ?? SKIN;
    if (o.kilt !== undefined) {
      const L = o.kiltLen ?? 0.36;
      strips(m, [[-w * 0.36, L, d * 0.5], [-w * 0.12, L * 1.15, d * 0.52], [w * 0.12, L * 0.9, d * 0.52], [w * 0.36, L * 1.05, d * 0.5]], o.kilt, 0.06);
      strips(m, [[-w * 0.3, L, -d * 0.5], [0, L * 1.1, -d * 0.52], [w * 0.3, L * 0.95, -d * 0.5]], o.kilt, 0.06);
    }
    if (o.tabard !== undefined) strips(m, [[-0.06, 0.48, d * 0.56], [0.06, 0.42, d * 0.56]], o.tabard, 0.08, { blood: 0.25 });
    m.box(w * 0.95, 0.16, d * 0.92, sk, [0, 0.05, 0]); // hips
    belt(m, w + 0.04, d + 0.04, 0.08, o.belt ?? C.LEATHER, C.IRON_L, o.skullBelt);
    m.push([0, 0.08, -0.02], [0.22, 0, 0]);
    m.box(w * 0.9, 0.3, d * 0.95, sk, [0, 0.2, 0], { grit: 0.15 }); // gut
    m.sph(0.5, sk, [0, 0.42, 0], { s: [w * 1.15, 0.36, d * 1.2], grit: 0.15 }); // barrel chest
    for (const sd of [-1, 1]) m.sph(0.1 * b, SKIN_D, [sd * w * 0.22, 0.42, d * 0.42], { s: [1.2, 0.8, 0.45] }); // pecs
    m.sph(0.5, sk, [0, 0.56, -0.02], { s: [w * 1.25, 0.18, d * 1.0] }); // traps
    o.wear?.(m, w, d);
    if (o.cape !== undefined) strips(m, [[-w * 0.38, 0.7, -d * 0.62], [-w * 0.12, 0.85, -d * 0.66], [w * 0.14, 0.62, -d * 0.64], [w * 0.38, 0.78, -d * 0.62]], o.cape, 0.6);
    m.pop();
  };
}

function orcLeg(o: { thigh: number; shin?: number; boot?: number; knee?: number; wraps?: number; bulk: number; claws?: number }) {
  return (m: Mesher, side: number, L: number): void => leg(m, side, L, { thigh: o.thigh, shin: o.shin, boot: o.boot, knee: o.knee, kneeSpike: o.knee !== undefined ? C.IRON_D : undefined, wraps: o.wraps, claws: o.claws, w: 0.19 * o.bulk });
}

/** Orc arm: bare green upper arm, bracer, big fist; the weapon / shield builders go in the hand. */
function orcArm(o: { bulk: number; upper?: number; bracer?: number; spikes?: number; weapon?: (m: Mesher) => void; off?: (m: Mesher) => void; blood?: number; skin?: number }) {
  return (m: Mesher, side: number): void => {
    const sk = o.skin ?? SKIN;
    arm(m, side, { upper: o.upper ?? sk, fore: sk, hand: SKIN_D, shoulder: o.upper === undefined ? sk : undefined, bracer: o.bracer, spikes: o.spikes, w: 0.17 * o.bulk, blood: side < 0 ? o.blood : 0 });
    if (o.upper === undefined) m.box(0.012, 0.15, 0.01, C.SCAR, [side * 0.06, -0.15, 0.09 * o.bulk], { r: [0, 0, 0.4], flat: true });
    if (side < 0 && o.weapon) { m.push([0, -0.48, 0.04]); o.weapon(m); m.pop(); }
    if (side > 0 && o.off) o.off(m);
  };
}

// ------------------------------------------------------------------ the orcs

function darkOrc(): BipedRig {
  const K = new Kit('orc', RED_EYE);
  const b = 1.1;
  return man(K, {
    bulk: b,
    leg: orcLeg({ thigh: 0x4a3a2a, shin: SKIN, boot: 0x2a1e14, wraps: C.LEATHER, bulk: b }),
    torso: orcTorso({
      bulk: b, kilt: 0x4a3420, belt: C.LEATHER,
      wear: (m, w, d) => {
        // crude leather jerkin, laced shut, studded
        m.box(w * 0.98, 0.34, d * 1.05, 0x4a3420, [0, 0.3, 0], { grit: 0.3, blood: 0.06 });
        for (let i = 0; i < 4; i++) m.box(0.1, 0.012, 0.02, 0x1a120c, [0, 0.18 + i * 0.07, d * 0.54], { flat: true });
        for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) m.sph(0.016, C.IRON_L, [sd * w * 0.32, 0.2 + i * 0.1, d * 0.54], { flat: true }, 0);
        pauldron(m, -1, [-w * 0.62, 0.52, 0], 0.12, 0x4a3420, C.LEATHER);
      },
    }),
    head: orcHead({ hair: 'topknot', helm: (m) => m.sph(0.2, C.LEATHER, [0, 0.1, -0.05], { s: [1.02, 0.5, 1.04], grit: 0.3 }) }),
    arm: orcArm({
      bulk: b, bracer: C.LEATHER, blood: 0.1,
      weapon: (m) => wAxe(m, { len: 0.5, size: 0.9, blood: 0.5, haft: C.WOOD }),
      off: (m) => shRound(m, { r: 0.24, wood: 0x4a3626, rim: C.IRON_D, paint: 0x6a1a10, cracked: true }),
    }),
    height: 1.75,
  });
}

function darkOrcSpearman(): BipedRig {
  const K = new Kit('orc_spearman', RED_EYE);
  const b = 1.08;
  return man(K, {
    bulk: b,
    leg: orcLeg({ thigh: 0x5a4430, shin: SKIN, boot: 0x2a1e14, wraps: 0x5a4430, bulk: b }),
    torso: orcTorso({
      bulk: b, kilt: 0x5a4430, kiltLen: 0.3,
      wear: (m, w, d) => {
        m.box(w * 0.98, 0.3, d * 1.04, 0x5a4430, [0, 0.26, 0], { grit: 0.3 });
        // a rusted mail mantle over the shoulders
        m.sph(0.5, 0x4a4a48, [0, 0.5, 0], { s: [w * 1.3, 0.24, d * 1.25], grit: 0.45 });
        // bone necklace
        for (let i = 0; i < 7; i++) {
          const a = -0.9 + i * 0.3;
          m.spike([Math.sin(a) * w * 0.4, 0.48 - Math.cos(a) * 0.04, d * 0.56], [0, -1, 0.2], 0.07, 0.015, C.BONE, { flat: true });
        }
        pauldron(m, 1, [w * 0.62, 0.52, 0], 0.12, C.IRON, C.RUST);
      },
    }),
    head: orcHead({
      hair: 'none',
      helm: (m) => {
        m.sph(0.205, C.IRON, [0, 0.08, -0.03], { s: [1.04, 0.62, 1.06], grit: 0.35 });
        m.box(0.04, 0.16, 0.05, C.IRON_D, [0, 0.0, 0.21]); // nose guard
        m.spike([0, 0.2, -0.04], [0, 1, -0.2], 0.12, 0.03, C.IRON_D);
      },
    }),
    arm: orcArm({
      bulk: b, bracer: C.LEATHER, blood: 0.1,
      weapon: (m) => wSpear(m, { len: 1.5, barbs: true, tuft: 0x6a1a10, blood: 0.6 }),
    }),
    height: 1.75,
  });
}

function darkOrcShaman(): BipedRig {
  const K = new Kit('orc_shaman', 0x5aff7a, 1.7);
  const ROBE = 0x3a2c30;
  const HIDE = 0x6a5038;
  const sk = 0x6a7a44;
  return man(K, {
    bulk: 1.0,
    restArm: -0.12,
    leg: (m, side, L) => {
      m.box(0.2, L * 0.85, 0.22, ROBE, [0, -L * 0.42, 0], { grit: 0.3 });
      leg(m, side, L, { thigh: ROBE, shin: ROBE, claws: C.CLAW, w: 0.17 });
    },
    torso: (m) => {
      // ragged hide robe to the ankles
      m.cyl(0.24, 0.36, 0.62, ROBE, [0, -0.25, 0], { grit: 0.35 }, 8);
      strips(m, [[-0.24, 0.5, 0.22], [-0.08, 0.6, 0.25], [0.1, 0.55, 0.25], [0.26, 0.48, 0.2], [-0.2, 0.55, -0.24], [0.15, 0.6, -0.25]], HIDE, -0.2);
      belt(m, 0.56, 0.36, 0.06, C.LEATHER, C.BONE, true);
      m.push([0, 0.08, -0.02], [0.35, 0, 0]); // stooped
      m.box(0.5, 0.42, 0.32, ROBE, [0, 0.24, 0], { grit: 0.3 });
      m.sph(0.5, HIDE, [0, 0.5, -0.02], { s: [0.66, 0.2, 0.44], grit: 0.4 }); // fur mantle
      // fetishes: small skulls, feathers, bones
      skull(m, [0.12, 0.3, 0.19], 0.045);
      skull(m, [-0.1, 0.22, 0.19], 0.04);
      for (let i = 0; i < 5; i++) m.box(0.02, 0.12, 0.012, i % 2 ? 0x8a2a1a : 0x2a3a2a, [-0.2 + i * 0.1, 0.42, 0.18], { r: [0.2, 0, (i - 2) * 0.2], two: true, flat: true });
      m.sph(0.03, 0xffffff, [0, 0.4, 0.2], { glow: true }, 0); // a glowing charm
      strips(m, [[-0.15, 0.7, -0.22], [0.0, 0.85, -0.24], [0.16, 0.66, -0.22]], HIDE, 0.55);
      m.pop();
    },
    head: (m) => {
      orcHead({ skin: sk, hair: 'none', big: 1.05 })(m);
      // horned skull mask over the upper face, feathers behind
      m.push([0, 0.02, 0.06], [-0.22, 0, 0]);
      m.sph(0.21, C.BONE, [0, 0.1, 0.02], { s: [1.05, 0.75, 1.0], grit: 0.2 });
      m.box(0.11, 0.07, 0.04, C.SOCKET, [0.08, 0.04, 0.2], { flat: true });
      m.box(0.11, 0.07, 0.04, C.SOCKET, [-0.08, 0.04, 0.2], { flat: true });
      m.eyes(0.08, 0.04, 0.215, 0.08, 0.05, 0.2);
      for (const s of [-1, 1]) m.horn([[s * 0.15, 0.18, -0.02], [s * 0.3, 0.3, -0.1], [s * 0.36, 0.48, -0.05], [s * 0.3, 0.58, 0.04]], 0.045, C.HORN, C.HORN_L);
      for (let i = 0; i < 4; i++) m.box(0.03, 0.3, 0.01, i % 2 ? 0x2a2a28 : 0x8a2a1a, [(i - 1.5) * 0.06, 0.32, -0.16], { r: [-0.5, 0, (i - 1.5) * 0.3], two: true });
      m.pop();
    },
    arm: (m, side) => {
      arm(m, side, { upper: ROBE, fore: sk, hand: SKIN_D, w: 0.15 });
      for (let i = 0; i < 3; i++) m.box(0.16, 0.02, 0.17, C.BONE, [0, -0.28 - i * 0.04, 0.0], { r: [0, 0, 0.2 * (i % 2 ? 1 : -1)] }); // bone bangles
      if (side < 0) {
        m.push([0, -0.48, 0.0]);
        wStaff(m, {
          len: 1.05, wood: 0x3a2a1a, top: (mm, at) => {
            skull(mm, [at[0], at[1] + 0.02, at[2]], 0.09);
            mm.sph(0.06, 0xffffff, [at[0], at[1] + 0.16, at[2]], { glow: true }, 0);
            for (const s of [-1, 1]) mm.horn([[s * 0.06, at[1] + 0.06, at[2]], [s * 0.14, at[1] + 0.2, at[2] - 0.02], [s * 0.1, at[1] + 0.32, at[2]]], 0.025, C.HORN, C.HORN_L);
            for (let i = 0; i < 3; i++) mm.box(0.012, 0.18, 0.012, 0x6a1a10, [(i - 1) * 0.04, at[1] - 0.14, at[2] + 0.05], { two: true });
          },
        });
        m.pop();
      }
    },
    height: 1.8,
  });
}

function darkOrcBerserker(): BipedRig {
  const K = new Kit('orc_berserker', 0xff3010, 1.9);
  const b = 1.22;
  const sk = 0x5e7036;
  const PAINT = 0x8a1410;
  return man(K, {
    bulk: b,
    leg: orcLeg({ thigh: 0x5a4028, shin: sk, wraps: C.LEATHER, claws: C.CLAW, bulk: b }),
    torso: orcTorso({
      bulk: b, skin: sk, kilt: 0x6a4a2a, kiltLen: 0.34, skullBelt: true,
      wear: (m, w, d) => {
        // bare chest: war paint, fresh gashes, blood and chains
        m.box(0.06, 0.34, 0.02, PAINT, [w * 0.18, 0.36, d * 0.62], { r: [0, 0, 0.4], flat: true });
        m.box(0.06, 0.34, 0.02, PAINT, [-w * 0.18, 0.36, d * 0.62], { r: [0, 0, -0.4], flat: true });
        m.box(w * 0.5, 0.05, 0.02, PAINT, [0, 0.5, d * 0.6], { flat: true });
        for (let i = 0; i < 3; i++) m.box(0.2, 0.02, 0.02, C.GUM, [-0.05 + i * 0.04, 0.22 + i * 0.05, d * 0.6], { r: [0, 0, 0.6], blood: 1, flat: true });
        m.sph(0.5, sk, [0, 0.3, 0.02], { s: [w * 0.9, 0.2, d * 1.05], blood: 0.25 });
        // chain across the chest
        for (let i = 0; i < 8; i++) m.ring(0.025, 0.008, C.IRON, [-w * 0.42 + i * w * 0.12, 0.55 - i * 0.035, d * 0.6], { r: [Math.PI / 2, 0, i % 2 ? 0.8 : 0], flat: true }, Math.PI * 2, 6);
        m.sph(0.5, 0x4a3a2a, [-w * 0.55, 0.55, 0], { s: [0.3, 0.2, 0.36], grit: 0.4 }); // fur over one shoulder
      },
    }),
    head: orcHead({ skin: sk, hair: 'mohawk', hairColor: 0x7a1410, paint: PAINT, big: 1.15 }),
    arm: orcArm({
      bulk: b, skin: sk, bracer: C.IRON_D, spikes: C.IRON_L, blood: 0.4,
      weapon: (m) => wAxe(m, { len: 0.75, size: 1.25, double: true, blood: 0.6, head: 0x6a6a68 }),
      off: (m) => { m.push([0, -0.48, 0.04]); wAxe(m, { len: 0.5, size: 0.9, blood: 0.5 }); m.pop(); },
    }),
    height: 1.85,
    hb: [0.85, 1.65, 0.85],
  });
}

function darkOrcLeader(): BipedRig {
  const K = new Kit('orc_leader', RED_EYE, 1.6);
  const b = 1.18;
  const PLATE = 0x4a4c50;
  const GOLD = C.GOLD;
  return man(K, {
    bulk: b,
    leg: orcLeg({ thigh: 0x3a2a20, shin: PLATE, boot: C.IRON_D, knee: PLATE, bulk: b }),
    torso: orcTorso({
      bulk: b, tabard: 0x6a1410, cape: 0x5a1410, kilt: 0x3a3c40,
      wear: (m, w, d) => {
        m.box(w * 1.04, 0.42, d * 1.12, PLATE, [0, 0.32, 0.01], { grit: 0.3, blood: 0.05 });
        m.box(w * 0.7, 0.04, 0.03, GOLD, [0, 0.5, d * 0.58], { flat: true });
        m.box(0.04, 0.34, 0.03, GOLD, [0, 0.32, d * 0.58], { flat: true });
        skull(m, [0, 0.36, d * 0.6], 0.06, 0xd8c8a0);
        for (const sd of [-1, 1]) pauldron(m, sd, [sd * w * 0.62, 0.54, 0], 0.15, PLATE, GOLD, C.IRON_L);
      },
    }),
    head: orcHead({
      hair: 'none',
      helm: (m) => {
        m.sph(0.215, PLATE, [0, 0.1, -0.03], { s: [1.04, 0.66, 1.06], grit: 0.3 });
        m.box(0.44, 0.045, 0.05, GOLD, [0, 0.06, 0.18], { flat: true });
        for (const s of [-1, 1]) {
          m.box(0.05, 0.18, 0.14, C.IRON_D, [s * 0.2, -0.05, 0.08], { r: [0, 0, s * 0.15] });
          m.horn([[s * 0.17, 0.14, 0], [s * 0.3, 0.26, -0.04], [s * 0.34, 0.42, 0.02], [s * 0.28, 0.52, 0.1]], 0.05, C.HORN, C.HORN_L);
        }
      },
    }),
    arm: orcArm({
      bulk: b, upper: PLATE, bracer: PLATE, spikes: C.IRON_L, blood: 0.15,
      weapon: (m) => wSword(m, { len: 0.85, w: 0.09, blade: 0x7a7e84, guard: GOLD, blood: 0.6, notched: true }),
      off: (m) => shKite(m, { face: 0x3a1410, rim: GOLD, emblem: 0x5a1a12 }),
    }),
    height: 1.85,
    hb: [0.85, 1.65, 0.85],
  });
}

function darkOrcWarlord(): BipedRig {
  const K = new Kit('orc_warlord', 0xff3a10, 1.9);
  const b = 1.3;
  const PLATE = 0x2a2a2e;
  const PLATE_L = 0x55585e;
  const sk = 0x56662e;
  return man(K, {
    bulk: b,
    leg: orcLeg({ thigh: 0x1e1a18, shin: PLATE, boot: PLATE, knee: PLATE_L, bulk: b }),
    torso: orcTorso({
      bulk: b, skin: sk, cape: 0x16120f, kilt: 0x2a2a2e, kiltLen: 0.42, skullBelt: true,
      wear: (m, w, d) => {
        m.box(w * 1.06, 0.46, d * 1.14, PLATE, [0, 0.32, 0.01], { grit: 0.3, blood: 0.1 });
        for (let i = 0; i < 3; i++) m.box(w * (1.08 - i * 0.04), 0.03, 0.03, PLATE_L, [0, 0.16 + i * 0.13, d * 0.58], { flat: true });
        skull(m, [0, 0.36, d * 0.62], 0.07);
        skull(m, [-w * 0.3, 0.06, d * 0.55], 0.045);
        // spiked back plate and a trophy rack of skulls
        for (let i = 0; i < 4; i++) m.spike([0, 0.14 + i * 0.12, -d * 0.58], [0, 0.6, -1], 0.16 + i * 0.03, 0.04, PLATE_L);
        m.seg([-0.16, 0.5, -d * 0.6], [-0.2, 1.05, -d * 0.7], 0.02, 0.02, C.WOOD_D);
        skull(m, [-0.2, 1.02, -d * 0.66], 0.07);
        m.sph(0.5, 0x2a221c, [0, 0.6, -0.03], { s: [w * 1.35, 0.18, d * 1.2], grit: 0.45 }); // fur collar
        for (const sd of [-1, 1]) pauldron(m, sd, [sd * w * 0.62, 0.55, 0], 0.17, PLATE, PLATE_L, PLATE_L);
      },
    }),
    head: orcHead({
      skin: sk, hair: 'none', big: 1.18,
      helm: (m) => {
        m.sph(0.22, PLATE, [0, 0.1, -0.03], { s: [1.04, 0.7, 1.08], grit: 0.3 });
        m.box(0.46, 0.05, 0.05, PLATE_L, [0, 0.06, 0.18], { flat: true });
        for (const s of [-1, 1]) {
          m.box(0.06, 0.2, 0.16, PLATE, [s * 0.21, -0.06, 0.08], { r: [0, 0, s * 0.15] });
          m.horn([[s * 0.16, 0.14, 0], [s * 0.34, 0.24, -0.06], [s * 0.46, 0.44, -0.02], [s * 0.42, 0.66, 0.08]], 0.065, 0x1a1612, 0x8a7a62);
        }
        for (let i = 0; i < 5; i++) m.spike([(i - 2) * 0.07, 0.22, 0.06], [(i - 2) * 0.15, 1, 0.1], 0.14 - Math.abs(i - 2) * 0.02, 0.025, PLATE_L); // crown of spikes
      },
    }),
    arm: orcArm({
      bulk: b, skin: sk, upper: PLATE, bracer: PLATE, spikes: PLATE_L, blood: 0.3,
      weapon: (m) => {
        // a huge cleaver of dragon bone
        m.cyl(0.032, 0.032, 0.36, C.LEATHER, [0, 0, 0.06], { r: [Math.PI / 2, 0, 0] });
        skull(m, [0, 0, -0.16], 0.05);
        m.box(0.06, 0.48, 0.62, 0xc8b894, [0, -0.15, 0.5], { grit: 0.25, blood: 0.35 });
        m.box(0.065, 0.08, 0.62, 0x8a7a5a, [0, 0.06, 0.5]);
        m.box(0.064, 0.06, 0.6, 0xe8dcc0, [0, -0.37, 0.5], { blood: 0.6, flat: true });
        for (const z of [0.3, 0.5, 0.7]) m.spike([0, 0.08, z], [0, 1, -0.3], 0.1, 0.025, 0xc8b894);
      },
      off: (m) => shTower(m, { w: 0.46, h: 0.82, face: PLATE, rim: PLATE_L, emblem: 0x6a1410, spikes: PLATE_L }),
    }),
    height: 2.0,
    hb: [0.9, 1.75, 0.9],
  });
}

// ------------------------------------------------------------------ human raiders

const HUMAN = 0xb88a68;
const HUMAN_D = 0x7a5a44;

function darkBandit(): BipedRig {
  const K = new Kit('bandit', 0xffffff, 1);
  const CLOAK = 0x2a2420;
  const LEA = 0x3e2e22;
  return man(K, {
    leg: (m, side, L) => leg(m, side, L, { thigh: 0x2a2826, shin: 0x2a2826, boot: 0x1e1610, wraps: LEA, w: 0.16 }),
    torso: (m) => {
      strips(m, [[-0.2, 0.36, 0.17], [0.0, 0.42, 0.18], [0.2, 0.34, 0.17]], CLOAK, 0.04);
      belt(m, 0.58, 0.36, 0.06, 0x1e1610, C.IRON_L);
      m.box(0.08, 0.2, 0.04, 0x1e1610, [0.24, -0.06, 0.1], { r: [0, 0, 0.3] }); // knife sheath
      m.box(0.54, 0.5, 0.32, LEA, [0, 0.28, 0], { grit: 0.3, blood: 0.08 }); // leather jerkin
      for (let i = 0; i < 4; i++) m.box(0.5, 0.015, 0.33, 0x2a1e16, [0, 0.12 + i * 0.1, 0], { flat: true });
      m.box(0.06, 0.48, 0.04, 0x8a6a40, [0.12, 0.3, 0.17], { r: [0, 0, 0.6], flat: true }); // bandolier
      for (let i = 0; i < 4; i++) m.box(0.035, 0.05, 0.03, C.IRON_L, [0.22 - i * 0.07, 0.48 - i * 0.07, 0.19], { flat: true });
      // ragged hooded cloak over the shoulders and back
      m.sph(0.5, CLOAK, [0, 0.52, -0.02], { s: [0.66, 0.2, 0.42], grit: 0.3 });
      strips(m, [[-0.2, 0.7, -0.2], [-0.07, 0.82, -0.22], [0.07, 0.75, -0.22], [0.2, 0.66, -0.2]], CLOAK, 0.56);
    },
    head: (m) => {
      m.push([0, 0, 0.02], [-0.15, 0, 0]);
      face(m, { skin: HUMAN, skinD: HUMAN_D, scar: true, eye: 0xe8e0c8, mouth: false });
      // scarf over the lower face, deep hood
      m.box(0.34, 0.14, 0.3, 0x5a1a14, [0, -0.1, 0.06], { grit: 0.3 });
      m.sph(0.235, CLOAK, [0, 0.05, -0.04], { s: [1, 1.02, 1.05], grit: 0.3 });
      m.box(0.4, 0.05, 0.1, CLOAK, [0, 0.13, 0.15], { r: [0.3, 0, 0] });
      m.cone(0.12, 0.3, CLOAK, [0, 0.0, -0.28], { r: [-Math.PI / 2 - 0.6, 0, 0] });
      m.pop();
    },
    arm: (m, side) => {
      arm(m, side, { upper: LEA, fore: 0x2a2826, hand: HUMAN_D, bracer: 0x1e1610, w: 0.14 });
      if (side < 0) { m.push([0, -0.46, 0.04]); wSword(m, { len: 0.55, w: 0.07, blood: 0.7, curve: true }); m.pop(); }
      else { m.push([0, -0.46, 0.04], [0, 0, Math.PI]); wSword(m, { len: 0.22, w: 0.05, blood: 0.6 }); m.pop(); }
    },
  });
}

function darkAmazon(): BipedRig {
  const K = new Kit('amazon', 0xffffff, 1);
  const SKIN_A = 0xa87858;
  const SKIN_AD = 0x6a4a34;
  const HIDE = 0x6a2418;
  const FURA = 0x5a4430;
  const HAIR = 0x1a120c;
  const PAINT = 0x8a1a10;
  return man(K, {
    bulk: 0.95,
    leg: (m, side, L) => {
      leg(m, side, L, { thigh: SKIN_A, shin: SKIN_A, boot: FURA, wraps: C.LEATHER, w: 0.15 });
      m.box(0.16, 0.06, 0.17, FURA, [0, -0.36, 0.0], { grit: 0.4 });
    },
    torso: (m) => {
      strips(m, [[-0.18, 0.32, 0.14], [-0.06, 0.38, 0.16], [0.06, 0.34, 0.16], [0.18, 0.3, 0.14], [-0.12, 0.34, -0.15], [0.12, 0.36, -0.15]], HIDE, 0.04);
      belt(m, 0.5, 0.3, 0.07, C.LEATHER, C.BONE, true);
      m.box(0.4, 0.28, 0.24, SKIN_A, [0, 0.22, 0]); // narrow waist
      m.box(0.48, 0.2, 0.28, SKIN_A, [0, 0.42, 0]);
      m.box(0.46, 0.13, 0.3, HIDE, [0, 0.42, 0.005], { grit: 0.3 }); // hide top
      m.box(0.06, 0.18, 0.02, PAINT, [0.1, 0.2, 0.125], { r: [0, 0, 0.3], flat: true });
      m.box(0.06, 0.18, 0.02, PAINT, [-0.1, 0.2, 0.125], { r: [0, 0, -0.3], flat: true });
      // tooth-and-bone necklace, a pelt over one shoulder
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + i * 0.3;
        m.spike([Math.sin(a) * 0.17, 0.53 - Math.cos(a) * 0.03, 0.16], [0, -1, 0.2], 0.06, 0.012, C.FANG, { flat: true });
      }
      m.sph(0.5, FURA, [0.2, 0.5, 0], { s: [0.26, 0.16, 0.32], grit: 0.4 });
      // long braid down the back
      m.horn([[0, 0.68, -0.14], [0, 0.48, -0.2], [0.02, 0.24, -0.2], [0.02, 0.06, -0.18]], 0.045, HAIR, HAIR, { grit: 0.3 });
    },
    head: (m) => {
      m.push([0, 0, 0.02], [-0.15, 0, 0]);
      face(m, { skin: SKIN_A, skinD: SKIN_AD, paint: PAINT, eye: 0xf0e8d8, r: 0.18 });
      m.sph(0.195, HAIR, [0, 0.05, -0.04], { s: [1.02, 0.95, 1.05], grit: 0.3 });
      m.box(0.36, 0.035, 0.05, HIDE, [0, 0.1, 0.12], { flat: true }); // headband
      for (let i = 0; i < 3; i++) m.box(0.02, 0.2, 0.008, i === 1 ? 0x2a2a28 : 0xa8a090, [0.17, 0.15, -0.08 + i * 0.03], { r: [0, 0, -0.5 - i * 0.15], two: true });
      m.pop();
    },
    arm: (m, side) => {
      arm(m, side, { upper: SKIN_A, fore: SKIN_A, hand: SKIN_AD, bracer: C.LEATHER, shoulder: SKIN_A, w: 0.12 });
      m.box(0.13, 0.03, 0.135, PAINT, [0, -0.12, 0.0], { flat: true }); // arm band of paint
      if (side < 0) { m.push([0, -0.46, 0.04]); wSpear(m, { len: 1.5, tip: 0x6a6a60, tuft: 0x8a1a10, blood: 0.6 }); m.pop(); }
    },
    height: 1.7,
  });
}

function darkValkyrie(): BipedRig {
  const K = new Kit('valkyrie', 0xffffff, 1);
  const SKIN_V = 0xc8987a;
  const STEEL = 0x7c848e;
  const STEEL_L = 0xb8c0c8;
  const BLUE = 0x1e3a6a;
  const HAIR = 0xc8a050;
  return man(K, {
    leg: (m, side, L) => leg(m, side, L, { thigh: 0x2a2a30, shin: STEEL, boot: 0x3a2a1c, knee: STEEL_L, w: 0.16 }),
    torso: (m) => {
      strips(m, [[-0.15, 0.4, 0.17], [0, 0.46, 0.18], [0.15, 0.4, 0.17]], BLUE, 0.04, { blood: 0.1 });
      m.cyl(0.26, 0.32, 0.24, 0x4a4c50, [0, -0.04, 0], { grit: 0.45 }, 8); // mail skirt
      belt(m, 0.52, 0.32, 0.08, C.LEATHER, C.GOLD);
      m.box(0.44, 0.3, 0.28, STEEL, [0, 0.24, 0], { grit: 0.25 });
      m.box(0.5, 0.2, 0.3, STEEL, [0, 0.43, 0.005], { grit: 0.25, blood: 0.05 }); // breastplate
      m.box(0.2, 0.36, 0.02, BLUE, [0, 0.3, 0.155], { grit: 0.2 });
      m.box(0.035, 0.36, 0.022, C.GOLD, [0, 0.3, 0.16], { flat: true });
      for (const s of [-1, 1]) pauldron(m, s, [s * 0.3, 0.52, 0], 0.12, STEEL, STEEL_L);
      // torn blue cape and a long braid
      strips(m, [[-0.17, 0.82, -0.18], [-0.05, 0.95, -0.2], [0.07, 0.86, -0.2], [0.19, 0.78, -0.18]], BLUE, 0.55);
      m.horn([[0.04, 0.68, -0.16], [0.06, 0.46, -0.22], [0.06, 0.24, -0.22]], 0.04, HAIR, HAIR, { grit: 0.3 });
    },
    head: (m) => {
      m.push([0, 0, 0.02], [-0.15, 0, 0]);
      face(m, { skin: SKIN_V, eye: 0xd8e8f0, r: 0.18, scar: true });
      m.sph(0.19, HAIR, [0, 0.02, -0.06], { s: [1.04, 0.95, 1.0], grit: 0.3 });
      // winged steel helm with a nasal bar
      m.sph(0.2, STEEL, [0, 0.08, -0.02], { s: [1.02, 0.7, 1.05], grit: 0.25 });
      m.box(0.4, 0.04, 0.05, STEEL_L, [0, 0.06, 0.17], { flat: true });
      m.box(0.035, 0.14, 0.04, STEEL_L, [0, -0.02, 0.2], { flat: true });
      for (const s of [-1, 1]) {
        m.push([s * 0.19, 0.12, -0.02], [0, -s * 0.3, s * 0.4]);
        for (let i = 0; i < 4; i++) m.box(0.025, 0.08 + i * 0.03, 0.06, i % 2 ? 0xe0e0d8 : 0xb8b8b0, [s * (0.02 + i * 0.035), 0.06 + i * 0.03, -0.02 - i * 0.02], { r: [0, 0, -s * 0.3] });
        m.pop();
      }
      m.pop();
    },
    arm: (m, side) => {
      arm(m, side, { upper: 0x2a2a30, fore: STEEL, hand: 0x4a4c50, w: 0.13 });
      if (side < 0) { m.push([0, -0.46, 0.04]); wSpear(m, { len: 1.6, tip: STEEL_L, barbs: true, blood: 0.5 }); m.pop(); }
      else shRound(m, { r: 0.26, wood: 0x4a3626, rim: STEEL, boss: STEEL_L, paint: BLUE });
    },
  });
}

export const DARK_ORCS: Partial<Record<EnemyKind, () => Rig>> = {
  orc: darkOrc,
  orc_spearman: darkOrcSpearman,
  orc_shaman: darkOrcShaman,
  orc_berserker: darkOrcBerserker,
  orc_leader: darkOrcLeader,
  orc_warlord: darkOrcWarlord,
  bandit: darkBandit,
  amazon: darkAmazon,
  valkyrie: darkValkyrie,
};


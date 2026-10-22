import type { EnemyKind } from '../../game/world/WorldMap';
import type { BipedRig, Rig } from './rigs';
import { C, Kit, type Mesher } from './darkRigsCore';
import { arm, belt, face, leg, man, shRound, skull, strips, wAxe, wClub, wSpear, wStaff } from './darkRigsParts';

/**
 * Dark models, batch (d): the barbarian clans of the north (raider,
 * headsplitter, skullhunter, brutetamer) — big frost-bitten men in pelts with
 * woad tattoos and trophy bones — and the frostkin, small hunched fur-faced
 * folk peering out of rimed parka hoods with pale glowing eyes.
 */

// ------------------------------------------------------------------ barbarians

const B_SKIN = 0xb88c70;
const B_SKIN_D = 0x7a5a48;
const WOAD = 0x2a4a6a;
const FUR = 0x5a4632;
const FUR_L = 0x8a7458;
const FUR_D = 0x33281e;
const HIDE = 0x4a3424;

function barbHead(o: { hair: number; beard?: number; helm?: (m: Mesher) => void; paint?: number; bald?: boolean }) {
  return (m: Mesher): void => {
    m.ao = 0.08;
    m.push([0, 0, 0.02], [-0.16, 0, 0], [1.08, 1.08, 1.08]);
    face(m, { skin: B_SKIN, skinD: B_SKIN_D, r: 0.19, scar: true, eye: 0xd8e4ec, beard: o.beard, beardLen: 0.9, paint: o.paint, mouth: o.beard === undefined });
    if (!o.bald) {
      m.sph(0.2, o.hair, [0, 0.06, -0.06], { s: [1.08, 0.92, 1.08], grit: 0.35 }); // wild mane
      m.box(0.34, 0.3, 0.12, o.hair, [0, -0.08, -0.17], { grit: 0.35 });
      for (const s of [-1, 1]) m.horn([[s * 0.17, -0.02, 0.02], [s * 0.19, -0.2, 0.05], [s * 0.17, -0.38, 0.06]], 0.035, o.hair, o.hair, { grit: 0.3 }); // braids
      for (const s of [-1, 1]) m.ring(0.035, 0.01, C.IRON_L, [s * 0.185, -0.22, 0.05], { flat: true }, Math.PI * 2, 6); // braid rings
    } else {
      m.sph(0.195, B_SKIN, [0, 0.04, -0.03], { s: [1, 0.95, 1.05], grit: 0.1 });
      m.box(0.04, 0.02, 0.3, WOAD, [0, 0.21, -0.02], { flat: true }); // tattooed scalp line
    }
    o.helm?.(m);
    m.pop();
  };
}

function barbTorso(o: { vest: number; trim?: number; kilt?: number; cape?: number; trophies?: boolean; bulk?: number }) {
  return (m: Mesher): void => {
    const w = 0.54 * (o.bulk ?? 1);
    strips(m, [[-w * 0.36, 0.34, 0.16], [-w * 0.1, 0.4, 0.17], [w * 0.14, 0.32, 0.17], [w * 0.36, 0.38, 0.16], [-w * 0.2, 0.36, -0.16], [w * 0.2, 0.34, -0.16]], o.kilt ?? HIDE, 0.04);
    belt(m, w + 0.06, 0.34, 0.07, C.LEATHER, C.IRON_L, o.trophies);
    m.box(w * 0.92, 0.3, 0.28, B_SKIN, [0, 0.22, 0], { grit: 0.12 }); // bare belly
    m.box(w, 0.22, 0.32, B_SKIN, [0, 0.43, 0], { grit: 0.12 }); // chest
    for (const s of [-1, 1]) m.sph(0.1, B_SKIN_D, [s * 0.11, 0.42, 0.13], { s: [1.2, 0.8, 0.45] }); // pecs
    // woad spirals across the chest and an old claw scar
    m.box(0.05, 0.2, 0.02, WOAD, [0.12, 0.26, 0.145], { r: [0, 0, 0.5], flat: true });
    m.box(0.05, 0.2, 0.02, WOAD, [-0.12, 0.26, 0.145], { r: [0, 0, -0.5], flat: true });
    for (let i = 0; i < 3; i++) m.box(0.012, 0.22, 0.01, C.SCAR, [-0.04 + i * 0.035, 0.36, 0.165], { r: [0, 0, 0.6], flat: true });
    // open fur vest
    for (const s of [-1, 1]) {
      m.box(w * 0.32, 0.46, 0.34, o.vest, [s * w * 0.36, 0.3, 0], { grit: 0.4 });
      m.box(0.06, 0.46, 0.06, o.trim ?? FUR_L, [s * w * 0.2, 0.3, 0.16], { grit: 0.45 }); // shaggy edge
    }
    m.box(w * 1.02, 0.42, 0.08, o.vest, [0, 0.3, -0.15], { grit: 0.4 });
    m.sph(0.5, o.trim ?? FUR_L, [0, 0.54, -0.02], { s: [w * 1.25, 0.16, 0.44], grit: 0.45 }); // fur mantle
    if (o.cape !== undefined) strips(m, [[-w * 0.38, 0.78, -0.2], [-w * 0.12, 0.9, -0.22], [w * 0.14, 0.82, -0.22], [w * 0.38, 0.74, -0.2]], o.cape, 0.58, { grit: 0.45 });
    if (o.trophies) {
      skull(m, [0.16, 0.0, 0.2], 0.06);
      skull(m, [-0.12, -0.02, 0.2], 0.055);
      skull(m, [0.0, 0.62, 0.12], 0.05, 0xc8bc98);
    }
  };
}

function barbArm(o: { weapon?: (m: Mesher) => void; off?: (m: Mesher) => void; bracer?: number; sleeve?: number }) {
  return (m: Mesher, side: number): void => {
    const sk = o.sleeve ?? B_SKIN;
    arm(m, side, { upper: sk, fore: B_SKIN, hand: B_SKIN_D, shoulder: o.sleeve === undefined ? B_SKIN : undefined, bracer: o.bracer ?? C.LEATHER, w: 0.16, blood: side < 0 ? 0.15 : 0 });
    m.box(0.165, 0.035, 0.17, WOAD, [0, -0.1, 0.0], { flat: true }); // woad arm ring
    if (side < 0 && o.weapon) { m.push([0, -0.46, 0.04]); o.weapon(m); m.pop(); }
    if (side > 0 && o.off) o.off(m);
  };
}

function barbLeg(thigh: number) {
  return (m: Mesher, side: number, L: number): void => {
    leg(m, side, L, { thigh, shin: thigh, boot: FUR_D, wraps: C.LEATHER, w: 0.18 });
    m.box(0.21, 0.08, 0.22, FUR, [0, -L + 0.17, 0.02], { grit: 0.45 }); // fur boot tops
  };
}

function darkBarbarianRaider(): BipedRig {
  const K = new Kit('barbarian_raider', 0xffffff, 1);
  return man(K, {
    bulk: 1.12,
    leg: barbLeg(0x4a3424),
    torso: barbTorso({ vest: FUR, bulk: 1.12 }),
    head: barbHead({
      hair: 0x8a3a18, beard: 0x8a3a18, helm: (m) => {
        // dented iron cap with short bull horns
        m.sph(0.2, C.IRON, [0, 0.1, -0.02], { s: [1.05, 0.6, 1.08], grit: 0.4 });
        m.box(0.42, 0.035, 0.42, C.IRON_D, [0, 0.07, -0.01], { grit: 0.3 });
        for (const s of [-1, 1]) m.horn([[s * 0.17, 0.12, -0.02], [s * 0.28, 0.18, 0.02], [s * 0.3, 0.3, 0.06]], 0.04, 0xc8b898, 0x5a4a38);
      },
    }),
    arm: barbArm({
      weapon: (m) => wAxe(m, { len: 0.62, size: 1.05, blood: 0.55, spike: true }),
      off: (m) => shRound(m, { r: 0.26, wood: 0x4a3626, rim: C.IRON_D, boss: C.IRON, paint: 0x6a1a12, cracked: true }),
    }),
    height: 1.85,
  });
}

/** A short-hafted throwing axe. */
function hatchet(m: Mesher): void {
  wAxe(m, { len: 0.34, size: 0.72, blood: 0.6, head: 0x5a5c60 });
}

function darkBarbarianHeadsplitter(): BipedRig {
  const K = new Kit('barbarian_headsplitter', 0xffffff, 1);
  return man(K, {
    bulk: 1.08,
    leg: barbLeg(0x2a2018),
    torso: (m) => {
      barbTorso({ vest: 0x3a2a1c, trim: 0x5a4a3a, bulk: 1.08 })(m);
      // a bandolier of throwing axes across the back
      m.box(0.06, 0.56, 0.04, C.LEATHER, [0, 0.3, -0.2], { r: [0, 0, 0.7] });
      m.push([0.0, 0.32, -0.25], [0, 0, 0.7]);
      for (let i = 0; i < 3; i++) { m.push([0, -0.18 + i * 0.18, 0], [-Math.PI / 2, 0, 0]); hatchet(m); m.pop(); }
      m.pop();
    },
    head: barbHead({ hair: 0x2a1e14, bald: true, paint: 0x1a1a1a, beard: 0x2a1e14 }),
    arm: barbArm({ weapon: hatchet, off: (m) => { m.push([0, -0.46, 0.04]); hatchet(m); m.pop(); }, bracer: 0x1e1610 }),
    height: 1.85,
  });
}

function darkBarbarianSkullhunter(): BipedRig {
  const K = new Kit('barbarian_skullhunter', 0xff3a1a, 1.4);
  return man(K, {
    bulk: 1.2,
    leg: barbLeg(0x5a1a12),
    torso: barbTorso({ vest: FUR_D, trim: 0x4a3a2a, cape: FUR_D, trophies: true, bulk: 1.2 }),
    head: (m) => {
      barbHead({ hair: 0x14100c, beard: 0x14100c, paint: 0x6a0a06 })(m);
      // a black bear's skull worn as a hood, pelt down the back
      m.push([0, 0, 0.02], [-0.16, 0, 0], [1.08, 1.08, 1.08]);
      m.sph(0.22, C.BONE_D, [0, 0.14, 0.0], { s: [1.05, 0.62, 1.15], grit: 0.3 });
      m.box(0.2, 0.08, 0.18, C.BONE_D, [0, 0.14, 0.18], { grit: 0.3 }); // muzzle over the brow
      for (const s of [-1, 1]) {
        m.box(0.06, 0.05, 0.03, C.SOCKET, [s * 0.07, 0.16, 0.2], { flat: true });
        m.spike([s * 0.06, 0.1, 0.26], [0, -1, 0.1], 0.08, 0.016, C.BONE, { flat: true }); // bear fangs over the face
        m.sph(0.05, FUR_D, [s * 0.16, 0.24, -0.04], { grit: 0.4 }); // ears
      }
      m.box(0.4, 0.4, 0.1, FUR_D, [0, -0.06, -0.2], { grit: 0.45 });
      m.pop();
    },
    arm: barbArm({ weapon: (m) => wAxe(m, { len: 0.9, size: 1.3, double: true, head: 0x5a5c60, blood: 0.75 }), bracer: 0x1a1410 }),
    height: 1.9,
  });
}

function darkBarbarianBrutetamer(): BipedRig {
  const K = new Kit('barbarian_brutetamer', 0x9ae0ff, 1.8);
  const ROBE = 0x8a8270;
  const ROBE_D = 0x5a5446;
  return man(K, {
    bulk: 1.05,
    restArm: -0.12,
    leg: (m, side, L) => leg(m, side, L, { thigh: ROBE_D, shin: ROBE_D, boot: FUR_D, w: 0.17 }),
    torso: (m) => {
      m.cyl(0.24, 0.36, 0.6, ROBE, [0, -0.25, 0], { grit: 0.4 }, 8); // long pelt robe
      strips(m, [[-0.22, 0.3, 0.27], [0.0, 0.36, 0.3], [0.22, 0.3, 0.27]], FUR_L, -0.42, { grit: 0.45 });
      belt(m, 0.52, 0.34, 0.06, C.LEATHER, C.BONE, true);
      m.box(0.48, 0.5, 0.3, ROBE, [0, 0.28, 0], { grit: 0.4 });
      m.box(0.1, 0.5, 0.31, ROBE_D, [0, 0.28, 0.001], { grit: 0.3 });
      // a wolf pelt over the shoulders, its forelegs knotted on the chest
      m.sph(0.5, 0x6a6458, [0, 0.52, -0.02], { s: [0.64, 0.2, 0.44], grit: 0.45 });
      for (const s of [-1, 1]) m.seg([s * 0.2, 0.52, 0.14], [s * 0.04, 0.4, 0.17], 0.03, 0.025, 0x6a6458, { grit: 0.4 });
      strips(m, [[-0.18, 0.86, -0.18], [0, 1.0, -0.2], [0.18, 0.84, -0.18]], 0xb8b0a0, 0.58, { grit: 0.45 });
      // bone charms and a glowing ice-blue rune stone
      for (let i = 0; i < 5; i++) m.spike([-0.12 + i * 0.06, 0.48, 0.17], [0, -1, 0.15], 0.07, 0.012, C.BONE, { flat: true });
      m.box(0.05, 0.06, 0.02, 0xffffff, [0, 0.36, 0.165], { glow: true, r: [0, 0, 0.78] });
    },
    head: (m) => {
      barbHead({ hair: 0x9a9a92, beard: 0xb0b0a8 })(m);
      m.push([0, 0, 0.02], [-0.16, 0, 0], [1.08, 1.08, 1.08]);
      // a wolf-skull headdress with antlers; the eyes burn with frost
      m.sph(0.12, C.BONE, [0, 0.2, 0.04], { s: [1, 0.6, 1.4], grit: 0.25 });
      m.box(0.08, 0.06, 0.14, C.BONE, [0, 0.18, 0.18]);
      for (const s of [-1, 1]) {
        m.box(0.04, 0.03, 0.03, C.SOCKET, [s * 0.05, 0.22, 0.12], { flat: true });
        m.horn([[s * 0.08, 0.24, -0.02], [s * 0.2, 0.42, -0.06], [s * 0.22, 0.58, -0.02]], 0.025, 0x6a5a44, C.HORN_L);
        m.horn([[s * 0.17, 0.38, -0.05], [s * 0.3, 0.44, -0.02], [s * 0.34, 0.52, 0.02]], 0.014, 0x6a5a44, C.HORN_L);
      }
      m.eyes(0.068, 0.015, 0.18, 0.06, 0.03, 0.2);
      m.pop();
    },
    arm: (m, side) => {
      arm(m, side, { upper: ROBE, fore: ROBE_D, hand: B_SKIN_D, w: 0.15 });
      if (side < 0) {
        m.push([0, -0.46, 0.0]);
        wStaff(m, {
          len: 1.15, wood: 0x5a4a34, top: (mm, at) => {
            // a bear skull lashed to the staff, frost-light in the sockets
            mm.sph(0.1, C.BONE, [at[0], at[1] + 0.06, at[2] + 0.02], { s: [1, 0.8, 1.3], grit: 0.25 });
            mm.box(0.1, 0.06, 0.12, C.BONE, [at[0], at[1] + 0.02, at[2] + 0.14]);
            for (const s of [-1, 1]) mm.box(0.035, 0.03, 0.02, 0xffffff, [s * 0.04, at[1] + 0.08, at[2] + 0.12], { glow: true });
            for (let i = 0; i < 3; i++) mm.box(0.012, 0.16, 0.012, i === 1 ? 0x2a2a28 : 0xd8d0c0, [(i - 1) * 0.05, at[1] - 0.12, at[2] + 0.06], { two: true });
          },
        });
        m.pop();
      }
    },
    height: 1.85,
  });
}

// ------------------------------------------------------------------ frostkin

const PARKA = 0x6a5a48;
const PARKA_D = 0x3e342a;
const RUFF = 0xc8c4b8;
const RIME = 0xd8e8f0;
const FK_FACE = 0x5a4e44;
const FK_EYE = 0xbff0ff;

function fkHead(o: { hood: number; ruff?: number; extra?: (m: Mesher) => void }) {
  return (m: Mesher): void => {
    m.ao = 0.05;
    m.push([0, -0.02, 0.04], [-0.1, 0, 0], [1.15, 1.15, 1.15]);
    m.sph(0.24, o.hood, [0, 0.02, -0.04], { s: [1, 1.02, 1.05], grit: 0.4 }); // deep hood
    m.cone(0.1, 0.24, o.hood, [0, 0.06, -0.28], { r: [-Math.PI / 2 - 0.5, 0, 0] }, 5); // hood tail
    m.ring(0.15, 0.055, o.ruff ?? RUFF, [0, 0.0, 0.17], { r: [Math.PI / 2, 0, 0], grit: 0.5 }, Math.PI * 2, 12); // frosted fur ruff
    m.sph(0.14, 0x120e0c, [0, -0.01, 0.13], { s: [1, 1, 0.5], flat: true }); // the dark inside the hood
    // a small furry face, a hooked horn-beak and pale glowing eyes
    m.sph(0.1, FK_FACE, [0, -0.02, 0.15], { s: [1, 0.95, 0.7], grit: 0.4 });
    m.eyes(0.045, 0.015, 0.215, 0.04, 0.035, 0.1);
    m.spike([0, -0.03, 0.21], [0, -0.35, 1], 0.1, 0.03, 0x9a7a3a, { flat: true }, 4);
    for (let i = 0; i < 5; i++) m.spike([-0.12 + i * 0.06, 0.1 + Math.abs(i - 2) * -0.02, 0.18], [0, -1, 0.1], 0.05, 0.01, RIME, { flat: true }); // icicles on the ruff
    o.extra?.(m);
    m.pop();
  };
}

function fkTorso(o: { coat: number; trim?: number; pack?: boolean }) {
  return (m: Mesher): void => {
    m.cyl(0.26, 0.32, 0.3, o.coat, [0, 0.0, 0], { grit: 0.4 }, 8); // parka skirt
    m.ring(0.31, 0.04, o.trim ?? RUFF, [0, -0.14, 0], { grit: 0.5 }, Math.PI * 2, 12);
    belt(m, 0.56, 0.42, 0.12, C.LEATHER, C.BONE);
    m.sph(0.5, o.coat, [0, 0.32, -0.02], { s: [0.6, 0.5, 0.5], grit: 0.4 }); // round hunched body
    m.box(0.06, 0.4, 0.05, PARKA_D, [0, 0.3, 0.24], { grit: 0.3 }); // seam
    for (let i = 0; i < 3; i++) m.box(0.04, 0.03, 0.03, C.BONE, [0, 0.18 + i * 0.1, 0.27], { flat: true }); // toggles
    m.sph(0.5, RIME, [0, 0.5, -0.06], { s: [0.5, 0.14, 0.4], grit: 0.4 }); // frost on the shoulders
    if (o.pack) {
      m.box(0.32, 0.3, 0.16, C.LEATHER, [0, 0.34, -0.26], { grit: 0.3 });
      m.cyl(0.05, 0.05, 0.38, 0x8a7a5a, [0, 0.52, -0.3], { r: [0, 0, Math.PI / 2] }, 6); // bedroll
      m.spike([0.12, 0.48, -0.28], [0.2, 1, -0.1], 0.3, 0.035, C.BONE); // a tusk lashed on
    }
  };
}

function fkArm(o: { sleeve: number; weapon?: (m: Mesher) => void }) {
  return (m: Mesher, side: number): void => {
    arm(m, side, { upper: o.sleeve, fore: o.sleeve, hand: FK_FACE, bracer: RUFF, w: 0.15, grit: 0.4 });
    m.spike([0, -0.5, 0.06], [0, -0.4, 1], 0.05, 0.012, 0x1a1410); // claws
    if (side < 0 && o.weapon) { m.push([0, -0.46, 0.04]); o.weapon(m); m.pop(); }
  };
}

function fkLeg(c: number) {
  return (m: Mesher, side: number, L: number): void => {
    leg(m, side, L, { thigh: c, shin: c, boot: 0x2a221a, w: 0.17, grit: 0.4 });
    m.box(0.2, 0.06, 0.24, RUFF, [0, -L + 0.14, 0.03], { grit: 0.5 });
  };
}

function darkFrostkin(): BipedRig {
  const K = new Kit('frostkin', FK_EYE, 1.8);
  return man(K, {
    bulk: 0.95, legScale: 0.62,
    leg: fkLeg(PARKA_D),
    torso: fkTorso({ coat: PARKA }),
    head: fkHead({ hood: PARKA }),
    arm: fkArm({ sleeve: PARKA, weapon: (m) => wSpear(m, { len: 1.25, tip: C.BONE, haft: 0x6a5a40, barbs: true, blood: 0.5 }) }),
    height: 1.45,
    hb: [0.75, 1.3, 0.75],
  });
}

function darkFrostkinToolshaper(): BipedRig {
  const K = new Kit('frostkin_toolshaper', FK_EYE, 1.8);
  const COAT = 0x6a4a2e;
  return man(K, {
    bulk: 1.0, legScale: 0.62,
    leg: fkLeg(0x3a2a1c),
    torso: fkTorso({ coat: COAT, trim: 0xa89a80, pack: true }),
    head: fkHead({ hood: COAT, ruff: 0xa89a80, extra: (m) => m.box(0.34, 0.05, 0.06, C.BONE_D, [0, 0.16, 0.12], { r: [0.3, 0, 0] }) }),
    arm: fkArm({ sleeve: COAT, weapon: (m) => wClub(m, { len: 0.6, r: 0.11, head: C.BONE, spikes: 0xd8ccb0, blood: 0.45, bone: true }) }),
    height: 1.48,
    hb: [0.78, 1.32, 0.78],
  });
}

function darkFrostkinWindcaller(): BipedRig {
  const K = new Kit('frostkin_windcaller', 0x8ae8ff, 2.2);
  const COAT = 0x3a5068;
  return man(K, {
    bulk: 0.95, legScale: 0.62,
    restArm: -0.12,
    leg: fkLeg(0x2a3444),
    torso: (m) => {
      fkTorso({ coat: COAT, trim: RIME })(m);
      m.cyl(0.3, 0.36, 0.32, COAT, [0, -0.3, 0], { grit: 0.4 }, 8); // long robe-parka
      for (let i = 0; i < 3; i++) m.box(0.04, 0.04, 0.01, 0xffffff, [-0.08 + i * 0.08, 0.3, 0.255], { glow: true, r: [0, 0, 0.78] }); // wind runes
      strips(m, [[-0.14, 0.5, -0.24], [0, 0.6, -0.26], [0.14, 0.48, -0.24]], 0x8aa8c0, 0.4, { grit: 0.4 });
    },
    head: fkHead({
      hood: COAT, ruff: RIME, extra: (m) => {
        // a crown of feathers and icicles
        for (let i = 0; i < 5; i++) {
          const a = -0.8 + i * 0.4;
          m.box(0.03, 0.2, 0.01, i % 2 ? 0xe8ecf0 : 0x2a3444, [Math.sin(a) * 0.18, 0.22, Math.cos(a) * 0.04 - 0.06], { r: [-0.2, 0, -a * 0.6], two: true });
        }
      },
    }),
    arm: (m, side) => {
      fkArm({ sleeve: COAT })(m, side);
      if (side < 0) {
        m.push([0, -0.46, 0.0]);
        wStaff(m, {
          len: 1.0, wood: 0xa8a090, top: (mm, at) => {
            // a staff of whalebone crowned with a floating ice shard
            mm.ring(0.08, 0.014, C.BONE, [at[0], at[1] + 0.02, at[2]], { r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 8);
            mm.cone(0.05, 0.22, 0xffffff, [at[0], at[1] + 0.06, at[2]], { glow: true }, 4);
            mm.cone(0.05, 0.1, 0xffffff, [at[0], at[1] - 0.06, at[2]], { glow: true, r: [Math.PI, 0, 0] }, 4);
          },
        });
        m.pop();
      }
    },
    height: 1.45,
    hb: [0.75, 1.3, 0.75],
  });
}

export const DARK_NORTH: Partial<Record<EnemyKind, () => Rig>> = {
  barbarian_raider: darkBarbarianRaider,
  barbarian_headsplitter: darkBarbarianHeadsplitter,
  barbarian_skullhunter: darkBarbarianSkullhunter,
  barbarian_brutetamer: darkBarbarianBrutetamer,
  frostkin: darkFrostkin,
  frostkin_toolshaper: darkFrostkinToolshaper,
  frostkin_windcaller: darkFrostkinWindcaller,
};

import type { EnemyKind } from '../../game/world/WorldMap';
import type { BipedRig, Rig } from './rigs';
import { C, Kit, type Mesher, type V3 } from './darkRigsCore';
import { arm, belt, face, leg, man, pauldron, strips, wStaff } from './darkRigsParts';

/**
 * Dark models, batch (g): elementals and giants — the fire elemental, the
 * behemoth, the frost giant and giantess, the ice golem and the ice witch.
 */

// ------------------------------------------------------------------ fire elemental

const BASALT = 0x2a2420;
const BASALT_L = 0x4a3e34;

/** A licking flame (glowing cone) at `at`, leaning along `lean`. */
function flame(m: Mesher, at: V3, h: number, r: number, lean = 0): void {
  m.cone(r, h, 0xffffff, [at[0], at[1] + h / 2, at[2]], { glow: true, r: [lean, 0, lean * 0.6] }, 5);
}

function darkFireElemental(): BipedRig {
  const K = new Kit('fire_elemental', 0xff7a10, 2.6);
  return man(K, {
    bulk: 1.1, legScale: 0.5,
    restArm: -0.3,
    hover: true,
    leg: (m, side) => {
      // no legs: the body trails off into a column of fire and falling embers
      if (side > 0) {
        m.cone(0.22, 0.6, 0xffffff, [-0.13, -0.18, 0], { glow: true, r: [Math.PI, 0, 0] }, 6);
        for (let i = 0; i < 4; i++) m.box(0.05, 0.05, 0.05, BASALT_L, [-0.13 + Math.sin(i * 2.1) * 0.16, -0.32 - i * 0.06, Math.cos(i * 2.1) * 0.1], { r: [i, i * 2, 0] });
      }
    },
    torso: (m) => {
      m.ao = 0.15;
      m.sph(0.24, 0xffffff, [0, 0.36, 0], { glow: true, s: [1, 1.2, 0.9] }, 1); // the molten heart
      // cracked basalt plates orbiting the core, lava light in the seams
      const plates: [V3, V3, V3][] = [
        [[0.0, 0.42, 0.2], [0.4, 0, 0], [0.32, 0.34, 0.08]],
        [[0.2, 0.36, 0.08], [0.2, 0.8, 0.3], [0.2, 0.36, 0.08]],
        [[-0.2, 0.36, 0.08], [0.2, -0.8, -0.3], [0.2, 0.36, 0.08]],
        [[0.0, 0.4, -0.18], [-0.3, 0, 0], [0.36, 0.42, 0.08]],
        [[0.0, 0.62, 0.0], [0, 0.4, 0], [0.4, 0.1, 0.3]],
        [[0.0, 0.08, 0.08], [0.6, 0.2, 0], [0.26, 0.16, 0.2]],
      ];
      for (const [p, r, s] of plates) m.box(s[0], s[1], s[2], BASALT, p, { r, grit: 0.45 });
      for (const [x, y, z] of [[0.18, 0.5, 0.15], [-0.15, 0.28, 0.16], [0.05, 0.2, 0.18]] as V3[]) m.box(0.12, 0.02, 0.02, 0xffffff, [x, y, z], { glow: true, r: [0, 0, x * 3] }); // glowing seams
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        flame(m, [Math.sin(a) * 0.2, 0.6, Math.cos(a) * 0.14], 0.3 + (i % 3) * 0.12, 0.07, Math.sin(a) * 0.3);
      }
      for (let i = 0; i < 3; i++) m.sph(0.08, BASALT_L, [Math.sin(i * 2.1) * 0.34, 0.7 + i * 0.05, Math.cos(i * 2.1) * 0.2], { s: [1, 0.7, 0.9], grit: 0.4 }, 0); // drifting cinder rocks
    },
    head: (m) => {
      m.ao = 0.05;
      m.push([0, -0.05, 0.02], [-0.1, 0, 0], [1.1, 1.1, 1.1]);
      // a charred skull-mask in a crown of fire
      m.sph(0.15, BASALT, [0, 0, 0], { s: [1, 1.1, 1], grit: 0.4 });
      m.box(0.24, 0.07, 0.1, BASALT_L, [0, 0.05, 0.1], { grit: 0.3 });
      m.box(0.07, 0.05, 0.04, 0xffffff, [0.06, 0.0, 0.14], { glow: true, r: [0, 0, -0.3] });
      m.box(0.07, 0.05, 0.04, 0xffffff, [-0.06, 0.0, 0.14], { glow: true, r: [0, 0, 0.3] });
      m.box(0.12, 0.03, 0.03, 0xffffff, [0, -0.09, 0.13], { glow: true });
      for (let i = 0; i < 5; i++) flame(m, [(i - 2) * 0.06, 0.1, -0.02 - Math.abs(i - 2) * 0.02], 0.26 - Math.abs(i - 2) * 0.05, 0.05, -0.3);
      m.pop();
    },
    arm: (m) => {
      // arms of fire around rock knuckles
      m.cone(0.11, 0.48, 0xffffff, [0, -0.22, 0], { glow: true, r: [Math.PI, 0, 0] }, 5);
      m.box(0.14, 0.1, 0.12, BASALT, [0, -0.08, 0], { r: [0.3, 0.4, 0], grit: 0.45 });
      m.box(0.16, 0.14, 0.15, BASALT, [0, -0.46, 0.02], { r: [0.2, 0.6, 0.1], grit: 0.45 }); // rock fist
      flame(m, [0, -0.4, 0], 0.22, 0.05, 0.2);
    },
    height: 1.9,
    hb: [0.8, 1.6, 0.8],
  });
}

// ------------------------------------------------------------------ behemoth

const BH = 0x6a6056;
const BH_D = 0x3a342e;
const BH_PLATE = 0x4a443c;

function darkBehemoth(): BipedRig {
  const K = new Kit('behemoth', 0xffa020, 1.8);
  return man(K, {
    bulk: 1.6, legScale: 1.15,
    restArm: -0.3,
    headOff: [0, 0.06, 0.34],
    leg: (m, side, L) => {
      leg(m, side, L, { thigh: BH, shin: BH_D, claws: C.CLAW, w: 0.3, grit: 0.3 });
      m.box(0.32, 0.18, 0.1, BH_PLATE, [0, -L * 0.48, 0.16], { grit: 0.4 }); // knee plate
      m.ring(0.17, 0.025, C.IRON_D, [0, -L + 0.2, 0.02], { grit: 0.4 }, Math.PI * 2, 8); // shackle
    },
    torso: (m) => {
      strips(m, [[-0.36, 0.5, 0.3], [-0.12, 0.6, 0.32], [0.12, 0.5, 0.32], [0.36, 0.56, 0.3]], 0x3a2a1c, 0.04, { blood: 0.3 });
      belt(m, 1.0, 0.6, 0.06, 0x2a1e14, C.IRON_L);
      m.push([0, 0.06, -0.08], [0.3, 0, 0]); // hunched forward under its own weight
      m.sph(0.5, BH, [0, 0.26, 0.02], { s: [0.92, 0.6, 0.62], grit: 0.25 });
      m.sph(0.5, BH, [0, 0.52, -0.1], { s: [1.12, 0.42, 0.62], grit: 0.25 }); // mountainous shoulders
      // stone-like plates and bony spurs over the back
      for (let i = 0; i < 5; i++) {
        m.box(0.34 - Math.abs(i - 2) * 0.05, 0.08, 0.2, BH_PLATE, [0, 0.82 - i * 0.12, -0.3 - Math.sin(i / 4 * Math.PI) * 0.05], { r: [-0.6, 0, 0], grit: 0.45 });
        m.spike([0, 0.86 - i * 0.12, -0.32], [0, 0.6, -1], 0.18 - Math.abs(i - 2) * 0.03, 0.05, C.HORN_L);
      }
      for (const s of [-1, 1]) m.spike([s * 0.5, 0.72, -0.08], [s, 0.7, -0.2], 0.22, 0.06, C.HORN_L);
      // a broken chain across the chest, scars
      for (let i = 0; i < 6; i++) m.ring(0.04, 0.012, C.IRON_D, [-0.3 + i * 0.12, 0.32 + i * 0.07, 0.3], { r: [Math.PI / 2, 0, i % 2 ? 0 : Math.PI / 2] }, Math.PI * 2, 6);
      for (let i = 0; i < 3; i++) m.box(0.016, 0.34, 0.01, C.SCAR, [-0.1 + i * 0.06, 0.3, 0.32], { r: [0, 0, -0.5], flat: true });
      m.pop();
    },
    head: (m) => {
      m.ao = 0.08;
      m.push([0, 0, 0.06], [-0.25, 0, 0], [1.6, 1.6, 1.6]); // face tipped up toward the camera
      m.sph(0.14, BH, [0, 0, 0], { s: [1.15, 0.9, 1], grit: 0.25 });
      m.box(0.28, 0.12, 0.16, BH, [0, -0.08, 0.06], { grit: 0.2 }); // jutting jaw
      m.box(0.26, 0.06, 0.08, BH_D, [0, 0.05, 0.1]); // brow shelf
      m.box(0.06, 0.035, 0.04, C.SOCKET, [0.06, 0.01, 0.13], { flat: true });
      m.box(0.06, 0.035, 0.04, C.SOCKET, [-0.06, 0.01, 0.13], { flat: true });
      m.eyes(0.06, 0.012, 0.15, 0.05, 0.025, 0.25);
      m.box(0.2, 0.025, 0.02, C.MOUTH, [0, -0.1, 0.14], { flat: true });
      for (const s of [-1, 1]) {
        m.spike([s * 0.1, -0.12, 0.12], [s * 0.3, 1, 0.2], 0.12, 0.03, C.FANG, { flat: true }); // tusks
        m.horn([[s * 0.12, 0.06, -0.02], [s * 0.26, 0.04, -0.06], [s * 0.32, 0.14, 0.02], [s * 0.28, 0.24, 0.1]], 0.05, C.HORN, C.HORN_L); // curling ram horns
      }
      m.pop();
    },
    arm: (m, side) => {
      arm(m, side, { upper: BH, fore: BH, hand: BH_D, shoulder: BH, bracer: C.IRON_D, w: 0.3, blood: side < 0 ? 0.3 : 0 });
      m.box(0.34, 0.2, 0.34, BH_D, [0, -0.5, 0.02], { grit: 0.3, blood: 0.25 }); // huge fists
      for (const dx of [-0.08, 0, 0.08]) m.spike([dx, -0.5, 0.17], [0, 0, 1], 0.08, 0.03, C.HORN_L); // knuckle spurs
      m.seg([side * 0.12, -0.3, 0.0], [side * 0.18, -0.62, -0.06], 0.02, 0.02, C.IRON_D); // trailing chain
    },
    height: 2.4,
    hb: [1.2, 2.2, 1.1],
  });
}

// ------------------------------------------------------------------ frost giants

const FG_SKIN = 0x7a90a0;
const FG_SKIN_D = 0x4a5a68;
const FG_HAIR = 0xd8dcdc;
const FG_FUR = 0x5a5044;
const ICE = 0xbfe6f5;
const ICE_D = 0x6a9ab8;

function fgLeg(m: Mesher, side: number, L: number): void {
  leg(m, side, L, { thigh: FG_FUR, shin: FG_SKIN, boot: 0x3a3430, wraps: C.LEATHER, w: 0.24 });
  m.box(0.28, 0.1, 0.3, FG_HAIR, [0, -L + 0.22, 0.03], { grit: 0.5 }); // frosted fur boot tops
  m.spike([0, -L * 0.5, 0.12], [0, -1, 0.3], 0.12, 0.02, ICE, { flat: true }); // icicle
}

function fgTorso(o: { plate?: boolean; cloak?: number }) {
  return (m: Mesher): void => {
    strips(m, [[-0.3, 0.46, 0.25], [-0.1, 0.54, 0.26], [0.1, 0.46, 0.26], [0.3, 0.5, 0.25], [-0.2, 0.5, -0.25], [0.2, 0.46, -0.25]], FG_FUR, 0.04, { grit: 0.45 });
    belt(m, 0.86, 0.5, 0.07, C.LEATHER, ICE_D);
    m.box(0.72, 0.36, 0.42, FG_SKIN, [0, 0.24, 0], { grit: 0.15 });
    m.sph(0.5, FG_SKIN, [0, 0.5, 0], { s: [0.92, 0.34, 0.5], grit: 0.15 });
    m.box(0.06, 0.3, 0.02, ICE_D, [0.14, 0.32, 0.215], { r: [0, 0, 0.4], flat: true }); // frost-scars
    m.box(0.06, 0.3, 0.02, ICE_D, [-0.14, 0.32, 0.215], { r: [0, 0, -0.4], flat: true });
    if (o.plate) {
      m.box(0.76, 0.3, 0.46, 0x5a6a78, [0, 0.42, 0], { grit: 0.3 });
      for (let i = 0; i < 4; i++) m.box(0.78, 0.02, 0.47, ICE, [0, 0.3 + i * 0.08, 0], { flat: true });
    }
    m.sph(0.5, FG_HAIR, [0, 0.64, -0.04], { s: [1.0, 0.18, 0.56], grit: 0.5 }); // white fur mantle
    for (const s of [-1, 1]) pauldron(m, s, [s * 0.44, 0.64, 0], 0.16, 0x4a5462, FG_FUR, ICE);
    if (o.cloak !== undefined) strips(m, [[-0.3, 1.0, -0.26], [-0.1, 1.15, -0.28], [0.1, 1.05, -0.28], [0.3, 0.95, -0.26]], o.cloak, 0.66, { grit: 0.45 });
    for (let i = 0; i < 5; i++) m.spike([-0.3 + i * 0.15, 0.6, -0.3], [0, -1, -0.1], 0.1, 0.02, ICE, { flat: true }); // icicles on the mantle
  };
}

function fgHead(o: { female?: boolean }) {
  return (m: Mesher): void => {
    m.ao = 0.08;
    m.push([0, 0, 0.04], [-0.12, 0, 0], [1.15, 1.15, 1.15]);
    face(m, { skin: FG_SKIN, skinD: FG_SKIN_D, r: 0.19, glow: true, scar: !o.female, beard: o.female ? undefined : FG_HAIR, beardLen: 1.2, mouth: !!o.female });
    m.sph(0.2, FG_HAIR, [0, 0.07, -0.06], { s: [1.08, 0.9, 1.1], grit: 0.4 });
    if (o.female) {
      for (const s of [-1, 1]) m.horn([[s * 0.16, 0.0, -0.06], [s * 0.2, -0.24, -0.04], [s * 0.18, -0.5, 0.0]], 0.045, FG_HAIR, FG_HAIR, { grit: 0.35 }); // long braids
      m.ring(0.2, 0.016, ICE, [0, 0.12, -0.02], {}, Math.PI * 2, 10); // ice circlet
      for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; m.spike([Math.sin(a) * 0.2, 0.12, Math.cos(a) * 0.2], [Math.sin(a) * 0.2, 1, 0.2], 0.1 + (i === 2 ? 0.06 : 0), 0.02, ICE, { flat: true }); }
    } else {
      // horned helm of black iron rimed with frost
      m.sph(0.21, 0x3a424c, [0, 0.1, -0.02], { s: [1.05, 0.62, 1.08], grit: 0.35 });
      m.box(0.44, 0.04, 0.44, ICE, [0, 0.07, -0.01], { flat: true });
      for (const s of [-1, 1]) m.horn([[s * 0.18, 0.14, -0.02], [s * 0.32, 0.22, -0.06], [s * 0.38, 0.38, -0.02]], 0.045, C.HORN_L, ICE);
    }
    m.pop();
  };
}

function iceBlade(m: Mesher): void {
  // the glacial cleaver: a broad blade of blue-black ice on a bone haft
  m.cyl(0.03, 0.035, 0.42, C.BONE, [0, 0, 0.06], { r: [Math.PI / 2, 0, 0] });
  m.box(0.26, 0.05, 0.05, ICE_D, [0, 0, 0.26]);
  m.poly([[-0.05, 0], [0.09, 0], [0.13, 0.7], [0.0, 0.9], [-0.09, 0.62]], ICE_D, [0, 0, 0.28], { r: [-Math.PI / 2, 0, Math.PI / 2], grit: 0.3, blood: 0.2 }, 0.05);
  m.poly([[-0.02, 0.05], [0.05, 0.05], [0.07, 0.6], [0.0, 0.78]], 0xffffff, [0, 0.003, 0.28], { r: [-Math.PI / 2, 0, Math.PI / 2], glow: true }, 0.055);
}

function darkFrostGiant(): BipedRig {
  const K = new Kit('frost_giant', 0x8ae0ff, 2.0);
  return man(K, {
    bulk: 1.5, legScale: 1.25,
    leg: fgLeg,
    torso: fgTorso({ plate: true, cloak: FG_FUR }),
    head: fgHead({}),
    arm: (m, side) => {
      arm(m, side, { upper: FG_SKIN, fore: FG_SKIN, hand: FG_SKIN_D, shoulder: FG_SKIN, bracer: 0x4a5462, spikes: ICE, w: 0.24, blood: side < 0 ? 0.15 : 0 });
      if (side < 0) { m.push([0, -0.5, 0.04], [0, 0, 0], [1.4, 1.4, 1.4]); iceBlade(m); m.pop(); }
    },
    height: 2.6,
    hb: [1.1, 2.4, 1.0],
  });
}

function darkFrostGiantess(): BipedRig {
  const K = new Kit('frost_giantess', 0x8ae0ff, 2.0);
  return man(K, {
    bulk: 1.4, legScale: 1.2,
    restArm: -0.7,
    leg: fgLeg,
    torso: (m) => {
      fgTorso({ cloak: 0x3a4a5a })(m);
      m.box(0.74, 0.22, 0.46, 0x3a4a5a, [0, 0.44, 0.0], { grit: 0.35 }); // fur-trimmed bodice
    },
    head: fgHead({ female: true }),
    arm: (m, side) => {
      arm(m, side, { upper: FG_SKIN, fore: FG_SKIN, hand: FG_SKIN_D, shoulder: FG_SKIN, bracer: FG_HAIR, w: 0.22 });
      if (side < 0) {
        // a boulder of old blue ice, ready to hurl
        m.push([0, -0.52, 0.2]);
        m.sph(0.3, ICE_D, [0, 0, 0.1], { s: [1, 0.85, 1], grit: 0.4 }, 1);
        m.sph(0.2, ICE, [0.08, 0.1, 0.18], { grit: 0.3 }, 0);
        m.sph(0.1, 0xffffff, [-0.06, 0.02, 0.3], { glow: true }, 0);
        m.pop();
      }
    },
    height: 2.5,
    hb: [1.05, 2.3, 1.0],
  });
}

// ------------------------------------------------------------------ ice golem

function darkIceGolem(): BipedRig {
  const K = new Kit('ice_golem', 0x6ad8ff, 2.4);
  const BLK = 0x7a9ab0;
  const BLK_D = 0x3e5a70;
  const STONE = 0x3a3e44;
  const chunk = (m: Mesher, at: V3, s: V3, r: V3, c = BLK) => m.box(s[0], s[1], s[2], c, at, { r, grit: 0.35 });
  return man(K, {
    bulk: 1.5, legScale: 1.0,
    restArm: -0.25,
    leg: (m, side, L) => {
      chunk(m, [0, -L * 0.3, 0], [0.3, L * 0.55, 0.3], [0.05, side * 0.1, 0]);
      chunk(m, [0, -L * 0.78, 0.02], [0.26, L * 0.4, 0.28], [-0.05, side * 0.2, 0.04], BLK_D);
      chunk(m, [0, -L + 0.06, 0.06], [0.34, 0.12, 0.4], [0, 0, 0], STONE);
    },
    torso: (m) => {
      chunk(m, [0, 0.06, 0], [0.6, 0.2, 0.4], [0, 0.1, 0], STONE); // frozen rubble hips
      chunk(m, [0, 0.4, 0], [0.86, 0.6, 0.5], [0.1, 0.05, 0]);
      chunk(m, [0.22, 0.62, -0.05], [0.5, 0.3, 0.46], [0.2, 0.3, 0.1], BLK_D);
      chunk(m, [-0.24, 0.6, -0.02], [0.46, 0.34, 0.44], [-0.1, -0.2, -0.15]);
      // a glowing heart-shard deep in the chest, seen through cracks
      m.sph(0.12, 0xffffff, [0, 0.42, 0.22], { glow: true, s: [1, 1.3, 0.6] }, 0);
      for (const [x, y, rz] of [[0.12, 0.5, 0.6], [-0.1, 0.32, -0.5], [0.15, 0.28, 0.2]] as V3[]) m.box(0.16, 0.02, 0.02, 0xffffff, [x, y, 0.255], { glow: true, r: [0, 0, rz] });
      // crystal spires growing out of the back
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1;
        m.cone(0.07, 0.36 + (i % 3) * 0.14, 0xa8e4f8, [Math.sin(a) * 0.3, 0.86, -0.18 + Math.cos(a) * 0.08], { r: [-0.3 + Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.4], grit: 0.2 }, 4);
      }
    },
    head: (m) => {
      m.push([0, -0.12, 0.08], [0, 0.2, 0], [1.2, 1.2, 1.2]);
      chunk(m, [0, 0, 0], [0.3, 0.24, 0.28], [0.1, 0.2, 0.05], BLK_D);
      m.box(0.2, 0.04, 0.04, 0xffffff, [0, 0.0, 0.14], { glow: true }); // a single glowing slit
      m.cone(0.05, 0.2, 0xa8e4f8, [0.08, 0.18, -0.02], { r: [0, 0, -0.3] }, 4);
      m.pop();
    },
    arm: (m, side) => {
      chunk(m, [0, -0.08, 0], [0.32, 0.3, 0.32], [0.2, 0.3, 0.1]); // shoulder boulder
      chunk(m, [0, -0.34, 0.02], [0.24, 0.3, 0.26], [0.1, -0.2, 0], BLK_D);
      chunk(m, [0, -0.58, 0.04], [0.36, 0.28, 0.36], [0.3, 0.5, 0.2]); // fist of ice
      for (let i = 0; i < 3; i++) m.cone(0.04, 0.16, 0xa8e4f8, [side * 0.12, -0.5 + i * 0.12, -0.08], { r: [0, 0, side * -1.2] }, 4);
    },
    height: 2.2,
    hb: [1.1, 2.0, 1.0],
  });
}

// ------------------------------------------------------------------ ice witch

function darkIceWitch(): BipedRig {
  const K = new Kit('ice_witch', 0x8ae8ff, 2.2);
  const SKIN = 0xb8c4cc;
  const ROBE = 0x1e2a3e;
  const ROBE_L = 0x3a5070;
  return man(K, {
    bulk: 0.92,
    restArm: -0.12,
    leg: (m, side, L) => leg(m, side, L, { thigh: ROBE, shin: ROBE, boot: 0x14181e, w: 0.14 }),
    torso: (m) => {
      m.cyl(0.22, 0.42, 0.66, ROBE, [0, -0.28, 0], { grit: 0.3 }, 9); // long gown
      strips(m, [[-0.26, 0.3, 0.3], [-0.08, 0.36, 0.33], [0.1, 0.3, 0.33], [0.26, 0.34, 0.3]], ROBE_L, -0.46);
      for (let i = 0; i < 6; i++) m.spike([Math.sin(i) * 0.36, -0.6, Math.cos(i) * 0.3], [0, -1, 0], 0.08, 0.018, ICE, { flat: true }); // icicles at the hem
      belt(m, 0.4, 0.26, 0.08, 0x14181e, ICE);
      m.box(0.36, 0.48, 0.24, ROBE, [0, 0.28, 0], { grit: 0.3 });
      m.box(0.2, 0.3, 0.01, ROBE_L, [0, 0.36, 0.125], { flat: true });
      m.sph(0.04, 0xffffff, [0, 0.4, 0.13], { glow: true }, 0); // frozen heart brooch
      m.sph(0.5, 0xd8e0e8, [0, 0.52, -0.02], { s: [0.5, 0.14, 0.34], grit: 0.45 }); // white fur stole
      strips(m, [[-0.16, 1.0, -0.15], [-0.05, 1.12, -0.17], [0.06, 1.05, -0.17], [0.17, 0.96, -0.15]], 0x9ab4c8, 0.58); // long pale cloak
    },
    head: (m) => {
      m.push([0, 0, 0.02], [-0.12, 0, 0]);
      face(m, { skin: SKIN, skinD: 0x7a8894, r: 0.17, glow: true, mouth: true });
      m.box(0.06, 0.12, 0.02, 0x3a4a5a, [0.06, -0.06, 0.155], { flat: true }); // frost-blackened veins
      m.sph(0.18, 0xe8eef2, [0, 0.04, -0.05], { s: [1.02, 1.0, 1.08], grit: 0.3 }); // white hair
      strips(m, [[-0.14, 0.5, -0.12], [0, 0.6, -0.15], [0.14, 0.5, -0.12]], 0xe8eef2, 0.0);
      // a tall crown of icicles
      for (let i = 0; i < 7; i++) {
        const a = -1.2 + i * 0.4;
        m.cone(0.025, 0.16 + (i === 3 ? 0.14 : (i % 2) * 0.06), ICE, [Math.sin(a) * 0.16, 0.2, Math.cos(a) * 0.12], { r: [0, 0, -a * 0.25], grit: 0.2 }, 4);
      }
      m.pop();
    },
    arm: (m, side) => {
      arm(m, side, { upper: ROBE, fore: ROBE_L, hand: SKIN, w: 0.11 });
      for (const dx of [-0.03, 0, 0.03]) m.spike([dx, -0.52, 0.02], [0, -1, 0.1], 0.07, 0.009, 0x2a3440); // long black nails
      if (side < 0) {
        m.push([0, -0.46, 0.0]);
        wStaff(m, {
          len: 1.15, wood: 0xa8b4bc, top: (mm, at) => {
            for (let i = 0; i < 4; i++) { const a = i * 1.57; mm.cone(0.03, 0.2, ICE, [at[0] + Math.sin(a) * 0.06, at[1] + 0.06, at[2] + Math.cos(a) * 0.06], { r: [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4] }, 4); }
            mm.cone(0.06, 0.3, 0xffffff, [at[0], at[1] + 0.14, at[2]], { glow: true }, 4);
          },
        });
        m.pop();
      }
    },
    height: 1.85,
  });
}

export const DARK_GIANTS: Partial<Record<EnemyKind, () => Rig>> = {
  fire_elemental: darkFireElemental,
  behemoth: darkBehemoth,
  frost_giant: darkFrostGiant,
  frost_giantess: darkFrostGiantess,
  ice_golem: darkIceGolem,
  ice_witch: darkIceWitch,
};

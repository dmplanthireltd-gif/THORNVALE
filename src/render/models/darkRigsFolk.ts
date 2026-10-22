import type { EnemyKind } from '../../game/world/WorldMap';
import type { BipedRig, Rig } from './rigs';
import { C, Kit, type Mesher } from './darkRigsCore';
import { arm, belt, face, leg, man, pauldron, shRound, shTower, strips, wAxe, wBow, wCrossbow, wStaff, wSword } from './darkRigsParts';

/**
 * Dark models, batch (c): grim forest elves (gaunt, ash-haired, thorned
 * leathers, faint fey-green eyes) and soot-stained deep dwarves (braided
 * beards, heavy iron, no glow — they are folk, not fiends).
 */

// ------------------------------------------------------------------ elves

const ELF_SKIN = 0xb8b0a0;
const ELF_SKIN_D = 0x7a7064;
const ELF_HAIR = 0xc8c4b8;
const ELF_LEA = 0x2a3424;
const ELF_LEA_L = 0x46553a;
const ELF_CLOAK = 0x1e2a1e;
const THORN = 0x3a2a1a;
const FEY = 0x9affc0;

function elfHead(o: { hood?: number; hair?: number; helm?: (m: Mesher) => void; paint?: number }) {
  return (m: Mesher): void => {
    m.ao = 0.08;
    m.push([0, 0, 0.02], [-0.18, 0, 0], [1.05, 1.08, 1.05]);
    face(m, { skin: ELF_SKIN, skinD: ELF_SKIN_D, r: 0.17, glow: true, ears: 'pointy', paint: o.paint, mouth: true });
    m.box(0.05, 0.12, 0.02, 0x4a4a44, [0.07, -0.04, 0.16], { flat: true }); // sunken cheek shadows
    m.box(0.05, 0.12, 0.02, 0x4a4a44, [-0.07, -0.04, 0.16], { flat: true });
    if (o.hair !== undefined) {
      m.sph(0.18, o.hair, [0, 0.05, -0.04], { s: [1.05, 1.0, 1.08], grit: 0.25 });
      strips(m, [[-0.12, 0.42, -0.1], [0, 0.5, -0.14], [0.12, 0.4, -0.1]], o.hair, -0.02, { grit: 0.3 });
    }
    if (o.hood !== undefined) {
      m.sph(0.21, o.hood, [0, 0.05, -0.04], { s: [1.04, 1.06, 1.08], grit: 0.3 });
      m.box(0.36, 0.05, 0.1, o.hood, [0, 0.15, 0.13], { r: [0.4, 0, 0] });
      m.cone(0.1, 0.26, o.hood, [0, 0.12, -0.24], { r: [-Math.PI / 2 - 0.9, 0, 0] });
    }
    o.helm?.(m);
    m.pop();
  };
}

function elfLeg(thigh: number, boot: number) {
  return (m: Mesher, side: number, L: number): void => {
    leg(m, side, L, { thigh, shin: thigh, boot, wraps: THORN, w: 0.14 });
    m.spike([0, -0.3, 0.08], [0, 0.4, 1], 0.07, 0.015, THORN); // thorned greave
  };
}

function elfTorso(o: { coat: number; trim?: number; cape?: number; quiver?: boolean; plate?: boolean }) {
  return (m: Mesher): void => {
    strips(m, [[-0.15, 0.4, 0.16], [0, 0.48, 0.17], [0.15, 0.38, 0.16], [-0.12, 0.44, -0.16], [0.12, 0.46, -0.16]], o.coat, 0.04);
    belt(m, 0.48, 0.3, 0.07, THORN, C.BRASS);
    m.box(0.42, 0.5, 0.26, o.coat, [0, 0.28, 0], { grit: 0.3, blood: 0.05 }); // lean torso
    m.box(0.44, 0.12, 0.28, o.trim ?? ELF_LEA_L, [0, 0.46, 0], { grit: 0.3 });
    // leaf-shaped plates down the chest
    for (let i = 0; i < 3; i++) m.spike([0, 0.2 + i * 0.1, 0.14], [0, -1, 0.15], 0.1, 0.05, o.plate ? 0x5a6a3a : ELF_LEA_L, { grit: 0.25 }, 4);
    for (const s of [-1, 1]) {
      if (o.plate) pauldron(m, s, [s * 0.26, 0.5, 0], 0.11, 0x4a5a32, 0x2a3420, THORN);
      else m.sph(0.09, o.trim ?? ELF_LEA_L, [s * 0.25, 0.5, 0], { s: [1.1, 0.6, 1.1], grit: 0.3 });
      m.spike([s * 0.27, 0.54, 0], [s * 0.5, 1, -0.3], 0.1, 0.018, THORN); // thorns at the shoulder
    }
    if (o.cape !== undefined) strips(m, [[-0.16, 0.85, -0.17], [-0.05, 0.98, -0.19], [0.06, 0.9, -0.19], [0.17, 0.8, -0.17]], o.cape, 0.55);
    if (o.quiver) {
      m.push([0.1, 0.34, -0.19], [0.15, 0, -0.35]);
      m.cyl(0.065, 0.055, 0.46, C.LEATHER, [0, 0, 0], { grit: 0.3 }, 7);
      for (let i = 0; i < 5; i++) {
        m.seg([(i - 2) * 0.02, 0.2, (i % 2) * 0.02], [(i - 2) * 0.025, 0.36, (i % 2) * 0.02], 0.007, 0.007, C.WOOD);
        m.box(0.008, 0.06, 0.03, i % 2 ? 0x2a2a28 : 0x7a1a14, [(i - 2) * 0.025, 0.34, (i % 2) * 0.02], { flat: true, two: true });
      }
      m.pop();
    }
  };
}

function elfArm(o: { sleeve: number; weapon?: (m: Mesher) => void; off?: (m: Mesher) => void }) {
  return (m: Mesher, side: number): void => {
    arm(m, side, { upper: o.sleeve, fore: ELF_LEA, hand: ELF_SKIN_D, bracer: THORN, w: 0.12 });
    m.spike([side * 0.06, -0.33, -0.02], [side * 0.5, 0.2, -1], 0.08, 0.014, THORN);
    if (side < 0 && o.weapon) { m.push([0, -0.46, 0.04]); o.weapon(m); m.pop(); }
    if (side > 0 && o.off) o.off(m);
  };
}

/** A leaf-shaped elven blade. */
function leafBlade(m: Mesher, len = 0.62): void {
  wSword(m, { len, w: 0.07, blade: 0x8a948a, guard: THORN, grip: C.WOOD_D, blood: 0.55, curve: true });
  m.spike([0, 0, 0.1 + len * 0.55], [0, 0, 1], 0.2, 0.06, 0x8a948a, { blood: 0.4 }, 4);
}

function darkElf(): BipedRig {
  const K = new Kit('elf', FEY, 1.6);
  return man(K, {
    bulk: 0.92,
    leg: elfLeg(ELF_LEA, 0x1e1810),
    torso: elfTorso({ coat: ELF_LEA, cape: ELF_CLOAK }),
    head: elfHead({ hair: ELF_HAIR }),
    arm: elfArm({ sleeve: ELF_LEA_L, weapon: (m) => leafBlade(m), off: (m) => shRound(m, { r: 0.22, wood: 0x3a2e1e, rim: THORN, boss: 0x5a6a3a, paint: 0x2a4a22, spike: true }) }),
    height: 1.75,
  });
}

function darkElfScout(): BipedRig {
  const K = new Kit('elf_scout', FEY, 1.6);
  return man(K, {
    bulk: 0.9,
    leg: elfLeg(0x3a3420, 0x1e1810),
    torso: elfTorso({ coat: 0x3a3420, trim: 0x5a4a2a, quiver: true, cape: 0x2a2a1a }),
    head: (m) => {
      elfHead({ hood: 0x2a3020 })(m);
      m.box(0.3, 0.1, 0.24, 0x3a3420, [0, -0.11, 0.08], { grit: 0.3 }); // face wrap
    },
    arm: elfArm({ sleeve: 0x3a3420, off: (m) => { m.push([0, -0.46, 0.04]); wBow(m, { len: 1.05, wood: 0x2e2216 }); m.pop(); } }),
    height: 1.75,
  });
}

function darkElfArcanist(): BipedRig {
  const K = new Kit('elf_arcanist', 0x5affe0, 1.8);
  const ROBE = 0x1e3438;
  const ROBE_L = 0x3a5a58;
  return man(K, {
    bulk: 0.9,
    restArm: -0.12,
    leg: (m, side, L) => leg(m, side, L, { thigh: ROBE, shin: ROBE, boot: 0x1e1810, w: 0.14 }),
    torso: (m) => {
      m.cyl(0.22, 0.34, 0.62, ROBE, [0, -0.26, 0], { grit: 0.3 }, 8);
      strips(m, [[-0.2, 0.3, 0.26], [0.0, 0.36, 0.3], [0.2, 0.32, 0.26]], ROBE_L, -0.4);
      belt(m, 0.46, 0.3, 0.05, THORN, 0xffffff);
      m.box(0.4, 0.5, 0.26, ROBE, [0, 0.28, 0], { grit: 0.3 });
      m.box(0.08, 0.5, 0.27, ROBE_L, [0, 0.28, 0.001]);
      // glowing runes stitched into the robe
      for (let i = 0; i < 3; i++) m.box(0.04, 0.04, 0.01, 0xffffff, [0, 0.16 + i * 0.12, 0.14], { glow: true, r: [0, 0, 0.78] });
      m.sph(0.5, 0x2a2a20, [0, 0.52, -0.02], { s: [0.5, 0.16, 0.32], grit: 0.3 }); // mantle
      for (const s of [-1, 1]) m.horn([[s * 0.15, 0.55, -0.08], [s * 0.24, 0.72, -0.14], [s * 0.2, 0.86, -0.12]], 0.025, THORN, THORN); // thorned collar
      strips(m, [[-0.15, 0.88, -0.16], [0, 1.0, -0.18], [0.15, 0.86, -0.16]], ROBE, 0.55);
    },
    head: elfHead({
      hair: 0xe0dcd0, helm: (m) => {
        // circlet of black thorns with a glowing shard
        m.ring(0.16, 0.014, THORN, [0, 0.09, -0.01], {}, Math.PI * 2, 10);
        for (let i = 0; i < 6; i++) { const a = i * 1.05; m.spike([Math.sin(a) * 0.16, 0.1, Math.cos(a) * 0.16], [Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3], 0.08, 0.012, THORN); }
        m.spike([0, 0.08, 0.17], [0, 1, 0.2], 0.08, 0.02, 0xffffff, { glow: true });
      },
    }),
    arm: (m, side) => {
      arm(m, side, { upper: ROBE, fore: ROBE_L, hand: ELF_SKIN_D, w: 0.12 });
      if (side < 0) {
        m.push([0, -0.46, 0.0]);
        wStaff(m, {
          len: 1.1, wood: 0x4a4030, top: (mm, at) => {
            for (const s of [-1, 1]) mm.horn([[0, at[1] - 0.08, at[2]], [s * 0.1, at[1] + 0.06, at[2]], [s * 0.06, at[1] + 0.22, at[2]]], 0.022, 0x4a4030, THORN);
            mm.cone(0.06, 0.24, 0xffffff, [at[0], at[1] + 0.1, at[2]], { glow: true }, 4);
            mm.cone(0.06, 0.12, 0xffffff, [at[0], at[1] - 0.04, at[2]], { glow: true, r: [Math.PI, 0, 0] }, 4);
          },
        });
        m.pop();
      }
    },
    height: 1.8,
  });
}

function darkElfWarden(): BipedRig {
  const K = new Kit('elf_warden', FEY, 1.7);
  const PLATE = 0x4a5a32;
  return man(K, {
    bulk: 1.0,
    leg: (m, side, L) => {
      leg(m, side, L, { thigh: ELF_LEA, shin: PLATE, boot: 0x1e1810, knee: 0x6a7a42, w: 0.15 });
      m.spike([0, -0.3, 0.1], [0, 0.5, 1], 0.09, 0.02, THORN);
    },
    torso: elfTorso({ coat: PLATE, trim: 0x2a3420, cape: 0x1a2a18, quiver: true, plate: true }),
    head: elfHead({
      hair: ELF_HAIR, helm: (m) => {
        // leaf-plated helm with antler-like thorn crown
        m.sph(0.185, PLATE, [0, 0.07, -0.02], { s: [1.04, 0.72, 1.06], grit: 0.25 });
        m.box(0.34, 0.035, 0.05, 0x6a7a42, [0, 0.05, 0.15], { flat: true });
        for (const s of [-1, 1]) {
          m.horn([[s * 0.1, 0.16, -0.04], [s * 0.2, 0.3, -0.1], [s * 0.26, 0.46, -0.06], [s * 0.24, 0.56, 0.02]], 0.03, THORN, 0x6a5a40);
          m.horn([[s * 0.2, 0.3, -0.1], [s * 0.32, 0.36, -0.04], [s * 0.36, 0.42, 0.02]], 0.016, THORN, 0x6a5a40);
        }
      },
    }),
    arm: elfArm({ sleeve: PLATE, off: (m) => { m.push([0, -0.46, 0.04]); wBow(m, { len: 1.3, wood: 0x2e2216 }); m.pop(); } }),
    height: 1.95,
    hb: [0.8, 1.7, 0.8],
  });
}

// ------------------------------------------------------------------ dwarves

const DW_SKIN = 0xb88a6a;
const DW_SKIN_D = 0x7a5642;
const SOOT = 0x2a2420;

function dwarfHead(o: { beard: number; helm?: (m: Mesher) => void }) {
  return (m: Mesher): void => {
    m.ao = 0.08;
    m.push([0, -0.02, 0.03], [-0.15, 0, 0], [1.1, 1.05, 1.1]);
    face(m, { skin: DW_SKIN, skinD: DW_SKIN_D, r: 0.18, beard: o.beard, beardLen: 1.3, scar: true, eye: 0xf0e8d0 });
    m.box(0.3, 0.06, 0.05, SOOT, [0, 0.04, 0.17], { flat: true }); // soot across the eyes
    m.sph(0.07, DW_SKIN_D, [0, -0.02, 0.19], { s: [1, 0.8, 0.9] }); // big nose
    // braided moustache and beard rings
    for (const s of [-1, 1]) m.horn([[s * 0.05, -0.07, 0.18], [s * 0.12, -0.14, 0.17], [s * 0.13, -0.28, 0.14]], 0.022, o.beard, o.beard, { grit: 0.3 });
    m.ring(0.03, 0.012, C.BRASS, [0, -0.36, 0.13], { flat: true }, Math.PI * 2, 8);
    o.helm?.(m);
    m.pop();
  };
}

function dwarfTorso(o: { coat: number; plate?: number; tabard?: number; trim?: number; apron?: boolean }) {
  return (m: Mesher): void => {
    const w = 0.62;
    m.box(w, 0.2, 0.42, o.coat, [0, 0.04, 0], { grit: 0.3 });
    if (o.apron) strips(m, [[0, 0.42, 0.22]], 0x3a2a1c, 0.1);
    if (o.tabard !== undefined) strips(m, [[-0.07, 0.36, 0.24], [0.07, 0.32, 0.24]], o.tabard, 0.06, { blood: 0.15 });
    belt(m, w + 0.06, 0.46, 0.08, C.LEATHER, C.BRASS);
    m.box(w, 0.42, 0.4, o.plate ?? o.coat, [0, 0.32, 0], { grit: 0.3, blood: 0.05 }); // barrel chest
    m.sph(0.5, o.plate ?? o.coat, [0, 0.48, 0], { s: [w * 1.12, 0.26, 0.44], grit: 0.3 });
    if (o.trim !== undefined) {
      m.box(w * 1.02, 0.035, 0.42, o.trim, [0, 0.18, 0], { flat: true });
      m.box(0.05, 0.36, 0.03, o.trim, [0, 0.33, 0.21], { flat: true });
    }
    for (const s of [-1, 1]) pauldron(m, s, [s * 0.35, 0.52, 0], 0.15, o.plate ?? o.coat, o.trim ?? C.IRON_D);
    for (let i = 0; i < 3; i++) m.box(0.06, 0.06, 0.02, SOOT, [-0.15 + i * 0.13, 0.3 - i * 0.04, 0.205], { flat: true }); // soot smudges
  };
}

function dwarfArm(o: { sleeve: number; gaunt?: number; weapon?: (m: Mesher) => void; off?: (m: Mesher) => void }) {
  return (m: Mesher, side: number): void => {
    arm(m, side, { upper: o.sleeve, fore: o.sleeve, hand: o.gaunt ?? DW_SKIN_D, bracer: o.gaunt ?? C.LEATHER, w: 0.17 });
    if (side < 0 && o.weapon) { m.push([0, -0.48, 0.04]); o.weapon(m); m.pop(); }
    if (side > 0 && o.off) o.off(m);
  };
}

function dwarfLeg(thigh: number, boot: number, knee?: number) {
  return (m: Mesher, side: number, L: number): void => leg(m, side, L, { thigh, shin: thigh, boot, knee, w: 0.2 });
}

function darkDwarf(): BipedRig {
  const K = new Kit('dwarf', 0xffffff, 1);
  return man(K, {
    bulk: 1.18, legScale: 0.6,
    leg: dwarfLeg(0x4a3a2a, 0x2a1e14),
    torso: dwarfTorso({ coat: 0x5a4a32, apron: true }),
    head: dwarfHead({
      beard: 0x8a3a18, helm: (m) => {
        // dented iron mining cap with a candle stub
        m.sph(0.19, C.IRON, [0, 0.08, -0.02], { s: [1.08, 0.62, 1.1], grit: 0.4 });
        m.box(0.42, 0.03, 0.42, C.IRON_D, [0, 0.04, 0], { grit: 0.3 });
        m.cyl(0.025, 0.025, 0.08, 0xd8d0b0, [0, 0.2, 0.08], {}, 5);
        m.sph(0.025, 0xffffff, [0, 0.26, 0.08], { glow: true }, 0);
      },
    }),
    arm: dwarfArm({ sleeve: 0x5a4a32, weapon: (m) => wAxe(m, { len: 0.45, size: 0.85, blood: 0.4, spike: true }) }),
    height: 1.5,
    hb: [0.8, 1.3, 0.8],
  });
}

function darkDwarfSoldier(): BipedRig {
  const K = new Kit('dwarf_soldier', 0xffffff, 1);
  const PLATE = 0x5a6068;
  return man(K, {
    bulk: 1.18, legScale: 0.6,
    leg: dwarfLeg(0x2a2a30, PLATE, C.IRON_L),
    torso: dwarfTorso({ coat: 0x22304a, plate: PLATE, tabard: 0x22304a, trim: C.BRASS }),
    head: dwarfHead({
      beard: 0x4a2a14, helm: (m) => {
        m.sph(0.2, PLATE, [0, 0.07, -0.02], { s: [1.08, 0.7, 1.1], grit: 0.3 });
        m.box(0.4, 0.04, 0.05, C.BRASS, [0, 0.04, 0.17], { flat: true });
        m.box(0.04, 0.12, 0.05, PLATE, [0, -0.02, 0.2]);
        for (const s of [-1, 1]) m.box(0.05, 0.16, 0.12, PLATE, [s * 0.19, -0.06, 0.06]);
      },
    }),
    arm: dwarfArm({ sleeve: PLATE, gaunt: C.IRON_D, weapon: (m) => wCrossbow(m, { metal: C.IRON_D }) }),
    height: 1.5,
    hb: [0.8, 1.3, 0.8],
  });
}

function darkDwarfGuard(): BipedRig {
  const K = new Kit('dwarf_guard', 0xffffff, 1);
  const PLATE = 0x6a6e74;
  const RED = 0x5a1410;
  return man(K, {
    bulk: 1.28, legScale: 0.6,
    leg: dwarfLeg(PLATE, C.IRON_D, C.GOLD),
    torso: dwarfTorso({ coat: RED, plate: PLATE, tabard: RED, trim: C.GOLD }),
    head: dwarfHead({
      beard: 0xd8d0c0, helm: (m) => {
        // great helm with a face plate and bull horns
        m.sph(0.21, PLATE, [0, 0.06, -0.01], { s: [1.08, 0.8, 1.1], grit: 0.3 });
        m.box(0.3, 0.14, 0.04, PLATE, [0, 0.0, 0.19], { grit: 0.25 });
        m.box(0.24, 0.03, 0.02, C.SOCKET, [0, 0.02, 0.215], { flat: true }); // eye slit
        m.box(0.42, 0.04, 0.05, C.GOLD, [0, 0.1, 0.16], { flat: true });
        for (const s of [-1, 1]) m.horn([[s * 0.18, 0.1, 0], [s * 0.32, 0.16, 0.02], [s * 0.38, 0.3, 0.06]], 0.045, 0xd8ccb0, 0x6a5a40);
      },
    }),
    arm: dwarfArm({
      sleeve: PLATE, gaunt: C.IRON_D,
      weapon: (m) => wAxe(m, { len: 0.62, size: 1.15, double: true, head: 0x7a7e84, blood: 0.5 }),
      off: (m) => shTower(m, { w: 0.42, h: 0.6, face: PLATE, rim: C.GOLD, emblem: RED }),
    }),
    height: 1.55,
    hb: [0.85, 1.35, 0.85],
  });
}

export const DARK_FOLK: Partial<Record<EnemyKind, () => Rig>> = {
  elf: darkElf,
  elf_scout: darkElfScout,
  elf_arcanist: darkElfArcanist,
  elf_warden: darkElfWarden,
  dwarf: darkDwarf,
  dwarf_soldier: darkDwarfSoldier,
  dwarf_guard: darkDwarfGuard,
};

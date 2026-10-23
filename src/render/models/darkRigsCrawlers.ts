import type { EnemyKind } from '../../game/world/WorldMap';
import type { BipedRig, QuadRig, Rig } from './rigs';
import { C, hitbox, Kit, quadRig, type Mesher, type V3 } from './darkRigsCore';
import { arm, belt, leg, man, pauldron, strips, wSpear, wSword } from './darkRigsParts';

/**
 * Dark models, batch (f): things that crawl — the crocodile, the tarantula,
 * the crystal spider, the scorpion and the scarab — and the lizardfolk
 * (sentinel, templar).
 */

// ------------------------------------------------------------------ crocodile

function darkCrocodile(): QuadRig {
  const K = new Kit('crocodile', 0xd8b030, 1.4);
  const HIDE = 0x3a4228;
  const HIDE_D = 0x1e2416;
  const BELLY = 0x8a8458;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.ao = 0.25;
    m.sph(0.5, HIDE, [0, 0.2, 0.0], { s: [0.56, 0.26, 1.2], grit: 0.25 }); // long flat body
    m.sph(0.5, BELLY, [0, 0.13, 0.0], { s: [0.48, 0.12, 1.1], grit: 0.15 });
    // rows of bony scutes down the back and flanks
    for (let i = 0; i < 9; i++) {
      const z = 0.48 - i * 0.12;
      const w = 0.42 - Math.abs(i - 4) * 0.03;
      for (const s of [-1, 1]) {
        m.box(0.07, 0.05, 0.09, i % 2 ? HIDE_D : HIDE, [s * 0.07, 0.32, z], { r: [0, 0, s * 0.2], grit: 0.35 });
        m.box(0.06, 0.04, 0.08, HIDE_D, [s * w * 0.42, 0.28, z], { r: [0, 0, s * 0.5], grit: 0.35 });
      }
    }
    for (let i = 0; i < 3; i++) m.box(0.014, 0.012, 0.18, 0x9a120c, [0.27, 0.22 - i * 0.03, -0.1], { r: [0.3, 0, 0], blood: 1, flat: true });
  });
  const head = K.limb('head', [0, 0.2, 0.58], (m) => {
    m.ao = 0.1;
    m.box(0.26, 0.12, 0.22, HIDE, [0, 0.02, 0.06], { grit: 0.25 }); // skull
    m.box(0.18, 0.07, 0.42, HIDE, [0, 0.0, 0.36], { grit: 0.25 }); // long snout
    m.box(0.14, 0.05, 0.4, HIDE_D, [0, -0.06, 0.34], { grit: 0.2 }); // lower jaw
    m.box(0.12, 0.012, 0.36, C.GUM, [0, -0.033, 0.34], { flat: true, blood: 0.3 });
    // interlocking teeth along the jaw line
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) m.spike([s * 0.085, -0.03 + (i % 2) * 0.01, 0.18 + i * 0.05], [s * 0.2, i % 2 ? -1 : 1, 0], 0.04, 0.009, C.FANG, { flat: true });
    for (const s of [-1, 1]) {
      m.sph(0.045, HIDE_D, [s * 0.08, 0.09, 0.06], { s: [1, 0.8, 1.2] }); // raised eye bumps
      m.box(0.035, 0.02, 0.03, 0xffffff, [s * 0.08, 0.11, 0.09], { glow: true });
      m.sph(0.016, 0x0a0806, [s * 0.04, 0.04, 0.56], { flat: true }, 0); // nostrils
    }
  });
  const leg = (front: boolean, sd: number) => (m: Mesher) => {
    // short sprawling legs with webbed claws (sd: +1 left, -1 right)
    m.ao = 0.2;
    const fz = front ? 0.04 : -0.04;
    m.sph(0.07, HIDE, [0, 0, 0], { grit: 0.25 });
    m.seg([0, 0, 0], [sd * 0.12, -0.06, fz], 0.06, 0.045, HIDE, { grit: 0.25 });
    m.seg([sd * 0.12, -0.06, fz], [sd * 0.14, -0.17, fz * 2], 0.045, 0.035, HIDE_D);
    m.box(0.12, 0.03, 0.1, HIDE_D, [sd * 0.15, -0.18, fz * 2 + 0.03]);
    for (const dx of [-0.035, 0, 0.035]) m.spike([sd * 0.15 + dx, -0.185, fz * 2 + 0.07], [0, -0.2, 1], 0.05, 0.01, C.CLAW);
  };
  const legs = [
    K.limb('frontL', [0.2, 0.18, 0.36], leg(true, 1)),
    K.limb('frontR', [-0.2, 0.18, 0.36], leg(true, -1)),
    K.limb('backL', [0.22, 0.18, -0.36], leg(false, 1)),
    K.limb('backR', [-0.22, 0.18, -0.36], leg(false, -1)),
  ];
  const tail = K.limb('tail', [0, 0.2, -0.58], (m) => {
    m.ao = 0.2;
    const pts: V3[] = [[0, 0, 0], [0.02, -0.03, -0.3], [0.08, -0.06, -0.6], [0.18, -0.08, -0.86], [0.3, -0.09, -1.06]];
    const r = [0.15, 0.12, 0.085, 0.055, 0.025];
    m.push([0, 0, 0], [0, 0, 0], [1, 0.7, 1]);
    m.tube(pts, r, HIDE, { grit: 0.25 }, 7);
    m.pop();
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      const p = pts[Math.floor(t * 4)];
      const q = pts[Math.floor(t * 4) + 1];
      const f = t * 4 - Math.floor(t * 4);
      const at: V3 = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
      for (const s of [-1, 1]) m.spike([at[0] + s * 0.03, at[1] + 0.07 * (1 - t), at[2]], [s * 0.2, 1, -0.3], 0.07 * (1 - t * 0.6), 0.025, HIDE_D, {}, 3);
    }
  });
  return quadRig(K, { body, head, legs, tail }, hitbox(0.9, 0.6, 1.6), 0.6);
}

// ------------------------------------------------------------------ spiders

interface SpiderLook { chitin: number; chitinD: number; hair?: number; mark: number; eye: number; fang: number; crystals?: number }

/** An eight-legged spider: body, cephalothorax with eye cluster and fangs, four leg pairs. */
function spider(K: Kit, o: SpiderLook, size: number): QuadRig {
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.ao = 0.3;
    m.push([0, 0, 0], [0, 0, 0], [size, size, size]);
    m.sph(0.5, o.chitin, [0, 0.38, -0.3], { s: [0.62, 0.5, 0.7], grit: 0.3 }); // swollen abdomen
    m.sph(0.5, o.chitinD, [0, 0.3, -0.28], { s: [0.5, 0.3, 0.6] });
    // markings on the abdomen (an hourglass of blood-orange or pale veins)
    m.box(0.08, 0.03, 0.26, o.mark, [0, 0.62, -0.3], { r: [0.2, 0, 0], flat: true });
    for (const s of [-1, 1]) m.box(0.16, 0.03, 0.05, o.mark, [s * 0.1, 0.6, -0.26 - s * 0.04], { r: [0.1, s * 0.6, 0], flat: true });
    m.sph(0.5, o.chitin, [0, 0.36, 0.1], { s: [0.4, 0.26, 0.38], grit: 0.25 }); // cephalothorax
    if (o.hair !== undefined) for (let i = 0; i < 18; i++) {
      const a = i * 2.4;
      const zz = -0.3 + Math.sin(a * 1.3) * 0.26;
      m.spike([Math.cos(a) * 0.24, 0.48 + Math.sin(a) * 0.08, zz], [Math.cos(a), 0.8, Math.sin(a) * 0.3], 0.07, 0.012, o.hair, {}, 3);
    }
    if (o.crystals !== undefined) for (let i = 0; i < 8; i++) {
      const a = i * 2.4;
      const at: V3 = [Math.cos(a) * 0.14, 0.58, -0.3 + Math.sin(a) * 0.18];
      m.cone(0.05, 0.22 + (i % 3) * 0.08, 0xffffff, [at[0], at[1] + 0.1, at[2]], { glow: true, r: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.5] }, 4);
    }
    m.pop();
  });
  const head = K.limb('head', [0, 0.36 * size, 0.28 * size], (m) => {
    m.push([0, 0, 0], [0, 0, 0], [size, size, size]);
    m.sph(0.1, o.chitinD, [0, 0, 0], { s: [1.1, 0.8, 0.9], grit: 0.25 });
    // a cluster of eyes
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) m.sph(0.018 + (i < 2 ? 0.008 : 0), 0xffffff, [s * (0.025 + i * 0.022), 0.05 - (i % 2) * 0.02, 0.08 - i * 0.008], { glow: true }, 0);
    // fangs
    for (const s of [-1, 1]) {
      m.seg([s * 0.04, -0.04, 0.06], [s * 0.04, -0.09, 0.11], 0.025, 0.02, o.chitinD);
      m.spike([s * 0.04, -0.09, 0.11], [0, -1, 0.2], 0.07, 0.014, o.fang, { blood: 0.3 });
    }
    m.pop();
  });
  const legAt = [0.16, 0.06, -0.04, -0.14];
  const legYaw = [0.7, 0.25, -0.2, -0.6];
  const legs: THREE_Group[] = [];
  for (let p = 0; p < 4; p++) for (const s of [1, -1]) {
    const g = K.limb('leg' + p, [s * 0.14 * size, 0.38 * size, legAt[p] * size], (m) => {
      // a jointed leg straight out along +x: up to the knee, down to the ground
      m.push([0, 0, 0], [0, 0, 0], [size, size, size]);
      const reach = 0.5 - Math.abs(p - 1.5) * 0.04;
      m.seg([0, 0, 0], [reach * 0.45, 0.2, 0], 0.035, 0.03, o.chitin, { grit: 0.3 });
      m.sph(0.034, o.chitinD, [reach * 0.45, 0.2, 0], {}, 0);
      m.seg([reach * 0.45, 0.2, 0], [reach, -0.38, 0], 0.03, 0.012, o.chitinD, { grit: 0.3 });
      if (o.hair !== undefined) for (let i = 0; i < 4; i++) m.spike([reach * (0.5 + i * 0.12), 0.14 - i * 0.14, 0], [0.3, 0.4, i % 2 ? 1 : -1], 0.05, 0.008, o.hair, {}, 3);
      m.pop();
    });
    g.rotation.y = s > 0 ? -legYaw[p] : Math.PI + legYaw[p];
    legs.push(g);
  }
  const tail = K.limb('spinner', [0, 0.34 * size, -0.62 * size], (m) => {
    m.cone(0.04 * size, 0.08 * size, o.chitinD, [0, 0, -0.03 * size], { r: [-Math.PI / 2, 0, 0] }, 5);
  });
  return quadRig(K, { body, head, legs, tail }, hitbox(1.0 * size, 0.7 * size, 1.0 * size), 0.85 * size);
}
type THREE_Group = ReturnType<Kit['limb']>;

function darkTarantula(): QuadRig {
  return spider(new Kit('tarantula', 0xff2010, 1.8), { chitin: 0x3a2a1e, chitinD: 0x1e1610, hair: 0x5a4632, mark: 0x8a3a14, eye: 0xff2010, fang: 0x0e0a08 }, 1.0);
}

function darkCrystalSpider(): QuadRig {
  return spider(new Kit('crystal_spider', 0x8ae8ff, 2.2), { chitin: 0x3e4a5a, chitinD: 0x1e2430, mark: 0x9ad8f0, eye: 0x8ae8ff, fang: 0xbfe6f5, crystals: 0x9ff0ff }, 1.1);
}

// ------------------------------------------------------------------ scorpion

function darkScorpion(): QuadRig {
  const K = new Kit('scorpion', 0xff4010, 1.8);
  const SH = 0x4a2a18;
  const SH_D = 0x24140c;
  const SH_L = 0x6a3e22;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.ao = 0.3;
    // segmented armoured body
    for (let i = 0; i < 6; i++) {
      const z = 0.22 - i * 0.12;
      const w = 0.44 - Math.abs(i - 1.5) * 0.03;
      m.sph(0.5, i % 2 ? SH : SH_L, [0, 0.22, z], { s: [w, 0.18, 0.16], grit: 0.3 });
      m.box(w * 0.9, 0.02, 0.02, SH_D, [0, 0.3, z - 0.07], { flat: true });
    }
    m.sph(0.5, SH_D, [0, 0.16, -0.06], { s: [0.38, 0.1, 0.7] });
  });
  const head = K.limb('head', [0, 0.22, 0.3], (m) => {
    m.sph(0.5, SH, [0, 0, 0.02], { s: [0.32, 0.14, 0.2], grit: 0.3 });
    for (const s of [-1, 1]) m.sph(0.022, 0xffffff, [s * 0.04, 0.06, 0.08], { glow: true }, 0);
    // great pincers reaching forward
    for (const s of [-1, 1]) {
      m.push([s * 0.14, -0.02, 0.04], [0, s * 0.45, 0]);
      m.seg([0, 0, 0], [0, 0.02, 0.22], 0.045, 0.04, SH, { grit: 0.3 });
      m.sph(0.045, SH_D, [0, 0.02, 0.22], {}, 0);
      m.push([0, 0.02, 0.22], [0, -s * 0.7, 0]);
      m.sph(0.09, SH_L, [0, 0, 0.12], { s: [0.75, 0.6, 1.4], grit: 0.3 });
      m.spike([s * 0.035, 0, 0.22], [s * -0.3, 0, 1], 0.16, 0.035, SH_D, { blood: 0.4 });
      m.spike([-s * 0.035, 0, 0.2], [s * 0.3, 0, 1], 0.12, 0.028, SH_D);
      m.pop();
      m.pop();
    }
  });
  const legs: THREE_Group[] = [];
  const legAt = [0.16, 0.06, -0.04, -0.14];
  for (let p = 0; p < 4; p++) for (const s of [1, -1]) {
    const g = K.limb('leg' + p, [s * 0.16, 0.22, legAt[p]], (m) => {
      m.seg([0, 0, 0], [0.2, 0.1, 0], 0.03, 0.026, SH);
      m.seg([0.2, 0.1, 0], [0.34, -0.22, 0], 0.025, 0.01, SH_D);
    });
    g.rotation.y = s > 0 ? -(0.5 - p * 0.35) : Math.PI + (0.5 - p * 0.35);
    legs.push(g);
  }
  // the tail arches up over the back, the stinger dripping glowing venom
  const tail = K.limb('tail', [0, 0.26, -0.44], (m) => {
    const pts: V3[] = [[0, 0, 0], [0, 0.14, -0.16], [0, 0.36, -0.22], [0, 0.56, -0.14], [0, 0.66, 0.04], [0, 0.62, 0.2]];
    for (let i = 0; i < pts.length - 1; i++) {
      m.seg(pts[i], pts[i + 1], 0.075 - i * 0.008, 0.07 - i * 0.008, i % 2 ? SH : SH_L, { grit: 0.3 });
      m.sph(0.075 - i * 0.008, SH_D, pts[i + 1], {}, 1);
    }
    m.sph(0.08, SH_L, [0, 0.6, 0.26], { s: [0.8, 0.9, 1.2], grit: 0.3 }); // venom bulb
    m.spike([0, 0.58, 0.32], [0, -0.8, 0.6], 0.16, 0.03, 0x1a0a06);
    m.sph(0.02, 0xffffff, [0, 0.47, 0.42], { glow: true }, 0);
  });
  return quadRig(K, { body, head, legs, tail }, hitbox(0.9, 0.8, 1.1), 0.95);
}

// ------------------------------------------------------------------ scarab

function darkScarab(): QuadRig {
  const K = new Kit('scarab', 0xf0c040, 1.6);
  const SHELL = 0x1a3a34;
  const SHELL_L = 0x2e5a4e;
  const SHELL_D = 0x0e1a18;
  const GOLD = 0xb08a34;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.ao = 0.3;
    for (const s of [-1, 1]) {
      // two domed wing-cases with ridges
      m.sph(0.5, SHELL, [s * 0.17, 0.32, -0.08], { s: [0.36, 0.34, 0.86], grit: 0.25 });
      for (let i = 0; i < 3; i++) m.box(0.015, 0.02, 0.7, SHELL_L, [s * (0.08 + i * 0.08), 0.48 - i * 0.04, -0.08], { r: [0, 0, s * (0.2 + i * 0.3)], flat: true });
    }
    m.box(0.03, 0.04, 0.84, GOLD, [0, 0.49, -0.08], { flat: true }); // wing-case seam
    m.sph(0.5, SHELL_D, [0, 0.22, -0.06], { s: [0.6, 0.16, 0.8] });
    m.sph(0.5, SHELL, [0, 0.3, 0.38], { s: [0.5, 0.24, 0.26], grit: 0.25 }); // pronotum
    m.box(0.44, 0.03, 0.04, GOLD, [0, 0.36, 0.48], { flat: true });
  });
  const head = K.limb('head', [0, 0.28, 0.52], (m) => {
    m.sph(0.5, SHELL_D, [0, 0, 0.04], { s: [0.3, 0.14, 0.18], grit: 0.25 });
    m.horn([[0, 0.02, 0.1], [0, 0.12, 0.18], [0, 0.26, 0.16], [0, 0.32, 0.06]], 0.04, SHELL, GOLD); // great curved horn
    for (const s of [-1, 1]) {
      m.box(0.03, 0.025, 0.02, 0xffffff, [s * 0.1, 0.03, 0.12], { glow: true });
      m.horn([[s * 0.08, -0.03, 0.12], [s * 0.1, -0.05, 0.22], [s * 0.04, -0.06, 0.28]], 0.02, SHELL_D, 0x0a0806); // mandibles
    }
  });
  const legs: THREE_Group[] = [];
  const legAt = [0.26, 0.04, -0.2];
  for (let p = 0; p < 3; p++) for (const s of [1, -1]) {
    const g = K.limb('leg' + p, [s * 0.24, 0.24, legAt[p]], (m) => {
      m.seg([0, 0, 0], [0.18, 0.06, 0], 0.03, 0.026, SHELL_D);
      m.seg([0.18, 0.06, 0], [0.3, -0.24, 0], 0.025, 0.01, SHELL_D);
      for (let i = 0; i < 3; i++) m.spike([0.2 + i * 0.03, 0.0 - i * 0.07, 0], [1, 0.2, 0], 0.04, 0.008, SHELL_L, {}, 3);
    });
    g.rotation.y = s > 0 ? -(0.5 - p * 0.5) : Math.PI + (0.5 - p * 0.5);
    legs.push(g);
  }
  const tail = K.limb('tail', [0, 0.24, -0.5], (m) => m.sph(0.04, SHELL_D, [0, 0, 0], {}, 0));
  return quadRig(K, { body, head, legs, tail }, hitbox(0.9, 0.7, 1.1), 0.75);
}

// ------------------------------------------------------------------ lizardfolk

const LZ = 0x3e5a32;
const LZ_D = 0x22341e;
const LZ_BELLY = 0x9a9460;

function lizardHead(o: { crest: number; helm?: (m: Mesher) => void }) {
  return (m: Mesher): void => {
    m.ao = 0.08;
    m.push([0, 0, 0.04], [-0.05, 0, 0], [1.1, 1.1, 1.1]);
    m.sph(0.14, LZ, [0, 0.02, 0], { s: [1, 0.9, 1.1], grit: 0.25 });
    m.box(0.15, 0.08, 0.22, LZ, [0, -0.01, 0.15], { grit: 0.25 }); // snout
    m.box(0.13, 0.04, 0.2, LZ_BELLY, [0, -0.06, 0.13]); // pale jaw
    m.box(0.12, 0.012, 0.18, C.GUM, [0, -0.04, 0.14], { flat: true });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) m.spike([s * 0.065, -0.04, 0.12 + i * 0.05], [0, -1, 0.1], 0.03, 0.008, C.FANG, { flat: true });
    m.box(0.07, 0.04, 0.04, C.SOCKET, [0.06, 0.05, 0.1], { r: [0, 0.4, -0.2], flat: true });
    m.box(0.07, 0.04, 0.04, C.SOCKET, [-0.06, 0.05, 0.1], { r: [0, -0.4, 0.2], flat: true });
    m.eyes(0.065, 0.05, 0.115, 0.05, 0.022, 0.25);
    // a frilled crest down the back of the skull
    for (let i = 0; i < 5; i++) m.spike([0, 0.1 - i * 0.03, 0.02 - i * 0.06], [0, 1, -0.6], 0.14 - i * 0.015, 0.03, i % 2 ? o.crest : LZ_D, { grit: 0.2 }, 3);
    for (const s of [-1, 1]) m.membrane([[0, 0], [0.1, 0.06], [0.14, -0.04], [0.08, -0.12]], o.crest, [s * 0.1, -0.02, -0.04], { r: [0, s * 1.2, 0] }); // gill frills
    o.helm?.(m);
    m.pop();
  };
}

function lizardTorso(o: { wear?: (m: Mesher) => void; tailLen?: number }) {
  return (m: Mesher): void => {
    m.box(0.4, 0.5, 0.26, LZ, [0, 0.28, 0], { grit: 0.25 });
    m.box(0.26, 0.44, 0.02, LZ_BELLY, [0, 0.26, 0.13], { grit: 0.2 });
    for (let i = 0; i < 5; i++) m.box(0.24, 0.012, 0.02, 0x6a6440, [0, 0.08 + i * 0.09, 0.142], { flat: true });
    for (let i = 0; i < 6; i++) m.spike([0, 0.55 - i * 0.09, -0.13], [0, 0.4, -1], 0.08, 0.02, LZ_D, {}, 3); // back spines
    // a heavy tail sweeping behind
    const L = o.tailLen ?? 0.8;
    m.horn([[0, 0.06, -0.12], [0, -0.06, -0.12 - L * 0.4], [0.06, -0.28, -0.12 - L * 0.8], [0.14, -0.5, -0.12 - L]], 0.12, LZ, LZ_D);
    o.wear?.(m);
  };
}

function lizardArm(o: { sleeve?: number; weapon?: (m: Mesher) => void; off?: (m: Mesher) => void }) {
  return (m: Mesher, side: number): void => {
    arm(m, side, { upper: o.sleeve ?? LZ, fore: LZ, hand: LZ_D, shoulder: o.sleeve === undefined ? LZ : undefined, bracer: C.LEATHER, w: 0.13 });
    for (const dx of [-0.035, 0, 0.035]) m.spike([dx, -0.52, 0.04], [0, -1, 0.3], 0.05, 0.01, C.CLAW);
    if (side < 0 && o.weapon) { m.push([0, -0.46, 0.04]); o.weapon(m); m.pop(); }
    if (side > 0 && o.off) o.off(m);
  };
}

function darkLizardSentinel(): BipedRig {
  const K = new Kit('lizard_sentinel', 0xffd040, 1.6);
  return man(K, {
    leg: (m, side, L) => leg(m, side, L, { thigh: LZ, shin: LZ_D, claws: C.CLAW, wraps: C.LEATHER, w: 0.16 }),
    torso: lizardTorso({
      wear: (m) => {
        strips(m, [[-0.12, 0.34, 0.15], [0.0, 0.4, 0.16], [0.12, 0.34, 0.15]], 0x5a4a2a, 0.04);
        belt(m, 0.46, 0.3, 0.07, C.LEATHER, C.BONE);
        m.box(0.06, 0.6, 0.04, C.LEATHER, [0, 0.32, 0.15], { r: [0, 0, 0.6] }); // shoulder strap
        m.sph(0.1, 0x5a4a2a, [0.24, 0.5, 0], { s: [1.1, 0.6, 1.1], grit: 0.3 }); // one hide pauldron
      },
    }),
    head: lizardHead({ crest: 0x8a2a18 }),
    arm: lizardArm({ weapon: (m) => wSpear(m, { len: 1.45, tip: C.BONE, barbs: true, haft: 0x3a2a18, blood: 0.5 }) }),
    height: 1.8,
  });
}

function darkLizardTemplar(): BipedRig {
  const K = new Kit('lizard_templar', 0xffd040, 1.8);
  const RED = 0x5a1810;
  const PLATE = 0x3a3a34;
  return man(K, {
    bulk: 1.18,
    leg: (m, side, L) => leg(m, side, L, { thigh: RED, shin: PLATE, claws: C.CLAW, knee: C.GOLD, w: 0.17 }),
    torso: lizardTorso({
      tailLen: 0.95,
      wear: (m) => {
        strips(m, [[-0.14, 0.44, 0.16], [0.0, 0.5, 0.17], [0.14, 0.44, 0.16]], RED, 0.04, { blood: 0.15 });
        belt(m, 0.5, 0.32, 0.07, C.LEATHER, C.GOLD);
        m.box(0.46, 0.34, 0.3, PLATE, [0, 0.36, 0.005], { grit: 0.3 }); // scale cuirass
        for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) m.box(0.09, 0.05, 0.02, r % 2 ? 0x4a4a42 : PLATE, [-0.15 + i * 0.1 + (r % 2) * 0.05, 0.24 + r * 0.08, 0.16], { grit: 0.3 });
        m.box(0.1, 0.1, 0.02, C.GOLD, [0, 0.42, 0.17], { r: [0, 0, 0.78], flat: true }); // sun-disc badge
        for (const s of [-1, 1]) pauldron(m, s, [s * 0.27, 0.52, 0], 0.13, RED, PLATE, C.GOLD);
        strips(m, [[-0.16, 0.8, -0.17], [0, 0.92, -0.19], [0.16, 0.78, -0.17]], RED, 0.56);
      },
    }),
    head: lizardHead({
      crest: C.GOLD, helm: (m) => {
        m.sph(0.15, PLATE, [0, 0.06, -0.01], { s: [1.05, 0.6, 1.15], grit: 0.25 });
        m.box(0.3, 0.035, 0.04, C.GOLD, [0, 0.05, 0.12], { flat: true });
      },
    }),
    arm: lizardArm({
      sleeve: RED,
      weapon: (m) => wSword(m, { len: 0.72, w: 0.09, blade: 0x8a8070, guard: C.GOLD, curve: true, blood: 0.6, notched: true }),
      off: (m) => {
        // a gold-rimmed scarab shield
        m.push([0.11, -0.34, 0.08], [0, -0.6, 1.0]);
        m.sph(0.26, 0x1a3a34, [0, 0, 0], { s: [1, 0.2, 1.25], grit: 0.25 });
        m.box(0.03, 0.06, 0.6, C.GOLD, [0, 0.04, 0], { flat: true });
        m.ring(0.26, 0.02, C.GOLD, [0, 0, 0], { s: [1, 1, 1.25] }, Math.PI * 2, 12);
        m.pop();
      },
    }),
    height: 1.9,
  });
}

export const DARK_CRAWLERS: Partial<Record<EnemyKind, () => Rig>> = {
  crocodile: darkCrocodile,
  tarantula: darkTarantula,
  crystal_spider: darkCrystalSpider,
  scorpion: darkScorpion,
  scarab: darkScarab,
  lizard_sentinel: darkLizardSentinel,
  lizard_templar: darkLizardTemplar,
};

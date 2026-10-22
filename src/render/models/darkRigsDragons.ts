import type { EnemyKind } from '../../game/world/WorldMap';
import type { QuadRig, Rig } from './rigs';
import { C, hitbox, Kit, quadRig, type Mesher, type V3 } from './darkRigsCore';

/**
 * Dark models, batch (h): the dragons — the green dragon, the crimson dragon
 * lord and the frost dragon. One builder, three looks: a heavy scaled body on
 * four clawed legs, a long neck, a horned head with burning eyes and a fanged
 * jaw, ragged bat-like wings spread flat so they read from the top-down
 * camera, and a long tail ending in a barbed spade.
 */

interface DragonLook {
  scale: number;
  scaleD: number;
  scaleL: number;
  belly: number;
  membrane: number;
  horn: number;
  hornTip: number;
  /** Extra horn pairs and spikes (the dragon lord). */
  lord?: boolean;
  /** Glowing crystals along the back (the frost dragon). */
  crystals?: boolean;
  size: number;
}

function wing(m: Mesher, s: number, S: number, o: DragonLook): void {
  // drawn in the XY plane, then laid nearly flat (outline +Y → forward +Z), tilted up a little
  m.push([0, 0, 0], [Math.PI / 2 - 0.25, 0, 0]);
  const P = (x: number, y: number): V3 => [s * x * S, y * S, 0];
  const outline: [number, number][] = [[0, 0.12], [0.36, 0.3], [0.9, 0.42], [1.25, 0.3], [1.0, 0.06], [1.18, -0.2], [0.88, -0.24], [0.84, -0.56], [0.6, -0.4], [0.44, -0.66], [0.3, -0.4], [0.12, -0.42], [0, -0.3]];
  m.poly(outline.map(([x, y]) => [s * x * S, y * S] as [number, number]), o.membrane, [0, 0, 0], { grit: 0.3, blood: 0.03 });
  // a torn hole in the membrane, the arm and finger bones
  m.poly([[s * 0.5 * S, -0.1 * S], [s * 0.6 * S, -0.04 * S], [s * 0.62 * S, -0.16 * S]], 0x0a0806, [0, 0, 0.004], { flat: true });
  m.seg(P(0, 0.05), P(0.36, 0.3), 0.07, 0.055, o.scale);
  m.seg(P(0.36, 0.3), P(0.9, 0.42), 0.05, 0.035, o.scaleD);
  for (const t of [[1.25, 0.3], [1.18, -0.2], [0.84, -0.56], [0.44, -0.66]] as const) m.seg(P(0.9, 0.42), P(t[0], t[1]), 0.03, 0.01, o.horn);
  m.spike(P(0.9, 0.42), [s * 0.4, 1, 0.5], 0.18, 0.035, o.hornTip); // thumb claw
  m.pop();
}

function dragon(K: Kit, o: DragonLook): QuadRig {
  const z = o.size;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.ao = 0.28;
    m.push([0, 0, 0], [0, 0, 0], [z, z, z]);
    m.sph(0.5, o.scale, [0, 0.56, 0.12], { s: [0.78, 0.6, 0.8], grit: 0.22 }); // chest
    m.sph(0.5, o.scale, [0, 0.52, -0.3], { s: [0.7, 0.54, 0.8], grit: 0.22 }); // haunches
    m.sph(0.5, o.belly, [0, 0.38, -0.06], { s: [0.56, 0.24, 1.0], grit: 0.15 });
    for (let i = 0; i < 7; i++) m.box(0.42 - Math.abs(i - 3) * 0.04, 0.02, 0.07, o.belly, [0, 0.27, 0.32 - i * 0.11], { flat: true, grit: 0.3 }); // belly plates
    // ridge spikes down the spine and dark scale rows on the flanks
    for (let i = 0; i < 8; i++) {
      const zz = 0.4 - i * 0.12;
      m.spike([0, 0.84 - Math.abs(i - 3) * 0.02, zz], [0, 1, -0.5], 0.12 + (o.lord ? 0.06 : 0) - Math.abs(i - 3) * 0.01, 0.04, i % 2 ? o.scaleD : o.hornTip);
      for (const s of [-1, 1]) m.box(0.03, 0.12, 0.1, o.scaleD, [s * 0.36, 0.58, zz], { r: [0, 0, s * 0.35], grit: 0.3 });
    }
    if (o.crystals) for (let i = 0; i < 6; i++) {
      const a = i * 2.4;
      m.cone(0.05, 0.22 + (i % 3) * 0.08, 0xffffff, [Math.cos(a) * 0.14, 0.92, 0.3 - i * 0.12], { glow: true, r: [-0.3, 0, Math.cos(a) * 0.4] }, 4);
    }
    // the long neck rising forward to the head
    const neck: V3[] = [[0, 0.62, 0.42], [0, 0.78, 0.56], [0, 0.94, 0.66], [0, 1.04, 0.8]];
    m.tube(neck, [0.2, 0.15, 0.12, 0.1], o.scale, { grit: 0.22 }, 7);
    for (let i = 0; i < 3; i++) {
      const a = neck[i];
      const b = neck[i + 1];
      m.box(0.14, 0.05, 0.1, o.belly, [0, (a[1] + b[1]) / 2 - 0.08, (a[2] + b[2]) / 2 + 0.07], { r: [0.7, 0, 0], grit: 0.2 });
      m.spike([0, (a[1] + b[1]) / 2 + 0.1, (a[2] + b[2]) / 2 - 0.06], [0, 1, -0.6], 0.1, 0.03, o.scaleD);
    }
    // old wounds on the flank
    for (let i = 0; i < 3; i++) m.box(0.014, 0.014, 0.22, 0x9a120c, [0.38, 0.54 - i * 0.04, -0.2], { r: [0.3, 0, 0], blood: 1, flat: true });
    m.pop();
  });

  const head = K.limb('head', [0, 1.06 * z, 0.86 * z], (m) => {
    m.ao = 0.1;
    m.push([0, 0, 0], [0.2, 0, 0], [z * 1.15, z * 1.15, z * 1.15]);
    m.sph(0.12, o.scale, [0, 0, 0], { s: [1.1, 0.85, 1.1], grit: 0.2 });
    m.box(0.16, 0.08, 0.26, o.scale, [0, -0.01, 0.16], { grit: 0.2 }); // snout
    m.box(0.13, 0.04, 0.24, o.scaleD, [0, -0.07, 0.15], { r: [0.12, 0, 0] }); // lower jaw, a little open
    m.box(0.12, 0.012, 0.22, C.GUM, [0, -0.05, 0.15], { flat: true, blood: 0.3 });
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) m.spike([s * 0.065, -0.045, 0.08 + i * 0.05], [0, -1, 0.1], 0.04 + (i === 1 ? 0.025 : 0), 0.01, C.FANG, { flat: true });
      m.sph(0.014, 0x0a0806, [s * 0.035, 0.02, 0.29], { flat: true }, 0); // nostrils
      m.box(0.06, 0.035, 0.1, o.scaleD, [s * 0.06, 0.06, 0.06], { r: [0.1, 0, s * 0.35] }); // brow ridges
      m.horn([[s * 0.06, 0.06, -0.02], [s * 0.12, 0.12, -0.14], [s * 0.14, 0.14, -0.3]], 0.035, o.horn, o.hornTip);
      if (o.lord) m.horn([[s * 0.09, 0.0, -0.04], [s * 0.2, 0.02, -0.12], [s * 0.26, 0.08, -0.22]], 0.025, o.horn, o.hornTip);
      m.spike([s * 0.08, -0.04, -0.02], [s, -0.3, -0.4], 0.1, 0.02, o.scaleD); // cheek spurs
    }
    m.eyes(0.06, 0.04, 0.1, 0.05, 0.024, 0.4);
    if (o.lord) for (let i = 0; i < 3; i++) m.spike([0, 0.08, 0.06 - i * 0.07], [0, 1, -0.5], 0.08, 0.02, o.hornTip);
    m.pop();
  });

  const leg = (front: boolean, sd: number) => (m: Mesher) => {
    m.ao = 0.2;
    m.push([0, 0, 0], [0, 0, 0], [z, z, z]);
    const fz = front ? 0.04 : -0.06;
    m.sph(0.13, o.scale, [0, -0.02, 0], { s: [1, 1.1, 1.2], grit: 0.22 });
    m.seg([0, 0, 0], [sd * 0.06, -0.2, fz], 0.12, 0.09, o.scale, { grit: 0.22 });
    m.seg([sd * 0.06, -0.2, fz], [sd * 0.06, -0.42, fz + 0.06], 0.08, 0.065, o.scaleD, { grit: 0.22 });
    m.box(0.16, 0.06, 0.2, o.scaleD, [sd * 0.06, -0.45, fz + 0.1]);
    for (const dx of [-0.05, 0, 0.05]) m.horn([[sd * 0.06 + dx, -0.45, fz + 0.18], [sd * 0.06 + dx * 1.3, -0.47, fz + 0.26], [sd * 0.06 + dx * 1.4, -0.5, fz + 0.3]], 0.018, C.CLAW, o.hornTip);
    m.pop();
  };
  const legs = [
    K.limb('frontL', [0.28 * z, 0.48 * z, 0.26 * z], leg(true, 1)),
    K.limb('frontR', [-0.28 * z, 0.48 * z, 0.26 * z], leg(true, -1)),
    K.limb('backL', [0.28 * z, 0.48 * z, -0.4 * z], leg(false, 1)),
    K.limb('backR', [-0.28 * z, 0.48 * z, -0.4 * z], leg(false, -1)),
  ];

  const tail = K.limb('tail', [0, 0.5 * z, -0.66 * z], (m) => {
    m.ao = 0.2;
    m.push([0, 0, 0], [0, 0, 0], [z, z, z]);
    const pts: V3[] = [[0, 0, 0], [0.04, -0.08, -0.32], [0.14, -0.18, -0.62], [0.3, -0.24, -0.88], [0.48, -0.26, -1.06]];
    m.tube(pts, [0.18, 0.13, 0.09, 0.06, 0.035], o.scale, { grit: 0.22 }, 7);
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      m.spike([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.1 - i * 0.02, (a[2] + b[2]) / 2], [0, 1, -0.6], 0.1 - i * 0.015, 0.03, i % 2 ? o.scaleD : o.hornTip);
    }
    // a barbed spade at the tip
    m.poly([[0, 0.0], [0.12, -0.08], [0.0, -0.3], [-0.12, -0.08]], o.scaleD, [0.48, -0.26, -1.06], { r: [-Math.PI / 2, 0, -0.5], grit: 0.3 }, 0.03);
    m.pop();
  });

  const wings = [-1, 1].map((s) => {
    const w = K.limb(s < 0 ? 'wingR' : 'wingL', [s * 0.24 * z, 0.82 * z, 0.08 * z], (m) => wing(m, s, 1.25 * z, o));
    return w;
  });
  return quadRig(K, { body, head, legs, tail, wings }, hitbox(1.3 * z, 1.4 * z, 1.8 * z), 1.4 * z);
}

function darkDragon(): QuadRig {
  return dragon(new Kit('dragon', 0xffb020, 2.0), {
    scale: 0x3a5228, scaleD: 0x1e2c16, scaleL: 0x5a7a3a, belly: 0xa89a5a, membrane: 0x3a3020,
    horn: C.HORN, hornTip: C.HORN_L, size: 1.0,
  });
}

function darkDragonLord(): QuadRig {
  return dragon(new Kit('dragon_lord', 0xffa010, 2.4), {
    scale: 0x5a1a12, scaleD: 0x2a0c08, scaleL: 0x7a2a1a, belly: 0xa07a34, membrane: 0x3a140e,
    horn: 0x1a1210, hornTip: 0xc8a050, lord: true, size: 1.12,
  });
}

function darkFrostDragon(): QuadRig {
  return dragon(new Kit('frost_dragon', 0x8ae8ff, 2.4), {
    scale: 0x8aa4b8, scaleD: 0x4a6278, scaleL: 0xc8dce8, belly: 0xd0dce4, membrane: 0x5a7a94,
    horn: 0x3a4a5a, hornTip: 0xd8eef8, crystals: true, size: 1.12,
  });
}

export const DARK_DRAGONS: Partial<Record<EnemyKind, () => Rig>> = {
  dragon: darkDragon,
  dragon_lord: darkDragonLord,
  frost_dragon: darkFrostDragon,
};

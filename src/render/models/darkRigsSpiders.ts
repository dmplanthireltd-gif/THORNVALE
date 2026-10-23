import type { EnemyKind } from '../../game/world/WorldMap';
import type { QuadRig, Rig } from './rigs';
import { C, hitbox, Kit, quadRig, type V3 } from './darkRigsCore';

/**
 * Dark models: the giant spiders of the Gravewind Steppe — the dread weaver
 * (a bristling, scarred hunter with a bone-white death's-head on its back and
 * venom-dripping fangs) and the Gravesilk Colossus (a huge, ancient weaver
 * draped in grave-silk shrouds, bone plates breaking through its carapace,
 * egg sacs clinging to it and a crown of bone spikes over a cluster of eyes).
 */

interface WeaverLook {
  chitin: number;
  chitinD: number;
  hair: number;
  mark: number;
  eye: number;
  venom: number;
  /** Grave-silk shrouds draped over the body (the colossus). */
  shroud?: number;
  /** Bone plates, ribs and a spike crown (the colossus). */
  bone?: number;
}

type Group = ReturnType<Kit['limb']>;

function weaver(K: Kit, o: WeaverLook, size: number): QuadRig {
  const big = o.bone !== undefined;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.ao = 0.32;
    m.push([0, 0, 0], [0, 0, 0], [size, size, size]);
    // the swollen abdomen, ridged with darker bands
    m.sph(0.5, o.chitin, [0, 0.42, -0.36], { s: [0.7, 0.56, 0.8], grit: 0.32 }, 2);
    m.sph(0.5, o.chitinD, [0, 0.34, -0.34], { s: [0.6, 0.34, 0.7], grit: 0.2 });
    for (let i = 0; i < 4; i++) m.ring(0.3 - i * 0.03, 0.022, o.chitinD, [0, 0.42 + i * 0.01, -0.2 - i * 0.12], { r: [Math.PI / 2 - 0.25, 0, 0], s: [1.15, 1, 0.9] }, Math.PI, 9);
    // a bone-white death's-head marking on the back
    m.sph(0.1, o.mark, [0, 0.69, -0.36], { s: [1.1, 0.3, 1.1], flat: true }, 1);
    for (const s of [-1, 1]) m.sph(0.03, C.SOCKET, [s * 0.04, 0.715, -0.33], { flat: true }, 0);
    m.box(0.07, 0.02, 0.03, o.mark, [0, 0.7, -0.27], { flat: true });
    for (const s of [-1, 1]) m.box(0.2, 0.02, 0.035, o.mark, [s * 0.12, 0.69, -0.48], { r: [0, s * 0.7, 0], flat: true });
    // bristles over the abdomen and its spinnerets with trailing silk
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996;
      const k = (i % 7) / 7;
      m.spike([Math.cos(a) * (0.26 + k * 0.06), 0.5 + Math.sin(a * 0.7) * 0.12, -0.36 + Math.sin(a) * 0.3], [Math.cos(a), 0.9, Math.sin(a) * 0.4], 0.09, 0.014, o.hair, {}, 3);
    }
    m.cone(0.07, 0.12, o.chitinD, [0, 0.36, -0.79], { r: [-Math.PI / 2, 0, 0] }, 6);
    m.seg([0, 0.34, -0.84], [0.04, 0.12, -1.0], 0.008, 0.004, 0xd8d4c8, { flat: true });
    m.seg([0.01, 0.34, -0.84], [-0.06, 0.04, -0.94], 0.006, 0.003, 0xd8d4c8, { flat: true });
    // the cephalothorax, armoured with overlapping plates
    m.sph(0.5, o.chitin, [0, 0.38, 0.12], { s: [0.46, 0.28, 0.42], grit: 0.28 });
    for (let i = 0; i < 3; i++) m.box(0.26 - i * 0.05, 0.04, 0.1, o.chitinD, [0, 0.52 - i * 0.012, 0.0 + i * 0.09], { r: [-0.2, 0, 0], grit: 0.3 });
    // scars and fresh blood from the last kill
    m.box(0.012, 0.01, 0.2, C.SCAR, [0.18, 0.62, -0.42], { r: [0.3, 0.2, 0.5], flat: true });
    m.box(0.012, 0.01, 0.16, 0x9a120c, [-0.2, 0.58, -0.3], { r: [0.2, -0.3, -0.5], blood: 1, flat: true });
    if (big) {
      const shroud = o.shroud!;
      const bone = o.bone!;
      // grave-silk shrouds draped over the back and hanging in torn strips
      m.sph(0.5, shroud, [0.05, 0.5, -0.42], { s: [0.62, 0.42, 0.62], grit: 0.18 }, 1);
      for (let i = 0; i < 9; i++) {
        const a = -1.2 + i * 0.3;
        const len = 0.22 + (i % 3) * 0.1;
        m.box(0.07, len, 0.012, shroud, [Math.sin(a) * 0.34, 0.36 - len / 2, -0.42 + Math.cos(a) * 0.32], { r: [0.1, a, 0.05 * (i % 2 ? 1 : -1)], grit: 0.25, two: true });
      }
      // bone plates breaking through the carapace and a ridge of ribs
      for (let i = 0; i < 5; i++) {
        const z = -0.12 - i * 0.13;
        for (const s of [-1, 1]) m.horn([[s * 0.1, 0.62, z], [s * 0.3, 0.6, z - 0.03], [s * 0.42, 0.46, z - 0.05]], 0.03, bone, bone, {}, 0.004);
      }
      for (let i = 0; i < 4; i++) m.spike([0, 0.7, -0.2 - i * 0.14], [0, 1, -0.3], 0.16 - i * 0.02, 0.035, bone, { grit: 0.2 }, 4);
      // egg sacs clinging to the flanks
      for (const [x, y, z, r] of [[0.32, 0.3, -0.5, 0.09], [0.28, 0.24, -0.66, 0.07], [-0.34, 0.32, -0.56, 0.1], [-0.3, 0.22, -0.4, 0.07]] as const) {
        m.sph(r, 0xbab49a, [x, y, z], { grit: 0.12 }, 1);
        m.sph(r * 0.45, o.venom, [x * 1.08, y + r * 0.3, z], { glow: true }, 0);
      }
      // skulls of its prey wrapped in silk
      m.sph(0.06, C.BONE, [-0.18, 0.62, -0.62], { s: [1, 1.1, 1.2] }, 1);
      for (const s of [-1, 1]) m.sph(0.014, C.SOCKET, [-0.18 + s * 0.022, 0.63, -0.56], { flat: true }, 0);
    }
    m.pop();
  });

  const head = K.limb('head', [0, 0.38 * size, 0.34 * size], (m) => {
    m.push([0, 0, 0], [0, 0, 0], [size, size, size]);
    m.sph(0.12, o.chitinD, [0, 0, 0], { s: [1.15, 0.85, 1], grit: 0.25 });
    // a cluster of eyes: two big ones in front, the rest in rows behind
    for (const s of [-1, 1]) m.sph(0.03, 0xffffff, [s * 0.035, 0.055, 0.1], { glow: true }, 1);
    const rows = big ? 5 : 3;
    for (let i = 0; i < rows; i++) for (const s of [-1, 1]) m.sph(0.016 + (i === 0 ? 0.004 : 0), 0xffffff, [s * (0.07 + i * 0.018), 0.05 - (i % 2) * 0.025, 0.08 - i * 0.022], { glow: true }, 0);
    if (big) {
      // a crown of bone spikes over the eyes
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + i * 0.3;
        m.spike([Math.sin(a) * 0.1, 0.08, Math.cos(a) * 0.04], [Math.sin(a) * 0.6, 1, -0.3], 0.16 + (i === 3 ? 0.08 : 0), 0.022, o.bone!, {}, 4);
      }
    }
    // pedipalps and heavy, hooked fangs dripping venom
    for (const s of [-1, 1]) {
      m.seg([s * 0.07, -0.02, 0.08], [s * 0.12, -0.08, 0.2], 0.022, 0.016, o.chitin, { grit: 0.25 });
      m.seg([s * 0.045, -0.05, 0.08], [s * 0.05, -0.12, 0.15], 0.034, 0.026, o.chitinD, { grit: 0.2 });
      m.horn([[s * 0.05, -0.12, 0.15], [s * 0.03, -0.2, 0.17], [s * 0.005, -0.25, 0.13]], 0.024, C.FANG, C.FANG, { blood: 0.25 }, 0.003);
      m.sph(0.018, o.venom, [s * 0.008, -0.27, 0.13], { flat: true, s: [1, 1.6, 1] }, 0);
    }
    m.pop();
  });

  // four pairs of long, jointed legs reaching out along +x and down to the ground
  const legAt = [0.22, 0.1, -0.02, -0.14];
  const legYaw = [0.75, 0.28, -0.22, -0.65];
  const legs: Group[] = [];
  for (let p = 0; p < 4; p++) for (const s of [1, -1]) {
    const g = K.limb('leg' + p, [s * 0.16 * size, 0.4 * size, legAt[p] * size], (m) => {
      m.push([0, 0, 0], [0, 0, 0], [size, size, size]);
      const reach = 0.56 - Math.abs(p - 1.5) * 0.05; // (was 0.66: legs over three tiles)
      const knee: V3 = [reach * 0.42, 0.3, 0];
      const ankle: V3 = [reach * 0.86, -0.12, 0];
      const foot: V3 = [reach, -0.4, 0];
      m.seg([0, 0, 0], knee, 0.05, 0.038, o.chitin, { grit: 0.3 });
      m.sph(0.045, o.chitinD, knee, {}, 0);
      m.seg(knee, ankle, 0.036, 0.026, o.chitinD, { grit: 0.3 });
      m.sph(0.03, o.chitin, ankle, {}, 0);
      m.seg(ankle, foot, 0.024, 0.01, o.chitinD, { grit: 0.2 });
      // bristles and a spur on every knee
      for (let i = 0; i < 6; i++) {
        const t = i / 6;
        m.spike([knee[0] * t * 1.8 * 0.5, 0.05 + t * 0.25 - (i > 3 ? (i - 3) * 0.12 : 0), 0], [0.2, 0.6, i % 2 ? 1 : -1], 0.07, 0.01, o.hair, {}, 3);
      }
      m.spike(knee, [0.3, 1, 0], big ? 0.16 : 0.09, 0.025, big ? o.bone! : o.chitinD, {}, 4);
      if (big) m.horn([ankle, [ankle[0] + 0.06, ankle[1] + 0.08, 0.02], [ankle[0] + 0.14, ankle[1] + 0.1, 0.03]], 0.02, o.bone!, o.bone!, { blood: 0.2 }, 0.003);
      m.pop();
    });
    g.rotation.y = s > 0 ? -legYaw[p] : Math.PI + legYaw[p];
    legs.push(g);
  }
  const tail = K.limb('spinner', [0, 0.34 * size, -0.82 * size], (m) => {
    m.cone(0.045 * size, 0.09 * size, o.chitinD, [0, 0, -0.03 * size], { r: [-Math.PI / 2, 0, 0] }, 5);
  });
  return quadRig(K, { body, head, legs, tail }, hitbox(1.2 * size, 0.8 * size, 1.3 * size), 0.95 * size);
}

function darkDreadWeaver(): QuadRig {
  return weaver(new Kit('dread_weaver', 0xff5a1a, 2.0), {
    chitin: 0x2a2018, chitinD: 0x120d0a, hair: 0x4a3a2a, mark: 0xd8ccb0, eye: 0xff5a1a, venom: 0x8aff3a,
  }, 1.15);
}

function darkGravesilkColossus(): QuadRig {
  return weaver(new Kit('gravesilk_colossus', 0xb06aff, 2.4), {
    chitin: 0x1e1a1e, chitinD: 0x0c0a0e, hair: 0x3a343a, mark: 0xe8e2d0, eye: 0xb06aff, venom: 0x9aff4a, shroud: 0x9a968c, bone: 0xd8ccaa,
  }, 1.3);
}

export const DARK_SPIDERS: Partial<Record<EnemyKind, () => Rig>> = {
  dread_weaver: darkDreadWeaver,
  gravesilk_colossus: darkGravesilkColossus,
};

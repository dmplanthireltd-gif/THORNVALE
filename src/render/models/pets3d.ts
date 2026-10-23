import * as THREE from 'three';
import { Kit, type Mesher, type V3 } from './darkRigsCore';
import { petSizeFactor, type PetId } from '../../game/pets/petDefs';

/**
 * Pet models: characterful low-poly companions in the dark realistic style of the monsters (muted,
 * gritty natural colours, scars and worn leather, merged vertex-coloured limbs from darkRigsCore),
 * kept readable by strong silhouettes and bright eyes. Each pet is one rig with pivots for its own
 * idle / walk (and, for birds, flight and perching) animation in `animatePet`:
 *
 * - Mossback War Tortoise: a player-sized armoured tortoise — spiked, plated shell, war harness with
 *   a saddle, saddle bags (the loot pouch), bedroll, lantern and a torn war banner; heavy stomping
 *   gait with a head bob and swinging bags.
 * - Rustbrush Fox: bushy two-part tail, alert twitching ears, scarred muzzle, sniffs about.
 * - Duskwing Owl: flies with two-part wings while you walk, lands and hops when you stop, turns its head.
 * - Timbertooth Beaver: flat scaly tail it slaps, gnawed stick in its teeth, waddles and gnaws.
 * - Burrowclaw Mole: huge digging claws that paddle, star nose, a battered miner's cap with a candle,
 *   little dirt puffs while it walks or digs.
 * - Riverglint Otter: sleek, wiggles like it swims (body, hips and tail in a wave), fish in its jaws.
 * - Cinderling Whelp: bat wings, opening jaw, ember cracks, puffs of ember breath now and then.
 * - Gravecall Raven: ragged feathers, circles round its owner while walking, hops and cocks its head.
 *
 * Limb geometry is cached per pet kind and shared by every instance; each instance owns the two
 * Kit materials. Small limbs cast no shadow. Nothing is allocated per frame.
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
  /** Extra named pivots (ears, jaw, tail tip, wing tips, bags, banner…). */
  joints: Record<string, THREE.Group>;
  /** Pooled little effects (dirt puffs, ember breath); hidden when idle. */
  puffs: THREE.Group[];
  /** Animation state (no allocation per frame). */
  st: { last: number; air: number; hop: number; seed: number };
}

const EYE = 0x140e0a;
/** Eye: dark glossy ball with a warm glint (glows a little so it reads through the pixel pass). */
function eyes(m: Mesher, x: number, y: number, z: number, r: number, glint = 0xfff0c8): void {
  for (const s of [-1, 1]) {
    m.sph(r, EYE, [s * x, y, z], { flat: true, grit: 0 }, 1);
    m.sph(r * 0.4, glint, [s * x + s * r * 0.25, y + r * 0.35, z + r * 0.75], { glow: true }, 0);
  }
}

/** A point and outward normal on an ellipsoid (centre c, radii rx ry rz) at yaw `u` (0 = +z) and elevation `v`. */
function onDome(c: V3, rx: number, ry: number, rz: number, u: number, v: number): { p: V3; n: V3 } {
  const dx = Math.sin(u) * Math.cos(v), dy = Math.sin(v), dz = Math.cos(u) * Math.cos(v);
  const n = [dx / rx, dy / ry, dz / rz];
  const l = Math.hypot(n[0], n[1], n[2]);
  return { p: [c[0] + rx * dx, c[1] + ry * dy, c[2] + rz * dz], n: [n[0] / l, n[1] / l, n[2] / l] };
}
const along = (p: V3, n: V3, d: number): V3 => [p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d];

/** Turns shadows off for a small limb (keeps the shadow pass cheap). */
function small(g: THREE.Group): THREE.Group {
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = false; });
  return g;
}

interface Parts {
  body: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  tail?: THREE.Group | null;
  wings?: THREE.Group[];
  joints?: Record<string, THREE.Group>;
  puffs?: THREE.Group[];
  /** Pivots added straight to the body (besides head, legs, tail, wings). */
  extra?: THREE.Group[];
  /** Legs that hang from another pivot instead of the body. */
  legParent?: THREE.Group;
}

function rig(id: PetId, K: Kit, parts: Parts, height: number, fly = 0): PetRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(parts.body, parts.head, ...(parts.tail ? [parts.tail] : []), ...(parts.wings ?? []), ...(parts.extra ?? []));
  for (const l of parts.legs) { if (!l.parent) body.add(l); l.userData.rest = l.rotation.x; l.userData.restY = l.position.y; small(l); }
  for (const p of parts.puffs ?? []) { root.add(small(p)); p.visible = false; }
  return {
    id, root, body, head: parts.head, legs: parts.legs, tail: parts.tail ?? null, wings: parts.wings ?? [], fly, materials: K.materials, height,
    joints: parts.joints ?? {}, puffs: parts.puffs ?? [], st: { last: -1, air: fly > 0 ? 1 : 0, hop: 0, seed: Math.random() * 50 },
  };
}

// ------------------------------------------------------------------ Mossback War Tortoise

function tortoise(): PetRig {
  const K = new Kit('pet_tortoise', 0xffc060, 1.4);
  const SHELL = 0x4a4630;
  const SHELL_D = 0x221e14;
  const SHELL_L = 0x6e6640;
  const MOSS = 0x3e5a22;
  const MOSS_L = 0x5e7e2e;
  const SKIN = 0x5e6446;
  const SKIN_D = 0x2e3222;
  const BONE = 0xcabd98;
  const IRON = 0x4c4e52;
  const IRON_L = 0x7c8086;
  const LEATHER = 0x4a3020;
  const LEATHER_D = 0x2a1a10;
  const CLOTH = 0x6a1612;
  const BRASS = 0xa8823a;
  const C: V3 = [0, 0.44, 0];
  const RX = 0.42, RY = 0.34, RZ = 0.5;
  const body = K.limb('body', [0, 0, 0], (m) => {
    // the dome, a dark skirt of marginal plates and the bone-pale belly plate
    m.sph(1, SHELL, C, { s: [RX, RY, RZ], grit: 0.25 }, 2);
    m.cyl(RX + 0.02, RX + 0.05, 0.1, SHELL_D, [0, 0.42, 0], { s: [1, 1, RZ / RX], grit: 0.2 }, 14);
    m.sph(1, 0x8a7e5a, [0, 0.36, 0], { s: [RX * 0.9, 0.09, RZ * 0.9], grit: 0.2 });
    // marginal plates round the rim, each with a dark seam
    for (let i = 0; i < 16; i++) {
      const u = (i / 16) * Math.PI * 2;
      const p: V3 = [Math.sin(u) * (RX + 0.045), 0.43, Math.cos(u) * (RZ + 0.045)];
      m.box(0.11, 0.09, 0.05, i % 2 ? SHELL_L : SHELL, p, { r: [0, u, 0], grit: 0.3 });
    }
    // raised scutes: a hex cap over a dark groove, three rings round the top
    const scutes: Array<[number, number]> = [[0, 1.4]];
    for (let i = 0; i < 5; i++) scutes.push([(i / 5) * Math.PI * 2 + 0.3, 0.95]);
    for (let i = 0; i < 8; i++) scutes.push([(i / 8) * Math.PI * 2, 0.45]);
    for (const [u, v] of scutes) {
      const { p, n } = onDome(C, RX, RY, RZ, u, v);
      m.seg(along(p, n, -0.02), along(p, n, 0.02), 0.13, 0.13, SHELL_D, { grit: 0.2 }, 6);
      m.seg(along(p, n, 0.0), along(p, n, 0.045), 0.11, 0.09, SHELL_L, { grit: 0.35 }, 6);
    }
    // bone spikes along the ridge and iron spikes round the rim
    for (const [u, v, l] of [[0, 1.05, 0.14], [Math.PI, 1.05, 0.14], [Math.PI * 0.82, 0.8, 0.12], [-Math.PI * 0.82, 0.8, 0.12]] as Array<[number, number, number]>) {
      const { p, n } = onDome(C, RX, RY, RZ, u, v);
      m.spike(along(p, n, 0.03), n, l, 0.04, BONE, { grit: 0.2 }, 5);
    }
    for (let i = 0; i < 10; i++) {
      const u = ((i + 0.5) / 10) * Math.PI * 2;
      if (Math.abs(Math.sin(u)) > 0.92) continue; // the bags hang there
      m.spike([Math.sin(u) * (RX + 0.07), 0.42, Math.cos(u) * (RZ + 0.07)], [Math.sin(u), 0.15, Math.cos(u)], 0.11, 0.03, IRON_L, { grit: 0.15 }, 4);
    }
    // moss mats, a fern and tiny toadstools: it is a Mossback after all
    for (const [u, v, s] of [[0.9, 0.7, 1], [-1.2, 0.5, 0.8], [2.6, 0.6, 0.9], [-2.4, 0.9, 0.7]] as Array<[number, number, number]>) {
      const { p } = onDome(C, RX, RY, RZ, u, v);
      m.sph(0.07 * s, MOSS, p, { s: [1.4, 0.45, 1.2], grit: 0.4 }, 1);
      m.sph(0.045 * s, MOSS_L, [p[0] + 0.03, p[1] + 0.02, p[2]], { s: [1.2, 0.5, 1], grit: 0.3 }, 0);
    }
    { const { p } = onDome(C, RX, RY, RZ, -2.4, 0.9); m.cyl(0.006, 0.008, 0.05, 0xd8ccb0, along(p, [0, 1, 0], 0.03)); m.sph(0.022, 0x8a2a1a, along(p, [0, 1, 0], 0.06), { s: [1, 0.5, 1] }, 0); }
    // war harness: two iron-studded leather girths over the shell
    for (const zc of [0.16, -0.2]) {
      for (let k = -4; k <= 4; k++) {
        const a = (k / 4) * 1.35;
        const x = Math.sin(a) * (RX + 0.012), y = C[1] + Math.cos(a) * (RY + 0.012) * Math.sqrt(Math.max(0.2, 1 - (zc * zc) / (RZ * RZ)));
        m.box(0.12, 0.022, 0.07, LEATHER, [x, y, zc], { r: [0, 0, -a], grit: 0.25 });
        if (k % 2 === 0) m.sph(0.012, IRON_L, [x * 1.05, y + 0.012, zc], { flat: true }, 0);
      }
    }
    // saddle blanket with a torn, fringed edge, and the saddle on it
    m.sph(1, CLOTH, [0, 0.74, -0.02], { s: [0.3, 0.05, 0.3], grit: 0.25, blood: 0.0 }, 1);
    for (let i = 0; i < 9; i++) m.box(0.025, 0.07, 0.008, 0x4a0e0a, [-0.2 + i * 0.05, 0.69, 0.27], { r: [0.2, 0, 0] });
    m.box(0.2, 0.06, 0.24, LEATHER_D, [0, 0.79, -0.02], { grit: 0.2 });
    m.box(0.2, 0.12, 0.05, LEATHER, [0, 0.84, -0.13], { r: [-0.25, 0, 0] }); // cantle
    m.box(0.12, 0.09, 0.05, LEATHER, [0, 0.83, 0.09], { r: [0.2, 0, 0] }); // pommel
    m.sph(0.022, BRASS, [0, 0.89, 0.1], { flat: true }, 0);
    // bedroll behind the saddle, lashed with two straps
    m.cyl(0.075, 0.075, 0.38, 0x6a5a3a, [0, 0.82, -0.27], { r: [0, 0, Math.PI / 2], grit: 0.3 }, 8);
    for (const x of [-0.1, 0.1]) m.cyl(0.08, 0.08, 0.025, LEATHER_D, [x, 0.82, -0.27], { r: [0, 0, Math.PI / 2] }, 8);
    // banner pole in a socket behind the cantle
    m.seg([0.12, 0.8, -0.18], [0.12, 1.42, -0.2], 0.018, 0.014, 0x3a2a1a);
    m.sph(0.03, IRON_L, [0.12, 1.43, -0.2], { flat: true }, 0);
  });
  // the torn war banner flaps on its own pivot (top of the pole)
  const banner = K.limb('banner', [0.12, 1.38, -0.2], (m) => {
    m.poly([[0, 0], [0, -0.3], [-0.1, -0.24], [-0.16, -0.32], [-0.22, -0.22], [-0.3, -0.28], [-0.3, 0]], CLOTH, [0, 0, 0], { r: [0, Math.PI / 2, 0], grit: 0.3 });
    m.poly([[-0.08, -0.06], [-0.2, -0.06], [-0.14, -0.17]], BONE, [0.003, 0, 0], { r: [0, Math.PI / 2, 0] }); // a pale fang sigil
  });
  // saddle bags (the loot pouch) and a hooded lantern: they sway as it walks
  const bags = K.limb('bags', [0, 0.66, -0.02], (m) => {
    for (const s of [-1, 1]) {
      const x = s * (RX + 0.09);
      m.box(0.12, 0.26, 0.3, LEATHER, [x, -0.14, 0], { grit: 0.3 });
      m.sph(0.15, LEATHER, [x, -0.25, 0], { s: [0.42, 0.45, 1], grit: 0.3 }, 1);
      m.box(0.135, 0.1, 0.31, LEATHER_D, [x, -0.04, 0], { grit: 0.2 }); // flap
      m.box(0.02, 0.05, 0.035, BRASS, [x + s * 0.07, -0.08, 0], { flat: true }); // buckle
      m.box(0.02, 0.22, 0.025, LEATHER_D, [s * (RX - 0.02), -0.01, 0.1], { r: [0, 0, s * 0.5] }); // strap up to the saddle
      m.box(0.02, 0.22, 0.025, LEATHER_D, [s * (RX - 0.02), -0.01, -0.1], { r: [0, 0, s * 0.5] });
    }
    // a rope coil and a hand axe on the right bag
    m.ring(0.07, 0.016, 0x8a7448, [RX + 0.16, -0.12, -0.06], { r: [0, 0, Math.PI / 2] }, Math.PI * 2, 8);
    m.seg([-(RX + 0.16), -0.28, -0.1], [-(RX + 0.16), 0.0, -0.06], 0.012, 0.012, 0x5a4028);
    m.box(0.02, 0.06, 0.08, IRON_L, [-(RX + 0.16), -0.01, -0.03]);
    // lantern on a hook at the front of the left bag
    m.seg([RX + 0.04, 0.02, 0.2], [RX + 0.08, -0.04, 0.24], 0.008, 0.008, IRON);
    m.cyl(0.03, 0.035, 0.07, IRON, [RX + 0.08, -0.09, 0.24], {}, 6);
    m.sph(0.026, 0xffc060, [RX + 0.08, -0.09, 0.24], { glow: true }, 0);
  });
  const head = K.limb('head', [0, 0.4, RZ + 0.02], (m) => {
    m.tube([[0, -0.03, -0.14], [0, 0.0, -0.02], [0, 0.04, 0.08]], [0.12, 0.11, 0.1], SKIN, { grit: 0.3 });
    for (const z of [-0.08, -0.02]) m.ring(0.112, 0.012, SKIN_D, [0, -0.01 + z * 0.3, z], { r: [Math.PI / 2 - 0.3, 0, 0] }, Math.PI * 2, 10); // neck folds
    m.sph(0.13, SKIN, [0, 0.07, 0.16], { s: [0.95, 0.82, 1.15], grit: 0.25 });
    m.cone(0.075, 0.1, SKIN_D, [0, 0.03, 0.31], { r: [Math.PI / 2 + 0.5, 0, 0] }, 5); // hooked beak
    m.box(0.14, 0.014, 0.08, SKIN_D, [0, 0.025, 0.27]); // grim mouth line
    // iron chamfron with a short horn, riveted to a leather head harness
    m.box(0.15, 0.03, 0.17, IRON, [0, 0.165, 0.16], { r: [0.22, 0, 0], grit: 0.2 });
    m.box(0.07, 0.025, 0.08, IRON_L, [0, 0.165, 0.27], { r: [0.5, 0, 0] });
    m.spike([0, 0.18, 0.2], [0, 1, 0.55], 0.1, 0.028, BONE, {}, 5);
    for (const s of [-1, 1]) {
      m.box(0.02, 0.1, 0.02, LEATHER, [s * 0.12, 0.08, 0.1], { r: [0, 0, s * 0.2] });
      m.sph(0.012, IRON_L, [s * 0.06, 0.18, 0.12], { flat: true }, 0);
      m.box(0.05, 0.03, 0.06, SKIN_D, [s * 0.07, 0.12, 0.23], { r: [0, 0, -s * 0.35] }); // heavy brow
    }
    eyes(m, 0.075, 0.095, 0.25, 0.022, 0xffc060);
  });
  const leg = (front: boolean) => (m: Mesher) => {
    m.seg([0, 0.02, 0], [0, -0.27, front ? 0.02 : -0.01], 0.1, 0.12, SKIN, { grit: 0.35 }, 7);
    m.cyl(0.13, 0.135, 0.06, SKIN_D, [0, -0.3, front ? 0.03 : 0], { grit: 0.3 }, 8); // round elephant foot
    for (const a of [-0.45, 0, 0.45]) m.spike([Math.sin(a) * 0.09, -0.31, (front ? 0.03 : 0) + Math.cos(a) * 0.1], [Math.sin(a) * 0.4, -0.3, 1], 0.06, 0.022, BONE, {}, 4);
    for (let i = 0; i < 5; i++) m.sph(0.03, SKIN_D, [Math.sin(i * 2.1) * 0.09, -0.06 - i * 0.04, Math.cos(i * 2.1) * 0.09], { s: [1, 0.6, 1] }, 0); // scales
    if (front) m.cyl(0.115, 0.12, 0.06, IRON, [0, -0.12, 0.01], { grit: 0.2 }, 8); // iron greave band
  };
  const legs = [
    K.limb('front', [0.3, 0.35, 0.3], leg(true)), K.limb('front', [-0.3, 0.35, 0.3], leg(true)),
    K.limb('back', [0.3, 0.35, -0.3], leg(false)), K.limb('back', [-0.3, 0.35, -0.3], leg(false)),
  ];
  for (const l of legs) l.rotation.z = (l.position.x > 0 ? -1 : 1) * 0.12;
  const tail = K.limb('tail', [0, 0.38, -RZ - 0.02], (m) => {
    m.horn([[0, 0, 0], [0, -0.04, -0.1], [0, -0.1, -0.2]], 0.07, SKIN, SKIN_D, { grit: 0.3 });
    m.cyl(0.06, 0.06, 0.03, IRON, [0, -0.03, -0.06], { r: [Math.PI / 2 - 0.4, 0, 0] }, 6);
    for (const s of [-1, 1]) m.spike([s * 0.03, -0.03, -0.1], [s, 0.6, -0.4], 0.06, 0.016, BONE, {}, 4);
  });
  return rig('tortoise', K, { body, head, legs, tail, joints: { bags, banner }, extra: [bags, banner] }, 1.05);
}

// ------------------------------------------------------------------ Rustbrush Fox

function fox(): PetRig {
  const K = new Kit('pet_fox', 0xffc060, 1.3);
  const FUR = 0x9a4a1a;
  const FUR_D = 0x4a2210;
  const FUR_L = 0xb8642a;
  const WHITE = 0xd8cdb8;
  const SOCK = 0x1c1612;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.tube([[0, 0.31, 0.16], [0, 0.3, 0.0], [0, 0.29, -0.16]], [0.11, 0.105, 0.1], FUR, { grit: 0.3 });
    m.sph(0.5, WHITE, [0, 0.26, 0.18], { s: [0.18, 0.2, 0.16], grit: 0.25 }); // chest ruff
    for (let i = 0; i < 5; i++) m.spike([0, 0.22 - i * 0.012, 0.2 - i * 0.02], [0, -1, 0.3], 0.05, 0.022, WHITE, {}, 4); // shaggy ruff tufts
    m.sph(0.5, FUR_D, [0, 0.37, -0.02], { s: [0.12, 0.05, 0.36], grit: 0.3 }); // dark saddle on the back
    for (let i = 0; i < 6; i++) m.spike([0, 0.38, 0.12 - i * 0.05], [0, 1, -0.6], 0.035, 0.014, FUR_D, {}, 3); // hackles
    m.ring(0.085, 0.014, 0x3a2414, [0, 0.36, 0.2], { r: [0.9, 0, 0] }, Math.PI * 2, 10); // worn leather collar
    m.spike([0, 0.27, 0.27], [0, -1, 0.2], 0.05, 0.012, 0xd8ccb0, {}, 4); // a wolf's tooth charm
  });
  const head = K.limb('head', [0, 0.42, 0.24], (m) => {
    m.sph(0.1, FUR, [0, 0.02, 0], { s: [1.1, 0.92, 1.05], grit: 0.25 });
    for (const s of [-1, 1]) m.spike([s * 0.08, -0.02, 0.0], [s, -0.4, -0.3], 0.07, 0.035, WHITE, {}, 4); // cheek tufts
    m.cone(0.055, 0.15, FUR_L, [0, -0.02, 0.13], { r: [Math.PI / 2, 0, 0] }, 6); // long snout
    m.cone(0.04, 0.1, WHITE, [0, -0.045, 0.12], { r: [Math.PI / 2 + 0.1, 0, 0] }, 5); // pale jaw
    m.sph(0.02, SOCK, [0, -0.01, 0.205], { flat: true }, 0); // nose
    m.box(0.008, 0.06, 0.012, 0xd8b0a0, [0.04, 0.05, 0.08], { r: [0.4, 0, 0.6], flat: true }); // old scar over the right eye
    m.box(0.008, 0.035, 0.012, 0xd8b0a0, [0.025, 0.06, 0.09], { r: [0.4, 0, -0.5], flat: true });
    eyes(m, 0.045, 0.04, 0.075, 0.02, 0xffd060);
  });
  const ear = (s: number, notch: boolean) => K.limb(s > 0 ? 'earR' : 'earL', [s * 0.06, 0.12, -0.01], (m) => {
    m.cone(0.045, 0.14, FUR_D, [0, 0.06, 0], { r: [-0.15, 0, -s * 0.22] }, 4);
    m.cone(0.026, 0.09, 0x2a140a, [s * 0.003, 0.05, 0.012], { r: [-0.15, 0, -s * 0.22] }, 4);
    if (notch) m.box(0.03, 0.025, 0.05, FUR_D, [s * 0.03, 0.1, 0], { r: [0, 0, 0.6] }); // torn notch (filled darker)
  });
  const earR = ear(1, true), earL = ear(-1, false);
  head.add(earR, earL);
  small(earR); small(earL);
  const leg = (front: boolean) => (m: Mesher) => {
    m.seg([0, 0, 0], [0, -0.18, front ? 0.01 : -0.02], 0.034, 0.022, front ? FUR : FUR_L);
    m.seg([0, -0.1, 0], [0, -0.21, 0.01], 0.024, 0.02, SOCK); // black socks
    m.box(0.045, 0.02, 0.055, SOCK, [0, -0.215, 0.015]);
  };
  const legs = [
    K.limb('front', [0.07, 0.22, 0.15], leg(true)), K.limb('front', [-0.07, 0.22, 0.15], leg(true)),
    K.limb('back', [0.08, 0.22, -0.15], leg(false)), K.limb('back', [-0.08, 0.22, -0.15], leg(false)),
  ];
  // the brush: a thick base and a separate bushy end with the pale tip (swings behind the base)
  const tail = K.limb('tail', [0, 0.32, -0.24], (m) => {
    m.tube([[0, 0, 0], [0, -0.01, -0.1], [0, -0.03, -0.18]], [0.04, 0.075, 0.09], FUR, { grit: 0.35 });
    for (let i = 0; i < 5; i++) m.spike([Math.sin(i * 1.3) * 0.05, -0.02 + Math.cos(i * 1.3) * 0.05, -0.12], [Math.sin(i * 1.3), Math.cos(i * 1.3), -1], 0.06, 0.03, FUR_L, {}, 3);
  });
  const tip = K.limb('tailTip', [0, -0.03, -0.18], (m) => {
    m.tube([[0, 0, 0], [0, -0.02, -0.11], [0, 0.0, -0.2]], [0.09, 0.085, 0.05], FUR, { grit: 0.35 });
    m.sph(0.07, WHITE, [0, 0.0, -0.22], { s: [1, 1, 1.35], grit: 0.2 });
    for (let i = 0; i < 4; i++) m.spike([Math.sin(i * 1.7) * 0.05, Math.cos(i * 1.7) * 0.05, -0.24], [Math.sin(i * 1.7) * 0.5, Math.cos(i * 1.7) * 0.5, -1], 0.05, 0.025, WHITE, {}, 3);
  });
  tail.add(tip);
  return rig('fox', K, { body, head, legs, tail, joints: { earL, earR, tip } }, 0.6);
}

// ------------------------------------------------------------------ birds (owl, raven)

function bird(id: 'owl' | 'raven'): PetRig {
  const owl = id === 'owl';
  const K = new Kit('pet_' + id, owl ? 0xffa020 : 0xc8d0e8, owl ? 1.7 : 1.2);
  // owl: a dark eagle-owl, mottled; raven: black with a blue-violet sheen, pale eyes and a grey beak
  const F = owl ? 0x5e4a34 : 0x24242e;
  const F_D = owl ? 0x2e2216 : 0x121218;
  const F_L = owl ? 0xa8946c : 0x3e3e52;
  const BEAK = owl ? 0x2a2218 : 0x7a7a80;
  const TALON = 0x141210;
  const body = K.limb('body', [0, 0, 0], (m) => {
    if (owl) {
      m.sph(0.5, F, [0, 0.2, 0], { s: [0.32, 0.4, 0.3], grit: 0.3 });
      m.sph(0.5, F_L, [0, 0.18, 0.06], { s: [0.24, 0.32, 0.2], grit: 0.35 }); // pale breast
      for (let i = 0; i < 7; i++) m.box(0.012, 0.05, 0.01, F_D, [-0.06 + (i % 4) * 0.04, 0.3 - i * 0.03, 0.155 - Math.abs(i % 4 - 1.5) * 0.01], { r: [0.1, 0, 0] }); // streaks
      for (let i = 0; i < 6; i++) m.spike([(-2.5 + i) * 0.03, 0.06, 0.1], [0, -1, 0.3], 0.05, 0.02, F_L, {}, 3); // feathered legs
    } else {
      m.sph(0.5, F, [0, 0.18, 0], { s: [0.22, 0.24, 0.36], grit: 0.3 });
      // ragged hackles at the throat and torn feathers along the back
      for (let i = 0; i < 6; i++) m.spike([(-2.5 + i) * 0.022, 0.18, 0.15], [(-2.5 + i) * 0.2, -1, 0.6], 0.07 + (i % 3) * 0.02, 0.016, F_D, {}, 3);
      for (let i = 0; i < 5; i++) m.spike([(i % 2 ? 1 : -1) * 0.05, 0.27, 0.06 - i * 0.05], [(i % 2 ? 0.6 : -0.6), 0.5, -1], 0.06, 0.014, F_L, {}, 3);
      m.sph(0.02, 0xcabd98, [0.06, 0.12, 0.13], { flat: true }, 0); // a little finger-bone charm on a thread
      m.seg([0.03, 0.18, 0.14], [0.06, 0.13, 0.13], 0.003, 0.003, 0x6a5a4a);
    }
  });
  const head = K.limb('head', [0, owl ? 0.43 : 0.33, owl ? 0.02 : 0.14], (m) => {
    m.sph(owl ? 0.15 : 0.1, F, [0, 0, 0], { s: [1.05, 0.9, 0.95], grit: 0.25 });
    if (owl) {
      for (const s of [-1, 1]) {
        m.sph(0.075, F_L, [s * 0.065, -0.005, 0.09], { s: [1, 1.05, 0.35], grit: 0.2 }, 1); // facial discs
        m.ring(0.075, 0.012, F_D, [s * 0.065, -0.005, 0.1], { r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 10); // dark rim
        m.cone(0.04, 0.12, F_D, [s * 0.09, 0.15, -0.01], { r: [-0.25, 0, -s * 0.4] }, 4); // long ear tufts
        m.sph(0.036, 0xff8a10, [s * 0.065, 0.005, 0.12], { glow: true }, 1); // burning orange eyes
        m.sph(0.019, EYE, [s * 0.065, 0.005, 0.15], { flat: true }, 0);
        m.box(0.06, 0.015, 0.02, F_D, [s * 0.07, 0.05, 0.12], { r: [0, 0, s * 0.35] }); // fierce brow
      }
      m.cone(0.02, 0.06, BEAK, [0, -0.045, 0.14], { r: [Math.PI * 0.8, 0, 0] }, 4);
    } else {
      m.cone(0.03, 0.15, BEAK, [0, -0.01, 0.16], { r: [Math.PI / 2 + 0.18, 0, 0] }, 5); // heavy beak
      m.box(0.035, 0.012, 0.06, F_D, [0, 0.025, 0.1]); // nasal bristles
      for (let i = 0; i < 3; i++) m.spike([(i - 1) * 0.03, 0.06, -0.04], [(i - 1) * 0.5, 0.6, -1], 0.06, 0.014, F_D, {}, 3); // ruffled crown
      eyes(m, 0.055, 0.025, 0.06, 0.017, 0xd8e0ff);
    }
  });
  const foot = (m: Mesher) => {
    m.seg([0, 0, 0], [0, -0.08, 0.01], 0.014, 0.011, owl ? 0x6a5a3a : 0x24242a);
    for (const a of [-0.55, 0, 0.55]) m.spike([0, -0.08, 0.01], [Math.sin(a), -0.15, Math.cos(a)], 0.05, 0.009, TALON);
    m.spike([0, -0.08, 0.01], [0, -0.1, -1], 0.035, 0.008, TALON);
  };
  const legs = [K.limb('foot', [0.06, 0.09, 0.02], foot), K.limb('foot', [-0.06, 0.09, 0.02], foot)];
  // two-part wings: an inner arm and the primaries on their own pivot (the tip lags the beat)
  const span = owl ? 1 : 0.8;
  const wing = (s: number) => {
    const inner = K.limb(s > 0 ? 'wingR' : 'wingL', [s * (owl ? 0.14 : 0.1), owl ? 0.3 : 0.24, 0], (m) => {
      m.sph(0.5, F_D, [s * 0.06 * span, -0.03, -0.03], { s: [0.07, 0.22 * span, 0.3], grit: 0.3 });
      for (let i = 0; i < 4; i++) m.box(0.02, 0.06, 0.13 - i * 0.015, i % 2 ? F : F_L, [s * (0.05 + i * 0.03) * span, -0.12 * span - i * 0.012, -0.06], { grit: 0.3 });
    });
    const tipW = K.limb(s > 0 ? 'wingTipR' : 'wingTipL', [s * 0.13 * span, -0.14 * span, -0.04], (m) => {
      for (let i = 0; i < 5; i++) {
        const len = (owl ? 0.2 : 0.18) - i * 0.015 + (owl ? 0 : ((i * 7) % 3) * 0.02); // ragged raven primaries
        m.box(0.016, len, 0.045, i % 2 ? F_D : F, [s * i * 0.022, -len / 2, -0.02 - i * 0.012], { r: [0, 0, s * (0.05 + i * 0.09)], grit: 0.35 });
      }
    });
    inner.add(tipW);
    return { inner, tipW };
  };
  const wR = wing(1), wL = wing(-1);
  const tail = K.limb('tail', [0, owl ? 0.1 : 0.12, owl ? -0.15 : -0.17], (m) => {
    for (let i = 0; i < 5; i++) {
      const len = owl ? 0.14 : 0.17 + ((i * 5) % 3) * 0.025;
      m.box(0.03, 0.012, len, i % 2 ? F_D : F, [(i - 2) * 0.022, 0, -len / 2], { r: [-0.35, (i - 2) * 0.12, 0], grit: 0.3 });
    }
  });
  return rig(id, K, { body, head, legs, tail, wings: [wR.inner, wL.inner], joints: { tipR: wR.tipW, tipL: wL.tipW } }, owl ? 0.62 : 0.46, owl ? 0.95 : 0.8);
}

// ------------------------------------------------------------------ Timbertooth Beaver

function beaver(): PetRig {
  const K = new Kit('pet_beaver', 0xffd090, 1.2);
  const FUR = 0x553420;
  const FUR_D = 0x2e1c10;
  const FUR_L = 0x7a5232;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, FUR, [0, 0.23, -0.03], { s: [0.36, 0.33, 0.48], grit: 0.35 });
    m.sph(0.5, FUR_L, [0, 0.19, 0.08], { s: [0.24, 0.22, 0.24], grit: 0.3 });
    for (let i = 0; i < 10; i++) m.spike([Math.sin(i * 2.4) * 0.12, 0.33 + Math.cos(i * 1.7) * 0.03, 0.05 - i * 0.025], [Math.sin(i * 2.4) * 0.4, 0.5, -1], 0.05, 0.022, FUR_D, {}, 3); // wet spiky fur
  });
  const head = K.limb('head', [0, 0.33, 0.23], (m) => {
    m.sph(0.12, FUR, [0, 0, 0], { s: [1.1, 0.95, 1], grit: 0.3 });
    m.sph(0.065, FUR_L, [0, -0.035, 0.085], { s: [1.25, 0.8, 0.9] }, 1); // muzzle
    m.sph(0.022, 0x140c08, [0, -0.005, 0.145], { flat: true }, 0);
    m.box(0.025, 0.06, 0.014, 0xd8781a, [0.013, -0.09, 0.12], { flat: true }); // big orange incisors
    m.box(0.025, 0.06, 0.014, 0xd8781a, [-0.013, -0.09, 0.12], { flat: true });
    for (const s of [-1, 1]) {
      m.sph(0.032, FUR_D, [s * 0.09, 0.085, -0.02], { s: [1, 1, 0.5] }, 0);
      for (const a of [-0.25, 0.1]) m.box(0.08, 0.004, 0.004, 0xd8d0c0, [s * 0.06, -0.03, 0.1], { r: [0, -s * 0.3, a], flat: true });
    }
    // a gnawed stick held crosswise in the teeth: pale chewed ends and two last leaves
    m.seg([-0.17, -0.1, 0.11], [0.17, -0.09, 0.12], 0.016, 0.016, 0x6a4a2a, { grit: 0.3 });
    for (const s of [-1, 1]) m.cone(0.017, 0.035, 0xd8c09a, [s * 0.185, -0.095, 0.115], { r: [0, 0, -s * Math.PI / 2] }, 5);
    m.sph(0.03, 0x4a6a24, [0.12, -0.07, 0.13], { s: [1.4, 0.35, 0.8], r: [0, 0, 0.5] }, 0);
    m.sph(0.026, 0x5a7a2a, [0.14, -0.06, 0.11], { s: [1.4, 0.35, 0.8], r: [0, 0, -0.3] }, 0);
    eyes(m, 0.055, 0.035, 0.075, 0.019);
  });
  const leg = (front: boolean) => (m: Mesher) => {
    m.sph(0.05, FUR_D, [0, -0.06, 0.01], { s: [1, 1.2, 1.2] }, 0);
    m.box(front ? 0.06 : 0.08, 0.02, front ? 0.07 : 0.1, 0x241810, [0, -0.115, 0.03]); // big webbed hind feet
    for (const dx of [-0.02, 0, 0.02]) m.spike([dx, -0.11, front ? 0.065 : 0.08], [0, -0.3, 1], 0.025, 0.006, 0x141008, {}, 3);
  };
  const legs = [
    K.limb('front', [0.12, 0.12, 0.13], leg(true)), K.limb('front', [-0.12, 0.12, 0.13], leg(true)),
    K.limb('back', [0.13, 0.12, -0.15], leg(false)), K.limb('back', [-0.13, 0.12, -0.15], leg(false)),
  ];
  const tail = K.limb('tail', [0, 0.1, -0.26], (m) => {
    m.seg([0, 0, 0.02], [0, -0.01, -0.06], 0.05, 0.04, FUR);
    m.sph(0.5, 0x2a2624, [0, -0.01, -0.17], { s: [0.2, 0.045, 0.28], grit: 0.4 }); // flat scaly paddle
    for (let i = 0; i < 4; i++) m.box(0.15 - Math.abs(i - 1.5) * 0.02, 0.006, 0.006, 0x141210, [0, 0.014, -0.08 - i * 0.05]);
    for (let i = 0; i < 3; i++) m.box(0.006, 0.006, 0.2, 0x141210, [(i - 1) * 0.05, 0.014, -0.17]);
  });
  return rig('beaver', K, { body, head, legs, tail }, 0.5);
}

// ------------------------------------------------------------------ Burrowclaw Mole

function mole(): PetRig {
  const K = new Kit('pet_mole', 0xffb050, 1.4);
  const FUR = 0x2e2a34;
  const FUR_L = 0x46424e;
  const PINK = 0xc88078;
  const CLAW = 0xd8c8a8;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, FUR, [0, 0.16, -0.03], { s: [0.3, 0.25, 0.44], grit: 0.2 });
    m.sph(0.5, FUR_L, [0, 0.22, -0.03], { s: [0.2, 0.1, 0.34], grit: 0.25 });
    for (let i = 0; i < 6; i++) m.sph(0.03, 0x4a3a28, [Math.sin(i * 2.2) * 0.1, 0.1 + (i % 3) * 0.04, -0.05 + Math.cos(i * 1.9) * 0.12], { s: [1.4, 0.6, 1] }, 0); // caked earth
  });
  const head = K.limb('head', [0, 0.18, 0.2], (m) => {
    m.sph(0.09, FUR, [0, 0, 0], { s: [1, 0.9, 1.1], grit: 0.2 });
    m.cone(0.045, 0.1, 0x4a3e46, [0, -0.01, 0.11], { r: [Math.PI / 2, 0, 0] }, 6);
    // the star nose: a ring of pink tendrils
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      m.spike([Math.cos(a) * 0.02, -0.01 + Math.sin(a) * 0.02, 0.16], [Math.cos(a), Math.sin(a), 0.6], 0.03, 0.007, PINK, { flat: true }, 3);
    }
    m.sph(0.017, 0xe09a90, [0, -0.01, 0.165], { flat: true }, 0);
    eyes(m, 0.04, 0.035, 0.07, 0.011);
    // a battered tin miner's cap with a candle stub
    m.cyl(0.075, 0.085, 0.045, 0x6a6a5a, [0, 0.075, -0.005], { r: [-0.15, 0, 0.1], grit: 0.35 }, 8);
    m.box(0.09, 0.012, 0.05, 0x5a5a4a, [0, 0.06, 0.07], { r: [-0.3, 0, 0.1] });
    m.cyl(0.012, 0.012, 0.045, 0xe0d8c0, [0.01, 0.12, 0.0], {}, 6);
    m.sph(0.016, 0xffb050, [0.01, 0.152, 0.0], { glow: true, s: [0.8, 1.4, 0.8] }, 0);
  });
  const claw = (front: boolean) => (m: Mesher) => {
    if (front) {
      m.seg([0, 0, 0], [0, -0.05, 0.03], 0.04, 0.035, FUR);
      m.sph(0.06, PINK, [0, -0.07, 0.05], { s: [1.3, 0.45, 1.1], grit: 0.2 }); // broad spade paw
      for (const dx of [-0.045, -0.022, 0, 0.022, 0.045]) m.spike([dx, -0.075, 0.1], [dx * 3, -0.3, 1], 0.07, 0.011, CLAW, {}, 4);
    } else {
      m.sph(0.035, PINK, [0, -0.06, 0], { s: [1, 0.6, 1.3] }, 0);
      for (const dx of [-0.015, 0.015]) m.spike([dx, -0.065, 0.035], [0, -0.2, 1], 0.025, 0.006, CLAW, {}, 3);
    }
  };
  const legs = [
    K.limb('frontR', [0.14, 0.12, 0.1], claw(true)), K.limb('frontL', [-0.14, 0.12, 0.1], claw(true)),
    K.limb('back', [0.1, 0.09, -0.17], claw(false)), K.limb('back', [-0.1, 0.09, -0.17], claw(false)),
  ];
  // front paws turned out like spades
  legs[0].rotation.z = -0.5;
  legs[1].rotation.z = 0.5;
  const tail = K.limb('tail', [0, 0.13, -0.24], (m) => m.spike([0, 0, 0], [0, 0.25, -1], 0.08, 0.013, PINK));
  const puffs: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) puffs.push(K.limb('puff', [0, 0, 0], (m) => {
    m.sph(0.05, 0x5a4630, [0, 0, 0], { grit: 0.4 }, 0);
    m.sph(0.035, 0x7a6448, [0.03, 0.02, 0.01], { grit: 0.4 }, 0);
  }));
  return rig('mole', K, { body, head, legs, tail, puffs }, 0.36);
}

// ------------------------------------------------------------------ Riverglint Otter

function otter(): PetRig {
  const K = new Kit('pet_otter', 0xffe0b0, 1.2);
  const FUR = 0x4a301c;
  const FUR_D = 0x2a1a0e;
  const FACE = 0xa89070;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.tube([[0, 0.21, 0.16], [0, 0.21, 0.02], [0, 0.2, -0.06]], [0.09, 0.11, 0.105], FUR, { grit: 0.25 });
    m.sph(0.5, FACE, [0, 0.17, 0.1], { s: [0.12, 0.12, 0.2], grit: 0.2 }); // pale throat
    for (let i = 0; i < 4; i++) m.box(0.012, 0.004, 0.06, 0x6a4a30, [(i - 1.5) * 0.03, 0.31, 0.04], { flat: true }); // wet sheen streaks
  });
  // the hips and hind legs swing on their own pivot for the swimming wiggle
  const rear = K.limb('rear', [0, 0.2, -0.06], (m) => {
    m.tube([[0, 0, 0], [0, -0.01, -0.12]], [0.105, 0.095], FUR, { grit: 0.25 });
  });
  const head = K.limb('head', [0, 0.29, 0.25], (m) => {
    m.sph(0.085, FUR, [0, 0, 0], { s: [1.15, 0.85, 1.05], grit: 0.25 });
    m.sph(0.06, FACE, [0, -0.025, 0.065], { s: [1.25, 0.8, 0.9] }, 1);
    m.sph(0.02, 0x120c08, [0, 0.0, 0.115], { flat: true }, 0);
    for (const s of [-1, 1]) {
      m.sph(0.022, FUR_D, [s * 0.075, 0.05, -0.02], {}, 0); // tiny ears
      for (const a of [-0.25, 0.05, 0.3]) m.box(0.1, 0.004, 0.004, 0xe8e0d0, [s * 0.055, -0.03, 0.09], { r: [0, -s * 0.3, a], flat: true }); // whiskers
    }
    // a silver fish caught crosswise in its jaws
    m.sph(0.5, 0x9aaab8, [0.05, -0.06, 0.1], { s: [0.2, 0.05, 0.05], grit: 0.15 });
    m.poly([[0, 0], [0.05, 0.035], [0.05, -0.035]], 0x7a8a98, [0.15, -0.06, 0.1], {});
    m.sph(0.008, 0x101010, [-0.03, -0.055, 0.125], { flat: true }, 0);
    eyes(m, 0.042, 0.025, 0.06, 0.017);
  });
  const leg = (m: Mesher) => {
    m.seg([0, 0, 0], [0, -0.1, 0.01], 0.026, 0.02, FUR);
    m.box(0.05, 0.012, 0.06, 0x1e140c, [0, -0.105, 0.025]); // webbed paw
  };
  const legs = [K.limb('leg', [0.075, 0.12, 0.12], leg), K.limb('leg', [-0.075, 0.12, 0.12], leg)];
  const back = [K.limb('leg', [0.08, -0.08, -0.08], leg), K.limb('leg', [-0.08, -0.08, -0.08], leg)];
  rear.add(...back);
  legs.push(...back);
  const tail = K.limb('tail', [0, -0.02, -0.14], (m) => m.tube([[0, 0, 0], [0, -0.02, -0.12]], [0.07, 0.055], FUR, { grit: 0.25 }));
  const tip = K.limb('tailTip', [0, -0.02, -0.12], (m) => m.horn([[0, 0, 0], [0, -0.03, -0.12], [0, -0.04, -0.22]], 0.055, FUR, FUR_D, { grit: 0.25 }));
  tail.add(tip);
  rear.add(tail);
  return rig('otter', K, { body, head, legs, tail, extra: [rear], joints: { rear, tip } }, 0.42);
}

// ------------------------------------------------------------------ Cinderling Whelp

function whelp(): PetRig {
  const K = new Kit('pet_whelp', 0xff6a10, 2.1);
  const SCALE = 0x5a1e12;
  const SCALE_D = 0x24100a;
  const BELLY = 0xa87040;
  const HORN = 0xcabd98;
  const EMBER = 0xff6a10;
  const body = K.limb('body', [0, 0, 0], (m) => {
    m.sph(0.5, SCALE, [0, 0.27, -0.02], { s: [0.3, 0.28, 0.4], grit: 0.35 });
    m.sph(0.5, BELLY, [0, 0.22, 0.08], { s: [0.19, 0.2, 0.2], grit: 0.25 });
    for (let i = 0; i < 4; i++) m.box(0.12 - i * 0.012, 0.012, 0.02, 0x7a4a28, [0, 0.3 - i * 0.045, 0.17 - i * 0.008]); // belly plates
    m.sph(0.035, 0xff8a2a, [0, 0.24, 0.17], { glow: true, s: [1.6, 1, 0.5] }, 0); // ember in the chest
    // glowing cracks between the scales
    for (const [x, y, z, r] of [[0.1, 0.33, 0.02, 0.4], [-0.11, 0.3, -0.05, -0.5], [0.08, 0.26, -0.12, 0.9], [-0.06, 0.35, 0.08, -0.2]] as Array<[number, number, number, number]>) m.box(0.006, 0.05, 0.006, EMBER, [x, y, z], { glow: true, r: [0.4, 0, r] });
    for (let i = 0; i < 6; i++) m.spike([0, 0.41 - Math.abs(i - 1) * 0.02, 0.1 - i * 0.065], [0, 1, -0.45], 0.075 - i * 0.006, 0.024, SCALE_D, {}, 4); // back ridge
  });
  const head = K.limb('head', [0, 0.44, 0.19], (m) => {
    m.sph(0.12, SCALE, [0, 0, 0], { s: [1.05, 0.92, 1], grit: 0.3 });
    m.box(0.11, 0.055, 0.12, SCALE, [0, 0.0, 0.11], { grit: 0.3 }); // upper snout
    for (const s of [-1, 1]) {
      m.sph(0.012, 0x1a0a06, [s * 0.028, 0.02, 0.17], { flat: true }, 0);
      m.horn([[s * 0.06, 0.08, -0.04], [s * 0.09, 0.14, -0.1], [s * 0.1, 0.16, -0.17]], 0.024, HORN, HORN); // swept horns
      m.spike([s * 0.1, -0.01, -0.03], [s, -0.2, -0.6], 0.06, 0.016, SCALE_D, {}, 3); // cheek spines
      m.sph(0.03, 0xffa020, [s * 0.058, 0.04, 0.075], { glow: true }, 1); // ember eyes
      m.sph(0.013, EYE, [s * 0.06, 0.04, 0.1], { flat: true, s: [0.45, 1.3, 1] }, 0);
      m.box(0.05, 0.016, 0.03, SCALE_D, [s * 0.06, 0.075, 0.08], { r: [0, 0, s * 0.35] }); // scowl
    }
    for (const s of [-1, 1]) m.spike([s * 0.035, -0.03, 0.15], [0, -1, 0.1], 0.025, 0.008, HORN, {}, 3); // fangs over the lip
  });
  const jaw = K.limb('jaw', [0, -0.04, 0.03], (m) => {
    m.box(0.095, 0.03, 0.12, SCALE_D, [0, -0.01, 0.07], { grit: 0.3 });
    m.box(0.07, 0.012, 0.09, 0xff7a20, [0, 0.008, 0.07], { glow: true }); // glowing gullet
  });
  head.add(jaw);
  small(jaw);
  const leg = (front: boolean) => (m: Mesher) => {
    m.seg([0, 0, 0], [0, -0.17, front ? 0.02 : -0.01], 0.045, 0.032, SCALE);
    m.box(0.055, 0.02, 0.065, SCALE_D, [0, -0.185, 0.02]);
    for (const dx of [-0.018, 0, 0.018]) m.spike([dx, -0.185, 0.05], [0, -0.3, 1], 0.035, 0.008, HORN, { blood: 0.3 });
  };
  const legs = [
    K.limb('front', [0.1, 0.21, 0.13], leg(true)), K.limb('front', [-0.1, 0.21, 0.13], leg(true)),
    K.limb('back', [0.11, 0.21, -0.15], leg(false)), K.limb('back', [-0.11, 0.21, -0.15], leg(false)),
  ];
  // bat wings: the arm with a claw, and the fingers with the torn membrane on their own pivot
  const wing = (s: number) => {
    const arm = K.limb(s > 0 ? 'wingR' : 'wingL', [s * 0.13, 0.37, -0.02], (m) => {
      m.seg([0, 0, 0], [s * 0.16, 0.12, -0.04], 0.02, 0.014, SCALE_D);
      m.poly([[0, 0], [s * 0.16, 0.12], [s * 0.12, -0.04], [s * 0.04, -0.06]], 0x4a160c, [0, 0, -0.03], { grit: 0.2 });
      m.spike([s * 0.16, 0.12, -0.04], [s * 0.3, 1, 0.3], 0.05, 0.01, HORN);
    });
    const fingers = K.limb(s > 0 ? 'wingTipR' : 'wingTipL', [s * 0.16, 0.12, -0.04], (m) => {
      for (const [dx, dy] of [[0.14, -0.04], [0.1, -0.12], [0.04, -0.16]] as Array<[number, number]>) m.seg([0, 0, 0], [s * dx, dy, -0.02], 0.01, 0.006, SCALE_D);
      m.poly([[0, 0], [s * 0.14, -0.04], [s * 0.1, -0.08], [s * 0.1, -0.12], [s * 0.06, -0.12], [s * 0.04, -0.16], [-s * 0.04, -0.16]], 0x5a1a10, [0, 0, -0.01], { grit: 0.25 });
    });
    arm.add(fingers);
    small(fingers);
    return { arm, fingers };
  };
  const wR = wing(1), wL = wing(-1);
  const tail = K.limb('tail', [0, 0.25, -0.2], (m) => m.tube([[0, 0, 0], [0.02, -0.05, -0.12]], [0.055, 0.042], SCALE, { grit: 0.3 }));
  const tip = K.limb('tailTip', [0.02, -0.05, -0.12], (m) => {
    m.horn([[0, 0, 0], [0.04, -0.04, -0.1], [0.06, -0.05, -0.18]], 0.042, SCALE, SCALE_D, { grit: 0.3 });
    m.poly([[0, 0.04], [0.05, 0], [0, -0.06], [-0.05, 0]], SCALE_D, [0.06, -0.05, -0.2], { r: [Math.PI / 2, 0, 0] }); // spade
  });
  tail.add(tip);
  const puffs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) puffs.push(K.limb('ember', [0, 0, 0], (m) => {
    m.sph(0.04, 0xff7a20, [0, 0, 0], { glow: true }, 0);
    m.sph(0.025, 0xffd060, [0.015, 0.012, 0.02], { glow: true }, 0);
  }));
  return rig('whelp', K, { body, head, legs, tail, wings: [wR.arm, wL.arm], puffs, joints: { jaw, tip, tipR: wR.fingers, tipL: wL.fingers } }, 0.66);
}

const BUILDERS: Record<PetId, () => PetRig> = { tortoise, fox, owl: () => bird('owl'), beaver, mole, otter, whelp, raven: () => bird('raven') };

/** Every pet is drawn a bit larger than life so it reads at 32 art pixels per tile. */
const PET_SCALE = 1.35;

/** A new instance of a pet's model. Pet level grows it (+2% a level, `petSizeFactor`). */
export function buildPet(id: PetId, level = 1): PetRig {
  const r = BUILDERS[id]();
  r.root.scale.setScalar(PET_SCALE * petSizeFactor(level));
  return r;
}

/** Frees the per-instance materials (geometry is shared and cached). */
export function disposePet(r: PetRig): void {
  for (const m of r.materials) m.dispose();
}

// ------------------------------------------------------------------ animation

const pulse = (x: number, sharp: number) => Math.pow(Math.max(0, Math.sin(x)), sharp);

/** Trot / walk with diagonal pairs; `lift` raises the swinging foot. */
function gait(r: PetRig, ph: number, walk: number, swing: number, lift: number): void {
  r.legs.forEach((l, i) => {
    const pair = i === 0 || i === 3 ? 0 : Math.PI;
    l.rotation.x = (l.userData.rest as number) + Math.sin(ph + pair) * swing * walk;
    l.position.y = (l.userData.restY as number) + Math.max(0, Math.cos(ph + pair)) * lift * walk;
  });
}

/**
 * Idle and walk animation. `walk` 0..1 blends from standing to walking; `t` is the pet's own clock
 * (seconds). Each pet moves in its own way; birds take off while their owner walks and land when
 * they stop.
 */
export function animatePet(r: PetRig, t: number, walk: number): void {
  const st = r.st;
  const dt = st.last < 0 ? 0 : Math.min(0.1, Math.max(0, t - st.last));
  st.last = t;
  const sd = st.seed;
  const J = r.joints;
  switch (r.id) {
    case 'tortoise': {
      // slow, heavy stomp: the body dips and rolls onto each planted foot, the head bobs
      const ph = t * (2.4 + walk * 2.2);
      gait(r, ph, walk, 0.32, 0.07);
      r.body.position.y = -Math.abs(Math.sin(ph)) * 0.035 * walk + Math.sin(t * 1.1) * 0.006;
      r.body.rotation.z = Math.sin(ph) * 0.045 * walk;
      r.body.rotation.x = Math.sin(ph * 2) * 0.015 * walk;
      r.head.rotation.x = Math.sin(ph * 2 + 0.6) * 0.1 * walk + Math.sin(t * 0.7 + sd) * 0.05 * (1 - walk);
      r.head.rotation.y = Math.sin(t * 0.35 + sd) * 0.35 * (1 - walk);
      r.head.position.z = 0.52 + Math.sin(ph * 2) * 0.015 * walk - pulse(t * 0.25 + sd, 12) * 0.06 * (1 - walk); // pulls its head in now and then
      if (J.bags) J.bags.rotation.z = -Math.sin(ph - 0.5) * 0.09 * walk;
      if (J.banner) J.banner.rotation.y = Math.sin(t * 3.1 + sd) * 0.25 + 0.35 * walk;
      if (r.tail) r.tail.rotation.y = Math.sin(ph) * 0.2 * walk;
      break;
    }
    case 'fox': {
      const ph = t * (5 + walk * 8);
      gait(r, ph, walk, 0.6, 0.04);
      r.body.position.y = Math.abs(Math.sin(ph)) * 0.025 * walk + Math.sin(t * 2) * 0.005;
      // sniffs the ground now and then, glances about, ears flick on their own
      const sniff = pulse(t * 0.45 + sd, 10) * (1 - walk);
      r.head.rotation.x = sniff * 0.55 + Math.sin(ph * 2) * 0.04 * walk + Math.sin(t * 1.3) * 0.04 * (1 - walk);
      r.head.rotation.y = Math.sin(t * 0.6 + sd) * 0.45 * (1 - walk) * (1 - sniff);
      r.head.rotation.z = Math.sin(t * 0.37 + sd) * 0.18 * (1 - walk);
      if (J.earL) J.earL.rotation.x = -pulse(t * 1.7 + sd, 16) * 0.5 - walk * 0.2;
      if (J.earR) J.earR.rotation.x = -pulse(t * 1.3 + sd + 1, 16) * 0.5 - walk * 0.2;
      if (r.tail) {
        r.tail.rotation.y = Math.sin(t * (2.2 + walk * 4)) * (0.25 + walk * 0.1);
        r.tail.rotation.x = -0.15 + walk * 0.25;
      }
      if (J.tip) J.tip.rotation.y = Math.sin(t * (2.2 + walk * 4) - 0.9) * (0.35 + walk * 0.1);
      break;
    }
    case 'owl':
    case 'raven': {
      const owl = r.id === 'owl';
      // take off while the owner walks, land when they stop
      st.air += ((walk > 0.15 ? 1 : 0) - st.air) * (1 - Math.exp(-dt * 3));
      const air = st.air;
      const beat = Math.sin(t * (owl ? 9 : 11)) * (0.75 + 0.25 * walk);
      const glide = owl ? 0.5 + 0.5 * Math.sin(t * 0.8) : 1;
      const flap = beat * (0.35 + 0.65 * glide);
      // on the ground: little hops, and the owl turns its head right round
      const hopT = (t * (owl ? 0.5 : 0.8) + sd) % 1;
      const hop = (1 - air) * (hopT < 0.18 ? Math.sin((hopT / 0.18) * Math.PI) * 0.08 : 0);
      let ox = 0, oz = 0;
      if (!owl) {
        // the raven circles above its owner's path
        const a = t * 1.5 + sd;
        ox = Math.sin(a) * 0.55 * air;
        oz = (Math.cos(a) * 0.35 + 0.2) * air;
        r.body.rotation.y = Math.atan2(Math.cos(a), -Math.sin(a)) * air * 0.6;
        r.body.rotation.z = -0.35 * air;
      } else {
        r.body.rotation.y = 0;
        r.body.rotation.z = 0;
      }
      r.body.position.set(ox, air * (r.fly + Math.sin(t * 2.2) * 0.05) + hop, oz);
      r.body.rotation.x = 0.2 * air - hop * 1.5;
      r.wings.forEach((w, i) => {
        const s = i === 0 ? -1 : 1;
        w.rotation.z = s * (air * (0.7 + flap) + (1 - air) * (0.12 + hop * 4));
        w.rotation.y = s * (1 - air) * -0.15;
      });
      // the primaries lag the beat in flight and fold in against the body on the ground
      const tipBeat = air * (0.3 + Math.sin(t * (owl ? 9 : 11) - 1.2) * 0.5) - (1 - air) * 0.5;
      if (J.tipR) J.tipR.rotation.z = -tipBeat;
      if (J.tipL) J.tipL.rotation.z = tipBeat;
      for (const l of r.legs) l.rotation.x = 0.7 * air;
      const look = owl ? Math.sin(t * 0.3 + sd) * 1.6 * pulse(t * 0.3 + sd, 2) : Math.sin(t * 0.9 + sd) * 0.5;
      r.head.rotation.y = look * (1 - air);
      r.head.rotation.z = owl ? 0 : Math.sin(t * 1.7 + sd) * 0.35 * (1 - air); // head cocked
      r.head.rotation.x = owl ? 0 : pulse(t * 0.7 + sd, 14) * 0.6 * (1 - air); // pecks
      if (r.tail) r.tail.rotation.x = Math.sin(t * 2) * 0.1;
      break;
    }
    case 'beaver': {
      // waddle, gnaw the stick, slap the tail
      const ph = t * (5 + walk * 5);
      gait(r, ph, walk, 0.5, 0.03);
      r.body.rotation.z = Math.sin(ph) * 0.09 * walk;
      r.body.position.y = Math.abs(Math.sin(ph)) * 0.02 * walk + Math.sin(t * 2) * 0.005;
      const gnaw = pulse(t * 0.5 + sd, 4) * (1 - walk);
      r.head.rotation.x = Math.sin(t * 26) * 0.05 * gnaw + Math.sin(ph * 2) * 0.04 * walk;
      r.head.rotation.y = Math.sin(t * 0.5 + sd) * 0.3 * (1 - walk) * (1 - gnaw);
      if (r.tail) {
        const slap = pulse(t * 0.35 + sd + 2, 24) * (1 - walk);
        r.tail.rotation.x = -slap * 0.9 + Math.sin(ph) * 0.1 * walk;
        r.tail.rotation.y = Math.sin(ph) * 0.25 * walk;
      }
      break;
    }
    case 'mole': {
      // paddles with the big spade claws (also when digging at rest) and kicks up dirt
      const dig = pulse(t * 0.6 + sd, 3) * (1 - walk);
      const act = Math.max(walk, dig);
      const ph = t * (7 + walk * 6 + dig * 6);
      r.legs.forEach((l, i) => {
        if (i < 2) {
          const s = i === 0 ? 1 : -1;
          l.rotation.x = Math.sin(ph + i * Math.PI) * 0.7 * act;
          l.rotation.z = -s * (0.5 + Math.max(0, Math.sin(ph + i * Math.PI)) * 0.35 * act);
        } else l.rotation.x = Math.sin(ph + i * Math.PI) * 0.5 * walk;
      });
      r.body.position.y = Math.abs(Math.sin(ph)) * 0.012 * act;
      r.head.rotation.x = dig * 0.3 + Math.sin(t * 6) * 0.05 * (1 - act);
      r.head.rotation.y = Math.sin(t * 0.8 + sd) * 0.3 * (1 - act);
      if (r.tail) r.tail.rotation.y = Math.sin(t * 4) * 0.2;
      // dirt puffs thrown back from the claws, each one rising, spreading and sinking away
      r.puffs.forEach((p, i) => {
        const k = (t * 1.6 + i / r.puffs.length) % 1;
        p.visible = act > 0.3;
        if (!p.visible) return;
        const s = i % 2 ? 1 : -1;
        p.position.set(s * (0.1 + k * 0.12), 0.04 + Math.sin(k * Math.PI) * 0.1, 0.1 - k * 0.3);
        p.scale.setScalar((0.5 + k * 1.2) * (1 - k * k) + 0.01);
      });
      break;
    }
    case 'otter': {
      // swims along the ground: a wave runs from the shoulders through the hips to the tail tip
      const ph = t * (5 + walk * 6);
      gait(r, ph, walk, 0.55, 0.02);
      const wv = 0.12 + 0.18 * walk;
      r.body.rotation.y = Math.sin(ph) * wv * 0.6;
      if (J.rear) J.rear.rotation.y = -Math.sin(ph - 0.8) * wv * 1.4;
      if (r.tail) r.tail.rotation.y = Math.sin(ph - 1.6) * wv * 1.6;
      if (J.tip) J.tip.rotation.y = Math.sin(ph - 2.4) * wv * 2;
      r.body.position.y = Math.abs(Math.sin(ph)) * 0.02 * walk;
      // at rest it sits up a little and looks round
      r.body.rotation.x = -0.12 * (1 - walk) * pulse(t * 0.3 + sd, 2);
      r.head.rotation.y = Math.sin(t * 0.7 + sd) * 0.5 * (1 - walk);
      r.head.rotation.x = Math.sin(ph * 2) * 0.05 * walk;
      break;
    }
    case 'whelp': {
      const ph = t * (5 + walk * 7);
      gait(r, ph, walk, 0.55, 0.04);
      r.body.position.y = Math.abs(Math.sin(ph)) * 0.025 * walk + Math.sin(t * 2) * 0.006;
      // wings: half open and beating while it trots, folded at rest with a stretch now and then
      const stretch = pulse(t * 0.25 + sd, 6) * (1 - walk);
      const fl = Math.sin(t * (walk > 0.3 ? 10 : 2.4));
      r.wings.forEach((w, i) => {
        const s = i === 0 ? -1 : 1;
        w.rotation.z = s * (0.15 + walk * (0.5 + fl * 0.35) + stretch * 0.9 + (1 - walk) * fl * 0.04);
      });
      if (J.tipR) J.tipR.rotation.z = -(0.2 + walk * fl * 0.3 + stretch * 0.3);
      if (J.tipL) J.tipL.rotation.z = 0.2 + walk * fl * 0.3 + stretch * 0.3;
      // ember breath: the jaw opens and a few glowing puffs drift out
      const bt = (t * 0.28 + sd) % 1;
      const breath = bt < 0.22 ? Math.sin((bt / 0.22) * Math.PI) : 0;
      if (J.jaw) J.jaw.rotation.x = 0.05 + breath * 0.5;
      r.head.rotation.x = -breath * 0.25 + Math.sin(ph * 2) * 0.04 * walk;
      r.head.rotation.y = Math.sin(t * 0.5 + sd) * 0.3 * (1 - walk) * (1 - breath);
      if (r.tail) r.tail.rotation.y = Math.sin(t * (2 + walk * 5)) * 0.3;
      if (J.tip) J.tip.rotation.y = Math.sin(t * (2 + walk * 5) - 1) * 0.45;
      const hs = r.head.position;
      r.puffs.forEach((p, i) => {
        const k = (bt - i * 0.03) / 0.3;
        p.visible = k > 0 && k < 1;
        if (!p.visible) return;
        p.position.set(Math.sin(i * 2.1 + t) * 0.03 * k, r.body.position.y + hs.y + 0.02 + k * 0.12, hs.z + 0.2 + k * 0.32);
        p.scale.setScalar(0.4 + k * 1.1 * (1 - k));
      });
      break;
    }
  }
}

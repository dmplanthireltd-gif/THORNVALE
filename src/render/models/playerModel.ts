import * as THREE from 'three';
import {
  CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES, type Appearance, type Build,
} from '../../game/player/appearance';
import { group, mat, sbox, scone, sshell, ssphere, type Mat } from './parts';
import type { BipedRig } from './rigs';
import { PAINTED } from '../style';
import { detail, type Detail } from './grimDetail';

/**
 * Painted style (owner 2026-10-23, "more detail, more brutal"): rounder heads and hands,
 * a grim face (brow ridge, frowning brows, eye sockets, nose shadow, cheekbones), real
 * hands with fingers and thumb, soled and strapped boots, leather bracers, a belt pouch
 * and knife, and surface tags for the detail atlas (grimDetail.ts). Classic look unchanged.
 */
const D = PAINTED ? 2 : 1;
/** Detail tag in the painted style only (in the classic style a tag would stop rigMerge from merging the part). */
const dt = <T extends THREE.Object3D>(o: T, d: Detail): T => (PAINTED ? detail(o, d) : o);

/**
 * Player characters: a male or female body in one of three builds, with skin, hair,
 * beard, eyes and plain clothes from the character designer (game/player/appearance.ts).
 *
 * The rig has exactly the joints, mounts and sizes of the humanoid builder
 * (humanoid.ts buildHumanoid), so every animation and every piece of worn gear works
 * unchanged. Body type and build only change *group scales* (torso width/depth, arm and
 * leg thickness, overall height) — worn armour is attached inside those groups, so it
 * stretches with the body and fits every combination.
 *
 * Head parts carry `userData.cover`: 'top' (hair on the crown, ears) hides under any
 * helmet, 'back' (long hair, ponytail, braids) only under helmets that cover the neck,
 * 'beard' only under closed helmets (humanoid.ts applyGear).
 */

interface Shape {
  /** Torso width and depth (group scale on the standard rig torso). */
  tx: number; tz: number;
  /** Arm and leg thickness (group scale). */
  arm: number; leg: number;
  /** Hip spread. */
  hip: number;
  /** Head size. */
  head: number;
  /** Whole body height. */
  h: number;
}

/**
 * Builds are scales on the standard humanoid rig (its gear coordinates). Every build is
 * slimmer than the old chunky rig (owner, 2026-10-21: "slimmer, not like Minecraft"):
 * narrow torso, thinner and longer limbs, a smaller head.
 */
const BUILD: Record<Build, { tx: number; tz: number; arm: number; leg: number; hip: number }> = {
  slim: { tx: 0.8, tz: 0.76, arm: 0.72, leg: 0.74, hip: 0.82 },
  average: { tx: 0.87, tz: 0.82, arm: 0.8, leg: 0.82, hip: 0.86 },
  broad: { tx: 0.97, tz: 0.9, arm: 0.9, leg: 0.9, hip: 0.92 },
};

/** Legs are this much longer than the standard rig's (more realistic proportions). */
export const LEG_STRETCH = 1.12;
/** Arms likewise. */
const ARM_STRETCH = 1.1;

export function bodyShape(a: Appearance): Shape {
  const b = BUILD[a.build] ?? BUILD.average;
  if (a.body === 'female') return { tx: b.tx * 0.93, tz: b.tz * 0.97, arm: b.arm * 0.9, leg: b.leg * 0.95, hip: b.hip * 1.03, head: 0.84, h: 0.96 };
  return { ...b, head: 0.86, h: 1 };
}

const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const blend = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

function tag<T extends THREE.Object3D>(o: T, cover: 'top' | 'back' | 'beard' | 'face'): T {
  if (cover === 'face') o.userData.face = true;
  else o.userData.cover = cover;
  return o;
}

/** Keeps held items (weapon, shield) at true size inside a scaled arm. */
function unscaled(parent: THREE.Object3D, g: THREE.Group): THREE.Group {
  g.scale.set(1 / parent.scale.x, 1 / parent.scale.y, 1 / parent.scale.z);
  parent.add(g);
  return g;
}

export function buildPlayerRig(a: Appearance): BipedRig {
  const sh = bodyShape(a);
  const female = a.body === 'female';
  const skinHex = SKIN_TONES[a.skin] ?? SKIN_TONES[2];
  const hairHex = HAIR_COLORS[a.hairColor]?.hex ?? 0x5e3b22;
  const topHex = CLOTH_COLORS[a.top]?.hex ?? 0x2e4a7a;
  const botHex = CLOTH_COLORS[a.bottom]?.hex ?? 0x6a4a30;
  const skin = mat(skinHex);
  const hairM = mat(hairHex);
  const topM = mat(topHex);
  const topDark = mat(shade(topHex, 0.72));
  const botM = mat(botHex);
  const bootM = mat(0x3e2a1c);
  const bootHi = mat(0x5a3e28);
  const beltM = mat(0x4a3322);
  const buckle = mat(0xb08a4a);
  const eyeM = mat(EYE_COLORS[a.eyes]?.hex ?? 0x4a2c16);
  const lash = mat(0x1a120c);
  const browM = mat(shade(hairHex, 0.85));
  const lipM = mat(blend(shade(skinHex, 0.78), 0x9a4a40, female ? 0.35 : 0.15));
  const noseM = mat(shade(skinHex, 0.93));

  const root = new THREE.Group();
  const body = group();
  body.scale.setScalar(sh.h);
  root.add(body);
  const hipY = 0.62 * LEG_STRETCH;

  // ---- legs (standard rig leg space: thigh to y −0.37, foot centred at y −0.52, z 0.04)
  const mkLeg = (x: number) => {
    const g = group(x * sh.hip, hipY, 0,
      dt(sshell(0.19, 0.16, 0.22, 0.2, botM, 0, -0.1, 0), 'cloth'), // thigh
      dt(ssphere(0.075, botM, 0, -0.22, 0.02, 1, 0.8, 0.9, D), 'cloth'), // knee
      dt(sshell(0.155, 0.125, 0.18, 0.17, botM, 0, -0.3, 0), 'cloth'), // shin
      dt(sshell(0.15, 0.17, 0.16, 0.19, bootM, 0, -0.48, 0), 'leather'), // boot shaft
      dt(sshell(0.16, 0.17, 0.09, 0.3, bootM, 0, -0.575, 0.04), 'leather'), // foot
      dt(ssphere(0.08, bootM, 0, -0.575, 0.15, 1, 0.55, 1.1, D), 'leather'), // round toe
      dt(sshell(0.155, 0.155, 0.035, 0.18, bootHi, 0, -0.4, 0), 'leather'), // cuff
    );
    if (PAINTED) {
      const sole = mat(0x1c140e);
      const iron = mat(0x5a5650);
      g.add(
        detail(sshell(0.175, 0.18, 0.03, 0.33, sole, 0, -0.615, 0.045), 'leather'), // thick sole
        detail(ssphere(0.07, bootHi, 0, -0.555, 0.17, 1.05, 0.5, 0.8, D), 'leather'), // scuffed toe cap
        detail(sshell(0.158, 0.165, 0.03, 0.2, beltM, 0, -0.5, 0), 'leather'), // ankle strap
        sbox(0.035, 0.035, 0.02, iron, 0.06, -0.5, 0.095), // strap buckle
        detail(ssphere(0.07, mat(shade(botHex, 0.7)), 0, -0.22, 0.05, 1, 0.9, 0.55, D), 'leather'), // worn knee patch
      );
    }
    g.scale.set(sh.leg, LEG_STRETCH, sh.leg);
    return g;
  };
  const legL = mkLeg(0.13);
  const legR = mkLeg(-0.13);

  // ---- torso (origin at the hips; standard rig body 0.01–0.53 high, ±0.27 wide, ±0.16 deep)
  const torso = group(0, hipY, 0);
  if (female) {
    torso.add(
      dt(sshell(0.5, 0.42, 0.28, 0.31, topM, 0, 0.39, 0), 'cloth'), // chest to waist
      dt(sshell(0.42, 0.5, 0.22, 0.3, topM, 0, 0.14, 0), 'cloth'), // waist flaring to the hips
      ssphere(0.1, topM, 0, 0.39, 0.11, 1.7, 0.6, 0.45), // soft chest line, kept subtle
    );
  } else {
    torso.add(
      dt(sshell(0.54, 0.46, 0.3, 0.32, topM, 0, 0.38, 0), 'cloth'), // chest, shoulders wider than the hips
      dt(sshell(0.46, 0.44, 0.2, 0.3, topM, 0, 0.13, 0), 'cloth'),
    );
  }
  for (const s of [-1, 1]) torso.add(dt(ssphere(0.085, topM, s * (female ? 0.22 : 0.245), 0.49, 0, 1, 0.75, 1.05, D), 'cloth')); // rounded shoulders
  torso.add(
    dt(sshell(female ? 0.5 : 0.45, female ? 0.48 : 0.44, 0.08, 0.31, botM, 0, -0.01, 0), 'cloth'), // trouser seat
    dt(sshell(0.24, 0.26, 0.05, 0.26, topDark, 0, 0.52, 0), 'cloth'), // collar
    sshell(0.12, 0.14, 0.12, 0.13, skin, 0, 0.58, 0), // neck
    dt(sshell(female ? 0.43 : 0.47, female ? 0.45 : 0.46, 0.065, 0.32, beltM, 0, 0.04, 0), 'leather'),
    sbox(0.07, 0.05, 0.02, buckle, 0, 0.04, 0.16),
  );
  if (PAINTED) {
    const lace = mat(0x1e140c);
    const blade = mat(0x8a8a86);
    torso.add(
      detail(sbox(0.09, 0.1, 0.06, beltM, 0.15, -0.03, 0.15), 'leather'), // belt pouch
      detail(sbox(0.095, 0.03, 0.065, bootHi, 0.15, 0.025, 0.152), 'leather'), // its flap
      detail(sbox(0.04, 0.16, 0.035, bootM, -0.17, -0.04, 0.12), 'leather'), // knife sheath
      sbox(0.03, 0.05, 0.03, blade, -0.17, 0.06, 0.12), // knife grip
      sbox(0.012, 0.11, 0.012, lace, 0.025, 0.47, 0.155).rotateZ(0.35), // collar laces
      sbox(0.012, 0.11, 0.012, lace, -0.025, 0.47, 0.155).rotateZ(-0.35),
    );
  }
  torso.scale.set(sh.tx, 1, sh.tz);

  // shoulder plates (show the worn body armour; hidden until gear asks for them)
  const padMat = mat(0x888888);
  const pads = group(0, 0, 0,
    ssphere(0.14, padMat, 0.31, 0.5, 0, 1.15, 0.7, 1.15),
    ssphere(0.14, padMat, -0.31, 0.5, 0, 1.15, 0.7, 1.15),
  );
  pads.visible = false;
  torso.add(pads);
  torso.userData.ownCape = null;
  torso.userData.bulk = 1;
  torso.userData.front = 0.2;
  torso.userData.back = -0.2;

  // ---- head: smaller than the old chunky head, on a short neck; face radius 0.2 in head space
  const head = group(0, hipY + 0.53 + 0.06 + 0.2 * sh.head, 0);
  head.add(
    tag(ssphere(0.2, skin, 0, 0, 0, female ? 0.94 : 1, 1.06, 1, D), 'face'),
    tag(ssphere(0.12, skin, 0, -0.1, 0.06, female ? 0.85 : 1, 0.75, 1, D), 'face'), // jaw
    tag(sbox(0.045, 0.045, 0.03, eyeM, 0.07, 0.02, 0.18), 'face'),
    tag(sbox(0.045, 0.045, 0.03, eyeM, -0.07, 0.02, 0.18), 'face'),
    tag(sbox(0.036, 0.07, 0.04, noseM, 0, -0.035, 0.195), 'face'),
    tag(sbox(female ? 0.065 : 0.075, 0.02, 0.03, lipM, 0, -0.11, 0.17), 'face'),
  );
  for (const s of [-1, 1]) {
    const brow = tag(sbox(female ? 0.06 : 0.07, female ? 0.016 : 0.024, 0.03, browM, s * 0.073, 0.075, 0.18), 'face');
    if (PAINTED) brow.rotation.z = s * (female ? 0.14 : 0.3); // a frown: inner ends low
    head.add(brow);
    if (female) head.add(tag(sbox(0.052, 0.014, 0.03, lash, s * 0.073, 0.046, 0.188), 'face')); // lash line
    head.add(tag(ssphere(0.042, skin, s * (female ? 0.19 : 0.2), 0.0, -0.01, 0.55, 1, 1), 'top')); // ears
  }
  if (PAINTED) grimFace(head, skinHex, female);
  head.scale.setScalar(sh.head);
  addHair(head, a.hair, hairM, blend(hairHex, skinHex, 0.45));
  if (!female) addBeard(head, a.beard, hairM, blend(hairHex, skinHex, 0.5));

  // ---- arms: sleeves in the shirt colour, bare forearms and hands
  const armX = 0.27 * sh.tx + 0.07 * sh.arm + 0.012;
  const shoulderY = hipY + 0.48;
  const mkArm = (x: number) => {
    const g = group(x * armX, shoulderY, 0,
      dt(sshell(0.15, 0.13, 0.26, 0.15, topM, 0, -0.12, 0), 'cloth'),
      dt(sshell(0.135, 0.135, 0.035, 0.14, topDark, 0, -0.255, 0), 'cloth'), // cuff
      sshell(0.12, 0.1, 0.1, 0.12, skin, 0, -0.31, 0), // forearm
    );
    if (PAINTED) {
      g.add(...grimHand(skin, x));
      g.add(detail(sshell(0.128, 0.112, 0.07, 0.13, bootM, 0, -0.32, 0), 'leather')); // leather bracer
    } else g.add(ssphere(0.07, skin, 0, -0.385, 0.005, 0.95, 1.15, 1)); // hand
    g.scale.set(sh.arm, ARM_STRETCH, sh.arm);
    return g;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);
  const weaponMount = unscaled(armR, group(0, -0.44, 0.04));
  const shieldMount = unscaled(armL, group(0.13, -0.3, 0.1));

  body.add(legL, legR, torso, head, armL, armR);
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), new THREE.MeshBasicMaterial());
  hitbox.position.y = 0.8;
  hitbox.visible = false;
  root.add(hitbox);

  const rig: BipedRig = {
    type: 'biped', root, body, torso, head, armL, armR, legL, legR, cape: null,
    materials: [], hitbox, height: 1.78 * sh.h, restArm: -0.5,
    gear: { weaponMount, shieldMount, pads, padMat, skin, extras: [] }, wings: [],
  };
  const mats = new Set<Mat>();
  rig.body.traverse((o) => {
    const m = (o as THREE.Mesh).material as Mat | undefined;
    if (m && m.isMeshToonMaterial) mats.add(m);
  });
  rig.materials.push(...mats);
  return rig;
}

// ------------------------------------------------------------------ hair

/** A close cap over the crown and the back of the head (the face stays clear). */
function cap(head: THREE.Group, m: THREE.Material, r = 0.215, y = 0.07, z = -0.03, sy = 0.78): void {
  head.add(tag(ssphere(r, m, 0, y, z, 1, sy, 1.02), 'top'));
}

function addHair(head: THREE.Group, style: string, m: Mat, shaved: number): void {
  const fuzz = mat(shaved);
  const top = (o: THREE.Object3D) => head.add(tag(o, 'top'));
  const back = (o: THREE.Object3D) => head.add(tag(o, 'back'));
  const rot = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => { o.rotation.set(x, y, z); return o; };
  switch (style) {
    case 'bald':
      return;
    case 'buzz':
      cap(head, fuzz, 0.206, 0.05, -0.012, 0.8);
      return;
    case 'short':
      cap(head, m);
      top(sbox(0.26, 0.05, 0.07, m, 0, 0.15, 0.15));
      return;
    case 'swept':
      cap(head, m);
      top(rot(sbox(0.24, 0.09, 0.17, m, 0.02, 0.19, 0.1), -0.45, 0, 0.18));
      top(sbox(0.06, 0.12, 0.12, m, -0.19, 0.06, 0.02));
      return;
    case 'curly':
      cap(head, m, 0.22, 0.08, -0.03, 0.8);
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        top(ssphere(0.07, m, Math.sin(ang) * 0.17, 0.15 + Math.cos(ang * 2) * 0.03, Math.cos(ang) * 0.15 - 0.04));
      }
      top(ssphere(0.08, m, 0, 0.24, -0.02));
      return;
    case 'bob':
      cap(head, m, 0.222, 0.07, -0.03, 0.85);
      top(sbox(0.3, 0.06, 0.08, m, 0, 0.14, 0.16)); // fringe
      back(sbox(0.44, 0.2, 0.3, m, 0, -0.06, -0.07)); // chin-length sides and back
      for (const s of [-1, 1]) back(sbox(0.06, 0.22, 0.14, m, s * 0.205, -0.05, 0.08));
      return;
    case 'long':
      cap(head, m, 0.22, 0.07, -0.03, 0.82);
      top(rot(sbox(0.2, 0.05, 0.08, m, 0.05, 0.15, 0.16), 0, 0, -0.2)); // parted fringe
      back(sbox(0.36, 0.5, 0.1, m, 0, -0.18, -0.17));
      for (const s of [-1, 1]) back(sbox(0.06, 0.36, 0.13, m, s * 0.2, -0.12, 0.02));
      return;
    case 'ponytail': {
      cap(head, m, 0.215, 0.07, -0.035, 0.78);
      top(sbox(0.26, 0.04, 0.06, m, 0, 0.15, 0.155));
      back(ssphere(0.055, m, 0, 0.05, -0.22));
      back(rot(scone(0.065, 0.42, m, 0, -0.16, -0.27, 6), Math.PI - 0.25, 0, 0));
      return;
    }
    case 'bun':
      cap(head, m, 0.217, 0.07, -0.03, 0.8);
      top(sbox(0.24, 0.04, 0.06, m, 0, 0.15, 0.155));
      top(ssphere(0.1, m, 0, 0.19, -0.17));
      return;
    case 'braids':
      cap(head, m, 0.217, 0.07, -0.03, 0.8);
      top(sbox(0.06, 0.03, 0.42, mat(shade(m.color.getHex(), 0.75)), 0, 0.235, -0.02)); // centre parting line
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) back(ssphere(0.048, m, s * 0.15, -0.1 - i * 0.075, 0.05 - i * 0.012));
        back(sbox(0.05, 0.04, 0.05, mat(0x6a4426), s * 0.15, -0.47, -0.01)); // leather tie
      }
      return;
    case 'mohawk':
      cap(head, fuzz, 0.206, 0.05, -0.012, 0.8);
      for (let i = 0; i < 5; i++) top(rot(sbox(0.065, 0.16 - Math.abs(i - 1.5) * 0.02, 0.1, m, 0, 0.25 - i * 0.012, 0.14 - i * 0.085), -0.35 + i * 0.14, 0, 0));
      return;
    case 'topknot':
      cap(head, fuzz, 0.207, 0.05, -0.012, 0.8);
      top(ssphere(0.075, m, 0, 0.25, -0.05));
      top(rot(scone(0.04, 0.16, m, 0, 0.3, -0.13, 5), -1.1, 0, 0));
      return;
    default:
      cap(head, m);
  }
}

function addBeard(head: THREE.Group, style: string, m: Mat, stubble: number): void {
  const add = (o: THREE.Object3D) => head.add(tag(o, 'beard'));
  const moustache = () => {
    add(sbox(0.16, 0.035, 0.04, m, 0, -0.065, 0.195));
    for (const s of [-1, 1]) add(sbox(0.03, 0.06, 0.035, m, s * 0.08, -0.09, 0.185));
  };
  switch (style) {
    case 'stubble':
      add(sbox(0.3, 0.12, 0.13, mat(stubble), 0, -0.125, 0.105));
      return;
    case 'moustache':
      moustache();
      return;
    case 'goatee':
      moustache();
      add(sbox(0.09, 0.1, 0.07, m, 0, -0.16, 0.165));
      return;
    case 'short':
      moustache();
      add(sbox(0.31, 0.15, 0.13, m, 0, -0.14, 0.11));
      for (const s of [-1, 1]) add(sbox(0.05, 0.14, 0.1, m, s * 0.175, -0.05, 0.08)); // sideburns
      return;
    case 'full':
      moustache();
      add(sbox(0.33, 0.24, 0.14, m, 0, -0.17, 0.11));
      add(scone(0.11, 0.18, m, 0, -0.35, 0.12, 6).rotateX(Math.PI));
      for (const s of [-1, 1]) add(sbox(0.06, 0.18, 0.12, m, s * 0.18, -0.06, 0.07));
      return;
    default:
  }
}

// ------------------------------------------------------------------ painted style details

/**
 * A hand: palm, four fingers curled forward, a thumb on the inner side (side: +1 left arm,
 * −1 right). Ends at the same height as the old round hand, so held items still sit in it.
 */
export function grimHand(skin: Mat, side: number): THREE.Mesh[] {
  return [
    ssphere(0.06, skin, 0, -0.37, 0, 0.95, 1.05, 0.8, 2), // palm
    sbox(0.095, 0.075, 0.07, skin, 0, -0.42, 0.025), // fingers, curled
    ssphere(0.035, skin, 0, -0.455, 0.035, 1.3, 0.7, 1, 1), // knuckles
    ssphere(0.03, skin, -side * 0.045, -0.39, 0.045, 0.9, 1.4, 0.9, 1), // thumb
  ];
}

/**
 * The grim face: a brow ridge throwing a shadow, dark eye sockets, a heavier nose with a
 * shadow under it, cheekbones and hollow cheeks. Tagged `face` (never hidden by helmets).
 * Coordinates are in the head's own space (face radius 0.2).
 */
export function grimFace(head: THREE.Group, skinHex: number, female: boolean): void {
  const sk = mat(skinHex);
  const shadow = mat(shade(skinHex, 0.55));
  const deep = mat(shade(skinHex, 0.38));
  const lit = mat(new THREE.Color(skinHex).multiplyScalar(1.13).getHex()); // a lighter tone of the same skin (no pale patches on dark skin)
  const f = (o: THREE.Mesh) => head.add(tag(o, 'face'));
  // readable at the normal game camera (owner 2026-10-23): bigger features with stronger
  // light and shadow — pale eye whites around the coloured iris in a dark socket, a lit
  // nose bridge, a shadow under the brow, a darker, wider mouth
  const iris = (head.children.find((c) => c.userData.face && c.position.y === 0.02 && Math.abs(c.position.x - 0.07) < 1e-6) as THREE.Mesh | undefined)?.material as Mat | undefined;
  const white = mat(blend(0xd8cfc0, skinHex, 0.2));
  const pupil = mat(0x0c0806);
  for (const s of [-1, 1]) {
    f(sbox(0.088, 0.07, 0.02, deep, s * 0.072, 0.023, 0.172)); // eye socket
    f(sbox(0.062, 0.034, 0.02, white, s * 0.072, 0.02, 0.188)); // eye white
    if (iris) f(sbox(0.032, 0.036, 0.014, iris, s * 0.07, 0.02, 0.198)); // iris
    f(sbox(0.014, 0.018, 0.01, pupil, s * 0.07, 0.02, 0.206)); // pupil
    f(sbox(0.07, 0.016, 0.014, deep, s * 0.072, 0.044, 0.196)); // upper lid shadow
    f(ssphere(0.05, lit, s * 0.112, -0.035, 0.146, 1.2, 0.7, 0.8, 1)); // cheekbone, catching the light
    f(sbox(0.034, 0.07, 0.02, shadow, s * 0.128, -0.095, 0.15)); // hollow cheek
  }
  if (!female) f(sbox(0.28, 0.045, 0.05, sk, 0, 0.065, 0.17)); // brow ridge
  f(sbox(0.26, 0.016, 0.012, shadow, 0, 0.047, 0.194)); // shadow under the brow
  f(sbox(0.034, 0.075, 0.035, lit, 0, -0.005, 0.203)); // nose bridge (lit)
  f(sbox(female ? 0.046 : 0.058, 0.04, 0.042, sk, 0, -0.062, 0.21)); // nose tip
  f(sbox(female ? 0.056 : 0.068, 0.017, 0.02, deep, 0, -0.087, 0.202)); // shadow under the nose
  f(sbox(female ? 0.08 : 0.095, 0.016, 0.02, deep, 0, -0.12, 0.184)); // hard mouth line
  f(sbox(female ? 0.06 : 0.07, 0.014, 0.016, shadow, 0, -0.142, 0.178)); // lower lip shadow
}

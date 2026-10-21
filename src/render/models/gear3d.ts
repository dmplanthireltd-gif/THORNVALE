import * as THREE from 'three';
import type { GearLook } from './gearLooks';
import { MAT } from './gearLooks';
import { group, sbox, scone, scyl, ssphere, storus, type MatFn } from './parts';

/**
 * Worn armour on the humanoid rig: helmets (head space), body armour (torso
 * and arm space), leg armour and boots (leg space). Every piece is built from a
 * GearLook so it matches its icon: plates, pauldrons, belts, capes, crests,
 * visors, horns, greaves, gauntlets and glowing gems. Geometry is shared
 * (parts.ts s* helpers); materials come from one cache per character.
 *
 * Rig layout: head origin at the head centre (face radius ≈ 0.2, front +z);
 * torso origin at the hips (body 0.01–0.53 high, ±0.27 wide, ±0.17 deep);
 * arm origin at the shoulder (hand at y −0.38); leg origin at the hip (thigh
 * to y −0.37, foot box centred at y −0.52, z 0.04).
 */
interface Mats {
  metal: THREE.Material;
  hi: THREE.Material;
  lo: THREE.Material;
  trim: THREE.Material;
  dark: THREE.Material;
  gem: THREE.Material | null;
  leather: THREE.Material;
}

function mats(lk: GearLook, M: MatFn): Mats {
  return {
    metal: M(lk.m[1], lk.glow),
    hi: M(lk.m[0], lk.glow),
    lo: M(lk.m[2]),
    trim: M(lk.t[1]),
    dark: M(0x140e0a),
    gem: lk.gem !== undefined ? M(lk.gem, lk.gem) : null,
    leather: M(MAT.leather[2]),
  };
}

function rot<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.rotation.set(x, y, z);
  return o;
}

// ------------------------------------------------------------------ helmets

function horn(m: THREE.Material, side: number, y: number, size = 1): THREE.Group {
  const base = rot(scone(0.065 * size, 0.24 * size, m, side * 0.23, y, -0.02, 6), -0.2, 0, -side * 1.1);
  const tip = rot(scone(0.04 * size, 0.2 * size, m, side * (0.23 + 0.2 * size), y + 0.17 * size, -0.05, 6), -0.3, 0, -side * 0.25);
  return group(0, 0, 0, base, tip);
}

export function buildHelm(lk: GearLook, M: MatFn): THREE.Group {
  const k = mats(lk, M);
  const g = group();
  const add = (...o: THREE.Object3D[]) => g.add(...o);
  switch (lk.helm) {
    case 'cap':
      add(ssphere(0.218, k.metal, 0, 0.07, -0.01, 1, 0.75, 1.03), scyl(0.225, 0.225, 0.05, k.trim, 0, 0.03, 0, 10), ssphere(0.03, M(MAT.iron[1]), 0, 0.235, 0));
      return g;
    case 'fur':
      add(ssphere(0.215, k.trim, 0, 0.08, -0.01, 1, 0.74, 1.02), rot(storus(0.2, 0.06, k.metal, Math.PI * 2, 5, 12), Math.PI / 2, 0, 0), ssphere(0.06, k.metal, 0, 0.25, -0.02));
      g.children[1].position.y = 0.04;
      return g;
    case 'coif':
      add(
        ssphere(0.228, k.metal, 0, 0.05, -0.03, 1, 0.86, 1.05),
        sbox(0.38, 0.17, 0.22, k.metal, 0, -0.13, -0.08),
        sbox(0.06, 0.2, 0.14, k.metal, 0.19, -0.08, 0.06), sbox(0.06, 0.2, 0.14, k.metal, -0.19, -0.08, 0.06),
        scyl(0.232, 0.232, 0.035, k.trim, 0, 0.1, -0.01, 10),
      );
      return g;
    case 'hood':
      add(
        ssphere(0.24, k.metal, 0, 0.04, -0.045, 1, 1, 1.06),
        rot(scone(0.13, 0.3, k.metal, 0, 0.0, -0.28, 6), -Math.PI / 2 - 0.55, 0, 0),
        sbox(0.4, 0.08, 0.3, k.metal, 0, -0.2, -0.05),
      );
      if (k.gem) add(ssphere(0.035, k.gem, 0, -0.17, 0.17));
      if (lk.emblem === 'leaf') add(rot(sbox(0.03, 0.2, 0.02, M(0xf0f0e0), 0.17, 0.2, -0.1), 0, 0, -0.3));
      return g;
    case 'hat': {
      const cone = rot(scone(0.2, 0.5, k.metal, 0, 0.42, -0.04, 8), -0.22, 0, 0.1);
      add(scyl(0.37, 0.37, 0.04, k.metal, 0, 0.14, 0, 12), cone, scyl(0.21, 0.21, 0.07, k.trim, 0, 0.19, 0, 10), rot(scone(0.06, 0.16, k.metal, 0.05, 0.7, -0.14, 6), -0.9, 0, 0.3));
      if (k.gem) add(ssphere(0.04, k.gem, 0, 0.19, 0.21));
      return g;
    }
    case 'circlet':
      add(scyl(0.218, 0.218, 0.05, k.metal, 0, 0.1, 0, 12), rot(sbox(0.08, 0.1, 0.03, k.trim, 0, 0.17, 0.205), 0, 0, Math.PI / 4));
      if (k.gem) add(ssphere(0.035, k.gem, 0, 0.17, 0.225), ssphere(0.02, k.gem, 0.15, 0.11, 0.16), ssphere(0.02, k.gem, -0.15, 0.11, 0.16));
      return g;
    case 'skull': {
      add(ssphere(0.23, k.metal, 0, 0.09, 0, 1, 0.9, 1.06), sbox(0.06, 0.06, 0.03, k.dark, 0.08, 0.06, 0.215), sbox(0.06, 0.06, 0.03, k.dark, -0.08, 0.06, 0.215));
      const eye = M(0xff5a20, 0xc03010);
      add(ssphere(0.018, eye, 0.08, 0.06, 0.225), ssphere(0.018, eye, -0.08, 0.06, 0.225));
      for (let i = -2; i <= 2; i++) add(sbox(0.03, 0.04, 0.03, k.hi, i * 0.035, -0.04, 0.215));
      if (lk.horns) for (const s of [-1, 1]) add(horn(k.metal, s, 0.18, 0.7));
      return g;
    }
    default:
      break;
  }
  // metal helmets
  const great = lk.helm === 'great';
  const open = lk.helm === 'med' || lk.helm === 'winged';
  if (great) {
    add(scyl(0.228, 0.232, 0.46, k.metal, 0, 0.02, 0, 10), scyl(0.21, 0.228, 0.05, k.metal, 0, 0.27, 0, 10));
    add(scyl(0.236, 0.236, 0.05, k.trim, 0, 0.2, 0, 10), scyl(0.238, 0.238, 0.05, k.trim, 0, -0.18, 0, 10));
    add(sbox(0.13, 0.035, 0.04, k.dark, 0.075, 0.07, 0.222), sbox(0.13, 0.035, 0.04, k.dark, -0.075, 0.07, 0.222), sbox(0.04, 0.38, 0.03, k.trim, 0, 0.02, 0.232));
  } else {
    add(scyl(0.215, 0.225, open ? 0.3 : 0.4, k.metal, 0, open ? 0.02 : -0.03, 0, 10), ssphere(0.215, k.metal, 0, 0.16, 0, 1, 0.62, 1));
    add(sbox(0.035, 0.07, 0.42, k.hi, 0, 0.28, 0)); // ridge
    if (open) {
      add(scyl(0.228, 0.228, 0.06, lk.tier >= 2 ? k.trim : k.lo, 0, -0.06, 0, 10), sbox(0.045, 0.2, 0.05, k.metal, 0, -0.03, 0.215));
    } else {
      add(sbox(0.32, 0.035, 0.04, k.dark, 0, 0.04, 0.205), sbox(0.04, 0.14, 0.04, k.dark, 0, -0.04, 0.207));
      add(scyl(0.23, 0.23, 0.04, k.trim, 0, -0.22, 0, 10), scyl(0.226, 0.226, 0.035, k.trim, 0, 0.13, 0, 10));
    }
  }
  if (lk.helm === 'winged') {
    for (const s of [-1, 1]) {
      add(rot(sbox(0.025, 0.22, 0.28, k.trim, s * 0.24, 0.22, -0.04), -0.35, 0, -s * 0.55));
      add(rot(sbox(0.022, 0.14, 0.2, k.trim, s * 0.3, 0.33, -0.1), -0.5, 0, -s * 0.7));
    }
  }
  if (lk.horns || lk.helm === 'horned') for (const s of [-1, 1]) add(horn(lk.spikes ? k.trim : M(MAT.bone[1]), s, 0.17, great ? 1.1 : 1));
  if (lk.helm === 'crested' || (great && lk.plume !== undefined && !lk.horns)) {
    const pm = M(lk.plume ?? lk.t[1], lk.glow);
    for (let i = 0; i < 5; i++) add(rot(sbox(0.06, 0.12 + i * 0.03, 0.09, pm, 0, 0.32 + i * 0.02, 0.15 - i * 0.09), -0.3 - i * 0.12, 0, 0));
    add(sbox(0.08, 0.04, 0.2, k.trim, 0, 0.28, 0.05));
  }
  if (lk.helm === 'crown') {
    add(scyl(0.235, 0.235, 0.07, k.trim, 0, 0.17, 0, 12));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(scone(0.035, 0.1, k.trim, Math.sin(a) * 0.22, 0.25, Math.cos(a) * 0.22, 4));
    }
  }
  if (lk.spikes && lk.helm !== 'horned') for (let i = -1; i <= 1; i++) add(scone(0.03, 0.12, k.trim, i * 0.08, 0.3, -0.02, 4));
  if (k.gem && lk.tier >= 2) add(ssphere(0.035, k.gem, 0, great ? 0.14 : open ? 0.06 : 0.13, 0.225));
  for (const s of [-1, 1]) add(ssphere(0.022, k.trim, s * 0.2, 0.06, 0.09));
  return g;
}

// ------------------------------------------------------------------ body armour

export interface ArmourParts {
  torso: THREE.Object3D[];
  armL: THREE.Object3D[];
  armR: THREE.Object3D[];
}

function pauldron(lk: GearLook, k: Mats, s: number): THREE.Group {
  const sz = 1 + Math.min(lk.tier, 4) * 0.035;
  const p = group(s * 0.31, 0.5, 0,
    ssphere(0.15 * sz, k.metal, 0, 0, 0, 1.2, 0.7, 1.2),
    ssphere(0.14 * sz, lk.tier >= 2 ? k.trim : k.lo, s * 0.03, -0.075, 0, 1.25, 0.45, 1.25),
    ssphere(0.025, k.trim, s * 0.08, 0.06, 0.08),
  );
  if (lk.spikes) for (let i = 0; i < (lk.tier >= 4 ? 3 : 2); i++) p.add(rot(scone(0.035, 0.16, k.trim, s * (0.06 + i * 0.05), 0.08, -0.06 + i * 0.07, 4), 0, 0, -s * 0.6));
  return p;
}

function emblemOn(lk: GearLook, k: Mats, y: number, z: number): THREE.Object3D[] {
  if (lk.emblem === 'cross') return [sbox(0.04, 0.16, 0.02, k.trim, 0, y, z), sbox(0.12, 0.04, 0.02, k.trim, 0, y + 0.03, z)];
  if (lk.emblem === 'none') return [];
  return [rot(sbox(0.08, 0.08, 0.02, k.trim, 0, y, z), 0, 0, Math.PI / 4)];
}

export function buildArmour(lk: GearLook, M: MatFn): ArmourParts {
  const k = mats(lk, M);
  const torso: THREE.Object3D[] = [];
  const armL: THREE.Object3D[] = [];
  const armR: THREE.Object3D[] = [];
  const arms = (...mk: Array<() => THREE.Object3D>) => { for (const f of mk) { armL.push(f()); armR.push(f()); } };
  const beltM = M(lk.tier >= 3 ? MAT.darkleather[1] : MAT.leather[1]);
  const belt = () => torso.push(sbox(0.6, 0.07, 0.45, beltM, 0, 0.05, 0), sbox(0.08, 0.06, 0.03, lk.tier >= 2 ? k.trim : M(MAT.iron[0]), 0, 0.05, 0.23));
  // a yoke over the shoulders hides the outfit's own collar band
  torso.push(sbox(0.47, 0.08, 0.41, lk.body === 'fur' || lk.body === 'bone' ? k.trim : k.metal, 0, 0.53, 0));
  if (lk.cape !== undefined && lk.body !== 'robe') {
    const c = group(0, 0.54, -0.2, sbox(0.46, 0.68, 0.035, M(lk.cape), 0, -0.34, 0), sbox(0.48, 0.05, 0.05, k.trim, 0, -0.01, 0.01));
    c.rotation.x = 0.1;
    torso.push(c);
  }
  switch (lk.body) {
    case 'robe': {
      torso.push(
        sbox(0.57, 0.53, 0.42, k.metal, 0, 0.27, 0),
        scyl(0.3, 0.39, 0.62, k.metal, 0, -0.27, 0, 10),
        scyl(0.392, 0.395, 0.06, k.trim, 0, -0.56, 0, 10),
        sbox(0.1, 0.52, 0.02, k.trim, 0, 0.27, 0.215),
        sbox(0.6, 0.06, 0.45, M(lk.t[2]), 0, 0.06, 0),
        scyl(0.15, 0.2, 0.08, k.trim, 0, 0.54, 0, 10),
      );
      if (k.gem) torso.push(ssphere(0.035, k.gem, 0, 0.45, 0.22));
      arms(() => scyl(0.11, 0.13, 0.12, k.metal, 0, -0.3, 0, 8), () => scyl(0.132, 0.132, 0.03, k.trim, 0, -0.36, 0, 8), () => sbox(0.15, 0.3, 0.16, k.metal, 0, -0.15, 0));
      return { torso, armL, armR };
    }
    case 'fur':
      torso.push(sbox(0.57, 0.52, 0.42, k.trim, 0, 0.27, 0), rot(storus(0.2, 0.08, k.metal, Math.PI * 2, 5, 12), Math.PI / 2, 0, 0), rot(storus(0.29, 0.05, k.metal, Math.PI * 2, 4, 14), Math.PI / 2, 0, 0));
      torso[torso.length - 2].position.y = 0.52;
      torso[torso.length - 1].position.y = 0.02;
      for (const s of [-1, 1]) torso.push(ssphere(0.14, k.metal, s * 0.3, 0.5, 0, 1.2, 0.8, 1.2));
      belt();
      arms(() => sbox(0.155, 0.12, 0.165, k.metal, 0, -0.28, 0));
      return { torso, armL, armR };
    case 'bone': {
      torso.push(sbox(0.57, 0.52, 0.42, k.trim, 0, 0.27, 0), sbox(0.05, 0.36, 0.03, k.metal, 0, 0.28, 0.22));
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) torso.push(rot(sbox(0.2, 0.035, 0.03, k.metal, s * 0.12, 0.42 - i * 0.08, 0.215), 0, 0, s * 0.18));
      for (const s of [-1, 1]) torso.push(ssphere(0.12, k.metal, s * 0.31, 0.52, 0, 1.1, 0.9, 1.1), sbox(0.04, 0.035, 0.02, k.dark, s * 0.31 - 0.035, 0.53, 0.115), sbox(0.04, 0.035, 0.02, k.dark, s * 0.31 + 0.035, 0.53, 0.115));
      belt();
      arms(() => sbox(0.155, 0.12, 0.165, k.metal, 0, -0.27, 0));
      return { torso, armL, armR };
    }
    case 'leather':
    case 'vest': {
      torso.push(sbox(0.57, 0.52, 0.42, k.metal, 0, 0.27, 0));
      if (lk.body === 'vest') {
        torso.push(sbox(0.34, 0.12, 0.14, k.metal, 0, 0.55, -0.12), rot(sbox(0.07, 0.68, 0.02, k.trim, 0, 0.3, 0.215), 0, 0, 0.75), rot(sbox(0.07, 0.68, 0.02, k.trim, 0, 0.3, -0.215), 0, 0, -0.75));
        if (k.gem) torso.push(ssphere(0.03, k.gem, 0, 0.47, 0.22));
      } else {
        torso.push(rot(sbox(0.06, 0.6, 0.02, k.trim, 0, 0.3, 0.215), 0, 0, 0.6), rot(sbox(0.06, 0.6, 0.02, k.trim, 0, 0.3, 0.215), 0, 0, -0.6));
      }
      for (const s of [-1, 1]) torso.push(ssphere(0.12, k.trim, s * 0.3, 0.5, 0, 1.15, 0.6, 1.15));
      belt();
      arms(() => sbox(0.155, 0.12, 0.165, k.trim, 0, -0.27, 0));
      return { torso, armL, armR };
    }
    case 'chain':
      torso.push(sbox(0.57, 0.52, 0.42, k.metal, 0, 0.27, 0));
      for (const y of [0.18, 0.3, 0.42]) torso.push(sbox(0.575, 0.015, 0.425, k.lo, 0, y, 0));
      torso.push(scyl(0.15, 0.19, 0.07, k.trim, 0, 0.54, 0, 10));
      belt();
      arms(() => sbox(0.155, 0.2, 0.165, k.metal, 0, -0.1, 0));
      return { torso, armL, armR };
    case 'scale':
      torso.push(sbox(0.58, 0.52, 0.42, k.metal, 0, 0.27, 0));
      for (let i = 0; i < 5; i++) torso.push(sbox(0.585, 0.02, 0.425, k.lo, 0, 0.12 + i * 0.08, 0));
      torso.push(scyl(0.15, 0.19, 0.08, k.trim, 0, 0.54, 0, 10));
      for (const s of [-1, 1]) torso.push(pauldron({ ...lk, spikes: false }, { ...k, metal: k.trim, trim: k.metal }, s));
      belt();
      if (k.gem) torso.push(ssphere(0.035, k.gem, 0, 0.38, 0.215));
      arms(() => sbox(0.16, 0.2, 0.17, k.metal, 0, -0.2, 0), () => sbox(0.16, 0.14, 0.17, k.trim, 0, -0.38, 0));
      return { torso, armL, armR };
    default: {
      // plate
      torso.push(
        sbox(0.59, 0.5, 0.43, k.metal, 0, 0.28, 0),
        sbox(0.04, 0.32, 0.02, k.hi, 0, 0.32, 0.22),
        sbox(0.61, 0.035, 0.45, k.lo, 0, 0.15, 0),
        sbox(0.61, 0.035, 0.45, k.lo, 0, 0.1, 0),
        scyl(0.15, 0.19, 0.09, lk.tier >= 2 ? k.trim : k.metal, 0, 0.54, 0, 10),
        // tassets over the hips
        sbox(0.2, 0.14, 0.03, k.metal, 0.13, -0.04, 0.22), sbox(0.2, 0.14, 0.03, k.metal, -0.13, -0.04, 0.22),
      );
      if (lk.tier >= 2) torso.push(sbox(0.025, 0.4, 0.44, k.trim, 0.296, 0.28, 0), sbox(0.025, 0.4, 0.44, k.trim, -0.296, 0.28, 0));
      for (const s of [-1, 1]) torso.push(pauldron(lk, k, s));
      torso.push(...emblemOn(lk, k, 0.36, 0.225));
      if (k.gem) torso.push(ssphere(0.035, k.gem, 0, lk.emblem === 'cross' ? 0.42 : 0.36, 0.235));
      belt();
      arms(
        () => sbox(0.16, 0.18, 0.17, k.metal, 0, -0.21, 0),
        () => sbox(0.165, 0.04, 0.175, lk.tier >= 2 ? k.trim : k.lo, 0, -0.3, 0),
        () => sbox(0.16, 0.14, 0.17, k.lo, 0, -0.38, 0),
      );
      return { torso, armL, armR };
    }
  }
}

// ------------------------------------------------------------------ legs and boots

/** Leg armour for one leg (`side` +1 left, −1 right), plus parts for the torso (skirts, tassets). */
export function buildLegArmour(lk: GearLook, M: MatFn, side: number): { leg: THREE.Object3D[]; torso: THREE.Object3D[] } {
  const k = mats(lk, M);
  const leg: THREE.Object3D[] = [];
  const torso: THREE.Object3D[] = [];
  switch (lk.legs) {
    case 'skirt':
      if (side > 0) torso.push(scyl(0.29, 0.36, 0.5, k.metal, 0, -0.2, 0, 10), scyl(0.362, 0.365, 0.05, k.trim, 0, -0.43, 0, 10), sbox(0.08, 0.5, 0.02, k.trim, 0, -0.2, 0.33));
      leg.push(sbox(0.19, 0.3, 0.22, k.lo, 0, -0.22, 0));
      break;
    case 'fur':
      leg.push(sbox(0.2, 0.36, 0.23, k.metal, 0, -0.17, 0), ssphere(0.12, k.metal, 0, -0.33, 0, 1, 0.5, 1.1));
      break;
    case 'bone':
      leg.push(sbox(0.19, 0.36, 0.22, k.trim, 0, -0.17, 0), ssphere(0.08, k.metal, 0, -0.08, 0.06, 1, 1.3, 0.8), ssphere(0.06, k.metal, 0, -0.21, 0.1), sbox(0.08, 0.13, 0.04, k.metal, 0, -0.31, 0.11));
      break;
    case 'leather':
      leg.push(sbox(0.195, 0.36, 0.225, k.metal, 0, -0.17, 0), sbox(0.1, 0.08, 0.03, k.trim, 0, -0.21, 0.115));
      break;
    case 'chain':
      leg.push(sbox(0.2, 0.36, 0.23, k.metal, 0, -0.17, 0), sbox(0.205, 0.015, 0.235, k.lo, 0, -0.1, 0), sbox(0.205, 0.015, 0.235, k.lo, 0, -0.24, 0));
      break;
    default: {
      // plate or scale: cuisse, knee cop, greave
      const knee = lk.legs === 'scale' ? k.trim : lk.tier >= 2 ? k.trim : k.hi;
      leg.push(
        sbox(0.205, 0.19, 0.235, k.metal, 0, -0.1, 0),
        sbox(0.21, 0.02, 0.24, k.lo, 0, -0.06, 0),
        ssphere(0.07, knee, 0, -0.21, 0.1, 1, 0.9, 0.8),
        sbox(0.195, 0.16, 0.225, k.metal, 0, -0.31, 0.01),
        sbox(0.03, 0.14, 0.02, k.hi, 0, -0.31, 0.125),
      );
      if (k.gem && lk.tier >= 3) leg.push(ssphere(0.025, k.gem, 0, -0.21, 0.155));
      if (lk.spikes) leg.push(rot(scone(0.03, 0.1, k.trim, side * 0.1, -0.21, 0.04, 4), 0, 0, -side * Math.PI / 2));
    }
  }
  return { leg, torso };
}

export function buildBoot(lk: GearLook, M: MatFn, side: number): THREE.Object3D[] {
  const k = mats(lk, M);
  const out: THREE.Object3D[] = [];
  switch (lk.boots) {
    case 'shoe':
      out.push(sbox(0.21, 0.11, 0.33, k.metal, 0, -0.58, 0.05), rot(scone(0.05, 0.14, k.metal, 0, -0.56, 0.25, 5), Math.PI / 2 - 0.5, 0, 0), sbox(0.215, 0.03, 0.335, k.trim, 0, -0.52, 0.05));
      if (k.gem) out.push(ssphere(0.025, k.gem, 0, -0.52, 0.18));
      break;
    case 'fur':
      out.push(sbox(0.22, 0.22, 0.33, M(MAT.leather[1]), 0, -0.52, 0.045), ssphere(0.13, k.metal, 0, -0.41, 0, 1, 0.5, 1.05));
      break;
    case 'bone':
      out.push(sbox(0.22, 0.22, 0.33, k.trim, 0, -0.52, 0.045), sbox(0.1, 0.12, 0.04, k.metal, 0, -0.47, 0.17));
      for (let i = -1; i <= 1; i++) out.push(rot(scone(0.02, 0.08, k.metal, i * 0.06, -0.6, 0.23, 4), Math.PI / 2, 0, 0));
      break;
    case 'leather':
    case 'wing':
      out.push(sbox(0.22, 0.22, 0.33, k.metal, 0, -0.52, 0.045), sbox(0.235, 0.06, 0.25, k.trim, 0, -0.42, 0), sbox(0.225, 0.03, 0.335, M(MAT.darkleather[2]), 0, -0.62, 0.045));
      if (lk.boots === 'wing') out.push(rot(sbox(0.02, 0.12, 0.2, M(MAT.sky[1], lk.glow), side * 0.13, -0.42, -0.06), -0.6, 0, side * 0.4), rot(sbox(0.02, 0.08, 0.14, M(MAT.sky[0], lk.glow), side * 0.15, -0.36, -0.1), -0.9, 0, side * 0.5));
      if (k.gem) out.push(ssphere(0.025, k.gem, side * 0.11, -0.46, 0.04));
      break;
    default:
      // plate sabatons: foot, toe cap, cuff, ankle disc
      out.push(
        sbox(0.225, 0.22, 0.33, k.metal, 0, -0.52, 0.045),
        sbox(0.2, 0.09, 0.08, k.hi, 0, -0.58, 0.22),
        sbox(0.235, 0.05, 0.245, lk.tier >= 2 ? k.trim : k.lo, 0, -0.42, 0),
        ssphere(0.035, k.trim, side * 0.115, -0.5, 0.0),
        sbox(0.23, 0.03, 0.34, M(MAT.darkleather[2]), 0, -0.625, 0.045),
      );
      if (lk.spikes) out.push(rot(scone(0.025, 0.09, k.trim, side * 0.12, -0.44, -0.04, 4), 0, 0, -side * Math.PI / 2));
  }
  return out;
}

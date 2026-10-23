import * as THREE from 'three';
import type { GearLook, MatKey, Ramp } from './gearLooks';
import { GRIM_MAT, grimLook, MAT, matKeyOf } from './gearLooks';
import { group, sbox, scone, scyl, sshell, ssphere, storus, type MatFn } from './parts';
import { PAINTED } from '../style';
import type { Detail } from './grimDetail';

/**
 * Worn armour on the humanoid rig: helmets (head space), body armour (torso
 * and arm space), leg armour and boots (leg space). Every piece is built from a
 * GearLook so it matches its icon: plates, pauldrons, belts, capes, crests,
 * visors, horns, greaves, gauntlets and glowing gems. Geometry is shared
 * (parts.ts s* helpers); materials come from one cache per character.
 *
 * Since 2026-10-21 everything is built from tapered, rounded shells (sshell)
 * that hug the body instead of square blocks; the player rig is slimmer still
 * (playerModel.ts scales its torso/limb groups, and the gear inside with them).
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
  /** Painted style: the surface of the main material and of the trim (grimDetail.ts), else null. */
  dM: Detail | null;
  dT: Detail | null;
}

function mats(lk: GearLook, M: MatFn, dM: Detail | null = null, dT: Detail | null = null): Mats {
  // painted style: no glow on the big surfaces (a lit part gets no worn detail); gems still glow
  const glow = PAINTED ? undefined : lk.glow;
  // chain mail is mostly the dark gaps between rings: paint it with the lighter tone so it still reads as metal
  const base = dM === 'chain' ? lk.m[0] : lk.m[1];
  return {
    metal: M(base, glow),
    hi: M(lk.m[0], glow),
    lo: M(lk.m[2]),
    trim: M(lk.t[1]),
    dark: M(0x140e0a),
    gem: lk.gem !== undefined ? M(lk.gem, lk.gem) : null,
    leather: M(MAT.leather[2]),
    dM, dT,
  };
}

// ------------------------------------------------------------------ painted style: grim gear

/**
 * Painted style (render/style.ts, owner 2026-10-23 "grim, brutal, detailed"): worn gear is
 * drawn in the grim palette (gearLooks.ts GRIM_MAT) and every part is tagged with the
 * surface it gets from the detail atlas (grimDetail.ts: riveted plate, chain, scales,
 * studded leather, tarnished gilt, stained cloth, fur, bone), and gets a few extra pieces:
 * rivets, straps and buckles, belt tails, frayed hems, a torn cape. Same shapes and sizes;
 * the classic look is untouched (nothing here runs unless PAINTED).
 */
const GRIM_OF = new Map<number, number>();
for (const k of Object.keys(MAT) as MatKey[]) MAT[k].forEach((c, i) => { if (!GRIM_OF.has(c)) GRIM_OF.set(c, GRIM_MAT[k][i]); });

/** Painted style: a material cache that hands out grim colours (MAT colours become their GRIM_MAT twins). */
export function grimMats(M: MatFn): MatFn {
  if (!PAINTED) return M;
  return (c, e) => {
    const m = M(GRIM_OF.get(c) ?? c, e);
    m.userData.grimToned = true;
    return m;
  };
}

/** The look in the grim palette (painted style only). */
const tone = (lk: GearLook): GearLook => (PAINTED ? grimLook(lk) : lk);

/** Atlas surface for a ramp used as the main material of plate-like pieces. */
function plateSurface(r: Ramp): Detail {
  const k = matKeyOf(r);
  if (k === 'gold' || k === 'dwarven') return 'gilt';
  if (k === 'bone' || k === 'pearl') return 'bone';
  if (k === 'dragon' || k === 'tide' || k === 'elven') return 'scale';
  if (k === 'leather' || k === 'darkleather') return 'studded';
  if (k === 'fur') return 'fur';
  if (k === 'arcane' || k === 'void' || k === 'rime' || k === 'royal' || k === 'sky' || k === 'ranger' || k === 'cloth') return 'cloth';
  return 'plate';
}

/** Atlas surface for a trim ramp. */
function trimSurface(r: Ramp): Detail {
  const k = matKeyOf(r);
  switch (k) {
    case 'gold': case 'dwarven': case 'bronze': return 'gilt';
    case 'leather': case 'darkleather': return 'leather';
    case 'bone': case 'pearl': return 'bone';
    case 'fur': return 'fur';
    case 'wood': return 'wood';
    case 'crimson': return 'leatherBurnt';
    case 'iron': case 'gunmetal': case 'darkstone': case 'hell': return 'iron';
    case 'steel': case 'silver': case 'starsteel': case 'frost': return 'steel';
    case 'dragon': case 'tide': return 'scale';
    case undefined: return 'steel';
    default: return 'cloth';
  }
}

/** Tags every untagged mesh under `objs` with its surface from the materials (painted style only). */
function tagAll(objs: THREE.Object3D[], k: Mats): void {
  if (!PAINTED) return;
  const by = new Map<THREE.Material, Detail>();
  if (k.dT) by.set(k.trim, k.dT);
  if (k.dM) for (const m of [k.metal, k.hi, k.lo]) by.set(m, k.dM);
  by.set(k.dark, 'iron');
  by.set(k.leather, 'leather');
  for (const o of objs) o.traverse((c) => {
    const me = c as THREE.Mesh;
    if (!me.isMesh || me.userData.detail) return;
    const d = by.get(me.material as THREE.Material);
    if (d) me.userData.detail = d;
  });
}

const tagged = <T extends THREE.Object3D>(o: T, d: Detail): T => {
  if (PAINTED) o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.userData.detail = d; });
  return o;
};

/** A small round rivet head (painted extras). */
const rivet = (m: THREE.Material, x: number, y: number, z: number, r = 0.016) => ssphere(r, m, x, y, z, 1, 1, 0.6, 0);

/** A leather strap with an iron buckle, centred at (x, y, z), turned by rz (painted extras). */
function strap(leather: THREE.Material, iron: THREE.Material, x: number, y: number, z: number, len: number, rz = 0, w = 0.035): THREE.Object3D[] {
  const s = tagged(sbox(w, len, 0.018, leather, x, y, z), 'leather');
  s.rotation.z = rz;
  const b = sbox(w * 1.25, w * 1.1, 0.02, iron, x, y, z + 0.006);
  b.rotation.z = rz;
  return [s, tagged(b, 'iron')];
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

export function buildHelm(lk0: GearLook, M0: MatFn): THREE.Group {
  const M = grimMats(M0);
  const lk = tone(lk0);
  const helmSurface: Partial<Record<GearLook['helm'], Detail>> = { cap: 'leather', fur: 'fur', coif: 'chain', hood: 'cloth', hat: 'runeCloth', skull: 'bone' };
  const k = mats(lk, M, PAINTED ? helmSurface[lk.helm] ?? (lk.helm === 'circlet' ? trimSurface(lk0.m) : plateSurface(lk0.m)) : null, PAINTED ? trimSurface(lk0.t) : null);
  const g = group();
  const g0 = g;
  const out = (): THREE.Group => { if (PAINTED) { grimHelm(lk, k, M, g0); tagAll([g0], k); } return g0; };
  const add = (...o: THREE.Object3D[]) => g.add(...o);
  switch (lk.helm) {
    case 'cap':
      add(ssphere(0.218, k.metal, 0, 0.07, -0.01, 1, 0.75, 1.03), scyl(0.225, 0.225, 0.05, k.trim, 0, 0.03, 0, 10), ssphere(0.03, M(MAT.iron[1]), 0, 0.235, 0));
      return out();
    case 'fur':
      add(ssphere(0.215, k.trim, 0, 0.08, -0.01, 1, 0.74, 1.02), rot(storus(0.2, 0.06, k.metal, Math.PI * 2, 5, 12), Math.PI / 2, 0, 0), ssphere(0.06, k.metal, 0, 0.25, -0.02));
      g.children[1].position.y = 0.04;
      return out();
    case 'coif':
      add(
        ssphere(0.228, k.metal, 0, 0.05, -0.03, 1, 0.86, 1.05),
        sbox(0.38, 0.17, 0.22, k.metal, 0, -0.13, -0.08),
        sbox(0.06, 0.2, 0.14, k.metal, 0.19, -0.08, 0.06), sbox(0.06, 0.2, 0.14, k.metal, -0.19, -0.08, 0.06),
        scyl(0.232, 0.232, 0.035, k.trim, 0, 0.1, -0.01, 10),
      );
      return out();
    case 'hood':
      add(
        ssphere(0.24, k.metal, 0, 0.04, -0.045, 1, 1, 1.06),
        rot(scone(0.13, 0.3, k.metal, 0, 0.0, -0.28, 6), -Math.PI / 2 - 0.55, 0, 0),
        sbox(0.4, 0.08, 0.3, k.metal, 0, -0.2, -0.05),
      );
      if (k.gem) add(ssphere(0.035, k.gem, 0, -0.17, 0.17));
      if (lk.emblem === 'leaf') add(rot(sbox(0.03, 0.2, 0.02, M(0xf0f0e0), 0.17, 0.2, -0.1), 0, 0, -0.3));
      return out();
    case 'hat': {
      const cone = rot(scone(0.2, 0.5, k.metal, 0, 0.42, -0.04, 8), -0.22, 0, 0.1);
      add(scyl(0.37, 0.37, 0.04, k.metal, 0, 0.14, 0, 12), cone, scyl(0.21, 0.21, 0.07, k.trim, 0, 0.19, 0, 10), rot(scone(0.06, 0.16, k.metal, 0.05, 0.7, -0.14, 6), -0.9, 0, 0.3));
      if (k.gem) add(ssphere(0.04, k.gem, 0, 0.19, 0.21));
      return out();
    }
    case 'circlet':
      add(scyl(0.218, 0.218, 0.05, k.metal, 0, 0.1, 0, 12), rot(sbox(0.08, 0.1, 0.03, k.trim, 0, 0.17, 0.205), 0, 0, Math.PI / 4));
      if (k.gem) add(ssphere(0.035, k.gem, 0, 0.17, 0.225), ssphere(0.02, k.gem, 0.15, 0.11, 0.16), ssphere(0.02, k.gem, -0.15, 0.11, 0.16));
      return out();
    case 'skull': {
      add(ssphere(0.23, k.metal, 0, 0.09, 0, 1, 0.9, 1.06), sbox(0.06, 0.06, 0.03, k.dark, 0.08, 0.06, 0.215), sbox(0.06, 0.06, 0.03, k.dark, -0.08, 0.06, 0.215));
      const eye = M(0xff5a20, 0xc03010);
      add(ssphere(0.018, eye, 0.08, 0.06, 0.225), ssphere(0.018, eye, -0.08, 0.06, 0.225));
      for (let i = -2; i <= 2; i++) add(sbox(0.03, 0.04, 0.03, k.hi, i * 0.035, -0.04, 0.215));
      if (lk.horns) for (const s of [-1, 1]) add(horn(k.metal, s, 0.18, 0.7));
      return out();
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
  if (lk.horns || lk.helm === 'horned') for (const s of [-1, 1]) add(tagged(horn(lk.spikes ? k.trim : M(MAT.bone[1]), s, 0.17, great ? 1.1 : 1), 'bone'));
  if (lk.helm === 'crested' || (great && lk.plume !== undefined && !lk.horns)) {
    const pm = M(lk.plume ?? lk.t[1], PAINTED ? undefined : lk.glow);
    for (let i = 0; i < 5; i++) add(tagged(rot(sbox(0.06, 0.12 + i * 0.03, 0.09, pm, 0, 0.32 + i * 0.02, 0.15 - i * 0.09), -0.3 - i * 0.12, 0, 0), 'hair'));
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
  return out();
}

/** Painted extras on a helmet: rivets round the brow, breathing holes, buckles, tattered hoods. */
function grimHelm(lk: GearLook, k: Mats, M: MatFn, g: THREE.Group): void {
  const iron = M(MAT.iron[2]);
  const lea = M(MAT.darkleather[1]);
  const rv = lk.tier >= 3 ? k.trim : iron;
  switch (lk.helm) {
    case 'hood':
      // a frayed edge round the face and a few torn strips at the back
      for (let i = 0; i < 5; i++) g.add(tagged(rot(sbox(0.05, 0.08 + (i % 2) * 0.05, 0.02, k.metal, (i - 2) * 0.07, -0.26 - (i % 2) * 0.02, -0.18 + Math.abs(i - 2) * 0.03), 0.2, 0, (i - 2) * 0.15), 'cloth'));
      return;
    case 'hat':
      g.add(...strap(lea, iron, 0.17, 0.19, 0.12, 0.07, 1.2));
      g.add(tagged(sbox(0.08, 0.07, 0.02, M(lk.m[2]), -0.06, 0.36, 0.05), 'cloth')); // a patch on the cone
      return;
    case 'cap':
    case 'coif':
      for (const s of [-1, 1]) g.add(...strap(lea, iron, s * 0.15, -0.14, 0.13, 0.1, s * 0.5, 0.028)); // chin strap
      return;
    case 'fur':
      g.add(tagged(ssphere(0.03, M(MAT.bone[1]), 0.12, 0.1, 0.17, 1, 1.4, 0.7, 0), 'bone'), tagged(ssphere(0.025, M(MAT.bone[1]), -0.14, 0.08, 0.16, 1, 1.4, 0.7, 0), 'bone'));
      return;
    case 'circlet':
    case 'skull':
      return;
    default:
  }
  // metal helmets: a ring of rivets round the brow band, a dark welt where plates meet
  const great = lk.helm === 'great';
  const n = 8 + Math.min(4, lk.tier);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (Math.cos(a) > 0.9 && !great) continue; // keep the face clear
    g.add(rivet(rv, Math.sin(a) * 0.236, great ? 0.2 : -0.04, Math.cos(a) * 0.236));
  }
  if (great) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.add(sbox(0.018, 0.018, 0.02, k.dark, -0.07 - j * 0.035, -0.06 - i * 0.035, 0.225)); // breathing holes
    for (let i = 0; i < 5; i++) g.add(rivet(rv, Math.sin(i * 1.26) * 0.236, -0.18, Math.cos(i * 1.26) * 0.236));
  }
  // a dent and a cut in the dome
  g.add(sbox(0.06, 0.012, 0.012, k.dark, 0.09, 0.2, 0.13).rotateZ(0.6).rotateY(0.5));
  // leather lining showing under the rim
  g.add(tagged(scyl(0.222, 0.222, 0.03, lea, 0, great ? -0.22 : isOpenHelm(lk) ? -0.1 : -0.245, 0, 10), 'leather'));
}

const isOpenHelm = (lk: GearLook) => lk.helm === 'med' || lk.helm === 'winged';

// ------------------------------------------------------------------ body armour

export interface ArmourParts {
  torso: THREE.Object3D[];
  armL: THREE.Object3D[];
  armR: THREE.Object3D[];
}

function pauldron(lk: GearLook, k: Mats, s: number): THREE.Group {
  const sz = 1 + Math.min(lk.tier, 4) * 0.035;
  const p = group(s * 0.29, 0.5, 0,
    ssphere(0.135 * sz, k.metal, 0, 0, 0, 1.15, 0.68, 1.15),
    ssphere(0.125 * sz, lk.tier >= 2 ? k.trim : k.lo, s * 0.03, -0.07, 0, 1.2, 0.45, 1.2),
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

export function buildArmour(lk0: GearLook, M0: MatFn): ArmourParts {
  const M = grimMats(M0);
  const lk = tone(lk0);
  const bodySurface: Partial<Record<GearLook['body'], Detail>> = {
    chain: 'chain', scale: 'scale', leather: 'studded', vest: 'leather', fur: 'fur', bone: 'bone',
    robe: lk0.m === MAT.arcane || lk0.m === MAT.void || lk0.m === MAT.rime ? 'runeCloth' : 'cloth',
  };
  const k = mats(lk, M, PAINTED ? bodySurface[lk.body] ?? plateSurface(lk0.m) : null, PAINTED ? trimSurface(lk0.t) : null);
  const parts = buildArmourParts(lk, k, M);
  if (PAINTED) {
    grimArmour(lk, k, M, parts);
    tagAll([...parts.torso, ...parts.armL, ...parts.armR], k);
  }
  return parts;
}

function buildArmourParts(lk: GearLook, k: Mats, M: MatFn): ArmourParts {
  const torso: THREE.Object3D[] = [];
  const armL: THREE.Object3D[] = [];
  const armR: THREE.Object3D[] = [];
  const arms = (...mk: Array<() => THREE.Object3D>) => { for (const f of mk) { armL.push(f()); armR.push(f()); } };
  const beltM = M(lk.tier >= 3 ? MAT.darkleather[1] : MAT.leather[1]);
  const belt = () => torso.push(sshell(0.555, 0.555, 0.07, 0.44, beltM, 0, 0.05, 0), sbox(0.08, 0.06, 0.03, lk.tier >= 2 ? k.trim : M(MAT.iron[0]), 0, 0.05, 0.222));
  // a yoke over the shoulders hides the outfit's own collar band
  torso.push(sshell(0.42, 0.56, 0.08, 0.4, lk.body === 'fur' || lk.body === 'bone' ? k.trim : k.metal, 0, 0.53, 0));
  if (lk.cape !== undefined && lk.body !== 'robe') {
    const cm = M(lk.cape);
    const c = group(0, 0.54, -0.21, tagged(sshell(0.4, 0.5, 0.68, 0.03, cm, 0, -0.34, 0, 4), 'clothBlood'), sbox(0.42, 0.05, 0.05, k.trim, 0, -0.01, 0.01));
    if (PAINTED) {
      // a torn, ragged hem: strips of uneven length hanging below the cape
      const L = [0.1, 0.05, 0.13, 0.04, 0.09, 0.12];
      L.forEach((l, i) => c.add(tagged(rot(sbox(0.075, l, 0.025, cm, -0.21 + i * 0.084, -0.68 - l / 2, 0), 0, 0, (i % 2 ? 1 : -1) * 0.06), 'clothBlood')));
    }
    c.rotation.x = 0.1;
    c.userData.armourCape = true; // hidden under a worn cape item (humanoid.ts)
    torso.push(c);
  }
  switch (lk.body) {
    case 'robe': {
      torso.push(
        sshell(0.58, 0.5, 0.53, 0.4, k.metal, 0, 0.27, 0),
        scyl(0.27, 0.36, 0.62, k.metal, 0, -0.27, 0, 10),
        scyl(0.362, 0.365, 0.06, k.trim, 0, -0.56, 0, 10),
        sbox(0.1, 0.52, 0.02, k.trim, 0, 0.27, 0.205),
        sshell(0.54, 0.54, 0.06, 0.43, M(lk.t[2]), 0, 0.06, 0),
        scyl(0.15, 0.2, 0.08, k.trim, 0, 0.54, 0, 10),
      );
      if (k.gem) torso.push(ssphere(0.035, k.gem, 0, 0.45, 0.21));
      arms(() => scyl(0.095, 0.12, 0.12, k.metal, 0, -0.3, 0, 8), () => scyl(0.122, 0.122, 0.03, k.trim, 0, -0.36, 0, 8), () => sshell(0.165, 0.145, 0.3, 0.165, k.metal, 0, -0.15, 0));
      return { torso, armL, armR };
    }
    case 'fur':
      torso.push(sshell(0.58, 0.52, 0.52, 0.41, k.trim, 0, 0.27, 0), rot(storus(0.2, 0.07, k.metal, Math.PI * 2, 5, 12), Math.PI / 2, 0, 0), rot(storus(0.27, 0.045, k.metal, Math.PI * 2, 4, 14), Math.PI / 2, 0, 0));
      torso[torso.length - 2].position.y = 0.52;
      torso[torso.length - 1].position.y = 0.02;
      for (const s of [-1, 1]) torso.push(ssphere(0.13, k.metal, s * 0.29, 0.5, 0, 1.15, 0.75, 1.15));
      belt();
      arms(() => sshell(0.165, 0.15, 0.12, 0.17, k.metal, 0, -0.28, 0));
      return { torso, armL, armR };
    case 'bone': {
      torso.push(sshell(0.58, 0.52, 0.52, 0.41, k.trim, 0, 0.27, 0), sbox(0.05, 0.36, 0.03, k.metal, 0, 0.28, 0.21));
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) torso.push(rot(sbox(0.18, 0.03, 0.03, k.metal, s * 0.11, 0.42 - i * 0.08, 0.207), 0, 0, s * 0.18));
      for (const s of [-1, 1]) torso.push(ssphere(0.12, k.metal, s * 0.31, 0.52, 0, 1.1, 0.9, 1.1), sbox(0.04, 0.035, 0.02, k.dark, s * 0.31 - 0.035, 0.53, 0.115), sbox(0.04, 0.035, 0.02, k.dark, s * 0.31 + 0.035, 0.53, 0.115));
      belt();
      arms(() => sshell(0.165, 0.15, 0.12, 0.17, k.metal, 0, -0.27, 0));
      return { torso, armL, armR };
    }
    case 'leather':
    case 'vest': {
      torso.push(sshell(0.57, 0.5, 0.52, 0.4, k.metal, 0, 0.27, 0));
      if (lk.body === 'vest') {
        torso.push(sbox(0.34, 0.12, 0.14, k.metal, 0, 0.55, -0.12), rot(sbox(0.06, 0.62, 0.02, k.trim, 0, 0.3, 0.205), 0, 0, 0.75), rot(sbox(0.06, 0.62, 0.02, k.trim, 0, 0.3, -0.205), 0, 0, -0.75));
        if (k.gem) torso.push(ssphere(0.03, k.gem, 0, 0.47, 0.21));
      } else {
        torso.push(rot(sbox(0.05, 0.56, 0.02, k.trim, 0, 0.3, 0.205), 0, 0, 0.6), rot(sbox(0.05, 0.56, 0.02, k.trim, 0, 0.3, 0.205), 0, 0, -0.6));
      }
      for (const s of [-1, 1]) torso.push(ssphere(0.11, k.trim, s * 0.28, 0.5, 0, 1.15, 0.6, 1.15));
      belt();
      arms(() => sshell(0.165, 0.15, 0.12, 0.17, k.trim, 0, -0.27, 0));
      return { torso, armL, armR };
    }
    case 'chain':
      torso.push(sshell(0.58, 0.5, 0.52, 0.41, k.metal, 0, 0.27, 0));
      for (const y of [0.18, 0.3, 0.42]) torso.push(sshell(bandW(y, 0.58, 0.5, 0.27, 0.52) + 0.006, bandW(y, 0.58, 0.5, 0.27, 0.52) + 0.006, 0.015, 0.416, k.lo, 0, y, 0));
      torso.push(scyl(0.15, 0.19, 0.07, k.trim, 0, 0.54, 0, 10));
      belt();
      arms(() => sshell(0.165, 0.15, 0.2, 0.17, k.metal, 0, -0.1, 0));
      return { torso, armL, armR };
    case 'scale':
      torso.push(sshell(0.59, 0.5, 0.52, 0.41, k.metal, 0, 0.27, 0));
      for (let i = 0; i < 5; i++) { const w = bandW(0.12 + i * 0.08, 0.59, 0.5, 0.27, 0.52) + 0.006; torso.push(sshell(w, w, 0.02, 0.416, k.lo, 0, 0.12 + i * 0.08, 0)); }
      torso.push(scyl(0.15, 0.19, 0.08, k.trim, 0, 0.54, 0, 10));
      for (const s of [-1, 1]) torso.push(pauldron({ ...lk, spikes: false }, { ...k, metal: k.trim, trim: k.metal }, s));
      belt();
      if (k.gem) torso.push(ssphere(0.035, k.gem, 0, 0.38, 0.21));
      arms(() => sshell(0.17, 0.15, 0.2, 0.17, k.metal, 0, -0.2, 0), () => sshell(0.155, 0.16, 0.14, 0.17, k.trim, 0, -0.38, 0));
      return { torso, armL, armR };
    default: {
      // plate
      torso.push(
        sshell(0.6, 0.5, 0.5, 0.42, k.metal, 0, 0.28, 0),
        ssphere(0.2, k.metal, 0, 0.38, 0.07, 1.3, 0.75, 0.7), // rounded breastplate
        sbox(0.035, 0.3, 0.02, k.hi, 0, 0.33, 0.21),
        sshell(0.53, 0.53, 0.035, 0.43, k.lo, 0, 0.15, 0),
        sshell(0.53, 0.53, 0.035, 0.43, k.lo, 0, 0.1, 0),
        scyl(0.15, 0.19, 0.09, lk.tier >= 2 ? k.trim : k.metal, 0, 0.54, 0, 10),
        // tassets over the hips
        rot(sshell(0.2, 0.22, 0.14, 0.03, k.metal, 0.12, -0.04, 0.21, 4), 0, 0, 0.08), rot(sshell(0.2, 0.22, 0.14, 0.03, k.metal, -0.12, -0.04, 0.21, 4), 0, 0, -0.08),
      );
      if (lk.tier >= 2) torso.push(rot(sbox(0.022, 0.4, 0.36, k.trim, 0.27, 0.28, 0), 0, 0, -0.1), rot(sbox(0.022, 0.4, 0.36, k.trim, -0.27, 0.28, 0), 0, 0, 0.1));
      for (const s of [-1, 1]) torso.push(pauldron(lk, k, s));
      torso.push(...emblemOn(lk, k, 0.36, 0.215));
      if (k.gem) torso.push(ssphere(0.035, k.gem, 0, lk.emblem === 'cross' ? 0.42 : 0.36, 0.225));
      belt();
      arms(
        () => sshell(0.17, 0.15, 0.18, 0.17, k.metal, 0, -0.21, 0),
        () => sshell(0.165, 0.165, 0.04, 0.175, lk.tier >= 2 ? k.trim : k.lo, 0, -0.3, 0),
        () => sshell(0.15, 0.165, 0.14, 0.17, k.lo, 0, -0.38, 0), // gauntlet
      );
      return { torso, armL, armR };
    }
  }
}

/** Painted extras on body armour: rivets, straps and buckles, belt tails, frayed hems, gauntlet knuckles. */
function grimArmour(lk: GearLook, k: Mats, M: MatFn, p: ArmourParts): void {
  const iron = M(MAT.iron[2]);
  const lea = M(MAT.darkleather[1]);
  const rv = lk.tier >= 3 ? k.trim : iron;
  const T = (...o: THREE.Object3D[]) => p.torso.push(...o);
  const A = (f: () => THREE.Object3D[]) => { p.armL.push(...f()); p.armR.push(...f()); };
  // a belt tail hanging from the buckle on everything with a belt
  if (lk.body !== 'robe') T(tagged(rot(sbox(0.035, 0.12, 0.015, M(MAT.leather[1]), 0.05, -0.02, 0.228), 0, 0, 0.12), 'leather'));
  switch (lk.body) {
    case 'robe': {
      // rope belt with hanging ends, a bone charm, and a frayed hem
      const rope = M(MAT.cloth[2]);
      T(tagged(scyl(0.012, 0.012, 0.2, rope, 0.08, -0.06, 0.23, 4), 'cloth'), tagged(scyl(0.012, 0.012, 0.16, rope, 0.11, -0.04, 0.225, 4), 'cloth'));
      T(tagged(ssphere(0.03, M(MAT.bone[1]), 0.09, -0.17, 0.235, 0.8, 1.2, 0.6, 0), 'bone'));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, l = 0.04 + ((i * 7) % 5) * 0.012;
        T(tagged(rot(sbox(0.09, l, 0.02, k.metal, Math.sin(a) * 0.35, -0.6 - l / 2, Math.cos(a) * 0.35), 0, a, 0), 'clothBlood'));
      }
      A(() => [tagged(sbox(0.06, 0.05, 0.015, k.metal, 0, -0.39, 0.12), 'cloth')]); // a torn sleeve edge
      return;
    }
    case 'fur':
    case 'bone':
      // two crossed straps with buckles holding it on, bone toggles
      T(...strap(lea, iron, 0, 0.3, 0.215, 0.6, 0.62), ...strap(lea, iron, 0, 0.3, 0.214, 0.6, -0.62));
      if (lk.body === 'bone') for (let i = 0; i < 3; i++) T(tagged(sbox(0.08, 0.02, 0.02, lea, 0, 0.42 - i * 0.08, 0.222), 'leather')); // twine round the ribs
      return;
    case 'leather':
    case 'vest':
      // buckles where the straps cross, stitched shoulder pieces
      T(tagged(sbox(0.05, 0.045, 0.02, iron, 0, 0.3, 0.215), 'iron'));
      for (const s of [-1, 1]) T(rivet(iron, s * 0.28, 0.5, 0.1, 0.014), rivet(iron, s * 0.32, 0.47, 0.06, 0.014));
      A(() => [tagged(sbox(0.015, 0.1, 0.015, M(0x1e140c), 0.03, -0.27, 0.085).rotateZ(0.5), 'leather'), tagged(sbox(0.015, 0.1, 0.015, M(0x1e140c), -0.03, -0.27, 0.085).rotateZ(-0.5), 'leather')]); // laced bracer
      return;
    case 'chain':
      // a leather baldric across the chest and shoulder straps
      T(...strap(lea, iron, 0.02, 0.3, 0.215, 0.62, 0.7, 0.045));
      for (const s of [-1, 1]) T(tagged(sbox(0.06, 0.03, 0.3, lea, s * 0.2, 0.545, 0), 'leather'));
      return;
    case 'scale':
      for (let i = 0; i < 6; i++) T(rivet(rv, -0.2 + i * 0.08, 0.05, 0.225));
      for (const s of [-1, 1]) T(...strap(lea, iron, s * 0.17, 0.38, 0.2, 0.22, s * 0.25));
      return;
    default: {
      // plate: rivet rows along the breastplate and fauld, side straps with buckles,
      // rivets on the pauldrons, knuckle plates on the gauntlets
      for (let i = 0; i < 7; i++) T(rivet(rv, -0.18 + i * 0.06, 0.13, 0.222));
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) T(rivet(rv, s * (0.1 + i * 0.012), 0.48 - i * 0.07, 0.205 - i * 0.004));
      for (const s of [-1, 1]) {
        T(...strap(lea, iron, s * 0.268, 0.3, 0.07, 0.24, 0, 0.03).map((o) => { o.rotation.y = s * Math.PI / 2; return o; }));
        T(rivet(rv, s * 0.36, 0.52, 0.06), rivet(rv, s * 0.36, 0.52, -0.06), rivet(rv, s * 0.3, 0.6, 0));
        T(tagged(sbox(0.05, 0.012, 0.012, k.dark, s * 0.1, 0.32, 0.22).rotateZ(s * 0.8), 'iron')); // a gouge
      }
      A(() => [tagged(sbox(0.12, 0.03, 0.05, k.hi, 0, -0.43, 0.07), plateSurface(MAT.steel)), rivet(rv, 0.06, -0.36, 0.08, 0.012), rivet(rv, -0.06, -0.36, 0.08, 0.012)]);
    }
  }
}

// ------------------------------------------------------------------ legs and boots

/** Leg armour for one leg (`side` +1 left, −1 right), plus parts for the torso (skirts, tassets). */
export function buildLegArmour(lk0: GearLook, M0: MatFn, side: number): { leg: THREE.Object3D[]; torso: THREE.Object3D[] } {
  const M = grimMats(M0);
  const lk = tone(lk0);
  const legSurface: Partial<Record<GearLook['legs'], Detail>> = {
    chain: 'chain', scale: 'scale', leather: 'leather', fur: 'fur', bone: 'bone',
    skirt: lk0.m === MAT.arcane || lk0.m === MAT.void || lk0.m === MAT.rime ? 'runeCloth' : 'cloth',
  };
  const k = mats(lk, M, PAINTED ? legSurface[lk.legs] ?? plateSurface(lk0.m) : null, PAINTED ? trimSurface(lk0.t) : null);
  const out = buildLegParts(lk, k, side);
  if (PAINTED) {
    grimLegs(lk, k, M, side, out);
    tagAll([...out.leg, ...out.torso], k);
  }
  return out;
}

function buildLegParts(lk: GearLook, k: Mats, side: number): { leg: THREE.Object3D[]; torso: THREE.Object3D[] } {
  const leg: THREE.Object3D[] = [];
  const torso: THREE.Object3D[] = [];
  switch (lk.legs) {
    case 'skirt':
      if (side > 0) torso.push(scyl(0.26, 0.33, 0.5, k.metal, 0, -0.2, 0, 10), scyl(0.332, 0.335, 0.05, k.trim, 0, -0.43, 0, 10), sbox(0.07, 0.5, 0.02, k.trim, 0, -0.2, 0.3));
      leg.push(sshell(0.19, 0.16, 0.3, 0.21, k.lo, 0, -0.22, 0));
      break;
    case 'fur':
      leg.push(sshell(0.215, 0.18, 0.36, 0.22, k.metal, 0, -0.17, 0), ssphere(0.11, k.metal, 0, -0.33, 0, 1, 0.5, 1.1));
      break;
    case 'bone':
      leg.push(sshell(0.205, 0.165, 0.36, 0.21, k.trim, 0, -0.17, 0), ssphere(0.08, k.metal, 0, -0.08, 0.06, 1, 1.3, 0.8), ssphere(0.06, k.metal, 0, -0.21, 0.1), sbox(0.08, 0.13, 0.04, k.metal, 0, -0.31, 0.11));
      break;
    case 'leather':
      leg.push(sshell(0.21, 0.17, 0.36, 0.215, k.metal, 0, -0.17, 0), ssphere(0.06, k.trim, 0, -0.22, 0.09, 1, 0.8, 0.6));
      break;
    case 'chain':
      leg.push(sshell(0.215, 0.17, 0.36, 0.22, k.metal, 0, -0.17, 0), sshell(0.21, 0.21, 0.015, 0.225, k.lo, 0, -0.1, 0), sshell(0.19, 0.19, 0.015, 0.205, k.lo, 0, -0.24, 0));
      break;
    default: {
      // plate or scale: cuisse, knee cop, greave
      const knee = lk.legs === 'scale' ? k.trim : lk.tier >= 2 ? k.trim : k.hi;
      leg.push(
        sshell(0.215, 0.185, 0.19, 0.225, k.metal, 0, -0.1, 0), // cuisse
        sshell(0.22, 0.22, 0.02, 0.23, k.lo, 0, -0.06, 0),
        ssphere(0.065, knee, 0, -0.21, 0.09, 1, 0.9, 0.8),
        sshell(0.18, 0.15, 0.16, 0.19, k.metal, 0, -0.31, 0.005), // greave
        sbox(0.025, 0.13, 0.02, k.hi, 0, -0.31, 0.1),
      );
      if (k.gem && lk.tier >= 3) leg.push(ssphere(0.025, k.gem, 0, -0.21, 0.145));
      if (lk.spikes) leg.push(rot(scone(0.03, 0.1, k.trim, side * 0.1, -0.21, 0.04, 4), 0, 0, -side * Math.PI / 2));
    }
  }
  return { leg, torso };
}

/** Painted extras on leg armour: knee rivets, a strap and buckle round the thigh, patches, bindings. */
function grimLegs(lk: GearLook, k: Mats, M: MatFn, side: number, p: { leg: THREE.Object3D[]; torso: THREE.Object3D[] }): void {
  const iron = M(MAT.iron[2]);
  const lea = M(MAT.darkleather[1]);
  const rv = lk.tier >= 3 ? k.trim : iron;
  switch (lk.legs) {
    case 'skirt':
      // a frayed, stained hem on the skirt (built once, with the left leg)
      if (side > 0) for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, l = 0.03 + ((i * 5) % 4) * 0.014;
        p.torso.push(tagged(rot(sbox(0.1, l, 0.02, k.metal, Math.sin(a) * 0.33, -0.455 - l / 2, Math.cos(a) * 0.33), 0, a, 0), 'clothBlood'));
      }
      return;
    case 'fur':
      for (const y of [-0.08, -0.26]) p.leg.push(tagged(sshell(0.222, 0.222, 0.025, 0.232, lea, 0, y, 0), 'leather')); // bindings
      return;
    case 'leather':
      p.leg.push(tagged(sbox(0.08, 0.07, 0.02, M(lk.m[2]), side * 0.03, -0.1, 0.105), 'studded')); // a stitched patch
      p.leg.push(...strap(lea, iron, 0, -0.04, 0.11, 0.05, Math.PI / 2, 0.03));
      return;
    case 'chain':
      p.leg.push(tagged(sshell(0.225, 0.225, 0.03, 0.235, lea, 0, -0.02, 0), 'leather'), tagged(sbox(0.035, 0.035, 0.02, iron, side * 0.1, -0.02, 0.06), 'iron'));
      return;
    case 'bone':
      return;
    default:
      // plate and scale: knee-cop rivets, a buckled strap round the back of the thigh
      p.leg.push(rivet(rv, 0.045, -0.2, 0.135, 0.012), rivet(rv, -0.045, -0.2, 0.135, 0.012));
      p.leg.push(tagged(sshell(0.222, 0.222, 0.03, 0.232, lea, 0, -0.14, -0.003), 'leather'), tagged(sbox(0.035, 0.035, 0.02, iron, side * 0.108, -0.14, 0.03), 'iron'));
      p.leg.push(rivet(rv, 0, -0.03, 0.118), rivet(rv, side * 0.07, -0.03, 0.1));
  }
}

/** A boot hugging the leg: shaft, foot and a rounded toe (leg space, foot centred at y −0.52, z 0.04). */
function bootCore(m: THREE.Material): THREE.Object3D[] {
  return [
    sshell(0.175, 0.19, 0.17, 0.205, m, 0, -0.475, 0),
    sshell(0.18, 0.19, 0.1, 0.31, m, 0, -0.57, 0.045),
    ssphere(0.09, m, 0, -0.57, 0.16, 1, 0.6, 1.1),
  ];
}

/** Width of a tapered torso shell (top `wTop` at `y0 + h/2`, bottom `wBot`) at height y. */
function bandW(y: number, wTop: number, wBot: number, y0: number, h: number): number {
  const t = Math.max(0, Math.min(1, (y - (y0 - h / 2)) / h));
  return wBot + (wTop - wBot) * t;
}

export function buildBoot(lk0: GearLook, M0: MatFn, side: number): THREE.Object3D[] {
  const M = grimMats(M0);
  const lk = tone(lk0);
  const bootSurface: Partial<Record<GearLook['boots'], Detail>> = { shoe: 'leather', fur: 'fur', bone: 'bone', leather: 'leather', wing: 'leather' };
  const k = mats(lk, M, PAINTED ? bootSurface[lk.boots] ?? plateSurface(lk0.m) : null, PAINTED ? trimSurface(lk0.t) : null);
  const out = buildBootParts(lk, k, M, side);
  if (PAINTED) {
    grimBoot(lk, k, M, side, out);
    tagAll(out, k);
  }
  return out;
}

/** Painted extras on boots: buckled straps, toe-cap rivets, soles, cord bindings. */
function grimBoot(lk: GearLook, k: Mats, M: MatFn, side: number, out: THREE.Object3D[]): void {
  const iron = M(MAT.iron[2]);
  const lea = M(MAT.darkleather[1]);
  switch (lk.boots) {
    case 'shoe':
      return;
    case 'fur':
      for (const y of [-0.46, -0.52]) out.push(tagged(sshell(0.198, 0.198, 0.018, 0.215, lea, 0, y, 0), 'leather'));
      return;
    case 'leather':
    case 'wing':
      out.push(tagged(sshell(0.2, 0.2, 0.025, 0.22, lea, 0, -0.5, 0.002), 'leather'), tagged(sbox(0.035, 0.035, 0.02, iron, side * 0.095, -0.5, 0.06), 'iron'));
      out.push(tagged(sshell(0.192, 0.192, 0.022, 0.32, lea, 0, -0.56, 0.05), 'leather'));
      return;
    case 'bone':
      return;
    default:
      out.push(rivet(lk.tier >= 3 ? k.trim : iron, 0.04, -0.54, 0.235, 0.012), rivet(lk.tier >= 3 ? k.trim : iron, -0.04, -0.54, 0.235, 0.012));
      out.push(tagged(sshell(0.2, 0.2, 0.025, 0.22, lea, 0, -0.47, 0.002), 'leather'), tagged(sbox(0.035, 0.035, 0.02, iron, side * 0.1, -0.47, 0.065), 'iron'));
  }
}

function buildBootParts(lk: GearLook, k: Mats, M: MatFn, side: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  switch (lk.boots) {
    case 'shoe':
      out.push(sshell(0.17, 0.18, 0.11, 0.31, k.metal, 0, -0.575, 0.045), rot(scone(0.045, 0.13, k.metal, 0, -0.56, 0.24, 5), Math.PI / 2 - 0.5, 0, 0), sshell(0.175, 0.175, 0.03, 0.3, k.trim, 0, -0.52, 0.045));
      if (k.gem) out.push(ssphere(0.025, k.gem, 0, -0.52, 0.18));
      break;
    case 'fur':
      out.push(...bootCore(M(MAT.leather[1])), ssphere(0.115, k.metal, 0, -0.41, 0, 1, 0.5, 1.05));
      break;
    case 'bone':
      out.push(...bootCore(k.trim), sbox(0.09, 0.11, 0.04, k.metal, 0, -0.47, 0.13));
      for (let i = -1; i <= 1; i++) out.push(rot(scone(0.02, 0.08, k.metal, i * 0.06, -0.6, 0.23, 4), Math.PI / 2, 0, 0));
      break;
    case 'leather':
    case 'wing':
      out.push(...bootCore(k.metal), sshell(0.19, 0.19, 0.06, 0.21, k.trim, 0, -0.42, 0), sshell(0.185, 0.185, 0.03, 0.32, M(MAT.darkleather[2]), 0, -0.615, 0.045));
      if (lk.boots === 'wing') out.push(rot(sbox(0.02, 0.12, 0.2, M(MAT.sky[1], PAINTED ? undefined : lk.glow), side * 0.13, -0.42, -0.06), -0.6, 0, side * 0.4), rot(sbox(0.02, 0.08, 0.14, M(MAT.sky[0], PAINTED ? undefined : lk.glow), side * 0.15, -0.36, -0.1), -0.9, 0, side * 0.5));
      if (k.gem) out.push(ssphere(0.025, k.gem, side * 0.11, -0.46, 0.04));
      break;
    default:
      // plate sabatons: foot, toe cap, cuff, ankle disc
      out.push(
        ...bootCore(k.metal),
        ssphere(0.085, k.hi, 0, -0.565, 0.17, 1, 0.6, 1.1), // toe cap
        sshell(0.195, 0.195, 0.05, 0.215, lk.tier >= 2 ? k.trim : k.lo, 0, -0.42, 0),
        ssphere(0.03, k.trim, side * 0.1, -0.5, 0.0),
        sshell(0.185, 0.185, 0.03, 0.33, M(MAT.darkleather[2]), 0, -0.62, 0.045),
      );
      if (lk.spikes) out.push(rot(scone(0.025, 0.09, k.trim, side * 0.12, -0.44, -0.04, 4), 0, 0, -side * Math.PI / 2));
  }
  return out;
}

import * as THREE from 'three';
import type { BipedRig } from './rigs';
import { bipedRig, C, hitbox, Kit, Mesher, type PartOpt, type V3 } from './darkRigsCore';

/**
 * Reusable pieces for the dark monster models: a generic humanoid assembler
 * (pivots match the classic humanoid so animations line up), limbs, armour
 * bits, weapons and shields. Weapons are drawn in the hand's frame: origin at
 * the grip, the business end along +Z, the edge toward -Y.
 */

// ------------------------------------------------------------------ humanoid assembler

export interface ManSpec {
  /** Width multiplier (classic `bulk`). */
  bulk?: number;
  /** Leg length multiplier (classic `legScale`). */
  legScale?: number;
  height?: number;
  restArm?: number;
  hb?: V3;
  /** Head pivot offset from the default (0, hip + 0.62, 0). */
  headOff?: V3;
  /** Shoulder offset from the default (±0.36·bulk, hip + 0.48, 0). */
  armOff?: V3;
  leg: (m: Mesher, side: number, L: number) => void;
  torso: (m: Mesher) => void;
  head: (m: Mesher) => void;
  /** side −1 = right arm (weapon hand), +1 = left arm (shield hand). */
  arm: (m: Mesher, side: number) => void;
  /** Wing builder (side −1 / +1), pivots on the upper back. */
  wing?: (m: Mesher, side: number) => void;
  wingAt?: V3;
  hover?: boolean;
}

export function man(K: Kit, s: ManSpec): BipedRig {
  const b = s.bulk ?? 1;
  const L = 0.62 * (s.legScale ?? 1);
  const ho = s.headOff ?? [0, 0, 0];
  const ao = s.armOff ?? [0, 0, 0];
  const legL = K.limb('legL', [0.13 * b, L, 0], (m) => s.leg(m, 1, L));
  const legR = K.limb('legR', [-0.13 * b, L, 0], (m) => s.leg(m, -1, L));
  const torso = K.limb('torso', [0, L, 0], s.torso);
  const head = K.limb('head', [ho[0], L + 0.62 + ho[1], ho[2]], s.head);
  const armL = K.limb('armL', [0.36 * b + ao[0], L + 0.48 + ao[1], ao[2]], (m) => s.arm(m, 1));
  const armR = K.limb('armR', [-0.36 * b - ao[0], L + 0.48 + ao[1], ao[2]], (m) => s.arm(m, -1));
  let wings: THREE.Group[] | undefined;
  if (s.wing) {
    const at = s.wingAt ?? [0.16, L + 0.5, -0.22];
    wings = [-1, 1].map((sd) => {
      const w = K.limb(sd < 0 ? 'wingR' : 'wingL', [sd * at[0], at[1], at[2]], (m) => s.wing!(m, sd));
      w.rotation.y = sd * 0.3;
      return w;
    });
  }
  const hb = s.hb ?? [0.8, 1.6, 0.8];
  return bipedRig(K, { torso, head, armL, armR, legL, legR, wings }, hitbox(hb[0], hb[1], hb[2]), s.height ?? L + 1.13, s.restArm ?? -0.55, s.hover);
}

// ------------------------------------------------------------------ limbs

export interface LegOpt {
  thigh: number;
  shin?: number;
  boot?: number;
  w?: number;
  knee?: number;
  /** Spike on the knee cap. */
  kneeSpike?: number;
  /** Strapped wraps around the shin. */
  wraps?: number;
  /** Bare toes / claws instead of a boot. */
  claws?: number;
  blood?: number;
  grit?: number;
}

/** A standing leg from the hip (y = 0) to the ground (y = −L). */
export function leg(m: Mesher, side: number, L: number, o: LegOpt): void {
  const w = o.w ?? 0.17;
  const k = L / 0.62;
  const g = o.grit ?? 0.2;
  m.box(w * 1.05, 0.3 * k, w * 1.15, o.thigh, [0, -0.15 * k, 0], { grit: g, blood: o.blood });
  m.box(w * 0.92, 0.22 * k, w, o.shin ?? o.thigh, [0, -0.4 * k, 0.005], { grit: g });
  if (o.knee !== undefined) m.sph(w * 0.5, o.knee, [0, -0.3 * k, w * 0.5], { s: [1, 0.85, 0.7], grit: 0.25 });
  if (o.kneeSpike !== undefined) m.spike([0, -0.3 * k, w * 0.75], [0, 0.2, 1], 0.1, 0.025, o.kneeSpike);
  if (o.wraps !== undefined) for (let i = 0; i < 3; i++) m.box(w * 0.98, 0.025, w * 1.06, o.wraps, [0, -(0.35 + i * 0.06) * k, 0.005], { r: [0, 0, (i % 2 ? 1 : -1) * 0.12] });
  if (o.claws !== undefined) {
    m.box(w * 1.05, 0.08, w * 1.5, o.shin ?? o.thigh, [0, -L + 0.04, 0.04]);
    for (const dx of [-0.05, 0, 0.05]) m.spike([dx * w / 0.17, -L + 0.03, 0.04 + w * 0.7], [0, -0.3, 1], 0.07, 0.016, o.claws);
  } else m.box(w * 1.12, 0.14 * k, w * 1.65, o.boot ?? C.LEATHER, [0, -L + 0.07 * k, 0.045], { grit: 0.18 });
  if (side) { /* legs are mirrored by their pivot; the side is for extras */ }
}

export interface ArmOpt {
  upper: number;
  fore?: number;
  hand?: number;
  w?: number;
  /** Shoulder ball (bare arms) colour. */
  shoulder?: number;
  bracer?: number;
  /** Spikes on the bracer. */
  spikes?: number;
  blood?: number;
  grit?: number;
}

/** An arm hanging from the shoulder (y = 0); the hand ends near y = −0.46. */
export function arm(m: Mesher, side: number, o: ArmOpt): void {
  const w = o.w ?? 0.14;
  const g = o.grit ?? 0.2;
  if (o.shoulder !== undefined) m.sph(w * 0.62, o.shoulder, [0, -0.03, 0], { grit: g });
  m.box(w, 0.26, w * 1.06, o.upper, [0, -0.13, 0], { grit: g });
  m.box(w * 0.94, 0.2, w, o.fore ?? o.upper, [0, -0.32, 0.01], { grit: g, blood: o.blood });
  if (o.bracer !== undefined) m.box(w * 1.1, 0.13, w * 1.12, o.bracer, [0, -0.33, 0.01], { grit: 0.3 });
  if (o.spikes !== undefined) {
    m.spike([side * w * 0.55, -0.32, 0], [side, 0.25, 0], 0.09, 0.022, o.spikes);
    m.spike([side * w * 0.55, -0.38, -0.03], [side, -0.1, -0.4], 0.07, 0.02, o.spikes);
  }
  m.box(w * 0.98, 0.12, w * 1.05, o.hand ?? o.fore ?? o.upper, [0, -0.46, 0.015], { grit: 0.15 });
}

/** Hanging strips of cloth / leather (loincloth, tabard, torn cape). */
export function strips(m: Mesher, list: [x: number, len: number, z: number][], color: number, top = 0.04, o: PartOpt = {}): void {
  for (const [x, l, z] of list) {
    m.box(0.1, l, 0.014, color, [x, top - l / 2, z], { r: [z > 0 ? 0.08 : -0.12, 0, x * 0.4], grit: 0.3, two: true, ...o });
  }
}

/** Layered shoulder plate with optional spikes. */
export function pauldron(m: Mesher, side: number, at: V3, size: number, c1: number, c2: number, spike?: number): void {
  const [x, y, z] = at;
  m.sph(size, c1, [x, y, z], { s: [1.12, 0.55, 1.08], grit: 0.3 });
  m.sph(size * 0.86, c2, [x + side * size * 0.3, y - size * 0.45, z], { s: [1.08, 0.48, 1.02], grit: 0.3 });
  m.box(size * 1.6, 0.025, 0.03, C.IRON_L, [x, y + size * 0.42, z + size * 0.9], { flat: true });
  if (spike !== undefined) {
    m.spike([x, y + size * 0.4, z], [side * 0.4, 1, 0.05], size * 1.5, size * 0.25, spike);
    m.spike([x + side * size * 0.7, y + size * 0.1, z - size * 0.3], [side * 0.9, 0.6, -0.3], size * 1.1, size * 0.2, spike);
  }
}

/** A belt with a buckle at the front. */
export function belt(m: Mesher, w: number, d: number, y: number, color: number = C.LEATHER, buckle: number = C.IRON_L, skull = false): void {
  m.box(w, 0.08, d, color, [0, y, 0], { grit: 0.2 });
  if (skull) {
    m.sph(0.055, C.BONE, [0, y + 0.01, d / 2 + 0.02], { flat: true });
    m.box(0.05, 0.02, 0.02, C.SOCKET, [0, y + 0.015, d / 2 + 0.07], { flat: true });
  } else m.box(0.08, 0.07, 0.02, buckle, [0, y, d / 2 + 0.01], { flat: true });
}

/** A small hanging trophy skull (belts, staffs, totems). */
export function skull(m: Mesher, at: V3, r = 0.06, bone: number = C.BONE): void {
  m.sph(r, bone, at, { s: [1, 1, 1.1], flat: true });
  m.box(r * 0.55, r * 0.45, r * 0.4, C.SOCKET, [at[0] + r * 0.38, at[1], at[2] + r * 0.85], { flat: true });
  m.box(r * 0.55, r * 0.45, r * 0.4, C.SOCKET, [at[0] - r * 0.38, at[1], at[2] + r * 0.85], { flat: true });
  m.box(r * 0.9, r * 0.45, r * 0.8, bone, [at[0], at[1] - r * 0.8, at[2] + r * 0.4], { flat: true });
}

// ------------------------------------------------------------------ weapons (hand frame: grip at origin, +Z forward)

export function wSword(m: Mesher, o: { len?: number; w?: number; blade?: number; guard?: number; grip?: number; blood?: number; notched?: boolean; curve?: boolean } = {}): void {
  const len = o.len ?? 0.7;
  const w = o.w ?? 0.075;
  const blade = o.blade ?? C.STEEL;
  m.cyl(0.022, 0.022, 0.16, o.grip ?? C.LEATHER, [0, 0, -0.01], { r: [Math.PI / 2, 0, 0] });
  m.sph(0.035, o.guard ?? C.IRON_D, [0, 0, -0.1]);
  m.box(0.22, 0.045, 0.045, o.guard ?? C.IRON_D, [0, 0, 0.08]);
  m.box(w, 0.022, len, blade, [0, 0, 0.1 + len / 2], { grit: 0.25, r: o.curve ? [0, 0.08, 0] : undefined });
  m.box(w * 0.3, 0.026, len * 0.85, C.IRON_L, [0, 0.002, 0.1 + len * 0.45], { flat: true });
  m.box(w * 0.8, 0.024, len * 0.35, blade, [0, 0, 0.1 + len * 0.8], { blood: o.blood ?? 0.5, grit: 0.2 });
  m.spike([0, 0, 0.1 + len], [0, 0, 1], 0.12, w * 0.55, blade, { blood: (o.blood ?? 0.5) * 0.8 });
  if (o.notched) for (const z of [0.3, 0.45, 0.6]) m.box(0.02, 0.028, 0.03, C.SOCKET, [w * 0.45, 0, z * len / 0.7]);
}

export function wAxe(m: Mesher, o: { len?: number; head?: number; haft?: number; double?: boolean; size?: number; blood?: number; spike?: boolean } = {}): void {
  const len = o.len ?? 0.75;
  const s = o.size ?? 1;
  const head = o.head ?? C.IRON;
  m.cyl(0.026, 0.03, len + 0.2, o.haft ?? C.WOOD, [0, 0, len / 2 - 0.05], { r: [Math.PI / 2, 0, 0], grit: 0.25 });
  for (const z of [0.0, 0.08]) m.box(0.065, 0.065, 0.025, C.LEATHER, [0, 0, z]);
  m.push([0, 0, len]);
  // blade flat in the YZ plane (shape x → −z), sticking out below the haft (−Y)
  const blade = (dir: number) => {
    const pts: [number, number][] = [[-0.06, 0.02], [0.06, 0.02], [0.17, -0.2], [0.12, -0.32], [-0.16, -0.32], [-0.13, -0.18]];
    m.poly(pts.map(([x, y]) => [x * s * 1.25, y * s * dir * 1.25] as [number, number]), head, [0, 0, 0], { r: [0, Math.PI / 2, 0], grit: 0.25, blood: o.blood ?? 0.35 }, 0.045);
    m.box(0.05, 0.04, 0.38 * s, C.IRON_L, [0, -0.39 * s * dir, 0.01], { flat: true, blood: (o.blood ?? 0.35) * 0.8 });
  };
  m.box(0.08, 0.13, 0.13, C.IRON_D, [0, 0, 0]);
  blade(1);
  if (o.double) blade(-1);
  else if (o.spike) m.spike([0, 0.05, 0], [0, 1, -0.2], 0.16, 0.03, C.IRON_D);
  m.pop();
}

export function wSpear(m: Mesher, o: { len?: number; tip?: number; haft?: number; blood?: number; barbs?: boolean; tuft?: number } = {}): void {
  const len = o.len ?? 1.3;
  m.cyl(0.022, 0.024, len, o.haft ?? C.WOOD, [0, 0, len / 2 - 0.4], { r: [Math.PI / 2, 0, 0], grit: 0.25 });
  m.push([0, 0, len - 0.4]);
  m.box(0.05, 0.05, 0.08, C.LEATHER, [0, 0, -0.02]);
  m.spike([0, 0, 0.02], [0, 0, 1], 0.28, 0.06, o.tip ?? C.IRON, { blood: o.blood ?? 0.4 }, 4);
  if (o.barbs) for (const s of [-1, 1]) m.spike([s * 0.04, 0, 0.08], [s * 0.6, 0, -1], 0.09, 0.018, o.tip ?? C.IRON);
  if (o.tuft !== undefined) for (let i = 0; i < 4; i++) m.box(0.015, 0.14, 0.015, o.tuft, [(i - 1.5) * 0.02, -0.07, -0.03], { r: [0.3, 0, (i - 1.5) * 0.2], two: true });
  m.pop();
}

export function wClub(m: Mesher, o: { len?: number; head?: number; r?: number; spikes?: number; blood?: number; bone?: boolean } = {}): void {
  const len = o.len ?? 0.62;
  const r = o.r ?? 0.1;
  m.cyl(0.03, 0.035, len, o.bone ? C.BONE : C.WOOD, [0, 0, len / 2 - 0.08], { r: [Math.PI / 2, 0, 0], grit: 0.25 });
  m.sph(r, o.head ?? C.WOOD_D, [0, 0, len], { s: [1, 1, 1.5], grit: 0.3, blood: o.blood ?? 0.3 });
  if (o.spikes !== undefined) for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    m.spike([Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, len + (i % 3 - 1) * r * 0.6], [Math.cos(a), Math.sin(a), (i % 3 - 1) * 0.4], r * 0.9, r * 0.22, o.spikes);
  }
}

export function wMaul(m: Mesher, o: { len?: number; head?: number; w?: number; haft?: number; blood?: number } = {}): void {
  const len = o.len ?? 0.8;
  const w = o.w ?? 0.3;
  m.cyl(0.035, 0.04, len + 0.15, o.haft ?? C.WOOD, [0, 0, len / 2 - 0.05], { r: [Math.PI / 2, 0, 0], grit: 0.25 });
  m.box(w * 1.0, w * 0.75, w * 0.8, o.head ?? 0x6a6660, [0, -0.02, len], { r: [0.15, 0.25, 0.1], grit: 0.35, blood: o.blood ?? 0.25 });
  m.box(w * 0.7, w * 0.6, w * 0.7, o.head ?? 0x6a6660, [w * 0.2, 0.05, len + 0.05], { r: [0.5, 0.8, 0.2], grit: 0.35 });
  for (const z of [len - w * 0.3, len + w * 0.3]) m.box(w * 1.05, 0.04, 0.04, C.LEATHER, [0, 0, z]);
}

export function wDagger(m: Mesher, o: { blade?: number; len?: number; blood?: number } = {}): void {
  wSword(m, { len: o.len ?? 0.28, w: 0.06, blade: o.blade, blood: o.blood ?? 0.6 });
}

export function wHalberd(m: Mesher, o: { len?: number; head?: number; blood?: number } = {}): void {
  const len = o.len ?? 1.4;
  m.cyl(0.024, 0.026, len, C.WOOD, [0, 0, len / 2 - 0.4], { r: [Math.PI / 2, 0, 0], grit: 0.25 });
  m.push([0, 0, len - 0.45]);
  m.spike([0, 0, 0], [0, 0, 1], 0.3, 0.05, o.head ?? C.IRON, { blood: o.blood ?? 0.3 });
  m.poly([[0, 0.05], [0.2, 0.1], [0.24, -0.05], [0.16, -0.22], [0, -0.04]], o.head ?? C.IRON, [0, 0, -0.05], { r: [-Math.PI / 2, Math.PI / 2, 0], blood: o.blood ?? 0.3 }, 0.035);
  m.spike([0, 0.02, -0.08], [0, 1, 0.2], 0.14, 0.025, o.head ?? C.IRON);
  m.pop();
}

/** A staff held upright (+Y) in the hand; the top is built by `top` around (0, len, 0.04). */
export function wStaff(m: Mesher, o: { len?: number; wood?: number; top?: (m: Mesher, at: V3) => void } = {}): void {
  const len = o.len ?? 1.05;
  m.cyl(0.026, 0.032, len + 0.45, o.wood ?? C.WOOD, [0, len / 2 - 0.22, 0.04], { grit: 0.3 });
  for (const y of [0.0, len * 0.55]) m.box(0.07, 0.035, 0.07, C.LEATHER, [0, y, 0.04]);
  o.top?.(m, [0, len, 0.04]);
}

/** A bow held upright in the left-to-right sense (string toward −Z). */
export function wBow(m: Mesher, o: { len?: number; wood?: number; string?: number } = {}): void {
  const len = o.len ?? 1.0;
  const h = len / 2;
  m.push([0, 0, 0.06], [0.55, 0, 0]);
  m.horn([[0, 0, 0], [0, h * 0.5, 0.08], [0, h * 0.9, 0.04], [0, h, -0.06]], 0.028, o.wood ?? C.WOOD, C.HORN);
  m.horn([[0, 0, 0], [0, -h * 0.5, 0.08], [0, -h * 0.9, 0.04], [0, -h, -0.06]], 0.028, o.wood ?? C.WOOD, C.HORN);
  m.box(0.008, len * 0.98, 0.008, o.string ?? 0xb0a888, [0, 0, -0.06], { flat: true });
  m.box(0.05, 0.12, 0.05, C.LEATHER, [0, 0, 0]);
  m.pop();
}

export function wCrossbow(m: Mesher, o: { wood?: number; metal?: number } = {}): void {
  m.box(0.07, 0.07, 0.6, o.wood ?? C.WOOD, [0, 0.02, 0.18], { grit: 0.25 });
  m.push([0, 0.04, 0.44]);
  m.horn([[0, 0, 0], [0.18, 0, -0.04], [0.32, 0, -0.12]], 0.03, o.metal ?? C.IRON_D, C.IRON_D);
  m.horn([[0, 0, 0], [-0.18, 0, -0.04], [-0.32, 0, -0.12]], 0.03, o.metal ?? C.IRON_D, C.IRON_D);
  m.box(0.64, 0.008, 0.008, 0xb0a888, [0, 0, -0.12], { flat: true });
  m.pop();
  m.box(0.02, 0.02, 0.32, C.WOOD_D, [0, 0.07, 0.38]);
  m.spike([0, 0.07, 0.54], [0, 0, 1], 0.06, 0.02, C.IRON);
}

// ------------------------------------------------------------------ shields (left-arm frame)

/** Opens the shield's frame on the left forearm; the shield face is the local +Y side. */
function shieldFrame(m: Mesher, tilt = 1.0): void {
  // shields are drawn ~1.5x so they read as shields from the top-down camera (owner request)
  m.push([0.14, -0.34, 0.1], [0, -0.6, tilt], [DARK_SHIELD_SCALE, DARK_SHIELD_SCALE, DARK_SHIELD_SCALE]);
}

/** Size multiplier for every shield on the dark monster models. */
export const DARK_SHIELD_SCALE = 1.5;

export function shRound(m: Mesher, o: { r?: number; wood?: number; rim?: number; boss?: number; cracked?: boolean; paint?: number; spike?: boolean } = {}): void {
  const r = o.r ?? 0.25;
  shieldFrame(m);
  m.cyl(r, r, 0.04, o.wood ?? 0x3e3226, [0, 0, 0], { grit: 0.3 }, 10);
  if (o.paint !== undefined) m.box(r * 1.6, 0.045, r * 0.35, o.paint, [0, 0.003, 0], { r: [0, 0.6, 0], grit: 0.2 });
  m.ring(r, 0.022, o.rim ?? C.RUST, [0, 0, 0], { grit: 0.35 }, Math.PI * 2, 12);
  m.sph(r * 0.26, o.boss ?? C.IRON, [0, 0.03, 0], { s: [1, 0.6, 1] });
  if (o.spike) m.spike([0, 0.05, 0], [0, 1, 0], r * 0.7, r * 0.12, C.IRON_D);
  if (o.cracked) {
    m.box(0.012, 0.045, r * 1.2, C.SOCKET, [r * 0.15, 0, -r * 0.1], { r: [0, 0.35, 0] });
    m.seg([r * 0.4, 0.02, r * 0.3], [r * 0.6, 0.22, r * 0.45], 0.008, 0.008, C.WOOD_D);
  }
  m.pop();
}

export function shTower(m: Mesher, o: { w?: number; h?: number; face?: number; rim?: number; emblem?: number; spikes?: number } = {}): void {
  const w = o.w ?? 0.42;
  const h = o.h ?? 0.75;
  shieldFrame(m, 1.25);
  m.box(w, 0.045, h, o.face ?? C.IRON_D, [0, 0, 0], { grit: 0.3, blood: 0.05 });
  m.box(w + 0.04, 0.05, 0.04, o.rim ?? C.IRON, [0, 0.005, h / 2]);
  m.box(w + 0.04, 0.05, 0.04, o.rim ?? C.IRON, [0, 0.005, -h / 2]);
  for (const s of [-1, 1]) m.box(0.04, 0.05, h, o.rim ?? C.IRON, [s * w / 2, 0.005, 0]);
  if (o.emblem !== undefined) {
    m.box(w * 0.18, 0.05, h * 0.6, o.emblem, [0, 0.01, 0], { flat: true });
    m.box(w * 0.6, 0.05, h * 0.12, o.emblem, [0, 0.01, h * 0.12], { flat: true });
  }
  if (o.spikes !== undefined) m.spike([0, 0.03, 0], [0, 1, 0], 0.16, 0.04, o.spikes);
  m.pop();
}

export function shKite(m: Mesher, o: { face?: number; rim?: number; emblem?: number } = {}): void {
  shieldFrame(m, 1.15);
  const pts: [number, number][] = [[-0.2, 0.28], [0.2, 0.28], [0.22, 0.05], [0, -0.38], [-0.22, 0.05]];
  m.push([0, 0, 0], [-Math.PI / 2, 0, 0]);
  m.poly(pts, o.face ?? C.IRON_D, [0, 0, 0], { grit: 0.3 });
  m.poly(pts.map(([x, y]) => [x * 0.84, y * 0.86] as [number, number]), o.emblem ?? o.face ?? C.IRON_D, [0, 0, 0.012], { grit: 0.25 });
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    m.seg([a[0], a[1], 0.006], [b[0], b[1], 0.006], 0.018, 0.018, o.rim ?? C.IRON, {}, 4);
  }
  m.pop();
  m.pop();
}

// ------------------------------------------------------------------ faces

export interface FaceOpt {
  skin: number;
  skinD?: number;
  r?: number;
  /** Glowing eyes (in the glow mesh) instead of dark ones. */
  glow?: boolean;
  eye?: number;
  /** Dark sunken eye sockets. */
  sockets?: boolean;
  brow?: number;
  scar?: boolean;
  /** Ears: pointed (elves) or rounded. */
  ears?: 'pointy' | 'round' | 'none';
  beard?: number;
  /** Long beard (dwarves). */
  beardLen?: number;
  hair?: number;
  /** Warpaint / tattoo colour over the eyes. */
  paint?: number;
  mouth?: boolean;
}

/** A grim human-like face facing +Z, head centre at the origin. */
export function face(m: Mesher, o: FaceOpt): void {
  const r = o.r ?? 0.19;
  const sd = o.skinD ?? new THREE.Color(o.skin).multiplyScalar(0.7).getHex();
  m.sph(r, o.skin, [0, 0, 0], { s: [0.95, 1.05, 1], grit: 0.12 });
  m.box(r * 1.15, r * 0.45, r * 0.6, o.skin, [0, -r * 0.55, r * 0.35], { grit: 0.1 }); // jaw
  m.box(r * 1.5, r * 0.22, r * 0.35, o.brow ?? sd, [0, r * 0.28, r * 0.78], { grit: 0.1 }); // brow ridge
  m.box(r * 0.22, r * 0.4, r * 0.3, sd, [0, -r * 0.05, r * 0.95]); // nose
  if (o.paint !== undefined) m.box(r * 1.3, r * 0.22, 0.03, o.paint, [0, r * 0.08, r * 0.88], { flat: true });
  if (o.sockets !== false) {
    m.box(r * 0.42, r * 0.28, 0.04, C.SOCKET, [r * 0.36, r * 0.08, r * 0.9], { flat: true });
    m.box(r * 0.42, r * 0.28, 0.04, C.SOCKET, [-r * 0.36, r * 0.08, r * 0.9], { flat: true });
  }
  if (o.glow) m.eyes(r * 0.36, r * 0.08, r * 0.94, r * 0.38, r * 0.2, 0.25);
  else {
    m.box(r * 0.16, r * 0.16, 0.03, o.eye ?? 0xd8d0c0, [r * 0.36, r * 0.08, r * 0.95], { flat: true });
    m.box(r * 0.16, r * 0.16, 0.03, o.eye ?? 0xd8d0c0, [-r * 0.36, r * 0.08, r * 0.95], { flat: true });
  }
  if (o.mouth !== false) m.box(r * 0.6, r * 0.08, 0.03, C.MOUTH, [0, -r * 0.5, r * 0.92], { flat: true });
  if (o.scar) {
    m.box(r * 0.08, r * 0.9, 0.03, C.SCAR, [r * 0.4, r * 0.05, r * 0.93], { r: [0, 0, 0.35], flat: true });
  }
  if (o.ears === 'pointy') for (const s of [-1, 1]) m.spike([s * r * 0.9, r * 0.05, -r * 0.1], [s, 0.6, -0.35], r * 0.95, r * 0.22, o.skin, {}, 3);
  else if (o.ears !== 'none') for (const s of [-1, 1]) m.sph(r * 0.22, sd, [s * r * 0.95, 0, 0], { s: [0.5, 1, 0.8] });
  if (o.hair !== undefined) m.sph(r * 1.04, o.hair, [0, r * 0.25, -r * 0.12], { s: [1, 0.8, 1.02], grit: 0.3 });
  if (o.beard !== undefined) {
    const bl = o.beardLen ?? 0.6;
    m.box(r * 1.2, r * bl, r * 0.55, o.beard, [0, -r * (0.5 + bl / 2), r * 0.5], { grit: 0.35 });
    m.spike([0, -r * (0.5 + bl), r * 0.55], [0, -1, 0.15], r * bl * 0.8, r * 0.4, o.beard, { grit: 0.35 }, 4);
    m.box(r * 0.5, r * 0.07, 0.03, C.MOUTH, [0, -r * 0.45, r * 0.95], { flat: true });
  }
}

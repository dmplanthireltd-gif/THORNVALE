import * as THREE from 'three';
import { ITEMS, type ItemDef } from '../../game/inventory/items';
import { GRIM_MAT, gearLook, grimColor, MAT, rampOf, type MatKey } from './gearLooks';
import { group, matCache, sbox, scone, scyl, ssphere, type MatFn } from './parts';
import {
  axeBackSpike, axeBlade, axeDims, axeEdge, axeSocket, axeTopSpike, BOW, bowLimb, bowNockX, bowWing, CLUB, CROSSBOW, crossbowBoltHead, crossbowProd, crossbowStock,
  flangeProfile, HAMMER, hammerSpike, HAND, hasBowWings, isRecurve, maceTopSpike, MAUL, MORNING_BALL, poly, ROD, rodCurl, SPEAR, spearHead, STAR_HUB, starPath,
  swordBlade, swordDims, swordGuard, thunderBolt, TUSK_STRAP_Y, tuskPath, WAND, wandProng, type AxeStyle, type Path, type PlanFrame, type SwordStyle,
} from './weaponShapes';
import { buildShieldModel, wornShield } from './shields3d';
import { PAINTED } from '../style';
import type { Detail } from './grimDetail';
import { grimMats } from './gear3d';

/**
 * Hand-held weapon and shield models, built from each item's weapon type and a
 * small colour table. Weapons extend along +Z from the grip so they swing with
 * the arm; shields hang off the left forearm.
 */
export interface Look {
  /** Blade / head colour. */
  c: number;
  /** Guard, binding or trim colour. */
  t?: number;
  /** Emissive glow for enchanted gear. */
  g?: number;
  /** Size multiplier. */
  s?: number;
}

export const LOOKS: Record<string, Look> = {
  short_sword: { c: 0xc9d0da, t: 0x6b7380, s: 0.7 },
  iron_sword: { c: 0xbcd2ee, t: 0x6b7380, s: 0.9 },
  bastard_sword: { c: 0xd8dde6, t: 0xe0b03c, s: 1.05 },
  frostbrand: { c: 0x9fe6ff, t: 0x5fc8f0, g: 0x1c5a78, s: 1.0 },
  ember_blade: { c: 0xff8a3a, t: 0x2a1a14, g: 0x8a2a00, s: 1.05 },
  kings_edge: { c: 0xfff2c0, t: 0xe0b03c, g: 0x806010, s: 1.15 },
  lizard_blade: { c: 0x9ad06a, t: 0x3a5a2a, g: 0x1a3a10, s: 1.05 },
  barbarian_axe: { c: 0xb0b6c0, t: 0x8a5a32, s: 1.05 },
  dwarven_axe: { c: 0xd8c080, t: 0x5a606a, s: 1.1 },
  glacial_cleaver: { c: 0xbfeeff, t: 0x3a6a9a, g: 0x1c5a78, s: 1.2 },
  tusk_club: { c: 0xece2c6, t: 0xd8d0b8, s: 0.95 },
  stone_maul: { c: 0x8a8478, t: 0x5a544a, s: 1.25 },
  sylvan_bow: { c: 0xb0d080, t: 0xf0f0d0, g: 0x203a10, s: 1.05 },
  frostbite_crossbow: { c: 0x9fd8f0, t: 0x3a5a8a, g: 0x1c4a68, s: 1.05 },
  royal_spear: { c: 0xf0d070, t: 0x6a4426, s: 1.05 },
  enchanted_spear: { c: 0x8ad8ff, t: 0x4a3a6a, g: 0x2050a0, s: 1.1 },
  viper_star: { c: 0x6ad040, t: 0x2a4a1a, s: 1.0 },
  shadow_star: { c: 0x3a3048, t: 0xa080d0, g: 0x201030, s: 1.0 },
  hatchet: { c: 0xc9d0da, t: 0x7a5530, s: 0.75 },
  battle_axe: { c: 0xc9d0da, t: 0xa83a2a, s: 1.0 },
  double_axe: { c: 0xd8dde6, t: 0x6b7380, s: 1.2 },
  dragonbone_cleaver: { c: 0xebe1c8, t: 0xb83a2a, s: 1.15 },
  demon_reaver: { c: 0x3a1020, t: 0xd04020, g: 0x6a0a0a, s: 1.3 },
  iron_mace: { c: 0x6b7380, t: 0xc9d0da, s: 0.85 },
  morning_star: { c: 0x5a6270, t: 0xd8dde6, s: 1.0 },
  war_hammer: { c: 0x6b7380, t: 0xc9d0da, s: 1.15 },
  thunder_maul: { c: 0x3a5ad0, t: 0xf0e060, g: 0x2040a0, s: 1.3 },
  hunting_bow: { c: 0x8a5a2c, t: 0xe8e0c6, s: 0.9 },
  // fletching bows (production/fletching.ts)
  longbow: { c: 0x9a6a3a, t: 0xe8e0c6, s: 1.05 },
  pine_shortbow: { c: 0xb08850, t: 0xe8e0c6, s: 0.9 },
  palm_shortbow: { c: 0xc8a870, t: 0xf0e8d0, s: 0.92 },
  teak_shortbow: { c: 0x7a4a28, t: 0xe0c070, s: 0.95 },
  composite_bow: { c: 0x5a3a20, t: 0xc9a04a, s: 1.0 },
  elven_longbow: { c: 0xd8e8b0, t: 0x5ab060, g: 0x204a20, s: 1.15 },
  light_crossbow: { c: 0x8a5a2c, t: 0x9aa0a8, s: 0.9 },
  heavy_crossbow: { c: 0x5a3a20, t: 0x6b7380, s: 1.05 },
  dragonbane_crossbow: { c: 0xa8281f, t: 0xe0b03c, g: 0x5a1008, s: 1.1 },
  spear: { c: 0xc9d0da, t: 0x7a5530, s: 1.0 },
  throwing_star: { c: 0xd8dde6, t: 0x6b7380, s: 1.0 },
  royal_javelin: { c: 0xf0d070, t: 0x6a3a9a, s: 1.1 },
  wand_of_sparks: { c: 0x9a7ae0, t: 0x3a2a4a, g: 0x4a2a90 },
  wand_of_embers: { c: 0xff7a2a, t: 0x3a1a10, g: 0x8a2a00 },
  wand_of_storms: { c: 0x8ad8ff, t: 0x2a2a5a, g: 0x2a5ab0 },
  wand_of_inferno: { c: 0xff4a10, t: 0x1a0a08, g: 0xb02000 },
  rod_of_frost: { c: 0xbff0ff, t: 0x5a7a9a, g: 0x2a6a90 },
  rod_of_thorns: { c: 0x7ad04a, t: 0x5a3a20, g: 0x2a6a10 },
  rod_of_glaciers: { c: 0xe0faff, t: 0x3a5a8a, g: 0x3a80b0 },
  rod_of_wilds: { c: 0x40e070, t: 0x3a2a14, g: 0x10803a },
  // smithed at an anvil (blacksmithing)
  bronze_dagger: { c: 0xc8843a, t: 0x6a4426, s: 0.5 },
  iron_dagger: { c: 0x9aa0aa, t: 0x5a3a20, s: 0.52 },
  steel_dagger: { c: 0xd8dde6, t: 0x4a4e56, s: 0.55 },
  starsteel_dagger: { c: 0x6a9ae8, t: 0x2a3a6a, g: 0x0a1a40, s: 0.58 },
  darkstone_dagger: { c: 0x4a2a5a, t: 0x1a1020, g: 0x200a30, s: 0.6 },
  bronze_mace: { c: 0xc8843a, t: 0x7a5530, s: 0.8 },
  starsteel_sword: { c: 0x6a9ae8, t: 0xc9d0da, g: 0x0a1a40, s: 1.05 },
  starsteel_axe: { c: 0x6a9ae8, t: 0x4a4e56, g: 0x0a1a40, s: 1.05 },
  starsteel_mace: { c: 0x5a8ad8, t: 0xc9d0da, g: 0x0a1a40, s: 1.05 },
  darkstone_sword: { c: 0x4a2a5a, t: 0x8a6aa0, g: 0x200a30, s: 1.12 },
  darkstone_axe: { c: 0x4a2a5a, t: 0x2a2028, g: 0x200a30, s: 1.12 },
  darkstone_mace: { c: 0x3a2048, t: 0x8a6aa0, g: 0x200a30, s: 1.12 },
  // boss uniques
  ashanvil_hammer: { c: 0x4a4038, t: 0xff8a2a, g: 0x5a1a00, s: 1.1 },
  oracle_rod: { c: 0x6aff4a, t: 0x2a4a1a, g: 0x1a6a10 },
  hundred_fang_bow: { c: 0x1a4a3a, t: 0xe8e0c6, g: 0x0a2a20, s: 1.15 },
  hrimgaard_fang: { c: 0xe0f4ff, t: 0x6ab0ff, g: 0x2a6aa0, s: 1.15 },
  sovereign_wand: { c: 0x2a2a2a, t: 0xffb020, g: 0xa02000 },
  colossus_maul: { c: 0x7a7468, t: 0xe0b03c, g: 0x2a2010, s: 1.4 },
  stormcoil_wand: { c: 0x9a8aff, t: 0x2a2a6a, g: 0x4040c0 },
  broodmother_crossbow: { c: 0x3a4a1a, t: 0x9aff3a, g: 0x1a3a08, s: 1.1 },
};

export type WeaponStyle =
  | 'dagger' | 'short' | 'long' | 'broad' | 'great' | 'curved'
  | 'hatchet' | 'battle' | 'double' | 'cleaver'
  | 'flanged' | 'morning' | 'hammer' | 'maul' | 'tusk' | 'plain';

/** Silhouette family of a weapon (shared by the icon and the 3D model). */
export function weaponStyle(d: ItemDef): WeaponStyle {
  const id = d.id;
  switch (d.weaponType) {
    case 'sword':
      if (id.endsWith('_dagger')) return 'dagger';
      if (id === 'short_sword') return 'short';
      if (id === 'lizard_blade') return 'curved';
      if (id === 'bastard_sword' || id === 'kings_edge' || id === 'vow_blade') return 'broad';
      return d.twoHanded ? 'great' : 'long';
    case 'axe':
      if (id === 'hatchet') return 'hatchet';
      if (id === 'double_axe' || id === 'demon_reaver') return 'double';
      if (id === 'glacial_cleaver' || id === 'dragonbone_cleaver') return 'cleaver';
      return 'battle';
    case 'club':
      if (id === 'morning_star') return 'morning';
      if (id === 'tusk_club') return 'tusk';
      if (id === 'war_hammer' || id === 'thunder_maul') return 'hammer';
      if (id === 'stone_maul' || id === 'wardbreaker_maul') return 'maul';
      if (id.endsWith('_hammer')) return 'hammer';
      if (id.endsWith('_maul')) return 'maul';
      return 'flanged';
    default:
      return 'plain';
  }
}

/** Weapon material ramps: the set/metal look, or the old single colours. */
function weaponLook(d: ItemDef, l: Look): { blade: number; hi: number; lo: number; trim: number; trimHi: number; glow?: number; gem?: number } {
  const lk = gearLook(d, l.c, l.t);
  const metal = !!d.setId || /^(bronze|iron|steel|starsteel|darkstone|moonsilver|gilded|bone)_/.test(d.id);
  const blade = metal ? lk.m[1] : l.c;
  const trim = l.t ?? lk.t[1];
  const c = { blade, hi: metal ? lk.m[0] : rampOf(l.c)[0], lo: metal ? lk.m[2] : rampOf(l.c)[2], trim, trimHi: rampOf(trim)[0], glow: l.g ?? lk.glow, gem: lk.gem ?? (l.g ? l.c : undefined) };
  if (!PAINTED) return c;
  // painted style: the grim palette; the blade loses its glow (a lit part gets no worn detail),
  // enchanted weapons keep a glowing stone instead
  return { blade: grim(c.blade), hi: grim(c.hi), lo: grim(c.lo), trim: grim(c.trim), trimHi: grim(c.trimHi), glow: undefined, gem: c.gem !== undefined ? grimColor(c.gem, 0.15, 0.9) : c.glow !== undefined ? grimColor(l.c, 0.15, 0.9) : undefined };
}

// ------------------------------------------------------------------ painted style: grim weapons

/** MAT colours become their GRIM_MAT twins; any other colour is dulled. */
const GRIM_OF = new Map<number, number>();
for (const k of Object.keys(MAT) as MatKey[]) MAT[k].forEach((c, i) => { if (!GRIM_OF.has(c)) GRIM_OF.set(c, GRIM_MAT[k][i]); });
const grim = (c: number): number => GRIM_OF.get(c) ?? grimColor(c, 0.35, 0.85);

/** Painted style: tags a part with its atlas surface (notched bloody blade, wood, leather, iron, gilt). */
function T<O extends THREE.Object3D>(o: O, d: Detail): O {
  if (PAINTED) o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.userData.detail = d; });
  return o;
}
/** Gold-coloured fittings get tarnished gilt, the rest pitted iron. */
function metalSurface(c: number): Detail {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return r > b + 30 && g > b + 10 ? 'gilt' : 'iron';
}
/** A grip wrapped in leather bands (painted extras), along +z from z0 to z1. */
function wrap(M: MatFn, z0: number, z1: number, r: number, n = 3): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const m = M(0x2a1c12);
  for (let i = 0; i < n; i++) out.push(T(X(scyl(r, r, 0.022, m, 0, 0, z0 + ((i + 0.5) / n) * (z1 - z0), 6)), 'leather'));
  return out;
}
const stud = (m: THREE.Material, x: number, y: number, z: number, r = 0.018) => ssphere(r, m, x, y, z, 1, 1, 1, 0);

const X = (o: THREE.Mesh) => { o.rotation.x = Math.PI / 2; return o; };

// ------------------------------------------------------------------ the shared drawing in 3D

/**
 * Builds weapon parts from the icon's own outlines (weaponShapes.ts): icon units map to
 * metres with the hand at the origin, the tip along +z, the icon's x along x (widened by
 * WIDE — the icon is drawn a little chunkier still, see gearIcons `tilted`). Flat parts
 * are extruded along y (the side the camera sees), hafts are cylinders, curves are tubes.
 * Geometries are cached per outline and shared by every character (never mutated).
 */
const WIDE = 1.2;
/** The side the camera sees of a held weapon (local −y): studs, gems and bolts go here. */
const FRONT = -1;
const extrudeCache = new Map<string, THREE.BufferGeometry>();

class Shaper {
  constructor(private readonly f: PlanFrame) {}
  /** Metres along x / z of an icon point. */
  X(x: number): number { return (x - this.f.hx) * this.f.k * WIDE; }
  Z(y: number): number { return (this.f.hy - y) * this.f.k; }
  /** Metres for an icon length across (x) or along (y). */
  w(u: number): number { return u * this.f.k * WIDE; }
  l(u: number): number { return u * this.f.k; }

  private shape(p: Path): THREE.Shape {
    const s = new THREE.Shape();
    for (const c of p) {
      if (c[0] === 'M') s.moveTo(this.X(c[1]), this.Z(c[2]));
      else if (c[0] === 'L') s.lineTo(this.X(c[1]), this.Z(c[2]));
      else if (c[0] === 'Q') s.quadraticCurveTo(this.X(c[1]), this.Z(c[2]), this.X(c[3]), this.Z(c[4]));
    }
    return s;
  }

  /** An outline extruded `depth` metres thick (centred on y = 0), with an optional bevelled edge. */
  ext(p: Path, depth: number, m: THREE.Material, bevel = 0): THREE.Mesh {
    const key = `${JSON.stringify(p)}|${this.f.hx},${this.f.hy},${r4(this.f.k)}|${r4(depth)},${r4(bevel)}`;
    let g = extrudeCache.get(key);
    if (!g) {
      const geo = new THREE.ExtrudeGeometry(this.shape(p), {
        depth: Math.max(0.002, depth - bevel * 2), curveSegments: 6, steps: 1,
        bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelOffset: -bevel * 0.8, bevelSegments: 1,
      });
      geo.translate(0, 0, -(depth - bevel * 2) / 2);
      geo.rotateX(Math.PI / 2);
      g = boxUV(geo);
      extrudeCache.set(key, g);
    }
    return meshOf(g, m);
  }

  /** A tube of radius r (metres) along a centre line. */
  tube(p: Path, r: number, m: THREE.Material): THREE.Mesh {
    const key = `T${JSON.stringify(p)}|${this.f.hx},${this.f.hy},${r4(this.f.k)}|${r4(r)}`;
    let g = extrudeCache.get(key);
    if (!g) {
      const path = new THREE.CurvePath<THREE.Vector3>();
      let cx = 0, cz = 0;
      const v = (x: number, y: number) => new THREE.Vector3(this.X(x), 0, this.Z(y));
      for (const c of p) {
        if (c[0] === 'M') { cx = c[1]; cz = c[2]; } else if (c[0] === 'L') { path.add(new THREE.LineCurve3(v(cx, cz), v(c[1], c[2]))); cx = c[1]; cz = c[2]; } else if (c[0] === 'Q') { path.add(new THREE.QuadraticBezierCurve3(v(cx, cz), v(c[1], c[2]), v(c[3], c[4]))); cx = c[3]; cz = c[4]; }
      }
      g = new THREE.TubeGeometry(path, 8 * path.curves.length, r, 5, false);
      extrudeCache.set(key, g);
    }
    return meshOf(g, m);
  }

  /** A cylinder along the weapon from icon y0 to y1 at icon x, radius r metres (r1 at y1). */
  rod(x: number, y0: number, y1: number, r: number, m: THREE.Material, r1 = r, seg = 6): THREE.Mesh {
    const z0 = this.Z(y0), z1 = this.Z(y1);
    // scyl's +y end is rt: point it at y0
    return X(scyl(r, r1, Math.abs(z1 - z0), m, this.X(x), 0, (z0 + z1) / 2, seg));
  }

  /** A ball at an icon point, radius r metres. */
  ball(x: number, y: number, r: number, m: THREE.Material, sy = 1, detail = 1): THREE.Mesh {
    return ssphere(r, m, this.X(x), 0, this.Z(y), 1, sy, 1, detail);
  }

  /** A box over an icon rectangle, `depth` metres thick. */
  box(x0: number, y0: number, x1: number, y1: number, depth: number, m: THREE.Material): THREE.Mesh {
    return sbox(Math.abs(this.X(x1) - this.X(x0)), depth, Math.abs(this.Z(y1) - this.Z(y0)), m, (this.X(x0) + this.X(x1)) / 2, 0, (this.Z(y0) + this.Z(y1)) / 2);
  }
}

/** A colour scaled toward black. */
const dim = (c: number, k: number): number => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function meshOf(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

/** UVs 0–1 over the part's x (across) and z (along), so the painted atlas maps along blades. */
function boxUV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const sx = Math.max(1e-4, bb.max.x - bb.min.x), sz = Math.max(1e-4, bb.max.z - bb.min.z);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - bb.min.x) / sx;
    uv[i * 2 + 1] = (pos.getZ(i) - bb.min.z) / sz;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Legendary tinted swords carry runes down the blade (icon and model). */
export const swordRunes = (d: ItemDef): boolean => !!d.tint && d.rarity === 'legendary';
/** Swords with a gem set in the guard (icon and model). */
export const swordGem = (d: ItemDef): boolean => d.rarity !== 'common' || !!d.setId;

function sword(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const st = weaponStyle(d) as SwordStyle;
  const D = swordDims(st);
  const s = l.s ?? (st === 'dagger' ? 0.55 : st === 'short' ? 0.75 : st === 'great' ? 1.25 : 1);
  // the old model's reach from the hand to the tip, spread over the icon's proportions
  const reach = 0.26 + 0.78 * s;
  const h = HAND.sword(D);
  const S = new Shaper({ ...h, k: reach / (h.hy - D.tip) });
  const c = weaponLook(d, l);
  const blade = M(c.blade, c.glow);
  const guard = M(c.trim);
  const gs = metalSurface(c.trim);
  const thick = S.w(D.w) * 0.2;
  const g = group(0, 0, 0,
    T(S.ext(swordBlade(D, st), thick, blade, thick * 0.4), 'blade'),
    T(S.ext(swordGuard(D), S.w(1.9), guard, S.w(0.3)), gs),
    T(S.rod(0, D.gripY0 - 0.6, D.gripY1, S.w(D.gripW / 2), M(d.rarity === 'legendary' ? MAT.darkleather[1] : MAT.leather[1])), 'leather'),
    T(S.ball(0, D.pommelY, S.w(D.pommelR) * 0.95, guard), gs),
  );
  // the fuller: a darker groove down the middle of a straight blade
  if (st !== 'curved') g.add(T(S.box(-0.45, D.tip + D.len * 0.35, 0.45, D.guardY - 1, thick * 1.05, M(c.lo, c.glow)), 'blade'));
  if (swordRunes(d)) for (let i = 0; i < 4; i++) g.add(S.box(-0.5, D.guardY - 4 - i * 3, 0.5, D.guardY - 2.6 - i * 3, thick * 1.15, M(c.trimHi, c.trimHi)));
  if (c.gem && swordGem(d)) g.add(S.ball(0, D.guardY - 0.4, S.w(1.1), M(c.gem, c.gem), 1, 0));
  if (PAINTED) {
    // leather bands round the grip, a peened pommel nut and a nick out of the edge
    const z0 = S.Z(D.gripY1), z1 = S.Z(D.gripY0);
    g.add(...wrap(M, z0, z1, S.w(D.gripW / 2) + 0.004, D.gripY1 - D.gripY0 > 7 ? 4 : 3));
    g.add(T(S.rod(0, D.pommelY + D.pommelR * 0.7, D.pommelY + D.pommelR * 1.3, S.w(0.6), guard), gs));
    g.add(T(S.box(D.w / 2 - 0.7, D.guardY - D.len * 0.55, D.w / 2 + 0.1, D.guardY - D.len * 0.55 + 1.2, thick * 1.2, M(0x16100c)), 'iron'));
  }
  return g;
}

function axe(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const st = weaponStyle(d) as AxeStyle;
  const D = axeDims(st);
  const s = l.s ?? 1;
  // the old model's reach from the hand to the head, spread over the icon's proportions
  const reach = 0.62 + 0.3 * s - 0.25 + (D.small ? 0.04 : 0);
  const h = HAND.axe(D);
  const S = new Shaper({ ...h, k: reach / (h.hy - D.hy) });
  const c = weaponLook(d, l);
  const head = M(c.blade, c.glow);
  const edge = M(c.hi, c.glow);
  const trim = M(c.trim);
  const ts = metalSurface(c.trim);
  const thick = S.w(1.4);
  const g = group(0, 0, 0,
    T(S.rod(0, D.top, D.bottom, S.w(1.2), M(d.id === 'demon_reaver' ? MAT.hell[1] : MAT.wood[1])), 'wood'),
    T(S.rod(0, D.gripY0, D.gripY1, S.w(1.3) + 0.004, M(MAT.leather[2])), 'leather'),
  );
  const blade = (side: number) => {
    g.add(T(S.ext(axeBlade(D, st, side), thick, head, thick * 0.35), st === 'cleaver' ? 'blade' : 'iron'));
    // the bright, honed edge
    if (st === 'cleaver') g.add(T(S.ext(poly([side * 8, D.hy - 8.8, side * 8.5, D.hy - 9, side * 9.2, D.hy + 6, side * 8.7, D.hy + 5.8]), thick * 1.05, edge), 'blade'));
    else g.add(T(S.tube(axeEdge(D, side), S.w(0.6), edge), 'blade'));
  };
  blade(1);
  if (st === 'double') blade(-1);
  else if (st === 'battle') g.add(T(S.ext(axeBackSpike(D), thick * 1.2, head, thick * 0.4), 'iron'));
  g.add(T(S.ext(axeSocket(D), S.w(3.4), trim, S.w(0.3)), ts));
  g.add(T(S.ball(0, D.hy - 0.4, S.w(0.8), trim, 1, 0), ts));
  if (!D.small) g.add(T(S.ext(axeTopSpike(D), S.w(1.6), head, S.w(0.3)), 'iron'));
  if (c.gem && d.rarity !== 'common') g.add(S.ball(0, D.hy + 4, S.w(1.05), M(c.gem, c.gem), 1, 0));
  if (PAINTED) {
    // iron wedge rivets through the socket, leather wraps up the haft
    const iron = M(MAT.iron[2]);
    for (const sy of [-1, 1]) g.add(T(stud(iron, S.X(-1.3), sy * S.w(1.7), S.Z(D.hy + 1.5)), 'iron'), T(stud(iron, S.X(1.3), sy * S.w(1.7), S.Z(D.hy + 1.5)), 'iron'));
    g.add(...wrap(M, S.Z(D.gripY1), S.Z(D.gripY0), S.w(1.3) + 0.006, 3), ...wrap(M, S.Z(D.hy + 9), S.Z(D.hy + 5), S.w(1.2) + 0.004, 2));
  }
  return g;
}

function club(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const st = weaponStyle(d);
  const s = l.s ?? 1;
  const reach = 0.37 + 0.3 * s;
  const S = new Shaper({ ...HAND.club, k: reach / (HAND.club.hy - CLUB.headY) });
  const c = weaponLook(d, l);
  const head = M(c.blade, c.glow);
  const trim = M(c.trim);
  const metalHaft = st === 'flanged' && d.rarity !== 'common';
  const g = group(0, 0, 0,
    T(S.rod(0, CLUB.haftTop, CLUB.haftBottom - 1, S.w(1.2), metalHaft ? trim : M(MAT.wood[1])), metalHaft ? 'iron' : 'wood'),
    T(S.rod(0, CLUB.gripY0, CLUB.gripY1, S.w(1.3) + 0.004, M(MAT.leather[2])), 'leather'),
    T(S.ball(0, CLUB.pommelY, S.w(CLUB.pommelR), trim), 'iron'),
  );
  switch (st) {
    case 'hammer': {
      const H = HAMMER;
      const deep = S.w(H.y1 - H.y0) * 0.85;
      g.add(S.box(H.x0, H.y0, H.faceX0, H.y1, deep, head));
      g.add(S.box(H.faceX0, H.faceY0, H.faceX1, H.faceY1, deep * 1.12, trim));
      g.add(S.ext(hammerSpike, deep * 0.55, trim, deep * 0.15));
      if (d.id === 'thunder_maul') g.add(S.ext(thunderBolt, deep * 1.06, M(0xfff27a, 0xc0a020)));
      if (PAINTED) {
        const iron = M(MAT.iron[2]);
        for (const [x, y] of [[0.2, -15.8], [4.6, -15.8], [0.2, -10.7], [4.6, -10.7]]) g.add(stud(iron, S.X(x), FRONT * deep / 2, S.Z(y), 0.016));
      }
      break;
    }
    case 'maul': {
      const U = MAUL;
      const deep = S.w(U.y1 - U.y0) * 0.8;
      g.add(S.box(U.x0, U.y0, U.x1, U.y1, deep, d.id === 'stone_maul' ? M(MAT.iron[1]) : head));
      if (d.id !== 'stone_maul') {
        for (const y of U.bands) g.add(S.box(U.x0 - 0.15, y - 0.7, U.x1 + 0.15, y + 0.7, deep * 1.06, trim));
        for (const [x, y] of U.rivets) g.add(S.ball(x, y, S.w(0.8), trim, 1, 0).translateY(FRONT * deep * 0.53));
      }
      if (d.setId === 'wardbreaker') g.add(S.ball(0, -14.5, S.w(1.5), M(c.gem ?? 0xff9a2a, c.gem ?? 0xff9a2a), 0.6, 0).translateY(FRONT * deep * 0.55));
      else if (c.gem && d.rarity === 'legendary') g.add(S.ball(0, -14.5, S.w(1.3), M(c.gem, c.gem), 0.6, 0).translateY(FRONT * deep * 0.55));
      break;
    }
    case 'tusk':
      g.add(T(S.ext(tuskPath, S.w(3.6), M(MAT.bone[1]), S.w(1.2)), 'bone'));
      g.add(T(S.rod(0, TUSK_STRAP_Y - 0.9, TUSK_STRAP_Y + 0.9, S.w(2.3), M(MAT.leather[1]), S.w(2.3), 8), 'leather'));
      break;
    case 'morning': {
      const B = MORNING_BALL;
      g.add(S.ball(0, B.y, S.w(B.r), head));
      // ten spikes round the face (as the icon), six more front and back
      const spike = M(c.trim);
      const cy = S.Z(B.y);
      const R = S.w(B.r) * 0.85, len = S.w(B.spikeR - B.r * 0.85);
      const add = (dir: THREE.Vector3) => {
        const k = scone(S.w(1.35), len, spike, dir.x * (R + len / 2), dir.y * (R + len / 2), cy + dir.z * (R + len / 2), 5);
        k.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        g.add(k);
      };
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; add(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a))); }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; add(new THREE.Vector3(Math.cos(a) * 0.55, i % 2 ? 0.83 : -0.83, Math.sin(a) * 0.55).normalize()); }
      break;
    }
    default: {
      // flanged mace: six flanges round the haft, a top spike and a collar
      g.add(S.rod(0, -20, -6.8, S.w(3), head, S.w(3), 8));
      for (let i = 0; i < 8; i++) {
        // alternate flanges in the blade's shadow tone, so the ridges read like the icon's lit and shaded flanges
        const f = S.ext(flangeProfile, S.w(1.2), i % 2 ? M(c.lo, c.glow) : head, S.w(0.25));
        f.rotation.z = ((i + 0.5) / 8) * Math.PI * 2; // none straight at the camera: the gem shows between
        g.add(f);
      }
      g.add(S.ext(maceTopSpike, S.w(1.6), trim, S.w(0.3)), S.rod(0, -7.5, -5.5, S.w(2), trim, S.w(2), 8));
    }
  }
  if (c.gem && st !== 'hammer' && st !== 'maul' && st !== 'tusk' && d.rarity !== 'common') {
    const y = st === 'morning' ? -12 : -13;
    const r = st === 'morning' ? S.w(MORNING_BALL.r) : S.w(3.2);
    for (const side of [-1, 1]) g.add(S.ball(0, y, S.w(1.3), M(c.gem, c.gem), 0.6, 0).translateY(side * r));
  }
  return clubDone(g);
}

/** Painted style: every club part not tagged yet is pitted iron. */
function clubDone(g: THREE.Group): THREE.Group {
  if (PAINTED) g.traverse((c) => { if ((c as THREE.Mesh).isMesh && !c.userData.detail) c.userData.detail = 'iron'; });
  return g;
}

function bow(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const s = l.s ?? 1;
  const c = weaponLook(d, l);
  const recurve = isRecurve(d);
  // nock to nock as tall as the old bow; held at the grip, the stave hangs beside the leg so its curve shows
  const S = new Shaper({ ...HAND.bow, k: (0.873 * s) / 41 });
  const wood = M(d.setId === 'skyfeather' ? MAT.sky[1] : c.blade, c.glow);
  const trim = M(c.trim);
  const g = group(0, 0, 0,
    T(S.tube(bowLimb(recurve), S.w(1.75), wood), 'wood'),
    S.rod(BOW.stringX, -BOW.stringY, BOW.stringY, 0.005, M(MAT.cloth[0]), 0.005, 4),
    T(S.box(BOW.gripX0, BOW.gripY0, BOW.gripX1, BOW.gripY1, S.w(3.2), M(MAT.leather[1])), 'leather'),
  );
  const nx = bowNockX(recurve);
  for (const sy of [-1, 1]) g.add(T(S.ball(nx, sy * 20.5, S.w(BOW.nockR), trim, 1, 0), metalSurface(c.trim)));
  if (hasBowWings(d)) for (const sy of [-1, 1]) g.add(S.ext(bowWing(sy), S.w(0.8), M(d.setId === 'skyfeather' ? MAT.sky[0] : c.trim, c.glow), S.w(0.2)));
  if (c.gem && d.rarity !== 'common') g.add(S.ball(BOW.gemX, 0, S.w(1.3), M(c.gem, c.gem), 1, 0).translateY(FRONT * S.w(1.7)));
  if (PAINTED) {
    // sinew wrapped above and below the hand
    const sinew = M(0x3a2a1a);
    g.add(T(S.box(BOW.gripX0 - 0.2, -4.4, BOW.gripX1 + 0.2, -3, S.w(3.5), sinew), 'leather'), T(S.box(BOW.gripX0 - 0.2, 3, BOW.gripX1 + 0.2, 4.4, S.w(3.5), sinew), 'leather'));
  }
  return g;
}

function crossbow(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const s = l.s ?? 1;
  const c = weaponLook(d, l);
  const C = CROSSBOW;
  const S = new Shaper({ ...HAND.crossbow, k: (0.7 * s) / 33 });
  const deep = S.w(3.4);
  const metal = M(c.trim);
  const string = M(MAT.cloth[0]);
  const g = group(0, 0, 0,
    T(S.ext(crossbowStock, deep, M(c.blade, c.glow), S.w(0.4)), 'wood'),
    T(S.tube(crossbowProd, S.w(1.25), metal), 'iron'),
    S.tube([['M', -11, -7], ['L', 0, C.stringTo]], 0.005, string), S.tube([['M', 11, -7], ['L', 0, C.stringTo]], 0.005, string),
    S.rod(0, C.boltY0 + 1, C.boltY1, S.w(0.5), M(0x7a6050)).translateY(FRONT * deep / 2),
    T(S.ext(crossbowBoltHead, S.w(1), M(MAT.steel[1]), S.w(0.2)), 'blade').translateY(FRONT * deep / 2),
    T(S.box(-2.4, C.latchY0, 2.4, C.latchY1, deep * 1.15, metal), 'iron'),
    T(S.tube([['M', 1.5, 5], ['L', 3.4, 8]], S.w(0.45), metal), 'iron'),
  );
  if (c.gem && d.rarity !== 'common') g.add(S.ball(0, C.gemY, S.w(1.2), M(c.gem, c.gem), 1, 0).translateY(FRONT * deep / 2));
  if (PAINTED) {
    // iron strapping on the stock, rivets on the prod
    const iron = M(MAT.iron[2]);
    g.add(T(S.box(-2.3, 13, 2.3, 14.2, deep * 1.1, iron), 'iron'), T(S.box(-2, -4, 2, -2.8, deep * 1.1, iron), 'iron'));
    for (const sx of [-1, 1]) g.add(T(S.ball(sx * 7, -9.3, 0.015, iron, 1, 0), 'iron'));
  }
  return g;
}

function throwing(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const c = weaponLook(d, l);
  const head = M(c.blade, c.glow);
  if (d.id.endsWith('_star')) {
    const S = new Shaper({ ...HAND.star, k: 0.011 * (l.s ?? 1) });
    const t = S.w(1.2);
    const g = group(0, 0, 0, T(S.ext(starPath, t, head, t * 0.4), 'blade'));
    const hub = scyl(S.w(STAR_HUB), S.w(STAR_HUB), t * 1.3, M(c.trim), 0, 0, S.Z(0), 8);
    g.add(T(hub, 'iron'), scyl(S.w(1), S.w(1), t * 1.4, M(0x160f0a), 0, 0, S.Z(0), 6));
    return g;
  }
  const S = new Shaper({ ...HAND.spear, k: (1.32 * (l.s ?? 1)) / 41.5 });
  const royal = d.id === 'royal_spear' || d.id === 'royal_javelin';
  const g = group(0, 0, 0,
    T(S.rod(0, SPEAR.shaftY0, SPEAR.shaftY1, S.w(SPEAR.shaftW / 2), M(PAINTED ? grim(l.t ?? 0x7a5530) : l.t ?? 0x7a5530)), 'wood'),
    T(S.ext(spearHead, S.w(1.5), head, S.w(0.5)), 'blade'),
    T(S.rod(0, SPEAR.strapY - 0.9, SPEAR.strapY + 0.9, S.w(1.6), M(royal ? MAT.gold[1] : MAT.leather[1])), royal ? 'gilt' : 'leather'),
  );
  if (PAINTED) g.add(...wrap(M, S.Z(SPEAR.shaftY1 - 1), S.Z(11), S.w(1) + 0.004, 3)); // grip wraps
  return g;
}

function wand(l: Look, M: MatFn, staff: boolean): THREE.Group {
  // painted style: a dark, gnarled shaft of the old colour, tarnished fittings; the orb keeps its glow
  const shaft = M(PAINTED ? grim(l.t ?? 0x3a2a4a) : l.t ?? 0x3a2a4a);
  // the orb glows in its own colour; a dark orb (the Ashen Sovereign's) only smoulders with its glow colour
  const lum = (((l.c >> 16) & 255) * 0.3 + ((l.c >> 8) & 255) * 0.55 + (l.c & 255) * 0.15) / 255;
  const orb = M(l.c, lum < 0.25 ? dim(l.g ?? 0x404040, 0.45) : l.g ?? 0x404040);
  const gold = M(MAT.gold[1]);
  if (!staff) {
    const S = new Shaper({ ...HAND.wand, k: 0.018 });
    const g = group(0, 0, 0,
      T(S.rod(0, WAND.top, WAND.bottom, S.w(WAND.wTop), shaft, S.w(WAND.wBottom)), 'wood'),
      S.ball(0, WAND.orbY, S.w(WAND.orbR), orb, 1, 1),
    );
    for (const y of WAND.rings) g.add(T(S.rod(0, y, y + WAND.ringH, S.w(WAND.ringW), gold, S.w(WAND.ringW), 8), 'gilt'));
    for (const sd of [-1, 1]) g.add(T(S.ext(wandProng(sd), S.w(1.2), gold, S.w(0.25)), 'gilt'));
    if (PAINTED) g.add(...wrap(M, S.Z(WAND.bottom - 1), S.Z(WAND.rings[1] + 2), S.w(1.1) + 0.004, 3));
    return g;
  }
  const S = new Shaper({ ...HAND.rod, k: 0.028 });
  const g = group(0, 0, 0,
    T(S.rod(0, ROD.top, ROD.bottom, S.w(1.4), shaft, S.w(1.1)), 'wood'),
    S.ball(0, ROD.orbY, S.w(ROD.orbR), orb, 1, 1),
  );
  for (const sd of [-1, 1]) g.add(T(S.tube(rodCurl(sd), S.w(0.75), shaft), 'wood'));
  if (PAINTED) {
    // leather wraps and a hanging charm: a bone and two beads on a thong below the head
    g.add(...wrap(M, S.Z(17), S.Z(9), S.w(1.4) + 0.004, 3), ...wrap(M, S.Z(-8), S.Z(-11), S.w(1.4) + 0.003, 2));
    const thong = M(0x2a1c12);
    const z = S.Z(-10);
    g.add(T(sbox(0.008, 0.16, 0.008, thong, 0.04, -0.08, z), 'leather'), T(ssphere(0.02, M(MAT.bone[1]), 0.04, -0.17, z, 0.7, 1.5, 0.7, 0), 'bone'), T(ssphere(0.016, M(MAT.bone[2]), 0.04, -0.12, z, 1, 1, 1, 0), 'bone'));
    for (let i = 0; i < 3; i++) g.add(T(S.rod(0, -14.4 + i * 0.5, -14 + i * 0.5, S.w(1.6), gold, S.w(1.6)), 'gilt'));
  }
  return g;
}

export function makeWeapon(id: string | null, M0: MatFn = matCache()): THREE.Group | null {
  if (!id) return null;
  const M = grimMats(M0);
  const d = ITEMS[id];
  if (!d?.weaponType) return null;
  const l = LOOKS[id] ?? { c: 0xc9d0da };
  switch (d.weaponType) {
    case 'sword': return sword(d, l, M);
    case 'axe': return axe(d, l, M);
    case 'club': return club(d, l, M);
    case 'bow': return bow(d, l, M);
    case 'crossbow': return crossbow(d, l, M);
    case 'throwing': return throwing(d, l, M);
    case 'wand': return wand(l, M, false);
    case 'rod': return wand(l, M, true);
  }
}

export const SHIELDS: Record<string, { face: number; rim: number; shape: 'round' | 'kite' | 'tower' | 'book'; glow?: number; boss?: number }> = {
  wooden_shield: { face: 0x8a5a2c, rim: 0x6b7380, shape: 'round', boss: 0xc9d0da },
  iron_shield: { face: 0x2c4f9e, rim: 0xc9d0da, shape: 'kite', boss: 0xe0b03c },
  tower_shield: { face: 0x8a8f9a, rim: 0x4a505a, shape: 'tower', boss: 0xc9d0da },
  dragon_shield: { face: 0x3f9a52, rim: 0xe0b03c, shape: 'kite', boss: 0x2f7a3e },
  elven_aegis: { face: 0xd8e8c0, rim: 0x4a9a5a, shape: 'kite', boss: 0x7ad08a, glow: 0x1a3a1a },
  demon_shield: { face: 0x5a1010, rim: 0x2a1a1a, shape: 'tower', boss: 0xd04020, glow: 0x300000 },
  mountainheart_shield: { face: 0x6a6a5a, rim: 0xe0b03c, shape: 'tower', boss: 0xc0a060, glow: 0x201808 },
  apprentice_book: { face: 0x6a3a8a, rim: 0xe0b03c, shape: 'book' },
  dwarven_shield: { face: 0x8a6a3a, rim: 0xc9a04a, shape: 'round', boss: 0xd8c080 },
  scarab_shield: { face: 0x2a8a6a, rim: 0xd0a030, shape: 'kite', boss: 0x40c0a0 },
  frostscale_shield: { face: 0xbfe6f5, rim: 0x5a8ab0, shape: 'kite', boss: 0x9fe6ff, glow: 0x0a2a3a },
  storm_tome: { face: 0x2a3a8a, rim: 0x8ad8ff, shape: 'book', glow: 0x102050 },
  bronze_shield: { face: 0xc8843a, rim: 0x7a5530, shape: 'round', boss: 0xe0a860 },
  steel_shield: { face: 0xb8c0cc, rim: 0x4a4e56, shape: 'kite', boss: 0xd8dde6 },
  starsteel_shield: { face: 0x5a8ad8, rim: 0xc9d0da, shape: 'kite', boss: 0x9ac0ff, glow: 0x0a1a40 },
  darkstone_shield: { face: 0x3a2048, rim: 0x8a6aa0, shape: 'tower', boss: 0x6a3a7a, glow: 0x200a30 },
};

/** A worn shield (big, readable shapes and the posable hold): see shields3d.ts. */
export function makeShield(id: string | null, M: MatFn = matCache()): THREE.Group | null {
  const d = id ? ITEMS[id] : undefined;
  const s = id ? SHIELDS[id] : undefined;
  if (!d || !s) return null;
  const lk = gearLook(d, s.face, s.rim);
  return wornShield(buildShieldModel(d, lk, s, grimMats(M)), lk.shield === 'book', id === 'wooden_shield' || lk.m === MAT.wood);
}

/** Shoulder plates show which body armour is worn. */
export const ARMOR_LOOK: Record<string, { color: number; size: number; plate?: boolean } | undefined> = {
  leather_armor: { color: 0x8a5a32, size: 0.12 },
  mage_robe: { color: 0x5a3a8a, size: 0.11 },
  chain_armor: { color: 0xa9b2bf, size: 0.13, plate: true },
  plate_armor: { color: 0xd4dae4, size: 0.16, plate: true },
  elven_mail: { color: 0x9ad0a0, size: 0.13, plate: true },
  arcane_robe: { color: 0x3a50c0, size: 0.12 },
  dragon_scale_mail: { color: 0x3f9a52, size: 0.16, plate: true },
  demonplate: { color: 0x7a1a1a, size: 0.18, plate: true },
  fur_armor: { color: 0xd8ccb4, size: 0.15 },
  dwarven_armor: { color: 0xb08a4a, size: 0.16, plate: true },
  lizardscale_armor: { color: 0x5a9a4a, size: 0.14, plate: true },
  glacier_robe: { color: 0x8ac8e8, size: 0.12 },
  frost_plate: { color: 0xbfe6f5, size: 0.17, plate: true },
  steel_plate: { color: 0xc9d0da, size: 0.16, plate: true },
  starsteel_plate: { color: 0x5a8ad8, size: 0.17, plate: true },
  darkstone_plate: { color: 0x4a2a5a, size: 0.18, plate: true },
  matriarch_scalemail: { color: 0xd8501a, size: 0.17, plate: true },
  blightweave_robe: { color: 0x4a6a1a, size: 0.12 },
};


// every weapon, shield and body armour has a colour entry (older code and tests read these tables)
for (const d of Object.values(ITEMS)) {
  if (d.weaponType && !LOOKS[d.id]) { const lk = gearLook(d); LOOKS[d.id] = { c: lk.m[1], t: lk.t[1], g: lk.glow }; }
  if (d.kind === 'shield' && !SHIELDS[d.id]) { const lk = gearLook(d); SHIELDS[d.id] = { face: lk.m[1], rim: lk.t[1], shape: lk.shield === 'book' ? 'book' : lk.shield === 'round' || lk.shield === 'buckler' ? 'round' : lk.shield === 'tower' ? 'tower' : 'kite', glow: lk.glow }; }
  if (d.kind === 'armor' && !ARMOR_LOOK[d.id]) { const lk = gearLook(d); ARMOR_LOOK[d.id] = { color: lk.m[1], size: 0.14 + lk.tier * 0.01, plate: lk.body === 'plate' || lk.body === 'scale' }; }
}

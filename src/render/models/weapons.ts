import * as THREE from 'three';
import { ITEMS, type ItemDef } from '../../game/inventory/items';
import { GRIM_MAT, gearLook, grimColor, MAT, rampOf, type MatKey } from './gearLooks';
import { group, matCache, sbox, scone, scyl, ssphere, storus, type MatFn } from './parts';
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
function weaponLook(d: ItemDef, l: Look): { blade: number; hi: number; trim: number; glow?: number; gem?: number } {
  const lk = gearLook(d, l.c, l.t);
  const metal = !!d.setId || /^(bronze|iron|steel|starsteel|darkstone|moonsilver|gilded|bone)_/.test(d.id);
  const blade = metal ? lk.m[1] : l.c;
  const c = { blade, hi: metal ? lk.m[0] : rampOf(l.c)[0], trim: l.t ?? lk.t[1], glow: l.g ?? lk.glow, gem: lk.gem ?? (l.g ? l.c : undefined) };
  if (!PAINTED) return c;
  // painted style: the grim palette; the blade loses its glow (a lit part gets no worn detail),
  // enchanted weapons keep a glowing stone instead
  return { blade: grim(c.blade), hi: grim(c.hi), trim: grim(c.trim), glow: undefined, gem: c.gem !== undefined ? grimColor(c.gem, 0.15, 0.9) : c.glow !== undefined ? grimColor(l.c, 0.15, 0.9) : undefined };
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

function haft(len: number, mm: THREE.Material, r = 0.03): THREE.Mesh {
  return X(scyl(r * 0.92, r, len, mm, 0, 0, len / 2 - 0.12, 6));
}

function sword(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const st = weaponStyle(d);
  const s = l.s ?? (st === 'dagger' ? 0.55 : st === 'short' ? 0.75 : st === 'great' ? 1.25 : 1);
  const len = 0.78 * s;
  const w = (st === 'broad' ? 0.1 : 0.08) * Math.sqrt(s);
  const c = weaponLook(d, l);
  const blade = M(c.blade, c.glow);
  const guard = M(c.trim);
  const gs = metalSurface(c.trim);
  const g = group(0, 0, 0,
    T(X(scyl(0.03, 0.03, 0.2, M(MAT.leather[2]), 0, 0, -0.04, 6)), 'leather'),
    T(ssphere(0.045, guard, 0, 0, -0.16, 1, 1, 1, 0), gs),
    T(sbox(w * 3.6, 0.05, 0.06, guard, 0, 0, 0.08), gs),
    T(ssphere(0.03, guard, w * 1.8, 0, 0.1), gs), T(ssphere(0.03, guard, -w * 1.8, 0, 0.1), gs),
    T(sbox(w, 0.026, len, blade, 0, 0, 0.11 + len / 2), 'blade'),
    T(sbox(w * 0.3, 0.03, len * 0.7, M(c.hi, c.glow), -w * 0.12, 0, 0.11 + len * 0.36), 'blade'),
    T(X(scone(w / 2, 0.12, blade, 0, 0, 0.11 + len + 0.05, 4)), 'blade'),
  );
  if (st === 'curved') { g.children[5].rotation.y = 0.06; g.children[7].position.x = 0.04; }
  if (c.gem && d.rarity !== 'common') g.add(ssphere(0.03, M(c.gem, c.gem), 0, 0.03, 0.08));
  if (PAINTED) {
    // leather-wrapped grip, a peened pommel nut, a ricasso block and a nick out of the edge
    g.add(...wrap(M, -0.13, 0.05, 0.034, 4), T(X(scyl(0.02, 0.02, 0.03, guard, 0, 0, -0.2, 6)), gs));
    g.add(T(sbox(w * 1.1, 0.034, 0.06, M(c.hi), 0, 0, 0.14), 'blade'));
    g.add(T(sbox(0.03, 0.03, 0.04, M(0x16100c), w * 0.48, 0, 0.11 + len * 0.62), 'iron'));
  }
  return g;
}

function axe(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const st = weaponStyle(d);
  const s = l.s ?? 1;
  const len = 0.62 + 0.3 * s;
  const c = weaponLook(d, l);
  const head = M(c.blade, c.glow);
  const edge = M(c.hi, c.glow);
  const trim = M(c.trim);
  const g = group(0, 0, 0, T(haft(len, M(d.id === 'demon_reaver' ? 0x2a1a14 : MAT.wood[1])), 'wood'), T(X(scyl(0.036, 0.036, 0.14, M(MAT.leather[2]), 0, 0, 0.02, 6)), 'leather'));
  const hz = len - 0.25;
  const blade = (side: number) => st === 'cleaver'
    ? group(0, 0, hz, T(sbox(0.045, 0.42 * s, 0.32 * s, head, side * 0.17 * s, -0.04, -0.04), 'iron'), T(sbox(0.04, 0.44 * s, 0.05, edge, side * 0.34 * s, -0.04, -0.04), 'blade'))
    : group(0, 0, hz,
      T(sbox(0.05, 0.22 * s, 0.18 * s, head, side * 0.1 * s, -0.01, 0), 'iron'),
      T(sbox(0.05, 0.32 * s, 0.1 * s, head, side * 0.18 * s, -0.03, 0), 'blade'),
      T(sbox(0.04, 0.38 * s, 0.05, edge, side * 0.24 * s, -0.04, 0), 'blade'),
    );
  g.add(blade(1));
  if (st === 'double') g.add(blade(-1));
  else if (st === 'battle') g.add(T(rot(scone(0.035, 0.14, head, -0.1, 0, hz, 4), 0, 0, Math.PI / 2), 'iron'));
  g.add(T(sbox(0.08, 0.1, 0.13, trim, 0, 0, hz), metalSurface(c.trim)), T(X(scone(0.03, 0.12, head, 0, 0, hz + 0.12, 4)), 'iron'));
  if (c.gem && d.rarity !== 'common') g.add(ssphere(0.03, M(c.gem, c.gem), 0.045, 0, hz));
  if (PAINTED) {
    // iron wedge rivets through the eye, leather wraps up the haft
    const iron = M(MAT.iron[2]);
    for (const sy of [-1, 1]) g.add(T(stud(iron, 0.045, sy * 0.03, hz), 'iron'), T(stud(iron, -0.045, sy * 0.03, hz), 'iron'));
    g.add(...wrap(M, hz - 0.3, hz - 0.12, 0.034, 2), ...wrap(M, -0.1, 0.12, 0.038, 3));
  }
  return g;
}

function club(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const st = weaponStyle(d);
  const s = l.s ?? 1;
  const len = 0.55 + 0.3 * s;
  const c = weaponLook(d, l);
  const head = M(c.blade, c.glow);
  const trim = M(c.trim);
  const g = group(0, 0, 0, T(haft(len, st === 'flanged' && d.rarity !== 'common' ? trim : M(MAT.wood[1])), st === 'flanged' && d.rarity !== 'common' ? 'iron' : 'wood'), T(X(scyl(0.036, 0.036, 0.14, M(MAT.leather[2]), 0, 0, 0.02, 6)), 'leather'));
  const hz = len - 0.18;
  if (PAINTED) {
    // iron bands under the head, a leather-wrapped grip, studs driven into the head
    const iron = M(MAT.iron[2]);
    g.add(T(X(scyl(0.04, 0.04, 0.03, iron, 0, 0, hz - 0.2, 6)), 'iron'), T(X(scyl(0.04, 0.04, 0.03, iron, 0, 0, hz - 0.28, 6)), 'iron'), ...wrap(M, -0.1, 0.12, 0.038, 3));
    if (st === 'hammer' || st === 'maul') {
      const big = (st === 'maul' ? 1.35 : 1) * s;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.add(T(stud(iron, sx * 0.1 * big, sy * 0.09 * big, hz - 0.02, 0.02), 'iron'));
    }
  }
  switch (st) {
    case 'hammer':
    case 'maul': {
      const big = st === 'maul' ? 1.35 : 1;
      g.add(sbox(0.3 * s * big, 0.17 * s * big, 0.18 * s * big, head, 0, 0, hz - 0.02));
      g.add(sbox(0.31 * s * big, 0.04, 0.19 * s * big, trim, 0, 0.05 * big, hz - 0.02), sbox(0.31 * s * big, 0.04, 0.19 * s * big, trim, 0, -0.05 * big, hz - 0.02));
      if (st === 'hammer') g.add(rot(scone(0.06, 0.18, trim, -0.22 * s, 0, hz - 0.02, 4), 0, 0, Math.PI / 2));
      if (d.id === 'thunder_maul') g.add(ssphere(0.06, M(0xf0f080, 0xa0a020), 0.18 * s, 0, hz - 0.02));
      if (c.gem && st === 'maul' && d.rarity === 'legendary') g.add(ssphere(0.045, M(c.gem, c.gem), 0, 0.13, hz - 0.02));
      return clubDone(g);
    }
    case 'tusk':
      g.add(T(rot(scone(0.09 * s, 0.4 * s, M(MAT.bone[1]), 0.03, 0, hz, 6), -Math.PI / 2, 0, 0.2), 'bone'), T(sbox(0.08, 0.08, 0.05, M(MAT.leather[1]), 0, 0, hz - 0.18), 'leather'));
      return clubDone(g);
    case 'morning': {
      const h = group(0, 0, hz, ssphere(0.11 * s, head, 0, 0, 0, 1, 1, 1, 0));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), i % 2 ? 0.4 : -0.2).normalize();
        const k = scone(0.035, 0.1, trim, dir.x * 0.12 * s, dir.y * 0.12 * s, dir.z * 0.12 * s, 4);
        k.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        h.add(k);
      }
      h.add(X(scone(0.035, 0.12, trim, 0, 0, 0.14 * s, 4)));
      g.add(h);
      return clubDone(g);
    }
    default: {
      // flanged mace: six blades round a core
      const h = group(0, 0, hz, ssphere(0.07 * s, head, 0, 0, 0, 1, 1, 1.3));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        h.add(rot(sbox(0.03, 0.09 * s, 0.2 * s, head, Math.cos(a) * 0.075 * s, Math.sin(a) * 0.075 * s, 0), 0, 0, a + Math.PI / 2));
      }
      h.add(X(scone(0.03, 0.1, trim, 0, 0, 0.14 * s, 4)), X(scyl(0.045, 0.045, 0.04, trim, 0, 0, -0.13 * s, 8)));
      if (c.gem && d.rarity !== 'common') h.add(ssphere(0.03, M(c.gem, c.gem), 0, 0, 0.1 * s));
      g.add(h);
      return clubDone(g);
    }
  }
}

/** Painted style: every club part not tagged yet is pitted iron. */
function clubDone(g: THREE.Group): THREE.Group {
  if (PAINTED) g.traverse((c) => { if ((c as THREE.Mesh).isMesh && !c.userData.detail) c.userData.detail = 'iron'; });
  return g;
}

function bow(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const s = l.s ?? 1;
  const c = weaponLook(d, l);
  const wd = M(d.setId === 'skyfeather' ? MAT.sky[1] : PAINTED ? grim(l.c) : l.c, c.glow);
  const g = group(0, 0, 0.05);
  // the bow is held upright in front of the hand
  const r = 0.45 * s;
  const arc = storus(r, 0.03, wd, Math.PI * 0.9, 4, 12);
  arc.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05);
  arc.position.z = -r * 0.55;
  g.add(T(arc, 'wood'), sbox(0.012, r * 1.95, 0.012, M(0xe8e0c6), 0, 0, -r * 0.55 + r * 0.16), T(sbox(0.06, 0.12, 0.06, M(MAT.leather[1]), 0, 0, r * 0.4), 'leather'));
  for (const sy of [-1, 1]) g.add(T(ssphere(0.03, M(c.trim), 0, sy * r * 0.97, -r * 0.4), metalSurface(c.trim)));
  if (PAINTED) {
    // a grip wrapped in sinew above and below the hand
    const sinew = M(0x3a2a1a);
    g.add(T(sbox(0.07, 0.04, 0.07, sinew, 0, 0.07, r * 0.4), 'leather'), T(sbox(0.07, 0.04, 0.07, sinew, 0, -0.07, r * 0.4), 'leather'));
  }
  if (d.setId === 'skyfeather' || d.rarity === 'rare' || d.rarity === 'legendary') for (const sy of [-1, 1]) g.add(rot(sbox(0.02, 0.18, 0.06, M(d.setId === 'skyfeather' ? 0xffffff : c.trim, c.glow), 0, sy * r * 0.55, r * 0.3), sy * 0.5, 0, 0));
  if (c.gem && d.rarity !== 'common') g.add(ssphere(0.03, M(c.gem, c.gem), 0, 0, r * 0.47));
  g.rotation.x = -Math.PI / 2;
  return g;
}

function crossbow(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const s = l.s ?? 1;
  const c = weaponLook(d, l);
  const wd = M(PAINTED ? grim(l.c) : l.c, c.glow);
  const metal = M(c.trim);
  const g = group(0, 0, 0,
    T(sbox(0.08, 0.08, 0.7 * s, wd, 0, 0, 0.25), 'wood'),
    T(sbox(0.75 * s, 0.05, 0.06, metal, 0, 0.02, 0.5 * s), 'iron'),
    sbox(0.012, 0.012, 0.36 * s, M(0xe8e0c6), 0, 0.05, 0.38),
    T(sbox(0.1, 0.1, 0.08, metal, 0, 0, 0.5 * s), 'iron'),
    T(X(scone(0.025, 0.08, M(MAT.steel[1]), 0, 0.06, 0.62 * s, 4)), 'blade'),
  );
  if (PAINTED) {
    // iron strapping on the stock, rivets, a trigger lever
    const iron = M(MAT.iron[2]);
    g.add(T(sbox(0.09, 0.09, 0.025, iron, 0, 0, 0.05), 'iron'), T(sbox(0.09, 0.09, 0.025, iron, 0, 0, 0.32), 'iron'), T(sbox(0.02, 0.08, 0.03, iron, 0, -0.07, 0.15), 'iron'));
    for (const sx of [-1, 1]) g.add(T(stud(iron, sx * 0.3 * s, 0.05, 0.5 * s, 0.015), 'iron'));
  }
  return g;
}

function throwing(d: ItemDef, l: Look, M: MatFn): THREE.Group {
  const head = PAINTED ? M(grim(l.c)) : M(l.c, l.g);
  if (d.id.endsWith('_star')) {
    const g = group(0, 0, 0.08);
    for (let i = 0; i < 4; i++) g.add(T(rot(scone(0.04, 0.16, head, Math.cos(i * Math.PI / 2) * 0.08, 0, Math.sin(i * Math.PI / 2) * 0.08, 3), 0, 0, i * Math.PI / 2 + Math.PI / 2), 'blade'));
    if (PAINTED) g.add(T(X(scyl(0.03, 0.03, 0.02, M(MAT.iron[2]), 0, 0, 0, 6)), 'iron'));
    return g;
  }
  const k = l.s ?? 1;
  const g = group(0, 0, 0, T(haft(1.15 * k, M(PAINTED ? grim(l.t ?? 0x7a5530) : l.t ?? 0x7a5530)), 'wood'), T(X(scone(0.05, 0.2, head, 0, 0, 1.1 * k, 4)), 'blade'), T(X(scyl(0.035, 0.035, 0.05, M(MAT.leather[1]), 0, 0, 0.95 * k, 6)), 'leather'));
  if (PAINTED) g.add(...wrap(M, 0.2, 0.42, 0.034, 3), T(X(scyl(0.03, 0.03, 0.03, M(MAT.iron[2]), 0, 0, 0.99 * k, 6)), 'iron')); // grip wraps, a socket ring
  return g;
}

function wand(l: Look, M: MatFn, staff: boolean): THREE.Group {
  // painted style: a dark, gnarled shaft of the old colour, tarnished fittings; the orb keeps its glow
  const shaft = M(PAINTED ? grim(l.t ?? 0x3a2a4a) : l.t ?? 0x3a2a4a);
  const orb = M(l.c, l.g ?? 0x404040);
  const gold = M(MAT.gold[1]);
  if (!staff) {
    const g = group(0, 0, 0,
      T(X(scyl(0.022, 0.03, 0.45, shaft, 0, 0, 0.12, 6)), 'wood'),
      T(X(scyl(0.034, 0.034, 0.03, gold, 0, 0, 0.0, 8)), 'gilt'), T(X(scyl(0.032, 0.032, 0.03, gold, 0, 0, 0.3, 8)), 'gilt'),
      ssphere(0.065, orb, 0, 0, 0.39),
      T(rot(scone(0.015, 0.08, gold, 0.04, 0, 0.36, 4), 0.5, 0, 0), 'gilt'), T(rot(scone(0.015, 0.08, gold, -0.04, 0, 0.36, 4), 0.5, 0, 0), 'gilt'),
    );
    if (PAINTED) g.add(...wrap(M, -0.06, 0.1, 0.03, 3), T(rot(scone(0.015, 0.08, gold, 0, 0.04, 0.36, 4), 0, 0, 0), 'gilt'));
    return g;
  }
  const g = group(0, 0, 0,
    T(X(scyl(0.026, 0.032, 1.1, shaft, 0, 0, 0.3, 6)), 'wood'),
    ssphere(0.085, orb, 0, 0, 0.9, 1, 1, 1.25),
  );
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(T(rot(scone(0.02, 0.16, shaft, Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.86, 4), Math.PI / 2 - Math.sin(a) * 0.4, Math.cos(a) * 0.4, 0), 'wood'));
  }
  if (PAINTED) {
    // leather wraps and a hanging charm: a bone and two beads on a thong below the head
    g.add(...wrap(M, -0.05, 0.15, 0.036, 3), ...wrap(M, 0.68, 0.76, 0.032, 2));
    const thong = M(0x2a1c12);
    g.add(T(sbox(0.008, 0.16, 0.008, thong, 0.04, -0.08, 0.7), 'leather'), T(ssphere(0.02, M(MAT.bone[1]), 0.04, -0.17, 0.7, 0.7, 1.5, 0.7, 0), 'bone'), T(ssphere(0.016, M(MAT.bone[2]), 0.04, -0.12, 0.7, 1, 1, 1, 0), 'bone'));
    for (let i = 0; i < 3; i++) g.add(T(X(scyl(0.03, 0.03, 0.012, gold, 0, 0, 0.8 + i * 0.012, 6)), 'gilt'));
  }
  return g;
}

export function makeWeapon(id: string | null, M0: MatFn = matCache()): THREE.Group | null {
  if (!id) return null;
  const M = grimMats(M0);
  const d = ITEMS[id];
  if (!d?.weaponType) return null;
  const l = LOOKS[id] ?? { c: 0xc9d0da };
  const g = ((): THREE.Group => {
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
  })();
  // slimmer, more elegant blades, heads and hafts (owner, 2026-10-21); the length (+z) stays
  const thin = WEAPON_THIN[d.weaponType] ?? 0.75;
  g.scale.set(thin, thin, 1);
  return g;
}

/** Thickness/width scale per weapon type (length is kept). */
const WEAPON_THIN: Record<string, number> = { sword: 0.68, axe: 0.72, club: 0.74, throwing: 0.72, wand: 0.8, rod: 0.8, bow: 0.86, crossbow: 0.82 };

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

function rot<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.rotation.set(x, y, z);
  return o;
}

// every weapon, shield and body armour has a colour entry (older code and tests read these tables)
for (const d of Object.values(ITEMS)) {
  if (d.weaponType && !LOOKS[d.id]) { const lk = gearLook(d); LOOKS[d.id] = { c: lk.m[1], t: lk.t[1], g: lk.glow }; }
  if (d.kind === 'shield' && !SHIELDS[d.id]) { const lk = gearLook(d); SHIELDS[d.id] = { face: lk.m[1], rim: lk.t[1], shape: lk.shield === 'book' ? 'book' : lk.shield === 'round' || lk.shield === 'buckler' ? 'round' : lk.shield === 'tower' ? 'tower' : 'kite', glow: lk.glow }; }
  if (d.kind === 'armor' && !ARMOR_LOOK[d.id]) { const lk = gearLook(d); ARMOR_LOOK[d.id] = { color: lk.m[1], size: 0.14 + lk.tier * 0.01, plate: lk.body === 'plate' || lk.body === 'scale' }; }
}

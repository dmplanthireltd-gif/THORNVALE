import * as THREE from 'three';
import { ITEMS } from '../../game/inventory/items';
import { box, cone, cyl, group, mat, sphere } from './parts';

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

const wood = () => mat(0x7a5530);
const leather = () => mat(0x3a2a1c);
const m = (color: number, glow?: number) => mat(color, glow ? { emissive: glow } : {});

function haft(len: number, mm: THREE.Material = wood()): THREE.Mesh {
  const h = cyl(0.028, 0.032, len, mm, 0, 0, len / 2 - 0.12, 6);
  h.rotation.x = Math.PI / 2;
  return h;
}

function sword(l: Look): THREE.Group {
  const s = l.s ?? 1;
  const len = 0.78 * s;
  const w = 0.08 * Math.sqrt(s);
  const blade = m(l.c, l.g);
  const guard = m(l.t ?? 0x6b7380);
  return group(0, 0, 0,
    cyl(0.03, 0.03, 0.2, leather(), 0, 0, -0.04, 6).rotateX(Math.PI / 2),
    sphere(0.045, guard, 0, 0, -0.15, 1, 1, 1, 0),
    box(w * 3.4, 0.05, 0.06, guard, 0, 0, 0.08),
    box(w, 0.026, len, blade, 0, 0, 0.11 + len / 2),
    cone(w / 2, 0.12, blade, 0, 0, 0.11 + len + 0.05, 4).rotateX(Math.PI / 2),
  );
}

function axe(id: string, l: Look): THREE.Group {
  const s = l.s ?? 1;
  const len = 0.62 + 0.3 * s;
  const head = m(l.c, l.g);
  const trim = m(l.t ?? 0x6b7380);
  const g = group(0, 0, 0, haft(len, id === 'demon_reaver' ? mat(0x2a1a14) : wood()));
  const blade = (side: number) => group(0, 0, len - 0.25,
    box(0.05, 0.3 * s, 0.2 * s, head, side * 0.12 * s, -0.02, 0),
    box(0.04, 0.36 * s, 0.06, trim, side * 0.21 * s, -0.04, 0),
  );
  g.add(blade(1));
  if (id === 'double_axe' || id === 'demon_reaver') g.add(blade(-1));
  if (id === 'dragonbone_cleaver') g.add(box(0.05, 0.36, 0.8, head, 0, -0.12, 0.6));
  g.add(box(0.07, 0.1, 0.12, trim, 0, 0, len - 0.25));
  return g;
}

function club(id: string, l: Look): THREE.Group {
  const s = l.s ?? 1;
  const len = 0.55 + 0.3 * s;
  const head = m(l.c, l.g);
  const spikes = m(l.t ?? 0xc9d0da);
  const g = group(0, 0, 0, haft(len));
  if (id === 'war_hammer' || id === 'thunder_maul' || id === 'stone_maul') {
    g.add(box(0.3 * s, 0.17 * s, 0.18 * s, head, 0, 0, len - 0.2));
    g.add(cone(0.06, 0.18, spikes, -0.22 * s, 0, len - 0.2, 4).rotateZ(Math.PI / 2));
    if (id === 'thunder_maul') g.add(sphere(0.06, m(0xf0f080, 0xa0a020), 0.18 * s, 0, len - 0.2));
    return g;
  }
  const h = group(0, 0, len - 0.18, sphere(0.11 * s, head, 0, 0, 0, 1, 1, 1, 0));
  const n = id === 'morning_star' ? 8 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), i % 2 ? 0.4 : -0.2).normalize();
    const c = cone(0.035, 0.1, spikes, dir.x * 0.12 * s, dir.y * 0.12 * s, dir.z * 0.12 * s, 4);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    h.add(c);
  }
  g.add(h);
  return g;
}

function bow(l: Look): THREE.Group {
  const s = l.s ?? 1;
  const wd = m(l.c, l.g);
  const g = group(0, 0, 0.05);
  // the bow is held upright in front of the hand
  const r = 0.45 * s;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 4, 12, Math.PI * 0.9), wd);
  arc.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05);
  arc.castShadow = true;
  arc.position.z = -r * 0.55;
  g.add(arc);
  g.add(box(0.012, r * 1.95, 0.012, m(l.t ?? 0xe8e0c6), 0, 0, -r * 0.55 + r * 0.16));
  g.rotation.x = -Math.PI / 2;
  return g;
}

function crossbow(l: Look): THREE.Group {
  const s = l.s ?? 1;
  const wd = m(l.c, l.g);
  const metal = m(l.t ?? 0x9aa0a8);
  return group(0, 0, 0,
    box(0.08, 0.08, 0.7 * s, wd, 0, 0, 0.25),
    box(0.75 * s, 0.05, 0.06, metal, 0, 0.02, 0.5 * s),
    box(0.012, 0.012, 0.36 * s, mat(0xe8e0c6), 0, 0.05, 0.38),
  );
}

function throwing(id: string, l: Look): THREE.Group {
  const head = m(l.c, l.g);
  if (id.endsWith('_star')) {
    const g = group(0, 0, 0.08);
    for (let i = 0; i < 4; i++) g.add(cone(0.04, 0.16, head, Math.cos(i * Math.PI / 2) * 0.08, 0, Math.sin(i * Math.PI / 2) * 0.08, 3).rotateZ(i * Math.PI / 2 + Math.PI / 2));
    return g;
  }
  return group(0, 0, 0, haft(1.15 * (l.s ?? 1), m(l.t ?? 0x7a5530)), cone(0.05, 0.2, head, 0, 0, 1.1 * (l.s ?? 1), 4).rotateX(Math.PI / 2));
}

function wand(l: Look): THREE.Group {
  return group(0, 0, 0,
    cyl(0.022, 0.03, 0.45, m(l.t ?? 0x3a2a4a), 0, 0, 0.12, 6).rotateX(Math.PI / 2),
    sphere(0.06, m(l.c, l.g ?? 0x404040), 0, 0, 0.38),
  );
}

function rod(l: Look): THREE.Group {
  return group(0, 0, 0,
    cyl(0.026, 0.032, 1.1, m(l.t ?? 0x5a3a20), 0, 0, 0.3, 6).rotateX(Math.PI / 2),
    sphere(0.08, m(l.c, l.g ?? 0x404040), 0, 0, 0.88, 1, 1, 1.3),
    cone(0.03, 0.12, m(l.t ?? 0x5a3a20), 0.06, 0, 0.82, 4).rotateZ(0.6),
  );
}

export function makeWeapon(id: string | null): THREE.Group | null {
  if (!id) return null;
  const d = ITEMS[id];
  if (!d?.weaponType) return null;
  const l = LOOKS[id] ?? { c: 0xc9d0da };
  switch (d.weaponType) {
    case 'sword': return sword(l);
    case 'axe': return axe(id, l);
    case 'club': return club(id, l);
    case 'bow': return bow(l);
    case 'crossbow': return crossbow(l);
    case 'throwing': return throwing(id, l);
    case 'wand': return wand(l);
    case 'rod': return rod(l);
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

export function makeShield(id: string | null): THREE.Group | null {
  const s = id ? SHIELDS[id] : undefined;
  if (!s) return null;
  const face = m(s.face, s.glow);
  const rim = m(s.rim);
  let g: THREE.Group;
  switch (s.shape) {
    case 'round':
      g = group(0, 0, 0,
        cyl(0.29, 0.29, 0.06, face, 0, 0, 0, 12).rotateZ(Math.PI / 2),
        cyl(0.31, 0.31, 0.03, rim, -0.005, 0, 0, 12).rotateZ(Math.PI / 2),
        sphere(0.08, m(s.boss ?? 0xc9d0da), 0.05, 0, 0),
      );
      break;
    case 'kite':
      g = group(0, 0, 0,
        box(0.06, 0.48, 0.44, rim, 0, 0.06, 0),
        box(0.065, 0.42, 0.36, face, 0.002, 0.06, 0),
        box(0.07, 0.3, 0.06, m(s.boss ?? 0xe0b03c), 0.004, 0.06, 0),
        cone(0.22, 0.28, rim, 0, -0.29, 0, 4).rotateZ(Math.PI),
      );
      break;
    case 'tower':
      g = group(0, 0, 0,
        box(0.07, 0.86, 0.5, rim, 0, 0.0, 0),
        box(0.075, 0.78, 0.42, face, 0.002, 0.0, 0),
        sphere(0.07, m(s.boss ?? 0xc9d0da), 0.05, 0.05, 0),
      );
      break;
    case 'book':
      g = group(0, 0.05, 0,
        box(0.08, 0.32, 0.26, face, 0, 0, 0),
        box(0.06, 0.3, 0.24, mat(0xf0e8d0), 0.012, 0, 0),
        box(0.085, 0.06, 0.27, rim, 0, 0.08, 0),
      );
      break;
  }
  g.rotation.y = -0.45;
  return g;
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

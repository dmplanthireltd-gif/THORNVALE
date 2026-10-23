import type { ItemDef } from '../../game/inventory/items';

/**
 * How every piece of equipment looks, shared by the item icons (ui/gearIcons.ts)
 * and the 3D gear on characters (models/humanoid.ts, weapons.ts). Pure data, no
 * three.js: a material ramp (highlight → base → shadow → edge), a trim ramp, an
 * optional glowing gem, and a shape style per item kind.
 *
 * Gear sets share one look (SET_LOOK) so a full set reads as one outfit;
 * single items can override it (ITEM_LOOK). Anything not listed falls back to
 * the old colour tables passed in by the caller.
 */
export type Ramp = readonly [hi: number, base: number, lo: number, edge: number];

export const MAT = {
  bronze: [0xf6be80, 0xc47c3a, 0x7c4418, 0x351a06],
  iron: [0xc8ccd2, 0x878e97, 0x4f555e, 0x202429],
  steel: [0xf4f8fc, 0xb6c0cc, 0x6a7686, 0x262e3a],
  silver: [0xffffff, 0xd6deec, 0x8c98b0, 0x363e54],
  gold: [0xfff2a6, 0xe8b232, 0x9c6410, 0x442804],
  starsteel: [0xeaf6ff, 0x7caaf2, 0x3a5aaa, 0x101c48],
  darkstone: [0x7e5c6a, 0x3c2a34, 0x1c1218, 0x060305],
  crimson: [0xff8e6c, 0xc42c1c, 0x6c0a06, 0x260202],
  dragon: [0xa6e890, 0x40a052, 0x1e5c2a, 0x08240e],
  frost: [0xffffff, 0xaee6fa, 0x4c9cca, 0x12385a],
  hell: [0x9a4430, 0x501814, 0x240806, 0x0a0202],
  bone: [0xfffbee, 0xe6d8b6, 0xa8946a, 0x463620],
  leather: [0xcc955e, 0x8c5a32, 0x553418, 0x26160a],
  darkleather: [0x8c6c4c, 0x4c3624, 0x2a1c10, 0x120a04],
  wood: [0xbc8c5a, 0x7c5530, 0x4a3018, 0x221408],
  fur: [0xfffaf0, 0xdacdb4, 0x9a8a70, 0x4a3e2c],
  ranger: [0x8eae6a, 0x4c6c3a, 0x2c4220, 0x101a0a],
  elven: [0xeefad8, 0xa2d4a6, 0x4c8c5c, 0x183a22],
  arcane: [0xb890f0, 0x5c3ca6, 0x2e1a5c, 0x120828],
  rime: [0xeefaff, 0x8ccaea, 0x3c86b4, 0x10304a],
  void: [0xa47ce8, 0x34205e, 0x170c2e, 0x060210],
  sky: [0xffffff, 0xd2ecff, 0x7aaad6, 0x26466a],
  royal: [0x7a9aff, 0x2a4aaa, 0x14245a, 0x060c24],
  gunmetal: [0x9aa0aa, 0x585e6a, 0x30343c, 0x101216],
  dwarven: [0xf0d08a, 0xb48c4a, 0x6c5024, 0x2c1e08],
  cloth: [0xf4ecd8, 0xc8b898, 0x8a7a5a, 0x3a3020],
  tide: [0xa8f4e4, 0x34908c, 0x165652, 0x062424],
  pearl: [0xffffff, 0xeee6d8, 0xb8ac98, 0x4a4234],
} as const satisfies Record<string, Ramp>;

export type MatKey = keyof typeof MAT;

/** A ramp from one colour (for items that only have a legacy colour). */
export function rampOf(c: number): Ramp {
  const ch = (v: number, k: number) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  const mix = (k: number) => (ch((c >> 16) & 255, k) << 16) | (ch((c >> 8) & 255, k) << 8) | ch(c & 255, k);
  return [mix(1.45), c, mix(0.6), mix(0.25)];
}

export type HelmStyle = 'cap' | 'coif' | 'med' | 'full' | 'great' | 'horned' | 'winged' | 'crested' | 'crown' | 'circlet' | 'hood' | 'hat' | 'skull' | 'fur';
export type BodyStyle = 'leather' | 'chain' | 'plate' | 'scale' | 'robe' | 'fur' | 'bone' | 'vest';
export type LegStyle = 'leather' | 'chain' | 'plate' | 'scale' | 'skirt' | 'fur' | 'bone';
export type BootStyle = 'leather' | 'plate' | 'fur' | 'shoe' | 'bone' | 'wing';
export type ShieldStyle = 'round' | 'buckler' | 'kite' | 'heater' | 'tower' | 'book' | 'skull' | 'spiked';
export type Emblem = 'none' | 'cross' | 'crown' | 'star' | 'moon' | 'sun' | 'flake' | 'flame' | 'skull' | 'dragon' | 'leaf' | 'eye' | 'bar' | 'beard';

export interface GearLook {
  m: Ramp;
  t: Ramp;
  /** Glowing gem colour (icons and 3D). */
  gem?: number;
  /** Emissive tint of the main material on the 3D model (enchanted gear). */
  glow?: number;
  helm: HelmStyle;
  body: BodyStyle;
  legs: LegStyle;
  boots: BootStyle;
  shield: ShieldStyle;
  emblem: Emblem;
  /** Cape colour on body armour. */
  cape?: number;
  /** Helmet plume/crest colour. */
  plume?: number;
  horns?: boolean;
  spikes?: boolean;
  /** 0 (starter) … 5 (legendary): how much trim, rivets and ornament to draw. */
  tier: number;
}

type LookSpec = Partial<Omit<GearLook, 'm' | 't'>> & { m: Ramp; t?: Ramp };

const BASE: Omit<GearLook, 'm' | 't' | 'tier'> = { helm: 'med', body: 'plate', legs: 'plate', boots: 'plate', shield: 'kite', emblem: 'none' };

/** One look per gear set (see game/inventory/sets.ts). */
export const SET_LOOK: Record<string, LookSpec> = {
  leather: { m: MAT.leather, t: MAT.darkleather, helm: 'cap', body: 'leather', legs: 'leather', boots: 'leather' },
  chain: { m: MAT.iron, t: MAT.leather, helm: 'coif', body: 'chain', legs: 'chain', boots: 'leather' },
  fur: { m: MAT.fur, t: MAT.leather, helm: 'fur', body: 'fur', legs: 'fur', boots: 'fur' },
  bronze: { m: MAT.bronze, t: MAT.leather, helm: 'med', shield: 'round', emblem: 'none' },
  iron: { m: MAT.iron, t: MAT.leather, helm: 'med', shield: 'kite', emblem: 'cross' },
  plate: { m: MAT.steel, t: MAT.iron, helm: 'great', shield: 'tower', emblem: 'bar' },
  steel: { m: MAT.steel, t: MAT.gunmetal, helm: 'full', shield: 'heater', emblem: 'cross', plume: 0x2a4aaa },
  moonsilver: { m: MAT.silver, t: MAT.starsteel, gem: 0x9adcff, helm: 'winged', shield: 'kite', emblem: 'moon' },
  starsteel: { m: MAT.starsteel, t: MAT.steel, gem: 0xc8ecff, glow: 0x0a1a40, helm: 'crested', plume: 0xd8ecff, shield: 'kite', emblem: 'star' },
  gilded: { m: MAT.gold, t: MAT.crimson, gem: 0xff3a3a, helm: 'full', plume: 0xc42c1c, shield: 'heater', emblem: 'sun', cape: 0x8a1a14 },
  darkstone: { m: MAT.darkstone, t: MAT.crimson, gem: 0xff3a20, glow: 0x200608, helm: 'horned', horns: true, spikes: true, shield: 'spiked', emblem: 'eye' },
  dwarven: { m: MAT.dwarven, t: MAT.iron, helm: 'med', shield: 'round', emblem: 'beard' },
  bone: { m: MAT.bone, t: MAT.darkleather, helm: 'skull', body: 'bone', legs: 'bone', boots: 'bone', shield: 'skull', emblem: 'skull', horns: true },
  knights_vow: { m: MAT.steel, t: MAT.gold, gem: 0xff4a4a, helm: 'great', plume: 0xd82a2a, shield: 'heater', emblem: 'cross', cape: 0xeeeae0 },
  crownguard: { m: MAT.silver, t: MAT.gold, gem: 0x3a7aff, helm: 'crown', shield: 'kite', emblem: 'crown', cape: 0x2a4aaa },
  frostforged: { m: MAT.frost, t: MAT.silver, gem: 0x9fe6ff, glow: 0x0c3048, helm: 'crested', plume: 0xe8faff, spikes: true, shield: 'kite', emblem: 'flake' },
  dragonscale: { m: MAT.dragon, t: MAT.gold, gem: 0xff6a20, helm: 'crested', plume: 0xd84a20, body: 'scale', legs: 'scale', shield: 'kite', emblem: 'dragon' },
  hellforged: { m: MAT.hell, t: MAT.darkstone, gem: 0xff5a10, glow: 0x3a0604, helm: 'horned', horns: true, spikes: true, shield: 'spiked', emblem: 'flame', cape: 0x3a0606 },
  ranger: { m: MAT.ranger, t: MAT.leather, helm: 'hood', body: 'vest', legs: 'leather', boots: 'leather', emblem: 'leaf' },
  elven: { m: MAT.elven, t: MAT.gold, gem: 0x7af0a0, helm: 'circlet', body: 'scale', legs: 'leather', boots: 'leather', emblem: 'leaf' },
  spellwoven: { m: MAT.arcane, t: MAT.gold, gem: 0xd08aff, helm: 'hat', body: 'robe', legs: 'skirt', boots: 'shoe', shield: 'book', emblem: 'star' },
  rimeweave: { m: MAT.rime, t: MAT.silver, gem: 0x9fe6ff, glow: 0x0a2638, helm: 'circlet', body: 'robe', legs: 'skirt', boots: 'shoe', emblem: 'flake' },
  wardbreaker: { m: MAT.gunmetal, t: MAT.gold, gem: 0xff9a2a, glow: 0x1a0a00, helm: 'great', horns: true, spikes: true, shield: 'tower', emblem: 'bar', cape: 0x6a1a10 },
  skyfeather: { m: MAT.sky, t: MAT.gold, gem: 0x6ad8ff, glow: 0x0a2030, helm: 'hood', body: 'vest', legs: 'leather', boots: 'wing', emblem: 'leaf', cape: 0xe8f4ff },
  voidweave: { m: MAT.void, t: MAT.silver, gem: 0xc070ff, glow: 0x1a0a30, helm: 'hood', body: 'robe', legs: 'skirt', boots: 'shoe', shield: 'book', emblem: 'eye' },
  tidewrought: { m: MAT.tide, t: MAT.pearl, gem: 0x9af0ff, glow: 0x062a2a, helm: 'crested', plume: 0xd8443a, body: 'scale', legs: 'scale', boots: 'plate', shield: 'round', emblem: 'eye' },
};

/** Single-item looks (outside sets, or a different shape inside one). */
export const ITEM_LOOK: Record<string, Partial<LookSpec>> = {
  chain_helmet: { helm: 'coif' },
  iron_helmet: { helm: 'med' },
  plate_helmet: { helm: 'great' },
  steel_helmet: { helm: 'full' },
  starsteel_helm: { helm: 'crested' },
  darkstone_helm: { helm: 'horned' },
  dwarven_helmet: { helm: 'med', horns: true },
  winged_helmet: { m: MAT.steel, t: MAT.silver, helm: 'winged' },
  orc_warhelm: { m: MAT.gunmetal, t: MAT.bone, helm: 'horned', horns: true, spikes: true },
  frost_circlet: { helm: 'circlet' },
  elven_circlet: { helm: 'circlet' },
  fur_cap: { helm: 'fur' },
  demon_helm: { helm: 'horned' },
  dragon_helm: { helm: 'crested' },
  frost_helm: { helm: 'crested' },
  crownguard_helm: { helm: 'crown' },
  vow_helm: { helm: 'great' },
  wardbreaker_helm: { helm: 'great' },
  skyfeather_cowl: { helm: 'winged' },
  // body armour outside sets
  mage_robe: { m: MAT.arcane, t: MAT.gold, body: 'robe', gem: 0xb080ff },
  arcane_robe: { m: MAT.royal, t: MAT.gold, body: 'robe', gem: 0x7ad8ff, glow: 0x0a1030 },
  lizardscale_armor: { m: [0x9ae07a, 0x5a9a4a, 0x2c5a24, 0x0c240a], t: MAT.bronze, body: 'scale' },
  elven_mail: { body: 'scale' },
  glacier_robe: { body: 'robe' },
  fur_armor: { body: 'fur' },
  dwarven_armor: { body: 'plate' },
  chain_armor: { body: 'chain' },
  // legs outside sets
  hydra_legs: { m: [0x6ad0a0, 0x2f7a5a, 0x184432, 0x061a10], t: MAT.bronze, legs: 'scale' },
  elven_leggings: { legs: 'leather' },
  glacier_kilt: { legs: 'skirt' },
  // boots outside sets
  traveler_boots: { m: [0xc0a070, 0x8a6a3e, 0x4c3a20, 0x201608], t: MAT.leather, boots: 'leather', gem: 0x9fe8ff },
  emberwalk_boots: { m: [0xff9a5a, 0xd0501a, 0x7a2408, 0x2a0a02], t: MAT.darkstone, boots: 'leather', gem: 0xffd84a, glow: 0x401000 },
  windstride_boots: { m: MAT.sky, t: MAT.silver, boots: 'wing', gem: 0x9fe8ff, glow: 0x0a2a3a },
  glacier_boots: { boots: 'shoe' },
  steel_boots: { boots: 'plate' },
  // shields outside sets
  wooden_shield: { m: MAT.wood, t: MAT.iron, shield: 'round' },
  dwarven_shield: { shield: 'round' },
  scarab_shield: { m: [0x6ae0c0, 0x2a8a6a, 0x14483a, 0x06201a], t: MAT.gold, shield: 'kite', emblem: 'sun', gem: 0x40c0a0 },
  elven_aegis: { m: MAT.elven, t: MAT.gold, shield: 'kite', emblem: 'leaf', gem: 0x7ad08a },
  apprentice_book: { m: MAT.arcane, t: MAT.gold, shield: 'book', emblem: 'star' },
  storm_tome: { m: MAT.royal, t: [0xeafaff, 0x8ad8ff, 0x3a7aa8, 0x10304a], shield: 'book', emblem: 'flame', gem: 0x8ad8ff },
  frostscale_shield: { shield: 'kite' },
  dragon_shield: { shield: 'kite' },
  demon_shield: { shield: 'spiked' },
  bronze_shield: { shield: 'buckler' },
  mountainheart_shield: { shield: 'tower' },
  iron_shield: { shield: 'kite' },
  steel_shield: { shield: 'heater' },
  tower_shield: { shield: 'tower' },
  void_codex: { shield: 'book' },
};

/** Material from an id prefix, for weapons and pieces outside sets. */
const PREFIX: Array<[string, Ramp, Ramp, number?]> = [
  ['bronze_', MAT.bronze, MAT.leather],
  ['iron_', MAT.iron, MAT.leather],
  ['steel_', MAT.steel, MAT.gunmetal],
  ['starsteel_', MAT.starsteel, MAT.steel, 0xc8ecff],
  ['darkstone_', MAT.darkstone, MAT.crimson, 0xff3a20],
  ['moonsilver_', MAT.silver, MAT.starsteel, 0x9adcff],
  ['gilded_', MAT.gold, MAT.crimson, 0xff3a3a],
  ['bone_', MAT.bone, MAT.darkleather],
  ['frost', MAT.frost, MAT.silver, 0x9fe6ff],
  ['glaci', MAT.frost, MAT.silver, 0x9fe6ff],
  ['dragon', MAT.dragon, MAT.gold, 0xff6a20],
  ['demon', MAT.hell, MAT.darkstone, 0xff5a10],
  ['fur_', MAT.fur, MAT.leather],
  ['leather_', MAT.leather, MAT.darkleather],
  ['dwarven_', MAT.dwarven, MAT.iron],
  ['elven_', MAT.elven, MAT.gold, 0x7af0a0],
];

function tierOf(d: ItemDef): number {
  const lvl = d.level ?? 1;
  const t = lvl < 10 ? 0 : lvl < 30 ? 1 : lvl < 55 ? 2 : lvl < 80 ? 3 : 4;
  return Math.min(5, t + (d.rarity === 'legendary' ? 1 : 0));
}

const cache = new Map<string, GearLook>();

/**
 * The look of an equippable item. `legacy` is the old single colour of the
 * item (from LOOKS/HELMETS/ARMOR_LOOK/LEGS/BOOTS/SHIELDS) used when neither a
 * set nor a prefix says what it is made of; `legacyTrim` likewise.
 */
export function gearLook(d: ItemDef, legacy?: number, legacyTrim?: number): GearLook {
  const hit = cache.get(d.id);
  if (hit) return hit;
  const set = d.setId ? SET_LOOK[d.setId] : undefined;
  const own = ITEM_LOOK[d.id];
  const pre = PREFIX.find(([p]) => d.id.startsWith(p));
  const m = own?.m ?? set?.m ?? pre?.[1] ?? rampOf(legacy ?? 0x8a8f9a);
  const t = own?.t ?? set?.t ?? pre?.[2] ?? rampOf(legacyTrim ?? 0x4a3322);
  const look: GearLook = {
    ...BASE,
    ...(set ?? {}),
    ...(own ?? {}),
    m, t,
    gem: own?.gem ?? set?.gem ?? pre?.[3],
    tier: tierOf(d),
  };
  cache.set(d.id, look);
  return look;
}

/** `#rrggbb` of a colour number. */
export const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

// ------------------------------------------------------------------ painted style: the grim palette

/**
 * Painted style (render/style.ts), owner 2026-10-23: worn gear in a darker, duller palette —
 * tarnished gold, blued and smoke-dark steel, dried-blood crimson, dull plum robes — that
 * keeps every material's hue so each gear set still reads as itself. Only the 3D models
 * use it (gear3d.ts, weapons.ts, shields3d.ts); item icons keep the bright ramps above.
 */
export const GRIM_MAT: Record<MatKey, Ramp> = {
  bronze: [0xb38a5e, 0x855c35, 0x4f331c, 0x221509],
  iron: [0xa5a099, 0x6e6963, 0x403c39, 0x191816],
  steel: [0xaab0b6, 0x7e848c, 0x484d54, 0x18191c],
  silver: [0xb6b9bd, 0x8f9399, 0x56595f, 0x202227],
  gold: [0xc5aa6a, 0x957846, 0x594324, 0x261a0c],
  starsteel: [0xa8bee1, 0x6278a0, 0x344462, 0x141c32],
  darkstone: [0x725b68, 0x3c2e34, 0x1e1619, 0x080505],
  crimson: [0xb25646, 0x7f261d, 0x43110c, 0x190505],
  dragon: [0x9bc67c, 0x4f7842, 0x2b4524, 0x0d1d0d],
  frost: [0xb4c6ce, 0x7e9aa8, 0x4a6676, 0x182a36],
  hell: [0x824132, 0x521e13, 0x2a0b08, 0x0c0202],
  bone: [0xd4caae, 0xaa9c7c, 0x72664c, 0x2e2618],
  leather: [0xa67d58, 0x705133, 0x422e1a, 0x1d1309],
  darkleather: [0x765e47, 0x453424, 0x261a10, 0x100905],
  wood: [0x8a6a46, 0x5c4228, 0x372714, 0x190f08],
  fur: [0xc2b69e, 0x988a70, 0x625644, 0x2c2418],
  ranger: [0x808e60, 0x505b3a, 0x2e351f, 0x11160a],
  elven: [0xb2c69e, 0x758d6c, 0x425644, 0x16251a],
  arcane: [0x7a6b87, 0x4b3e58, 0x2a2234, 0x100817],
  rime: [0xbdd6e4, 0x769aaf, 0x406378, 0x152937],
  void: [0x6f5e82, 0x362b41, 0x1b1326, 0x080410],
  sky: [0xc8ced4, 0xa0acb8, 0x667484, 0x24303c],
  royal: [0x6c7cac, 0x374676, 0x1c2446, 0x080c1e],
  gunmetal: [0x8f949b, 0x595e65, 0x32353a, 0x111213],
  dwarven: [0xb89f6e, 0x8a6e40, 0x554022, 0x221909],
  cloth: [0xc2b69a, 0x988a6c, 0x625640, 0x282216],
  tide: [0x94d4c6, 0x46847a, 0x234e48, 0x0a2320],
  pearl: [0xdad2c2, 0xbab09c, 0x807664, 0x322c22],
};

/** The material key of a ramp from MAT (by identity), if it is one. */
export function matKeyOf(r: Ramp): MatKey | undefined {
  for (const k in MAT) if (MAT[k as MatKey] === r) return k as MatKey;
  return undefined;
}

/** A colour pulled toward its grey by k and dimmed by `dim` (for colours outside the ramps). */
export function grimColor(c: number, k = 0.4, dim = 0.82): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const l = r * 0.3 + g * 0.55 + b * 0.15;
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round((v + (l - v) * k) * dim)));
  return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

/** A ramp in the grim palette: the grim twin of a MAT ramp, else each colour toned down. */
export function grimRamp(r: Ramp): Ramp {
  const k = matKeyOf(r);
  if (k) return GRIM_MAT[k];
  return [grimColor(r[0]), grimColor(r[1]), grimColor(r[2]), grimColor(r[3])];
}

const grimCache = new Map<GearLook, GearLook>();
/** A gear look in the grim palette (ramps, cape, plume and gem toned; shapes and tier kept). */
export function grimLook(lk: GearLook): GearLook {
  let g = grimCache.get(lk);
  if (!g) {
    g = {
      ...lk,
      m: grimRamp(lk.m), t: grimRamp(lk.t),
      cape: lk.cape !== undefined ? grimColor(lk.cape, 0.35, 0.78) : undefined,
      plume: lk.plume !== undefined ? grimColor(lk.plume, 0.3, 0.8) : undefined,
      gem: lk.gem !== undefined ? grimColor(lk.gem, 0.15, 0.85) : undefined,
      glow: lk.glow !== undefined ? grimColor(lk.glow, 0.2, 0.8) : undefined,
    };
    grimCache.set(lk, g);
  }
  return g;
}

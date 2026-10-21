import type { Element } from '../inventory/items';
import type { EnemyKind } from '../world/WorldMap';

export interface LootEntry {
  id: string;
  chance: number;
  min: number;
  max: number;
}

/**
 * A special attack. `ranged` fires a projectile at the target, `blast` hits an
 * area around the target, `nova` hits an area around the monster, `heal`
 * restores its own health.
 */
export interface Ability {
  kind: 'ranged' | 'blast' | 'nova' | 'heal';
  name: string;
  element: Element;
  min: number;
  max: number;
  range: number;
  radius: number;
  interval: number;
  /** Projectile / effect look. */
  effect: 'fire' | 'energy' | 'ice' | 'earth' | 'death' | 'holy' | 'arrow' | 'spear' | 'stone' | 'heal';
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  maxHp: number;
  minDmg: number;
  maxDmg: number;
  /** Physical damage absorbed per hit (rolled 0..armor). */
  armor: number;
  attackInterval: number;
  stepTime: number;
  aggroRange: number;
  /** Max distance from spawn before giving up and returning. */
  leash: number;
  wanderRadius: number;
  exp: number;
  respawn: number;
  loot: LootEntry[];
  abilities: Ability[];
  /** Percent reduction per element; negative = weakness, 100 = immune. */
  resist: Partial<Record<Element, number>>;
  /** Ranged fighters try to keep this distance instead of closing in. */
  kite?: number;
  /** Elite monsters are tougher and announced with a coloured name. */
  elite?: boolean;
}

const A = (kind: Ability['kind'], name: string, element: Element, min: number, max: number, interval: number, effect: Ability['effect'], range = 4, radius = 0): Ability =>
  ({ kind, name, element, min, max, range, radius, interval, effect });

const L = (id: string, chance: number, min = 1, max = 1): LootEntry => ({ id, chance, min, max });

type Base = Omit<EnemyDef, 'abilities' | 'resist' | 'kind'> & Partial<Pick<EnemyDef, 'abilities' | 'resist'>>;
const E = (kind: EnemyKind, d: Base): EnemyDef => ({ abilities: [], resist: {}, ...d, kind });

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  // --- beginners ---------------------------------------------------------------
  rat: E('rat', {
    name: 'Rat', maxHp: 25, minDmg: 1, maxDmg: 7, armor: 1, attackInterval: 1.4, stepTime: 0.36, aggroRange: 4, leash: 9, wanderRadius: 3, exp: 8, respawn: 20,
    loot: [L('gold', 0.7, 1, 5), L('cheese', 0.3), L('rat_tail', 0.5)],
  }),
  wolf: E('wolf', {
    name: 'Wolf', maxHp: 55, minDmg: 3, maxDmg: 13, armor: 2, attackInterval: 1.5, stepTime: 0.3, aggroRange: 6, leash: 11, wanderRadius: 3, exp: 25, respawn: 30,
    loot: [L('gold', 0.6, 2, 9), L('meat', 0.45, 1, 2), L('wolf_pelt', 0.35)],
  }),
  skeleton: E('skeleton', {
    name: 'Skeleton', maxHp: 90, minDmg: 6, maxDmg: 19, armor: 4, attackInterval: 1.8, stepTime: 0.42, aggroRange: 5, leash: 9, wanderRadius: 2, exp: 55, respawn: 40,
    resist: { death: 100, holy: -25, ice: 20 },
    loot: [L('gold', 0.8, 5, 20), L('bone', 0.6, 1, 2), L('health_potion', 0.2), L('iron_sword', 0.06), L('iron_mace', 0.06), L('chain_helmet', 0.05)],
  }),
  // --- orcs ----------------------------------------------------------------------
  orc: E('orc', {
    name: 'Orc', maxHp: 140, minDmg: 8, maxDmg: 32, armor: 7, attackInterval: 1.6, stepTime: 0.34, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 90, respawn: 45,
    loot: [L('gold', 0.9, 6, 28), L('meat', 0.3, 1, 2), L('orc_tooth', 0.45, 1, 2), L('hatchet', 0.08), L('leather_legs', 0.08), L('chain_armor', 0.03)],
  }),
  orc_spearman: E('orc_spearman', {
    name: 'Orc Spearman', maxHp: 120, minDmg: 4, maxDmg: 14, armor: 5, attackInterval: 1.8, stepTime: 0.34, aggroRange: 7, leash: 10, wanderRadius: 3, exp: 95, respawn: 45,
    kite: 3,
    abilities: [A('ranged', 'thrown spear', 'physical', 10, 38, 2.2, 'spear', 4)],
    loot: [L('gold', 0.9, 6, 25), L('spear', 0.5, 1, 4), L('orc_tooth', 0.3)],
  }),
  orc_shaman: E('orc_shaman', {
    name: 'Orc Shaman', maxHp: 110, minDmg: 4, maxDmg: 16, armor: 4, attackInterval: 2, stepTime: 0.38, aggroRange: 7, leash: 10, wanderRadius: 2, exp: 120, respawn: 50,
    kite: 3, resist: { energy: 20 },
    abilities: [A('ranged', 'spirit bolt', 'energy', 12, 40, 3.2, 'energy', 4), A('heal', 'mending chant', 'holy', 25, 45, 7, 'heal')],
    loot: [L('gold', 0.9, 8, 34), L('mana_potion', 0.25), L('orc_charm', 0.4), L('spark_rune', 0.2, 1, 5), L('wand_of_sparks', 0.03)],
  }),
  orc_warrior: E('orc_warrior', {
    name: 'Orc Warrior', maxHp: 220, minDmg: 12, maxDmg: 48, armor: 11, attackInterval: 1.6, stepTime: 0.34, aggroRange: 6, leash: 11, wanderRadius: 5, exp: 170, respawn: 50,
    loot: [L('gold', 0.95, 10, 40), L('orc_tooth', 0.5, 1, 2), L('battle_axe', 0.05), L('iron_helmet', 0.06), L('chain_legs', 0.06), L('ham', 0.2)],
  }),
  orc_berserker: E('orc_berserker', {
    name: 'Orc Berserker', maxHp: 260, minDmg: 15, maxDmg: 70, armor: 8, attackInterval: 1.3, stepTime: 0.26, aggroRange: 7, leash: 11, wanderRadius: 4, exp: 230, respawn: 60,
    loot: [L('gold', 0.95, 15, 50), L('orc_tooth', 0.5, 1, 3), L('morning_star', 0.05), L('double_axe', 0.02)],
  }),
  orc_leader: E('orc_leader', {
    name: 'Orc Leader', maxHp: 450, minDmg: 20, maxDmg: 90, armor: 14, attackInterval: 1.7, stepTime: 0.33, aggroRange: 7, leash: 10, wanderRadius: 3, exp: 380, respawn: 90,
    abilities: [A('ranged', 'hurled axe', 'physical', 25, 70, 4, 'spear', 3)],
    loot: [L('gold', 1, 30, 90), L('orc_warhelm', 0.05), L('plate_armor', 0.03), L('orc_banner', 0.15), L('strong_health_potion', 0.1), L('small_ruby', 0.04)],
  }),
  orc_warlord: E('orc_warlord', {
    name: 'Orc Warlord', maxHp: 1400, minDmg: 30, maxDmg: 140, armor: 20, attackInterval: 1.6, stepTime: 0.3, aggroRange: 7, leash: 8, wanderRadius: 2, exp: 1100, respawn: 300,
    elite: true,
    abilities: [A('nova', 'whirling axes', 'physical', 40, 120, 5, 'stone', 0, 1)],
    loot: [L('gold', 1, 150, 400), L('orc_warhelm', 0.2), L('double_axe', 0.12), L('tower_shield', 0.06), L('ring_of_might', 0.04), L('orc_banner', 0.5), L('small_diamond', 0.1)],
  }),
  // --- elves -----------------------------------------------------------------------
  elf: E('elf', {
    name: 'Elf', maxHp: 130, minDmg: 8, maxDmg: 30, armor: 6, attackInterval: 1.5, stepTime: 0.3, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 85, respawn: 45,
    resist: { earth: 20 },
    loot: [L('gold', 0.85, 6, 30), L('elvish_talisman', 0.25), L('arrow', 0.4, 3, 10), L('leather_boots', 0.1), L('hunting_bow', 0.05)],
  }),
  elf_scout: E('elf_scout', {
    name: 'Elf Scout', maxHp: 160, minDmg: 5, maxDmg: 15, armor: 6, attackInterval: 1.6, stepTime: 0.28, aggroRange: 8, leash: 11, wanderRadius: 4, exp: 140, respawn: 50,
    kite: 4, resist: { earth: 20 },
    abilities: [A('ranged', 'arrow', 'physical', 20, 55, 2, 'arrow', 5)],
    loot: [L('gold', 0.9, 10, 40), L('arrow', 0.6, 5, 15), L('poison_arrow', 0.2, 2, 8), L('elvish_talisman', 0.25), L('composite_bow', 0.03), L('traveler_boots', 0.03)],
  }),
  elf_arcanist: E('elf_arcanist', {
    name: 'Elf Arcanist', maxHp: 220, minDmg: 6, maxDmg: 20, armor: 5, attackInterval: 2, stepTime: 0.3, aggroRange: 8, leash: 10, wanderRadius: 3, exp: 220, respawn: 60,
    kite: 3, resist: { energy: 20, earth: 20 },
    abilities: [A('ranged', 'arcane bolt', 'energy', 30, 80, 3, 'energy', 4), A('heal', 'sylvan blessing', 'holy', 40, 90, 7, 'heal')],
    loot: [L('gold', 0.95, 20, 60), L('elven_scroll', 0.2), L('mana_potion', 0.3), L('mage_robe', 0.04), L('rod_of_thorns', 0.02), L('wand_of_embers', 0.02), L('sapphire_ring', 0.02)],
  }),
  elf_warden: E('elf_warden', {
    name: 'Elf Warden', maxHp: 700, minDmg: 25, maxDmg: 80, armor: 15, attackInterval: 1.6, stepTime: 0.29, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 600, respawn: 180,
    elite: true, kite: 3, resist: { earth: 30, energy: 15 },
    abilities: [A('ranged', 'heartwood arrow', 'physical', 45, 120, 2.6, 'arrow', 6), A('blast', 'thorn burst', 'earth', 40, 100, 6, 'earth', 5, 1)],
    loot: [L('gold', 1, 80, 200), L('elven_longbow', 0.05), L('elven_mail', 0.04), L('elven_leggings', 0.05), L('elven_circlet', 0.04), L('elven_aegis', 0.03), L('small_emerald', 0.15)],
  }),
  // --- jungle -----------------------------------------------------------------------
  crocodile: E('crocodile', {
    name: 'Crocodile', maxHp: 240, minDmg: 15, maxDmg: 55, armor: 12, attackInterval: 1.7, stepTime: 0.38, aggroRange: 5, leash: 9, wanderRadius: 3, exp: 150, respawn: 50,
    resist: { ice: 15, earth: 10 },
    loot: [L('gold', 0.8, 8, 30), L('crocodile_leather', 0.4), L('meat', 0.3), L('leather_armor', 0.05)],
  }),
  tarantula: E('tarantula', {
    name: 'Tarantula', maxHp: 260, minDmg: 15, maxDmg: 50, armor: 9, attackInterval: 1.5, stepTime: 0.3, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 170, respawn: 50,
    resist: { earth: 60, fire: -15 },
    abilities: [A('ranged', 'venom spit', 'earth', 25, 60, 4, 'earth', 3)],
    loot: [L('gold', 0.8, 10, 35), L('spider_silk', 0.4), L('poison_arrow', 0.15, 3, 8), L('jade_amulet', 0.01)],
  }),
  jungle_troll: E('jungle_troll', {
    name: 'Jungle Troll', maxHp: 320, minDmg: 20, maxDmg: 65, armor: 12, attackInterval: 1.6, stepTime: 0.33, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 240, respawn: 55,
    abilities: [A('heal', 'troll regeneration', 'holy', 30, 60, 8, 'heal')],
    loot: [L('gold', 0.9, 15, 45), L('troll_hair', 0.4), L('ham', 0.2), L('throwing_star', 0.2, 3, 8), L('steel_boots', 0.01), L('ring_of_vigor', 0.02)],
  }),
  hydra: E('hydra', {
    name: 'Hydra', maxHp: 2350, minDmg: 40, maxDmg: 150, armor: 22, attackInterval: 1.8, stepTime: 0.4, aggroRange: 6, leash: 8, wanderRadius: 2, exp: 2100, respawn: 120,
    resist: { ice: 50, earth: 100, fire: -10, energy: 10 },
    abilities: [
      A('ranged', 'frost breath', 'ice', 80, 200, 4, 'ice', 4),
      A('blast', 'venom splash', 'earth', 70, 160, 6, 'earth', 4, 1),
      A('heal', 'regrowth', 'holy', 150, 300, 10, 'heal'),
    ],
    loot: [L('gold', 1, 60, 230), L('hydra_head', 0.12), L('hydra_egg', 0.05), L('strong_mana_potion', 0.2), L('hydra_legs', 0.02), L('frost_pendant', 0.03), L('rod_of_glaciers', 0.01), L('small_sapphire', 0.08)],
  }),
  // --- the descent ---------------------------------------------------------------------
  ghoul: E('ghoul', {
    name: 'Ghoul', maxHp: 280, minDmg: 15, maxDmg: 60, armor: 9, attackInterval: 1.6, stepTime: 0.36, aggroRange: 6, leash: 10, wanderRadius: 3, exp: 180, respawn: 50,
    resist: { death: 100, holy: -30, earth: 30 },
    abilities: [A('ranged', 'grave chill', 'death', 25, 55, 5, 'death', 3)],
    loot: [L('gold', 0.9, 15, 50), L('ghoul_snack', 0.5), L('bone', 0.5, 1, 2), L('health_potion', 0.2), L('golden_goblet', 0.01)],
  }),
  fire_elemental: E('fire_elemental', {
    name: 'Fire Elemental', maxHp: 500, minDmg: 20, maxDmg: 70, armor: 10, attackInterval: 1.8, stepTime: 0.32, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 420, respawn: 60,
    resist: { fire: 100, ice: -30, energy: 30, earth: 20 },
    abilities: [A('nova', 'flame burst', 'fire', 40, 95, 4, 'fire', 0, 1), A('ranged', 'fire bolt', 'fire', 45, 100, 4.5, 'fire', 4)],
    loot: [L('gold', 0.95, 30, 90), L('fiery_heart', 0.15), L('fireball_rune', 0.2, 2, 6), L('garnet_amulet', 0.02), L('emberwalk_boots', 0.008), L('small_ruby', 0.08)],
  }),
  behemoth: E('behemoth', {
    name: 'Behemoth', maxHp: 4000, minDmg: 60, maxDmg: 280, armor: 30, attackInterval: 2, stepTime: 0.38, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 2600, respawn: 150,
    resist: { physical: 10, fire: 15, holy: 10 },
    abilities: [A('ranged', 'hurled boulder', 'physical', 80, 220, 5, 'stone', 5)],
    loot: [L('gold', 1, 100, 300), L('behemoth_claw', 0.08), L('great_health_potion', 0.15), L('plate_legs', 0.05), L('steel_boots', 0.04), L('thunder_maul', 0.006), L('small_diamond', 0.12)],
  }),
  demon: E('demon', {
    name: 'Demon', maxHp: 8200, minDmg: 80, maxDmg: 420, armor: 40, attackInterval: 2, stepTime: 0.34, aggroRange: 7, leash: 8, wanderRadius: 2, exp: 6000, respawn: 300,
    elite: true, resist: { fire: 100, physical: 25, energy: 40, death: 20, holy: -20, ice: -10 },
    abilities: [
      A('blast', 'hellfire', 'fire', 120, 300, 5, 'fire', 5, 2),
      A('ranged', 'abyssal bolt', 'energy', 100, 260, 4, 'energy', 5),
      A('heal', 'dark mending', 'holy', 300, 600, 12, 'heal'),
    ],
    loot: [
      L('gold', 1, 200, 600), L('demonic_essence', 0.3), L('demon_horn', 0.1), L('great_mana_potion', 0.3), L('great_health_potion', 0.3),
      L('demon_shield', 0.02), L('demon_helm', 0.012), L('demonplate', 0.006), L('demon_legs', 0.01), L('demon_reaver', 0.005),
      L('demonbone_amulet', 0.01), L('windstride_boots', 0.008), L('wand_of_inferno', 0.01), L('rod_of_wilds', 0.01), L('small_diamond', 0.3),
    ],
  }),
  // --- dragons ------------------------------------------------------------------------------
  dragon: E('dragon', {
    name: 'Dragon', maxHp: 1000, minDmg: 15, maxDmg: 70, armor: 18, attackInterval: 2, stepTime: 0.42, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 700, respawn: 75,
    resist: { fire: 100, ice: -10, earth: 20 },
    abilities: [A('ranged', 'fire breath', 'fire', 40, 110, 5, 'fire', 4), A('blast', 'fireball', 'fire', 50, 120, 7, 'fire', 5, 1)],
    loot: [L('gold', 1, 30, 120), L('dragon_scale', 0.5, 1, 2), L('health_potion', 0.35, 1, 2), L('ember_blade', 0.02), L('dragon_shield', 0.04), L('dragon_helm', 0.01), L('infernal_bolt', 0.1, 3, 10)],
  }),
  dragon_lord: E('dragon_lord', {
    name: 'Dragon Lord', maxHp: 1900, minDmg: 25, maxDmg: 110, armor: 24, attackInterval: 2, stepTime: 0.4, aggroRange: 7, leash: 8, wanderRadius: 2, exp: 2100, respawn: 150,
    resist: { fire: 100, ice: -10, earth: 20 },
    abilities: [A('blast', 'firestorm', 'fire', 90, 220, 5, 'fire', 5, 2), A('ranged', 'searing breath', 'fire', 100, 200, 4, 'fire', 5)],
    loot: [L('gold', 1, 80, 260), L('red_dragon_scale', 0.3), L('dragon_scale', 0.8, 2, 4), L('strong_health_potion', 0.4), L('dragonbone_cleaver', 0.02), L('dragon_scale_mail', 0.03), L('dragonhide_pack', 0.01), L('dragonbane_crossbow', 0.004), L('small_ruby', 0.2)],
  }),
};

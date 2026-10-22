import type { Element } from '../inventory/items';
import type { EnemyKind } from '../world/WorldMap';
import { SET_DROPS } from '../inventory/sets';
import { CAPE_DROPS } from '../inventory/capes';

export interface LootEntry {
  id: string;
  chance: number;
  min: number;
  max: number;
}

/**
 * A special attack. `ranged` fires a projectile at the target, `blast` hits an
 * area around the target, `nova` hits an area around the monster, `heal`
 * restores its own health, `wave` breathes a cone and `beam` a straight line
 * towards the target (as long as `range`), `summon` calls helpers (bosses).
 */
export interface Ability {
  kind: 'ranged' | 'blast' | 'nova' | 'heal' | 'wave' | 'beam' | 'summon';
  name: string;
  element: Element;
  min: number;
  max: number;
  range: number;
  radius: number;
  interval: number;
  /** Projectile / effect look. */
  effect: 'fire' | 'energy' | 'ice' | 'earth' | 'death' | 'holy' | 'arrow' | 'spear' | 'stone' | 'heal';
  /** Summons: which monster, how many per call and how many may live at once. */
  summon?: EnemyKind;
  count?: number;
  maxAlive?: number;
}

/** Bosses: dungeon bosses (one per region, long respawn), world bosses (scheduled, overworld), raid bosses (end a raid). */
export type BossKind = 'dungeon' | 'world' | 'raid';

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
  /** Bosses: what kind, and the title shown under the name ("the Rime Wyrm"). */
  boss?: BossKind;
  title?: string;
  /** Below this share of health the monster enrages once: +50% damage, faster attacks and abilities. */
  enrage?: number;
}

const A = (kind: Ability['kind'], name: string, element: Element, min: number, max: number, interval: number, effect: Ability['effect'], range = 4, radius = 0): Ability =>
  ({ kind, name, element, min, max, range, radius, interval, effect });

/** A summoning ability: `count` helpers of `kind` per call, never more than `maxAlive` at once. */
const S = (name: string, kind: EnemyKind, count: number, maxAlive: number, interval: number): Ability =>
  ({ kind: 'summon', name, element: 'physical', min: 0, max: 0, range: 3, radius: 0, interval, effect: 'death', summon: kind, count, maxAlive });

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
    loot: [L('gold', 0.6, 2, 9), L('meat', 0.45, 1, 2), L('wolf_pelt', 0.35), L('raw_meat', 0.4)],
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
  // --- wild animals (beginner prey) ---------------------------------------------------
  silver_rabbit: E('silver_rabbit', {
    name: 'Silver Rabbit', maxHp: 18, minDmg: 0, maxDmg: 2, armor: 0, attackInterval: 1.6, stepTime: 0.26, aggroRange: 0, leash: 8, wanderRadius: 4, exp: 6, respawn: 20,
    resist: { ice: 20 },
    loot: [L('meat', 0.4), L('silver_fur', 0.5), L('raw_meat', 0.35)],
  }),
  deer: E('deer', {
    name: 'Deer', maxHp: 30, minDmg: 0, maxDmg: 3, armor: 1, attackInterval: 1.6, stepTime: 0.27, aggroRange: 0, leash: 9, wanderRadius: 5, exp: 12, respawn: 25,
    loot: [L('meat', 0.6, 1, 3), L('ham', 0.25), L('antlers', 0.2), L('raw_meat', 0.5, 1, 2), L('raw_ham', 0.2)],
  }),
  snake: E('snake', {
    name: 'Snake', maxHp: 30, minDmg: 1, maxDmg: 9, armor: 1, attackInterval: 1.4, stepTime: 0.38, aggroRange: 4, leash: 8, wanderRadius: 3, exp: 12, respawn: 20,
    resist: { earth: 60, ice: -15 },
    loot: [L('snakeskin', 0.35), L('gold', 0.3, 1, 3)],
  }),
  dire_penguin: E('dire_penguin', {
    name: 'Dire Penguin', maxHp: 45, minDmg: 1, maxDmg: 10, armor: 2, attackInterval: 1.5, stepTime: 0.4, aggroRange: 3, leash: 8, wanderRadius: 3, exp: 18, respawn: 25,
    resist: { ice: 60, fire: -15 },
    loot: [L('fish', 0.6, 1, 2), L('penguin_feather', 0.4), L('gold', 0.3, 1, 4), L('feather', 0.6, 2, 6)],
  }),
  winter_wolf: E('winter_wolf', {
    name: 'Winter Wolf', maxHp: 75, minDmg: 4, maxDmg: 18, armor: 3, attackInterval: 1.5, stepTime: 0.29, aggroRange: 6, leash: 11, wanderRadius: 4, exp: 38, respawn: 30,
    resist: { ice: 50, fire: -15 },
    loot: [L('meat', 0.5, 1, 2), L('winter_wolf_fur', 0.35), L('gold', 0.3, 2, 8), L('raw_meat', 0.4)],
  }),
  bear: E('bear', {
    name: 'Bear', maxHp: 130, minDmg: 6, maxDmg: 28, armor: 4, attackInterval: 1.7, stepTime: 0.36, aggroRange: 5, leash: 9, wanderRadius: 3, exp: 65, respawn: 40,
    loot: [L('meat', 0.6, 1, 3), L('ham', 0.35), L('bear_paw', 0.25), L('gold', 0.3, 3, 10), L('raw_meat', 0.5, 1, 2), L('raw_ham', 0.3), L('bear_hide', 0.3)],
  }),
  polar_bear: E('polar_bear', {
    name: 'Polar Bear', maxHp: 240, minDmg: 12, maxDmg: 48, armor: 7, attackInterval: 1.7, stepTime: 0.36, aggroRange: 5, leash: 9, wanderRadius: 3, exp: 135, respawn: 45,
    resist: { ice: 50, fire: -10 },
    loot: [L('meat', 0.6, 1, 3), L('ham', 0.4, 1, 2), L('polar_bear_fur', 0.3), L('bear_paw', 0.2), L('raw_meat', 0.5, 1, 2), L('raw_ham', 0.35)],
  }),
  // --- outlaws & mountain folk (beginner) ------------------------------------------
  bandit: E('bandit', {
    name: 'Bandit', maxHp: 80, minDmg: 4, maxDmg: 18, armor: 3, attackInterval: 1.6, stepTime: 0.32, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 42, respawn: 35,
    loot: [L('gold', 0.9, 4, 22), L('short_sword', 0.08), L('iron_mace', 0.05), L('leather_helmet', 0.1), L('leather_armor', 0.08), L('health_potion', 0.12), L('ham', 0.15)],
  }),
  dwarf: E('dwarf', {
    name: 'Dwarf', maxHp: 95, minDmg: 4, maxDmg: 20, armor: 6, attackInterval: 1.7, stepTime: 0.36, aggroRange: 5, leash: 9, wanderRadius: 3, exp: 48, respawn: 35,
    resist: { earth: 10, fire: 10 },
    loot: [L('gold', 0.8, 4, 18), L('iron_ore', 0.3), L('hatchet', 0.08), L('chain_helmet', 0.05), L('mead', 0.2), L('shovel', 0.03)],
  }),
  dwarf_soldier: E('dwarf_soldier', {
    name: 'Dwarf Soldier', maxHp: 140, minDmg: 4, maxDmg: 16, armor: 8, attackInterval: 1.8, stepTime: 0.36, aggroRange: 7, leash: 10, wanderRadius: 3, exp: 85, respawn: 40,
    kite: 3, resist: { earth: 10, fire: 10 },
    abilities: [A('ranged', 'crossbow bolt', 'physical', 12, 36, 2.4, 'arrow', 5)],
    loot: [L('gold', 0.9, 6, 25), L('bolt', 0.6, 3, 10), L('iron_ore', 0.25), L('light_crossbow', 0.04), L('dwarven_shield', 0.04), L('dwarven_helmet', 0.02)],
  }),
  dwarf_guard: E('dwarf_guard', {
    name: 'Dwarf Guard', maxHp: 270, minDmg: 12, maxDmg: 55, armor: 15, attackInterval: 1.7, stepTime: 0.36, aggroRange: 6, leash: 10, wanderRadius: 3, exp: 170, respawn: 50,
    resist: { earth: 15, fire: 10, physical: 5 },
    loot: [L('gold', 0.95, 10, 40), L('iron_ore', 0.35, 1, 2), L('dwarven_axe', 0.03), L('dwarven_helmet', 0.05), L('dwarven_shield', 0.06), L('dwarven_legs', 0.03), L('dwarven_armor', 0.015), L('mead', 0.2)],
  }),
  // --- frostkin (small ice tribe) ---------------------------------------------------
  frostkin: E('frostkin', {
    name: 'Frostkin', maxHp: 90, minDmg: 4, maxDmg: 20, armor: 4, attackInterval: 1.5, stepTime: 0.3, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 55, respawn: 35,
    resist: { ice: 60, fire: -15 },
    loot: [L('gold', 0.7, 3, 18), L('fish', 0.4, 1, 2), L('frost_charm', 0.2), L('spear', 0.2, 1, 2), L('fur_cap', 0.04)],
  }),
  frostkin_toolshaper: E('frostkin_toolshaper', {
    name: 'Frostkin Toolshaper', maxHp: 130, minDmg: 8, maxDmg: 30, armor: 7, attackInterval: 1.6, stepTime: 0.31, aggroRange: 6, leash: 10, wanderRadius: 3, exp: 80, respawn: 40,
    resist: { ice: 60, fire: -15 },
    loot: [L('gold', 0.8, 6, 24), L('fish', 0.3), L('frost_charm', 0.3), L('tusk_club', 0.06), L('fur_boots', 0.04), L('fur_bag', 0.03), L('small_sapphire', 0.01)],
  }),
  frostkin_windcaller: E('frostkin_windcaller', {
    name: 'Frostkin Windcaller', maxHp: 115, minDmg: 4, maxDmg: 14, armor: 4, attackInterval: 2, stepTime: 0.33, aggroRange: 7, leash: 10, wanderRadius: 2, exp: 100, respawn: 45,
    kite: 3, resist: { ice: 80, fire: -15 },
    abilities: [A('ranged', 'ice shard', 'ice', 14, 42, 3, 'ice', 4), A('heal', 'tundra song', 'holy', 20, 40, 8, 'heal')],
    loot: [L('gold', 0.85, 6, 28), L('frost_charm', 0.45), L('mana_potion', 0.2), L('fish', 0.3), L('rod_of_frost', 0.02), L('avalanche_rune', 0.08, 1, 3)],
  }),
  // --- amazons & valkyries --------------------------------------------------------
  amazon: E('amazon', {
    name: 'Amazon', maxHp: 150, minDmg: 6, maxDmg: 26, armor: 6, attackInterval: 1.5, stepTime: 0.3, aggroRange: 7, leash: 10, wanderRadius: 4, exp: 105, respawn: 45,
    kite: 2,
    abilities: [A('ranged', 'thrown knife', 'physical', 12, 40, 2.6, 'spear', 4)],
    loot: [L('gold', 0.9, 6, 28), L('braided_cord', 0.3), L('spear', 0.3, 1, 3), L('iron_sword', 0.04), L('health_potion', 0.15), L('small_ruby', 0.01)],
  }),
  valkyrie: E('valkyrie', {
    name: 'Valkyrie', maxHp: 270, minDmg: 12, maxDmg: 50, armor: 10, attackInterval: 1.6, stepTime: 0.31, aggroRange: 7, leash: 10, wanderRadius: 4, exp: 210, respawn: 50,
    kite: 3, resist: { ice: 15 },
    abilities: [A('ranged', 'hurled spear', 'physical', 22, 65, 2.4, 'spear', 4)],
    loot: [L('gold', 0.95, 12, 45), L('braided_cord', 0.35), L('spear', 0.5, 1, 4), L('royal_spear', 0.15, 1, 3), L('winged_helmet', 0.02), L('chain_legs', 0.06), L('plate_armor', 0.015), L('health_potion', 0.2)],
  }),
  // --- barbarians -----------------------------------------------------------------
  barbarian_raider: E('barbarian_raider', {
    name: 'Barbarian Raider', maxHp: 250, minDmg: 12, maxDmg: 52, armor: 9, attackInterval: 1.6, stepTime: 0.31, aggroRange: 7, leash: 11, wanderRadius: 4, exp: 175, respawn: 50,
    resist: { ice: 20, fire: -5 },
    loot: [L('gold', 0.9, 10, 40), L('mead', 0.3), L('barbarian_axe', 0.05), L('fur_cap', 0.08), L('fur_legs', 0.06), L('fur_armor', 0.03), L('health_potion', 0.15)],
  }),
  barbarian_headsplitter: E('barbarian_headsplitter', {
    name: 'Barbarian Headsplitter', maxHp: 290, minDmg: 10, maxDmg: 40, armor: 9, attackInterval: 1.7, stepTime: 0.31, aggroRange: 7, leash: 11, wanderRadius: 3, exp: 215, respawn: 50,
    kite: 3, resist: { ice: 20, fire: -5 },
    abilities: [A('ranged', 'hurled axe', 'physical', 24, 72, 2.6, 'spear', 4)],
    loot: [L('gold', 0.9, 12, 45), L('mead', 0.3), L('skull_trophy', 0.08), L('barbarian_axe', 0.04), L('fur_boots', 0.06), L('fur_bag', 0.04)],
  }),
  barbarian_skullhunter: E('barbarian_skullhunter', {
    name: 'Barbarian Skullhunter', maxHp: 360, minDmg: 18, maxDmg: 75, armor: 12, attackInterval: 1.6, stepTime: 0.3, aggroRange: 7, leash: 11, wanderRadius: 4, exp: 255, respawn: 55,
    resist: { ice: 25, fire: -5 },
    loot: [L('gold', 0.95, 15, 55), L('skull_trophy', 0.15), L('barbarian_axe', 0.06), L('fur_armor', 0.05), L('fur_backpack', 0.02), L('berserk_potion', 0.03), L('ham', 0.2)],
  }),
  barbarian_brutetamer: E('barbarian_brutetamer', {
    name: 'Barbarian Brutetamer', maxHp: 240, minDmg: 6, maxDmg: 22, armor: 7, attackInterval: 2, stepTime: 0.32, aggroRange: 7, leash: 10, wanderRadius: 2, exp: 240, respawn: 55,
    kite: 3, resist: { ice: 30, fire: -5 },
    abilities: [A('ranged', 'freezing gale', 'ice', 25, 65, 3, 'ice', 4), A('heal', 'beast-blood draught', 'holy', 45, 90, 6, 'heal')],
    loot: [L('gold', 0.95, 15, 50), L('mead', 0.4, 1, 2), L('polar_bear_fur', 0.12), L('mana_potion', 0.25), L('fur_backpack', 0.03), L('frost_charm', 0.2), L('mastermind_potion', 0.02)],
  }),
  // --- minotaurs & cyclopes (mid) --------------------------------------------------
  minotaur: E('minotaur', {
    name: 'Minotaur', maxHp: 230, minDmg: 12, maxDmg: 50, armor: 11, attackInterval: 1.6, stepTime: 0.33, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 150, respawn: 45,
    resist: { earth: 10 },
    loot: [L('gold', 0.9, 8, 35), L('minotaur_horn', 0.4, 1, 2), L('minotaur_leather', 0.2), L('battle_axe', 0.04), L('chain_armor', 0.04), L('iron_helmet', 0.04), L('meat', 0.2)],
  }),
  minotaur_archer: E('minotaur_archer', {
    name: 'Minotaur Archer', maxHp: 200, minDmg: 5, maxDmg: 18, armor: 9, attackInterval: 1.8, stepTime: 0.33, aggroRange: 8, leash: 11, wanderRadius: 3, exp: 170, respawn: 45,
    kite: 4, resist: { earth: 10 },
    abilities: [A('ranged', 'bolt', 'physical', 20, 60, 2.2, 'arrow', 5)],
    loot: [L('gold', 0.9, 8, 35), L('bolt', 0.6, 4, 12), L('piercing_bolt', 0.2, 2, 6), L('minotaur_horn', 0.3), L('light_crossbow', 0.04), L('heavy_crossbow', 0.004)],
  }),
  minotaur_mage: E('minotaur_mage', {
    name: 'Minotaur Mage', maxHp: 185, minDmg: 4, maxDmg: 16, armor: 6, attackInterval: 2, stepTime: 0.34, aggroRange: 8, leash: 10, wanderRadius: 2, exp: 195, respawn: 50,
    kite: 3, resist: { energy: 30, fire: 20, earth: 10 },
    abilities: [A('ranged', 'arc bolt', 'energy', 25, 70, 3, 'energy', 4), A('blast', 'firecloud', 'fire', 20, 55, 6, 'fire', 4, 1)],
    loot: [L('gold', 0.95, 12, 45), L('minotaur_horn', 0.3), L('mana_potion', 0.3), L('spark_rune', 0.2, 1, 5), L('fireball_rune', 0.06, 1, 3), L('wand_of_sparks', 0.03), L('wand_of_embers', 0.01)],
  }),
  cyclops: E('cyclops', {
    name: 'Cyclops', maxHp: 520, minDmg: 20, maxDmg: 85, armor: 14, attackInterval: 1.9, stepTime: 0.38, aggroRange: 6, leash: 10, wanderRadius: 3, exp: 390, respawn: 60,
    resist: { physical: 5, energy: -10 },
    abilities: [A('ranged', 'hurled boulder', 'physical', 40, 110, 5, 'stone', 5)],
    loot: [L('gold', 0.95, 20, 70), L('cyclops_eye', 0.12), L('ham', 0.4, 1, 2), L('stone_maul', 0.03), L('battle_axe', 0.05), L('iron_helmet', 0.06), L('small_ruby', 0.02)],
  }),
  // --- desert -------------------------------------------------------------------
  scorpion: E('scorpion', {
    name: 'Scorpion', maxHp: 290, minDmg: 14, maxDmg: 52, armor: 14, attackInterval: 1.6, stepTime: 0.32, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 185, respawn: 45,
    resist: { earth: 100, fire: 10, ice: -15 },
    abilities: [A('ranged', 'venom sting', 'earth', 22, 55, 4, 'earth', 1)],
    loot: [L('gold', 0.8, 8, 30), L('scorpion_tail', 0.4), L('viper_star', 0.08, 1, 4)],
  }),
  scarab: E('scarab', {
    name: 'Scarab', maxHp: 340, minDmg: 12, maxDmg: 46, armor: 20, attackInterval: 1.7, stepTime: 0.36, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 210, respawn: 50,
    resist: { earth: 80, physical: 10, fire: -15, ice: -10 },
    abilities: [A('nova', 'sand swarm', 'earth', 25, 60, 5, 'earth', 0, 1)],
    loot: [L('gold', 0.85, 10, 40), L('scarab_coin', 0.25), L('small_emerald', 0.03), L('scarab_shield', 0.01), L('scarab_amulet', 0.008)],
  }),
  mummy: E('mummy', {
    name: 'Mummy', maxHp: 460, minDmg: 18, maxDmg: 65, armor: 12, attackInterval: 1.8, stepTime: 0.42, aggroRange: 6, leash: 9, wanderRadius: 2, exp: 340, respawn: 60,
    resist: { death: 100, earth: 30, holy: -30, fire: -15 },
    abilities: [A('ranged', 'curse of the tomb', 'death', 35, 85, 4, 'death', 4)],
    loot: [L('gold', 0.9, 15, 60), L('mummy_wrapping', 0.5), L('scarab_coin', 0.2), L('health_potion', 0.2), L('golden_goblet', 0.015), L('scarab_amulet', 0.01), L('small_ruby', 0.03)],
  }),
  // --- lizardfolk ------------------------------------------------------------------
  lizard_sentinel: E('lizard_sentinel', {
    name: 'Lizard Sentinel', maxHp: 330, minDmg: 10, maxDmg: 40, armor: 12, attackInterval: 1.7, stepTime: 0.31, aggroRange: 7, leash: 10, wanderRadius: 3, exp: 270, respawn: 55,
    kite: 3, resist: { earth: 40, fire: 10, ice: -15 },
    abilities: [A('ranged', 'barbed spear', 'physical', 28, 78, 2.4, 'spear', 4)],
    loot: [L('gold', 0.9, 12, 50), L('lizard_scale', 0.3), L('spear', 0.4, 1, 3), L('royal_spear', 0.15, 1, 3), L('health_potion', 0.2), L('enchanted_spear', 0.02)],
  }),
  lizard_templar: E('lizard_templar', {
    name: 'Lizard Templar', maxHp: 950, minDmg: 30, maxDmg: 115, armor: 22, attackInterval: 1.6, stepTime: 0.31, aggroRange: 7, leash: 9, wanderRadius: 3, exp: 880, respawn: 90,
    resist: { earth: 50, fire: 15, ice: -15, physical: 5 },
    abilities: [A('nova', 'tail sweep', 'physical', 40, 105, 5, 'stone', 0, 1), A('heal', 'serpent prayer', 'holy', 80, 150, 9, 'heal')],
    loot: [L('gold', 1, 40, 130), L('lizard_scale', 0.5, 1, 2), L('strong_health_potion', 0.2), L('lizard_blade', 0.012), L('lizardscale_armor', 0.01), L('scarab_shield', 0.02), L('small_emerald', 0.08)],
  }),
  // --- the frozen north (high) -------------------------------------------------------
  crystal_spider: E('crystal_spider', {
    name: 'Crystal Spider', maxHp: 1150, minDmg: 30, maxDmg: 120, armor: 18, attackInterval: 1.5, stepTime: 0.29, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 900, respawn: 80,
    resist: { ice: 100, earth: 30, fire: -20, energy: -10 },
    abilities: [A('ranged', 'crystal shards', 'ice', 55, 140, 4, 'ice', 4), A('nova', 'frost web', 'ice', 40, 100, 7, 'ice', 0, 1)],
    loot: [L('gold', 1, 30, 110), L('crystal_shard', 0.25), L('spider_silk', 0.4, 1, 2), L('strong_health_potion', 0.15), L('frost_pendant', 0.02), L('frost_helm', 0.01), L('glacier_boots', 0.006)],
  }),
  ice_witch: E('ice_witch', {
    name: 'Ice Witch', maxHp: 650, minDmg: 10, maxDmg: 40, armor: 10, attackInterval: 2, stepTime: 0.3, aggroRange: 8, leash: 9, wanderRadius: 2, exp: 620, respawn: 80,
    kite: 3, resist: { ice: 100, energy: 10, fire: -20, holy: -5 },
    abilities: [
      A('ranged', 'ice bolt', 'ice', 55, 130, 3, 'ice', 4),
      A('blast', 'blizzard', 'ice', 45, 105, 7, 'ice', 4, 1),
      A('heal', 'winter\'s embrace', 'holy', 60, 120, 8, 'heal'),
    ],
    loot: [L('gold', 1, 25, 90), L('crystal_shard', 0.2), L('strong_mana_potion', 0.25), L('mastermind_potion', 0.05), L('frost_circlet', 0.012), L('glacier_robe', 0.01), L('rod_of_glaciers', 0.008), L('frost_pendant', 0.03)],
  }),
  frost_giantess: E('frost_giantess', {
    name: 'Frost Giantess', maxHp: 900, minDmg: 25, maxDmg: 105, armor: 18, attackInterval: 1.8, stepTime: 0.36, aggroRange: 7, leash: 9, wanderRadius: 3, exp: 720, respawn: 80,
    resist: { ice: 80, physical: 5, fire: -15, energy: -10 },
    abilities: [A('ranged', 'hurled ice block', 'physical', 50, 140, 4.5, 'stone', 5)],
    loot: [L('gold', 1, 25, 90), L('giant_beard', 0.1), L('ham', 0.5, 1, 3), L('mead', 0.3, 1, 2), L('fur_backpack', 0.03), L('frost_legs', 0.008), L('strong_health_potion', 0.15), L('small_sapphire', 0.05)],
  }),
  frost_giant: E('frost_giant', {
    name: 'Frost Giant', maxHp: 1350, minDmg: 35, maxDmg: 140, armor: 22, attackInterval: 1.9, stepTime: 0.37, aggroRange: 7, leash: 9, wanderRadius: 3, exp: 1050, respawn: 90,
    resist: { ice: 80, physical: 8, fire: -15, energy: -10 },
    abilities: [A('nova', 'ground stomp', 'physical', 50, 130, 5, 'stone', 0, 1), A('ranged', 'hurled ice block', 'physical', 60, 150, 6, 'stone', 4)],
    loot: [L('gold', 1, 40, 130), L('giant_beard', 0.18), L('ham', 0.5, 1, 3), L('glacial_cleaver', 0.008), L('frost_helm', 0.015), L('fur_backpack', 0.03), L('berserk_potion', 0.05), L('small_sapphire', 0.08)],
  }),
  ice_golem: E('ice_golem', {
    name: 'Ice Golem', maxHp: 1900, minDmg: 40, maxDmg: 150, armor: 30, attackInterval: 2, stepTime: 0.42, aggroRange: 6, leash: 8, wanderRadius: 2, exp: 1350, respawn: 100,
    resist: { ice: 100, physical: 20, death: 60, earth: 30, fire: -25, energy: -15 },
    abilities: [A('ranged', 'ice spike', 'ice', 70, 160, 4, 'ice', 4), A('nova', 'frost burst', 'ice', 60, 140, 6, 'ice', 0, 1)],
    loot: [L('gold', 1, 40, 120), L('crystal_shard', 0.4, 1, 2), L('frozen_heart', 0.06), L('small_sapphire', 0.12), L('frost_plate', 0.006), L('frost_bolt', 0.15, 3, 10), L('great_mana_potion', 0.1)],
  }),
  frost_dragon: E('frost_dragon', {
    name: 'Frost Dragon', maxHp: 3600, minDmg: 50, maxDmg: 200, armor: 28, attackInterval: 2, stepTime: 0.4, aggroRange: 7, leash: 8, wanderRadius: 2, exp: 3100, respawn: 180,
    resist: { ice: 100, earth: 30, death: 20, fire: -15, energy: -10 },
    abilities: [
      A('blast', 'ice breath', 'ice', 110, 250, 4.5, 'ice', 5, 1),
      A('nova', 'glacial roar', 'ice', 90, 210, 8, 'ice', 0, 2),
      A('ranged', 'frost bite', 'ice', 80, 180, 5, 'ice', 4),
    ],
    loot: [
      L('gold', 1, 100, 320), L('frost_dragon_scale', 0.5, 1, 3), L('dragon_scale', 0.4, 1, 2), L('great_health_potion', 0.2), L('great_mana_potion', 0.2),
      L('frostscale_shield', 0.012), L('frost_plate', 0.008), L('frost_legs', 0.012), L('frostbite_crossbow', 0.006), L('frozen_heart', 0.1), L('small_sapphire', 0.3), L('small_diamond', 0.1),
    ],
  }),

  // =================================================================== bosses (see bosses/bosses.ts)
  // Dungeon bosses: one per region, elite, slow to respawn (1–4 hours), guaranteed rare loot and a chance at their unique item.
  boss_ironjaw: E('boss_ironjaw', {
    name: 'Ughrak Ironjaw', title: 'Warchief of Grimtusk', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 2600, minDmg: 20, maxDmg: 110, armor: 16, attackInterval: 1.6, stepTime: 0.32, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 2000, respawn: 3600,
    abilities: [A('nova', 'cleaving spin', 'physical', 30, 90, 6, 'stone', 0, 1), S('war cry', 'orc_spearman', 2, 4, 20), A('ranged', 'hurled axe', 'physical', 30, 80, 4, 'spear', 4)],
    loot: [L('gold', 1, 300, 700), L('orc_banner', 1), L('orc_warhelm', 1), L('strong_health_potion', 1, 2, 4), L('small_ruby', 1, 1, 2), L('ironjaw_helm', 0.25), L('ring_of_might', 0.06)],
  }),
  boss_bonebound: E('boss_bonebound', {
    name: 'Lord Ossric', title: 'the Bonebound', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 1900, minDmg: 15, maxDmg: 85, armor: 12, attackInterval: 1.7, stepTime: 0.38, aggroRange: 7, leash: 8, wanderRadius: 1, exp: 1500, respawn: 3600,
    resist: { death: 100, holy: -25, ice: 20 },
    abilities: [A('nova', 'grave chill', 'death', 25, 70, 5, 'death', 0, 2), S('raise the fallen', 'skeleton', 2, 4, 18), A('heal', 'bone mending', 'holy', 150, 300, 12, 'heal')],
    loot: [L('gold', 1, 250, 600), L('bone', 1, 3, 6), L('strong_health_potion', 1, 1, 3), L('iron_shield', 1), L('small_emerald', 1), L('bonebound_amulet', 0.25), L('scarab_amulet', 0.05)],
  }),
  boss_delving_king: E('boss_delving_king', {
    name: 'Grimbold Ashanvil', title: 'the Delving King', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 4600, minDmg: 30, maxDmg: 150, armor: 26, attackInterval: 1.7, stepTime: 0.36, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 3600, respawn: 5400,
    resist: { physical: 10, earth: 20, fire: 10 },
    abilities: [A('nova', 'hammer quake', 'physical', 60, 160, 6, 'stone', 0, 2), A('ranged', 'thrown hammer', 'physical', 50, 140, 4, 'stone', 4), S('call the guard', 'dwarf_soldier', 2, 4, 22)],
    loot: [L('gold', 1, 500, 1200), L('dwarven_armor', 1), L('dwarven_legs', 0.5), L('dwarven_shield', 1), L('small_diamond', 1), L('ashanvil_hammer', 0.22), L('dwarven_helmet', 0.4)],
  }),
  boss_labyrinth_lord: E('boss_labyrinth_lord', {
    name: 'Gorhorn', title: 'Lord of the Labyrinth', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 5400, minDmg: 35, maxDmg: 170, armor: 22, attackInterval: 1.5, stepTime: 0.3, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 4000, respawn: 5400,
    resist: { earth: 15, physical: 5 },
    abilities: [A('beam', 'goring charge', 'physical', 90, 210, 6, 'stone', 5), A('nova', 'trample', 'physical', 60, 150, 7, 'stone', 0, 1), S('horn call', 'minotaur_archer', 2, 4, 22)],
    loot: [L('gold', 1, 500, 1200), L('minotaur_horn', 1, 3, 5), L('plate_legs', 1), L('great_health_potion', 1, 1, 3), L('small_ruby', 1, 1, 2), L('labyrinth_greaves', 0.22), L('tower_shield', 0.15)],
  }),
  boss_venom_oracle: E('boss_venom_oracle', {
    name: 'Sszarak', title: 'the Venom Oracle', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 9500, minDmg: 40, maxDmg: 190, armor: 24, attackInterval: 1.7, stepTime: 0.31, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 7000, respawn: 7200,
    resist: { earth: 80, fire: 15, ice: -15, physical: 5 },
    abilities: [
      A('wave', 'venom spray', 'earth', 120, 260, 6, 'earth', 5),
      A('blast', 'poison rain', 'earth', 90, 200, 7, 'earth', 5, 2),
      S('serpent call', 'lizard_sentinel', 2, 4, 20),
      A('heal', 'serpent prayer', 'holy', 600, 1000, 14, 'heal'),
    ],
    loot: [L('gold', 1, 800, 1800), L('lizard_scale', 1, 3, 6), L('jade_amulet', 1), L('great_mana_potion', 1, 2, 4), L('small_emerald', 1, 2, 4), L('oracle_rod', 0.2), L('lizard_blade', 0.12), L('lizardscale_armor', 0.12)],
  }),
  boss_ember_matriarch: E('boss_ember_matriarch', {
    name: 'Kaerith', title: 'Mother of Flames', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 14000, minDmg: 50, maxDmg: 220, armor: 28, attackInterval: 2, stepTime: 0.38, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 10000, respawn: 9000,
    resist: { fire: 100, ice: -10, earth: 20 },
    abilities: [
      A('wave', 'searing breath', 'fire', 200, 450, 6, 'fire', 5),
      A('nova', 'wingbeat inferno', 'fire', 150, 320, 9, 'fire', 0, 2),
      S('brood call', 'dragon', 1, 2, 30),
    ],
    loot: [L('gold', 1, 1000, 2500), L('red_dragon_scale', 1, 2, 4), L('dragon_scale', 1, 3, 6), L('dragon_helm', 0.5), L('great_health_potion', 1, 2, 4), L('small_ruby', 1, 3, 6), L('matriarch_scalemail', 0.2), L('dragonbane_crossbow', 0.06), L('dragonhide_pack', 0.1)],
  }),
  boss_sand_king: E('boss_sand_king', {
    name: 'Ankhset', title: 'the Undying Sand King', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 18000, minDmg: 60, maxDmg: 260, armor: 26, attackInterval: 1.8, stepTime: 0.4, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 13000, respawn: 10800,
    resist: { death: 100, earth: 30, holy: -25, fire: -10 },
    abilities: [
      A('beam', 'curse of ages', 'death', 180, 380, 5, 'death', 6),
      A('blast', 'sandstorm', 'earth', 120, 260, 7, 'earth', 5, 2),
      S('wake the dead', 'mummy', 3, 5, 24),
      A('heal', 'embalmed vigour', 'holy', 1200, 2000, 16, 'heal'),
    ],
    loot: [L('gold', 1, 1500, 3500), L('golden_goblet', 1, 1, 2), L('scarab_coin', 1, 5, 10), L('scarab_amulet', 1), L('small_diamond', 1, 2, 4), L('sandking_crown', 0.2), L('kings_edge', 0.05)],
  }),
  boss_mire_hydra: E('boss_mire_hydra', {
    name: 'Mirewretch', title: 'the Hundred-Fanged', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 22000, minDmg: 60, maxDmg: 250, armor: 28, attackInterval: 1.8, stepTime: 0.42, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 16000, respawn: 10800,
    resist: { ice: 60, earth: 100, fire: -10, energy: 10 },
    abilities: [
      A('wave', 'frost spray', 'ice', 180, 400, 6, 'ice', 5),
      A('blast', 'venom flood', 'earth', 140, 300, 7, 'earth', 5, 2),
      A('heal', 'regrowth', 'holy', 1500, 2500, 15, 'heal'),
    ],
    loot: [L('gold', 1, 1500, 3500), L('hydra_head', 1, 2, 3), L('hydra_egg', 1, 1, 2), L('hydra_legs', 0.5), L('great_mana_potion', 1, 3, 5), L('small_sapphire', 1, 3, 6), L('hundred_fang_bow', 0.2), L('rod_of_glaciers', 0.3)],
  }),
  boss_rime_wyrm: E('boss_rime_wyrm', {
    name: 'Hrimgaard', title: 'the Rime Wyrm', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 30000, minDmg: 80, maxDmg: 320, armor: 32, attackInterval: 2, stepTime: 0.4, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 22000, respawn: 10800,
    resist: { ice: 100, earth: 30, death: 20, fire: -15, energy: -10 },
    abilities: [
      A('wave', 'rime breath', 'ice', 250, 520, 6, 'ice', 6),
      A('nova', 'glacial roar', 'ice', 180, 400, 9, 'ice', 0, 3),
      S('ice call', 'ice_golem', 2, 4, 28),
      A('ranged', 'frost bite', 'ice', 120, 260, 4, 'ice', 5),
    ],
    loot: [L('gold', 1, 2000, 4000), L('frost_dragon_scale', 1, 3, 6), L('frozen_heart', 1, 1, 2), L('frost_plate', 0.4), L('frostscale_shield', 0.4), L('small_sapphire', 1, 4, 8), L('hrimgaard_fang', 0.2), L('frostbite_crossbow', 0.15)],
  }),
  boss_ashen_sovereign: E('boss_ashen_sovereign', {
    name: 'Vorthazul', title: 'the Ashen Sovereign', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 50000, minDmg: 150, maxDmg: 600, armor: 45, attackInterval: 2, stepTime: 0.34, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 40000, respawn: 14400,
    resist: { fire: 100, physical: 25, energy: 40, death: 30, holy: -20, ice: -10 },
    abilities: [
      A('blast', 'ashfall', 'fire', 300, 650, 6, 'fire', 6, 3),
      A('beam', 'abyssal lance', 'energy', 350, 650, 7, 'energy', 7),
      S('summon embers', 'fire_elemental', 2, 4, 25),
      A('heal', 'sovereign will', 'holy', 2000, 3500, 18, 'heal'),
    ],
    loot: [
      L('gold', 1, 4000, 8000), L('demonic_essence', 1, 2, 4), L('demon_horn', 1, 1, 2), L('small_diamond', 1, 4, 8), L('great_health_potion', 1, 3, 6),
      L('demon_shield', 0.2), L('demon_helm', 0.15), L('demonplate', 0.08), L('demonbone_amulet', 0.15), L('sovereign_wand', 0.15), L('ashen_will_ring', 0.15),
    ],
  }),
  // World bosses: colossal, need many players; loot is shared by contribution (bosses/WorldEvents.ts), never dropped on the ground.
  wb_mountain: E('wb_mountain', {
    name: 'Gorrumvald', title: 'the Mountain That Walks', boss: 'world', elite: true, enrage: 0.3,
    maxHp: 250000, minDmg: 150, maxDmg: 650, armor: 50, attackInterval: 2.2, stepTime: 0.5, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 150000, respawn: 999999,
    resist: { physical: 20, earth: 40, fire: 10, energy: -10 },
    abilities: [
      A('nova', 'earthquake', 'physical', 150, 400, 7, 'stone', 0, 4),
      A('blast', 'boulder rain', 'physical', 200, 480, 6, 'stone', 7, 3),
      S('stone kin', 'cyclops', 3, 6, 30),
    ],
    loot: [
      L('gold', 1, 3000, 6000), L('great_health_potion', 1, 3, 6), L('small_diamond', 0.8, 1, 4), L('behemoth_claw', 0.5), L('thunder_maul', 0.08), L('steel_boots', 0.3),
      L('mountainheart_shield', 0.06), L('colossus_maul', 0.06),
    ],
  }),
  wb_storm_serpent: E('wb_storm_serpent', {
    name: 'Vaelith', title: 'the Storm Serpent', boss: 'world', elite: true, enrage: 0.3,
    maxHp: 200000, minDmg: 120, maxDmg: 520, armor: 40, attackInterval: 2, stepTime: 0.45, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 130000, respawn: 999999,
    resist: { energy: 100, ice: 40, earth: -15, fire: 10 },
    abilities: [
      A('beam', 'lightning lance', 'energy', 250, 550, 5, 'energy', 8),
      A('nova', 'thunderstorm', 'energy', 150, 350, 8, 'energy', 0, 4),
      A('wave', 'tidal crash', 'ice', 200, 420, 7, 'ice', 6),
      S('call of the deep', 'crocodile', 3, 6, 30),
    ],
    loot: [
      L('gold', 1, 3000, 6000), L('great_mana_potion', 1, 3, 6), L('small_sapphire', 0.8, 1, 4), L('wand_of_storms', 0.15), L('storm_tome', 0.08),
      L('stormcoil_wand', 0.06), L('tidecrest_boots', 0.06),
    ],
  }),
  wb_blight_mother: E('wb_blight_mother', {
    name: 'Nhalgrith', title: 'the Blight Mother', boss: 'world', elite: true, enrage: 0.3,
    maxHp: 220000, minDmg: 130, maxDmg: 560, armor: 42, attackInterval: 1.9, stepTime: 0.42, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 140000, respawn: 999999,
    resist: { earth: 100, death: 30, fire: -20, holy: -10 },
    abilities: [
      A('blast', 'blight rain', 'earth', 180, 420, 6, 'earth', 7, 3),
      A('wave', 'venom torrent', 'earth', 220, 460, 7, 'earth', 6),
      S('brood swarm', 'tarantula', 4, 8, 22),
      A('heal', 'brood feast', 'holy', 3000, 6000, 20, 'heal'),
    ],
    loot: [
      L('gold', 1, 3000, 6000), L('great_health_potion', 1, 2, 4), L('spider_silk', 1, 3, 8), L('small_emerald', 0.8, 1, 4), L('jade_amulet', 0.3), L('elven_aegis', 0.08),
      L('blightweave_robe', 0.06), L('broodmother_crossbow', 0.06),
    ],
  }),
  // Raid bosses: end the last wave of a raid (bosses/bosses.ts RAIDS); never respawn.
  raid_tusk_warlord: E('raid_tusk_warlord', {
    name: 'Grashnak Tuskbreaker', title: 'the Burning Warlord', boss: 'raid', elite: true, enrage: 0.3,
    maxHp: 6000, minDmg: 35, maxDmg: 160, armor: 20, attackInterval: 1.5, stepTime: 0.3, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 4500, respawn: 999999,
    abilities: [A('nova', 'burning whirl', 'fire', 60, 150, 6, 'fire', 0, 2), A('ranged', 'hurled axe', 'physical', 50, 130, 4, 'spear', 4), S('rally', 'orc_berserker', 2, 4, 25)],
    loot: [L('gold', 1, 800, 1600), L('orc_banner', 1, 1, 2), L('orc_warhelm', 1), L('double_axe', 0.3), L('tower_shield', 0.2), L('ring_of_might', 0.1), L('small_ruby', 1, 1, 3)],
  }),
  raid_grave_warden: E('raid_grave_warden', {
    name: 'Sexton Morrow', title: 'the Gravewarden', boss: 'raid', elite: true, enrage: 0.3,
    maxHp: 3000, minDmg: 20, maxDmg: 100, armor: 14, attackInterval: 1.7, stepTime: 0.36, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 2200, respawn: 999999,
    resist: { death: 100, holy: -30, earth: 30 },
    abilities: [A('nova', 'grave dirt', 'death', 30, 90, 6, 'death', 0, 2), S('dig up', 'skeleton', 3, 5, 20), A('heal', 'unholy rite', 'holy', 200, 400, 14, 'heal')],
    loot: [L('gold', 1, 400, 900), L('bone', 1, 3, 6), L('strong_health_potion', 1, 2, 3), L('chain_armor', 0.5), L('golden_goblet', 0.25), L('small_emerald', 1)],
  }),
  raid_frost_jarl: E('raid_frost_jarl', {
    name: 'Hjalmvar Rimeborn', title: 'Jarl of the Frostmarch', boss: 'raid', elite: true, enrage: 0.3,
    maxHp: 12000, minDmg: 50, maxDmg: 220, armor: 28, attackInterval: 1.8, stepTime: 0.36, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 9000, respawn: 999999,
    resist: { ice: 80, physical: 10, fire: -15, energy: -10 },
    abilities: [A('nova', 'frost stomp', 'ice', 100, 240, 6, 'ice', 0, 2), A('wave', 'blizzard breath', 'ice', 140, 300, 7, 'ice', 5), A('ranged', 'hurled ice block', 'physical', 90, 200, 5, 'stone', 5)],
    loot: [L('gold', 1, 1200, 2500), L('giant_beard', 1, 1, 3), L('frost_helm', 0.3), L('glacial_cleaver', 0.15), L('fur_backpack', 0.4), L('small_sapphire', 1, 2, 4)],
  }),
  raid_swarm_queen: E('raid_swarm_queen', {
    name: 'Ixtara', title: 'Queen of the Swarm', boss: 'raid', elite: true, enrage: 0.3,
    maxHp: 7000, minDmg: 35, maxDmg: 150, armor: 30, attackInterval: 1.6, stepTime: 0.34, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 5200, respawn: 999999,
    resist: { earth: 90, physical: 15, fire: -15, ice: -10 },
    abilities: [A('blast', 'sand swarm', 'earth', 80, 200, 6, 'earth', 5, 2), S('brood', 'scarab', 4, 8, 20), A('heal', 'royal jelly', 'holy', 500, 900, 15, 'heal')],
    loot: [L('gold', 1, 900, 1800), L('scarab_coin', 1, 4, 8), L('scarab_shield', 0.4), L('scarab_amulet', 0.4), L('small_emerald', 1, 1, 3)],
  }),
};

// gear-set pieces (inventory/sets.ts) join the loot tables of the monsters that wear them
for (const [kind, drops] of Object.entries(SET_DROPS)) {
  const e = ENEMIES[kind as EnemyKind];
  if (e) for (const [id, chance] of drops) if (!e.loot.some((l) => l.id === id)) e.loot.push(L(id, chance));
}
// rare boss capes (inventory/capes.ts)
for (const [kind, drops] of Object.entries(CAPE_DROPS)) {
  const e = ENEMIES[kind as EnemyKind];
  if (e) for (const [id, chance] of drops ?? []) if (!e.loot.some((l) => l.id === id)) e.loot.push(L(id, chance));
}

import type { Element } from '../inventory/items';
import type { EnemyKind } from '../world/WorldMap';
import { SET_DROPS } from '../inventory/sets';
import { CAPE_DROPS } from '../inventory/capes';
import { PET_DROPS } from '../pets/petDefs';
import { SEA_ENEMIES } from './seaDefs';
import { SLAYER_ENEMIES } from './slayerDefs';

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
  /** Sticky webs: seconds a player it hurts walks slowed (Game.web). */
  web?: number;
  /** Chance (0–1) that a hit poisons, instead of the usual 35% for earth attacks. */
  poison?: number;
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
  /** Rare monsters the whole world hears about: a broadcast when it returns and when someone slays it. */
  herald?: { spawn: string; kill: string };
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
    name: 'Rat', maxHp: 67, minDmg: 1, maxDmg: 9, armor: 1, attackInterval: 1.4, stepTime: 0.36, aggroRange: 4, leash: 9, wanderRadius: 3, exp: 2, respawn: 20,
    loot: [L('gold', 0.7, 3, 15), L('cheese', 0.3), L('rat_tail', 0.5)],
  }),
  wolf: E('wolf', {
    name: 'Wolf', maxHp: 131, minDmg: 4, maxDmg: 18, armor: 2, attackInterval: 1.5, stepTime: 0.3, aggroRange: 6, leash: 11, wanderRadius: 3, exp: 6, respawn: 30,
    loot: [L('gold', 0.6, 8, 36), L('meat', 0.45, 1, 2), L('wolf_pelt', 0.35), L('raw_meat', 0.4)],
  }),
  skeleton: E('skeleton', {
    name: 'Skeleton', maxHp: 195, minDmg: 8, maxDmg: 26, armor: 4, attackInterval: 1.8, stepTime: 0.42, aggroRange: 5, leash: 9, wanderRadius: 2, exp: 6, respawn: 40,
    resist: { death: 100, holy: -25, ice: 20 },
    loot: [L('gold', 0.8, 5, 20), L('bone', 0.6, 1, 2), L('health_potion', 0.2), L('iron_sword', 0.06), L('iron_mace', 0.06), L('chain_helmet', 0.05)],
  }),
  // --- orcs ----------------------------------------------------------------------
  orc: E('orc', {
    name: 'Orc', maxHp: 274, minDmg: 10, maxDmg: 43, armor: 7, attackInterval: 1.6, stepTime: 0.34, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 13, respawn: 45,
    loot: [L('gold', 0.9, 29, 137), L('meat', 0.3, 1, 2), L('orc_tooth', 0.45, 1, 2), L('hatchet', 0.08), L('leather_legs', 0.08), L('chain_armor', 0.03)],
  }),
  orc_spearman: E('orc_spearman', {
    name: 'Orc Spearman', maxHp: 258, minDmg: 6, maxDmg: 19, armor: 5, attackInterval: 1.8, stepTime: 0.34, aggroRange: 7, leash: 10, wanderRadius: 3, exp: 16, respawn: 45,
    kite: 3,
    abilities: [A('ranged', 'thrown spear', 'physical', 13, 50, 2.2, 'spear', 4)],
    loot: [L('gold', 0.9, 35, 148), L('spear', 0.5, 1, 4), L('orc_tooth', 0.3)],
  }),
  orc_shaman: E('orc_shaman', {
    name: 'Orc Shaman', maxHp: 261, minDmg: 5, maxDmg: 22, armor: 4, attackInterval: 2, stepTime: 0.38, aggroRange: 7, leash: 10, wanderRadius: 2, exp: 23, respawn: 50,
    kite: 3, resist: { energy: 20 },
    abilities: [A('ranged', 'spirit bolt', 'energy', 16, 53, 3.2, 'energy', 4), A('heal', 'mending chant', 'holy', 59, 107, 7, 'heal')],
    loot: [L('gold', 0.9, 48, 203), L('mana_potion', 0.25), L('orc_charm', 0.4), L('spark_rune', 0.2, 1, 5), L('wand_of_sparks', 0.03)],
  }),
  orc_warrior: E('orc_warrior', {
    name: 'Orc Warrior', maxHp: 451, minDmg: 16, maxDmg: 65, armor: 11, attackInterval: 1.6, stepTime: 0.34, aggroRange: 6, leash: 11, wanderRadius: 5, exp: 36, respawn: 50,
    loot: [L('gold', 0.95, 22, 86), L('orc_tooth', 0.5, 1, 2), L('battle_axe', 0.05), L('iron_helmet', 0.06), L('chain_legs', 0.06), L('ham', 0.2)],
  }),
  orc_berserker: E('orc_berserker', {
    name: 'Orc Berserker', maxHp: 609, minDmg: 19, maxDmg: 87, armor: 8, attackInterval: 1.3, stepTime: 0.26, aggroRange: 7, leash: 11, wanderRadius: 4, exp: 47, respawn: 60,
    loot: [L('gold', 0.95, 36, 121), L('orc_tooth', 0.5, 1, 3), L('morning_star', 0.05), L('double_axe', 0.02)],
  }),
  orc_leader: E('orc_leader', {
    name: 'Orc Leader', maxHp: 1050, minDmg: 19, maxDmg: 87, armor: 14, attackInterval: 1.7, stepTime: 0.33, aggroRange: 7, leash: 10, wanderRadius: 3, exp: 68, respawn: 90,
    abilities: [A('ranged', 'hurled axe', 'physical', 24, 67, 4, 'spear', 3)],
    loot: [L('gold', 1, 84, 251), L('orc_warhelm', 0.05), L('plate_armor', 0.03), L('orc_banner', 0.15), L('strong_health_potion', 0.1), L('small_ruby', 0.04)],
  }),
  orc_warlord: E('orc_warlord', {
    name: 'Orc Warlord', maxHp: 2291, minDmg: 47, maxDmg: 219, armor: 20, attackInterval: 1.6, stepTime: 0.3, aggroRange: 7, leash: 8, wanderRadius: 2, exp: 275, respawn: 300,
    elite: true,
    abilities: [A('nova', 'whirling axes', 'physical', 63, 188, 5, 'stone', 0, 1)],
    loot: [L('gold', 1, 95, 254), L('orc_warhelm', 0.2), L('double_axe', 0.12), L('tower_shield', 0.06), L('ring_of_might', 0.04), L('orc_banner', 0.5), L('small_diamond', 0.1)],
  }),
  // --- elves -----------------------------------------------------------------------
  elf: E('elf', {
    name: 'Elf', maxHp: 261, minDmg: 10, maxDmg: 40, armor: 6, attackInterval: 1.5, stepTime: 0.3, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 20, respawn: 45,
    resist: { earth: 20 },
    loot: [L('gold', 0.85, 15, 75), L('elvish_talisman', 0.25), L('arrow', 0.4, 3, 10), L('leather_boots', 0.1), L('hunting_bow', 0.05)],
  }),
  elf_scout: E('elf_scout', {
    name: 'Elf Scout', maxHp: 334, minDmg: 7, maxDmg: 20, armor: 6, attackInterval: 1.6, stepTime: 0.28, aggroRange: 8, leash: 11, wanderRadius: 4, exp: 17, respawn: 50,
    kite: 4, resist: { earth: 20 },
    abilities: [A('ranged', 'arrow', 'physical', 26, 72, 2, 'arrow', 5)],
    loot: [L('gold', 0.9, 23, 91), L('arrow', 0.6, 5, 15), L('poison_arrow', 0.2, 2, 8), L('elvish_talisman', 0.25), L('composite_bow', 0.03), L('traveler_boots', 0.03)],
  }),
  elf_arcanist: E('elf_arcanist', {
    name: 'Elf Arcanist', maxHp: 542, minDmg: 7, maxDmg: 22, armor: 5, attackInterval: 2, stepTime: 0.3, aggroRange: 8, leash: 10, wanderRadius: 3, exp: 63, respawn: 60,
    kite: 3, resist: { energy: 20, earth: 20 },
    abilities: [A('ranged', 'arcane bolt', 'energy', 33, 88, 3, 'energy', 4), A('heal', 'sylvan blessing', 'holy', 99, 222, 7, 'heal')],
    loot: [L('gold', 0.95, 120, 360), L('elven_scroll', 0.2), L('mana_potion', 0.3), L('mage_robe', 0.04), L('rod_of_thorns', 0.02), L('wand_of_embers', 0.02), L('sapphire_ring', 0.02)],
  }),
  elf_warden: E('elf_warden', {
    name: 'Elf Warden', maxHp: 1532, minDmg: 24, maxDmg: 76, armor: 15, attackInterval: 1.6, stepTime: 0.29, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 161, respawn: 180,
    elite: true, kite: 3, resist: { earth: 30, energy: 15 },
    abilities: [A('ranged', 'heartwood arrow', 'physical', 42, 113, 2.6, 'arrow', 6), A('blast', 'thorn burst', 'earth', 38, 94, 6, 'earth', 5, 1)],
    loot: [L('gold', 1, 80, 200), L('elven_longbow', 0.05), L('elven_mail', 0.04), L('elven_leggings', 0.05), L('elven_circlet', 0.04), L('elven_aegis', 0.03), L('small_emerald', 0.15)],
  }),
  // --- jungle -----------------------------------------------------------------------
  crocodile: E('crocodile', {
    name: 'Crocodile', maxHp: 430, minDmg: 20, maxDmg: 74, armor: 12, attackInterval: 1.7, stepTime: 0.38, aggroRange: 5, leash: 9, wanderRadius: 3, exp: 45, respawn: 50,
    resist: { ice: 15, earth: 10 },
    loot: [L('gold', 0.8, 40, 151), L('crocodile_leather', 0.4), L('meat', 0.3), L('leather_armor', 0.05)],
  }),
  tarantula: E('tarantula', {
    name: 'Tarantula', maxHp: 490, minDmg: 17, maxDmg: 56, armor: 9, attackInterval: 1.5, stepTime: 0.3, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 34, respawn: 50,
    resist: { earth: 60, fire: -15 },
    abilities: [A('ranged', 'venom spit', 'earth', 28, 67, 4, 'earth', 3)],
    loot: [L('gold', 0.8, 55, 191), L('spider_silk', 0.4), L('poison_arrow', 0.15, 3, 8), L('jade_amulet', 0.01)],
  }),
  jungle_troll: E('jungle_troll', {
    name: 'Jungle Troll', maxHp: 696, minDmg: 24, maxDmg: 79, armor: 12, attackInterval: 1.6, stepTime: 0.33, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 36, respawn: 55,
    abilities: [A('heal', 'troll regeneration', 'holy', 65, 131, 8, 'heal')],
    loot: [L('gold', 0.9, 52, 155), L('troll_hair', 0.4), L('ham', 0.2), L('throwing_star', 0.2, 3, 8), L('steel_boots', 0.01), L('ring_of_vigor', 0.02)],
  }),
  hydra: E('hydra', {
    name: 'Hydra', maxHp: 3111, minDmg: 56, maxDmg: 210, armor: 22, attackInterval: 1.8, stepTime: 0.4, aggroRange: 6, leash: 8, wanderRadius: 2, exp: 714, respawn: 120,
    resist: { fire: -10, energy: 10, ice: 5, earth: 100 },
    abilities: [
      A('ranged', 'frost breath', 'ice', 112, 279, 4, 'ice', 4),
      A('blast', 'venom splash', 'earth', 98, 224, 6, 'earth', 4, 1),
      A('heal', 'regrowth', 'holy', 199, 397, 10, 'heal'),
    ],
    loot: [L('gold', 1, 79, 304), L('hydra_head', 0.12), L('hydra_egg', 0.05), L('strong_mana_potion', 0.2), L('hydra_legs', 0.02), L('frost_pendant', 0.03), L('rod_of_glaciers', 0.01), L('small_sapphire', 0.08)],
  }),
  // --- the descent ---------------------------------------------------------------------
  ghoul: E('ghoul', {
    name: 'Ghoul', maxHp: 530, minDmg: 17, maxDmg: 69, armor: 9, attackInterval: 1.6, stepTime: 0.36, aggroRange: 6, leash: 10, wanderRadius: 3, exp: 46, respawn: 50,
    resist: { death: 100, holy: -30, earth: 30 },
    abilities: [A('ranged', 'grave chill', 'death', 29, 63, 5, 'death', 3)],
    loot: [L('gold', 0.9, 54, 180), L('ghoul_snack', 0.5), L('bone', 0.5, 1, 2), L('health_potion', 0.2), L('golden_goblet', 0.01)],
  }),
  fire_elemental: E('fire_elemental', {
    name: 'Fire Elemental', maxHp: 1156, minDmg: 16, maxDmg: 56, armor: 10, attackInterval: 1.8, stepTime: 0.32, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 71, respawn: 60,
    resist: { fire: 100, energy: -15, ice: -30, earth: 20 },
    abilities: [A('nova', 'flame burst', 'fire', 32, 77, 4, 'fire', 0, 1), A('ranged', 'fire bolt', 'fire', 36, 81, 4.5, 'fire', 4)],
    loot: [L('gold', 0.95, 79, 237), L('fiery_heart', 0.15), L('fireball_rune', 0.2, 2, 6), L('garnet_amulet', 0.02), L('emberwalk_boots', 0.008), L('small_ruby', 0.08)],
  }),
  behemoth: E('behemoth', {
    name: 'Behemoth', maxHp: 4280, minDmg: 100, maxDmg: 467, armor: 30, attackInterval: 2, stepTime: 0.38, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 1047, respawn: 150,
    resist: { physical: 10, fire: 15, holy: 10 },
    abilities: [A('ranged', 'hurled boulder', 'physical', 133, 367, 5, 'stone', 5)],
    loot: [L('gold', 1, 112, 336), L('behemoth_claw', 0.08), L('great_health_potion', 0.15), L('plate_legs', 0.05), L('steel_boots', 0.04), L('thunder_maul', 0.006), L('small_diamond', 0.12)],
  }),
  demon: E('demon', {
    name: 'Demon', maxHp: 6693, minDmg: 103, maxDmg: 543, armor: 40, attackInterval: 2, stepTime: 0.34, aggroRange: 7, leash: 8, wanderRadius: 2, exp: 1643, respawn: 300,
    elite: true, resist: { physical: 10, fire: 100, energy: 5, ice: -10, death: 20, holy: -20 },
    abilities: [
      A('blast', 'hellfire', 'fire', 155, 388, 5, 'fire', 5, 2),
      A('ranged', 'abyssal bolt', 'energy', 129, 336, 4, 'energy', 5),
      A('heal', 'dark mending', 'holy', 245, 490, 12, 'heal'),
    ],
    loot: [
      L('gold', 1, 80, 240), L('demonic_essence', 0.3), L('demon_horn', 0.1), L('great_mana_potion', 0.3), L('great_health_potion', 0.3),
      L('demon_shield', 0.02), L('demon_helm', 0.012), L('demonplate', 0.006), L('demon_legs', 0.01), L('demon_reaver', 0.005),
      L('demonbone_amulet', 0.01), L('windstride_boots', 0.008), L('wand_of_inferno', 0.01), L('rod_of_wilds', 0.01), L('small_diamond', 0.3),
    ],
  }),
  // --- dragons ------------------------------------------------------------------------------
  dragon: E('dragon', {
    name: 'Dragon', maxHp: 1858, minDmg: 15, maxDmg: 71, armor: 18, attackInterval: 2, stepTime: 0.42, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 133, respawn: 75,
    resist: { fire: 100, ice: -10, earth: 20 },
    abilities: [A('ranged', 'fire breath', 'fire', 40, 111, 5, 'fire', 4), A('blast', 'fireball', 'fire', 51, 121, 7, 'fire', 5, 1)],
    loot: [L('gold', 1, 41, 163), L('dragon_scale', 0.5, 1, 2), L('health_potion', 0.35, 1, 2), L('ember_blade', 0.02), L('dragon_shield', 0.04), L('dragon_helm', 0.01), L('infernal_bolt', 0.1, 3, 10)],
  }),
  dragon_lord: E('dragon_lord', {
    name: 'Dragon Lord', maxHp: 2797, minDmg: 26, maxDmg: 114, armor: 24, attackInterval: 2, stepTime: 0.4, aggroRange: 7, leash: 8, wanderRadius: 2, exp: 642, respawn: 150,
    resist: { fire: 100, ice: -10, earth: 20 },
    abilities: [A('blast', 'firestorm', 'fire', 93, 228, 5, 'fire', 5, 2), A('ranged', 'searing breath', 'fire', 104, 208, 4, 'fire', 5)],
    loot: [L('gold', 1, 32, 104), L('red_dragon_scale', 0.3), L('dragon_scale', 0.8, 2, 4), L('strong_health_potion', 0.4), L('dragonbone_cleaver', 0.02), L('dragon_scale_mail', 0.03), L('dragonhide_pack', 0.01), L('dragonbane_crossbow', 0.004), L('small_ruby', 0.2)],
  }),
  // --- wild animals (beginner prey) ---------------------------------------------------
  silver_rabbit: E('silver_rabbit', {
    name: 'Silver Rabbit', maxHp: 40, minDmg: 0, maxDmg: 3, armor: 0, attackInterval: 1.6, stepTime: 0.26, aggroRange: 0, leash: 8, wanderRadius: 4, exp: 1, respawn: 20,
    resist: { ice: 20 },
    loot: [L('meat', 0.4), L('silver_fur', 0.5), L('raw_meat', 0.35)],
  }),
  deer: E('deer', {
    name: 'Deer', maxHp: 50, minDmg: 0, maxDmg: 4, armor: 1, attackInterval: 1.6, stepTime: 0.27, aggroRange: 0, leash: 9, wanderRadius: 5, exp: 2, respawn: 25,
    loot: [L('meat', 0.6, 1, 3), L('ham', 0.25), L('antlers', 0.2), L('raw_meat', 0.5, 1, 2), L('raw_ham', 0.2)],
  }),
  snake: E('snake', {
    name: 'Snake', maxHp: 50, minDmg: 2, maxDmg: 10, armor: 1, attackInterval: 1.4, stepTime: 0.38, aggroRange: 4, leash: 8, wanderRadius: 3, exp: 2, respawn: 20,
    resist: { earth: 60, ice: -15 },
    loot: [L('snakeskin', 0.35), L('gold', 0.3, 6, 18)],
  }),
  dire_penguin: E('dire_penguin', {
    name: 'Dire Penguin', maxHp: 50, minDmg: 2, maxDmg: 10, armor: 2, attackInterval: 1.5, stepTime: 0.4, aggroRange: 3, leash: 8, wanderRadius: 3, exp: 3, respawn: 25,
    resist: { ice: 60, fire: -15 },
    loot: [L('fish', 0.6, 1, 2), L('penguin_feather', 0.4), L('gold', 0.3, 6, 24), L('feather', 0.6, 2, 6)],
  }),
  winter_wolf: E('winter_wolf', {
    name: 'Winter Wolf', maxHp: 165, minDmg: 6, maxDmg: 24, armor: 3, attackInterval: 1.5, stepTime: 0.29, aggroRange: 6, leash: 11, wanderRadius: 4, exp: 9, respawn: 30,
    resist: { ice: 50, fire: -15 },
    loot: [L('meat', 0.5, 1, 2), L('winter_wolf_fur', 0.35), L('gold', 0.3, 12, 48), L('raw_meat', 0.4)],
  }),
  bear: E('bear', {
    name: 'Bear', maxHp: 244, minDmg: 8, maxDmg: 38, armor: 4, attackInterval: 1.7, stepTime: 0.36, aggroRange: 5, leash: 9, wanderRadius: 3, exp: 9, respawn: 40,
    loot: [L('meat', 0.6, 1, 3), L('ham', 0.35), L('bear_paw', 0.25), L('gold', 0.3, 18, 60), L('raw_meat', 0.5, 1, 2), L('raw_ham', 0.3), L('bear_hide', 0.3)],
  }),
  polar_bear: E('polar_bear', {
    name: 'Polar Bear', maxHp: 398, minDmg: 16, maxDmg: 65, armor: 7, attackInterval: 1.7, stepTime: 0.36, aggroRange: 5, leash: 9, wanderRadius: 3, exp: 24, respawn: 45,
    resist: { ice: 50, fire: -10 },
    loot: [L('meat', 0.6, 1, 3), L('ham', 0.4, 1, 2), L('polar_bear_fur', 0.3), L('bear_paw', 0.2), L('raw_meat', 0.5, 1, 2), L('raw_ham', 0.35)],
  }),
  // --- outlaws & mountain folk (beginner) ------------------------------------------
  bandit: E('bandit', {
    name: 'Bandit', maxHp: 174, minDmg: 5, maxDmg: 24, armor: 3, attackInterval: 1.6, stepTime: 0.32, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 7, respawn: 35,
    loot: [L('gold', 0.9, 6, 32), L('short_sword', 0.08), L('iron_mace', 0.05), L('leather_helmet', 0.1), L('leather_armor', 0.08), L('health_potion', 0.12), L('ham', 0.15)],
  }),
  dwarf: E('dwarf', {
    name: 'Dwarf', maxHp: 195, minDmg: 6, maxDmg: 27, armor: 6, attackInterval: 1.7, stepTime: 0.36, aggroRange: 5, leash: 9, wanderRadius: 3, exp: 8, respawn: 35,
    resist: { earth: 10, fire: 10 },
    loot: [L('gold', 0.8, 4, 16), L('iron_ore', 0.3), L('hatchet', 0.08), L('chain_helmet', 0.05), L('mead', 0.2), L('shovel', 0.03)],
  }),
  dwarf_soldier: E('dwarf_soldier', {
    name: 'Dwarf Soldier', maxHp: 271, minDmg: 5, maxDmg: 22, armor: 8, attackInterval: 1.8, stepTime: 0.36, aggroRange: 7, leash: 10, wanderRadius: 3, exp: 22, respawn: 40,
    kite: 3, resist: { earth: 10, fire: 10 },
    abilities: [A('ranged', 'crossbow bolt', 'physical', 16, 48, 2.4, 'arrow', 5)],
    loot: [L('gold', 0.9, 7, 30), L('bolt', 0.6, 3, 10), L('iron_ore', 0.25), L('light_crossbow', 0.04), L('dwarven_shield', 0.04), L('dwarven_helmet', 0.02)],
  }),
  dwarf_guard: E('dwarf_guard', {
    name: 'Dwarf Guard', maxHp: 499, minDmg: 16, maxDmg: 74, armor: 15, attackInterval: 1.7, stepTime: 0.36, aggroRange: 6, leash: 10, wanderRadius: 3, exp: 29, respawn: 50,
    resist: { earth: 15, fire: 10, physical: 5 },
    loot: [L('gold', 0.95, 30, 121), L('iron_ore', 0.35, 1, 2), L('dwarven_axe', 0.03), L('dwarven_helmet', 0.05), L('dwarven_shield', 0.06), L('dwarven_legs', 0.03), L('dwarven_armor', 0.015), L('mead', 0.2)],
  }),
  // --- frostkin (small ice tribe) ---------------------------------------------------
  frostkin: E('frostkin', {
    name: 'Frostkin', maxHp: 195, minDmg: 5, maxDmg: 27, armor: 4, attackInterval: 1.5, stepTime: 0.3, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 11, respawn: 35,
    resist: { ice: 60, fire: -15 },
    loot: [L('gold', 0.7, 9, 55), L('fish', 0.4, 1, 2), L('frost_charm', 0.2), L('spear', 0.2, 1, 2), L('fur_cap', 0.04)],
  }),
  frostkin_toolshaper: E('frostkin_toolshaper', {
    name: 'Frostkin Toolshaper', maxHp: 257, minDmg: 11, maxDmg: 41, armor: 7, attackInterval: 1.6, stepTime: 0.31, aggroRange: 6, leash: 10, wanderRadius: 3, exp: 22, respawn: 40,
    resist: { ice: 60, fire: -15 },
    loot: [L('gold', 0.8, 27, 108), L('fish', 0.3), L('frost_charm', 0.3), L('tusk_club', 0.06), L('fur_boots', 0.04), L('fur_bag', 0.03), L('small_sapphire', 0.01)],
  }),
  frostkin_windcaller: E('frostkin_windcaller', {
    name: 'Frostkin Windcaller', maxHp: 255, minDmg: 5, maxDmg: 19, armor: 4, attackInterval: 2, stepTime: 0.33, aggroRange: 7, leash: 10, wanderRadius: 2, exp: 10, respawn: 45,
    kite: 3, resist: { ice: 80, fire: -15 },
    abilities: [A('ranged', 'ice shard', 'ice', 19, 57, 3, 'ice', 4), A('heal', 'tundra song', 'holy', 44, 89, 8, 'heal')],
    loot: [L('gold', 0.85, 3, 16), L('frost_charm', 0.45), L('mana_potion', 0.2), L('fish', 0.3), L('rod_of_frost', 0.02), L('avalanche_rune', 0.08, 1, 3)],
  }),
  // --- amazons & valkyries --------------------------------------------------------
  amazon: E('amazon', {
    name: 'Amazon', maxHp: 295, minDmg: 8, maxDmg: 35, armor: 6, attackInterval: 1.5, stepTime: 0.3, aggroRange: 7, leash: 10, wanderRadius: 4, exp: 23, respawn: 45,
    kite: 2,
    abilities: [A('ranged', 'thrown knife', 'physical', 16, 53, 2.6, 'spear', 4)],
    loot: [L('gold', 0.9, 32, 150), L('braided_cord', 0.3), L('spear', 0.3, 1, 3), L('iron_sword', 0.04), L('health_potion', 0.15), L('small_ruby', 0.01)],
  }),
  valkyrie: E('valkyrie', {
    name: 'Valkyrie', maxHp: 581, minDmg: 16, maxDmg: 68, armor: 10, attackInterval: 1.6, stepTime: 0.31, aggroRange: 7, leash: 10, wanderRadius: 4, exp: 38, respawn: 50,
    kite: 3, resist: { ice: 15 },
    abilities: [A('ranged', 'hurled spear', 'physical', 29, 87, 2.4, 'spear', 4)],
    loot: [L('gold', 0.95, 43, 161), L('braided_cord', 0.35), L('spear', 0.5, 1, 4), L('royal_spear', 0.15, 1, 3), L('winged_helmet', 0.02), L('chain_legs', 0.06), L('plate_armor', 0.015), L('health_potion', 0.2)],
  }),
  // --- barbarians -----------------------------------------------------------------
  barbarian_raider: E('barbarian_raider', {
    name: 'Barbarian Raider', maxHp: 491, minDmg: 16, maxDmg: 70, armor: 9, attackInterval: 1.6, stepTime: 0.31, aggroRange: 7, leash: 11, wanderRadius: 4, exp: 40, respawn: 50,
    resist: { ice: 20, fire: -5 },
    loot: [L('gold', 0.9, 60, 240), L('mead', 0.3), L('barbarian_axe', 0.05), L('fur_cap', 0.08), L('fur_legs', 0.06), L('fur_armor', 0.03), L('health_potion', 0.15)],
  }),
  barbarian_headsplitter: E('barbarian_headsplitter', {
    name: 'Barbarian Headsplitter', maxHp: 613, minDmg: 14, maxDmg: 54, armor: 9, attackInterval: 1.7, stepTime: 0.31, aggroRange: 7, leash: 11, wanderRadius: 3, exp: 71, respawn: 50,
    kite: 3, resist: { ice: 20, fire: -5 },
    abilities: [A('ranged', 'hurled axe', 'physical', 32, 98, 2.6, 'spear', 4)],
    loot: [L('gold', 0.9, 72, 270), L('mead', 0.3), L('skull_trophy', 0.08), L('barbarian_axe', 0.04), L('fur_boots', 0.06), L('fur_bag', 0.04)],
  }),
  barbarian_skullhunter: E('barbarian_skullhunter', {
    name: 'Barbarian Skullhunter', maxHp: 771, minDmg: 16, maxDmg: 68, armor: 12, attackInterval: 1.6, stepTime: 0.3, aggroRange: 7, leash: 11, wanderRadius: 4, exp: 41, respawn: 55,
    resist: { ice: 25, fire: -5 },
    loot: [L('gold', 0.95, 53, 193), L('skull_trophy', 0.15), L('barbarian_axe', 0.06), L('fur_armor', 0.05), L('fur_backpack', 0.02), L('berserk_potion', 0.03), L('ham', 0.2)],
  }),
  barbarian_brutetamer: E('barbarian_brutetamer', {
    name: 'Barbarian Brutetamer', maxHp: 603, minDmg: 8, maxDmg: 30, armor: 7, attackInterval: 2, stepTime: 0.32, aggroRange: 7, leash: 10, wanderRadius: 2, exp: 55, respawn: 55,
    kite: 3, resist: { ice: 30, fire: -5 },
    abilities: [A('ranged', 'freezing gale', 'ice', 34, 88, 3, 'ice', 4), A('heal', 'beast-blood draught', 'holy', 113, 226, 6, 'heal')],
    loot: [L('gold', 0.95, 90, 300), L('mead', 0.4, 1, 2), L('polar_bear_fur', 0.12), L('mana_potion', 0.25), L('fur_backpack', 0.03), L('frost_charm', 0.2), L('mastermind_potion', 0.02)],
  }),
  // --- minotaurs & cyclopes (mid) --------------------------------------------------
  minotaur: E('minotaur', {
    name: 'Minotaur', maxHp: 421, minDmg: 14, maxDmg: 59, armor: 11, attackInterval: 1.6, stepTime: 0.33, aggroRange: 6, leash: 10, wanderRadius: 4, exp: 26, respawn: 45,
    resist: { earth: 10 },
    loot: [L('gold', 0.9, 36, 158), L('minotaur_horn', 0.4, 1, 2), L('minotaur_leather', 0.2), L('battle_axe', 0.04), L('chain_armor', 0.04), L('iron_helmet', 0.04), L('meat', 0.2)],
  }),
  minotaur_archer: E('minotaur_archer', {
    name: 'Minotaur Archer', maxHp: 430, minDmg: 7, maxDmg: 24, armor: 9, attackInterval: 1.8, stepTime: 0.33, aggroRange: 8, leash: 11, wanderRadius: 3, exp: 37, respawn: 45,
    kite: 4, resist: { earth: 10 },
    abilities: [A('ranged', 'bolt', 'physical', 27, 80, 2.2, 'arrow', 5)],
    loot: [L('gold', 0.9, 48, 208), L('bolt', 0.6, 4, 12), L('piercing_bolt', 0.2, 2, 6), L('minotaur_horn', 0.3), L('light_crossbow', 0.04), L('heavy_crossbow', 0.004)],
  }),
  minotaur_mage: E('minotaur_mage', {
    name: 'Minotaur Mage', maxHp: 456, minDmg: 5, maxDmg: 18, armor: 6, attackInterval: 2, stepTime: 0.34, aggroRange: 8, leash: 10, wanderRadius: 2, exp: 31, respawn: 50,
    kite: 3, resist: { fire: 15, energy: 30, earth: 10 },
    abilities: [A('ranged', 'arc bolt', 'energy', 29, 81, 3, 'energy', 4), A('blast', 'firecloud', 'fire', 23, 63, 6, 'fire', 4, 1)],
    loot: [L('gold', 0.95, 27, 101), L('minotaur_horn', 0.3), L('mana_potion', 0.3), L('spark_rune', 0.2, 1, 5), L('fireball_rune', 0.06, 1, 3), L('wand_of_sparks', 0.03), L('wand_of_embers', 0.01)],
  }),
  cyclops: E('cyclops', {
    name: 'Cyclops', maxHp: 1141, minDmg: 18, maxDmg: 77, armor: 14, attackInterval: 1.9, stepTime: 0.38, aggroRange: 6, leash: 10, wanderRadius: 3, exp: 68, respawn: 60,
    resist: { physical: 5, energy: -10 },
    abilities: [A('ranged', 'hurled boulder', 'physical', 36, 100, 5, 'stone', 5)],
    loot: [L('gold', 0.95, 95, 333), L('cyclops_eye', 0.12), L('ham', 0.4, 1, 2), L('stone_maul', 0.03), L('battle_axe', 0.05), L('iron_helmet', 0.06), L('small_ruby', 0.02)],
  }),
  // --- desert -------------------------------------------------------------------
  scorpion: E('scorpion', {
    name: 'Scorpion', maxHp: 550, minDmg: 16, maxDmg: 59, armor: 14, attackInterval: 1.6, stepTime: 0.32, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 31, respawn: 45,
    resist: { earth: 100, fire: 10, ice: -15 },
    abilities: [A('ranged', 'venom sting', 'earth', 25, 62, 4, 'earth', 1)],
    loot: [L('gold', 0.8, 48, 180), L('scorpion_tail', 0.4), L('viper_star', 0.08, 1, 4)],
  }),
  scarab: E('scarab', {
    name: 'Scarab', maxHp: 652, minDmg: 14, maxDmg: 52, armor: 20, attackInterval: 1.7, stepTime: 0.36, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 48, respawn: 50,
    resist: { earth: 80, physical: 10, fire: -15, ice: -10 },
    abilities: [A('nova', 'sand swarm', 'earth', 28, 68, 5, 'earth', 0, 1)],
    loot: [L('gold', 0.85, 47, 186), L('scarab_coin', 0.25), L('small_emerald', 0.03), L('scarab_shield', 0.01), L('scarab_amulet', 0.008)],
  }),
  mummy: E('mummy', {
    name: 'Mummy', maxHp: 1010, minDmg: 14, maxDmg: 49, armor: 12, attackInterval: 1.8, stepTime: 0.42, aggroRange: 6, leash: 9, wanderRadius: 2, exp: 58, respawn: 60,
    resist: { death: 100, earth: 30, holy: -30, fire: -15 },
    abilities: [A('ranged', 'curse of the tomb', 'death', 26, 64, 4, 'death', 4)],
    loot: [L('gold', 0.9, 37, 148), L('mummy_wrapping', 0.5), L('scarab_coin', 0.2), L('health_potion', 0.2), L('golden_goblet', 0.015), L('scarab_amulet', 0.01), L('small_ruby', 0.03)],
  }),
  // --- lizardfolk ------------------------------------------------------------------
  lizard_sentinel: E('lizard_sentinel', {
    name: 'Lizard Sentinel', maxHp: 769, minDmg: 14, maxDmg: 54, armor: 12, attackInterval: 1.7, stepTime: 0.31, aggroRange: 7, leash: 10, wanderRadius: 3, exp: 57, respawn: 55,
    kite: 3, resist: { earth: 40, fire: 10, ice: -15 },
    abilities: [A('ranged', 'barbed spear', 'physical', 38, 105, 2.4, 'spear', 4)],
    loot: [L('gold', 0.9, 71, 295), L('lizard_scale', 0.3), L('spear', 0.4, 1, 3), L('royal_spear', 0.15, 1, 3), L('health_potion', 0.2), L('enchanted_spear', 0.02)],
  }),
  lizard_templar: E('lizard_templar', {
    name: 'Lizard Templar', maxHp: 1850, minDmg: 39, maxDmg: 148, armor: 22, attackInterval: 1.6, stepTime: 0.31, aggroRange: 7, leash: 9, wanderRadius: 3, exp: 193, respawn: 90,
    resist: { earth: 50, fire: 15, ice: -15, physical: 5 },
    abilities: [A('nova', 'tail sweep', 'physical', 51, 135, 5, 'stone', 0, 1), A('heal', 'serpent prayer', 'holy', 156, 292, 9, 'heal')],
    loot: [L('gold', 1, 101, 327), L('lizard_scale', 0.5, 1, 2), L('strong_health_potion', 0.2), L('lizard_blade', 0.012), L('lizardscale_armor', 0.01), L('scarab_shield', 0.02), L('small_emerald', 0.08)],
  }),
  // --- the frozen north (high) -------------------------------------------------------
  crystal_spider: E('crystal_spider', {
    name: 'Crystal Spider', maxHp: 2040, minDmg: 34, maxDmg: 137, armor: 18, attackInterval: 1.5, stepTime: 0.29, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 267, respawn: 80,
    resist: { fire: -20, energy: -10, ice: 100, earth: -5 },
    abilities: [A('ranged', 'crystal shards', 'ice', 63, 159, 4, 'ice', 4), A('nova', 'frost web', 'ice', 46, 114, 7, 'ice', 0, 1)],
    loot: [L('gold', 1, 125, 459), L('crystal_shard', 0.25), L('spider_silk', 0.4, 1, 2), L('strong_health_potion', 0.15), L('frost_pendant', 0.02), L('frost_helm', 0.01), L('glacier_boots', 0.006)],
  }),
  ice_witch: E('ice_witch', {
    name: 'Ice Witch', maxHp: 1481, minDmg: 12, maxDmg: 48, armor: 10, attackInterval: 2, stepTime: 0.3, aggroRange: 8, leash: 9, wanderRadius: 2, exp: 157, respawn: 80,
    kite: 3, resist: { fire: -20, energy: 10, ice: 100, earth: -5, holy: -5 },
    abilities: [
      A('ranged', 'ice bolt', 'ice', 66, 156, 3, 'ice', 4),
      A('blast', 'blizzard', 'ice', 54, 126, 7, 'ice', 4, 1),
      A('heal', 'winter\'s embrace', 'holy', 137, 273, 8, 'heal'),
    ],
    loot: [L('gold', 1, 25, 90), L('crystal_shard', 0.2), L('strong_mana_potion', 0.25), L('mastermind_potion', 0.05), L('frost_circlet', 0.012), L('glacier_robe', 0.01), L('rod_of_glaciers', 0.008), L('frost_pendant', 0.03)],
  }),
  frost_giantess: E('frost_giantess', {
    name: 'Frost Giantess', maxHp: 1768, minDmg: 24, maxDmg: 101, armor: 18, attackInterval: 1.8, stepTime: 0.36, aggroRange: 7, leash: 9, wanderRadius: 3, exp: 194, respawn: 80,
    resist: { ice: 80, physical: 5, fire: -15, energy: -10 },
    abilities: [A('ranged', 'hurled ice block', 'physical', 48, 135, 4.5, 'stone', 5)],
    loot: [L('gold', 1, 100, 359), L('giant_beard', 0.1), L('ham', 0.5, 1, 3), L('mead', 0.3, 1, 2), L('fur_backpack', 0.03), L('frost_legs', 0.008), L('strong_health_potion', 0.15), L('small_sapphire', 0.05)],
  }),
  frost_giant: E('frost_giant', {
    name: 'Frost Giant', maxHp: 2241, minDmg: 32, maxDmg: 129, armor: 22, attackInterval: 1.9, stepTime: 0.37, aggroRange: 7, leash: 9, wanderRadius: 3, exp: 252, respawn: 90,
    resist: { ice: 80, physical: 8, fire: -15, energy: -10 },
    abilities: [A('nova', 'ground stomp', 'physical', 46, 120, 5, 'stone', 0, 1), A('ranged', 'hurled ice block', 'physical', 55, 138, 6, 'stone', 4)],
    loot: [L('gold', 1, 138, 447), L('giant_beard', 0.18), L('ham', 0.5, 1, 3), L('glacial_cleaver', 0.008), L('frost_helm', 0.015), L('fur_backpack', 0.03), L('berserk_potion', 0.05), L('small_sapphire', 0.08)],
  }),
  ice_golem: E('ice_golem', {
    name: 'Ice Golem', maxHp: 2716, minDmg: 51, maxDmg: 192, armor: 30, attackInterval: 2, stepTime: 0.42, aggroRange: 6, leash: 8, wanderRadius: 2, exp: 514, respawn: 100,
    resist: { physical: 20, fire: -25, energy: -15, ice: 100, earth: -10, death: 60 },
    abilities: [A('ranged', 'ice spike', 'ice', 90, 205, 4, 'ice', 4), A('nova', 'frost burst', 'ice', 77, 179, 6, 'ice', 0, 1)],
    loot: [L('gold', 1, 54, 163), L('crystal_shard', 0.4, 1, 2), L('frozen_heart', 0.06), L('small_sapphire', 0.12), L('frost_plate', 0.006), L('frost_bolt', 0.15, 3, 10), L('great_mana_potion', 0.1)],
  }),
  frost_dragon: E('frost_dragon', {
    name: 'Frost Dragon', maxHp: 4098, minDmg: 58, maxDmg: 234, armor: 28, attackInterval: 2, stepTime: 0.4, aggroRange: 7, leash: 8, wanderRadius: 2, exp: 987, respawn: 180,
    resist: { fire: -15, energy: -10, ice: 100, death: 20 },
    abilities: [
      A('blast', 'ice breath', 'ice', 129, 292, 4.5, 'ice', 5, 1),
      A('nova', 'glacial roar', 'ice', 105, 246, 8, 'ice', 0, 2),
      A('ranged', 'frost bite', 'ice', 94, 211, 5, 'ice', 4),
    ],
    loot: [
      L('gold', 1, 40, 128), L('frost_dragon_scale', 0.5, 1, 3), L('dragon_scale', 0.4, 1, 2), L('great_health_potion', 0.2), L('great_mana_potion', 0.2),
      L('frostscale_shield', 0.012), L('frost_plate', 0.008), L('frost_legs', 0.012), L('frostbite_crossbow', 0.006), L('frozen_heart', 0.1), L('small_sapphire', 0.3), L('small_diamond', 0.1),
    ],
  }),

  // --- the Gravewind Steppe (world/spiderSteppe.ts) -------------------------------------
  dread_weaver: E('dread_weaver', {
    name: 'Dread Weaver', maxHp: 2531, minDmg: 36, maxDmg: 177, armor: 20, attackInterval: 1.6, stepTime: 0.29, aggroRange: 7, leash: 10, wanderRadius: 3, exp: 445, respawn: 75,
    resist: { earth: 80, death: 10, fire: -15, energy: -5 },
    abilities: [
      { ...A('ranged', 'venom spit', 'earth', 55, 136, 4, 'earth', 4), poison: 0.5 },
      { ...A('ranged', 'binding web', 'physical', 18, 55, 8, 'stone', 4), web: 4 },
      { ...A('blast', 'poison cloud', 'earth', 50, 118, 9, 'earth', 4, 1), poison: 0.6 },
    ],
    loot: [
      L('gold', 1, 128, 512), L('spider_silk', 0.5, 1, 3), L('dread_silk', 0.18), L('venom_gland', 0.12), L('strong_health_potion', 0.2), L('strong_mana_potion', 0.15),
      L('poison_arrow', 0.15, 4, 10), L('jade_amulet', 0.02), L('small_emerald', 0.06),
      // set pieces for a level 60-80 hunt
      L('darkstone_legs', 0.006), L('darkstone_boots', 0.008), L('crownguard_helm', 0.01), L('crownguard_legs', 0.008), L('glacier_boots', 0.01), L('elven_boots', 0.012),
    ],
  }),
  gravesilk_colossus: E('gravesilk_colossus', {
    name: 'Gravesilk Colossus', elite: true, enrage: 0.25,
    maxHp: 132291, minDmg: 78, maxDmg: 304, armor: 36, attackInterval: 1.8, stepTime: 0.32, aggroRange: 8, leash: 10, wanderRadius: 2, exp: 159973, respawn: 7200,
    resist: { earth: 100, death: 25, physical: 10, fire: -15, holy: -5 },
    abilities: [
      { ...A('blast', 'grave venom', 'earth', 91, 214, 6, 'earth', 5, 2), poison: 0.7 },
      { ...A('ranged', 'shroud web', 'physical', 39, 97, 7, 'stone', 5), web: 6 },
      A('beam', 'silk lance', 'earth', 104, 220, 9, 'earth', 6),
      S('brood call', 'dread_weaver', 1, 2, 30),
      A('heal', 'cocoon mending', 'holy', 3608, 6013, 16, 'heal'),
    ],
    herald: {
      spawn: 'The ground of the Gravewind Steppe trembles: the Gravesilk Colossus has woken in its nest.',
      kill: 'The Gravesilk Colossus has been slain on the Gravewind Steppe',
    },
    loot: [
      L('gold', 1, 600, 1500), L('dread_silk', 1, 2, 5), L('venom_gland', 1, 1, 3), L('colossus_eye', 0.5), L('great_health_potion', 0.6, 1, 3), L('great_mana_potion', 0.6, 1, 3),
      L('small_emerald', 0.6, 1, 3), L('small_diamond', 0.3, 1, 2),
      L('gravesilk_wraps', 0.05), L('silk_throne_amulet', 0.05),
      L('darkstone_plate', 0.03), L('darkstone_helm', 0.04), L('crownguard_armor', 0.05), L('voidweave_boots', 0.01), L('skyfeather_boots', 0.01),
    ],
  }),
  // =================================================================== bosses (see bosses/bosses.ts)
  // Dungeon bosses: one per region, elite, slow to respawn (1–4 hours), guaranteed rare loot and a chance at their unique item.
  boss_ironjaw: E('boss_ironjaw', {
    name: 'Ughrak Ironjaw', title: 'Warchief of Grimtusk', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 62255, minDmg: 16, maxDmg: 87, armor: 16, attackInterval: 1.6, stepTime: 0.32, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 12221, respawn: 3600,
    abilities: [A('nova', 'cleaving spin', 'physical', 24, 71, 6, 'stone', 0, 1), S('war cry', 'orc_spearman', 2, 4, 20), A('ranged', 'hurled axe', 'physical', 24, 63, 4, 'spear', 4)],
    loot: [L('gold', 1, 300, 700), L('orc_banner', 1), L('orc_warhelm', 1), L('strong_health_potion', 1, 2, 4), L('small_ruby', 1, 1, 2), L('ironjaw_helm', 0.25), L('ring_of_might', 0.06)],
  }),
  boss_bonebound: E('boss_bonebound', {
    name: 'Lord Ossric', title: 'the Bonebound', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 49804, minDmg: 17, maxDmg: 95, armor: 12, attackInterval: 1.7, stepTime: 0.38, aggroRange: 7, leash: 8, wanderRadius: 1, exp: 12221, respawn: 3600,
    resist: { death: 100, holy: -25, ice: 20 },
    abilities: [A('nova', 'grave chill', 'death', 28, 78, 5, 'death', 0, 2), S('raise the fallen', 'skeleton', 2, 4, 18), A('heal', 'bone mending', 'holy', 1019, 1698, 12, 'heal')],
    loot: [L('gold', 1, 250, 600), L('bone', 1, 3, 6), L('strong_health_potion', 1, 1, 3), L('iron_shield', 1), L('small_emerald', 1), L('bonebound_amulet', 0.25), L('scarab_amulet', 0.05)],
  }),
  boss_delving_king: E('boss_delving_king', {
    name: 'Grimbold Ashanvil', title: 'the Delving King', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 62255, minDmg: 17, maxDmg: 83, armor: 26, attackInterval: 1.7, stepTime: 0.36, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 12221, respawn: 5400,
    resist: { physical: 10, earth: 20, fire: 10 },
    abilities: [A('nova', 'hammer quake', 'physical', 33, 89, 6, 'stone', 0, 2), A('ranged', 'thrown hammer', 'physical', 28, 78, 4, 'stone', 4), S('call the guard', 'dwarf_soldier', 2, 4, 22)],
    loot: [L('gold', 1, 500, 1200), L('dwarven_armor', 1), L('dwarven_legs', 0.5), L('dwarven_shield', 1), L('small_diamond', 1), L('ashanvil_hammer', 0.22), L('dwarven_helmet', 0.4)],
  }),
  boss_labyrinth_lord: E('boss_labyrinth_lord', {
    name: 'Gorhorn', title: 'Lord of the Labyrinth', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 65000, minDmg: 15, maxDmg: 72, armor: 22, attackInterval: 1.5, stepTime: 0.3, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 12221, respawn: 5400,
    resist: { earth: 15, physical: 5 },
    abilities: [A('beam', 'goring charge', 'physical', 38, 89, 6, 'stone', 5), A('nova', 'trample', 'physical', 26, 64, 7, 'stone', 0, 1), S('horn call', 'minotaur_archer', 2, 4, 22)],
    loot: [L('gold', 1, 500, 1200), L('minotaur_horn', 1, 3, 5), L('plate_legs', 1), L('great_health_potion', 1, 1, 3), L('small_ruby', 1, 1, 2), L('labyrinth_greaves', 0.22), L('tower_shield', 0.15)],
  }),
  boss_venom_oracle: E('boss_venom_oracle', {
    name: 'Sszarak', title: 'the Venom Oracle', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 101654, minDmg: 39, maxDmg: 186, armor: 24, attackInterval: 1.7, stepTime: 0.31, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 69029, respawn: 7200,
    resist: { earth: 80, fire: 15, ice: -15, physical: 5 },
    abilities: [
      A('wave', 'venom spray', 'earth', 117, 254, 6, 'earth', 5),
      A('blast', 'poison rain', 'earth', 88, 196, 7, 'earth', 5, 2),
      S('serpent call', 'lizard_sentinel', 2, 4, 20),
      A('heal', 'serpent prayer', 'holy', 2426, 4043, 14, 'heal'),
    ],
    loot: [L('gold', 1, 800, 1800), L('lizard_scale', 1, 3, 6), L('jade_amulet', 1), L('great_mana_potion', 1, 2, 4), L('small_emerald', 1, 2, 4), L('oracle_rod', 0.2), L('lizard_blade', 0.12), L('lizardscale_armor', 0.12)],
  }),
  boss_ember_matriarch: E('boss_ember_matriarch', {
    name: 'Kaerith', title: 'Mother of Flames', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 98557, minDmg: 39, maxDmg: 173, armor: 28, attackInterval: 2, stepTime: 0.38, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 59324, respawn: 9000,
    resist: { fire: 100, ice: -10, earth: 20 },
    abilities: [
      A('wave', 'searing breath', 'fire', 157, 354, 6, 'fire', 5),
      A('nova', 'wingbeat inferno', 'fire', 118, 252, 9, 'fire', 0, 2),
      S('brood call', 'dragon', 1, 2, 30),
    ],
    loot: [L('gold', 1, 1000, 2500), L('red_dragon_scale', 1, 2, 4), L('dragon_scale', 1, 3, 6), L('dragon_helm', 0.5), L('great_health_potion', 1, 2, 4), L('small_ruby', 1, 3, 6), L('matriarch_scalemail', 0.2), L('dragonbane_crossbow', 0.06), L('dragonhide_pack', 0.1)],
  }),
  boss_sand_king: E('boss_sand_king', {
    name: 'Ankhset', title: 'the Undying Sand King', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 91314, minDmg: 34, maxDmg: 145, armor: 26, attackInterval: 1.8, stepTime: 0.4, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 44750, respawn: 10800,
    resist: { death: 100, earth: 30, holy: -25, fire: -10 },
    abilities: [
      A('beam', 'curse of ages', 'death', 101, 213, 5, 'death', 6),
      A('blast', 'sandstorm', 'earth', 67, 145, 7, 'earth', 5, 2),
      S('wake the dead', 'mummy', 3, 5, 24),
      A('heal', 'embalmed vigour', 'holy', 2490, 4151, 16, 'heal'),
    ],
    loot: [L('gold', 1, 1500, 3500), L('golden_goblet', 1, 1, 2), L('scarab_coin', 1, 5, 10), L('scarab_amulet', 1), L('small_diamond', 1, 2, 4), L('sandking_crown', 0.2), L('kings_edge', 0.05)],
  }),
  boss_mire_hydra: E('boss_mire_hydra', {
    name: 'Mirewretch', title: 'the Hundred-Fanged', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 134987, minDmg: 64, maxDmg: 268, armor: 28, attackInterval: 1.8, stepTime: 0.42, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 175054, respawn: 10800,
    resist: { ice: 60, earth: 100, fire: -10, energy: 10 },
    abilities: [
      A('wave', 'frost spray', 'ice', 193, 428, 6, 'ice', 5),
      A('blast', 'venom flood', 'earth', 150, 321, 7, 'earth', 5, 2),
      A('heal', 'regrowth', 'holy', 3451, 5752, 15, 'heal'),
    ],
    loot: [L('gold', 1, 1500, 3500), L('hydra_head', 1, 2, 3), L('hydra_egg', 1, 1, 2), L('hydra_legs', 0.5), L('great_mana_potion', 1, 3, 5), L('small_sapphire', 1, 3, 6), L('hundred_fang_bow', 0.2), L('rod_of_glaciers', 0.3)],
  }),
  boss_rime_wyrm: E('boss_rime_wyrm', {
    name: 'Hrimgaard', title: 'the Rime Wyrm', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 146648, minDmg: 71, maxDmg: 283, armor: 32, attackInterval: 2, stepTime: 0.4, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 185667, respawn: 10800,
    resist: { ice: 100, earth: 30, death: 20, fire: -15, energy: -10 },
    abilities: [
      A('wave', 'rime breath', 'ice', 221, 460, 6, 'ice', 6),
      A('nova', 'glacial roar', 'ice', 159, 353, 9, 'ice', 0, 3),
      S('ice call', 'ice_golem', 2, 4, 28),
      A('ranged', 'frost bite', 'ice', 106, 230, 4, 'ice', 5),
    ],
    loot: [L('gold', 1, 2000, 4000), L('frost_dragon_scale', 1, 3, 6), L('frozen_heart', 1, 1, 2), L('frost_plate', 0.4), L('frostscale_shield', 0.4), L('small_sapphire', 1, 4, 8), L('hrimgaard_fang', 0.2), L('frostbite_crossbow', 0.15)],
  }),
  boss_ashen_sovereign: E('boss_ashen_sovereign', {
    name: 'Vorthazul', title: 'the Ashen Sovereign', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 212906, minDmg: 144, maxDmg: 577, armor: 45, attackInterval: 2, stepTime: 0.34, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 332463, respawn: 14400,
    resist: { fire: 100, physical: 25, energy: 40, death: 30, holy: -20, ice: -10 },
    abilities: [
      A('blast', 'ashfall', 'fire', 289, 625, 6, 'fire', 6, 3),
      A('beam', 'abyssal lance', 'energy', 337, 625, 7, 'energy', 7),
      S('summon embers', 'fire_elemental', 2, 4, 25),
      A('heal', 'sovereign will', 'holy', 6532, 10887, 18, 'heal'),
    ],
    loot: [
      L('gold', 1, 4000, 8000), L('demonic_essence', 1, 2, 4), L('demon_horn', 1, 1, 2), L('small_diamond', 1, 4, 8), L('great_health_potion', 1, 3, 6),
      L('demon_shield', 0.2), L('demon_helm', 0.15), L('demonplate', 0.08), L('demonbone_amulet', 0.15), L('sovereign_wand', 0.15), L('ashen_will_ring', 0.15),
    ],
  }),
  // World bosses: colossal, need many players; loot is shared by contribution (bosses/WorldEvents.ts), never dropped on the ground.
  wb_mountain: E('wb_mountain', {
    name: 'Gorrumvald', title: 'the Mountain That Walks', boss: 'world', elite: true, enrage: 0.3,
    maxHp: 1294564, minDmg: 251, maxDmg: 1089, armor: 50, attackInterval: 2.2, stepTime: 0.5, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 522112, respawn: 999999,
    resist: { physical: 20, earth: 40, fire: 10, energy: -10 },
    abilities: [
      A('nova', 'earthquake', 'physical', 251, 670, 7, 'stone', 0, 4),
      A('blast', 'boulder rain', 'physical', 335, 804, 6, 'stone', 7, 3),
      S('stone kin', 'cyclops', 3, 6, 30),
    ],
    loot: [
      L('gold', 1, 3000, 6000), L('great_health_potion', 1, 3, 6), L('small_diamond', 0.8, 1, 4), L('behemoth_claw', 0.5), L('thunder_maul', 0.08), L('steel_boots', 0.3),
      L('mountainheart_shield', 0.06), L('colossus_maul', 0.06),
    ],
  }),
  wb_storm_serpent: E('wb_storm_serpent', {
    name: 'Vaelith', title: 'the Storm Serpent', boss: 'world', elite: true, enrage: 0.3,
    maxHp: 1294564, minDmg: 190, maxDmg: 823, armor: 40, attackInterval: 2, stepTime: 0.45, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 522112, respawn: 999999,
    resist: { energy: 100, ice: 40, earth: -15, fire: 10 },
    abilities: [
      A('beam', 'lightning lance', 'energy', 396, 871, 5, 'energy', 8),
      A('nova', 'thunderstorm', 'energy', 238, 554, 8, 'energy', 0, 4),
      A('wave', 'tidal crash', 'ice', 317, 665, 7, 'ice', 6),
      S('call of the deep', 'crocodile', 3, 6, 30),
    ],
    loot: [
      L('gold', 1, 3000, 6000), L('great_mana_potion', 1, 3, 6), L('small_sapphire', 0.8, 1, 4), L('wand_of_storms', 0.15), L('storm_tome', 0.08),
      L('stormcoil_wand', 0.06), L('tidecrest_boots', 0.06),
    ],
  }),
  wb_blight_mother: E('wb_blight_mother', {
    name: 'Nhalgrith', title: 'the Blight Mother', boss: 'world', elite: true, enrage: 0.3,
    maxHp: 1294564, minDmg: 217, maxDmg: 933, armor: 42, attackInterval: 1.9, stepTime: 0.42, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 522112, respawn: 999999,
    resist: { earth: 100, death: 30, fire: -20, holy: -10 },
    abilities: [
      A('blast', 'blight rain', 'earth', 300, 700, 6, 'earth', 7, 3),
      A('wave', 'venom torrent', 'earth', 367, 767, 7, 'earth', 6),
      S('brood swarm', 'tarantula', 4, 8, 22),
      A('heal', 'brood feast', 'holy', 5394, 8990, 20, 'heal'),
    ],
    loot: [
      L('gold', 1, 3000, 6000), L('great_health_potion', 1, 2, 4), L('spider_silk', 1, 3, 8), L('small_emerald', 0.8, 1, 4), L('jade_amulet', 0.3), L('elven_aegis', 0.08),
      L('blightweave_robe', 0.06), L('broodmother_crossbow', 0.06),
    ],
  }),
  // Raid bosses: end the last wave of a raid (bosses/bosses.ts RAIDS); never respawn.
  raid_tusk_warlord: E('raid_tusk_warlord', {
    name: 'Grashnak Tuskbreaker', title: 'the Burning Warlord', boss: 'raid', elite: true, enrage: 0.3,
    maxHp: 78038, minDmg: 22, maxDmg: 99, armor: 20, attackInterval: 1.5, stepTime: 0.3, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 18550, respawn: 999999,
    abilities: [A('nova', 'burning whirl', 'fire', 37, 93, 6, 'fire', 0, 2), A('ranged', 'hurled axe', 'physical', 31, 81, 4, 'spear', 4), S('rally', 'orc_berserker', 2, 4, 25)],
    loot: [L('gold', 1, 800, 1600), L('orc_banner', 1, 1, 2), L('orc_warhelm', 1), L('double_axe', 0.3), L('tower_shield', 0.2), L('ring_of_might', 0.1), L('small_ruby', 1, 1, 3)],
  }),
  raid_grave_warden: E('raid_grave_warden', {
    name: 'Sexton Morrow', title: 'the Gravewarden', boss: 'raid', elite: true, enrage: 0.3,
    maxHp: 49804, minDmg: 19, maxDmg: 95, armor: 14, attackInterval: 1.7, stepTime: 0.36, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 12221, respawn: 999999,
    resist: { death: 100, holy: -30, earth: 30 },
    abilities: [A('nova', 'grave dirt', 'death', 29, 86, 6, 'death', 0, 2), S('dig up', 'skeleton', 3, 5, 20), A('heal', 'unholy rite', 'holy', 1189, 1981, 14, 'heal')],
    loot: [L('gold', 1, 400, 900), L('bone', 1, 3, 6), L('strong_health_potion', 1, 2, 3), L('chain_armor', 0.5), L('golden_goblet', 0.25), L('small_emerald', 1)],
  }),
  raid_frost_jarl: E('raid_frost_jarl', {
    name: 'Hjalmvar Rimeborn', title: 'Jarl of the Frostmarch', boss: 'raid', elite: true, enrage: 0.3,
    maxHp: 134351, minDmg: 46, maxDmg: 204, armor: 28, attackInterval: 1.8, stepTime: 0.36, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 70045, respawn: 999999,
    resist: { ice: 80, physical: 10, fire: -15, energy: -10 },
    abilities: [A('nova', 'frost stomp', 'ice', 93, 223, 6, 'ice', 0, 2), A('wave', 'blizzard breath', 'ice', 130, 278, 7, 'ice', 5), A('ranged', 'hurled ice block', 'physical', 84, 186, 5, 'stone', 5)],
    loot: [L('gold', 1, 1200, 2500), L('giant_beard', 1, 1, 3), L('frost_helm', 0.3), L('glacial_cleaver', 0.15), L('fur_backpack', 0.4), L('small_sapphire', 1, 2, 4)],
  }),
  raid_swarm_queen: E('raid_swarm_queen', {
    name: 'Ixtara', title: 'Queen of the Swarm', boss: 'raid', elite: true, enrage: 0.3,
    maxHp: 91314, minDmg: 38, maxDmg: 162, armor: 30, attackInterval: 1.6, stepTime: 0.34, aggroRange: 9, leash: 8, wanderRadius: 3, exp: 44750, respawn: 999999,
    resist: { earth: 90, physical: 15, fire: -15, ice: -10 },
    abilities: [A('blast', 'sand swarm', 'earth', 87, 216, 6, 'earth', 5, 2), S('brood', 'scarab', 4, 8, 20), A('heal', 'royal jelly', 'holy', 2335, 3891, 15, 'heal')],
    loot: [L('gold', 1, 900, 1800), L('scarab_coin', 1, 4, 8), L('scarab_shield', 0.4), L('scarab_amulet', 0.4), L('small_emerald', 1, 1, 3)],
  }),
  // the Sunken Reach (seaDefs.ts, world/sea.ts)
  ...SEA_ENEMIES,
  ...SLAYER_ENEMIES,
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

// pets (pets/petDefs.ts): rare drops of the monsters and bosses that bring them
for (const [kind, drops] of Object.entries(PET_DROPS)) {
  const e = ENEMIES[kind as EnemyKind];
  if (e) for (const [id, chance] of drops) if (!e.loot.some((l) => l.id === id)) e.loot.push(L(id, chance));
}

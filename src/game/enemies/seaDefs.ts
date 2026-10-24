import type { Element } from '../inventory/items';
import type { EnemyKind } from '../world/WorldMap';
import type { SeaKind } from '../world/sea';
import type { Ability, EnemyDef, LootEntry } from './enemyDefs';

/**
 * Monsters of the Sunken Reach (world/sea.ts), for characters of level 25–50 (balance 2026-10-24).
 * They live in groups: jelly swarms (low health, many of them), deepfin war bands
 * (raider melee + harpooner spears + tidecaller water magic), slow armoured crabs
 * and fast eels, so area runes, arrows and the knight's area spells pay off.
 * Merged into ENEMIES by enemyDefs.ts; gear-set drops come from sets.ts SET_DROPS.
 */
const A = (kind: Ability['kind'], name: string, element: Element, min: number, max: number, interval: number, effect: Ability['effect'], range = 4, radius = 0): Ability =>
  ({ kind, name, element, min, max, range, radius, interval, effect });
const S = (name: string, kind: EnemyKind, count: number, maxAlive: number, interval: number): Ability =>
  ({ kind: 'summon', name, element: 'physical', min: 0, max: 0, range: 3, radius: 0, interval, effect: 'death', summon: kind, count, maxAlive });
const L = (id: string, chance: number, min = 1, max = 1): LootEntry => ({ id, chance, min, max });
type Base = Omit<EnemyDef, 'abilities' | 'resist' | 'kind'> & Partial<Pick<EnemyDef, 'abilities' | 'resist'>>;
const E = (kind: SeaKind, d: Base): EnemyDef => ({ abilities: [], resist: {}, ...d, kind });

export const SEA_ENEMIES: Record<SeaKind, EnemyDef> = {
  lantern_jelly: E('lantern_jelly', {
    name: 'Lantern Jelly', maxHp: 312, minDmg: 2, maxDmg: 14, armor: 0, attackInterval: 1.8, stepTime: 0.48, aggroRange: 5, leash: 9, wanderRadius: 2, exp: 24, respawn: 40,
    resist: { energy: 100, ice: 20, earth: -15, physical: -10 },
    abilities: [A('ranged', 'stinging lash', 'energy', 21, 54, 2.4, 'energy', 1)],
    loot: [L('gold', 0.6, 24, 132), L('glowing_jelly', 0.35), L('pearl', 0.02), L('mana_potion', 0.08)],
  }),
  blight_jelly: E('blight_jelly', {
    name: 'Blight Jelly', maxHp: 333, minDmg: 2, maxDmg: 15, armor: 0, attackInterval: 1.8, stepTime: 0.48, aggroRange: 5, leash: 9, wanderRadius: 2, exp: 33, respawn: 40,
    resist: { physical: -10, energy: -15, earth: 100 },
    abilities: [A('ranged', 'venom lash', 'earth', 24, 59, 2.4, 'earth', 1)],
    loot: [L('gold', 0.6, 24, 132), L('glowing_jelly', 0.3), L('pearl', 0.02), L('health_potion', 0.08)],
  }),
  ironshell_crab: E('ironshell_crab', {
    name: 'Ironshell Crab', maxHp: 1888, minDmg: 28, maxDmg: 116, armor: 34, attackInterval: 2, stepTime: 0.44, aggroRange: 5, leash: 9, wanderRadius: 2, exp: 138, respawn: 70,
    resist: { physical: 20, energy: -25, ice: 30, earth: -10, death: 10 },
    abilities: [A('ranged', 'crushing pincer', 'physical', 67, 166, 4.5, 'stone', 1)],
    loot: [L('gold', 1, 120, 420), L('ironshell_claw', 0.18), L('red_coral', 0.12), L('pearl', 0.06), L('strong_health_potion', 0.1), L('small_sapphire', 0.02)],
  }),
  deepfin_raider: E('deepfin_raider', {
    name: 'Deepfin Raider', maxHp: 1073, minDmg: 16, maxDmg: 77, armor: 15, attackInterval: 1.6, stepTime: 0.3, aggroRange: 7, leash: 10, wanderRadius: 3, exp: 73, respawn: 55,
    resist: { ice: 30, fire: 10, energy: -15 },
    abilities: [A('ranged', 'trident lunge', 'physical', 32, 81, 5, 'spear', 2)],
    loot: [L('gold', 0.95, 90, 330), L('deepfin_scale', 0.35), L('pearl', 0.04), L('red_coral', 0.04), L('raw_fish', 0.3, 1, 2), L('health_potion', 0.15)],
  }),
  deepfin_harpooner: E('deepfin_harpooner', {
    name: 'Deepfin Harpooner', maxHp: 966, minDmg: 9, maxDmg: 33, armor: 11, attackInterval: 1.8, stepTime: 0.3, aggroRange: 8, leash: 11, wanderRadius: 3, exp: 81, respawn: 55,
    kite: 3, resist: { ice: 30, fire: 10, energy: -15 },
    abilities: [A('ranged', 'barbed harpoon', 'physical', 44, 120, 2.4, 'spear', 5)],
    loot: [L('gold', 0.95, 90, 300), L('deepfin_scale', 0.3), L('royal_spear', 0.1, 1, 3), L('spear', 0.3, 1, 4), L('pearl', 0.03)],
  }),
  deepfin_tidecaller: E('deepfin_tidecaller', {
    name: 'Deepfin Tidecaller', maxHp: 1105, minDmg: 7, maxDmg: 24, armor: 9, attackInterval: 2, stepTime: 0.31, aggroRange: 8, leash: 10, wanderRadius: 2, exp: 95, respawn: 60,
    kite: 3, resist: { ice: 60, fire: 10, energy: -15 },
    abilities: [
      A('ranged', 'frost lance', 'ice', 49, 120, 3, 'ice', 4),
      A('blast', 'undertow', 'ice', 38, 93, 7, 'ice', 4, 1),
      A('heal', 'tide mending', 'holy', 154, 334, 8, 'heal'),
    ],
    loot: [L('gold', 0.95, 120, 360), L('tide_shell', 0.25), L('mana_potion', 0.25), L('strong_mana_potion', 0.1), L('pearl', 0.05), L('avalanche_rune', 0.1, 1, 3), L('rod_of_glaciers', 0.004)],
  }),
  gloom_eel: E('gloom_eel', {
    name: 'Gloom Eel', maxHp: 1606, minDmg: 29, maxDmg: 112, armor: 13, attackInterval: 1.5, stepTime: 0.26, aggroRange: 7, leash: 10, wanderRadius: 4, exp: 123, respawn: 70,
    resist: { fire: -5, energy: 80, ice: 20, earth: -20 },
    abilities: [A('nova', 'galvanic pulse', 'energy', 49, 117, 6, 'energy', 0, 1)],
    loot: [L('gold', 0.9, 120, 389), L('gloom_eel_skin', 0.2), L('pearl', 0.03), L('strong_mana_potion', 0.08), L('wand_of_storms', 0.003)],
  }),
  // dungeon boss in the captain's cabin of the Drowned Crown (bosses/bosses.ts DUNGEON_BOSSES)
  boss_drowned_tyrant: E('boss_drowned_tyrant', {
    name: 'Ulmaroth', title: 'the Drowned Tyrant', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 78038, minDmg: 25, maxDmg: 102, armor: 26, attackInterval: 1.7, stepTime: 0.32, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 18550, respawn: 7200,
    resist: { ice: 70, fire: 15, physical: 10, energy: -15 },
    abilities: [
      A('wave', 'riptide', 'ice', 76, 161, 6, 'ice', 5),
      A('nova', 'crushing depths', 'physical', 47, 110, 8, 'stone', 0, 2),
      S('call the war band', 'deepfin_raider', 2, 4, 22),
      A('heal', "tide's embrace", 'holy', 1995, 3325, 15, 'heal'),
    ],
    loot: [
      L('gold', 1, 1200, 2800), L('pearl', 1, 3, 6), L('black_pearl', 1), L('red_coral', 1, 2, 4), L('great_mana_potion', 1, 2, 3), L('great_health_potion', 1, 1, 3),
      L('small_sapphire', 1, 2, 4), L('brinecrown', 0.18), L('tidebreaker', 0.12),
    ],
  }),
};

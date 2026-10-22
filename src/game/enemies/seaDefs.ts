import type { Element } from '../inventory/items';
import type { EnemyKind } from '../world/WorldMap';
import type { SeaKind } from '../world/sea';
import type { Ability, EnemyDef, LootEntry } from './enemyDefs';

/**
 * Monsters of the Sunken Reach (world/sea.ts), for characters of level 40–90.
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
    name: 'Lantern Jelly', maxHp: 160, minDmg: 2, maxDmg: 14, armor: 0, attackInterval: 1.8, stepTime: 0.48, aggroRange: 5, leash: 9, wanderRadius: 2, exp: 115, respawn: 40,
    resist: { energy: 100, ice: 20, earth: -15, physical: -10 },
    abilities: [A('ranged', 'stinging lash', 'energy', 22, 55, 2.4, 'energy', 1)],
    loot: [L('gold', 0.6, 4, 22), L('glowing_jelly', 0.35), L('pearl', 0.02), L('mana_potion', 0.08)],
  }),
  blight_jelly: E('blight_jelly', {
    name: 'Blight Jelly', maxHp: 175, minDmg: 2, maxDmg: 14, armor: 0, attackInterval: 1.8, stepTime: 0.48, aggroRange: 5, leash: 9, wanderRadius: 2, exp: 125, respawn: 40,
    resist: { earth: 100, ice: 20, energy: -15, physical: -10 },
    abilities: [A('ranged', 'venom lash', 'earth', 22, 55, 2.4, 'earth', 1)],
    loot: [L('gold', 0.6, 4, 22), L('glowing_jelly', 0.3), L('pearl', 0.02), L('health_potion', 0.08)],
  }),
  ironshell_crab: E('ironshell_crab', {
    name: 'Ironshell Crab', maxHp: 1050, minDmg: 25, maxDmg: 105, armor: 34, attackInterval: 2, stepTime: 0.44, aggroRange: 5, leash: 9, wanderRadius: 2, exp: 640, respawn: 70,
    resist: { physical: 20, ice: 30, earth: 10, death: 10, energy: -25 },
    abilities: [A('ranged', 'crushing pincer', 'physical', 60, 150, 4.5, 'stone', 1)],
    loot: [L('gold', 1, 20, 70), L('ironshell_claw', 0.18), L('red_coral', 0.12), L('pearl', 0.06), L('strong_health_potion', 0.1), L('small_sapphire', 0.02)],
  }),
  deepfin_raider: E('deepfin_raider', {
    name: 'Deepfin Raider', maxHp: 470, minDmg: 20, maxDmg: 95, armor: 15, attackInterval: 1.6, stepTime: 0.3, aggroRange: 7, leash: 10, wanderRadius: 3, exp: 380, respawn: 55,
    resist: { ice: 30, fire: 10, energy: -15 },
    abilities: [A('ranged', 'trident lunge', 'physical', 40, 100, 5, 'spear', 2)],
    loot: [L('gold', 0.95, 15, 55), L('deepfin_scale', 0.35), L('pearl', 0.04), L('red_coral', 0.04), L('raw_fish', 0.3, 1, 2), L('health_potion', 0.15)],
  }),
  deepfin_harpooner: E('deepfin_harpooner', {
    name: 'Deepfin Harpooner', maxHp: 400, minDmg: 8, maxDmg: 30, armor: 11, attackInterval: 1.8, stepTime: 0.3, aggroRange: 8, leash: 11, wanderRadius: 3, exp: 360, respawn: 55,
    kite: 3, resist: { ice: 30, fire: 10, energy: -15 },
    abilities: [A('ranged', 'barbed harpoon', 'physical', 40, 110, 2.4, 'spear', 5)],
    loot: [L('gold', 0.95, 15, 50), L('deepfin_scale', 0.3), L('royal_spear', 0.1, 1, 3), L('spear', 0.3, 1, 4), L('pearl', 0.03)],
  }),
  deepfin_tidecaller: E('deepfin_tidecaller', {
    name: 'Deepfin Tidecaller', maxHp: 430, minDmg: 6, maxDmg: 22, armor: 9, attackInterval: 2, stepTime: 0.31, aggroRange: 8, leash: 10, wanderRadius: 2, exp: 450, respawn: 60,
    kite: 3, resist: { ice: 60, fire: 10, energy: -15 },
    abilities: [
      A('ranged', 'frost lance', 'ice', 45, 110, 3, 'ice', 4),
      A('blast', 'undertow', 'ice', 35, 85, 7, 'ice', 4, 1),
      A('heal', 'tide mending', 'holy', 60, 130, 8, 'heal'),
    ],
    loot: [L('gold', 0.95, 20, 60), L('tide_shell', 0.25), L('mana_potion', 0.25), L('strong_mana_potion', 0.1), L('pearl', 0.05), L('avalanche_rune', 0.1, 1, 3), L('rod_of_glaciers', 0.004)],
  }),
  gloom_eel: E('gloom_eel', {
    name: 'Gloom Eel', maxHp: 780, minDmg: 30, maxDmg: 115, armor: 13, attackInterval: 1.5, stepTime: 0.26, aggroRange: 7, leash: 10, wanderRadius: 4, exp: 560, respawn: 70,
    resist: { energy: 80, ice: 20, earth: -20 },
    abilities: [A('nova', 'galvanic pulse', 'energy', 50, 120, 6, 'energy', 0, 1)],
    loot: [L('gold', 0.9, 20, 65), L('gloom_eel_skin', 0.2), L('pearl', 0.03), L('strong_mana_potion', 0.08), L('wand_of_storms', 0.003)],
  }),
  // dungeon boss in the captain's cabin of the Drowned Crown (bosses/bosses.ts DUNGEON_BOSSES)
  boss_drowned_tyrant: E('boss_drowned_tyrant', {
    name: 'Ulmaroth', title: 'the Drowned Tyrant', boss: 'dungeon', elite: true, enrage: 0.3,
    maxHp: 16000, minDmg: 60, maxDmg: 240, armor: 26, attackInterval: 1.7, stepTime: 0.32, aggroRange: 8, leash: 8, wanderRadius: 2, exp: 11500, respawn: 7200,
    resist: { ice: 70, fire: 15, physical: 10, energy: -15 },
    abilities: [
      A('wave', 'riptide', 'ice', 180, 380, 6, 'ice', 5),
      A('nova', 'crushing depths', 'physical', 110, 260, 8, 'stone', 0, 2),
      S('call the war band', 'deepfin_raider', 2, 4, 22),
      A('heal', "tide's embrace", 'holy', 900, 1600, 15, 'heal'),
    ],
    loot: [
      L('gold', 1, 1200, 2800), L('pearl', 1, 3, 6), L('black_pearl', 1), L('red_coral', 1, 2, 4), L('great_mana_potion', 1, 2, 3), L('great_health_potion', 1, 1, 3),
      L('small_sapphire', 1, 2, 4), L('brinecrown', 0.18), L('tidebreaker', 0.12),
    ],
  }),
};

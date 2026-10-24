import type { Element } from '../inventory/items';
import type { SlayerKind } from '../trades/slayer';
import type { Ability, EnemyDef, LootEntry } from './enemyDefs';

/**
 * The slayer monsters (trades/slayer.ts SLAYER_REQ): only a slayer of their level can hurt them, the
 * wailing shades only one wearing a hush cowl. Tougher and better paid than their look-alikes, they
 * live in the deeper caves and crypts (world/tradeSpots.ts places them after the whole world).
 * Merged into ENEMIES by enemyDefs.ts. Models: rigs.ts SLAYER_LOOK (a tinted cousin of an existing monster).
 */
const A = (kind: Ability['kind'], name: string, element: Element, min: number, max: number, interval: number, effect: Ability['effect'], range = 4, radius = 0): Ability =>
  ({ kind, name, element, min, max, range, radius, interval, effect });
const L = (id: string, chance: number, min = 1, max = 1): LootEntry => ({ id, chance, min, max });
type Base = Omit<EnemyDef, 'abilities' | 'resist' | 'kind'> & Partial<Pick<EnemyDef, 'abilities' | 'resist'>>;
const E = (kind: SlayerKind, d: Base): EnemyDef => ({ abilities: [], resist: {}, ...d, kind });

export const SLAYER_ENEMIES: Record<SlayerKind, EnemyDef> = {
  gloomcrawler: E('gloomcrawler', {
    name: 'Gloomcrawler', maxHp: 700, minDmg: 18, maxDmg: 64, armor: 12, attackInterval: 1.5, stepTime: 0.32, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 58, respawn: 55,
    resist: { earth: 50, fire: -10 },
    abilities: [A('ranged', 'blinding ichor', 'earth', 26, 60, 4, 'earth', 3)],
    loot: [L('gold', 0.9, 60, 200), L('spider_silk', 0.35), L('poison_arrow', 0.15, 3, 8), L('health_potion', 0.15), L('small_emerald', 0.02)],
  }),
  wailing_shade: E('wailing_shade', {
    name: 'Wailing Shade', maxHp: 1500, minDmg: 30, maxDmg: 95, armor: 8, attackInterval: 1.8, stepTime: 0.34, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 180, respawn: 70,
    resist: { death: 100, physical: 20, ice: 20, holy: -30 },
    abilities: [A('nova', 'mournful wail', 'death', 40, 100, 5, 'death', 0, 2), A('ranged', 'grave touch', 'death', 50, 120, 4, 'death', 3)],
    loot: [L('gold', 1, 90, 280), L('bone', 0.5, 1, 3), L('mana_potion', 0.2), L('strong_health_potion', 0.1), L('golden_goblet', 0.02)],
  }),
  cinder_wraith: E('cinder_wraith', {
    name: 'Cinder Wraith', maxHp: 2600, minDmg: 55, maxDmg: 190, armor: 14, attackInterval: 1.8, stepTime: 0.33, aggroRange: 6, leash: 9, wanderRadius: 3, exp: 460, respawn: 90,
    resist: { fire: 100, death: 30, energy: 10, ice: -25 },
    abilities: [A('blast', 'cinder storm', 'fire', 80, 200, 5, 'fire', 4, 1), A('ranged', 'ash lance', 'fire', 90, 220, 4, 'fire', 4)],
    loot: [L('gold', 1, 120, 360), L('fiery_heart', 0.15), L('fireball_rune', 0.2, 3, 8), L('strong_mana_potion', 0.15), L('small_ruby', 0.08)],
  }),
  marrow_gargoyle: E('marrow_gargoyle', {
    name: 'Marrow Gargoyle', maxHp: 3900, minDmg: 80, maxDmg: 280, armor: 40, attackInterval: 2, stepTime: 0.4, aggroRange: 6, leash: 8, wanderRadius: 2, exp: 900, respawn: 120,
    resist: { physical: 30, earth: 30, death: 40, energy: -20, holy: -10 },
    abilities: [A('ranged', 'bone shard', 'physical', 110, 300, 4.5, 'stone', 4), A('nova', 'shatter', 'physical', 90, 220, 7, 'stone', 0, 1)],
    loot: [L('gold', 1, 150, 450), L('bone', 0.6, 2, 4), L('skull_trophy', 0.1), L('great_health_potion', 0.15), L('small_diamond', 0.08)],
  }),
  abyssal_horror: E('abyssal_horror', {
    name: 'Abyssal Horror', maxHp: 7400, minDmg: 120, maxDmg: 560, armor: 42, attackInterval: 2, stepTime: 0.34, aggroRange: 7, leash: 8, wanderRadius: 2, exp: 2500, respawn: 300,
    elite: true, resist: { death: 60, fire: 50, energy: -10, holy: -25 },
    abilities: [
      A('blast', 'void rupture', 'death', 160, 400, 5, 'death', 5, 2),
      A('ranged', 'abyssal grasp', 'death', 140, 360, 4, 'death', 5),
      A('heal', 'feeds on the dark', 'holy', 250, 500, 14, 'heal'),
    ],
    loot: [L('gold', 1, 300, 900), L('demonic_essence', 0.3), L('demon_horn', 0.06), L('small_diamond', 0.2), L('great_mana_potion', 0.2)],
  }),
};

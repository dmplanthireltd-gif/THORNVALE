import { randInt } from '../core/rng';
import type { Element } from '../inventory/items';

export type HitResult = 'hit' | 'miss' | 'blocked';

export interface Roll {
  amount: number;
  result: HitResult;
}

export const PLAYER_ATTACK_INTERVAL = 1.5;
export const FIST_ATTACK = 4;

/** Applies a percentage resistance (negative = weakness, 100 = immune). */
export function applyResist(amount: number, resistPct: number | undefined): number {
  const r = Math.max(-100, Math.min(100, resistPct ?? 0));
  return Math.max(0, Math.round(amount * (1 - r / 100)));
}

/**
 * Melee swing: weapon attack, power and vocation drive damage; target armour absorbs some.
 * `level` is the power level (half character level, half weapon skill, see player/skills.ts);
 * `hitBonus` (from the weapon skill) lowers the 8% miss chance.
 */
export function rollMelee(level: number, attack: number, mult: number, targetArmor: number, hitBonus = 0): Roll {
  if (Math.random() < Math.max(0.02, 0.08 - hitBonus)) return { amount: 0, result: 'miss' };
  const max = Math.round((attack * 1.6 + level * 2.0) * mult);
  const min = Math.round((attack * 0.5 + level * 0.8) * mult);
  const dmg = randInt(min, Math.max(min, max)) - randInt(0, targetArmor);
  if (dmg <= 0) return { amount: 0, result: 'blocked' };
  return { amount: dmg, result: 'hit' };
}

/** Distance shot: misses more often at long range, less often with a high distance skill. */
export function rollDistance(level: number, attack: number, mult: number, targetArmor: number, distance: number, hitBonus = 0): Roll {
  const missChance = Math.max(0.02, 0.06 + Math.max(0, distance - 3) * 0.05 - hitBonus);
  if (Math.random() < missChance) return { amount: 0, result: 'miss' };
  const max = Math.round((attack * 1.5 + level * 1.9) * mult);
  const min = Math.round((attack * 0.5 + level * 0.8) * mult);
  const dmg = randInt(min, Math.max(min, max)) - randInt(0, Math.floor(targetArmor * 0.8));
  if (dmg <= 0) return { amount: 0, result: 'blocked' };
  return { amount: dmg, result: 'hit' };
}

/** Monster melee against the player's armour and shield defense. */
export function rollMonsterMelee(minDmg: number, maxDmg: number, armor: number, defense: number): Roll {
  if (Math.random() < 0.1) return { amount: 0, result: 'miss' };
  const raw = randInt(minDmg, maxDmg);
  // the shield sometimes blocks a hit outright
  if (Math.random() < Math.min(0.35, defense / 120)) return { amount: 0, result: 'blocked' };
  const dmg = raw - randInt(Math.floor(armor / 2), armor) - randInt(0, Math.floor(defense / 3));
  if (dmg <= 0) return { amount: 0, result: 'blocked' };
  return { amount: dmg, result: 'hit' };
}

/** Scales a min/max/perLevel formula by level and a multiplier. */
export function rollFormula(min: number, max: number, perLevel: number, level: number, mult: number): number {
  const lo = (min + perLevel * level * 0.7) * mult;
  const hi = (max + perLevel * level) * mult;
  return Math.max(1, Math.round(lo + Math.random() * (hi - lo)));
}

export const ELEMENT_COLORS: Record<Element, string> = {
  physical: '#ff4a3d', fire: '#ff8a2a', energy: '#c27aff', ice: '#7fd8ff', earth: '#7fd04a', death: '#a07ab8', holy: '#ffe680',
};

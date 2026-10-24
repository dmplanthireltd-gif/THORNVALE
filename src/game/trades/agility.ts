import type { ObstacleKind } from './layout';

/**
 * Agility: shortcuts across the world (balance over a river on a log, climb a
 * cliff, swim a stretch of water, squeeze through a crack in the rock), each
 * usable from a level, and running stamina. Running makes every step quicker
 * and uses stamina; stamina comes back while you walk or stand, faster with a
 * higher agility level, and a higher level also makes it last longer.
 * Pure rules: no DOM, no three.js.
 */

export interface ObstacleKindDef {
  kind: ObstacleKind;
  /** Verb for messages ("You balance across the log."). */
  name: string;
  /** Seconds per tile while crossing. */
  tileTime: number;
  /** Level added to the area's level (harder kinds ask a little more). */
  levelOffset: number;
  /** Damage of a failed attempt: flat + share of max health. */
  hurt: [number, number];
  start: string;
  done: string;
  fail: string;
}

export const OBSTACLE_KINDS: Record<ObstacleKind, ObstacleKindDef> = {
  balance: { kind: 'balance', name: 'balance log', tileTime: 0.85, levelOffset: 0, hurt: [3, 0.04], start: 'You step onto the log, arms out.', done: 'You balance across the log.', fail: 'You lose your footing and fall into the water!' },
  climb: { kind: 'climb', name: 'climbing rocks', tileTime: 1.35, levelOffset: 5, hurt: [5, 0.06], start: 'You find a handhold and start to climb.', done: 'You climb over the rocks.', fail: 'A handhold breaks and you slide back down!' },
  swim: { kind: 'swim', name: 'swim', tileTime: 1.0, levelOffset: 10, hurt: [4, 0.05], start: 'You wade in and start to swim.', done: 'You swim across and climb out.', fail: 'The current drags you back to the bank!' },
  squeeze: { kind: 'squeeze', name: 'narrow crack', tileTime: 1.2, levelOffset: 8, hurt: [3, 0.03], start: 'You breathe out and squeeze into the crack.', done: 'You squeeze through the gap.', fail: 'You get stuck and have to wriggle back out!' },
};

/** Chance a crossing fails (checked once when you start): lower with every level above the obstacle's. */
export function crossFailChance(level: number, need: number): number {
  return Math.max(0.03, Math.min(0.3, 0.3 - (level - need) * 0.012));
}

/** Experience for one crossing of an obstacle of this level and length. */
export function obstacleXp(level: number, len: number): number {
  return Math.round(8 + level * 1.6 + len * 3);
}

// ---------------------------------------------------------------- stamina

export const STAMINA_MAX = 100;
/** A running step takes this share of a walking step. */
export const RUN_STEP_FACTOR = 0.75;

/** Stamina one running step uses (less with a higher agility level). */
export function runDrain(agility: number): number {
  return Math.max(0.45, 1.1 - agility * 0.006);
}

/** Stamina regained per second while not running (halved while walking). */
export function staminaRegen(agility: number): number {
  return 0.35 + agility * 0.0125;
}

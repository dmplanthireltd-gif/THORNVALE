import { chebyshev, sign, type TilePos } from '../core/types';
import type { Creature } from '../entities/Creature';
import type { Player } from '../player/Player';
import type { Enemy } from './Enemy';
import type { Ability } from './enemyDefs';

/** What the AI is allowed to see/do. Implemented by the Game. */
export interface AIContext {
  alivePlayers(): Player[];
  getPlayer(id: number | null): Player | null;
  tryStep(c: Creature, dx: number, dy: number): boolean;
  meleeAttack(attacker: Creature, target: Creature): void;
  useAbility(e: Enemy, a: Ability, target: Player): void;
  canSee(from: Creature, to: Creature): boolean;
  /** Players standing in a protection zone cannot be attacked. */
  isProtected(p: Player): boolean;
  pathTo(c: Creature, tx: number, ty: number, adjacent: boolean, maxNodes: number): TilePos[] | null;
}

function dist(a: Creature, b: Creature): number {
  return a.z === b.z ? chebyshev(a.x, a.y, b.x, b.y) : Infinity;
}

function nearestPlayer(e: Enemy, ctx: AIContext, range: number): Player | null {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const p of ctx.alivePlayers()) {
    // invisible players (utana vid) cannot be seen by monsters, nor anyone flagged ignoredByMonsters
    if (ctx.isProtected(p) || p.buffs.invisible > 0 || p.ignoredByMonsters) continue;
    const d = dist(e, p);
    if (d <= range && d < bestD && ctx.canSee(e, p)) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** One AI tick for a living enemy. Movement interpolation is handled by the Game. */
export function updateEnemyAI(e: Enemy, ctx: AIContext, dt: number): void {
  const def = e.def;
  for (let i = 0; i < e.abilityTimers.length; i++) e.abilityTimers[i] -= dt;

  // Monsters can be lured anywhere, like the classic game: no leash, no running home, no free healing.
  if (e.state === 'idle') {
    const p = nearestPlayer(e, ctx, def.aggroRange);
    if (p) {
      e.targetId = p.id;
      e.state = 'chase';
      e.path = [];
      return;
    }
    if (e.moving) return;
    e.wanderTimer -= dt;
    if (e.marchTo && e.wanderTimer <= 0) {
      // raid monsters march on their town; protection zones stop them at the edge (Game.tryStep)
      e.wanderTimer = 0.6 + Math.random() * 0.8;
      const dx = sign(e.marchTo.x - e.x), dy = sign(e.marchTo.y - e.y);
      if (chebyshev(e.x, e.y, e.marchTo.x, e.marchTo.y) <= 2 || !(ctx.tryStep(e, dx, dy) || (dx !== 0 && ctx.tryStep(e, dx, 0)) || (dy !== 0 && ctx.tryStep(e, 0, dy)))) {
        // arrived, or blocked: hang around here
        if (Math.random() < 0.15) e.marchTo = null;
      }
      e.homeX = e.x;
      e.homeY = e.y;
      return;
    }
    if (e.wanderTimer <= 0) {
      e.wanderTimer = 1.8 + Math.random() * 3.5;
      const dx = Math.floor(Math.random() * 3) - 1;
      const dy = Math.floor(Math.random() * 3) - 1;
      const nx = e.x + dx, ny = e.y + dy;
      if ((dx || dy) && chebyshev(nx, ny, e.homeX, e.homeY) <= def.wanderRadius) ctx.tryStep(e, dx, dy);
    }
    return;
  }

  if (e.state === 'return') {
    // (kept for old states only: nothing sends monsters home any more)
    e.state = 'idle';
    e.homeX = e.x;
    e.homeY = e.y;
    return;
  }
  if (e.state !== 'chase' && e.state !== 'attack') return;

  let p = ctx.getPlayer(e.targetId);
  if (!p || p.dead || dist(e, p) > def.aggroRange + 5 || ctx.isProtected(p) || p.buffs.invisible > 0 || p.ignoredByMonsters) {
    p = nearestPlayer(e, ctx, def.aggroRange);
    e.targetId = p ? p.id : null;
  }
  if (!p) {
    // lost everyone: stay and wander around here
    e.state = 'idle';
    e.targetId = null;
    e.path = [];
    e.homeX = e.x;
    e.homeY = e.y;
    return;
  }
  const d = dist(e, p);
  const sees = ctx.canSee(e, p);

  // special abilities, in priority order (an enraged boss uses them more often)
  const haste = e.rage > 1 ? 0.7 : 1;
  for (let i = 0; i < def.abilities.length; i++) {
    const a = def.abilities[i];
    if (e.abilityTimers[i] > 0) continue;
    if (a.kind === 'heal') {
      if (e.hp < e.maxHp * 0.6) {
        ctx.useAbility(e, a, p);
        e.abilityTimers[i] = a.interval * haste;
      }
      continue;
    }
    if (a.kind === 'summon') {
      if (d <= def.aggroRange) {
        ctx.useAbility(e, a, p);
        e.abilityTimers[i] = a.interval * haste;
      }
      continue;
    }
    const inRange = a.kind === 'nova' ? d <= Math.max(1, a.radius)
      : a.kind === 'wave' || a.kind === 'beam' ? sees && inLine(e, p, a.kind, a.range)
        : d <= a.range && sees;
    if (inRange) {
      ctx.useAbility(e, a, p);
      e.abilityTimers[i] = a.interval * (0.8 + Math.random() * 0.4) * haste;
      break;
    }
  }

  if (d <= 1) {
    e.state = 'attack';
    e.path = [];
    if (!e.moving) e.faceTowards(p.x, p.y);
    if (e.attackTimer <= 0) {
      ctx.meleeAttack(e, p);
      e.attackTimer = def.attackInterval * haste;
    }
    // ranged fighters back off to their preferred distance
    if (def.kite && !e.moving && Math.random() < 0.5) stepAway(e, p, ctx);
    return;
  }
  e.state = 'chase';
  if (e.moving) return;
  if (def.kite && sees && d <= def.kite + 1) {
    if (d < def.kite) stepAway(e, p, ctx);
    else e.faceTowards(p.x, p.y);
    return;
  }
  stepToward(e, p, ctx, dt);
}

/**
 * Would a wave (cone) or beam (line) aimed at the player's side reach them?
 * Monsters breathe along the main axis towards their target, like players cast
 * them along their facing (see Game.monsterLineTiles).
 */
export function inLine(e: Creature, p: Creature, kind: 'wave' | 'beam', range: number): boolean {
  const ax = Math.abs(p.x - e.x), ay = Math.abs(p.y - e.y);
  const along = Math.max(ax, ay), side = Math.min(ax, ay);
  if (along < 1 || along > range) return false;
  return kind === 'beam' ? side === 0 : side <= Math.floor(along / 2);
}

function stepAway(e: Enemy, p: Player, ctx: AIContext): void {
  const dx = sign(e.x - p.x);
  const dy = sign(e.y - p.y);
  const options: Array<[number, number]> = [[dx, dy], [dx, 0], [0, dy], [dx, -dy], [-dx, dy]];
  for (const [ox, oy] of options) {
    if ((ox || oy) && ctx.tryStep(e, ox, oy)) return;
  }
}

function stepToward(e: Enemy, p: Player, ctx: AIContext, dt: number): void {
  e.repathTimer -= dt;
  const stale = e.pathFor.x !== p.x || e.pathFor.y !== p.y || e.path.length === 0 || e.repathTimer <= 0;
  if (stale) {
    e.path = ctx.pathTo(e, p.x, p.y, true, 800) ?? [];
    e.pathFor = { x: p.x, y: p.y };
    e.repathTimer = 0.6;
  }
  const next = e.path[0];
  if (next) {
    if (ctx.tryStep(e, next.x - e.x, next.y - e.y)) {
      e.path.shift();
      return;
    }
    e.path = [];
  }
  const dx = sign(p.x - e.x);
  const dy = sign(p.y - e.y);
  if (ctx.tryStep(e, dx, dy)) return;
  if (dx !== 0 && ctx.tryStep(e, dx, 0)) return;
  if (dy !== 0) ctx.tryStep(e, 0, dy);
}

/** Called when the enemy is hit by a player: it turns on them. */
export function onEnemyDamaged(e: Enemy, byPlayerId: number): void {
  if (e.dead) return;
  if (e.state === 'idle' || e.state === 'return') {
    e.state = 'chase';
    e.targetId = byPlayerId;
    e.path = [];
  }
}

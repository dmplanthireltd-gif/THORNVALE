import { Creature } from '../entities/Creature';
import type { EnemyKind } from '../world/WorldMap';
import { ENEMIES, type EnemyDef } from './enemyDefs';

export type AIState = 'idle' | 'chase' | 'attack' | 'return' | 'dead';

export class Enemy extends Creature {
  readonly kind = 'enemy' as const;
  readonly def: EnemyDef;
  state: AIState = 'idle';
  wanderTimer: number;
  repathTimer = 0;
  /** Player tile the current chase path was computed for. */
  pathFor = { x: -1, y: -1 };
  respawnTimer = 0;
  /** Where it hangs around when idle: its spawn, or wherever it lost its target after being lured. */
  homeX: number;
  homeY: number;
  /** Seconds the corpse stays visible. */
  corpseTimer = 0;
  stuckTimer = 0;
  /** Player currently hunted. */
  targetId: number | null = null;
  /** Seconds until each ability may be used again. */
  abilityTimers: number[];
  /** Damage dealt by each player since the last respawn, for exp sharing. */
  damageBy = new Map<number, number>();
  /** Seconds of paralysis left (walks much slower). */
  slowTimer = 0;
  /** Seconds until a magic field may hurt it again. */
  hazardTimer = 0;
  /** Bosses below `def.enrage` health: hits harder and acts faster (1 = calm). */
  rage = 1;
  /**
   * Spawned while the game runs (raids, world bosses, summons, /boss) instead of
   * from the map: never respawns, is removed after its corpse fades, and the
   * client learns its kind from the snapshot.
   */
  dynamic = false;
  /** What spawned it: 'summon', 'raid', 'worldboss' or 'gm' (dynamic monsters only). */
  tag: string | null = null;
  /** Summons: the boss that called it (it dies with it). */
  masterId: number | null = null;
  /** Dynamic monsters: seconds before it leaves the world if still alive. */
  lifetime = Infinity;
  /** No loot and no experience (summoned helpers, so bosses cannot be farmed for adds). */
  noReward = false;
  /** Keeps thinking with no player nearby (raid monsters march on their town). */
  alwaysAwake = false;
  /** Removed from the world (dynamic monsters only). */
  gone = false;
  /** Raid monsters: the tile they march towards while idle. */
  marchTo: { x: number; y: number } | null = null;

  constructor(id: number, readonly enemyKind: EnemyKind, readonly spawnX: number, readonly spawnY: number, readonly spawnZ = 0) {
    const def = ENEMIES[enemyKind];
    super(id, def.name, spawnX, spawnY, def.maxHp, def.stepTime);
    this.homeX = spawnX;
    this.homeY = spawnY;
    this.z = spawnZ;
    this.def = def;
    this.wanderTimer = 1 + Math.random() * 3;
    this.facing = Math.random() * Math.PI * 2;
    this.abilityTimers = def.abilities.map((a) => a.interval * (0.4 + Math.random() * 0.6));
  }

  distFromSpawn(): number {
    return Math.max(Math.abs(this.x - this.spawnX), Math.abs(this.y - this.spawnY));
  }
}

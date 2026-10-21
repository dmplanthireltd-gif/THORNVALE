import { facingFromDelta, type TilePos } from '../core/types';

export type CreatureKind = 'player' | 'enemy' | 'npc';

/**
 * Logical creature state. Position is always an integer tile; while a step is
 * in progress `x,y` is the destination (the tile is reserved) and `fromX/fromY`
 * the origin, with `moveT` running 0 → 1. Renderers interpolate between them.
 */
export abstract class Creature {
  abstract readonly kind: CreatureKind;
  x: number;
  y: number;
  /** Floor: 0 = surface, negative = underground, positive = upper floors. */
  z = 0;
  fromX: number;
  fromY: number;
  moveT = 1;
  moveDur = 0.3;
  /** Radians, 0 = facing south. */
  facing = 0;
  hp: number;
  maxHp: number;
  dead = false;
  attackTimer = 0;
  /** Seconds per orthogonal step. */
  stepTime: number;
  path: TilePos[] = [];

  constructor(readonly id: number, public name: string, x: number, y: number, maxHp: number, stepTime: number) {
    this.x = this.fromX = x;
    this.y = this.fromY = y;
    this.hp = this.maxHp = maxHp;
    this.stepTime = stepTime;
  }

  get moving(): boolean {
    return this.moveT < 1;
  }

  /** Interpolated position, for rendering. */
  visualPos(): TilePos {
    const t = this.moveT >= 1 ? 1 : this.moveT;
    return {
      x: this.fromX + (this.x - this.fromX) * t,
      y: this.fromY + (this.y - this.fromY) * t,
    };
  }

  beginStep(dx: number, dy: number): void {
    this.fromX = this.x;
    this.fromY = this.y;
    this.x += dx;
    this.y += dy;
    this.moveT = 0;
    this.moveDur = this.stepTime * (dx !== 0 && dy !== 0 ? 1.4 : 1);
    this.facing = facingFromDelta(dx, dy);
  }

  /** Teleport without animation. */
  placeAt(x: number, y: number, z = this.z): void {
    this.x = this.fromX = x;
    this.y = this.fromY = y;
    this.z = z;
    this.moveT = 1;
    this.path = [];
  }

  faceTowards(tx: number, ty: number): void {
    if (tx === this.x && ty === this.y) return;
    this.facing = facingFromDelta(tx - this.x, ty - this.y);
  }
}

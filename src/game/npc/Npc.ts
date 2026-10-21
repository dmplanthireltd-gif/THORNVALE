import { Creature } from '../entities/Creature';

export class Npc extends Creature {
  readonly kind = 'npc' as const;
  idleTurnTimer = 3;
  constructor(id: number, readonly key: string, name: string, x: number, y: number) {
    super(id, name, x, y, 999, 0.5);
    this.facing = 0;
  }
}

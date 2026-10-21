import { Creature } from '../entities/Creature';
import { DEFAULT_OUTFIT, type Outfit } from './outfits';
import { VOCATIONS, type Vocation } from './vocations';

/** Total experience required to reach `level` (classic cubic curve). */
export function expForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round((50 / 3) * (level ** 3 - 6 * level ** 2 + 17 * level - 12));
}

export interface Buffs {
  /** Seconds remaining. */
  haste: number;
  magicShield: number;
  light: number;
}

export type Pending =
  | { type: 'talk'; npcId: number }
  | { type: 'bag'; bagId: number }
  | { type: 'use'; x: number; y: number; z: number };

export class Player extends Creature {
  readonly kind = 'player' as const;
  vocation: Vocation;
  level = 1;
  exp = 0;
  mana: number;
  maxMana: number;
  capacity = 400;
  /** Targeted creature id. */
  targetId: number | null = null;
  pending: Pending | null = null;
  spellCooldowns: Record<string, number> = {};
  /** Shared cooldown groups: attack spells, healing spells. */
  groupCooldowns = { attack: 0, heal: 0, support: 0, potion: 0 };
  buffs: Buffs = { haste: 0, magicShield: 0, light: 0 };
  chaseSuppressed = 0;
  respawnTimer = 0;
  regenAcc = 0;
  sinceCombat = 99;
  /** Seconds until another hazard tick may hurt us. */
  hazardTimer = 0;
  outfit: Outfit = { ...DEFAULT_OUTFIT };
  /** Test mode: takes no damage. Not saved. */
  god = false;
  /** Show worn equipment on the model; off = classic outfit-only look. */
  showGear = true;
  /** Town whose temple is home. */
  home = 'thornvale';
  // derived from vocation, level and gear (refreshed by the game)
  baseStep = 0.27;
  hpRegen = 0;
  manaRegen = 0;

  constructor(id: number, x: number, y: number, vocation: Vocation = 'knight') {
    super(id, 'Adventurer', x, y, VOCATIONS[vocation].baseHp, 0.27);
    this.vocation = vocation;
    this.maxMana = VOCATIONS[vocation].baseMana;
    this.mana = this.maxMana;
  }

  /** Adds exp; returns number of levels gained. */
  gainExp(amount: number): number {
    this.exp += amount;
    let gained = 0;
    while (this.exp >= expForLevel(this.level + 1)) {
      this.level++;
      gained++;
    }
    return gained;
  }

  levelProgress(): number {
    const a = expForLevel(this.level);
    const b = expForLevel(this.level + 1);
    return (this.exp - a) / (b - a);
  }
}

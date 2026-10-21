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
  /** Potion buffs: extra melee attack, distance attack, magic damage. */
  berserk: number;
  bullseye: number;
  mastermind: number;
  /** Spell buffs: walk 70% faster, brighter light, unseen by monsters, monster disguise. */
  strongHaste: number;
  greatLight: number;
  ultimateLight: number;
  invisible: number;
  illusion: number;
  /** Condition, not a buff: loses health every few seconds until it ends or is cured. */
  poisoned: number;
}

export type BuffName = keyof Buffs;
export const BUFF_NAMES: BuffName[] = [
  'haste', 'magicShield', 'light', 'berserk', 'bullseye', 'mastermind', 'strongHaste', 'greatLight', 'ultimateLight', 'invisible', 'illusion', 'poisoned',
];

export function emptyBuffs(): Buffs {
  return {
    haste: 0, magicShield: 0, light: 0, berserk: 0, bullseye: 0, mastermind: 0,
    strongHaste: 0, greatLight: 0, ultimateLight: 0, invisible: 0, illusion: 0, poisoned: 0,
  };
}

/** Light radius in tiles given by light spells (the strongest one counts). */
export function spellLight(b: Buffs): number {
  return b.ultimateLight > 0 ? 9 : b.greatLight > 0 ? 6 : b.light > 0 ? 4 : 0;
}

export type Pending =
  | { type: 'talk'; npcId: number }
  | { type: 'bag'; bagId: number }
  | { type: 'use'; x: number; y: number; z: number }
  | { type: 'follow'; id: number };

export type FightMode = 'offensive' | 'balanced' | 'defensive';
/** Damage dealt and taken (weapon attacks only) for each stance. */
export const FIGHT_MODE: Record<FightMode, { dealt: number; taken: number }> = {
  offensive: { dealt: 1.2, taken: 1.15 },
  balanced: { dealt: 1, taken: 1 },
  defensive: { dealt: 0.7, taken: 0.75 },
};

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
  buffs: Buffs = emptyBuffs();
  chaseSuppressed = 0;
  respawnTimer = 0;
  regenAcc = 0;
  sinceCombat = 99;
  /** Seconds until another hazard tick may hurt us. */
  hazardTimer = 0;
  outfit: Outfit = { ...DEFAULT_OUTFIT };
  /** Test mode: takes no damage. Not saved. */
  god = false;
  /** Classic fight stance: how much you put into hitting versus covering yourself (melee and distance). */
  fightMode: FightMode = 'balanced';
  /** Chase: walk after your target. Stand: keep your position and only hit what comes into reach. */
  chase = true;
  /** Show worn equipment on the model; off = classic outfit-only look. */
  showGear = true;
  /** Hitpoints lost per poison tick, and seconds to the next tick (see Buffs.poisoned). */
  poisonDamage = 0;
  poisonTick = 0;
  /** Monster kind this player looks like (Creature Illusion), or null. Not saved. */
  illusion: string | null = null;
  /** Town whose temple is home. */
  home = 'thornvale';
  /** Founder cloak worn over armour ('' = none). Looks only; set by Game.refreshPerks. */
  cloak: '' | 'ember' | 'gold' | 'crimson' = '';
  /** Founder title under the name ('' = none), e.g. "Legend #027". */
  title = '';
  /** Premium account (crown in the Inspect window). */
  premium = false;
  // ---- PvP (see Game: pvp rules). Times are wall-clock ms so they survive restarts.
  /** Secure mode: refuses attacks on unmarked players and spares them from your area attacks. */
  secure = true;
  whiteSkullUntil = 0;
  redSkullUntil = 0;
  /** Wall-clock ms of recent unjustified kills (last 24 h). */
  unjustKills: number[] = [];
  /** Seconds left of the protection-zone lock after attacking a player. Not saved. */
  pzLock = 0;
  /** Players who attacked us recently: attacker id → wall-clock ms the right to fight back ends. */
  attackedBy = new Map<number, number>();
  /** Mirror mode: skull as sent by the server (0 none, 1 white, 2 red). */
  netSkull: 0 | 1 | 2 = 0;
  /** Throttles the "You are PZ-locked." message. */
  pzMsgTimer = 0;
  /** Woodcutting in progress: the tree being chopped and seconds to the next chop. Not saved. */
  chop: { x: number; y: number; z: number; timer: number } | null = null;
  /** Fishing in progress: the water tile and seconds to the next cast. Not saved. */
  fish: { x: number; y: number; z: number; timer: number } | null = null;
  /** Mining in progress: the ore rock and seconds to the next swing. Not saved. */
  mine: { x: number; y: number; z: number; timer: number } | null = null;
  /** Production in progress at a station (furnace, anvil): recipe, how many are left, seconds to the next. Not saved. */
  craft: { recipe: string; left: number; timer: number; x: number; y: number; z: number; stepping?: boolean } | null = null;
  // derived from vocation, level and gear (refreshed by the game)
  baseStep = 0.545;
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

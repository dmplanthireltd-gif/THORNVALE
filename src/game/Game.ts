import { EventBus, type Effect, type MessageKind } from './core/events';
import { randInt } from './core/rng';
import { chebyshev, DIRS8, facingFromDelta, type TilePos } from './core/types';
import {
  applyResist, FIST_ATTACK, PLAYER_ATTACK_INTERVAL, rollDistance, rollFormula, rollMelee, rollMonsterMelee, type Roll,
} from './combat/combat';
import { Enemy } from './enemies/Enemy';
import { onEnemyDamaged, updateEnemyAI, type AIContext } from './enemies/EnemyAI';
import type { Ability } from './enemies/enemyDefs';
import type { Creature } from './entities/Creature';
import { addToList, DEPOT_SLOTS, Inventory } from './inventory/Inventory';
import { describeItem, EQUIP_SLOTS, equipSlotFor, itemDef, POTION_BUFF_POWER, POTION_BUFF_SECONDS, type Element, type EquipSlot, type ItemDef, type ItemStack } from './inventory/items';
import { GROUP_COOLDOWN, isSpellId, parseSpellWords, SPELLS, startingSpells, type SpellDef, type SpellId } from './magic/spells';
import { findPath } from './movement/pathfinding';
import { buildDialogue, type DialogueState, type DialogueView } from './npc/dialogue';
import { Npc } from './npc/Npc';
import { buyPrice, NPCS } from './npc/npcs';
import { runAdminCommand } from './admin';
import { migrateSave, SAVE_VERSION } from './save/migrate';
import { DEFAULT_OUTFIT, isOutfit, type Outfit } from './player/outfits';
import { BUFF_NAMES, emptyBuffs, expForLevel, FIGHT_MODE, Player, type FightMode } from './player/Player';
import { isVocation, VOCATIONS, type Vocation } from './player/vocations';
import { QUESTS, QuestLog } from './quests/quests';
import { buildWorld } from './world/worldGen';
import { Ground, Obj, WorldMap } from './world/WorldMap';

/** Source of directional input. Keeps the simulation free of DOM concerns. */
export interface MoveIntent {
  held(): { dx: number; dy: number };
  takeQueued(): { dx: number; dy: number } | null;
}

/** Intent fed from data (network or tests). */
export class BufferedIntent implements MoveIntent {
  dir = { dx: 0, dy: 0 };
  queued: { dx: number; dy: number } | null = null;
  held() { return this.dir; }
  takeQueued() { const q = this.queued; this.queued = null; return q; }
}

export interface GroundBag {
  id: number;
  x: number;
  y: number;
  z: number;
  items: ItemStack[];
  ttl: number;
}

export interface TradeOffer {
  slots: number[];
  gold: number;
  accepted: boolean;
}

export interface Trade {
  a: number;
  b: number;
  offers: Record<number, TradeOffer>;
}

/** What one side of a trade sees. */
export interface TradeView {
  partnerName: string;
  mine: { items: ItemStack[]; slots: number[]; gold: number; accepted: boolean };
  theirs: { items: ItemStack[]; gold: number; accepted: boolean };
}

/** Everything that belongs to one connected player. */
export interface Session {
  id: number;
  player: Player;
  inventory: Inventory;
  quests: QuestLog;
  dialogue: DialogueState | null;
  intent: MoveIntent;
  depot: (ItemStack | null)[];
  depotOpen: { x: number; y: number; z: number } | null;
  bank: number;
  spells: Set<SpellId>;
  chests: Set<string>;
  wantsSave: boolean;
  /** May use /test commands (always offline; per character on a server). */
  admin: boolean;
  /** Items from older versions that no longer exist (kept with the save). */
  lostItems: ItemStack[];
}

export interface CharacterData {
  name?: string;
  vocation?: Vocation;
  x: number;
  y: number;
  z?: number;
  level: number;
  exp: number;
  hp: number;
  mana: number;
  facing: number;
  outfit?: Outfit;
  home?: string;
  /** false = classic look: worn equipment does not change the outfit. */
  showGear?: boolean;
}

export interface SaveData {
  /** Save format version (see save/migrate.ts). */
  version: number;
  savedAt: number;
  player: CharacterData;
  inventory: ReturnType<Inventory['toJSON']>;
  quests: QuestLog['state'];
  depot?: (ItemStack | null)[];
  bank?: number;
  spells?: string[];
  chests?: string[];
  /** Items that no longer exist in the game, kept so a later update can give them back. */
  lostItems?: ItemStack[];
  /** PvP marks (save v4+). Times are wall-clock ms. */
  pvp?: { secure?: boolean; whiteSkullUntil?: number; redSkullUntil?: number; unjustKills?: number[] };
}

export interface GameOptions {
  /** false = mirror mode: state arrives from a server, only animation timing runs locally. */
  simulate?: boolean;
  /** Players may attack each other (server env PVP, default on online; always off offline). */
  pvp?: boolean;
  /** Wall clock in ms (skulls, unjustified kills). Tests replace it. */
  now?: () => number;
}

export const BAG_LIFETIME = 180;
/** PvP: players below this level can neither attack nor be attacked by players. */
export const PVP_MIN_LEVEL = 8;
/** White skull after attacking an unmarked player, refreshed on every attack. */
export const WHITE_SKULL_MS = 15 * 60 * 1000;
/** Red skull after too many unjustified kills. */
export const RED_SKULL_MS = 24 * 60 * 60 * 1000;
/** Unjustified kills count for this long… */
export const UNJUST_WINDOW_MS = 24 * 60 * 60 * 1000;
/** …and this many of them within the window give a red skull. */
export const UNJUST_KILLS_FOR_RED = 3;
/** Seconds you cannot enter a protection zone after attacking a player. */
export const PZ_LOCK_SECONDS = 60;
/** How long the victim of an attack may hit back without getting a skull. */
const SELF_DEFENCE_MS = WHITE_SKULL_MS;
const HOLE_OPEN_SECONDS = 90;
const TRADE_RANGE = 3;

/**
 * The authoritative simulation. Render-agnostic: it advances in seconds, talks
 * to the outside world through `events`, and accepts commands per player.
 * The same class runs single-player in the browser and multiplayer on the server.
 */
export class Game implements AIContext {
  readonly events = new EventBus();
  readonly world: WorldMap;
  readonly sessions = new Map<number, Session>();
  readonly enemies: Enemy[] = [];
  readonly npcs: Npc[] = [];
  readonly bags: GroundBag[] = [];
  readonly trades: Trade[] = [];
  readonly simulate: boolean;
  /** Player-versus-player combat allowed (mirror games learn it from the server). */
  pvp: boolean;
  /** Wall clock in ms. */
  now: () => number;
  /** Dug holes that close again: key → seconds left. */
  private openHoles = new Map<string, number>();
  time = 0;
  localId: number | null = null;
  private nextId = 1;

  constructor(opts: GameOptions = {}) {
    this.simulate = opts.simulate ?? true;
    this.pvp = opts.pvp ?? false;
    this.now = opts.now ?? (() => Date.now());
    this.world = buildWorld();
    // NPCs and monsters always take the first ids, so a server and its clients agree on them
    for (const n of this.world.npcs) {
      const def = NPCS[n.key];
      const npc = new Npc(this.nextId++, n.key, def?.name ?? n.key, n.x, n.y);
      npc.z = n.z;
      this.npcs.push(npc);
    }
    for (const sp of this.world.spawns) this.enemies.push(new Enemy(this.nextId++, sp.kind, sp.x, sp.y, sp.z));
  }

  // ================================================================ sessions

  addPlayer(name: string, opts: { id?: number; intent?: MoveIntent; starter?: boolean; vocation?: Vocation } = {}): Session {
    const id = opts.id ?? this.nextId++;
    if (id >= this.nextId) this.nextId = id + 1;
    const voc = opts.vocation ?? 'knight';
    const s0 = this.world.playerSpawn;
    const t = this.freeTileNear(s0.x, s0.y, s0.z);
    const player = new Player(id, t.x, t.y, voc);
    player.z = s0.z;
    player.name = name;
    const session: Session = {
      id, player, inventory: new Inventory(), quests: new QuestLog(), dialogue: null,
      intent: opts.intent ?? new BufferedIntent(), depot: new Array(DEPOT_SLOTS).fill(null), depotOpen: null,
      bank: 0, spells: new Set(startingSpells()), chests: new Set(), wantsSave: false, admin: false, lostItems: [],
    };
    if (opts.starter !== false) giveStarterKit(session.inventory, voc);
    this.sessions.set(id, session);
    this.refreshStats(session);
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    this.events.emit({ type: 'playerJoined', id });
    return session;
  }

  removePlayer(id: number): void {
    this.cancelTrade(id, 'left the game');
    if (!this.sessions.delete(id)) return;
    for (const e of this.enemies) if (e.targetId === id) e.targetId = null;
    for (const o of this.sessions.values()) if (o.player.targetId === id) o.player.targetId = null;
    this.events.emit({ type: 'playerLeft', id });
  }

  get local(): Session {
    const s = this.localId !== null ? this.sessions.get(this.localId) : undefined;
    if (!s) throw new Error('No local player');
    return s;
  }

  session(id: number | null): Session | null {
    return id === null ? null : this.sessions.get(id) ?? null;
  }

  players(): Player[] {
    return [...this.sessions.values()].map((s) => s.player);
  }

  alivePlayers(): Player[] {
    return this.players().filter((p) => !p.dead);
  }

  getPlayer(id: number | null): Player | null {
    return this.session(id)?.player ?? null;
  }

  findPlayerByName(name: string): Player | null {
    const n = name.trim().toLowerCase();
    return this.players().find((p) => p.name.toLowerCase() === n) ?? null;
  }

  // ================================================================ derived stats

  /** Recomputes everything that depends on vocation, level and equipment. */
  refreshStats(s: Session): void {
    const p = s.player;
    const voc = VOCATIONS[p.vocation];
    let hp = 0, mana = 0, speed = 0, hpRegen = 0, manaRegen = 0;
    for (const def of this.equippedDefs(s)) {
      const b = def.bonus;
      if (!b) continue;
      hp += b.hp ?? 0;
      mana += b.mana ?? 0;
      speed += b.speed ?? 0;
      hpRegen += b.hpRegen ?? 0;
      manaRegen += b.manaRegen ?? 0;
    }
    if (p.buffs.haste > 0) speed += 30;
    p.maxHp = voc.baseHp + (p.level - 1) * voc.hpPerLevel + hp;
    p.maxMana = voc.baseMana + (p.level - 1) * voc.manaPerLevel + mana;
    p.capacity = voc.baseCap + (p.level - 1) * voc.capPerLevel;
    p.baseStep = Math.max(0.16, 0.27 - (p.level - 1) * 0.0015);
    p.stepTime = p.baseStep * 100 / (100 + speed);
    p.hpRegen = hpRegen;
    p.manaRegen = manaRegen;
    p.hp = Math.min(p.hp, p.maxHp);
    p.mana = Math.min(p.mana, p.maxMana);
  }

  equippedDefs(s: Session): ItemDef[] {
    const out: ItemDef[] = [];
    for (const k of EQUIP_SLOTS) {
      const e = s.inventory.equipment[k];
      // ammunition only counts while a matching launcher is held
      if (e && k !== 'ammo') out.push(itemDef(e.id));
    }
    return out;
  }

  armor(s: Session): number {
    return this.equippedDefs(s).reduce((n, d) => n + (d.armor ?? 0), 0);
  }

  defense(s: Session): number {
    const sh = s.inventory.equipped('shield');
    const w = s.inventory.equipped('weapon');
    return (sh ? itemDef(sh).defense ?? 0 : 0) + Math.floor((w ? itemDef(w).defense ?? 0 : 0) / 2);
  }

  resist(s: Session, el: Element): number {
    let r = 0;
    for (const d of this.equippedDefs(s)) r += d.bonus?.resist?.[el] ?? 0;
    return Math.min(80, r);
  }

  magicBonus(s: Session): number {
    const potion = s.player.buffs.mastermind > 0 ? POTION_BUFF_POWER.mastermind : 0;
    return this.equippedDefs(s).reduce((n, d) => n + (d.bonus?.magic ?? 0), 0) + potion;
  }

  /** Extra attack from a fighting-style potion (Potion of Fury / of the Hawk). */
  potionAttack(s: Session, style: 'melee' | 'distance'): number {
    const b = s.player.buffs;
    if (style === 'melee') return b.berserk > 0 ? POTION_BUFF_POWER.berserk : 0;
    return b.bullseye > 0 ? POTION_BUFF_POWER.bullseye : 0;
  }

  attackBonus(s: Session): number {
    return this.equippedDefs(s).reduce((n, d) => n + (d.bonus?.attack ?? 0), 0);
  }

  /** Attack value for display: weapon attack (+ ammo for launchers). */
  attackValue(s: Session): number {
    const w = s.inventory.equipped('weapon');
    if (!w) return FIST_ATTACK;
    const d = itemDef(w);
    if (d.magicDamage) return Math.round((d.magicDamage[0] + d.magicDamage[1]) / 2);
    if (d.ammoType) {
      const a = s.inventory.equipped('ammo');
      const ad = a ? itemDef(a) : null;
      return (d.attack ?? 0) + (ad && ad.ammoType === d.ammoType ? ad.attack ?? 0 : 0) + this.attackBonus(s) + this.potionAttack(s, 'distance');
    }
    return (d.attack ?? 0) + this.attackBonus(s) + this.potionAttack(s, d.weaponType === 'throwing' ? 'distance' : 'melee');
  }

  /** Attack range in tiles (1 = melee). */
  weaponRange(s: Session): number {
    const w = s.inventory.equipped('weapon');
    return w ? itemDef(w).range ?? 1 : 1;
  }

  // ================================================================ queries

  creatures(): Creature[] {
    return [...this.players(), ...this.npcs, ...this.enemies];
  }

  getCreature(id: number): Creature | null {
    return this.getPlayer(id) ?? this.enemies.find((e) => e.id === id) ?? this.npcs.find((n) => n.id === id) ?? null;
  }

  getEnemy(id: number | null): Enemy | null {
    if (id === null) return null;
    return this.enemies.find((e) => e.id === id) ?? null;
  }

  /** What a player is fighting: a monster, or (PvP) another player. */
  getTarget(id: number | null): Enemy | Player | null {
    if (id === null) return null;
    return this.getEnemy(id) ?? this.getPlayer(id);
  }

  /**
   * NPCs and monsters block everyone. Players block monsters, and block each
   * other too, except inside protection zones (temples, depots, town doors), so
   * nobody can wall off a temple or a depot.
   */
  isOccupied(x: number, y: number, z: number, ignoreId = -1, moverIsPlayer = false): boolean {
    for (const n of this.npcs) if (n.id !== ignoreId && n.z === z && n.x === x && n.y === y) return true;
    for (const e of this.enemies) if (e.id !== ignoreId && !e.dead && e.z === z && e.x === x && e.y === y) return true;
    if (!moverIsPlayer || !this.world.isSafe(x, y, z)) {
      for (const s of this.sessions.values()) {
        const p = s.player;
        if (p.id !== ignoreId && !p.dead && p.z === z && p.x === x && p.y === y) return true;
      }
    }
    return false;
  }

  canSee(a: Creature, b: Creature): boolean {
    return a.z === b.z && this.world.lineOfSight(a.x, a.y, b.x, b.y, a.z);
  }

  isProtected(p: Player): boolean {
    return this.world.isSafe(p.x, p.y, p.z);
  }

  dist(a: Creature, b: Creature): number {
    return a.z === b.z ? chebyshev(a.x, a.y, b.x, b.y) : Infinity;
  }

  dialogueView(s: Session): DialogueView | null {
    if (!s.dialogue) return null;
    return buildDialogue(s.dialogue, {
      quests: s.quests, inventory: s.inventory, bank: s.bank, level: s.player.level, vocation: s.player.vocation, knownSpells: s.spells,
    });
  }

  // ================================================================ movement

  tryStep(c: Creature, dx: number, dy: number): boolean {
    if (c.moving) return false;
    if (!this.world.canStep(c.x, c.y, c.z, dx, dy)) return false;
    if (this.isOccupied(c.x + dx, c.y + dy, c.z, c.id, c.kind === 'player')) return false;
    if (c.kind === 'enemy') {
      // monsters never enter protection zones, stairs or holes
      if (this.world.isSafe(c.x + dx, c.y + dy, c.z)) return false;
      if (this.world.linkAt(c.x + dx, c.y + dy, c.z)) return false;
    }
    if (c instanceof Player && this.pzLockedOut(c, c.x + dx, c.y + dy)) {
      if (c.pzMsgTimer <= 0) {
        c.pzMsgTimer = 2;
        this.msg(c.id, 'You are PZ-locked.', 'warn');
      }
      return false;
    }
    c.beginStep(dx, dy);
    return true;
  }

  /** A PZ-locked player may not step from outside into a protection zone. */
  private pzLockedOut(p: Player, x: number, y: number): boolean {
    return p.pzLock > 0 && !this.world.isSafe(p.x, p.y, p.z) && this.world.isSafe(x, y, p.z);
  }

  pathTo(c: Creature, tx: number, ty: number, adjacent: boolean, maxNodes: number): TilePos[] | null {
    const isPlayer = c.kind === 'player';
    const z = c.z;
    const pzBlocked = c instanceof Player && c.pzLock > 0 && !this.world.isSafe(c.x, c.y, z);
    return findPath(this.world.grid(z), {
      sx: c.x, sy: c.y, tx, ty, maxNodes,
      isGoal: adjacent ? (x, y) => chebyshev(x, y, tx, ty) === 1 && !this.isOccupied(x, y, z, c.id, isPlayer) : undefined,
      isBlocked: (x, y) => {
        if (this.isOccupied(x, y, z, c.id, isPlayer) && !(x === tx && y === ty && !adjacent)) return true;
        if (!isPlayer && (this.world.isSafe(x, y, z) || this.world.linkAt(x, y, z))) return true;
        if (pzBlocked && this.world.isSafe(x, y, z)) return true;
        // players path around floor changes unless that is the destination
        if (isPlayer && !(x === tx && y === ty)) {
          const o = this.world.getObj(x, y, z);
          if (o === Obj.StairsUp || o === Obj.StairsDown || o === Obj.Hole) return true;
        }
        return false;
      },
    });
  }

  advanceStep(c: Creature, dt: number): number {
    if (!c.moving) return dt;
    const remain = (1 - c.moveT) * c.moveDur;
    if (dt < remain) {
      c.moveT += dt / c.moveDur;
      return 0;
    }
    c.moveT = 1;
    c.fromX = c.x;
    c.fromY = c.y;
    return dt - remain;
  }

  /** Instantly moves a player to another tile (stairs, ladders, ships). */
  teleport(p: Player, x: number, y: number, z: number): void {
    const t = this.freeTileNear(x, y, z);
    p.placeAt(t.x, t.y, t.z);
    p.targetId = null;
    const s = this.sessions.get(p.id);
    if (s) {
      if (s.depotOpen) this.closeDepot(s.id);
      this.closeDialogue(s.id);
    }
    this.cancelTrade(p.id, 'moved away');
    this.events.emit({ type: 'teleport', id: p.id });
  }

  // ================================================================ update

  update(dt: number): void {
    this.time += dt;
    if (!this.simulate) {
      for (const c of this.creatures()) this.advanceStep(c, dt);
      for (const e of this.enemies) if (e.dead) e.corpseTimer -= dt;
      return;
    }
    for (const s of this.sessions.values()) this.updatePlayer(s, dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    for (const n of this.npcs) this.updateNpc(n, dt);
    this.updateBags(dt);
    this.updateHoles(dt);
    for (const s of this.sessions.values()) {
      if (s.dialogue) {
        const n = this.npcs.find((x) => x.id === s.dialogue!.npcId);
        if (!n || s.player.dead || this.dist(n, s.player) > 3) this.closeDialogue(s.id);
      }
      if (s.depotOpen && (s.player.dead || s.player.z !== s.depotOpen.z || chebyshev(s.player.x, s.player.y, s.depotOpen.x, s.depotOpen.y) > 1)) this.closeDepot(s.id);
    }
    for (const t of [...this.trades]) {
      const a = this.getPlayer(t.a), b = this.getPlayer(t.b);
      if (!a || !b || a.dead || b.dead || this.dist(a, b) > TRADE_RANGE) this.cancelTrade(t.a, 'moved too far away');
    }
  }

  private updatePlayer(s: Session, dt: number): void {
    const p = s.player;
    if (p.dead) {
      s.intent.takeQueued();
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) this.respawnPlayer(s);
      return;
    }
    p.attackTimer -= dt;
    p.chaseSuppressed -= dt;
    p.sinceCombat += dt;
    p.hazardTimer -= dt;
    p.pzMsgTimer -= dt;
    if (p.pzLock > 0) {
      p.pzLock = Math.max(0, p.pzLock - dt);
      if (p.pzLock === 0) this.msg(s.id, 'You are no longer PZ-locked.', 'info');
    }
    if (p.attackedBy.size) {
      const now = this.now();
      for (const [id, until] of p.attackedBy) if (until <= now) p.attackedBy.delete(id);
    }
    for (const k of Object.keys(p.spellCooldowns)) p.spellCooldowns[k] -= dt;
    for (const g of ['attack', 'heal', 'support', 'potion'] as const) p.groupCooldowns[g] = Math.max(0, p.groupCooldowns[g] - dt);
    for (const bName of BUFF_NAMES) {
      if (p.buffs[bName] > 0) {
        p.buffs[bName] -= dt;
        if (p.buffs[bName] <= 0) {
          p.buffs[bName] = 0;
          this.events.emit({ type: 'buff', id: p.id, buff: bName, on: false });
          if (bName === 'haste') this.refreshStats(s);
          this.msg(s.id, BUFF_FADE[bName], 'info');
        }
      }
    }

    p.regenAcc += dt;
    if (p.regenAcc >= 1) {
      p.regenAcc -= 1;
      const ooc = p.sinceCombat > 6;
      p.hp = Math.min(p.maxHp, p.hp + (ooc ? 3 + Math.floor(p.level / 4) : 1) + p.hpRegen);
      p.mana = Math.min(p.maxMana, p.mana + (ooc ? 4 + Math.floor(p.level / 3) : 2) + p.manaRegen);
    }

    let budget = dt;
    for (let guard = 0; guard < 4; guard++) {
      if (p.moving) {
        budget = this.advanceStep(p, budget);
        if (p.moving) break;
        if (this.onPlayerStepComplete(s)) break;
      }
      if (!this.decidePlayerStep(s)) break;
      if (budget <= 0) break;
    }

    this.updateHazards(s);
    this.updatePending(s);
    this.updatePlayerCombat(s);
  }

  private decidePlayerStep(s: Session): boolean {
    const p = s.player;
    const queued = s.intent.takeQueued();
    const held = s.intent.held();
    const dir = held.dx || held.dy ? held : queued;

    if (dir && (dir.dx || dir.dy)) {
      p.path = [];
      p.pending = null;
      p.chaseSuppressed = 0.8;
      if (this.tryStep(p, dir.dx, dir.dy)) return true;
      if (dir.dx && dir.dy) {
        if (this.tryStep(p, dir.dx, 0)) return true;
        if (this.tryStep(p, 0, dir.dy)) return true;
      }
      p.facing = facingFromDelta(dir.dx, dir.dy);
      return false;
    }

    if (p.path.length > 0) {
      const next = p.path[0];
      if (this.tryStep(p, next.x - p.x, next.y - p.y)) {
        p.path.shift();
        return true;
      }
      const dest = p.path[p.path.length - 1];
      // the last tile is taken (someone stands there): stop next to it instead of retrying forever
      if (p.path.length === 1 && this.isOccupied(dest.x, dest.y, p.z, p.id, true)) {
        p.path = [];
        return false;
      }
      const re = this.pathTo(p, dest.x, dest.y, false, 4000);
      p.path = re ?? [];
      if (re && re.length && this.tryStep(p, re[0].x - p.x, re[0].y - p.y)) {
        p.path.shift();
        return true;
      }
      return false;
    }

    // chase the target until it is in weapon range and in sight
    const t = this.getTarget(p.targetId);
    if (t && !t.dead && p.chase && p.chaseSuppressed <= 0 && t.z === p.z) {
      const range = this.weaponRange(s);
      const d = chebyshev(p.x, p.y, t.x, t.y);
      const inRange = d <= range && (range === 1 || this.canSee(p, t));
      if (!inRange) {
        const path = this.pathTo(p, t.x, t.y, true, 1500);
        if (path && path.length && this.tryStep(p, path[0].x - p.x, path[0].y - p.y)) return true;
      }
    }
    return false;
  }

  /** Returns true if the player changed floors. */
  private onPlayerStepComplete(s: Session): boolean {
    const p = s.player;
    const o = this.world.getObj(p.x, p.y, p.z);
    if (o === Obj.StairsUp || o === Obj.StairsDown || o === Obj.Hole) {
      const link = this.world.linkAt(p.x, p.y, p.z);
      if (link && link.kind === 'walk') {
        const goingDown = link.to.z < p.z;
        this.teleport(p, link.to.x, link.to.y, link.to.z);
        if (o === Obj.Hole && goingDown) this.msg(s.id, 'You fall down a hole.', 'info');
        p.path = [];
        return true;
      }
    }
    for (const b of [...this.bags]) {
      if (b.x === p.x && b.y === p.y && b.z === p.z) this.pickupBag(s, b);
    }
    // entering a town makes its temple your home
    const r = this.world.regionAt(p.x, p.y, p.z);
    if (r?.temple && r.safe && p.home !== r.name) {
      const town = r.name === 'Temple Plaza' ? 'Thornvale' : r.name;
      if (p.home !== town) {
        p.home = town;
        if (r.name === 'Temple Plaza' || r.name === 'Palmreach' || r.name === 'Watchpost Brann') this.msg(s.id, `You will now return to ${town} when you die.`, 'info');
      }
    }
    return false;
  }

  private updateHazards(s: Session): void {
    const p = s.player;
    if (p.moving || p.hazardTimer > 0) return;
    const o = this.world.getObj(p.x, p.y, p.z);
    const g = this.world.getGround(p.x, p.y, p.z);
    if (o === Obj.FireField) {
      p.hazardTimer = 2;
      if (s.inventory.equipped('feet') === 'emberwalk_boots') return;
      this.hurtPlayerByEnvironment(s, randInt(15, 40) + p.level, 'fire', 'You are burnt by a fire field.');
    } else if (g === Ground.Swamp) {
      p.hazardTimer = 3;
      if (Math.random() < 0.5) this.hurtPlayerByEnvironment(s, randInt(4, 12), 'earth', 'The swamp water poisons you.');
    }
  }

  private hurtPlayerByEnvironment(s: Session, raw: number, el: Element, text: string): void {
    const p = s.player;
    const amount = applyResist(raw, this.resist(s, el));
    if (amount <= 0) return;
    this.events.emit({ type: 'damage', targetId: p.id, sourceId: p.id, amount, result: 'hit', element: el });
    this.msg(s.id, `${text} You lose ${amount} hitpoints.`, 'combat');
    p.hp -= amount;
    if (p.hp <= 0) this.killPlayer(p, null);
  }

  private updatePending(s: Session): void {
    const p = s.player;
    const pend = p.pending;
    if (!pend) return;
    if (pend.type === 'talk') {
      const n = this.npcs.find((x) => x.id === pend.npcId);
      if (!n || n.z !== p.z) { p.pending = null; return; }
      if (chebyshev(p.x, p.y, n.x, n.y) <= 2) {
        p.pending = null;
        p.path = [];
        p.faceTowards(n.x, n.y);
        this.openDialogue(s, n);
        return;
      }
      if (!p.moving && p.path.length === 0) {
        const path = this.pathTo(p, n.x, n.y, true, 6000);
        if (!path) { this.msg(s.id, 'There is no way.', 'warn'); p.pending = null; return; }
        p.path = path;
      }
    } else if (pend.type === 'bag') {
      const b = this.bags.find((x) => x.id === pend.bagId);
      if (!b || b.z !== p.z) { p.pending = null; return; }
      if (chebyshev(p.x, p.y, b.x, b.y) <= 1) {
        p.pending = null;
        p.path = [];
        this.pickupBag(s, b);
        return;
      }
      if (!p.moving && p.path.length === 0) {
        const walk = this.world.isWalkable(b.x, b.y, b.z) && !this.isOccupied(b.x, b.y, b.z, p.id, true);
        const path = this.pathTo(p, b.x, b.y, !walk, 6000);
        if (!path) { this.msg(s.id, 'There is no way.', 'warn'); p.pending = null; return; }
        p.path = path;
      }
    } else {
      if (pend.z !== p.z) { p.pending = null; return; }
      const onTile = pend.x === p.x && pend.y === p.y;
      if (!p.moving && (chebyshev(p.x, p.y, pend.x, pend.y) <= 1)) {
        p.pending = null;
        p.path = [];
        if (!onTile) p.faceTowards(pend.x, pend.y);
        this.useTileNow(s, pend.x, pend.y, pend.z);
        return;
      }
      if (!p.moving && p.path.length === 0) {
        const path = this.pathTo(p, pend.x, pend.y, true, 6000);
        if (!path) { this.msg(s.id, 'There is no way.', 'warn'); p.pending = null; return; }
        p.path = path;
      }
    }
  }

  private updatePlayerCombat(s: Session): void {
    const p = s.player;
    const t = this.getTarget(p.targetId);
    if (!t) { p.targetId = null; return; }
    if (t.dead || t.z !== p.z) { p.targetId = null; return; }
    if (this.isProtected(p)) return;
    if (t instanceof Player) {
      // rules may have changed since the attack started (target walked into a temple, secure mode…)
      const why = this.pvpProblem(p, t, false);
      if (why) {
        p.targetId = null;
        this.msg(s.id, why, 'warn');
        return;
      }
    }
    const range = this.weaponRange(s);
    const d = chebyshev(p.x, p.y, t.x, t.y);
    if (d > range) return;
    if (range > 1 && !this.canSee(p, t)) return;
    if (!p.moving) p.faceTowards(t.x, t.y);
    if (p.attackTimer > 0) return;
    p.attackTimer = PLAYER_ATTACK_INTERVAL;
    if (range === 1) this.meleeAttack(p, t);
    else this.distanceAttack(s, t, d);
  }

  private updateEnemy(e: Enemy, dt: number): void {
    if (e.dead) {
      e.corpseTimer -= dt;
      e.respawnTimer -= dt;
      if (e.respawnTimer <= 0) {
        const near = this.alivePlayers().some((p) => p.z === e.spawnZ && chebyshev(p.x, p.y, e.spawnX, e.spawnY) <= 5);
        if (!near && !this.isOccupied(e.spawnX, e.spawnY, e.spawnZ, e.id)) {
          e.placeAt(e.spawnX, e.spawnY, e.spawnZ);
          e.homeX = e.spawnX;
          e.homeY = e.spawnY;
          e.hp = e.maxHp;
          e.dead = false;
          e.state = 'idle';
          e.attackTimer = 0;
          e.targetId = null;
          e.damageBy.clear();
          this.events.emit({ type: 'spawn', id: e.id });
        } else {
          e.respawnTimer = 3;
        }
      }
      return;
    }
    // monsters far from every player sleep, which keeps a big world cheap
    let awake = false;
    for (const s of this.sessions.values()) {
      const p = s.player;
      if (p.z === e.z && chebyshev(p.x, p.y, e.x, e.y) <= 24) { awake = true; break; }
    }
    if (!awake && e.state === 'idle') return;
    e.attackTimer -= dt;
    const left = this.advanceStep(e, dt);
    updateEnemyAI(e, this, dt);
    if (left > 0 && e.moving) this.advanceStep(e, left);
  }

  private updateNpc(n: Npc, dt: number): void {
    const near = this.alivePlayers().find((p) => p.z === n.z && chebyshev(p.x, p.y, n.x, n.y) <= 3);
    if (near) {
      n.faceTowards(near.x, near.y);
      return;
    }
    n.idleTurnTimer -= dt;
    if (n.idleTurnTimer <= 0) {
      n.idleTurnTimer = 3 + Math.random() * 4;
      const [dx, dy] = DIRS8[Math.floor(Math.random() * 8)];
      n.facing = facingFromDelta(dx, dy);
    }
  }

  private updateBags(dt: number): void {
    for (let i = this.bags.length - 1; i >= 0; i--) {
      const b = this.bags[i];
      b.ttl -= dt;
      if (b.ttl <= 0) {
        this.bags.splice(i, 1);
        this.events.emit({ type: 'bagRemoved', bagId: b.id });
      }
    }
  }

  /** Keys of loose stones currently dug open. */
  dugHoles(): string[] {
    return [...this.openHoles.keys()];
  }

  /** Mirror mode: matches open holes to the server's list. */
  syncHoles(keys: string[]): void {
    const want = new Set(keys);
    for (const k of [...this.openHoles.keys()]) {
      if (want.has(k)) continue;
      this.openHoles.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      this.world.setObj(x, y, Obj.LooseStone, z);
      this.events.emit({ type: 'tileChanged', x, y, z });
    }
    for (const k of want) {
      if (this.openHoles.has(k)) continue;
      this.openHoles.set(k, HOLE_OPEN_SECONDS);
      const [x, y, z] = k.split(',').map(Number);
      this.world.setObj(x, y, Obj.Hole, z);
      this.events.emit({ type: 'tileChanged', x, y, z });
    }
  }

  private updateHoles(dt: number): void {
    for (const [k, t] of this.openHoles) {
      const left = t - dt;
      if (left > 0) {
        this.openHoles.set(k, left);
        continue;
      }
      const [x, y, z] = k.split(',').map(Number);
      const standing = this.players().some((p) => p.x === x && p.y === y && p.z === z);
      if (standing) continue;
      this.openHoles.delete(k);
      this.world.setObj(x, y, Obj.LooseStone, z);
      this.events.emit({ type: 'tileChanged', x, y, z });
    }
  }

  // ================================================================ combat

  meleeAttack(attacker: Creature, target: Creature): void {
    if (attacker.dead || target.dead || attacker.z !== target.z) return;
    this.events.emit({ type: 'attack', attackerId: attacker.id, targetId: target.id });
    if (attacker instanceof Player && (target instanceof Enemy || target instanceof Player)) {
      const s = this.sessions.get(attacker.id);
      if (!s) return;
      const w = s.inventory.equipped('weapon');
      const wd = w ? itemDef(w) : null;
      const atk = (wd?.attack ?? FIST_ATTACK) + this.attackBonus(s) + this.potionAttack(s, 'melee');
      const roll = rollMelee(attacker.level, atk, VOCATIONS[attacker.vocation].melee, this.targetArmor(target));
      roll.amount = applyResist(Math.round(roll.amount * this.stanceFactor(attacker, target)), this.targetResist(target, 'physical'));
      this.applyDamage(target, attacker, roll, 'physical');
      if (roll.result === 'hit' && wd?.element && wd.elementDamage && !target.dead) {
        const extra = applyResist(Math.round(wd.elementDamage * (1 + attacker.level / 60) * (0.6 + Math.random() * 0.8)), this.targetResist(target, wd.element));
        if (extra > 0) this.applyDamage(target, attacker, { amount: extra, result: 'hit' }, wd.element);
      }
    } else if (attacker instanceof Enemy && target instanceof Player) {
      const s = this.sessions.get(target.id);
      if (!s || this.isProtected(target)) return;
      const roll = rollMonsterMelee(attacker.def.minDmg, attacker.def.maxDmg, this.armor(s), this.defense(s));
      roll.amount = applyResist(Math.round(roll.amount * FIGHT_MODE[target.fightMode].taken), this.resist(s, 'physical'));
      this.applyDamage(target, attacker, roll, 'physical');
    }
  }

  /** Bows, crossbows, throwing weapons, wands and rods. */
  private distanceAttack(s: Session, t: Enemy | Player, d: number): void {
    const p = s.player;
    const inv = s.inventory;
    const w = inv.equipment.weapon;
    if (!w) return;
    const wd = itemDef(w.id);
    if (wd.magicDamage) {
      const cost = wd.manaPerShot ?? 0;
      if (p.mana < cost) {
        this.msg(s.id, 'You do not have enough mana to use your wand.', 'warn');
        p.attackTimer = 2;
        return;
      }
      p.mana -= cost;
      const el = wd.element ?? 'energy';
      this.events.emit({ type: 'projectile', fromId: p.id, toId: t.id, effect: el as Effect });
      const raw = randInt(wd.magicDamage[0], wd.magicDamage[1]);
      this.applyDamage(t, p, { amount: applyResist(Math.round(raw * (1 + this.magicBonus(s) / 100)), this.targetResist(t, el)), result: 'hit' }, el);
      return;
    }
    let atk = this.attackBonus(s) + this.potionAttack(s, 'distance');
    let effect: Effect = 'spear';
    let element: Element | undefined;
    let elementDamage = 0;
    if (wd.weaponType === 'throwing') {
      atk += wd.attack ?? 0;
      effect = w.id.endsWith('_star') ? 'star' : 'spear';
      element = wd.element;
      elementDamage = wd.elementDamage ?? 0;
      // throwing weapons are used up (most land somewhere you cannot reach)
      if (Math.random() < (wd.breakChance ?? 0.85)) {
        w.qty -= 1;
        if (w.qty <= 0) inv.equipment.weapon = null;
        this.events.emit({ type: 'inventoryChanged', to: s.id });
        if (!inv.equipment.weapon) {
          this.msg(s.id, 'You have run out of throwing weapons.', 'warn');
          this.events.emit({ type: 'equipmentChanged', id: p.id });
        }
      }
    } else {
      const a = inv.equipment.ammo;
      const ad = a ? itemDef(a.id) : null;
      if (!a || !ad || ad.ammoType !== wd.ammoType) {
        this.msg(s.id, `You need ${wd.ammoType}s in your ammunition slot.`, 'warn');
        p.attackTimer = 2;
        return;
      }
      atk += (wd.attack ?? 0) + (ad.attack ?? 0);
      effect = wd.ammoType === 'bolt' ? 'bolt' : 'arrow';
      element = ad.element;
      elementDamage = ad.elementDamage ?? 0;
      a.qty -= 1;
      if (a.qty <= 0) {
        inv.equipment.ammo = null;
        this.msg(s.id, `You have run out of ${ad.name.toLowerCase()}s.`, 'warn');
      }
      this.events.emit({ type: 'inventoryChanged', to: s.id });
    }
    this.events.emit({ type: 'attack', attackerId: p.id, targetId: t.id });
    this.events.emit({ type: 'projectile', fromId: p.id, toId: t.id, effect });
    // a steady hand (Potion of the Hawk) shoots as if two tiles closer
    const aimD = p.buffs.bullseye > 0 ? Math.max(1, d - 2) : d;
    const roll = rollDistance(p.level, atk, VOCATIONS[p.vocation].distance, this.targetArmor(t), aimD);
    roll.amount = applyResist(Math.round(roll.amount * this.stanceFactor(p, t)), this.targetResist(t, 'physical'));
    this.applyDamage(t, p, roll, 'physical');
    if (roll.result === 'hit' && element && elementDamage && !t.dead) {
      const extra = applyResist(Math.round(elementDamage * (1 + p.level / 60)), this.targetResist(t, element));
      if (extra > 0) this.applyDamage(t, p, { amount: extra, result: 'hit' }, element);
    }
  }

  useAbility(e: Enemy, a: Ability, target: Player): void {
    if (e.dead) return;
    if (a.kind === 'heal') {
      const amount = Math.min(e.maxHp - e.hp, randInt(a.min, a.max));
      if (amount <= 0) return;
      e.hp += amount;
      this.events.emit({ type: 'heal', targetId: e.id, amount });
      return;
    }
    e.faceTowards(target.x, target.y);
    const hit = (p: Player) => {
      const s = this.sessions.get(p.id);
      if (!s || p.dead || this.isProtected(p)) return;
      let raw = randInt(a.min, a.max);
      if (a.element === 'physical') raw -= randInt(0, Math.floor(this.armor(s) / 2));
      else raw -= randInt(0, Math.floor(this.defense(s) / 4));
      const amount = applyResist(Math.max(1, raw), this.resist(s, a.element));
      this.applyDamage(p, e, { amount, result: amount > 0 ? 'hit' : 'blocked' }, a.element, a.name);
    };
    if (a.kind === 'ranged') {
      this.events.emit({ type: 'projectile', fromId: e.id, toId: target.id, effect: a.effect as Effect });
      hit(target);
      return;
    }
    const cx = a.kind === 'nova' ? e.x : target.x;
    const cy = a.kind === 'nova' ? e.y : target.y;
    if (a.kind === 'blast') this.events.emit({ type: 'projectile', fromId: e.id, toId: target.id, effect: a.effect as Effect });
    this.events.emit({ type: 'area', x: cx, y: cy, z: e.z, radius: a.radius, effect: a.effect as Effect });
    for (const p of this.alivePlayers()) {
      if (p.z === e.z && chebyshev(p.x, p.y, cx, cy) <= a.radius && this.world.lineOfSight(cx, cy, p.x, p.y, e.z)) hit(p);
    }
  }

  // ---------------------------------------------------------------- PvP

  /** Armour of whatever is being hit: a monster's natural armour, or a player's worn armour. */
  targetArmor(c: Enemy | Player): number {
    if (c instanceof Enemy) return c.def.armor;
    const s = this.sessions.get(c.id);
    return s ? this.armor(s) : 0;
  }

  /** Resistance in percent of whatever is being hit (players: from their gear). */
  targetResist(c: Enemy | Player, el: Element): number {
    if (c instanceof Enemy) return c.def.resist[el] ?? 0;
    const s = this.sessions.get(c.id);
    return s ? this.resist(s, el) : 0;
  }

  /** Fight-stance multiplier for a weapon hit: the attacker's "dealt", times the defender's "taken" when it is a player. */
  private stanceFactor(attacker: Player, target: Enemy | Player): number {
    return FIGHT_MODE[attacker.fightMode].dealt * (target instanceof Player ? FIGHT_MODE[target.fightMode].taken : 1);
  }

  /** 0 = unmarked, 1 = white skull, 2 = red skull. */
  skullOf(p: Player): 0 | 1 | 2 {
    if (!this.simulate) return p.netSkull;
    const now = this.now();
    if (p.redSkullUntil > now) return 2;
    if (p.whiteSkullUntil > now) return 1;
    return 0;
  }

  /** Whether `victim` attacked `p` recently, so `p` may hit back without a skull. */
  private isAggressor(p: Player, victim: Player): boolean {
    return (p.attackedBy.get(victim.id) ?? 0) > this.now();
  }

  /**
   * Why `p` may not hurt player `t` right now, or null when it is allowed.
   * `area` = splash damage from an area spell or rune (no level message needed,
   * but the same rules apply).
   */
  pvpProblem(p: Player, t: Player, area: boolean): string | null {
    if (p.id === t.id) return 'You may not attack yourself.';
    if (!this.pvp) return 'You may not attack players in this world.';
    if (t.dead) return 'Your target is already dead.';
    if (this.isProtected(p)) return 'You may not attack from inside a protection zone.';
    if (this.isProtected(t)) return 'You may not attack a person in a protection zone.';
    if (p.level < PVP_MIN_LEVEL) return `You need level ${PVP_MIN_LEVEL} to attack players.`;
    if (t.level < PVP_MIN_LEVEL) return `You may not attack a player below level ${PVP_MIN_LEVEL}.`;
    if (p.secure && this.skullOf(t) === 0 && !this.isAggressor(p, t)) {
      return area ? 'Secure mode protects unmarked players.' : 'Turn secure mode off to attack unmarked players.';
    }
    return null;
  }

  /** Bookkeeping for one attack by `p` on player `t`: PZ lock, white skull, the victim's right to hit back. */
  private onPvpAttack(p: Player, t: Player): void {
    const now = this.now();
    p.pzLock = PZ_LOCK_SECONDS;
    // self-defence and fighting marked players are free; everything else earns a white skull
    if (this.skullOf(t) === 0 && !this.isAggressor(p, t)) {
      if (p.whiteSkullUntil <= now && p.redSkullUntil <= now) this.msg(p.id, 'You attacked an unmarked player. You have a white skull.', 'warn');
      p.whiteSkullUntil = now + WHITE_SKULL_MS;
    }
    t.attackedBy.set(p.id, now + SELF_DEFENCE_MS);
  }

  /** Death by another player: unjustified kills and red skulls. */
  private onPvpKill(killer: Player, victim: Player, victimSkull: 0 | 1 | 2): void {
    const now = this.now();
    this.msg(killer.id, `You killed ${victim.name}.`, 'combat');
    if (victimSkull !== 0 || this.isAggressor(killer, victim)) return;
    killer.unjustKills = killer.unjustKills.filter((t) => t > now - UNJUST_WINDOW_MS);
    killer.unjustKills.push(now);
    this.msg(killer.id, `Warning: that was an unjustified kill (${killer.unjustKills.length} in the last 24 hours).`, 'warn');
    if (killer.unjustKills.length >= UNJUST_KILLS_FOR_RED) {
      if (killer.redSkullUntil <= now) this.msg(killer.id, 'You have a red skull! If you die you lose your whole backpack.', 'warn');
      killer.redSkullUntil = now + RED_SKULL_MS;
    }
    const ks = this.sessions.get(killer.id);
    if (ks) ks.wantsSave = true;
  }

  /** Secure mode toggle (on = you cannot attack unmarked players). */
  setSecureMode(pid: number, on: boolean): void {
    const s = this.sessions.get(pid);
    if (!s) return;
    s.player.secure = !!on;
    s.wantsSave = true;
    this.msg(pid, on ? 'Secure mode on: you will not attack unmarked players.' : 'Secure mode off: you can attack any player. Attacking unmarked players gives you a skull.', 'info');
  }

  private applyDamage(target: Creature, source: Creature, roll: Roll, element: Element, sourceName?: string): void {
    if (target.dead) return;
    if (target instanceof Player && source instanceof Player && target !== source) {
      // every PvP hit passes here, so this is the last word on the rules
      if (this.pvpProblem(source, target, true)) return;
      this.onPvpAttack(source, target);
    }
    let manaShield = 0;
    let amount = roll.amount;
    if (target instanceof Player && roll.result === 'hit' && target.buffs.magicShield > 0) {
      manaShield = Math.min(target.mana, amount);
      target.mana -= manaShield;
      amount -= manaShield;
    }
    if (target instanceof Player && target.god) amount = 0;
    this.events.emit({ type: 'damage', targetId: target.id, sourceId: source.id, amount, result: roll.result, element, manaShield: manaShield || undefined });
    if (target instanceof Player) target.sinceCombat = 0;
    if (source instanceof Player) source.sinceCombat = 0;
    if (target instanceof Enemy && source instanceof Player) onEnemyDamaged(target, source.id);
    if (roll.result !== 'hit') return;
    if (target instanceof Enemy && source instanceof Player) {
      const dealt = Math.min(amount, Math.max(0, target.hp));
      target.damageBy.set(source.id, (target.damageBy.get(source.id) ?? 0) + dealt);
    }
    target.hp -= amount;
    if (target instanceof Player) {
      const who = source instanceof Player ? source.name : article(source.name);
      const how = sourceName ? `${who}'s ${sourceName}` : `an attack by ${who}`;
      if (amount > 0) this.msg(target.id, `You lose ${amount} hitpoints due to ${how}.`, 'combat');
      if (manaShield > 0) this.msg(target.id, `You lose ${manaShield} mana to your magic shield.`, 'combat');
    }
    if (target.hp <= 0) {
      target.hp = 0;
      if (target instanceof Player) this.killPlayer(target, source);
      else if (target instanceof Enemy) this.killEnemy(target);
    }
  }

  private killEnemy(e: Enemy): void {
    e.dead = true;
    e.state = 'dead';
    e.path = [];
    e.moveT = 1;
    e.fromX = e.x;
    e.fromY = e.y;
    e.respawnTimer = e.def.respawn;
    e.corpseTimer = 8;
    e.targetId = null;
    this.events.emit({ type: 'death', id: e.id });
    for (const s of this.sessions.values()) if (s.player.targetId === e.id) s.player.targetId = null;

    const total = [...e.damageBy.values()].reduce((a, b) => a + b, 0) || 1;
    for (const [pid, dealt] of e.damageBy) {
      const s = this.sessions.get(pid);
      if (!s) continue;
      const exp = Math.max(1, Math.round((e.def.exp * dealt) / total));
      this.grantExp(s, exp, e.id, `for slaying ${e.def.elite ? 'the ' + e.def.name.toLowerCase() : article(e.def.name)}`);
      const changed = s.quests.onKill(e.enemyKind);
      for (const q of changed) {
        const qs = s.quests.get(q.id);
        const giver = NPCS[q.giver]?.name ?? 'the quest giver';
        if (qs.status === 'ready') this.msg(pid, `Quest "${q.title}": done! Return to ${giver}.`, 'quest');
        else this.msg(pid, `Quest "${q.title}": ${qs.kills}/${q.count} ${q.targetName} slain.`, 'quest');
      }
      if (changed.length) this.events.emit({ type: 'questChanged', to: pid });
    }
    const looters = [...e.damageBy.keys()];
    e.damageBy.clear();

    const items: ItemStack[] = [];
    for (const l of e.def.loot) {
      if (Math.random() < l.chance) items.push({ id: l.id, qty: randInt(l.min, l.max) });
    }
    const names = items.length ? items.map(describeStack).join(', ') : 'nothing';
    for (const pid of looters) this.msg(pid, `Loot of ${e.def.elite ? 'the ' + e.def.name.toLowerCase() : article(e.def.name)}: ${names}.`, 'loot');
    if (items.length) this.dropBag(e.x, e.y, e.z, items);
  }

  private dropBag(x: number, y: number, z: number, items: ItemStack[]): GroundBag {
    let bag = this.bags.find((b) => b.x === x && b.y === y && b.z === z);
    if (!bag) {
      bag = { id: this.nextId++, x, y, z, items: [], ttl: BAG_LIFETIME };
      this.bags.push(bag);
      this.events.emit({ type: 'bagCreated', bagId: bag.id, x, y, z });
    }
    bag.items.push(...items);
    bag.ttl = BAG_LIFETIME;
    return bag;
  }

  private grantExp(s: Session, exp: number, atId: number, why: string): void {
    const p = s.player;
    this.events.emit({ type: 'xp', amount: exp, atId, to: s.id });
    this.msg(s.id, `You gained ${exp} experience points ${why}.`, 'info');
    const levels = p.gainExp(exp);
    if (levels > 0) {
      this.refreshStats(s);
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      this.events.emit({ type: 'levelUp', id: s.id, level: p.level });
      this.msg(s.id, `You advanced from Level ${p.level - levels} to Level ${p.level}.`, 'level');
      s.wantsSave = true;
    }
  }

  private killPlayer(p: Player, killer: Creature | null): void {
    const s = this.sessions.get(p.id);
    const skull = this.skullOf(p);
    const byPlayer = killer instanceof Player && killer !== p ? killer : null;
    p.dead = true;
    p.pzLock = 0;
    p.attackedBy.clear();
    for (const o of this.sessions.values()) if (o.player.targetId === p.id) o.player.targetId = null;
    p.path = [];
    p.pending = null;
    p.targetId = null;
    p.moveT = 1;
    p.fromX = p.x;
    p.fromY = p.y;
    p.respawnTimer = 4;
    this.closeDialogue(p.id);
    if (s?.depotOpen) this.closeDepot(s.id);
    this.cancelTrade(p.id, 'died');
    // lose 6% of experience; may lose a level, like the old days
    const loss = Math.floor(p.exp * 0.06);
    p.exp -= loss;
    while (p.level > 1 && p.exp < expForLevel(p.level)) p.level--;
    if (s) this.refreshStats(s);
    for (const e of this.enemies) if (e.targetId === p.id) e.targetId = null;
    this.events.emit({ type: 'death', id: p.id });
    if (byPlayer) this.msg(p.id, `You were killed by ${byPlayer.name}. You lost ${loss} experience.`, 'warn');
    else this.msg(p.id, `You were slain${killer ? ` by ${article(killer.name)}` : ''}. You lost ${loss} experience.`, 'warn');
    // a red skull costs the whole backpack: it stays where you fell
    if (skull === 2 && s) {
      const dropped: ItemStack[] = [];
      for (let i = 0; i < s.inventory.slots.length; i++) {
        const st = s.inventory.slots[i];
        if (!st) continue;
        dropped.push({ ...st });
        s.inventory.slots[i] = null;
      }
      if (dropped.length) {
        this.dropBag(p.x, p.y, p.z, dropped);
        this.msg(p.id, 'Your red skull cost you everything in your backpack.', 'warn');
        this.events.emit({ type: 'inventoryChanged', to: p.id });
      }
    }
    if (byPlayer) this.onPvpKill(byPlayer, p, skull);
    if (s && (byPlayer || skull === 2)) s.wantsSave = true;
  }

  private respawnPlayer(s: Session): void {
    const p = s.player;
    const home = this.world.regions.find((r) => r.temple && (r.name === p.home || (p.home === 'Thornvale' && r.name === 'Temple Plaza')));
    const t = home?.temple ?? this.world.temple;
    const f = this.freeTileNear(t.x, t.y, t.z);
    p.placeAt(f.x, f.y, f.z);
    p.dead = false;
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    p.facing = 0;
    p.attackTimer = 0;
    p.buffs = emptyBuffs();
    this.refreshStats(s);
    this.events.emit({ type: 'playerRespawn', id: p.id });
    this.msg(p.id, `You awaken at the temple of ${home ? (home.name === 'Temple Plaza' ? 'Thornvale' : home.name) : 'Thornvale'}.`, 'info');
  }

  private freeTileNear(x: number, y: number, z: number): { x: number; y: number; z: number } {
    for (let r = 0; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (this.world.isWalkable(nx, ny, z) && !this.isOccupied(nx, ny, z, -1, true) && !this.world.linkAt(nx, ny, z)) return { x: nx, y: ny, z };
        }
      }
    }
    return { x, y, z };
  }

  // ================================================================ commands

  commandMoveTo(pid: number, x: number, y: number): TilePos | null {
    const s = this.sessions.get(pid);
    if (!s) return null;
    const p = s.player;
    if (p.dead || !this.world.inBounds(x, y)) return null;
    p.pending = null;
    p.chaseSuppressed = 1.5;
    // someone standing on the tile (outside a protection zone): walk next to them instead
    const walkable = this.world.isWalkable(x, y, p.z) && !this.isOccupied(x, y, p.z, p.id, true);
    const path = this.pathTo(p, x, y, !walkable, 40000);
    if (!path) {
      this.msg(pid, 'There is no way.', 'warn');
      return null;
    }
    p.path = path;
    return path[path.length - 1] ?? { x: p.x, y: p.y };
  }

  commandAttack(pid: number, id: number): void {
    const p = this.getPlayer(pid);
    const e = this.getTarget(id);
    if (!p || !e || e.dead || p.dead || e.z !== p.z) return;
    if (e instanceof Player) {
      const why = this.pvpProblem(p, e, false);
      if (why) {
        this.msg(pid, why, 'warn');
        return;
      }
    }
    if (this.isProtected(p)) {
      this.msg(pid, 'You may not attack from inside a protection zone.', 'warn');
      return;
    }
    if (p.targetId !== id) this.msg(pid, `Attacking ${e instanceof Player ? e.name : e.name.toLowerCase()}.`, 'combat');
    p.targetId = id;
    p.path = [];
    p.pending = null;
    p.chaseSuppressed = 0;
  }

  /** Test command: kill a monster as if this player had slain it. */
  adminKill(p: Player, e: Enemy): void {
    this.applyDamage(e, p, { amount: Math.ceil(e.hp), result: 'hit' }, 'physical');
  }

  /** Turns on the spot (Ctrl + direction), the classic way. */
  commandTurn(pid: number, dx: number, dy: number): void {
    const p = this.getPlayer(pid);
    if (!p || p.dead || p.moving || (!dx && !dy)) return;
    p.facing = facingFromDelta(Math.sign(dx), Math.sign(dy));
  }

  commandClearTarget(pid: number): void {
    const p = this.getPlayer(pid);
    if (p) p.targetId = null;
  }

  commandTargetNext(pid: number): void {
    const p = this.getPlayer(pid);
    if (!p || p.dead) return;
    const list = this.enemies
      .filter((e) => !e.dead && e.z === p.z && chebyshev(p.x, p.y, e.x, e.y) <= 8)
      .sort((a, b) => chebyshev(p.x, p.y, a.x, a.y) - chebyshev(p.x, p.y, b.x, b.y));
    if (!list.length) {
      this.msg(pid, 'No enemies nearby.', 'warn');
      return;
    }
    const idx = list.findIndex((e) => e.id === p.targetId);
    p.targetId = list[(idx + 1) % list.length].id;
    p.chaseSuppressed = 0;
    p.path = [];
  }

  commandTalk(pid: number, npcId: number): void {
    const p = this.getPlayer(pid);
    if (!p || p.dead) return;
    p.path = [];
    p.pending = { type: 'talk', npcId };
  }

  commandPickup(pid: number, bagId: number): void {
    const p = this.getPlayer(pid);
    if (!p || p.dead) return;
    p.path = [];
    p.pending = { type: 'bag', bagId };
  }

  /** Walk to and use a map object: ladders, rope spots, loose stones, lockers, chests. */
  commandUseTile(pid: number, x: number, y: number): void {
    const p = this.getPlayer(pid);
    if (!p || p.dead) return;
    p.path = [];
    p.pending = { type: 'use', x, y, z: p.z };
  }

  /** Whether a tile has something to use (for cursors and clicks). */
  isUsable(x: number, y: number, z: number): boolean {
    const o = this.world.getObj(x, y, z);
    return o === Obj.Ladder || o === Obj.RopeSpot || o === Obj.LooseStone || o === Obj.Locker || o === Obj.Chest;
  }

  private useTileNow(s: Session, x: number, y: number, z: number): void {
    const p = s.player;
    const o = this.world.getObj(x, y, z);
    const link = this.world.linkAt(x, y, z);
    switch (o) {
      case Obj.Ladder:
        if (link) this.teleport(p, link.to.x, link.to.y, link.to.z);
        return;
      case Obj.RopeSpot:
        if (!s.inventory.has('rope')) {
          this.msg(s.id, 'You need a rope to climb up here.', 'warn');
          return;
        }
        if (link) {
          this.teleport(p, link.to.x, link.to.y, link.to.z);
          this.msg(s.id, 'You climb up the rope.', 'info');
        }
        return;
      case Obj.LooseStone:
        if (!s.inventory.has('shovel')) {
          this.msg(s.id, 'The stones are loose. With a shovel you could dig here.', 'info');
          return;
        }
        this.world.setObj(x, y, Obj.Hole, z);
        this.openHoles.set(WorldMap.key(x, y, z), HOLE_OPEN_SECONDS);
        this.events.emit({ type: 'tileChanged', x, y, z });
        this.msg(s.id, 'You dig a hole. It leads down into darkness.', 'info');
        return;
      case Obj.Locker:
        s.depotOpen = { x, y, z };
        this.events.emit({ type: 'depotChanged', to: s.id });
        return;
      case Obj.Chest: {
        const c = this.world.chests.find((ch) => ch.x === x && ch.y === y && ch.z === z);
        if (!c) return;
        if (s.chests.has(c.id)) {
          this.msg(s.id, 'The chest is empty.', 'info');
          return;
        }
        const weight = c.items.reduce((n, it) => n + itemDef(it.id).weight * it.qty, 0);
        if (s.inventory.weight() + weight > p.capacity) {
          this.msg(s.id, 'The treasure is too heavy for you to carry.', 'warn');
          return;
        }
        if (s.inventory.freeSlots() < c.items.filter((i) => i.id !== 'gold').length + 1) {
          this.msg(s.id, 'You need more free space in your backpack.', 'warn');
          return;
        }
        for (const it of c.items) s.inventory.add(it.id, it.qty);
        s.chests.add(c.id);
        s.wantsSave = true;
        this.msg(s.id, `You found ${c.items.map(describeStack).join(', ')}.`, 'loot');
        this.events.emit({ type: 'inventoryChanged', to: s.id });
        return;
      }
      default:
        this.msg(s.id, 'There is nothing to use here.', 'info');
    }
  }

  // ---------------------------------------------------------------- spells & runes

  castSpell(pid: number, id: SpellId, param: string | null = null): void {
    const s = this.sessions.get(pid);
    if (!s || !isSpellId(id)) return;
    const p = s.player;
    if (p.dead) return;
    const sp = SPELLS[id];
    const fail = (t: string) => this.msg(pid, t, 'warn');
    if (!s.spells.has(id)) return fail(`You have not learned ${sp.name}. A spell trainer can teach you.`);
    if (!sp.vocations.includes(p.vocation)) return fail(`${VOCATIONS[p.vocation].name}s cannot cast ${sp.name}.`);
    if (p.level < sp.level) return fail(`You need level ${sp.level} to cast ${sp.name}.`);
    if ((p.spellCooldowns[id] ?? 0) > 0 || p.groupCooldowns[sp.group] > 0) return fail('You are exhausted.');
    if (p.mana < sp.mana) return fail('You do not have enough mana.');
    const voc = VOCATIONS[p.vocation];
    const magicMult = voc.magic * (1 + this.magicBonus(s) / 100);

    const spend = () => {
      p.mana -= sp.mana;
      p.spellCooldowns[id] = sp.cooldown;
      p.groupCooldowns[sp.group] = GROUP_COOLDOWN[sp.group];
      this.events.emit({ type: 'cast', casterId: p.id, words: param ? `${sp.words} "${param}"` : sp.words });
    };

    switch (sp.kind) {
      case 'heal': {
        if (p.hp >= p.maxHp) return fail('You are already at full health.');
        spend();
        const amount = Math.min(p.maxHp - p.hp, rollFormula(sp.min!, sp.max!, sp.perLevel!, p.level, voc.healing));
        p.hp += amount;
        this.events.emit({ type: 'area', x: p.x, y: p.y, z: p.z, radius: 0, effect: 'heal' });
        this.events.emit({ type: 'heal', targetId: p.id, amount });
        return;
      }
      case 'healFriend': {
        const target = param ? this.findPlayerByName(param) : this.mostWoundedAlly(p, sp.range ?? 7);
        if (!target || target.dead) return fail(param ? `${param} is not here.` : 'There is no wounded ally nearby.');
        if (target.id === p.id) return fail('You cannot cast Heal Friend on yourself.');
        if (this.dist(p, target) > (sp.range ?? 7) || !this.canSee(p, target)) return fail(`${target.name} is too far away.`);
        spend();
        const amount = Math.min(target.maxHp - target.hp, rollFormula(sp.min!, sp.max!, sp.perLevel!, p.level, voc.healing));
        target.hp += amount;
        this.events.emit({ type: 'projectile', fromId: p.id, toId: target.id, effect: 'heal' });
        this.events.emit({ type: 'heal', targetId: target.id, amount });
        this.msg(target.id, `${p.name} heals you for ${amount} hitpoints.`, 'info');
        return;
      }
      case 'buff': {
        spend();
        const b = sp.buff!;
        p.buffs[b] = sp.duration ?? 30;
        if (b === 'haste') this.refreshStats(s);
        this.events.emit({ type: 'buff', id: p.id, buff: b, on: true });
        this.events.emit({ type: 'area', x: p.x, y: p.y, z: p.z, radius: 0, effect: b === 'haste' ? 'haste' : b === 'magicShield' ? 'shield' : 'light' });
        return;
      }
      case 'target': {
        const t = this.getTarget(p.targetId);
        if (!t || t.dead || t.z !== p.z) return fail('You need a target. Click an enemy first.');
        if (this.isProtected(p)) return fail('You may not attack from inside a protection zone.');
        if (t instanceof Player) {
          const why = this.pvpProblem(p, t, false);
          if (why) return fail(why);
        }
        if (chebyshev(p.x, p.y, t.x, t.y) > (sp.range ?? 3)) return fail('Your target is too far away.');
        if (!this.canSee(p, t)) return fail('You cannot see your target.');
        spend();
        p.faceTowards(t.x, t.y);
        const el = sp.element ?? 'energy';
        const effect: Effect = el === 'physical' ? 'spear' : el;
        this.events.emit({ type: 'projectile', fromId: p.id, toId: t.id, effect });
        this.applyDamage(t, p, { amount: applyResist(this.spellDamage(s, sp, magicMult), this.targetResist(t, el)), result: 'hit' }, el);
        return;
      }
      case 'conjure': {
        const c = sp.conjure!;
        const made = itemDef(c.item);
        if (c.from && s.inventory.count(c.from) <= 0) return fail(`You need ${article(itemDef(c.from).name)} in your backpack.`);
        const extraWeight = made.weight * c.qty - (c.from ? itemDef(c.from).weight : 0);
        if (s.inventory.weight() + extraWeight > p.capacity) return fail('You cannot carry any more.');
        // the source item may free the slot the new items need
        if (c.from) s.inventory.removeById(c.from, 1);
        const fits = s.inventory.canFit(c.item, c.qty);
        if (c.from) s.inventory.add(c.from, 1);
        if (!fits) return fail('You do not have enough room in your backpack.');
        spend();
        if (c.from) s.inventory.removeById(c.from, 1);
        const left = s.inventory.add(c.item, c.qty);
        if (left > 0) this.dropBag(p.x, p.y, p.z, [{ id: c.item, qty: left }]);
        this.events.emit({ type: 'area', x: p.x, y: p.y, z: p.z, radius: 0, effect: 'energy' });
        this.events.emit({ type: 'inventoryChanged', to: pid });
        this.msg(pid, `You conjure ${c.qty > 1 ? `${c.qty} ${made.name.toLowerCase()}s` : article(made.name)}.`, 'info');
        return;
      }
      case 'selfArea': {
        if (this.isProtected(p)) return fail('You may not attack from inside a protection zone.');
        spend();
        const el = sp.element ?? 'energy';
        const r = sp.radius ?? 1;
        this.events.emit({ type: 'area', x: p.x, y: p.y, z: p.z, radius: r, effect: el === 'physical' ? (r > 1 ? 'stone' : 'blood') : el });
        for (const e of this.areaVictims(p)) {
          if (e.dead || e.z !== p.z || (r > 1 ? !inAreaShape(e.x - p.x, e.y - p.y, r) : chebyshev(e.x, e.y, p.x, p.y) > r)) continue;
          if (!this.world.lineOfSight(p.x, p.y, e.x, e.y, p.z)) continue;
          this.applyDamage(e, p, { amount: applyResist(this.spellDamage(s, sp, magicMult), this.targetResist(e, el)), result: 'hit' }, el);
        }
        return;
      }
    }
  }

  /**
   * Who an area attack by `p` can hurt: every monster, plus (PvP) the players the
   * rules allow — never the caster, never anyone in a protection zone, and with
   * secure mode on only marked players.
   */
  private areaVictims(p: Player): Array<Enemy | Player> {
    const out: Array<Enemy | Player> = [...this.enemies];
    if (!this.pvp) return out;
    for (const o of this.alivePlayers()) if (o.z === p.z && !this.pvpProblem(p, o, true)) out.push(o);
    return out;
  }

  private spellDamage(s: Session, sp: SpellDef, magicMult: number): number {
    const p = s.player;
    if (sp.weaponScale) {
      const w = s.inventory.equipped('weapon');
      const atk = (w ? itemDef(w).attack ?? FIST_ATTACK : FIST_ATTACK) + this.attackBonus(s) + this.potionAttack(s, 'melee') + this.potionAttack(s, 'distance');
      const voc = VOCATIONS[p.vocation];
      const mult = sp.element === 'physical' ? Math.max(voc.melee, voc.distance) : magicMult;
      return rollFormula(sp.min! + atk * sp.weaponScale, sp.max! + atk * sp.weaponScale * 1.6, sp.perLevel!, p.level, mult);
    }
    return rollFormula(sp.min!, sp.max!, sp.perLevel!, p.level, magicMult);
  }

  private mostWoundedAlly(p: Player, range: number): Player | null {
    let best: Player | null = null;
    for (const o of this.alivePlayers()) {
      if (o.id === p.id || this.dist(p, o) > range) continue;
      if (o.hp >= o.maxHp) continue;
      if (!best || o.hp / o.maxHp < best.hp / best.maxHp) best = o;
    }
    return best;
  }

  /** Uses a rune from the backpack on the current target (or yourself for healing runes). */
  /**
   * Uses a rune. `at` aims it (the classic crosshair): a tile for area runes,
   * or the creature standing there for single-target and healing runes.
   * Without `at`, attack runes go to the current target and healing runes on yourself.
   */
  useRune(pid: number, slot: number, at?: { x: number; y: number }): void {
    const s = this.sessions.get(pid);
    if (!s) return;
    const p = s.player;
    const st = s.inventory.slots[slot];
    if (!st || p.dead) return;
    const d = itemDef(st.id);
    const r = d.rune;
    if (!r) return;
    if (d.level && p.level < d.level) return this.msg(pid, `You need level ${d.level} to use this rune.`, 'warn');
    if (p.groupCooldowns.attack > 0 && r.type === 'damage') return this.msg(pid, 'You are exhausted.', 'warn');
    if (p.groupCooldowns.heal > 0 && r.type === 'heal') return this.msg(pid, 'You are exhausted.', 'warn');
    const voc = VOCATIONS[p.vocation];
    const creatureAt = (x: number, y: number) => this.creatures().find((c) => !c.dead && c.z === p.z && c.x === x && c.y === y) ?? null;
    if (at) {
      if (!this.world.inBounds(at.x, at.y)) return;
      if (chebyshev(p.x, p.y, at.x, at.y) > r.range) return this.msg(pid, 'That is too far away.', 'warn');
      if (!this.world.lineOfSight(p.x, p.y, at.x, at.y, p.z)) return this.msg(pid, 'You cannot throw there.', 'warn');
    }

    if (r.type === 'heal') {
      const c = at ? creatureAt(at.x, at.y) : p;
      const who = c instanceof Player ? c : null;
      if (!who) return this.msg(pid, 'You can only use this rune on a player.', 'warn');
      if (who.hp >= who.maxHp) return this.msg(pid, who === p ? 'You are already at full health.' : `${who.name} is not wounded.`, 'warn');
      const amount = Math.min(who.maxHp - who.hp, rollFormula(r.min, r.max, r.perLevel, p.level, voc.healing));
      who.hp += amount;
      p.groupCooldowns.heal = GROUP_COOLDOWN.heal;
      if (who !== p) this.events.emit({ type: 'projectile', fromId: p.id, toId: who.id, effect: 'heal' });
      this.events.emit({ type: 'area', x: who.x, y: who.y, z: who.z, radius: 0, effect: 'heal' });
      this.events.emit({ type: 'heal', targetId: who.id, amount });
    } else {
      if (this.isProtected(p)) return this.msg(pid, 'You may not attack from inside a protection zone.', 'warn');
      const el = r.element ?? 'energy';
      const mult = voc.magic * (1 + this.magicBonus(s) / 100);
      const roll = (e: Enemy | Player) => ({ amount: applyResist(rollFormula(r.min, r.max, r.perLevel, p.level, mult), this.targetResist(e, el)), result: 'hit' as const });
      if (r.radius > 0) {
        // area rune: centred on the aimed tile, or on the target
        let cx: number, cy: number;
        if (at) {
          cx = at.x;
          cy = at.y;
        } else {
          const t = this.getTarget(p.targetId);
          if (!t || t.dead || t.z !== p.z) return this.msg(pid, 'Aim the rune at a spot, or target a monster first.', 'warn');
          if (chebyshev(p.x, p.y, t.x, t.y) > r.range) return this.msg(pid, 'Your target is too far away.', 'warn');
          if (!this.canSee(p, t)) return this.msg(pid, 'You cannot throw there.', 'warn');
          cx = t.x;
          cy = t.y;
        }
        p.groupCooldowns.attack = GROUP_COOLDOWN.attack;
        const t = creatureAt(cx, cy);
        if (t) this.events.emit({ type: 'projectile', fromId: p.id, toId: t.id, effect: el as Effect });
        this.events.emit({ type: 'area', x: cx, y: cy, z: p.z, radius: r.radius, effect: el as Effect });
        for (const e of this.areaVictims(p)) {
          if (e.dead || e.z !== p.z || !inAreaShape(e.x - cx, e.y - cy, r.radius)) continue;
          if (!this.world.lineOfSight(cx, cy, e.x, e.y, p.z)) continue;
          this.applyDamage(e, p, roll(e), el);
        }
      } else {
        const c = at ? creatureAt(at.x, at.y) : this.getTarget(p.targetId);
        const t = c instanceof Enemy || (c instanceof Player && c !== p && this.pvp) ? c : null;
        if (!t || t.dead || t.z !== p.z) return this.msg(pid, at ? 'Aim this rune at a monster.' : 'You need a target. Click an enemy first.', 'warn');
        if (t instanceof Player) {
          const why = this.pvpProblem(p, t, false);
          if (why) return this.msg(pid, why, 'warn');
        }
        if (chebyshev(p.x, p.y, t.x, t.y) > r.range) return this.msg(pid, 'Your target is too far away.', 'warn');
        if (!this.canSee(p, t)) return this.msg(pid, 'You cannot throw there.', 'warn');
        p.groupCooldowns.attack = GROUP_COOLDOWN.attack;
        this.events.emit({ type: 'projectile', fromId: p.id, toId: t.id, effect: el as Effect });
        this.applyDamage(t, p, roll(t), el);
      }
    }
    s.inventory.removeFromSlot(slot, 1);
    this.events.emit({ type: 'inventoryChanged', to: pid });
  }

  /** Local chat. Saying a spell's words casts it, the classic way. */
  say(pid: number, text: string): void {
    const s = this.sessions.get(pid);
    const clean = text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
    if (!s || !clean) return;
    if (clean.startsWith('/')) {
      if (!s.admin) return this.msg(pid, 'Test commands are switched off on this server.', 'warn');
      runAdminCommand(this, s, clean);
      return;
    }
    const spell = parseSpellWords(clean);
    if (spell) {
      this.castSpell(pid, spell.spell.id, spell.param);
      return;
    }
    this.events.emit({ type: 'chat', id: pid, name: s.player.name, text: clean });
  }

  // ---------------------------------------------------------------- items & equipment

  /** Can this item be equipped right now? Returns a reason when not. */
  equipProblem(s: Session, d: ItemDef): string | null {
    const p = s.player;
    if (d.level && p.level < d.level) return `You need level ${d.level} to use this.`;
    if (d.vocations && !d.vocations.includes(p.vocation)) return `${VOCATIONS[p.vocation].name}s cannot use this.`;
    const slot = equipSlotFor(d);
    if (slot === 'shield') {
      const w = s.inventory.equipped('weapon');
      if (w && itemDef(w).twoHanded) return 'You are holding a two-handed weapon.';
    }
    return null;
  }

  useSlot(pid: number, slot: number): void {
    const s = this.sessions.get(pid);
    if (!s) return;
    const p = s.player;
    const inv = s.inventory;
    const st = inv.slots[slot];
    if (!st || p.dead) return;
    const d = itemDef(st.id);
    const eq = equipSlotFor(d);
    if (eq) return this.equipFromSlot(s, slot, eq, d);
    if (d.rune) return this.useRune(pid, slot);
    if (d.kind === 'consumable') {
      if (d.level && p.level < d.level) return this.msg(pid, `You need level ${d.level} to drink this.`, 'warn');
      if (d.vocations && !d.vocations.includes(p.vocation)) return this.msg(pid, `${VOCATIONS[p.vocation].name}s cannot use this potion.`, 'warn');
      if (d.buff) {
        if (p.groupCooldowns.potion > 0) return this.msg(pid, 'You are exhausted.', 'warn');
        inv.removeFromSlot(slot, 1);
        const was = p.buffs[d.buff] > 0;
        p.buffs[d.buff] = POTION_BUFF_SECONDS;
        p.groupCooldowns.potion = GROUP_COOLDOWN.potion;
        this.events.emit({ type: 'buff', id: p.id, buff: d.buff, on: true });
        this.events.emit({ type: 'area', x: p.x, y: p.y, z: p.z, radius: 0, effect: d.buff === 'berserk' ? 'blood' : d.buff === 'bullseye' ? 'earth' : 'energy' });
        this.msg(pid, `${BUFF_START[d.buff]}${was ? ' (renewed)' : ''}`, 'info');
        this.events.emit({ type: 'inventoryChanged', to: pid });
        return;
      }
      const healNeeded = d.heal && p.hp < p.maxHp;
      const manaNeeded = d.mana && p.mana < p.maxMana;
      if (!healNeeded && !manaNeeded) return this.msg(pid, d.heal ? 'You are already at full health.' : 'Your mana is already full.', 'warn');
      if (p.groupCooldowns.potion > 0) return this.msg(pid, 'You are exhausted.', 'warn');
      inv.removeFromSlot(slot, 1);
      if (d.heal) {
        const amount = Math.min(d.heal, p.maxHp - p.hp);
        p.hp += amount;
        this.events.emit({ type: 'heal', targetId: p.id, amount });
      }
      if (d.mana) {
        const amount = Math.min(d.mana, p.maxMana - p.mana);
        p.mana += amount;
        this.events.emit({ type: 'mana', targetId: p.id, amount, to: pid });
      }
      p.groupCooldowns.potion = GROUP_COOLDOWN.potion;
      this.events.emit({ type: 'inventoryChanged', to: pid });
      return;
    }
    if (d.tool === 'rope') return this.msg(pid, 'Click a rope spot to climb up with your rope.', 'info');
    if (d.tool === 'shovel') return this.msg(pid, 'Click loose stones to dig them open.', 'info');
    this.msg(pid, `${d.name}: ${describeItem(d)}${d.value ? ` — traders pay ${d.value} gold.` : ''}`, 'info');
  }

  private equipFromSlot(s: Session, slot: number, eq: EquipSlot, d: ItemDef): void {
    const pid = s.id;
    const inv = s.inventory;
    const st = inv.slots[slot]!;
    const problem = this.equipProblem(s, d);
    if (problem) return this.msg(pid, problem, 'warn');
    // two-handed weapons need the off-hand free
    if (eq === 'weapon' && d.twoHanded && inv.equipment.shield) {
      if (inv.add(inv.equipment.shield.id, inv.equipment.shield.qty) > 0) return this.msg(pid, 'You need a free slot for your shield first.', 'warn');
      inv.equipment.shield = null;
    }
    // swapping to a smaller backpack must not strand items
    if (eq === 'backpack') {
      const cur = inv.equipment.backpack;
      const newSize = 8 + (d.slots ?? 0);
      const used = inv.slots.filter((x, i) => x && i !== slot).length + (cur ? 1 : 0);
      if (used > newSize) return this.msg(pid, 'That backpack is too small for everything you carry.', 'warn');
    }
    const old = inv.equipment[eq];
    if (d.stackable && old && old.id === d.id) {
      old.qty += st.qty;
      inv.slots[slot] = null;
    } else {
      inv.equipment[eq] = { id: st.id, qty: st.qty };
      inv.slots[slot] = old ? { ...old } : null;
    }
    inv.compact();
    this.refreshStats(s);
    this.msg(pid, `You equip ${d.stackable ? `${inv.equipment[eq]!.qty} ` : 'the '}${d.name.toLowerCase()}${d.stackable && inv.equipment[eq]!.qty > 1 ? 's' : ''}.`, 'info');
    this.events.emit({ type: 'inventoryChanged', to: pid });
    this.events.emit({ type: 'equipmentChanged', id: pid });
  }

  useItem(pid: number, id: string): void {
    const s = this.sessions.get(pid);
    if (!s) return;
    const slot = s.inventory.slots.findIndex((x, i) => x?.id === id && i < s.inventory.size());
    if (slot < 0) return this.msg(pid, `You have no ${itemDef(id).name.toLowerCase()}s left.`, 'warn');
    this.useSlot(pid, slot);
  }

  unequip(pid: number, slot: EquipSlot): void {
    const s = this.sessions.get(pid);
    if (!s) return;
    const st = s.inventory.equipment[slot];
    if (!st) return;
    if (slot === 'backpack') {
      const used = s.inventory.slots.filter(Boolean).length;
      if (used + 1 > 8) return this.msg(pid, 'Empty your backpack before taking it off.', 'warn');
    }
    s.inventory.equipment[slot] = null;
    const left = s.inventory.add(st.id, st.qty);
    if (left > 0) {
      // undo the partial move
      s.inventory.removeById(st.id, st.qty - left);
      s.inventory.equipment[slot] = st;
      return this.msg(pid, 'Your backpack is full.', 'warn');
    }
    this.refreshStats(s);
    this.events.emit({ type: 'inventoryChanged', to: pid });
    this.events.emit({ type: 'equipmentChanged', id: pid });
  }

  dropSlot(pid: number, slot: number): void {
    const s = this.sessions.get(pid);
    if (!s) return;
    const p = s.player;
    const st = s.inventory.slots[slot];
    if (!st || p.dead) return;
    s.inventory.slots[slot] = null;
    this.dropBag(p.x, p.y, p.z, [{ ...st }]);
    this.msg(pid, `You drop ${describeStack(st)}.`, 'info');
    this.events.emit({ type: 'inventoryChanged', to: pid });
  }

  /** Furthest you can throw an item onto the ground. */
  static readonly THROW_RANGE = 7;
  /** Furniture items can be put on top of (depot lockers, tables, counters, crates, barrels). */
  static readonly SURFACES: ReadonlySet<number> = new Set([Obj.Locker, Obj.Table, Obj.Counter, Obj.Crate, Obj.Barrel]);

  /**
   * Throws an item from the backpack (a slot index) or from an equipment slot
   * onto a tile you can see, like dragging it out of the backpack in the
   * classic client. `qty` throws part of a stack.
   */
  throwItem(pid: number, from: number | EquipSlot, x: number, y: number, qty?: number): void {
    const s = this.sessions.get(pid);
    if (!s) return;
    const p = s.player;
    if (p.dead || !this.world.inBounds(x, y)) return;
    if (chebyshev(p.x, p.y, x, y) > Game.THROW_RANGE) return this.msg(pid, 'That is too far away.', 'warn');
    const onTop = Game.SURFACES.has(this.world.getObj(x, y, p.z));
    if (!this.world.isWalkable(x, y, p.z) && !onTop) return this.msg(pid, 'There is not enough room.', 'warn');
    if (!this.world.lineOfSight(p.x, p.y, x, y, p.z) && !(onTop && chebyshev(p.x, p.y, x, y) <= 1)) return this.msg(pid, 'You cannot throw there.', 'warn');
    const inv = s.inventory;
    let stack: ItemStack | null;
    if (typeof from === 'number') {
      stack = from >= 0 && from < inv.size() ? inv.slots[from] : null;
    } else {
      stack = inv.equipment[from] ?? null;
    }
    if (!stack) return;
    const n = Math.max(1, Math.min(stack.qty, Math.floor(qty ?? stack.qty)));
    const thrown: ItemStack = { id: stack.id, qty: n };
    if (typeof from === 'number') inv.removeFromSlot(from, n);
    else {
      if (n >= stack.qty) inv.equipment[from] = null;
      else stack.qty -= n;
      if (from === 'backpack') {
        // anything that no longer fits falls out with it
        for (let i = inv.size(); i < inv.slots.length; i++) {
          const st = inv.slots[i];
          if (st) {
            inv.slots[i] = null;
            this.dropBag(x, y, p.z, [st]);
          }
        }
      }
      this.refreshStats(s);
      this.events.emit({ type: 'equipmentChanged', id: pid });
    }
    this.dropBag(x, y, p.z, [thrown]);
    p.faceTowards(x, y);
    this.events.emit({ type: 'inventoryChanged', to: pid });
  }

  /** Moves the top item of a ground pile to another tile (like dragging it in classic Tibia). */
  moveBagItem(pid: number, bagId: number, x: number, y: number, qty?: number): void {
    const s = this.sessions.get(pid);
    if (!s) return;
    const p = s.player;
    const b = this.bags.find((it) => it.id === bagId);
    if (p.dead || !b || b.z !== p.z || !this.world.inBounds(x, y)) return;
    if (b.x === x && b.y === y) return;
    if (chebyshev(p.x, p.y, b.x, b.y) > 1) return this.msg(pid, 'You need to stand next to it.', 'warn');
    if (chebyshev(p.x, p.y, x, y) > Game.THROW_RANGE) return this.msg(pid, 'That is too far away.', 'warn');
    const onTop = Game.SURFACES.has(this.world.getObj(x, y, p.z));
    if (!this.world.isWalkable(x, y, p.z) && !onTop) return this.msg(pid, 'There is not enough room.', 'warn');
    if (!this.world.lineOfSight(p.x, p.y, x, y, p.z) && !(onTop && chebyshev(p.x, p.y, x, y) <= 1)) return this.msg(pid, 'You cannot throw there.', 'warn');
    const top = b.items[b.items.length - 1];
    if (!top) return;
    const n = Math.max(1, Math.min(top.qty, Math.floor(qty ?? top.qty)));
    top.qty -= n;
    if (top.qty <= 0) b.items.pop();
    if (!b.items.length) {
      const i = this.bags.indexOf(b);
      if (i >= 0) this.bags.splice(i, 1);
      this.events.emit({ type: 'bagRemoved', bagId: b.id });
    }
    this.dropBag(x, y, p.z, [{ id: top.id, qty: n }]);
    p.faceTowards(x, y);
  }

  /** Moves or swaps two backpack slots; equal stackable items merge. */
  moveSlot(pid: number, from: number, to: number): void {
    const s = this.sessions.get(pid);
    if (!s || from === to) return;
    const inv = s.inventory;
    const n = inv.size();
    if (from < 0 || to < 0 || from >= n || to >= n) return;
    const a = inv.slots[from];
    if (!a) return;
    const b = inv.slots[to];
    const d = itemDef(a.id);
    if (b && b.id === a.id && d.stackable && b.qty < d.maxStack) {
      const move = Math.min(a.qty, d.maxStack - b.qty);
      b.qty += move;
      a.qty -= move;
      if (a.qty <= 0) inv.slots[from] = null;
    } else {
      inv.slots[from] = b;
      inv.slots[to] = a;
    }
    this.events.emit({ type: 'inventoryChanged', to: pid });
  }

  /** Dragging a backpack item onto an equipment slot: equips it if it belongs there. */
  equipTo(pid: number, from: number, slot: EquipSlot): void {
    const s = this.sessions.get(pid);
    const st = s?.inventory.slots[from];
    if (!s || !st) return;
    const want = equipSlotFor(itemDef(st.id));
    if (want !== slot) return this.msg(pid, `${itemDef(st.id).name} does not go there.`, 'warn');
    this.useSlot(pid, from);
  }

  /** Whether worn equipment shows on the character (off = classic outfit-only look). */
  setShowGear(pid: number, on: boolean): void {
    const s = this.sessions.get(pid);
    if (!s) return;
    s.player.showGear = !!on;
    s.wantsSave = true;
    this.events.emit({ type: 'equipmentChanged', id: pid });
  }

  setOutfit(pid: number, o: Outfit): boolean {
    const p = this.getPlayer(pid);
    if (!p || !isOutfit(o)) return false;
    p.outfit = { ...o };
    this.events.emit({ type: 'outfitChanged', id: pid });
    return true;
  }

  private pickupBag(s: Session, b: GroundBag): void {
    const got: ItemStack[] = [];
    let full = false;
    let heavy = false;
    for (const it of b.items) {
      const d = itemDef(it.id);
      const capLeft = s.player.capacity - s.inventory.weight();
      const canCarry = d.weight > 0 ? Math.max(0, Math.floor(capLeft / d.weight)) : it.qty;
      const want = Math.min(it.qty, canCarry);
      if (want < it.qty) heavy = true;
      const left = want > 0 ? s.inventory.add(it.id, want) : 0;
      const taken = want - left;
      if (taken > 0) got.push({ id: it.id, qty: taken });
      if (left > 0) full = true;
      it.qty -= taken;
    }
    b.items = b.items.filter((i) => i.qty > 0);
    if (got.length) {
      this.msg(s.id, `You picked up ${got.map(describeStack).join(', ')}.`, 'loot');
      this.events.emit({ type: 'inventoryChanged', to: s.id });
    }
    if (heavy) this.msg(s.id, 'Some of it is too heavy for you to carry.', 'warn');
    else if (full) this.msg(s.id, 'Your backpack is full.', 'warn');
    if (!b.items.length) {
      const i = this.bags.indexOf(b);
      if (i >= 0) this.bags.splice(i, 1);
      this.events.emit({ type: 'bagRemoved', bagId: b.id });
    }
  }

  // ---------------------------------------------------------------- depot

  closeDepot(pid: number): void {
    const s = this.sessions.get(pid);
    if (!s || !s.depotOpen) return;
    s.depotOpen = null;
    this.events.emit({ type: 'depotChanged', to: pid });
  }

  depositItem(pid: number, slot: number): void {
    const s = this.sessions.get(pid);
    if (!s || !s.depotOpen) return;
    const st = s.inventory.slots[slot];
    if (!st) return;
    const left = addToList(s.depot, st.id, st.qty);
    if (left === st.qty) return this.msg(pid, 'Your depot is full.', 'warn');
    s.inventory.removeFromSlot(slot, st.qty - left);
    s.wantsSave = true;
    this.events.emit({ type: 'inventoryChanged', to: pid });
    this.events.emit({ type: 'depotChanged', to: pid });
  }

  withdrawItem(pid: number, index: number): void {
    const s = this.sessions.get(pid);
    if (!s || !s.depotOpen) return;
    const st = s.depot[index];
    if (!st) return;
    const d = itemDef(st.id);
    const capLeft = s.player.capacity - s.inventory.weight();
    const canCarry = d.weight > 0 ? Math.min(st.qty, Math.floor(capLeft / d.weight)) : st.qty;
    if (canCarry <= 0) return this.msg(pid, 'This object is too heavy for you to carry.', 'warn');
    const left = s.inventory.add(st.id, canCarry);
    const taken = canCarry - left;
    if (taken <= 0) return this.msg(pid, 'Your backpack is full.', 'warn');
    st.qty -= taken;
    if (st.qty <= 0) s.depot[index] = null;
    s.wantsSave = true;
    this.events.emit({ type: 'inventoryChanged', to: pid });
    this.events.emit({ type: 'depotChanged', to: pid });
  }

  // ---------------------------------------------------------------- player trade

  tradeOf(pid: number): Trade | null {
    return this.trades.find((t) => t.a === pid || t.b === pid) ?? null;
  }

  requestTrade(pid: number, otherId: number): void {
    const a = this.getPlayer(pid), b = this.getPlayer(otherId);
    if (!a || !b || pid === otherId) return;
    if (this.dist(a, b) > TRADE_RANGE) return this.msg(pid, `${b.name} is too far away to trade.`, 'warn');
    if (this.tradeOf(pid)) return this.msg(pid, 'You are already trading.', 'warn');
    if (this.tradeOf(otherId)) return this.msg(pid, `${b.name} is busy trading with someone else.`, 'warn');
    this.trades.push({ a: pid, b: otherId, offers: { [pid]: { slots: [], gold: 0, accepted: false }, [otherId]: { slots: [], gold: 0, accepted: false } } });
    this.msg(pid, `You invite ${b.name} to trade.`, 'trade');
    this.msg(otherId, `${a.name} wants to trade with you.`, 'trade');
    this.events.emit({ type: 'tradeChanged', to: pid });
    this.events.emit({ type: 'tradeChanged', to: otherId });
  }

  /** Fight stance and chase/stand, like the classic combat controls. */
  setFightMode(pid: number, mode: FightMode, chase: boolean): void {
    const p = this.getPlayer(pid);
    if (!p || !(mode in FIGHT_MODE)) return;
    p.fightMode = mode;
    p.chase = chase;
  }

  /** Puts a backpack item on the table for another player, opening the trade first if needed. */
  offerItemTo(pid: number, otherId: number, slot: number): void {
    const s = this.sessions.get(pid);
    if (!s || !s.inventory.slots[slot]) return;
    let t = this.tradeOf(pid);
    if (t && t.a !== otherId && t.b !== otherId) return this.msg(pid, 'You are already trading with someone else.', 'warn');
    if (!t) {
      this.requestTrade(pid, otherId);
      t = this.tradeOf(pid);
      if (!t) return;
    }
    const mine = t.offers[pid];
    if (mine.slots.includes(slot)) return;
    this.setTradeOffer(pid, [...mine.slots, slot], mine.gold);
  }

  /** Sets what you offer: backpack slot indices plus an amount of gold. Resets both acceptances. */
  setTradeOffer(pid: number, slots: number[], gold: number): void {
    const t = this.tradeOf(pid);
    const s = this.sessions.get(pid);
    if (!t || !s) return;
    const valid = [...new Set(slots)].filter((i) => Number.isInteger(i) && i >= 0 && i < s.inventory.size() && s.inventory.slots[i] && s.inventory.slots[i]!.id !== 'gold').slice(0, 12);
    const g = Math.max(0, Math.min(Math.floor(gold) || 0, s.inventory.count('gold')));
    t.offers[pid] = { slots: valid, gold: g, accepted: false };
    const other = t.a === pid ? t.b : t.a;
    t.offers[other].accepted = false;
    this.events.emit({ type: 'tradeChanged', to: t.a });
    this.events.emit({ type: 'tradeChanged', to: t.b });
  }

  acceptTrade(pid: number): void {
    const t = this.tradeOf(pid);
    if (!t) return;
    t.offers[pid].accepted = true;
    if (t.offers[t.a].accepted && t.offers[t.b].accepted) this.completeTrade(t);
    else {
      this.events.emit({ type: 'tradeChanged', to: t.a });
      this.events.emit({ type: 'tradeChanged', to: t.b });
    }
  }

  cancelTrade(pid: number, why = 'cancelled the trade'): void {
    const t = this.tradeOf(pid);
    if (!t) return;
    this.trades.splice(this.trades.indexOf(t), 1);
    const name = this.getPlayer(pid)?.name ?? 'Your partner';
    for (const id of [t.a, t.b]) {
      if (!this.sessions.has(id)) continue;
      this.msg(id, id === pid ? 'Trade cancelled.' : `${name} ${why}. Trade cancelled.`, 'trade');
      this.events.emit({ type: 'tradeChanged', to: id });
    }
  }

  private completeTrade(t: Trade): void {
    const sa = this.sessions.get(t.a), sb = this.sessions.get(t.b);
    if (!sa || !sb) return this.cancelTrade(t.a, 'left');
    const take = (s: Session, o: TradeOffer): ItemStack[] | null => {
      const items: ItemStack[] = [];
      for (const i of o.slots) {
        const st = s.inventory.slots[i];
        if (!st) return null;
        items.push({ ...st });
      }
      if (s.inventory.count('gold') < o.gold) return null;
      return items;
    };
    const ia = take(sa, t.offers[t.a]), ib = take(sb, t.offers[t.b]);
    if (!ia || !ib) return this.cancelTrade(t.a, 'no longer has the offered items');
    const weight = (items: ItemStack[]) => items.reduce((n, it) => n + itemDef(it.id).weight * it.qty, 0);
    // dry-run space and capacity checks on copies
    const fits = (s: Session, give: ItemStack[], giveGold: number, get: ItemStack[], getGold: number, giveSlots: number[]): boolean => {
      const copy = new Inventory();
      copy.load(s.inventory.toJSON());
      for (const i of giveSlots) copy.slots[i] = null;
      copy.removeById('gold', giveGold);
      for (const it of get) if (copy.add(it.id, it.qty) > 0) return false;
      if (getGold > 0 && copy.add('gold', getGold) > 0) return false;
      return copy.weight() <= s.player.capacity || weight(get) <= weight(give);
    };
    const oa = t.offers[t.a], ob = t.offers[t.b];
    if (!fits(sa, ia, oa.gold, ib, ob.gold, oa.slots)) return this.cancelTrade(t.a, 'has no room or capacity left');
    if (!fits(sb, ib, ob.gold, ia, oa.gold, ob.slots)) return this.cancelTrade(t.b, 'has no room or capacity left');
    for (const i of oa.slots) sa.inventory.slots[i] = null;
    for (const i of ob.slots) sb.inventory.slots[i] = null;
    sa.inventory.removeById('gold', oa.gold);
    sb.inventory.removeById('gold', ob.gold);
    for (const it of ib) sa.inventory.add(it.id, it.qty);
    for (const it of ia) sb.inventory.add(it.id, it.qty);
    if (ob.gold) sa.inventory.add('gold', ob.gold);
    if (oa.gold) sb.inventory.add('gold', oa.gold);
    this.trades.splice(this.trades.indexOf(t), 1);
    sa.wantsSave = sb.wantsSave = true;
    for (const s of [sa, sb]) {
      this.msg(s.id, 'Trade completed.', 'trade');
      this.events.emit({ type: 'tradeChanged', to: s.id });
      this.events.emit({ type: 'inventoryChanged', to: s.id });
    }
  }

  tradeView(pid: number): TradeView | null {
    const t = this.tradeOf(pid);
    if (!t) return null;
    const other = t.a === pid ? t.b : t.a;
    const s = this.sessions.get(pid), so = this.sessions.get(other);
    if (!s || !so) return null;
    const mine = t.offers[pid], theirs = t.offers[other];
    const itemsOf = (ss: Session, slots: number[]) => slots.map((i) => ss.inventory.slots[i]).filter((x): x is ItemStack => !!x).map((x) => ({ ...x }));
    return {
      partnerName: so.player.name,
      mine: { items: itemsOf(s, mine.slots), slots: [...mine.slots], gold: mine.gold, accepted: mine.accepted },
      theirs: { items: itemsOf(so, theirs.slots), gold: theirs.gold, accepted: theirs.accepted },
    };
  }

  // ---------------------------------------------------------------- dialogue

  private openDialogue(s: Session, n: Npc): void {
    const def = NPCS[n.key];
    s.dialogue = { npcId: n.id, npcKey: n.key, npcName: n.name, page: 'root', text: (def?.greeting ?? 'Hello.').replace('{name}', s.player.name) };
    this.events.emit({ type: 'dialogueOpened', npcId: n.id, to: s.id });
  }

  closeDialogue(pid: number): void {
    const s = this.sessions.get(pid);
    if (!s || !s.dialogue) return;
    s.dialogue = null;
    this.events.emit({ type: 'dialogueClosed', to: pid });
  }

  dialogueAction(pid: number, action: string): void {
    const s = this.sessions.get(pid);
    const d = s?.dialogue;
    if (!s || !d) return;
    const npc = NPCS[d.npcKey];
    const inv = s.inventory;
    const p = s.player;
    const [verb, ...rest] = action.split(':');
    const arg = rest[0] ?? '';
    const arg2 = rest[1];
    const quest = QUESTS.find((q) => q.id === rest.join(':') || q.id === arg);

    switch (verb) {
      case 'bye':
        this.msg(pid, `${d.npcName}: Farewell, ${p.name}.`, 'npc');
        this.closeDialogue(pid);
        return;
      case 'page': {
        const page = rest.join(':') as DialogueState['page'];
        d.page = page;
        if (page === 'root') d.text = 'Anything else?';
        else if (page === 'trade') d.text = 'Have a look at my wares.';
        else if (page === 'bank') d.text = `Your balance is ${s.bank} gold.`;
        else if (page === 'spells') d.text = 'Choose the words you wish to learn.';
        else if (quest) d.text = quest.offer;
        break;
      }
      case 'accept':
        if (quest && (!quest.minLevel || p.level >= quest.minLevel) && s.quests.accept(quest.id)) {
          d.text = `Good. ${quest.progress.replace('still ', '')}`;
          this.msg(pid, `Quest started: "${quest.title}" — slay ${quest.count} ${quest.targetName}.`, 'quest');
          this.events.emit({ type: 'questChanged', to: pid });
          s.wantsSave = true;
        }
        d.page = 'root';
        break;
      case 'progress':
        if (quest) d.text = quest.progress;
        break;
      case 'turnin':
        if (quest && s.quests.get(quest.id).status === 'ready') {
          const needed = quest.rewardItems.filter((r) => r.id !== 'gold');
          if (inv.freeSlots() < needed.length) {
            d.text = 'Your pack is overflowing. Make some room and come back.';
            break;
          }
          s.quests.complete(quest.id);
          for (const r of quest.rewardItems) inv.add(r.id, r.qty);
          d.text = quest.complete;
          this.msg(pid, `Quest complete: "${quest.title}". Reward: ${quest.rewardExp} exp, ${quest.rewardItems.map(describeStack).join(', ')}.`, 'quest');
          this.grantExp(s, quest.rewardExp, p.id, 'for completing a quest');
          this.events.emit({ type: 'questChanged', to: pid });
          this.events.emit({ type: 'inventoryChanged', to: pid });
          s.wantsSave = true;
        }
        break;
      case 'buy': {
        const entry = npc?.sells?.find((x) => x.id === arg);
        if (!entry) break;
        const d2 = itemDef(entry.id);
        const qty = Math.max(1, Math.min(100, Math.floor(Number(arg2 ?? 1)) || 1));
        const cost = entry.price * qty;
        if (inv.count('gold') < cost) { d.text = "You'll need more coin than that."; break; }
        if (inv.weight() + d2.weight * qty > p.capacity) { d.text = "You couldn't carry that much."; break; }
        if (!inv.canFit(entry.id, qty)) { d.text = 'Your backpack is full.'; break; }
        inv.removeById('gold', cost);
        inv.add(entry.id, qty);
        d.text = `${qty > 1 ? `${qty} ${d2.name.toLowerCase()}s` : `One ${d2.name.toLowerCase()}`} for ${cost} gold. Anything else?`;
        this.events.emit({ type: 'inventoryChanged', to: pid });
        break;
      }
      case 'sell': {
        if (!npc?.buys?.includes(arg)) break;
        const have = inv.count(arg);
        const qty = Math.min(have, Math.max(1, Math.floor(Number(arg2 ?? have)) || have));
        if (qty <= 0) break;
        const value = buyPrice(arg) * qty;
        inv.removeById(arg, qty);
        inv.add('gold', value);
        d.text = `${value} gold for ${qty} ${itemDef(arg).name.toLowerCase()}${qty > 1 ? 's' : ''}.`;
        this.msg(pid, `You sold ${qty} ${itemDef(arg).name.toLowerCase()}${qty > 1 ? 's' : ''} for ${value} gold.`, 'loot');
        this.events.emit({ type: 'inventoryChanged', to: pid });
        break;
      }
      case 'sellLoot': {
        let value = 0;
        for (const id of npc?.buys ?? []) {
          if (itemDef(id).kind !== 'material') continue;
          const have = inv.count(id);
          if (!have) continue;
          inv.removeById(id, have);
          value += buyPrice(id) * have;
        }
        if (value > 0) {
          inv.add('gold', value);
          d.text = `A fine haul. ${value} gold for the lot.`;
          this.msg(pid, `You sold your loot for ${value} gold.`, 'loot');
          this.events.emit({ type: 'inventoryChanged', to: pid });
        }
        break;
      }
      case 'deposit': {
        if (!npc?.bank) break;
        const have = inv.count('gold');
        const amt = arg === 'all' ? have : Math.min(have, Math.max(0, Math.floor(Number(arg)) || 0));
        if (amt <= 0) break;
        inv.removeById('gold', amt);
        s.bank += amt;
        s.wantsSave = true;
        d.text = `You deposited ${amt} gold. Your balance is ${s.bank} gold.`;
        this.events.emit({ type: 'inventoryChanged', to: pid });
        break;
      }
      case 'withdraw': {
        if (!npc?.bank) break;
        const amt = arg === 'all' ? s.bank : Math.min(s.bank, Math.max(0, Math.floor(Number(arg)) || 0));
        if (amt <= 0) break;
        if (!inv.canFit('gold', amt)) { d.text = 'You have no room for that much gold.'; break; }
        s.bank -= amt;
        inv.add('gold', amt);
        s.wantsSave = true;
        d.text = `Here are ${amt} gold. Your balance is ${s.bank} gold.`;
        this.events.emit({ type: 'inventoryChanged', to: pid });
        break;
      }
      case 'transfer': {
        if (!npc?.bank) break;
        const amt = Math.min(s.bank, Math.max(0, Math.floor(Number(arg)) || 0));
        const to = arg2 ? this.findPlayerByName(arg2) : null;
        if (!to || to.id === pid) { d.text = 'I know no customer by that name who is in town today.'; break; }
        if (amt <= 0) break;
        s.bank -= amt;
        this.sessions.get(to.id)!.bank += amt;
        d.text = `${amt} gold transferred to ${to.name}.`;
        this.msg(to.id, `${p.name} transferred ${amt} gold to your bank account.`, 'trade');
        s.wantsSave = true;
        break;
      }
      case 'travel': {
        const tr = npc?.travel?.find((x) => x.key === arg);
        const dest = tr ? this.world.destinations[tr.key] : undefined;
        if (!tr || !dest) break;
        if (inv.count('gold') < tr.price) { d.text = 'Passage costs more than you have.'; break; }
        inv.removeById('gold', tr.price);
        this.events.emit({ type: 'inventoryChanged', to: pid });
        this.closeDialogue(pid);
        this.teleport(p, dest.x, dest.y, dest.z);
        this.msg(pid, `You sail to ${tr.name}.`, 'info');
        return;
      }
      case 'learn': {
        if (!isSpellId(arg) || !npc?.spells?.includes(arg)) break;
        const sp = SPELLS[arg];
        if (s.spells.has(arg)) { d.text = 'You already know those words.'; break; }
        if (!sp.vocations.includes(p.vocation)) { d.text = `That spell is not for ${VOCATIONS[p.vocation].name.toLowerCase()}s.`; break; }
        if (p.level < sp.level) { d.text = `Come back when you have reached level ${sp.level}.`; break; }
        if (inv.count('gold') < sp.price) { d.text = `That knowledge costs ${sp.price} gold.`; break; }
        inv.removeById('gold', sp.price);
        s.spells.add(arg);
        s.wantsSave = true;
        d.text = `Repeat after me: "${sp.words}". You have learned ${sp.name}.`;
        this.msg(pid, `You learned ${sp.name} ("${sp.words}").`, 'level');
        this.events.emit({ type: 'inventoryChanged', to: pid });
        this.events.emit({ type: 'spellsChanged', to: pid });
        break;
      }
    }
    this.events.emit({ type: 'dialogueOpened', npcId: d.npcId, to: pid });
  }

  // ================================================================ persistence

  serialize(pid: number): SaveData {
    const s = this.sessions.get(pid);
    if (!s) throw new Error('No such player');
    const p = s.player;
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      player: {
        name: p.name, vocation: p.vocation, x: p.x, y: p.y, z: p.z, level: p.level, exp: p.exp,
        hp: Math.round(p.hp), mana: Math.round(p.mana), facing: p.facing, outfit: { ...p.outfit }, home: p.home, showGear: p.showGear,
      },
      inventory: s.inventory.toJSON(),
      quests: JSON.parse(JSON.stringify(s.quests.state)),
      depot: s.depot.map((x) => (x ? { ...x } : null)),
      bank: s.bank,
      spells: [...s.spells],
      chests: [...s.chests],
      lostItems: s.lostItems.map((x) => ({ ...x })),
      pvp: { secure: p.secure, whiteSkullUntil: p.whiteSkullUntil, redSkullUntil: p.redSkullUntil, unjustKills: [...p.unjustKills] },
    };
  }

  applySave(pid: number, raw: unknown, opts: { resetWorld?: boolean } = {}): boolean {
    const s = this.sessions.get(pid);
    if (!s) return false;
    const m = migrateSave(raw);
    if (typeof m === 'string') return false;
    const data = m.data;
    if (!isSaveData(data)) return false;
    if (opts.resetWorld) this.resetWorldState();
    const p = s.player;
    resetPlayerState(p);
    this.closeDialogue(pid);
    this.cancelTrade(pid, 'left');
    s.depotOpen = null;
    p.vocation = isVocation(data.player.vocation) ? data.player.vocation : 'knight';
    p.level = Math.max(1, Math.floor(data.player.level));
    p.exp = Math.max(expForLevel(p.level), Math.floor(data.player.exp));
    s.inventory.load(data.inventory);
    s.quests.load(data.quests);
    s.depot = new Array(DEPOT_SLOTS).fill(null);
    (data.depot ?? []).slice(0, DEPOT_SLOTS).forEach((x, i) => { if (x && typeof x.id === 'string') { try { itemDef(x.id); s.depot[i] = { id: x.id, qty: Math.max(1, Math.floor(x.qty)) }; } catch { /* drop */ } } });
    s.bank = Math.max(0, Math.floor(data.bank ?? 0));
    s.spells = new Set(startingSpells());
    for (const id of data.spells ?? []) if (isSpellId(id)) s.spells.add(id);
    s.chests = new Set((data.chests ?? []).filter((c) => typeof c === 'string'));
    this.refreshStats(s);
    p.hp = clampNum(data.player.hp, 1, p.maxHp);
    p.mana = clampNum(data.player.mana, 0, p.maxMana);
    const z = typeof data.player.z === 'number' ? data.player.z : 0;
    let tgt = { x: data.player.x, y: data.player.y, z };
    if (!this.world.inBounds(tgt.x, tgt.y) || !this.world.isWalkable(tgt.x, tgt.y, z) || data.version === 1) tgt = { ...this.world.temple };
    const f = this.freeTileNear(tgt.x, tgt.y, tgt.z);
    p.placeAt(f.x, f.y, f.z);
    p.facing = Number.isFinite(data.player.facing) ? data.player.facing : 0;
    p.outfit = isOutfit(data.player.outfit) ? { ...data.player.outfit } : { ...DEFAULT_OUTFIT };
    p.home = typeof data.player.home === 'string' ? data.player.home : 'Thornvale';
    p.showGear = data.player.showGear !== false;
    const pv = data.pvp ?? {};
    p.secure = pv.secure !== false;
    p.whiteSkullUntil = finiteOr0(pv.whiteSkullUntil);
    p.redSkullUntil = finiteOr0(pv.redSkullUntil);
    p.unjustKills = Array.isArray(pv.unjustKills) ? pv.unjustKills.filter((t) => typeof t === 'number' && Number.isFinite(t)).slice(-20) : [];
    this.events.emit({ type: 'outfitChanged', id: pid });
    this.events.emit({ type: 'equipmentChanged', id: pid });
    this.events.emit({ type: 'teleport', id: pid });
    s.lostItems = data.lostItems ?? [];
    for (const it of m.restored) {
      const left = addToList(s.depot, it.id, it.qty);
      if (left > 0) s.lostItems.push({ id: it.id, qty: left });
      else this.msg(pid, `${describeStack(it)} from an older version of the game is waiting in your depot.`, 'loot');
    }
    if (m.lost.length) this.msg(pid, `Some of your items no longer exist in this version. They are kept safe and will come back if they return.`, 'warn');
    this.events.emit({ type: 'gameLoaded', to: pid });
    return true;
  }

  /** Restarts one character from level 1 with a new vocation (single-player "New Game"). */
  newCharacter(pid: number, vocation: Vocation = 'knight'): void {
    const s = this.sessions.get(pid);
    if (!s) return;
    this.resetWorldState();
    const p = s.player;
    resetPlayerState(p);
    this.closeDialogue(pid);
    s.depotOpen = null;
    p.vocation = vocation;
    p.level = 1;
    p.exp = 0;
    p.home = 'Thornvale';
    s.inventory = new Inventory();
    giveStarterKit(s.inventory, vocation);
    s.quests.reset();
    s.depot = new Array(DEPOT_SLOTS).fill(null);
    s.bank = 0;
    s.spells = new Set(startingSpells());
    s.chests = new Set();
    this.refreshStats(s);
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    const t = this.freeTileNear(this.world.playerSpawn.x, this.world.playerSpawn.y, this.world.playerSpawn.z);
    p.placeAt(t.x, t.y, t.z);
    p.facing = 0;
    p.outfit = { ...DEFAULT_OUTFIT, type: vocation === 'paladin' ? 'ranger' : vocation === 'knight' ? 'knight' : 'mage' };
    this.events.emit({ type: 'outfitChanged', id: pid });
    this.events.emit({ type: 'equipmentChanged', id: pid });
    this.events.emit({ type: 'teleport', id: pid });
    this.events.emit({ type: 'gameLoaded', to: pid });
  }

  private resetWorldState(): void {
    for (const b of this.bags) this.events.emit({ type: 'bagRemoved', bagId: b.id });
    this.bags.length = 0;
    for (const e of this.enemies) {
      e.placeAt(e.spawnX, e.spawnY, e.spawnZ);
      e.homeX = e.spawnX;
      e.homeY = e.spawnY;
      e.hp = e.maxHp;
      e.dead = false;
      e.state = 'idle';
      e.attackTimer = 0;
      e.targetId = null;
      e.damageBy.clear();
    }
  }

  msg(to: number, text: string, kind: MessageKind = 'info'): void {
    this.events.emit({ type: 'message', text, kind, to });
  }
}

const BUFF_FADE: Record<(typeof BUFF_NAMES)[number], string> = {
  haste: 'Your haste wears off.', magicShield: 'Your magic shield fades.', light: 'Your light fades.',
  berserk: 'Your fury subsides.', bullseye: 'Your eagle eye fades.', mastermind: 'Your thoughts lose their clarity.',
};

const BUFF_START: Record<'berserk' | 'bullseye' | 'mastermind', string> = {
  berserk: 'Fury burns in your veins: your melee blows hit harder for 10 minutes.',
  bullseye: 'Your eye grows keen: your shots hit harder and truer for 10 minutes.',
  mastermind: 'Your mind sharpens: your spells hit harder for 10 minutes.',
};

function resetPlayerState(p: Player): void {
  p.dead = false;
  p.targetId = null;
  p.pending = null;
  p.path = [];
  p.spellCooldowns = {};
  p.groupCooldowns = { attack: 0, heal: 0, support: 0, potion: 0 };
  p.buffs = emptyBuffs();
  p.attackTimer = 0;
  p.sinceCombat = 99;
  p.pzLock = 0;
  p.attackedBy.clear();
  p.secure = true;
  p.whiteSkullUntil = 0;
  p.redSkullUntil = 0;
  p.unjustKills = [];
}

/** Each vocation starts with gear it can actually use. */
export function giveStarterKit(inv: Inventory, voc: Vocation = 'knight'): void {
  const eq = inv.equipment;
  eq.backpack = { id: 'bag', qty: 1 };
  eq.armor = { id: 'leather_armor', qty: 1 };
  eq.legs = { id: 'leather_legs', qty: 1 };
  eq.feet = { id: 'leather_boots', qty: 1 };
  eq.head = { id: 'leather_helmet', qty: 1 };
  switch (voc) {
    case 'knight':
      eq.weapon = { id: 'short_sword', qty: 1 };
      eq.shield = { id: 'wooden_shield', qty: 1 };
      break;
    case 'paladin':
      eq.weapon = { id: 'spear', qty: 5 };
      eq.shield = { id: 'wooden_shield', qty: 1 };
      inv.add('hunting_bow', 1);
      inv.add('arrow', 60);
      break;
    case 'sorcerer':
      eq.weapon = { id: 'wand_of_sparks', qty: 1 };
      eq.shield = { id: 'apprentice_book', qty: 1 };
      break;
    case 'druid':
      eq.weapon = { id: 'rod_of_frost', qty: 1 };
      eq.shield = { id: 'apprentice_book', qty: 1 };
      break;
  }
  inv.add('health_potion', 4);
  inv.add('mana_potion', voc === 'knight' ? 2 : 5);
  inv.add('gold', 40);
}

/** "a rat", "an orc". */
/** The round area of runes and area spells: a circle of the given radius in tiles. */
export function inAreaShape(dx: number, dy: number, radius: number): boolean {
  return dx * dx + dy * dy <= radius * radius + radius;
}

export function article(name: string): string {
  const n = name.toLowerCase();
  return `${/^[aeiou]/.test(n) ? 'an' : 'a'} ${n}`;
}

export function describeStack(s: ItemStack): string {
  const d = itemDef(s.id);
  if (d.id === 'gold') return `${s.qty} gold`;
  return s.qty > 1 ? `${s.qty} ${d.name.toLowerCase()}s` : article(d.name);
}

function finiteOr0(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function clampNum(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : hi;
  return Math.max(lo, Math.min(hi, n));
}

export function isSaveData(d: unknown): d is SaveData {
  if (!d || typeof d !== 'object') return false;
  const s = d as Partial<SaveData>;
  return (
    typeof s.version === 'number' && s.version >= 1 && s.version <= SAVE_VERSION &&
    !!s.player &&
    typeof s.player.x === 'number' &&
    typeof s.player.y === 'number' &&
    typeof s.player.level === 'number' &&
    typeof s.player.exp === 'number' &&
    !!s.inventory &&
    Array.isArray(s.inventory.slots) &&
    !!s.inventory.equipment &&
    !!s.quests &&
    typeof s.quests === 'object'
  );
}

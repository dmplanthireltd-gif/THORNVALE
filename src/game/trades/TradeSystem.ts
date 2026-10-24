import type { Game, Session } from '../Game';
import { chebyshev } from '../core/types';
import { itemDef, isItem, type ItemDef } from '../inventory/items';
import type { DialogueOption } from '../npc/dialogue';
import { NPCS } from '../npc/npcs';
import type { Npc } from '../npc/Npc';
import { currentActivity, MOVING_ACTIVITIES, type Activity } from '../gathering/activity';
import { Obj } from '../world/WorldMap';
import { OBSTACLE_KINDS, crossFailChance, RUN_STEP_FACTOR, runDrain, STAMINA_MAX, staminaRegen } from './agility';
import { HERB_BY_ID, HERB_DEPLETE, HERB_REGROW, PICK_INTERVAL, pickChance, VIGOUR_POTION, VIGOUR_STAMINA } from './herblore';
import { obstaclePath, tileKey, type Obstacle, type TradeLayout, type TradeTile } from './layout';
import { COMPOST, COMPOST_BONUS, FARM_TIME, minutesLeft, parseFarm, PLANT_BY_SEED, SEED_ORDER, stage, TROWEL, type PatchState } from './farming';
import { catchChance, maxTraps, PREY_BY_ID, preyFor, TRAP_FAIL, TRAP_LEASH, TRAP_ROLL, TRAP_TIME, trapFor } from './hunter';
import {
  MASTER_BY_NPC, SLAYER_HELM, SLAYER_HELM_BONUS, SLAYER_REQ, SLAYER_REWARDS, slayerXp, TASK_BY_ID, taskPoints, tasksFor,
  type SlayerKind, type SlayerTask,
} from './slayer';
import { HERBS } from './herblore';
import {
  BOX_RESTOCK, boxLoot, LOCK_TIME, lockChance, LOCKPICK, LOCKPICK_BREAK, MARK_TIERS, PICKPOCKET_TIME, pickpocketChance, rollEach, rollFirst,
  STALL_TIME, stallChance, STALLS,
} from './thieving';
import { SeaSystem } from './SeaSystem';

/**
 * The trade skills of 2026-10-24 inside the game (`Game.trades`): running stamina
 * and agility shortcuts, thieving, herb picking — one place for their timers,
 * their tile and item uses, their dialogue lines, saves and network views.
 * Lives in game/: no DOM, no three.js. Every change goes through Game commands.
 */

/** Something a player is working on for a few seconds (one try, or a loop for herbs). */
export interface TradeWork {
  kind: 'pickpocket' | 'steal' | 'lockpick' | 'herbs' | 'farm' | 'trap';
  x: number;
  y: number;
  z: number;
  timer: number;
  /** Pickpocketing: the NPC. */
  npc?: number;
  /** Farming / hunter: what is being done and to which patch or spot. */
  op?: 'plant' | 'compost' | 'harvest' | 'set' | 'collect' | 'reset';
  ref?: number;
  /** Planting: the seed. */
  seed?: string;
}

/** An agility crossing in progress. */
export interface Crossing {
  ob: number;
  fromA: boolean;
  /** Index of the tile the player is on along the path. */
  i: number;
  /** Tile index where a failed attempt ends (−1 = it will work). */
  failAt: number;
  /** Seconds spent waiting for the far end to clear (someone stands there). */
  wait: number;
}

/** A hunter's trap in the world (never saved: the trap item stays in the pack the whole time). */
export interface HuntTrap {
  spot: number;
  state: 'set' | 'caught' | 'broken';
  /** Seconds to the next catch roll. */
  roll: number;
  prey: string | null;
}

/**
 * Per character (Session.trades). Saved: `run`, the farm patches, the slayer task, points and streak.
 * Not saved: stamina, crossings, work, traps. Unknown saved fields are kept as they were (`extra`).
 */
export interface TradeState {
  stamina: number;
  run: boolean;
  work: TradeWork | null;
  cross: Crossing | null;
  /** Walking to the end of a shortcut to cross it. */
  goCross: { ob: number; fromA: boolean } | null;
  /** Farm patches planted (patch id → seed, wall-clock planting time, compost). */
  farm: Record<string, PatchState>;
  slayer: SlayerTask | null;
  points: number;
  /** Slayer tasks finished in a row (bonus points every 10th and 50th). */
  streak: number;
  traps: HuntTrap[];
  /** Online mirror: farm patches as the server last told (id, seed index, stage 0–3, composted). */
  netFarm: Array<[number, number, number, number]>;
  /** Online mirror: traps as the server last told (spot, 0 set / 1 caught / 2 broken). */
  netTraps: Array<[number, number]>;
  /** Which page of a slayer master's dialogue is open (rewards), per NPC. */
  page: { npc: number; page: 'rewards' } | null;
  /** Saved fields of later updates, kept as they were read. */
  extra: Record<string, unknown>;
}

export function emptyTrades(): TradeState {
  return {
    stamina: STAMINA_MAX, run: false, work: null, cross: null, goCross: null, farm: {}, slayer: null, points: 0, streak: 0, traps: [],
    netFarm: [], netTraps: [], page: null, extra: {},
  };
}

const KNOWN_KEYS = new Set(['run', 'farm', 'slayer', 'points', 'streak']);

function parseTask(raw: unknown): SlayerTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.task !== 'string' || !TASK_BY_ID[r.task] || typeof r.master !== 'string') return null;
  const total = Math.max(1, Math.floor(Number(r.total) || 1));
  const left = Math.max(0, Math.min(total, Math.floor(Number(r.left) || 0)));
  return { task: r.task, master: r.master, left, total };
}

/** Reads a save's `trades` block (anything unreadable becomes the default; unknown fields are kept). */
export function parseTrades(raw: unknown): TradeState {
  const t = emptyTrades();
  if (!raw || typeof raw !== 'object') return t;
  const r = raw as Record<string, unknown>;
  t.run = r.run === true;
  t.farm = parseFarm(r.farm);
  t.slayer = parseTask(r.slayer);
  t.points = Math.max(0, Math.floor(Number(r.points) || 0));
  t.streak = Math.max(0, Math.floor(Number(r.streak) || 0));
  for (const [k, v] of Object.entries(r)) if (!KNOWN_KEYS.has(k)) t.extra[k] = v;
  return t;
}

export function saveTrades(t: TradeState): Record<string, unknown> {
  return {
    ...JSON.parse(JSON.stringify(t.extra)), run: t.run, farm: JSON.parse(JSON.stringify(t.farm)),
    slayer: t.slayer ? { ...t.slayer } : null, points: t.points, streak: t.streak,
  };
}

/** What the own client is told (snapshot `tw`; only when changed). */
export interface TradeView {
  /** Stamina (whole points). */
  st: number;
  /** Running switched on. */
  rn: 0 | 1;
  /** Farm patches: [patch id, seed index (SEED_ORDER), stage 0–3, composted 0/1]. */
  fp?: Array<[number, number, number, number]>;
  /** Traps: [spot id, 0 set / 1 caught / 2 broken]. */
  tp?: Array<[number, number]>;
  /** Slayer: [task id or '', left, total, points, streak]. */
  sl?: [string, number, number, number, number];
}

export function applyTradeView(t: TradeState, v: TradeView): void {
  if (typeof v.st === 'number') t.stamina = Math.max(0, Math.min(STAMINA_MAX, v.st));
  t.run = v.rn === 1;
  if (Array.isArray(v.fp)) t.netFarm = v.fp.filter((e) => Array.isArray(e) && e.length >= 4).map((e) => [e[0], e[1], e[2], e[3]]);
  if (Array.isArray(v.tp)) t.netTraps = v.tp.filter((e) => Array.isArray(e) && e.length >= 2).map((e) => [e[0], e[1]]);
  if (Array.isArray(v.sl)) {
    const [task, left, total, points, streak] = v.sl;
    t.slayer = task && TASK_BY_ID[task] ? { task, master: '', left, total } : null;
    t.points = points;
    t.streak = streak;
  }
}

/** Pet experience a pet morsel gives (before the pet's share). */
export const PET_MORSEL_EXP = 6000;

/** Objects that hold something only for a while (stalls, boxes, herbs, flotsam) → what stands there meanwhile. */
export const TRADE_EMPTY: Partial<Record<Obj, Obj>> = {
  [Obj.TradeStall]: Obj.TradeStallEmpty,
  [Obj.StrongBox]: Obj.StrongBoxOpen,
  [Obj.WildHerbs]: Obj.WildHerbsPicked,
  [Obj.Flotsam]: Obj.FlotsamGone,
};

export class TradeSystem {
  /** Sailing: boats, voyages, salvage and what happens at sea (trades/SeaSystem.ts). */
  readonly sea: SeaSystem;

  constructor(private readonly game: Game) {
    this.sea = new SeaSystem(game, (s, list) => this.give(s, list));
  }

  private get layout(): TradeLayout | null {
    return this.game.world.trades;
  }

  /** What the trade rules see on a tile, if anything. */
  tileAt(x: number, y: number, z: number): TradeTile | null {
    return this.layout?.index.get(tileKey(x, y, z)) ?? null;
  }

  obstacle(i: number): Obstacle | null {
    return this.layout?.obstacles[i] ?? null;
  }

  private level(s: Session, id: 'agility' | 'herblore' | 'thieving' | 'farming' | 'hunter' | 'slayer' | 'sailing'): number {
    return this.game.skillLevel(s, id);
  }

  // ================================================================ every tick

  /** Per player, after movement (Game.updatePlayer). */
  updateSession(s: Session, dt: number): void {
    const t = s.trades;
    const p = s.player;
    if (p.dead) {
      t.work = null;
      t.cross = null;
      t.goCross = null;
      if (p.boat) this.sea.cancel(s);
      return;
    }
    if (p.boat) {
      // at sea: no running, no stamina use; stamina comes back as if resting
      if (t.stamina < STAMINA_MAX) t.stamina = Math.min(STAMINA_MAX, t.stamina + staminaRegen(this.level(s, 'agility')) * dt);
      t.work = null;
      this.sea.update(s, dt);
      if (t.traps.length) this.updateTraps(s, dt);
      return;
    }
    // stamina comes back while not running (half as fast while walking)
    const running = t.run && p.moving && !t.cross;
    if (!running && t.stamina < STAMINA_MAX) t.stamina = Math.min(STAMINA_MAX, t.stamina + staminaRegen(this.level(s, 'agility')) * dt * (p.moving ? 0.5 : 1));
    if (t.cross) this.updateCross(s, dt);
    else if (t.goCross) this.updateGoCross(s);
    this.checkPendingPocket(s);
    if (t.work) this.updateWork(s, dt);
    if (t.traps.length) this.updateTraps(s, dt);
  }

  // ================================================================ movement: running, crossings

  /** While crossing a shortcut the player cannot walk, attack or work. */
  busy(s: Session): boolean {
    return !!s.trades.cross;
  }

  /** Called when a player starts a normal step: running makes it quicker and uses stamina. Returns the step-time factor. */
  onStep(s: Session): number {
    const t = s.trades;
    if (s.player.boat) {
      this.sea.onStep(s);
      return this.sea.stepFactor(s.player);
    }
    if (!t.run || t.cross) return 1;
    if (t.stamina < 1) {
      if (t.stamina >= 0) {
        t.stamina = -1; // remember the warning was given until some breath comes back
        this.game.msg(s.id, 'You are out of breath and slow to a walk.', 'warn');
      }
      return 1;
    }
    t.stamina = Math.max(0, t.stamina - runDrain(this.level(s, 'agility')));
    return RUN_STEP_FACTOR;
  }

  /** Online mirror: may the local player's next step be predicted (not while a crossing moves it)? */
  mayPredict(s: Session): boolean {
    const a = currentActivity(this.game, s.player.id);
    // sailing is steered like walking (predicted); only the shortcut crossings move you by themselves
    return !a || !MOVING_ACTIVITIES.has(a.kind) || a.kind === 'sail';
  }

  /** Online mirror: the step-time factor the server will use for the local player's next step (running). */
  predictFactor(s: Session): number {
    if (s.player.boat) return this.sea.stepFactor(s.player);
    return s.trades.run && s.trades.stamina >= 1 ? RUN_STEP_FACTOR : 1;
  }

  /** Command `run`: switch running on or off. */
  setRunning(s: Session, on: boolean): void {
    if (s.trades.run === on) return;
    s.trades.run = on;
    s.wantsSave = true;
    this.game.msg(s.id, on ? 'You start running. Running uses stamina; it comes back while you walk or rest.' : 'You walk.', 'info');
  }

  /** A shortcut used from beside it: walk onto the nearer end, then cross. */
  private useObstacle(s: Session, ob: Obstacle): void {
    const p = s.player;
    const lvl = this.level(s, 'agility');
    const k = OBSTACLE_KINDS[ob.kind];
    if (lvl < ob.level) return this.game.msg(s.id, `You need agility level ${ob.level} to use this ${k.name}.`, 'warn');
    if (p.z !== ob.z) return;
    const fromA = chebyshev(p.x, p.y, ob.ax, ob.ay) <= chebyshev(p.x, p.y, ob.bx, ob.by);
    const sx = fromA ? ob.ax : ob.bx, sy = fromA ? ob.ay : ob.by;
    if (p.x === sx && p.y === sy) return this.startCross(s, ob, fromA);
    if (chebyshev(p.x, p.y, sx, sy) > 6) return;
    const path = this.game.pathTo(p, sx, sy, false, 2000);
    if (!path) return this.game.msg(s.id, 'There is no way.', 'warn');
    p.path = path;
    s.trades.goCross = { ob: ob.id, fromA };
  }

  private updateGoCross(s: Session): void {
    const p = s.player;
    const g = s.trades.goCross!;
    const ob = this.obstacle(g.ob);
    if (!ob || p.z !== ob.z) { s.trades.goCross = null; return; }
    if (p.moving) return;
    const sx = g.fromA ? ob.ax : ob.bx, sy = g.fromA ? ob.ay : ob.by;
    if (p.x === sx && p.y === sy) {
      s.trades.goCross = null;
      this.startCross(s, ob, g.fromA);
    } else if (!p.path.length) s.trades.goCross = null;
  }

  private startCross(s: Session, ob: Obstacle, fromA: boolean): void {
    const p = s.player;
    const k = OBSTACLE_KINDS[ob.kind];
    const path = obstaclePath(ob, fromA);
    const end = path[path.length - 1];
    if (this.game.isOccupied(end.x, end.y, ob.z, p.id, true)) return this.game.msg(s.id, 'Someone is in the way on the other side.', 'warn');
    p.targetId = null;
    p.path = [];
    p.pending = null;
    this.game.stopAllWork(s);
    const fail = Math.random() < crossFailChance(this.level(s, 'agility'), ob.level);
    s.trades.cross = { ob: ob.id, fromA, i: 0, failAt: fail ? Math.max(1, Math.ceil(path.length / 2) - 1) : -1, wait: 0 };
    this.game.msg(s.id, k.start, 'info');
    this.game.events.emit({ type: 'agility', id: p.id, ob: ob.id, kind: ob.kind, phase: 'start' });
  }

  private updateCross(s: Session, dt: number): void {
    const p = s.player;
    const c = s.trades.cross!;
    const ob = this.obstacle(c.ob);
    if (!ob || p.z !== ob.z) { s.trades.cross = null; return; }
    if (p.moving) return;
    const path = obstaclePath(ob, c.fromA);
    const k = OBSTACLE_KINDS[ob.kind];
    if (c.failAt >= 0 && c.i >= c.failAt) {
      // a slip: back to where you started, a little hurt, no experience
      s.trades.cross = null;
      const start = path[0];
      this.game.teleport(p, start.x, start.y, ob.z);
      this.game.events.emit({ type: 'agility', id: p.id, ob: ob.id, kind: ob.kind, phase: 'fail' });
      this.game.hurtPlayerByEnvironment(s, Math.round(k.hurt[0] + p.maxHp * k.hurt[1]), 'physical', k.fail);
      return;
    }
    if (c.i >= path.length - 1) {
      s.trades.cross = null;
      this.game.msg(s.id, k.done, 'info');
      this.game.events.emit({ type: 'agility', id: p.id, ob: ob.id, kind: ob.kind, phase: 'done' });
      this.game.gainSkill(s, 'agility', ob.xp, p.id);
      return;
    }
    p.targetId = null;
    const next = path[c.i + 1];
    // the far end may have been taken while crossing (a monster waiting for you): wait a moment, then step off beside it
    if (c.i + 1 === path.length - 1 && this.game.isOccupied(next.x, next.y, ob.z, p.id, true)) {
      c.wait += dt;
      if (c.wait < 1.5) return;
      s.trades.cross = null;
      this.game.teleport(p, next.x, next.y, ob.z);
      this.game.msg(s.id, k.done, 'info');
      this.game.events.emit({ type: 'agility', id: p.id, ob: ob.id, kind: ob.kind, phase: 'done' });
      this.game.gainSkill(s, 'agility', ob.xp, p.id);
      return;
    }
    p.beginStep(next.x - p.x, next.y - p.y);
    p.moveDur = k.tileTime;
    c.i++;
  }

  /** Where a save should put a player who is halfway across (the start: never on the water or in the rock). */
  savePosition(s: Session): { x: number; y: number } | null {
    const c = s.trades.cross;
    const ob = c ? this.obstacle(c.ob) : null;
    if (!c || !ob) return this.sea.savePosition(s);
    return c.fromA ? { x: ob.ax, y: ob.ay } : { x: ob.bx, y: ob.by };
  }

  // ================================================================ tiles

  /** Whether a trade tile can be used by the local player (cursor, clicks); null = not a trade tile. */
  usable(s: Session | null, x: number, y: number, z: number): boolean | null {
    const tt = this.tileAt(x, y, z);
    if (!tt) return null;
    const o = this.game.world.getObj(x, y, z);
    switch (tt.t) {
      case 'ob': return true;
      case 'stall': return o === Obj.TradeStall || o === Obj.TradeStallEmpty;
      case 'box': return o === Obj.StrongBox || o === Obj.StrongBoxOpen;
      case 'herb': return o === Obj.WildHerbs && !!s;
      case 'patch': case 'hunt': return !s?.player.boat;
      case 'moor': return true;
      case 'flot': return o === Obj.Flotsam || o === Obj.FlotsamGone;
      default: return null;
    }
  }

  /** A player used a tile (they stand within one tile of it). Returns true when a trade rule took it. */
  useTile(s: Session, x: number, y: number, z: number): boolean {
    const tt = this.tileAt(x, y, z);
    if (!tt) return false;
    const l = this.layout!;
    const o = this.game.world.getObj(x, y, z);
    if (tt.t === 'moor') { this.sea.useMooring(s, l.moorings[tt.i]); return true; }
    if (tt.t === 'flot') { this.sea.useFlotsam(s, tt.i); return true; }
    if (s.player.boat) { this.game.msg(s.id, 'You cannot do that from a boat. Come ashore at a mooring first.', 'info'); return true; }
    switch (tt.t) {
      case 'ob': this.useObstacle(s, l.obstacles[tt.i]); return true;
      case 'stall':
        if (o === Obj.TradeStallEmpty) { this.game.msg(s.id, 'The stall is bare. The keeper will put more out soon.', 'info'); return true; }
        if (o !== Obj.TradeStall) return false;
        return this.startWork(s, 'steal', x, y, z);
      case 'box':
        if (o === Obj.StrongBoxOpen) { this.game.msg(s.id, 'The strongbox hangs open and empty.', 'info'); return true; }
        if (o !== Obj.StrongBox) return false;
        return this.startWork(s, 'lockpick', x, y, z);
      case 'herb':
        if (o !== Obj.WildHerbs) return false;
        return this.startWork(s, 'herbs', x, y, z);
      case 'patch': this.usePatch(s, tt.i); return true;
      case 'hunt': this.useHuntSpot(s, tt.i); return true;
      default: return false;
    }
  }

  // ================================================================ timed work (thieving, herbs)

  private startWork(s: Session, kind: TradeWork['kind'], x: number, y: number, z: number, npc?: number): boolean {
    const p = s.player;
    const l = this.layout!;
    if (kind === 'steal') {
      const st = l.stalls[this.tileAt(x, y, z)!.i];
      const d = STALLS[st.kind];
      if (this.level(s, 'thieving') < d.level) { this.game.msg(s.id, `You need thieving level ${d.level} to steal from a ${d.name}.`, 'warn'); return true; }
      if (s.inventory.freeSlots() === 0) { this.game.msg(s.id, 'Your backpack is full.', 'warn'); return true; }
      this.game.msg(s.id, `You reach for the ${d.name}...`, 'info');
    } else if (kind === 'lockpick') {
      const b = l.boxes[this.tileAt(x, y, z)!.i];
      if (this.level(s, 'thieving') < b.level) { this.game.msg(s.id, `You need thieving level ${b.level} to pick this lock.`, 'warn'); return true; }
      if (!s.inventory.has(LOCKPICK)) { this.game.msg(s.id, 'You need a lockpick. Sly Morwick in Corvane sells them.', 'warn'); return true; }
      this.game.msg(s.id, 'You work the lockpick into the lock...', 'info');
    } else if (kind === 'herbs') {
      const h = HERB_BY_ID[l.herbs[this.tileAt(x, y, z)!.i].herb];
      if (this.level(s, 'herblore') < h.level) { this.game.msg(s.id, `You need herblore level ${h.level} to pick ${h.name.toLowerCase()}.`, 'warn'); return true; }
      if (!s.inventory.canFit(`grimy_${h.id}`, 1)) { this.game.msg(s.id, 'Your backpack is full.', 'warn'); return true; }
      if (s.trades.work?.kind !== 'herbs' || s.trades.work.x !== x || s.trades.work.y !== y) this.game.msg(s.id, `You search the ${h.name.toLowerCase()} for good leaves.`, 'info');
    }
    this.game.stopAllWork(s);
    p.targetId = null;
    p.faceTowards(x, y);
    const time = kind === 'pickpocket' ? PICKPOCKET_TIME : kind === 'steal' ? STALL_TIME : kind === 'lockpick' ? LOCK_TIME : PICK_INTERVAL / 2;
    s.trades.work = { kind, x, y, z, timer: time, npc };
    return true;
  }

  /** Stops whatever trade work is going (walking off, attacking, another job). */
  stopWork(s: Session): void {
    s.trades.work = null;
  }

  /** Teleported (stairs, ships, death, a game master): every crossing and job ends where it was. */
  cancel(s: Session): void {
    this.sea.cancel(s);
    s.trades.work = null;
    s.trades.cross = null;
    s.trades.goCross = null;
    this.pendingPocket.delete(s.id);
  }

  private updateWork(s: Session, dt: number): void {
    const p = s.player;
    const w = s.trades.work!;
    const npc = w.npc !== undefined ? this.game.npcs.find((n) => n.id === w.npc) : null;
    const tx = npc ? npc.x : w.x, ty = npc ? npc.y : w.y;
    if (p.moving || p.path.length || p.pending || p.targetId !== null || p.z !== w.z || chebyshev(p.x, p.y, tx, ty) > 1 || (w.npc !== undefined && !npc)
      || p.chop || p.fish || p.mine || p.craft) {
      s.trades.work = null;
      return;
    }
    w.timer -= dt;
    if (w.timer > 0) return;
    p.faceTowards(tx, ty);
    switch (w.kind) {
      case 'pickpocket': s.trades.work = null; return this.finishPickpocket(s, npc!);
      case 'steal': s.trades.work = null; return this.finishSteal(s, w);
      case 'lockpick': s.trades.work = null; return this.finishLock(s, w);
      case 'herbs': w.timer += PICK_INTERVAL; return this.pickHerb(s, w);
      case 'farm': s.trades.work = null; return this.finishFarm(s, w);
      case 'trap': s.trades.work = null; return this.finishTrap(s, w);
    }
  }

  /** Gives items (backpack first; what does not fit drops at the player's feet). */
  private give(s: Session, list: Array<{ id: string; qty: number }>): string[] {
    const p = s.player;
    const names: string[] = [];
    for (const it of list) {
      if (!isItem(it.id) || it.qty <= 0) continue;
      const d = itemDef(it.id);
      const fitsWeight = s.inventory.weight() + d.weight * it.qty <= p.capacity;
      const left = fitsWeight ? s.inventory.add(it.id, it.qty) : it.qty;
      if (left > 0) this.game.dropBag(p.x, p.y, p.z, [{ id: it.id, qty: left }]);
      names.push(it.id === 'gold' ? `${it.qty} gold` : it.qty > 1 ? `${it.qty} ${d.name.toLowerCase()}` : d.name.toLowerCase());
    }
    this.game.events.emit({ type: 'inventoryChanged', to: s.id });
    return names;
  }

  /** Caught: stunned (held in place) and hit. */
  private caught(s: Session, seconds: number, dmg: number, text: string): void {
    const p = s.player;
    p.buffs.rooted = Math.max(p.buffs.rooted, seconds);
    this.game.events.emit({ type: 'buff', id: p.id, buff: 'rooted', on: true });
    this.game.events.emit({ type: 'thieving', id: p.id, x: p.x, y: p.y, z: p.z, got: false });
    this.game.hurtPlayerByEnvironment(s, dmg, 'physical', text);
  }

  // ---------------------------------------------------------------- pickpocketing

  /** Command `thieve`: try to pick an NPC's pocket (townsfolk only — never another player). */
  pickpocket(s: Session, npcId: number): void {
    const p = s.player;
    const n = this.game.npcs.find((x) => x.id === npcId);
    if (!n || p.dead || this.busy(s) || p.boat) return;
    const def = NPCS[n.key];
    const tier = def?.thieve ? MARK_TIERS[def.thieve] : null;
    if (!tier) return this.game.msg(s.id, `You would never get away with robbing ${n.name}.`, 'warn');
    if (this.level(s, 'thieving') < tier.level) return this.game.msg(s.id, `You need thieving level ${tier.level} to pick a ${tier.name}'s pocket.`, 'warn');
    if (n.z !== p.z || chebyshev(p.x, p.y, n.x, n.y) > 1) {
      // walk up first (the dialogue keeps the NPC in place; they never wander)
      const path = this.game.pathTo(p, n.x, n.y, true, 3000);
      if (!path) return this.game.msg(s.id, 'There is no way.', 'warn');
      p.path = path;
      s.trades.work = null;
      this.pendingPocket.set(s.id, n.id);
      return;
    }
    this.game.closeDialogue(s.id);
    this.startWork(s, 'pickpocket', n.x, n.y, n.z, n.id);
    this.game.msg(s.id, `You slip a hand towards ${n.name}'s purse...`, 'info');
  }

  /** NPCs a player is walking up to in order to pick their pocket. */
  private pendingPocket = new Map<number, number>();

  /** Called every tick for walking pickpockets (from updateSession's caller). */
  checkPendingPocket(s: Session): void {
    const id = this.pendingPocket.get(s.id);
    if (id === undefined) return;
    const p = s.player;
    if (p.moving) return;
    this.pendingPocket.delete(s.id);
    const n = this.game.npcs.find((x) => x.id === id);
    if (n && chebyshev(p.x, p.y, n.x, n.y) <= 1) this.pickpocket(s, id);
  }

  private finishPickpocket(s: Session, n: Npc): void {
    const tier = MARK_TIERS[NPCS[n.key]?.thieve ?? ''];
    if (!tier) return;
    const p = s.player;
    if (Math.random() < pickpocketChance(this.level(s, 'thieving'), tier.level)) {
      const loot = [{ id: 'gold', qty: tier.gold[0] + Math.floor(Math.random() * (tier.gold[1] - tier.gold[0] + 1)) }, ...rollEach(tier.loot).slice(0, 1)];
      const got = this.give(s, loot);
      this.game.msg(s.id, `You pick ${n.name}'s pocket: ${got.join(', ')}.`, 'loot');
      this.game.events.emit({ type: 'thieving', id: p.id, x: n.x, y: n.y, z: n.z, got: true });
      this.game.gainSkill(s, 'thieving', tier.xp, p.id);
    } else {
      this.game.msg(s.id, `${n.name}: ${tier.shout}`, 'npc');
      const dmg = tier.hit[0] + Math.floor(Math.random() * (tier.hit[1] - tier.hit[0] + 1));
      this.caught(s, tier.stun, dmg, `${n.name} catches you and gives you a clout. You are stunned!`);
    }
  }

  // ---------------------------------------------------------------- stalls and strongboxes

  private finishSteal(s: Session, w: TradeWork): void {
    const l = this.layout!;
    const tt = this.tileAt(w.x, w.y, w.z);
    if (!tt || tt.t !== 'stall' || this.game.world.getObj(w.x, w.y, w.z) !== Obj.TradeStall) return;
    const st = l.stalls[tt.i];
    const d = STALLS[st.kind];
    const p = s.player;
    if (Math.random() < stallChance(this.level(s, 'thieving'), d.level)) {
      const got = this.give(s, [rollFirst(d.loot)]);
      this.game.msg(s.id, `You snatch ${got.join(', ')} from the ${d.name}.`, 'loot');
      this.game.events.emit({ type: 'thieving', id: p.id, x: w.x, y: w.y, z: w.z, got: true });
      this.game.gainSkill(s, 'thieving', d.xp, p.id);
      this.game.holdTile(w.x, w.y, w.z, Obj.TradeStallEmpty, d.restock[0] + Math.random() * (d.restock[1] - d.restock[0]));
      return;
    }
    // somebody saw it: a keeper or guard nearby shoves you away; alone, you just fumble it
    const watcher = this.game.npcs.find((n) => n.z === w.z && chebyshev(n.x, n.y, w.x, w.y) <= 5);
    if (watcher) {
      this.game.msg(s.id, `${watcher.name}: Stop, thief!`, 'npc');
      this.caught(s, 4, Math.round(3 + d.level / 4), 'You are shoved away from the stall and stunned!');
    } else {
      this.game.msg(s.id, 'You fumble and knock the goods back. Nobody noticed.', 'info');
      this.game.events.emit({ type: 'thieving', id: p.id, x: w.x, y: w.y, z: w.z, got: false });
    }
  }

  private finishLock(s: Session, w: TradeWork): void {
    const l = this.layout!;
    const tt = this.tileAt(w.x, w.y, w.z);
    if (!tt || tt.t !== 'box' || this.game.world.getObj(w.x, w.y, w.z) !== Obj.StrongBox) return;
    const b = l.boxes[tt.i];
    const p = s.player;
    if (!s.inventory.has(LOCKPICK)) return this.game.msg(s.id, 'You need a lockpick.', 'warn');
    const loot = boxLoot(b.level);
    if (Math.random() < lockChance(this.level(s, 'thieving'), b.level)) {
      const got = this.give(s, [{ id: 'gold', qty: loot.gold[0] + Math.floor(Math.random() * (loot.gold[1] - loot.gold[0] + 1)) }, ...rollEach(loot.loot)]);
      this.game.msg(s.id, `The lock clicks open. Inside: ${got.join(', ')}.`, 'loot');
      this.game.events.emit({ type: 'thieving', id: p.id, x: w.x, y: w.y, z: w.z, got: true });
      this.game.gainSkill(s, 'thieving', loot.xp, p.id);
      this.game.holdTile(w.x, w.y, w.z, Obj.StrongBoxOpen, BOX_RESTOCK[0] + Math.random() * (BOX_RESTOCK[1] - BOX_RESTOCK[0]));
      return;
    }
    if (Math.random() < LOCKPICK_BREAK) {
      s.inventory.removeById(LOCKPICK, 1);
      this.game.events.emit({ type: 'inventoryChanged', to: s.id });
      this.game.msg(s.id, 'Your lockpick snaps in the lock.', 'warn');
    }
    if (Math.random() < 0.5) {
      this.game.poison(s, 3 + Math.floor(b.level / 10), 8);
      this.game.msg(s.id, 'A needle springs out of the lock. Poison!', 'warn');
      this.game.events.emit({ type: 'thieving', id: p.id, x: w.x, y: w.y, z: w.z, got: false });
    } else this.caught(s, 2, Math.round(4 + b.level / 5), 'The box\'s trap snaps at your fingers!');
  }

  // ---------------------------------------------------------------- herbs

  private pickHerb(s: Session, w: TradeWork): void {
    const l = this.layout!;
    const tt = this.tileAt(w.x, w.y, w.z);
    if (!tt || tt.t !== 'herb' || this.game.world.getObj(w.x, w.y, w.z) !== Obj.WildHerbs) { s.trades.work = null; return; }
    const h = HERB_BY_ID[l.herbs[tt.i].herb];
    const p = s.player;
    const id = `grimy_${h.id}`;
    const got = Math.random() < pickChance(this.level(s, 'herblore'), h);
    this.game.events.emit({ type: 'herbs', id: p.id, x: w.x, y: w.y, z: w.z, got });
    if (!got) return;
    if (!s.inventory.canFit(id, 1) || s.inventory.weight() + itemDef(id).weight > p.capacity) {
      s.trades.work = null;
      return this.game.msg(s.id, 'Your backpack is full.', 'warn');
    }
    s.inventory.add(id, 1);
    this.game.events.emit({ type: 'inventoryChanged', to: s.id });
    this.game.msg(s.id, `You pick some ${itemDef(id).name.toLowerCase()}.`, 'loot');
    this.game.gainSkill(s, 'herblore', h.pickXp, p.id);
    if (Math.random() < HERB_DEPLETE) {
      s.trades.work = null;
      this.game.holdTile(w.x, w.y, w.z, Obj.WildHerbsPicked, HERB_REGROW[0] + Math.random() * (HERB_REGROW[1] - HERB_REGROW[0]));
    }
  }

  // ================================================================ items

  /** Using a backpack item the trade rules know (Draught of Vigour, lockpicks…). Returns true when handled. */
  useItem(s: Session, slot: number, d: ItemDef): boolean {
    const p = s.player;
    if (d.id === VIGOUR_POTION) {
      if (s.trades.stamina >= STAMINA_MAX - 0.5) { this.game.msg(s.id, 'You are not out of breath.', 'warn'); return true; }
      if (p.groupCooldowns.potion > 0) { this.game.msg(s.id, 'You are exhausted.', 'warn'); return true; }
      s.inventory.removeFromSlot(slot, 1);
      s.trades.stamina = Math.min(STAMINA_MAX, Math.max(0, s.trades.stamina) + VIGOUR_STAMINA);
      p.groupCooldowns.potion = 1;
      this.game.msg(s.id, 'You feel your breath come back.', 'info');
      this.game.events.emit({ type: 'inventoryChanged', to: s.id });
      return true;
    }
    if (d.tool === 'lockpick') { this.game.msg(s.id, 'Use a strongbox to pick its lock. You will find them in bandit camps and old ruins.', 'info'); return true; }
    if (d.id === 'pet_morsel') {
      if (!s.pets.active) { this.game.msg(s.id, 'Call your pet first, then give it the morsel.', 'warn'); return true; }
      s.inventory.removeFromSlot(slot, 1);
      this.game.petSys.onExp(s, PET_MORSEL_EXP);
      this.game.msg(s.id, 'Your pet gobbles the morsel down happily.', 'info');
      this.game.events.emit({ type: 'inventoryChanged', to: s.id });
      return true;
    }
    if (d.tool === 'trowel' || d.id === COMPOST || PLANT_BY_SEED[d.id]) { this.game.msg(s.id, 'Use a farm patch to plant your seeds (with a trowel in your pack) or to put compost on what grows there.', 'info'); return true; }
    if (d.tool === 'trap') { this.game.msg(s.id, d.id === 'box_trap' ? 'Use a burrow to set a box trap beside it.' : 'Use a nesting bush to set a bird snare in it.', 'info'); return true; }
    return false;
  }

  // ================================================================ farming

  private patchName(kind: string): string {
    return kind === 'herb' ? 'herb patch' : 'allotment';
  }

  /** Using a farm patch: plant, compost, check or harvest your own crop on it. */
  private usePatch(s: Session, i: number): void {
    const l = this.layout!;
    const patch = l.patches[i];
    const t = s.trades;
    const now = this.game.now();
    const st = t.farm[String(i)];
    if (!st) {
      const lvl = this.level(s, 'farming');
      const seeds = s.inventory.slots.filter((x, k) => x && k < s.inventory.size() && PLANT_BY_SEED[x.id]?.patch === patch.kind).map((x) => PLANT_BY_SEED[x!.id]);
      if (!seeds.length) return this.game.msg(s.id, patch.kind === 'herb' ? 'This herb patch is empty. Plant a herb seed here with a trowel.' : 'This allotment is empty. Plant vegetable seeds here with a trowel.', 'info');
      const seed = seeds.find((d) => d.level <= lvl);
      if (!seed) return this.game.msg(s.id, `You need farming level ${Math.min(...seeds.map((d) => d.level))} to plant those seeds.`, 'warn');
      if (!s.inventory.has(TROWEL)) return this.game.msg(s.id, 'You need a gardening trowel to plant. Farmers and seed sellers have them.', 'warn');
      this.startFieldWork(s, 'farm', patch.x, patch.y, patch.z, 'plant', i, seed.seed);
      return;
    }
    const d = PLANT_BY_SEED[st.s]!;
    if (stage(st, now) === 3) return this.startFieldWork(s, 'farm', patch.x, patch.y, patch.z, 'harvest', i);
    if (!st.c && s.inventory.has(COMPOST)) return this.startFieldWork(s, 'farm', patch.x, patch.y, patch.z, 'compost', i);
    const left = minutesLeft(st, now);
    this.game.msg(s.id, d.patch === 'herb' ? `Your herb is growing (${d.name.toLowerCase()}). Ready in about ${left} minutes.` : `Your crop is growing (${d.name.toLowerCase()}). Ready in about ${left} minutes.`, 'info');
  }

  private startFieldWork(s: Session, kind: 'farm' | 'trap', x: number, y: number, z: number, op: TradeWork['op'], ref: number, seed?: string): void {
    const p = s.player;
    this.game.stopAllWork(s);
    p.targetId = null;
    p.faceTowards(x, y);
    s.trades.work = { kind, x, y, z, timer: kind === 'farm' ? FARM_TIME : TRAP_TIME, op, ref, seed };
  }

  private finishFarm(s: Session, w: TradeWork): void {
    const l = this.layout!;
    const i = w.ref!;
    const patch = l.patches[i];
    const t = s.trades;
    const key = String(i);
    const p = s.player;
    const now = this.game.now();
    if (w.op === 'plant') {
      const d = PLANT_BY_SEED[w.seed ?? ''];
      if (!d || t.farm[key] || !s.inventory.has(d.seed)) return;
      s.inventory.removeById(d.seed, 1);
      t.farm[key] = { s: d.seed, t: now };
      s.wantsSave = true;
      this.game.events.emit({ type: 'inventoryChanged', to: s.id });
      this.game.events.emit({ type: 'farm', id: p.id, x: patch.x, y: patch.y, z: patch.z, op: 'plant' });
      this.game.msg(s.id, `You plant ${d.name.toLowerCase()} in the ${this.patchName(patch.kind)}. Ripe in about ${d.minutes} minutes, even while you are away.`, 'info');
      this.game.gainSkill(s, 'farming', d.plantXp, p.id);
      return;
    }
    const st = t.farm[key];
    if (!st) return;
    const d = PLANT_BY_SEED[st.s]!;
    if (w.op === 'compost') {
      if (st.c || !s.inventory.has(COMPOST)) return;
      s.inventory.removeById(COMPOST, 1);
      st.c = 1;
      s.wantsSave = true;
      this.game.events.emit({ type: 'inventoryChanged', to: s.id });
      this.game.events.emit({ type: 'farm', id: p.id, x: patch.x, y: patch.y, z: patch.z, op: 'compost' });
      this.game.msg(s.id, `You spread compost over your ${d.name.toLowerCase()}. The harvest will be bigger.`, 'info');
      this.game.gainSkill(s, 'farming', Math.round(d.plantXp / 2), p.id);
      return;
    }
    if (w.op === 'harvest' && stage(st, now) === 3) {
      const n = d.yield[0] + Math.floor(Math.random() * (d.yield[1] - d.yield[0] + 1)) + (st.c ? COMPOST_BONUS : 0);
      delete t.farm[key];
      s.wantsSave = true;
      const got = this.give(s, [{ id: d.produce, qty: n }]);
      this.game.events.emit({ type: 'farm', id: p.id, x: patch.x, y: patch.y, z: patch.z, op: 'harvest' });
      this.game.msg(s.id, `You harvest ${got.join(', ')}.`, 'loot');
      this.game.gainSkill(s, 'farming', d.harvestXp * n, p.id);
    }
  }

  /** Own farm patches for the view: [patch id, seed index, stage, composted]. */
  farmView(s: Session): Array<[number, number, number, number]> {
    if (!this.game.simulate) return s.trades.netFarm;
    const now = this.game.now();
    return Object.entries(s.trades.farm).map(([k, st]) => [Number(k), SEED_ORDER.indexOf(st.s), stage(st, now), st.c ? 1 : 0]);
  }

  // ================================================================ hunter

  private useHuntSpot(s: Session, i: number): void {
    const l = this.layout!;
    const spot = l.hunts[i];
    const t = s.trades;
    const mine = t.traps.find((x) => x.spot === i);
    if (mine) {
      if (mine.state === 'caught') return this.startFieldWork(s, 'trap', spot.x, spot.y, spot.z, 'collect', i);
      if (mine.state === 'broken') return this.startFieldWork(s, 'trap', spot.x, spot.y, spot.z, 'reset', i);
      t.traps = t.traps.filter((x) => x !== mine);
      this.game.events.emit({ type: 'hunt', id: s.player.id, x: spot.x, y: spot.y, z: spot.z, op: 'take' });
      return this.game.msg(s.id, 'You take your trap back.', 'info');
    }
    const lvl = this.level(s, 'hunter');
    const lowest = Math.min(...spot.prey.map((id) => PREY_BY_ID[id]?.level ?? 99));
    if (lvl < lowest) return this.game.msg(s.id, `Nothing here would walk into a trap of yours yet. You need hunter level ${lowest}.`, 'warn');
    const item = trapFor(spot.kind);
    const carried = s.inventory.count(item);
    const laid = t.traps.filter((x) => l.hunts[x.spot]?.kind === spot.kind).length;
    if (carried <= laid) return this.game.msg(s.id, carried ? 'All your traps of that kind are set already.' : spot.kind === 'burrow' ? 'You need a box trap to set here. Huntmaster Ketta in Briarwatch sells them.' : 'You need a bird snare to set here. Huntmaster Ketta in Briarwatch sells them.', 'warn');
    if (t.traps.length >= maxTraps(lvl)) return this.game.msg(s.id, `You can only look after ${maxTraps(lvl)} traps at your hunter level.`, 'warn');
    this.startFieldWork(s, 'trap', spot.x, spot.y, spot.z, 'set', i);
  }

  private finishTrap(s: Session, w: TradeWork): void {
    const l = this.layout!;
    const i = w.ref!;
    const spot = l.hunts[i];
    const t = s.trades;
    const p = s.player;
    const mine = t.traps.find((x) => x.spot === i);
    if (w.op === 'set') {
      if (mine) return;
      t.traps.push({ spot: i, state: 'set', roll: TRAP_ROLL, prey: null });
      this.game.events.emit({ type: 'hunt', id: p.id, x: spot.x, y: spot.y, z: spot.z, op: 'set' });
      this.game.msg(s.id, spot.kind === 'burrow' ? 'You set a box trap beside the burrow. Step back and wait.' : 'You set a snare in the nesting bush. Step back and wait.', 'info');
      this.game.gainSkill(s, 'hunter', 2, p.id);
      return;
    }
    if (!mine) return;
    if (w.op === 'reset') {
      mine.state = 'set';
      mine.roll = TRAP_ROLL;
      this.game.events.emit({ type: 'hunt', id: p.id, x: spot.x, y: spot.y, z: spot.z, op: 'set' });
      this.game.msg(s.id, 'You set the trap again.', 'info');
      return;
    }
    if (w.op === 'collect' && mine.state === 'caught') {
      const prey = PREY_BY_ID[mine.prey ?? ''];
      t.traps = t.traps.filter((x) => x !== mine);
      if (!prey) return;
      const got = this.give(s, rollEach(prey.loot));
      this.game.events.emit({ type: 'hunt', id: p.id, x: spot.x, y: spot.y, z: spot.z, op: 'collect' });
      this.game.msg(s.id, `You take the ${prey.name} out of the trap: ${got.join(', ') || 'nothing worth keeping'}.`, 'loot');
      this.game.gainSkill(s, 'hunter', prey.xp, p.id);
    }
  }

  /** Set traps may catch something every few seconds; traps you walk away from collapse. */
  private updateTraps(s: Session, dt: number): void {
    const l = this.layout;
    if (!l) return;
    const p = s.player;
    const t = s.trades;
    const lvl = this.level(s, 'hunter');
    for (const tr of [...t.traps]) {
      const spot = l.hunts[tr.spot];
      if (!spot) { t.traps = t.traps.filter((x) => x !== tr); continue; }
      if (spot.z !== p.z || chebyshev(spot.x, spot.y, p.x, p.y) > TRAP_LEASH) {
        t.traps = t.traps.filter((x) => x !== tr);
        this.game.msg(s.id, 'You leave a trap behind and it collapses. You gather it up as you go.', 'info');
        continue;
      }
      if (tr.state !== 'set') continue;
      tr.roll -= dt;
      if (tr.roll > 0) continue;
      tr.roll += TRAP_ROLL;
      const prey = preyFor(spot.prey, lvl, Math.random());
      if (!prey) continue;
      if (Math.random() < TRAP_FAIL) {
        tr.state = 'broken';
        this.game.events.emit({ type: 'hunt', id: p.id, x: spot.x, y: spot.y, z: spot.z, op: 'broken' });
        this.game.msg(s.id, 'One of your traps has been sprung empty. Set it again.', 'info');
      } else if (Math.random() < catchChance(lvl, prey)) {
        tr.state = 'caught';
        tr.prey = prey.id;
        this.game.events.emit({ type: 'hunt', id: p.id, x: spot.x, y: spot.y, z: spot.z, op: 'caught' });
        this.game.msg(s.id, `Something is in one of your traps: ${prey.name}!`, 'loot');
      }
    }
  }

  /** Own traps for the view: [spot id, 0 set / 1 caught / 2 broken]. */
  trapView(s: Session): Array<[number, number]> {
    if (!this.game.simulate) return s.trades.netTraps;
    return s.trades.traps.map((x) => [x.spot, x.state === 'set' ? 0 : x.state === 'caught' ? 1 : 2]);
  }

  // ================================================================ slayer

  /** A monster died: everyone who hurt it and has it on their task counts it (Game.killEnemy, per damager). */
  onKill(s: Session, kind: string, maxHp: number): void {
    const t = s.trades;
    const task = t.slayer ? TASK_BY_ID[t.slayer.task] : null;
    if (!t.slayer || !task || !task.kinds.includes(kind as never) || t.slayer.left <= 0) return;
    t.slayer.left--;
    this.game.gainSkill(s, 'slayer', slayerXp(maxHp), s.player.id);
    if (t.slayer.left > 0) {
      if (t.slayer.left % 10 === 0 || t.slayer.left <= 3) this.game.msg(s.id, `Slayer task: ${t.slayer.left} ${task.name} left.`, 'quest');
      return;
    }
    const m = MASTER_BY_NPC[t.slayer.master];
    t.streak++;
    const pts = taskPoints(m?.points ?? 3, t.streak);
    t.points += pts;
    t.slayer = null;
    s.wantsSave = true;
    this.game.msg(s.id, `Slayer task complete! You earn ${pts} slayer points (${t.points} in all, ${t.streak} tasks in a row). Any slayer master has a new task for you.`, 'quest');
  }

  /**
   * Damage a player deals to a monster, after the slayer rules: a slayer monster takes nothing from
   * someone below its slayer level (or, for the shades, without a hush cowl); a worn slayer helm adds
   * a little against the monsters of your task.
   */
  damageTo(s: Session, kind: string, amount: number): number {
    const req = SLAYER_REQ[kind as SlayerKind];
    if (req) {
      const ok = this.level(s, 'slayer') >= req.level && (!req.item || s.inventory.equipped('head') === req.item);
      if (!ok) {
        const now = this.game.time;
        if ((this.warned.get(s.id) ?? -99) < now - 6) {
          this.warned.set(s.id, now);
          this.game.msg(s.id, req.why, 'warn');
        }
        return 0;
      }
    }
    const t = s.trades;
    if (amount > 0 && t.slayer && s.inventory.equipped('head') === SLAYER_HELM && TASK_BY_ID[t.slayer.task]?.kinds.includes(kind as never)) {
      return Math.round(amount * (1 + SLAYER_HELM_BONUS));
    }
    return amount;
  }

  /** Last time each player was told a slayer monster shrugs their blows off (game seconds). */
  private warned = new Map<number, number>();

  private slayerOptions(s: Session, npcId: number, npcKey: string): DialogueOption[] {
    const m = MASTER_BY_NPC[npcKey];
    if (!m) return [];
    const t = s.trades;
    if (t.page?.npc === npcId && t.page.page === 'rewards') {
      const out: DialogueOption[] = SLAYER_REWARDS.map((r) => ({
        label: `${r.label} — ${r.cost} points`, action: `trades:buy:${r.id}`, disabled: t.points < r.cost || (r.id === 'skip' && !t.slayer),
      }));
      out.push({ label: 'Back.', action: 'trades:back' });
      return out;
    }
    const out: DialogueOption[] = [];
    if (t.slayer) out.push({ label: 'How is my task going?', action: 'trades:progress' });
    else out.push({ label: 'I need a slayer task.', action: 'trades:task' });
    out.push({ label: `Slayer rewards (${t.points} points).`, action: 'trades:rewards' });
    return out;
  }

  private slayerAction(s: Session, args: string[]): string | null {
    const d = s.dialogue!;
    const m = MASTER_BY_NPC[d.npcKey];
    if (!m) return null;
    const t = s.trades;
    const p = s.player;
    const lvl = this.level(s, 'slayer');
    switch (args[0]) {
      case 'task': {
        if (t.slayer) return null;
        if (p.level < m.minLevel) return `You are not ready for my work yet. Come back at level ${m.minLevel}.`;
        if (lvl < m.minSlayer) return `My tasks are for seasoned slayers. Come back with slayer level ${m.minSlayer}.`;
        const living = new Set(this.game.enemies.map((e) => e.enemyKind));
        const list = tasksFor(m, p.level, lvl, (k) => living.has(k));
        if (!list.length) return 'I have nothing for you right now.';
        const task = list[Math.floor(Math.random() * list.length)];
        const n = task.count[0] + Math.floor(Math.random() * (task.count[1] - task.count[0] + 1));
        t.slayer = { task: task.id, master: m.npc, left: n, total: n };
        s.wantsSave = true;
        this.game.msg(s.id, `New slayer task: slay ${n} ${task.name}.`, 'quest');
        return `Your task: slay ${n} ${task.name}. Any slayer master will give you the next one when you are done.`;
      }
      case 'progress': {
        const task = t.slayer ? TASK_BY_ID[t.slayer.task] : null;
        return task && t.slayer ? `You still have ${t.slayer.left} of ${t.slayer.total} ${task.name} to slay.` : null;
      }
      case 'rewards':
        t.page = { npc: d.npcId, page: 'rewards' };
        return `You have ${t.points} slayer points. What will it be?`;
      case 'back':
        t.page = null;
        return 'Anything else?';
      case 'buy': {
        const r = SLAYER_REWARDS.find((x) => x.id === args[1]);
        if (!r || t.points < r.cost) return 'You do not have enough points for that.';
        if (r.id === 'skip') {
          if (!t.slayer) return null;
          t.slayer = null;
        } else if (r.id === 'seeds') {
          const lvlF = this.level(s, 'farming');
          const ok = HERBS.filter((h) => h.level <= Math.max(14, lvlF + 10));
          const list = Array.from({ length: 6 }, () => ({ id: `${ok[Math.floor(Math.random() * ok.length)].id}_seed`, qty: 1 }));
          this.give(s, list);
        } else if (r.item) {
          if (s.inventory.freeSlots() < 1 && !s.inventory.canFit(r.item, r.qty ?? 1)) return 'Make some room in your backpack first.';
          this.give(s, [{ id: r.item, qty: r.qty ?? 1 }]);
        }
        t.points -= r.cost;
        s.wantsSave = true;
        return r.id === 'skip' ? 'Done. Ask me for a new task whenever you like.' : 'There you are. Use it well.';
      }
    }
    return null;
  }

  // ================================================================ dialogue

  /** Extra dialogue lines for an NPC (masters' advice, a pocket worth picking). */
  dialogueOptions(s: Session, npcKey: string): DialogueOption[] {
    const n = NPCS[npcKey];
    const out: DialogueOption[] = [];
    if (!n) return out;
    if (n.advice) out.push({ label: 'How do I train?', action: 'trades:advice' });
    if (n.thieve) {
      const tier = MARK_TIERS[n.thieve];
      out.push({ label: `(Pick their pocket — thieving ${tier.level})`, action: 'trades:pocket', disabled: this.level(s, 'thieving') < tier.level });
    }
    if (n.slayer && s.dialogue) out.push(...this.slayerOptions(s, s.dialogue.npcId, npcKey));
    return out;
  }

  /** A `trades:…` dialogue action. Returns the new line for the dialogue, if any. */
  dialogueAction(s: Session, args: string[]): string | null {
    const d = s.dialogue;
    if (!d) return null;
    const n = NPCS[d.npcKey];
    if (args[0] !== 'buy' && args[0] !== 'rewards') s.trades.page = null;
    switch (args[0]) {
      case 'advice': return n?.advice ?? null;
      case 'pocket': this.pickpocket(s, d.npcId); return null;
    }
    if (n?.slayer) return this.slayerAction(s, args);
    return null;
  }

  // ================================================================ views

  /** The own client's view (snapshot `tw`). */
  view(s: Session): TradeView {
    const t = s.trades;
    const v: TradeView = { st: Math.floor(Math.max(0, t.stamina)), rn: t.run ? 1 : 0 };
    const fp = this.farmView(s);
    if (fp.length) v.fp = fp;
    const tp = this.trapView(s);
    if (tp.length) v.tp = tp;
    if (t.slayer || t.points || t.streak) v.sl = [t.slayer?.task ?? '', t.slayer?.left ?? 0, t.slayer?.total ?? 0, t.points, t.streak];
    return v;
  }

  /** What the player is doing, for the animations of every client (gathering/activity.ts). */
  activity(s: Session): Activity | null {
    const t = s.trades;
    if (s.player.boat) return this.sea.activity(s);
    if (t.cross) {
      const ob = this.obstacle(t.cross.ob);
      if (ob) return { kind: ob.kind, x: t.cross.fromA ? ob.bx : ob.ax, y: t.cross.fromA ? ob.by : ob.ay, tool: null };
    }
    const w = t.work;
    if (w) {
      if (w.kind === 'pickpocket') {
        const n = this.game.npcs.find((x) => x.id === w.npc);
        return { kind: 'pickpocket', x: n?.x ?? w.x, y: n?.y ?? w.y, tool: null };
      }
      if (w.kind === 'farm') return { kind: 'farm', x: w.x, y: w.y, tool: w.op === 'plant' ? TROWEL : null };
      if (w.kind === 'trap') return { kind: 'trap', x: w.x, y: w.y, tool: null };
      return { kind: w.kind === 'herbs' ? 'herbs' : w.kind, x: w.x, y: w.y, tool: w.kind === 'lockpick' ? LOCKPICK : null };
    }
    return null;
  }
}

/** The empty stand-in of an object that is restocking (mirror games: what the server's list means). */
export function tradeEmptyOf(o: Obj): Obj | null {
  return TRADE_EMPTY[o] ?? null;
}


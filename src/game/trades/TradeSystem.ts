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
import {
  BOX_RESTOCK, boxLoot, LOCK_TIME, lockChance, LOCKPICK, LOCKPICK_BREAK, MARK_TIERS, PICKPOCKET_TIME, pickpocketChance, rollEach, rollFirst,
  STALL_TIME, stallChance, STALLS,
} from './thieving';

/**
 * The trade skills of 2026-10-24 inside the game (`Game.trades`): running stamina
 * and agility shortcuts, thieving, herb picking — one place for their timers,
 * their tile and item uses, their dialogue lines, saves and network views.
 * Lives in game/: no DOM, no three.js. Every change goes through Game commands.
 */

/** Something a player is working on for a few seconds (one try, or a loop for herbs). */
export interface TradeWork {
  kind: 'pickpocket' | 'steal' | 'lockpick' | 'herbs';
  x: number;
  y: number;
  z: number;
  timer: number;
  /** Pickpocketing: the NPC. */
  npc?: number;
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

/** Per character (Session.trades). `run`, the slayer task and farm patches are saved; the rest is not. */
export interface TradeState {
  stamina: number;
  run: boolean;
  work: TradeWork | null;
  cross: Crossing | null;
  /** Walking to the end of a shortcut to cross it. */
  goCross: { ob: number; fromA: boolean } | null;
  /** Saved blocks of later skills, kept as they were read (slayer, farm). */
  extra: Record<string, unknown>;
}

export function emptyTrades(): TradeState {
  return { stamina: STAMINA_MAX, run: false, work: null, cross: null, goCross: null, extra: {} };
}

/** Reads a save's `trades` block (anything unreadable becomes the default; unknown fields are kept). */
export function parseTrades(raw: unknown): TradeState {
  const t = emptyTrades();
  if (!raw || typeof raw !== 'object') return t;
  const r = raw as Record<string, unknown>;
  t.run = r.run === true;
  for (const [k, v] of Object.entries(r)) if (k !== 'run') t.extra[k] = v;
  return t;
}

export function saveTrades(t: TradeState): Record<string, unknown> {
  return { ...JSON.parse(JSON.stringify(t.extra)), run: t.run };
}

/** What the own client is told (snapshot `tw`; only when changed). */
export interface TradeView {
  /** Stamina (whole points). */
  st: number;
  /** Running switched on. */
  rn: 0 | 1;
}

export function tradeView(t: TradeState): TradeView {
  return { st: Math.floor(t.stamina), rn: t.run ? 1 : 0 };
}

export function applyTradeView(t: TradeState, v: TradeView): void {
  if (typeof v.st === 'number') t.stamina = Math.max(0, Math.min(STAMINA_MAX, v.st));
  t.run = v.rn === 1;
}

/** Objects that hold something only for a while (stalls, boxes, herbs, flotsam) → what stands there meanwhile. */
export const TRADE_EMPTY: Partial<Record<Obj, Obj>> = {
  [Obj.TradeStall]: Obj.TradeStallEmpty,
  [Obj.StrongBox]: Obj.StrongBoxOpen,
  [Obj.WildHerbs]: Obj.WildHerbsPicked,
  [Obj.Flotsam]: Obj.FlotsamGone,
};

export class TradeSystem {
  constructor(private readonly game: Game) {}

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

  private level(s: Session, id: 'agility' | 'herblore' | 'thieving'): number {
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
      return;
    }
    // stamina comes back while not running (half as fast while walking)
    const running = t.run && p.moving && !t.cross;
    if (!running && t.stamina < STAMINA_MAX) t.stamina = Math.min(STAMINA_MAX, t.stamina + staminaRegen(this.level(s, 'agility')) * dt * (p.moving ? 0.5 : 1));
    if (t.cross) this.updateCross(s, dt);
    else if (t.goCross) this.updateGoCross(s);
    this.checkPendingPocket(s);
    if (t.work) this.updateWork(s, dt);
  }

  // ================================================================ movement: running, crossings

  /** While crossing a shortcut the player cannot walk, attack or work. */
  busy(s: Session): boolean {
    return !!s.trades.cross;
  }

  /** Called when a player starts a normal step: running makes it quicker and uses stamina. Returns the step-time factor. */
  onStep(s: Session): number {
    const t = s.trades;
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
    return !a || !MOVING_ACTIVITIES.has(a.kind);
  }

  /** Online mirror: the step-time factor the server will use for the local player's next step (running). */
  predictFactor(s: Session): number {
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
    if (!c || !ob) return null;
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
      default: return null;
    }
  }

  /** A player used a tile (they stand within one tile of it). Returns true when a trade rule took it. */
  useTile(s: Session, x: number, y: number, z: number): boolean {
    const tt = this.tileAt(x, y, z);
    if (!tt) return false;
    const l = this.layout!;
    const o = this.game.world.getObj(x, y, z);
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
    if (!n || p.dead || this.busy(s)) return;
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
    return false;
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
    return out;
  }

  /** A `trades:…` dialogue action. Returns the new line for the dialogue, if any. */
  dialogueAction(s: Session, args: string[]): string | null {
    const d = s.dialogue;
    if (!d) return null;
    const n = NPCS[d.npcKey];
    switch (args[0]) {
      case 'advice': return n?.advice ?? null;
      case 'pocket': this.pickpocket(s, d.npcId); return null;
    }
    return null;
  }

  // ================================================================ views

  /** The own client's view (snapshot `tw`). */
  view(s: Session): TradeView {
    return tradeView(s.trades);
  }

  /** What the player is doing, for the animations of every client (gathering/activity.ts). */
  activity(s: Session): Activity | null {
    const t = s.trades;
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
      return { kind: w.kind === 'herbs' ? 'herbs' : w.kind, x: w.x, y: w.y, tool: w.kind === 'lockpick' ? LOCKPICK : null };
    }
    return null;
  }
}

/** The empty stand-in of an object that is restocking (mirror games: what the server's list means). */
export function tradeEmptyOf(o: Obj): Obj | null {
  return TRADE_EMPTY[o] ?? null;
}


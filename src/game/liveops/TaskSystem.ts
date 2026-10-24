import { chebyshev } from '../core/types';
import { ENEMIES } from '../enemies/enemyDefs';
import type { Game, Session } from '../Game';
import type { NonCombatSkill } from '../gathering/skills';
import { isItem, ITEMS } from '../inventory/items';
import type { DialogueOption } from '../npc/dialogue';
import { NPCS } from '../npc/npcs';
import { SLAYER_KINDS } from '../trades/slayer';
import { onIsle } from '../world/tutorialIsle';
import type { EnemyKind } from '../world/WorldMap';
import { FESTIVAL_KINDS } from './festivals';
import { BOARD_HELP } from './liveNpcs';
import {
  applyTaskState, dailyTasks, loginSeals, makeTask, SEAL_SHOP, SEALS_MAX, streakBonus, taskDay, taskDone, taskWeek, weeklyTasks,
  type ExploreOption, type HuntOption, type TaskCtx, type TaskInst, type TaskState,
} from './tasks';

/** Seconds between the board's checks of one character (resets, journeys). */
const CHECK_EVERY = 1;
/** Tiles from a task-board keeper within which the board can be used. */
export const BOARD_RANGE = 4;

/**
 * Runs the daily and weekly tasks of every character (`Game.taskSys`; the rules are
 * in liveops/tasks.ts). Server-authoritative: progress is counted here from kills,
 * skill experience and the places a character walks into; claims, deliveries,
 * rerolls and the seal shop only work beside a task-board keeper. The state is
 * saved with the character (`tasks`, save v18) and sent to its own client (`tk`).
 */
export class TaskSystem {
  private timers = new Map<number, number>();
  private hunts: HuntOption[] | null = null;
  private regions: ExploreOption[] | null = null;

  constructor(private readonly game: Game) {}

  // ================================================================ what the board can ask

  /** Every regular monster that lives somewhere in the world, with its common materials. */
  private huntOptions(): HuntOption[] {
    if (this.hunts) return this.hunts;
    const g = this.game;
    const where = new Map<EnemyKind, boolean>();
    for (const sp of g.world.spawns) {
      const free = !g.premiumLand(sp.x, sp.y);
      where.set(sp.kind, (where.get(sp.kind) ?? false) || free);
    }
    const out: HuntOption[] = [];
    for (const [kind, free] of where) {
      const d = ENEMIES[kind];
      if (!d || d.boss || d.exp < 1 || (SLAYER_KINDS as string[]).includes(kind) || (FESTIVAL_KINDS as string[]).includes(kind)) continue;
      const drops: Array<[string, number]> = d.loot
        .filter((l) => l.id !== 'gold' && l.chance >= 0.15 && ITEMS[l.id]?.kind === 'material' && ITEMS[l.id]?.rarity === 'common')
        .map((l) => [l.id, l.chance]);
      out.push({ kind, exp: d.exp, hp: d.maxHp, free, drops });
    }
    this.hunts = out;
    return out;
  }

  /** Named places worth a visit (not towns or other protection zones, not the tutorial island). */
  private regionOptions(): ExploreOption[] {
    if (this.regions) return this.regions;
    const g = this.game;
    const seen = new Set<string>();
    const out: ExploreOption[] = [];
    for (const r of g.world.regions) {
      if (r.safe || seen.has(r.name) || (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) < 64) continue;
      const cx = (r.x0 + r.x1) >> 1, cy = (r.y0 + r.y1) >> 1;
      if (onIsle(cx, cy, r.z0)) continue;
      const m = /(\d+)/.exec(r.level ?? '');
      if (!m) continue;
      seen.add(r.name);
      out.push({ name: r.name, level: Number(m[1]), free: !g.premiumLand(cx, cy) });
    }
    this.regions = out;
    return out;
  }

  private ctx(s: Session): TaskCtx {
    const g = this.game;
    return {
      level: s.player.level,
      premium: g.isPremium(s),
      skill: (id) => g.skillLevel(s, id),
      hunts: this.huntOptions(),
      regions: this.regionOptions(),
      isItem,
      rng: Math.random,
    };
  }

  // ================================================================ the clock

  updateSession(s: Session, dt: number): void {
    const g = this.game;
    if (!g.simulate || s.bot) return;
    const t = (this.timers.get(s.id) ?? 0) - dt;
    if (t > 0) {
      this.timers.set(s.id, t);
      return;
    }
    this.timers.set(s.id, CHECK_EVERY);
    this.ensure(s);
    this.checkJourneys(s);
  }

  forget(id: number): void {
    this.timers.delete(id);
  }

  /** New day / new week: the streak, the login seals, fresh tasks (finished ones are paid first). */
  ensure(s: Session, force = false): void {
    const g = this.game;
    // nothing on the tutorial island: the board waits until the wide world (`force`: /tasks reset in tests)
    if (!g.simulate || s.bot || (s.tutorial.state === 'active' && !force)) return;
    const st = s.tasks;
    const now = g.now();
    const day = taskDay(now), week = taskWeek(now);
    if (st.last !== day) {
      st.streak = st.last === day - 1 ? st.streak + 1 : 1;
      st.best = Math.max(st.best, st.streak);
      st.last = day;
      const gift = loginSeals(st.streak);
      st.seals = Math.min(SEALS_MAX, st.seals + gift);
      const bonus = Math.round(streakBonus(st.streak) * 100);
      g.msg(s.id, st.streak > 1
        ? `Login streak: ${st.streak} days in a row. You get ${gift} task seals, and task rewards are ${bonus}% higher today.`
        : `Welcome! You get ${gift} task seal for logging in today. Come back tomorrow to start a streak.`, 'event');
      s.wantsSave = true;
    }
    if (st.day !== day) {
      this.payFinished(s, st.daily);
      st.daily = dailyTasks(this.ctx(s));
      st.day = day;
      g.msg(s.id, 'New daily tasks are on the task boards.', 'event');
      s.wantsSave = true;
    }
    if (st.week !== week) {
      this.payFinished(s, st.weekly);
      st.weekly = weeklyTasks(this.ctx(s));
      st.week = week;
      g.msg(s.id, 'New weekly tasks are on the task boards.', 'event');
      s.wantsSave = true;
    }
  }

  /** Finished but unclaimed tasks are paid at the reset rather than lost. */
  private payFinished(s: Session, list: TaskInst[]): void {
    for (const t of list) if (!t.c && taskDone(t)) this.pay(s, t, true);
  }

  // ================================================================ progress

  private progress(s: Session, t: TaskInst, amount: number): void {
    if (t.c || taskDone(t) || amount <= 0) return;
    t.h = Math.min(t.n, t.h + amount);
    if (taskDone(t)) {
      this.game.msg(s.id, 'A task is done! Collect your reward at any task board.', 'quest');
      s.wantsSave = true;
    }
  }

  private open(s: Session): TaskInst[] {
    return [...s.tasks.daily, ...s.tasks.weekly].filter((t) => !t.c && !taskDone(t));
  }

  /** A monster died and this character helped (Game.killEnemy). */
  onKill(s: Session, kind: EnemyKind): void {
    if (!this.game.simulate) return;
    for (const t of this.open(s)) if (t.k === 'hunt' && t.t === kind) this.progress(s, t, 1);
  }

  /** Experience in a trade skill (Game.gainSkill, after the rates). */
  onSkill(s: Session, id: NonCombatSkill, xp: number): void {
    if (!this.game.simulate) return;
    for (const t of this.open(s)) if (t.k === 'skill' && t.t === id) this.progress(s, t, xp);
  }

  private checkJourneys(s: Session): void {
    const tasks = this.open(s).filter((t) => t.k === 'explore');
    if (!tasks.length) return;
    const p = s.player;
    const r = this.game.world.regionAt(p.x, p.y, p.z);
    if (!r) return;
    for (const t of tasks) if (t.t === r.name) this.progress(s, t, 1);
  }

  // ================================================================ at the board

  /** A task-board keeper within reach. */
  nearBoard(s: Session): boolean {
    const p = s.player;
    if (p.dead) return false;
    for (const n of this.game.npcs) {
      if (n.z === p.z && NPCS[n.key]?.tasks && chebyshev(n.x, n.y, p.x, p.y) <= BOARD_RANGE) return true;
    }
    return false;
  }

  private atBoard(s: Session): boolean {
    if (this.nearBoard(s)) return true;
    this.game.msg(s.id, 'Find a task board first: every town has one.', 'warn');
    return false;
  }

  private task(s: Session, weekly: boolean, i: number): TaskInst | null {
    const list = weekly ? s.tasks.weekly : s.tasks.daily;
    return Number.isInteger(i) && i >= 0 && i < list.length ? list[i] : null;
  }

  private pay(s: Session, t: TaskInst, atReset: boolean): void {
    const g = this.game;
    const st = s.tasks;
    const bonus = 1 + streakBonus(st.streak);
    t.c = true;
    st.done++;
    st.seals = Math.min(SEALS_MAX, st.seals + t.s);
    const gold = Math.round(t.g * bonus);
    const exp = Math.round(t.x * bonus);
    if (exp > 0) g.grantExp(s, exp, s.id, 'for a task', true);
    if (gold > 0) g.worldEvents.deliver(s, [{ id: 'gold', qty: gold }], atReset ? 'A finished task was paid at the reset' : 'Task reward');
    const seals = t.s, total = st.seals;
    g.msg(s.id, `You earn ${seals} task seals (${total} in all).`, 'loot');
    s.wantsSave = true;
  }

  /** Collects a finished task's reward. */
  claim(s: Session, weekly: boolean, i: number): void {
    const t = this.task(s, weekly, i);
    if (!t || !this.atBoard(s)) return;
    if (t.c) return this.game.msg(s.id, 'You already collected that reward.', 'warn');
    if (!taskDone(t)) return this.game.msg(s.id, 'That task is not finished yet.', 'warn');
    this.pay(s, t, false);
  }

  /** Hands in goods for a delivery task (as many as it still needs). */
  deliver(s: Session, weekly: boolean, i: number): void {
    const g = this.game;
    const t = this.task(s, weekly, i);
    if (!t || t.k !== 'deliver' || t.c || taskDone(t) || !this.atBoard(s)) return;
    const have = s.inventory.count(t.t);
    if (have <= 0) return g.msg(s.id, 'You carry none of what this task asks for.', 'warn');
    const n = Math.min(have, t.n - t.h);
    const removed = s.inventory.removeById(t.t, n);
    if (removed <= 0) return;
    g.events.emit({ type: 'inventoryChanged', to: s.id });
    const item = ITEMS[t.t]?.name ?? t.t, done = t.h + removed, need = t.n;
    g.msg(s.id, `You hand over ${removed} × ${item} (${done}/${need}).`, 'info');
    this.progress(s, t, removed);
    s.wantsSave = true;
  }

  /** Swaps one daily task for another of the same kind (once a day). */
  reroll(s: Session, i: number): void {
    const g = this.game;
    const st = s.tasks;
    const t = this.task(s, false, i);
    if (!t || !this.atBoard(s)) return;
    const day = taskDay(g.now());
    if (st.rr === day) return g.msg(s.id, 'You already swapped a task today. Try again after the daily reset.', 'warn');
    if (t.c || taskDone(t)) return g.msg(s.id, 'That task is finished: collect its reward instead.', 'warn');
    const fresh = makeTask(this.ctx(s), t.k, false, st.daily) ?? makeTask(this.ctx(s), t.k === 'hunt' ? 'skill' : 'hunt', false, st.daily);
    if (!fresh) return g.msg(s.id, 'The board has nothing else for you right now.', 'warn');
    st.daily[i] = fresh;
    st.rr = day;
    g.msg(s.id, 'The keeper pins up a different notice for you.', 'info');
    s.wantsSave = true;
  }

  /** Buys from the seal shop (index into SEAL_SHOP). */
  buy(s: Session, i: number): void {
    const g = this.game;
    const e = Number.isInteger(i) ? SEAL_SHOP[i] : undefined;
    if (!e || !isItem(e.id) || !this.atBoard(s)) return;
    const price = e.price, have = s.tasks.seals;
    if (have < price) return g.msg(s.id, `You need ${price} task seals for that (you have ${have}).`, 'warn');
    s.tasks.seals -= e.price;
    g.worldEvents.deliver(s, [{ id: e.id, qty: e.qty }], `Bought for ${price} task seals`);
    s.wantsSave = true;
  }

  /** Trades festival tokens at a task board while a festival is on (index into the festival's shop). */
  festivalTrade(s: Session, i: number): void {
    const g = this.game;
    const f = g.liveEvents.festival();
    if (!f) return g.msg(s.id, 'There is no festival on just now.', 'warn');
    const e = Number.isInteger(i) ? f.shop[i] : undefined;
    if (!e || (e.id !== 'seals' && !isItem(e.id)) || !this.atBoard(s)) return;
    const have = s.inventory.count(f.token);
    const token = ITEMS[f.token]?.name ?? f.token;
    if (have < e.price) return g.msg(s.id, `You need ${e.price} × ${token} for that (you carry ${have}).`, 'warn');
    s.inventory.removeById(f.token, e.price);
    g.events.emit({ type: 'inventoryChanged', to: s.id });
    if (e.id === 'seals') {
      this.addSeals(s, e.qty);
      g.msg(s.id, `You trade ${e.price} × ${token} for ${e.qty} task seals.`, 'loot');
    } else {
      g.worldEvents.deliver(s, [{ id: e.id, qty: e.qty }], `Traded for ${e.price} × ${token}`);
    }
    s.wantsSave = true;
  }

  /** Seals from raids, treasure caches and festival trades. */
  addSeals(s: Session, n: number): void {
    if (n <= 0) return;
    s.tasks.seals = Math.min(SEALS_MAX, s.tasks.seals + Math.floor(n));
    s.wantsSave = true;
  }

  // ================================================================ dialogue

  dialogueOptions(_s: Session, npcKey: string): DialogueOption[] {
    if (!NPCS[npcKey]?.tasks) return [];
    const out: DialogueOption[] = [
      { label: 'Show me the task board.', action: 'tasks:open' },
      { label: 'How does the board work?', action: 'tasks:help' },
    ];
    const f = this.game.liveEvents.festival();
    if (f) out.splice(1, 0, { label: 'Festival trades.', action: 'tasks:festival' });
    return out;
  }

  /** A `tasks:…` dialogue action. Returns the keeper's new line, if any. */
  dialogueAction(s: Session, args: string[]): string | null {
    const g = this.game;
    switch (args[0]) {
      case 'open':
        this.ensure(s);
        g.events.emit({ type: 'tasksOpen', tab: 'daily', to: s.id });
        return s.tutorial.state === 'active' ? 'Finish your training on the isle first; then the board will have work for you.' : 'Here is what the board holds for you today.';
      case 'festival': {
        const f = g.liveEvents.festival();
        if (!f) return 'There is no festival on just now.';
        g.events.emit({ type: 'tasksOpen', tab: 'festival', to: s.id });
        return 'Festival tokens? Let us see what you have brought.';
      }
      case 'help': return BOARD_HELP;
    }
    return null;
  }
}

/** Applies the own client's `tk` view. */
export function applyTasksView(st: TaskState, v: TaskState): void {
  applyTaskState(st, v);
}

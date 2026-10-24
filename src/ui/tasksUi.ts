import type { Controller } from '../client/Controller';
import { chebyshev } from '../game/core/types';
import { ENEMIES } from '../game/enemies/enemyDefs';
import { skillDef, type NonCombatSkill } from '../game/gathering/skills';
import { ITEMS, itemDef } from '../game/inventory/items';
import { festivalWindow } from '../game/liveops/festivals';
import { BOARD_RANGE } from '../game/liveops/TaskSystem';
import { nextDailyReset, nextWeeklyReset, SEAL_SHOP, streakBonus, taskDay, taskDone, type ShopEntry, type TaskInst } from '../game/liveops/tasks';
import { NPCS } from '../game/npc/npcs';
import { trName, trText } from '../i18n/gameText';
import { fmtNum, getLang, onLangChange, t } from '../i18n/i18n';
import { button, el, paintSlot } from './dom';
import './liveops.css';

type Tab = 'daily' | 'weekly' | 'shop' | 'festival';

/** "5 h 12 min", "2 d 4 h", "40 min". */
export function spanText(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m >= 48 * 60) return t('{d} d {h} h', { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60) });
  if (m >= 60) return t('{h} h {m} min', { h: Math.floor(m / 60), m: m % 60 });
  return t('{m} min', { m });
}

/** What a task asks for, in the player's language. */
export function taskText(task: TaskInst): string {
  switch (task.k) {
    case 'hunt': return t('Slay {n} × {name}', { n: fmtNum(task.n, 0), name: trName(ENEMIES[task.t as keyof typeof ENEMIES]?.name ?? task.t) });
    case 'skill': return t('Earn {n} experience in {skill}', { n: fmtNum(task.n, 0), skill: trName(skillDef(task.t as NonCombatSkill)?.name ?? task.t) });
    case 'deliver': return t('Bring {n} × {name} to a task board', { n: fmtNum(task.n, 0), name: trName(ITEMS[task.t]?.name ?? task.t) });
    case 'explore': return t('Travel to {place}', { place: trName(task.t) });
  }
}

/** A hint under the task: how it is done. */
function taskHint(task: TaskInst): string {
  switch (task.k) {
    case 'hunt': return t('Every kill you help with counts, in a party too.');
    case 'skill': return trText(skillDef(task.t as NonCombatSkill)?.hint ?? '');
    case 'deliver': return t('Gather or buy them, then hand them in at any task board.');
    case 'explore': return t('Walk into the place: the task is done as soon as you arrive.');
  }
}

/**
 * The task board window (rules in game/liveops/): daily and weekly tasks with their
 * progress and rewards, the seal shop and, during a festival, its trades. Opened by a
 * task-board keeper (event `tasksOpen`) or the Tasks button in the control bar. Every
 * action is a `task` command; the server checks that a board is near.
 */
export class TasksUi {
  private readonly win: HTMLElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private tab: Tab = 'daily';
  private key = '';
  private timer = 0;
  private toolBtn: HTMLButtonElement | null = null;

  constructor(private readonly ctl: Controller, private readonly hudRoot: HTMLElement) {
    this.win = el('div', 'window tasks-win', hudRoot);
    this.win.hidden = true;
    const head = el('div', 'win-head', this.win);
    this.title = el('span', 'win-title', head, t('Task board'));
    button(head, '✕', () => this.toggle(false), 'btn tiny').setAttribute('aria-label', t('Close'));
    this.body = el('div', 'win-body tk-body', this.win);
    this.win.addEventListener('mousedown', () => { this.win.style.zIndex = '60'; });
    this.win.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.toggle(false);
      e.stopPropagation();
    });
    ctl.game.events.on((e) => {
      if (e.type === 'tasksOpen' && e.to === ctl.pid) {
        this.tab = e.tab === 'festival' ? 'festival' : 'daily';
        this.toggle(true);
      }
    });
    onLangChange(() => {
      this.title.textContent = t('Task board');
      if (this.toolBtn) this.toolBtn.textContent = t('Tasks');
      this.key = '';
    });
  }

  toggle(open = this.win.hidden): void {
    this.win.hidden = !open;
    if (open) {
      this.win.style.zIndex = '60';
      this.key = '';
      this.timer = 0;
    }
  }

  /** Whether a task-board keeper stands within reach (the server checks again). */
  private nearBoard(): boolean {
    const g = this.ctl.game;
    const p = g.getPlayer(this.ctl.pid);
    if (!p) return false;
    return g.npcs.some((n) => n.z === p.z && !!NPCS[n.key]?.tasks && chebyshev(n.x, n.y, p.x, p.y) <= BOARD_RANGE);
  }

  update(dt: number): void {
    if (!this.toolBtn || !this.toolBtn.isConnected) this.mountButton();
    if (this.win.hidden) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const s = this.ctl.game.session(this.ctl.pid);
    if (!s) return;
    const { now } = this.ctl.game.liveEvents.clientView();
    const fest = this.ctl.game.liveEvents.festival();
    const carry = fest ? s.inventory.count(fest.token) : 0;
    const key = JSON.stringify([s.tasks, this.tab, this.nearBoard(), getLang(), Math.floor(now / 60_000), fest?.id ?? '', carry, s.tutorial.state,
      this.tab === 'daily' || this.tab === 'weekly' ? [...s.tasks.daily, ...s.tasks.weekly].filter((x) => x.k === 'deliver').map((x) => s.inventory.count(x.t)) : 0]);
    if (key === this.key) return;
    this.key = key;
    this.draw(now);
  }

  /** A Tasks button in the control bar (the HUD's own buttons stay as they are). */
  private mountButton(): void {
    const bar = this.hudRoot.querySelector('.ctrl-bar');
    if (!bar) return;
    this.toolBtn = button(bar as HTMLElement, t('Tasks'), () => this.toggle(), 'btn tool live-tool');
    this.toolBtn.title = t('Your daily and weekly tasks, task seals and the seal shop');
  }

  private draw(now: number): void {
    const s = this.ctl.game.session(this.ctl.pid);
    if (!s) return;
    const st = s.tasks;
    const near = this.nearBoard();
    const fest = this.ctl.game.liveEvents.festival();
    if (this.tab === 'festival' && !fest) this.tab = 'daily';
    const b = this.body;
    b.replaceChildren();

    const top = el('div', 'tk-chips', b);
    el('span', 'tk-chip gold', top, t('{n} task seal|{n} task seals', { n: st.seals }));
    const bonus = Math.round(streakBonus(st.streak) * 100);
    const streak = el('span', 'tk-chip', top, bonus > 0 ? t('Login streak {n} day (+{p}%)|Login streak {n} days (+{p}%)', { n: st.streak, p: bonus }) : t('Login streak {n} day|Login streak {n} days', { n: st.streak }));
    streak.title = t('Log in every day: each day in a row adds 5% to task experience and gold, up to 30%. Best streak: {n} days.', { n: st.best });
    el('span', 'tk-chip', top, t('Daily reset in {t}', { t: spanText(nextDailyReset(now) - now) }));
    el('span', 'tk-chip', top, t('Weekly reset in {t}', { t: spanText(nextWeeklyReset(now) - now) }));

    const tabs = el('div', 'tk-tabs', b);
    const tabBtn = (id: Tab, label: string) => {
      const x = button(tabs, label, () => { this.tab = id; this.key = ''; this.timer = 0; }, `btn small${this.tab === id ? ' on' : ''}`);
      x.setAttribute('aria-pressed', String(this.tab === id));
    };
    tabBtn('daily', t('Daily'));
    tabBtn('weekly', t('Weekly'));
    tabBtn('shop', t('Seal shop'));
    if (fest) tabBtn('festival', trName(fest.name));

    el('p', `hint${near ? '' : ' warn'}`, b, near ? t('You stand at a task board: collect rewards, hand in goods and shop here.') : t('Progress counts anywhere. To collect rewards, hand in goods or shop, go to the task board in any town.'));
    if (s.tutorial.state === 'active') {
      el('p', 'hint', b, t('The task boards open once you leave Wayfarer\'s Isle.'));
      return;
    }

    if (this.tab === 'daily' || this.tab === 'weekly') {
      const weekly = this.tab === 'weekly';
      const list = weekly ? st.weekly : st.daily;
      if (!list.length) el('p', 'hint', b, t('Your board fills in a moment…'));
      const rerolled = st.rr === taskDay(now);
      list.forEach((task, i) => this.drawTask(b, task, i, weekly, near, rerolled));
      if (!weekly) el('p', 'hint', b, rerolled ? t('You swapped a task today. The next swap comes with the daily reset.') : t('Once a day you may swap one unfinished daily task for another.'));
      return;
    }
    if (this.tab === 'shop') {
      el('p', 'hint', b, t('Seals come from tasks, logging in, defending towns in raids and treasure caches. Nothing here has stats: only potions, runes, pet treats and capes that look good.'));
      const grid = el('div', 'tk-shop', b);
      SEAL_SHOP.forEach((e, i) => this.drawShopRow(grid, e, t('{n} seal|{n} seals', { n: e.price }), st.seals >= e.price, near, () => this.ctl.send({ c: 'task', a: 'buy', i })));
      return;
    }
    if (fest) {
      const w = festivalWindow(fest, now);
      el('p', 'hint', b, t('{name} until {date}. Monsters everywhere drop {token}; the festival boss walks into a town four times a day.', {
        name: trName(fest.name), date: new Date(w.end - 1).toLocaleDateString(getLang() === 'en' ? 'en-GB' : getLang(), { day: 'numeric', month: 'long', timeZone: 'UTC' }), token: trName(itemDef(fest.token).name),
      }));
      const have = s.inventory.count(fest.token);
      el('span', 'tk-chip gold', el('div', 'tk-chips', b), t('You carry {n} × {token}', { n: have, token: trName(itemDef(fest.token).name) }));
      const grid = el('div', 'tk-shop', b);
      fest.shop.forEach((e, i) => this.drawShopRow(grid, e, `${e.price} × ${trName(itemDef(fest.token).name)}`, have >= e.price, near, () => this.ctl.send({ c: 'task', a: 'festival', i })));
    }
  }

  private drawTask(parent: HTMLElement, task: TaskInst, i: number, weekly: boolean, near: boolean, rerolled: boolean): void {
    const row = el('div', `tk-task${task.c ? ' claimed' : taskDone(task) ? ' done' : ''}`, parent);
    const head = el('div', 'tk-task-head', row);
    el('span', 'tk-dia', head);
    el('span', 'tk-task-name', head, taskText(task));
    if (task.c) el('span', 'tk-state', head, t('Collected'));
    else if (taskDone(task)) el('span', 'tk-state ready', head, t('Done!'));
    el('div', 'tk-hint', row, taskHint(task));
    const bar = el('div', 'tk-bar', row);
    const fill = el('div', 'tk-bar-fill', bar);
    fill.style.width = `${Math.round((task.h / task.n) * 100)}%`;
    el('div', 'tk-bar-text', bar, task.k === 'explore' ? (task.h ? t('Arrived') : t('Not there yet')) : `${fmtNum(task.h, 0)} / ${fmtNum(task.n, 0)}`);
    const foot = el('div', 'tk-foot', row);
    const s = this.ctl.game.session(this.ctl.pid);
    const bonus = 1 + streakBonus(s?.tasks.streak ?? 0);
    el('span', 'tk-reward', foot, t('+{n} exp', { n: fmtNum(Math.round(task.x * bonus), 0) }));
    el('span', 'tk-reward', foot, t('+{n} gold', { n: fmtNum(Math.round(task.g * bonus), 0) }));
    el('span', 'tk-reward gold', foot, t('+{n} seals', { n: task.s }));
    el('span', 'tk-spacer', foot);
    if (!task.c && taskDone(task)) {
      const c = button(foot, t('Collect'), () => this.ctl.send({ c: 'task', a: 'claim', i, w: weekly ? 1 : 0 }), 'btn small on');
      c.disabled = !near;
      if (!near) c.title = t('Go to a task board to collect');
    } else if (!task.c && task.k === 'deliver') {
      const have = s?.inventory.count(task.t) ?? 0;
      const d = button(foot, t('Hand in ({n})', { n: have }), () => this.ctl.send({ c: 'task', a: 'deliver', i, w: weekly ? 1 : 0 }), 'btn small');
      d.disabled = !near || have <= 0;
    }
    if (!weekly && !task.c && !taskDone(task)) {
      const r = button(foot, t('Swap'), () => this.ctl.send({ c: 'task', a: 'reroll', i }), 'btn small');
      r.disabled = !near || rerolled;
      r.title = rerolled ? t('You swapped a task today') : t('Swap this task for another (once a day)');
    }
  }

  private drawShopRow(parent: HTMLElement, e: ShopEntry, price: string, afford: boolean, near: boolean, buy: () => void): void {
    const row = el('div', 'tk-shop-row', parent);
    const slot = el('div', 'slot tk-slot', row);
    if (e.id === 'seals') el('span', 'tk-seal', slot, '◆');
    else paintSlot(slot, { id: e.id, qty: e.qty });
    const name = e.id === 'seals' ? t('{n} task seal|{n} task seals', { n: e.qty }) : `${trName(itemDef(e.id).name)}${e.qty > 1 ? ` × ${e.qty}` : ''}`;
    el('span', 'tk-shop-name', row, name);
    el('span', `tk-price${afford ? '' : ' short'}`, row, price);
    const btn = button(row, t('Get'), buy, 'btn small');
    btn.disabled = !near || !afford;
    if (!near) btn.title = t('Go to a task board to shop');
  }
}

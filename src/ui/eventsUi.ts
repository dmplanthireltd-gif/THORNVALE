import type { Controller } from '../client/Controller';
import { RAIDS, WORLD_BOSSES } from '../game/bosses/bosses';
import { ENEMIES } from '../game/enemies/enemyDefs';
import type { LiveKind } from '../game/liveops/calendar';
import { RAID_HOUR_UTC, TREASURE_HOUR_UTC, WORLD_BOSS_HOUR_UTC } from '../game/liveops/calendar';
import { FESTIVAL_BY_ID, FESTIVALS, festivalWindow } from '../game/liveops/festivals';
import type { LiveView } from '../game/liveops/LiveEvents';
import { trName } from '../i18n/gameText';
import { getLang, onLangChange, t } from '../i18n/i18n';
import { button, el } from './dom';
import { spanText } from './tasksUi';
import './liveops.css';

const locale = () => (getLang() === 'en' ? 'en-GB' : getLang());

/** Name of an active event or calendar entry, in the player's language. */
function entryName(kind: LiveKind, id: string): string {
  switch (kind) {
    case 'raid': {
      const r = RAIDS.find((x) => x.id === id);
      return r ? t('Raid: {name} on {town}', { name: trName(r.name), town: trName(r.town) }) : t('Raid');
    }
    case 'worldboss': {
      // the calendar names a world boss by its place in the list, the live view by its kind
      const kind2 = /^\d+$/.test(id) ? WORLD_BOSSES[Number(id)]?.kind : id;
      const d = kind2 ? ENEMIES[kind2 as keyof typeof ENEMIES] : null;
      return d ? t('World boss: {name}', { name: trName(d.name) }) : t('World boss');
    }
    case 'treasure': return t('Treasure hunt');
    case 'miniboss': {
      const f = FESTIVAL_BY_ID[id];
      return f ? t('Festival boss: {name}', { name: trName(ENEMIES[f.boss].name) }) : t('Festival boss');
    }
    case 'festival': return trName(FESTIVAL_BY_ID[id]?.name ?? id);
    case 'double_exp': return t('Double experience');
    case 'double_skill': return t('Double skill');
  }
}

/**
 * World events on the HUD (rules in game/liveops/): a strip of what is on right now
 * along the top of the game view (festival, double weekend, raid, world boss, festival
 * boss, treasure hunt, with time left), and the Events window with the calendar of
 * the next seven days and the treasure hunt's Seek button. Mounted by main.ts next
 * to the HUD; the Events button goes into the control bar.
 */
export class EventsUi {
  private readonly strip: HTMLElement;
  private readonly win: HTMLElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private key = '';
  private stripKey = '';
  private timer = 0;
  private toolBtn: HTMLButtonElement | null = null;

  constructor(private readonly ctl: Controller, private readonly hudRoot: HTMLElement) {
    this.strip = el('div', 'live-strip', hudRoot);
    this.strip.hidden = true;
    this.strip.title = t('World events: click for the calendar');
    this.strip.addEventListener('click', () => this.toggle(true));
    this.win = el('div', 'window events-win', hudRoot);
    this.win.hidden = true;
    const head = el('div', 'win-head', this.win);
    this.title = el('span', 'win-title', head, t('World events'));
    button(head, '✕', () => this.toggle(false), 'btn tiny').setAttribute('aria-label', t('Close'));
    this.body = el('div', 'win-body ev-body', this.win);
    this.win.addEventListener('mousedown', () => { this.win.style.zIndex = '60'; });
    this.win.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.toggle(false);
      e.stopPropagation();
    });
    onLangChange(() => {
      this.title.textContent = t('World events');
      if (this.toolBtn) this.toolBtn.textContent = t('Events');
      this.strip.title = t('World events: click for the calendar');
      this.key = this.stripKey = '';
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

  private mountButton(): void {
    const bar = this.hudRoot.querySelector('.ctrl-bar');
    if (!bar) return;
    this.toolBtn = button(bar as HTMLElement, t('Events'), () => this.toggle(), 'btn tool live-tool');
    this.toolBtn.title = t('World events: what is on now and the calendar');
  }

  update(dt: number): void {
    if (!this.toolBtn || !this.toolBtn.isConnected) this.mountButton();
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const { v, now } = this.ctl.game.liveEvents.clientView();
    this.drawStrip(v, now);
    if (this.win.hidden) return;
    const key = JSON.stringify([v?.a, v?.c?.length, v?.c?.[0], v?.tr, getLang(), Math.floor(now / 30_000)]);
    if (key === this.key) return;
    this.key = key;
    this.draw(v, now);
  }

  private drawStrip(v: LiveView | null, now: number): void {
    const active = v?.a ?? [];
    const key = JSON.stringify([active, getLang(), Math.floor(now / 30_000)]);
    if (key === this.stripKey) return;
    this.stripKey = key;
    this.strip.replaceChildren();
    this.strip.hidden = !active.length;
    for (const [kind, id, ends, n] of active) {
      const chip = el('span', `live-chip k-${kind}`, this.strip);
      el('span', 'live-dia', chip);
      el('span', 'live-name', chip, entryName(kind, id));
      const bits: string[] = [];
      if (kind === 'treasure') bits.push(t('{n} cache left|{n} caches left', { n }));
      if (kind === 'worldboss' && !ends) bits.push(t('coming'));
      if (ends > now) bits.push(spanText(ends - now));
      if (bits.length) el('span', 'live-time', chip, bits.join(' · '));
    }
  }

  private draw(v: LiveView | null, now: number): void {
    const b = this.body;
    b.replaceChildren();
    if (!v) {
      el('p', 'hint', b, t('Waiting for the server…'));
      return;
    }
    el('div', 'panel-title', b, t('On now'));
    if (!v.a.length) el('p', 'hint', b, t('Nothing special right now. Raids and world bosses can also come at any time, without a date in the calendar.'));
    for (const [kind, id, ends, n] of v.a) {
      const row = el('div', `ev-row k-${kind}`, b);
      el('span', 'tk-dia', row);
      el('span', 'ev-name', row, entryName(kind, id));
      el('span', 'ev-when', row, ends > now ? t('{t} left', { t: spanText(ends - now) }) : kind === 'worldboss' ? t('coming') : '');
      if (kind === 'treasure') {
        const box = el('div', 'ev-treasure', b);
        el('p', 'hint', box, t('{n} caches are still hidden. Use Seek to learn which way the nearest one lies; stand on it or beside it and Seek again to dig it up. Each holds gold, a gem or potions and {s} task seals.', { n, s: 4 }));
        if (v.tr?.length) el('p', 'hint', box, t('Hidden in: {places}', { places: v.tr.map((r) => trName(r)).join(', ') }));
        button(box, t('Seek'), () => this.ctl.send({ c: 'live', a: 'seek' }), 'btn on ev-seek');
      }
    }

    el('div', 'panel-title', b, t('Calendar'));
    el('p', 'hint', b, t('Every day: treasure hunt at {th}:00 and a raid at {rh}:00. Saturday and Sunday: a world boss at {wh}:00. Times are UTC; your own clock is shown beside them.', { th: TREASURE_HOUR_UTC, rh: RAID_HOUR_UTC, wh: WORLD_BOSS_HOUR_UTC }));
    const list = el('div', 'ev-cal', b);
    let lastDay = '';
    for (const [at, kind, id] of v.c) {
      if (kind === 'festival') continue;
      const d = new Date(at);
      const day = d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
      if (day !== lastDay) {
        el('div', 'ev-day', list, day);
        lastDay = day;
      }
      const row = el('div', `ev-row k-${kind}`, list);
      el('span', 'ev-time', row, `${d.toISOString().slice(11, 16)} UTC`);
      el('span', 'ev-local', row, d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }));
      el('span', 'ev-name', row, entryName(kind, id));
      if (at > now) el('span', 'ev-when', row, t('in {t}', { t: spanText(at - now) }));
    }

    el('div', 'panel-title', b, t('Festivals'));
    for (const f of FESTIVALS) {
      const w = festivalWindow(f, now);
      const fmt = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'long', timeZone: 'UTC' });
      const row = el('div', 'ev-row k-festival', b);
      el('span', 'tk-dia', row);
      el('span', 'ev-name', row, trName(f.name));
      el('span', 'ev-when', row, `${fmt(w.start)} – ${fmt(w.end - 1)}`);
    }
  }
}

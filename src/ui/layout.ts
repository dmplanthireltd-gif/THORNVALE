import { t } from '../i18n/i18n';
import { el } from './dom';

/**
 * The in-game layout, in the spirit of the classic client (owner request 2026-10-24):
 *  - the game view on the left/centre, one or two side columns on the right (and an optional left
 *    column) holding stackable mini-windows: drag a window by its title bar to another place or
 *    column, minimise it to its title bar, close it (reopen it from the Windows menu), drag its bottom
 *    edge to make it taller or shorter (double-click: automatic height);
 *  - the chat under the game view (drag its top edge for height);
 *  - the action bars and the health/mana bar are "bars": drag them by their grip to any edge of the
 *    game view (they dock there and the view makes room) or anywhere over it (free);
 *  - "Lock layout" hides every grip and handle so nothing moves by accident;
 *  - phones / narrow windows: the side columns become a drawer (topbar button "Panels").
 * Everything is remembered in this browser (`thornvale.ui.v3`). No game state lives here.
 */
const KEY = 'thornvale.ui.v3';

export type ColId = 'left' | 'right2' | 'right';
export const WIN_IDS = ['map', 'status', 'combat', 'equipment', 'pockets', 'backpack', 'skills', 'battle', 'party', 'friends', 'quests'] as const;
export type WinId = (typeof WIN_IDS)[number];
export const BAR_IDS = ['vitals', 'hotbar1', 'hotbar2'] as const;
export type BarId = (typeof BAR_IDS)[number];
export type Dock = 'top' | 'bottom' | 'left' | 'right' | 'free';
export type Preset = 'classic' | 'flanks' | 'full';

interface WinState { col: ColId; i: number; min: boolean; closed: boolean; h: number }
interface BarState { dock: Dock; i: number; x: number; y: number }
export interface UiState {
  v: 3;
  preset: Preset;
  left: boolean;
  right2: boolean;
  colW: number;
  chatH: number;
  locked: boolean;
  full: boolean;
  wins: Record<WinId, WinState>;
  bars: Record<BarId, BarState>;
}

/** Windows that may shrink to fit their column (their content scrolls); the others keep their size. */
const SHRINKS: ReadonlySet<WinId> = new Set<WinId>(['battle', 'skills', 'pockets', 'backpack', 'party', 'friends', 'quests']);
const COL_W = 236;
const COL_MIN = 196;
const COL_MAX = 360;
const CHAT_H = 160;
const CHAT_H_PHONE = 124;
const PHONE = '(max-width: 720px)';

function isPhone(): boolean {
  try { return window.matchMedia(PHONE).matches; } catch { return false; }
}

function win(col: ColId, i: number, extra: Partial<WinState> = {}): WinState {
  return { col, i, min: false, closed: false, h: 0, ...extra };
}

/** The layout a new player gets (and "Reset layout" / the presets in Settings). */
export function defaultState(preset: Preset = 'classic', w = typeof window === 'undefined' ? 1600 : window.innerWidth): UiState {
  const phone = isPhone();
  const two = !phone && w >= 1280;
  const s: UiState = {
    v: 3, preset, left: false, right2: two, colW: COL_W, chatH: phone ? CHAT_H_PHONE : CHAT_H, locked: false, full: false,
    wins: {
      map: win('right', 0), status: win('right', 1), equipment: win('right', 2),
      combat: win(two ? 'right2' : 'right', 3), battle: win(two ? 'right2' : 'right', 4), skills: win(two ? 'right2' : 'right', 5),
      party: win(two ? 'right2' : 'right', 6, { closed: true }), friends: win(two ? 'right2' : 'right', 7, { closed: true }),
      quests: win(two ? 'right2' : 'right', 8, { closed: true }), pockets: win(two ? 'right2' : 'right', 9), backpack: win(two ? 'right2' : 'right', 10),
    },
    bars: {
      vitals: { dock: 'top', i: 0, x: 0.5, y: 0.08 },
      hotbar1: { dock: 'bottom', i: 0, x: 0.5, y: 0.9 },
      // the second row (Ctrl+number) stands along the left edge of the view on wide screens, so the view keeps its height
      hotbar2: { dock: phone || w < 1100 ? 'bottom' : 'left', i: 1, x: 0.5, y: 0.75 },
    },
  };
  if (!two && !phone) s.wins.skills.min = true;
  if (preset === 'flanks') {
    // the old "two flanks" look: character, combat, skills, battle and party on the left; map, equipment and bags on the right
    s.left = !phone;
    s.right2 = false;
    const L: WinId[] = ['status', 'combat', 'skills', 'battle', 'party'];
    const R: WinId[] = ['map', 'equipment', 'pockets', 'backpack', 'friends', 'quests'];
    L.forEach((id, i) => { s.wins[id].col = s.left ? 'left' : 'right'; s.wins[id].i = i; });
    R.forEach((id, i) => { s.wins[id].col = 'right'; s.wins[id].i = 10 + i; });
    s.wins.skills.min = false;
    s.bars.hotbar2 = { dock: 'bottom', i: 1, x: 0.5, y: 0.75 };
  } else if (preset === 'full') {
    // the game view fills the screen; the windows float over its sides
    s.full = true;
    s.left = !phone;
    s.right2 = false;
    const L: WinId[] = ['status', 'combat', 'skills'];
    const R: WinId[] = ['map', 'battle', 'party', 'equipment', 'pockets', 'backpack', 'friends', 'quests'];
    L.forEach((id, i) => { s.wins[id].col = s.left ? 'left' : 'right'; s.wins[id].i = i; });
    R.forEach((id, i) => { s.wins[id].col = 'right'; s.wins[id].i = 10 + i; });
    s.wins.skills.min = true;
    s.bars.hotbar2 = { dock: 'bottom', i: 1, x: 0.5, y: 0.75 };
  }
  return s;
}

function num(v: unknown, lo: number, hi: number, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;
}

/** Reads the saved layout; anything missing or broken falls back to the default. */
function load(): UiState {
  const d = defaultState();
  let raw: unknown = null;
  try {
    const txt = localStorage.getItem(KEY);
    raw = txt ? JSON.parse(txt) : null;
  } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return migrateOld(d);
  const r = raw as Partial<UiState>;
  const cols: ColId[] = ['left', 'right2', 'right'];
  const docks: Dock[] = ['top', 'bottom', 'left', 'right', 'free'];
  const s: UiState = {
    ...d,
    preset: r.preset === 'flanks' || r.preset === 'full' ? r.preset : 'classic',
    left: !!r.left, right2: r.right2 === undefined ? d.right2 : !!r.right2,
    colW: num(r.colW, COL_MIN, COL_MAX, d.colW), chatH: num(r.chatH, 80, 2000, d.chatH),
    locked: !!r.locked, full: !!r.full,
  };
  for (const id of WIN_IDS) {
    const w = r.wins?.[id];
    if (w && typeof w === 'object') {
      s.wins[id] = {
        col: cols.includes(w.col) ? w.col : d.wins[id].col, i: num(w.i, -1e6, 1e6, d.wins[id].i),
        min: !!w.min, closed: !!w.closed, h: num(w.h, 0, 4000, 0),
      };
    }
  }
  for (const id of BAR_IDS) {
    const b = r.bars?.[id];
    if (b && typeof b === 'object') s.bars[id] = { dock: docks.includes(b.dock) ? b.dock : d.bars[id].dock, i: num(b.i, -1e6, 1e6, d.bars[id].i), x: num(b.x, 0, 1, 0), y: num(b.y, 0, 1, 0) };
  }
  return s;
}

/** First visit with the new layout: carry over what the old HUD remembered (full view, folded panels). */
function migrateOld(d: UiState): UiState {
  try {
    if (localStorage.getItem('thornvale.hudLayout') === 'full') d = defaultState('full');
    if (localStorage.getItem('thornvale.skillsFolded') === '1') d.wins.skills.min = true;
    if (localStorage.getItem('thornvale.battleFolded') === '1') d.wins.battle.min = true;
  } catch { /* storage off */ }
  return d;
}

function store(s: UiState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage off: this visit only */ }
}

export interface MiniWin {
  id: WinId;
  root: HTMLDivElement;
  head: HTMLDivElement;
  title: HTMLSpanElement;
  /** Room in the title bar for extra info (floor, counts), left of the buttons. */
  extra: HTMLSpanElement;
  body: HTMLDivElement;
}

interface Bar {
  id: BarId;
  root: HTMLDivElement;
}

/** Puts the windows and bars where the saved layout says and lets the player move them. */
export class Layout {
  state: UiState;
  private cols: Record<ColId, HTMLDivElement>;
  private drawer: HTMLDivElement;
  private docks: Record<Exclude<Dock, 'free'>, HTMLDivElement>;
  private free: HTMLDivElement;
  private wins = new Map<WinId, MiniWin>();
  private bars = new Map<BarId, Bar>();
  private phone = false;
  private resizeQueued = false;
  /** Called when a window is shown or hidden (open = shown and not minimised). */
  onVisible: (id: WinId, shown: boolean) => void = () => {};
  /** Called after any change, so menus and Settings can relabel. */
  onChange: () => void = () => {};

  constructor(private readonly root: HTMLElement, readonly bottom: HTMLElement, readonly ctrl: HTMLElement) {
    this.state = load();
    const col = (id: ColId) => {
      const c = el('div', `mw-col col-${id}`, root);
      c.dataset.col = id;
      return c;
    };
    this.cols = { left: col('left'), right2: col('right2'), right: col('right') };
    this.cols.right.prepend(ctrl);
    this.drawer = el('div', 'mw-drawer', root);
    const dock = (id: Exclude<Dock, 'free'>) => {
      const d = el('div', `edge-dock dock-${id}`, root);
      d.dataset.dock = id;
      new ResizeObserver(() => this.measureDocks()).observe(d);
      return d;
    };
    this.docks = { top: dock('top'), bottom: dock('bottom'), left: dock('left'), right: dock('right') };
    this.free = el('div', 'free-layer', root);
    this.buildEdges();
    let mq: MediaQueryList | null = null;
    try { mq = window.matchMedia(PHONE); } catch { mq = null; }
    mq?.addEventListener('change', () => this.apply());
    window.addEventListener('resize', () => this.placeFree());
  }

  // ---------------------------------------------------------------- building

  /** Adds a mini-window (title is already translated). It starts where the saved layout puts it. */
  addWindow(id: WinId, title: string, bodyCls: string, tip = ''): MiniWin {
    const root = el('div', `mw mw-${id}`);
    root.dataset.win = id;
    if (SHRINKS.has(id)) root.classList.add('shrinks');
    const head = el('div', 'mw-head', root);
    const tt = el('span', 'mw-title', head, title);
    if (tip) head.title = tip;
    const extra = el('span', 'mw-extra', head);
    const min = el('button', 'mw-btn mw-min', head, '−');
    min.type = 'button';
    min.title = t('Minimise / restore');
    min.setAttribute('aria-label', t('Minimise / restore'));
    min.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMin(id); min.blur(); });
    const close = el('button', 'mw-btn mw-close', head, '✕');
    close.type = 'button';
    close.title = t('Close (reopen it from Windows)');
    close.setAttribute('aria-label', t('Close'));
    close.addEventListener('click', (e) => { e.stopPropagation(); this.setClosed(id, true); close.blur(); });
    const body = el('div', `mw-body ${bodyCls}`, root);
    const rs = el('div', 'mw-resize', root);
    rs.title = t('Drag to resize · double-click: automatic height');
    const w: MiniWin = { id, root, head, title: tt, extra, body };
    this.wins.set(id, w);
    this.dragWindow(w);
    this.resizeWindow(w, rs);
    return w;
  }

  /** Adds a movable bar (action bars, health/mana). */
  addBar(id: BarId, content: HTMLElement, title: string): HTMLDivElement {
    const root = el('div', `fbar fbar-${id}`);
    root.dataset.bar = id;
    const grip = el('div', 'fbar-grip', root);
    grip.title = t('Drag to move: to an edge of the game view to dock it there, or anywhere over the view');
    grip.setAttribute('aria-label', title);
    root.appendChild(content);
    this.bars.set(id, { id, root });
    this.dragBar(root, id, grip);
    return root;
  }

  // ---------------------------------------------------------------- state changes

  isShown(id: WinId): boolean {
    const s = this.state.wins[id];
    return !s.closed;
  }

  isOpen(id: WinId): boolean {
    const s = this.state.wins[id];
    return !s.closed && !s.min;
  }

  setClosed(id: WinId, closed: boolean): void {
    const s = this.state.wins[id];
    if (s.closed === closed && (closed || !s.min)) return;
    s.closed = closed;
    if (!closed) {
      s.min = false;
      // bring it back into a column that is shown
      if (!this.colShown(s.col)) s.col = 'right';
    }
    this.commit();
  }

  toggle(id: WinId, on?: boolean): void {
    this.setClosed(id, !(on ?? !this.isOpen(id)));
  }

  toggleMin(id: WinId): void {
    const s = this.state.wins[id];
    s.min = !s.min;
    this.commit();
  }

  setLocked(on: boolean): void {
    this.state.locked = on;
    this.commit();
  }

  /** Shows or hides a side column; windows of a hidden column move to the right column. */
  setColumn(col: 'left' | 'right2', on: boolean): void {
    this.state[col] = on;
    if (!on) {
      let n = 1000;
      for (const id of WIN_IDS) if (this.state.wins[id].col === col) { this.state.wins[id].col = 'right'; this.state.wins[id].i = n++; }
    }
    this.commit();
  }

  applyPreset(p: Preset): void {
    const keepLock = this.state.locked;
    this.state = defaultState(p);
    this.state.locked = keepLock;
    this.commit();
  }

  reset(): void {
    this.state = defaultState('classic');
    this.commit();
  }

  private commit(): void {
    store(this.state);
    this.apply();
    this.onChange();
  }

  private colShown(c: ColId): boolean {
    return c === 'right' || (c === 'left' ? this.state.left : this.state.right2);
  }

  // ---------------------------------------------------------------- applying the state to the page

  /** Puts every window and bar where the state says and sets the frame sizes. */
  apply(): void {
    const s = this.state;
    const html = document.documentElement;
    this.phone = isPhone();
    html.classList.toggle('ui-phone', this.phone);
    if (!this.phone) html.classList.remove('ui-drawer');
    html.classList.toggle('ui-full', s.full && !this.phone);
    html.classList.toggle('ui-locked', s.locked);
    html.classList.toggle('ui-left', s.left);
    html.classList.toggle('ui-right2', s.right2);
    const framed = !this.phone && !s.full;
    const st = html.style;
    st.setProperty('--colw', `${s.colW}px`);
    st.setProperty('--left', framed && s.left ? `${s.colW}px` : '0px');
    st.setProperty('--side', framed ? `${s.colW * (s.right2 ? 2 : 1)}px` : '0px');
    const chat = Math.max(80, Math.min(Math.floor(window.innerHeight * 0.6), s.chatH));
    st.setProperty('--chath', `${chat}px`);
    st.setProperty('--bottom', s.full && !this.phone ? '0px' : `${chat}px`);

    // columns: on a phone they live in the drawer, one under the other
    const order: ColId[] = ['right', 'right2', 'left'];
    for (const c of order) {
      const ce = this.cols[c];
      if (this.phone) { if (ce.parentElement !== this.drawer) this.drawer.appendChild(ce); }
      else if (ce.parentElement !== this.root) this.root.insertBefore(ce, this.drawer);
      ce.hidden = !this.colShown(c);
    }
    const list = [...WIN_IDS].sort((a, b) => s.wins[a].i - s.wins[b].i);
    for (const id of list) {
      const w = this.wins.get(id);
      if (!w) continue;
      const ws = s.wins[id];
      if (!this.colShown(ws.col)) ws.col = 'right';
      this.cols[ws.col].appendChild(w.root);
      const was = !w.root.hidden && !w.root.classList.contains('min');
      w.root.hidden = ws.closed;
      w.root.classList.toggle('min', ws.min);
      w.root.classList.toggle('sized', ws.h > 0 && !ws.min);
      w.root.style.height = ws.h > 0 && !ws.min ? `${ws.h}px` : '';
      const now = !ws.closed && !ws.min;
      if (was !== now) this.onVisible(id, now);
    }
    for (const c of order) this.cols[c].classList.toggle('empty', ![...this.cols[c].children].some((x) => x.classList.contains('mw') && !(x as HTMLElement).hidden));

    const bl = [...BAR_IDS].sort((a, b) => s.bars[a].i - s.bars[b].i);
    for (const id of bl) {
      const b = this.bars.get(id);
      if (!b) continue;
      const bs = s.bars[id];
      b.root.dataset.dock = bs.dock;
      const parent = bs.dock === 'free' ? this.free : this.docks[bs.dock];
      parent.appendChild(b.root);
    }
    this.placeFree();
    this.measureDocks();
  }

  /** Free bars: x/y say where in the game view the bar's centre sits (0…1), kept fully on screen. */
  private placeFree(): void {
    const W = this.free.clientWidth;
    const H = this.free.clientHeight;
    for (const b of this.bars.values()) {
      const bs = this.state.bars[b.id];
      if (bs.dock !== 'free') { b.root.style.left = ''; b.root.style.top = ''; continue; }
      const w = b.root.offsetWidth;
      const h = b.root.offsetHeight;
      b.root.style.left = `${Math.round(Math.max(0, Math.min(W - w, bs.x * W - w / 2)))}px`;
      b.root.style.top = `${Math.round(Math.max(0, Math.min(H - h, bs.y * H - h / 2)))}px`;
    }
  }

  /** The docked bars take room from the game view: tell the CSS (and the 3D view) how much. */
  private measureDocks(): void {
    const st = document.documentElement.style;
    const set = (name: string, px: number) => {
      const v = `${Math.round(px)}px`;
      if (st.getPropertyValue(name) !== v) { st.setProperty(name, v); this.queueResize(); }
    };
    set('--dt', this.docks.top.offsetHeight);
    set('--db', this.docks.bottom.offsetHeight);
    set('--dl', this.docks.left.offsetWidth);
    set('--dr', this.docks.right.offsetWidth);
  }

  private queueResize(): void {
    if (this.resizeQueued) return;
    this.resizeQueued = true;
    requestAnimationFrame(() => {
      this.resizeQueued = false;
      window.dispatchEvent(new Event('resize'));
    });
  }

  // ---------------------------------------------------------------- dragging windows

  /** Title bar: drag to move (to any shown column), a plain click minimises / restores. */
  private dragWindow(w: MiniWin): void {
    w.head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      const x0 = e.clientX;
      const y0 = e.clientY;
      let ph: HTMLDivElement | null = null;
      let dy = 0;
      const begin = () => {
        const r = w.root.getBoundingClientRect();
        dy = y0 - r.top;
        ph = el('div', 'mw-placeholder');
        ph.style.height = `${r.height}px`;
        w.root.after(ph);
        w.root.classList.add('mw-dragging');
        w.root.style.width = `${r.width}px`;
        w.root.style.left = `${r.left}px`;
        w.root.style.top = `${r.top}px`;
        document.documentElement.classList.add('ui-moving');
      };
      const move = (ev: PointerEvent) => {
        if (!ph) {
          if (this.state.locked || Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 6) return;
          begin();
        }
        const p = ph!;
        w.root.style.left = `${ev.clientX - w.root.offsetWidth / 2}px`;
        w.root.style.top = `${ev.clientY - dy}px`;
        const col = this.nearestCol(ev.clientX, ev.clientY);
        const others = [...col.children].filter((x): x is HTMLElement => x instanceof HTMLElement && x.classList.contains('mw') && x !== w.root && !x.hidden);
        const before = others.find((o) => { const r = o.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
        if (before) col.insertBefore(p, before);
        else col.appendChild(p);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!ph) {
          // a click on the title: fold or unfold (like the old Skills and Battle titles)
          this.toggleMin(w.id);
          return;
        }
        ph.replaceWith(w.root);
        w.root.classList.remove('mw-dragging');
        w.root.style.width = '';
        w.root.style.left = '';
        w.root.style.top = '';
        document.documentElement.classList.remove('ui-moving');
        this.readOrder();
        this.commit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  }

  /** The shown column closest to the pointer (columns stand side by side, or stacked in the drawer). */
  private nearestCol(x: number, y: number): HTMLDivElement {
    let best = this.cols.right;
    let bd = Infinity;
    for (const c of Object.values(this.cols)) {
      if (c.hidden) continue;
      const r = c.getBoundingClientRect();
      const d = (x < r.left ? r.left - x : x > r.right ? x - r.right : 0) + (y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** Reads the window order back from the page after a move. */
  private readOrder(): void {
    let n = 0;
    for (const c of ['left', 'right2', 'right'] as ColId[]) {
      for (const x of this.cols[c].children) {
        const id = (x as HTMLElement).dataset.win as WinId | undefined;
        if (!id) continue;
        this.state.wins[id].col = c;
        this.state.wins[id].i = n++;
      }
    }
  }

  private resizeWindow(w: MiniWin, rs: HTMLDivElement): void {
    rs.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.state.locked) return;
      e.preventDefault();
      e.stopPropagation();
      const y0 = e.clientY;
      const h0 = w.root.offsetHeight;
      const ws = this.state.wins[w.id];
      const move = (ev: PointerEvent) => {
        ws.h = Math.max(w.head.offsetHeight + 30, Math.min(window.innerHeight - 40, h0 + ev.clientY - y0));
        w.root.style.height = `${ws.h}px`;
        w.root.classList.add('sized');
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        this.commit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
    rs.addEventListener('dblclick', () => {
      this.state.wins[w.id].h = 0;
      this.commit();
    });
  }

  // ---------------------------------------------------------------- dragging bars

  private dragBar(root: HTMLDivElement, id: BarId, grip: HTMLDivElement): void {
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.state.locked) return;
      e.preventDefault();
      e.stopPropagation();
      const r0 = root.getBoundingClientRect();
      const ox = e.clientX - r0.left;
      const oy = e.clientY - r0.top;
      let zone: Dock = this.state.bars[id].dock;
      root.classList.add('fbar-dragging');
      root.style.left = `${r0.left}px`;
      root.style.top = `${r0.top}px`;
      document.documentElement.classList.add('ui-moving', 'ui-moving-bar');
      const view = () => (document.querySelector('.viewport') as HTMLElement | null)?.getBoundingClientRect() ?? this.free.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        root.style.left = `${ev.clientX - ox}px`;
        root.style.top = `${ev.clientY - oy}px`;
        const v = view();
        const edge = 44;
        zone = ev.clientY < v.top + edge ? 'top' : ev.clientY > v.bottom - edge ? 'bottom' : ev.clientX < v.left + edge ? 'left' : ev.clientX > v.right - edge ? 'right' : 'free';
        for (const [k, d] of Object.entries(this.docks)) d.classList.toggle('hot', k === zone);
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        for (const d of Object.values(this.docks)) d.classList.remove('hot');
        document.documentElement.classList.remove('ui-moving', 'ui-moving-bar');
        const bs = this.state.bars[id];
        root.classList.remove('fbar-dragging');
        root.style.left = '';
        root.style.top = '';
        if (zone === 'free') {
          // where the pointer let go becomes the bar's centre (its shape may change once it is off the edge)
          const f = this.free.getBoundingClientRect();
          bs.x = Math.max(0, Math.min(1, (ev.clientX - f.left) / Math.max(1, f.width)));
          bs.y = Math.max(0, Math.min(1, (ev.clientY - f.top) / Math.max(1, f.height)));
          bs.dock = 'free';
          bs.i = 100 + Object.values(this.state.bars).reduce((m, b) => Math.max(m, b.i), 0);
        } else {
          // the place along the dock: before the first bar the pointer is in front of
          const d = this.docks[zone];
          const side = zone === 'left' || zone === 'right';
          const others = [...d.children].filter((x): x is HTMLElement => x instanceof HTMLElement && x !== root && !!x.dataset.bar);
          const before = others.find((o) => { const q = o.getBoundingClientRect(); return side ? ev.clientX < q.left + q.width / 2 : ev.clientY < q.top + q.height / 2; });
          bs.dock = zone;
          const ids = others.map((o) => o.dataset.bar as BarId);
          const at = before ? ids.indexOf(before.dataset.bar as BarId) : ids.length;
          ids.splice(at, 0, id);
          ids.forEach((b, i) => { this.state.bars[b].i = i; });
        }
        this.commit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  }

  // ---------------------------------------------------------------- frame edges: column width, chat height

  private buildEdges(): void {
    const colEdge = el('div', 'col-edge', this.root);
    colEdge.title = t('Drag to make the side columns wider or narrower · double-click: default');
    colEdge.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.state.locked) return;
      e.preventDefault();
      const x0 = e.clientX;
      const w0 = this.state.colW;
      const n = this.state.right2 ? 2 : 1;
      const move = (ev: PointerEvent) => {
        this.state.colW = Math.round(Math.max(COL_MIN, Math.min(COL_MAX, w0 + (x0 - ev.clientX) / n)));
        this.apply();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this.commit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    colEdge.addEventListener('dblclick', () => { this.state.colW = COL_W; this.commit(); });

    const chatEdge = el('div', 'bottom-edge', this.root);
    chatEdge.title = t('Drag to make the chat taller or shorter · double-click: default');
    chatEdge.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.state.locked) return;
      e.preventDefault();
      const y0 = e.clientY;
      const h0 = this.bottom.offsetHeight;
      const move = (ev: PointerEvent) => {
        this.state.chatH = Math.max(80, Math.min(Math.floor(window.innerHeight * 0.6), h0 + (y0 - ev.clientY)));
        this.apply();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this.commit();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    chatEdge.addEventListener('dblclick', () => { this.state.chatH = isPhone() ? CHAT_H_PHONE : CHAT_H; this.commit(); });
  }

  /** Phone: opens or closes the drawer with the side columns. */
  toggleDrawer(on?: boolean): void {
    const html = document.documentElement;
    html.classList.toggle('ui-drawer', on ?? !html.classList.contains('ui-drawer'));
  }
}

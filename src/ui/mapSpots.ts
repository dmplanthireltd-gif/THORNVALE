import type { Game } from '../game/Game';
import { NONCOMBAT_SKILLS } from '../game/gathering/skills';
import type { MapSpot } from '../game/trades/layout';
import { trName } from '../i18n/gameText';
import { t } from '../i18n/i18n';
import { button, el } from './dom';
import { itemIcon } from './icons';

/**
 * Training spots on the minimap and the world map (TradeLayout.spots, built with the world):
 * a small gold-edged diamond with the skill's own icon, one per mine, forest, fishing water,
 * smithy, shortcut, stall, patch, hunting ground, lair, mooring and skill master. Which
 * skills show is the viewer's choice (legend on the world map), remembered in this browser.
 */

const STORE = 'thornvale.mapSpots';

class SpotFilter {
  on = true;
  readonly hidden = new Set<string>();
  private listeners: Array<() => void> = [];

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as { on?: boolean; hidden?: string[] } | null;
      if (raw) {
        this.on = raw.on !== false;
        for (const s of raw.hidden ?? []) if (typeof s === 'string') this.hidden.add(s);
      }
    } catch { /* storage off: show everything */ }
  }

  shows(skill: string): boolean {
    return this.on && !this.hidden.has(skill);
  }

  set(skill: string, show: boolean): void {
    if (show) this.hidden.delete(skill);
    else this.hidden.add(skill);
    this.changed();
  }

  setAll(show: boolean): void {
    this.hidden.clear();
    if (!show) for (const d of NONCOMBAT_SKILLS) this.hidden.add(d.id);
    this.changed();
  }

  setOn(on: boolean): void {
    this.on = on;
    this.changed();
  }

  onChange(f: () => void): void {
    this.listeners.push(f);
  }

  private changed(): void {
    try { localStorage.setItem(STORE, JSON.stringify({ on: this.on, hidden: [...this.hidden] })); } catch { /* storage off */ }
    for (const f of this.listeners) f();
  }
}

export const spotFilter = new SpotFilter();

const ICON_OF: Record<string, string> = Object.fromEntries(NONCOMBAT_SKILLS.map((d) => [d.id, d.icon]));
const NAME_OF: Record<string, string> = Object.fromEntries(NONCOMBAT_SKILLS.map((d) => [d.id, d.name]));
const images = new Map<string, HTMLImageElement | null>();

function iconImage(skill: string): HTMLImageElement | null {
  if (images.has(skill)) return images.get(skill)!;
  const url = ICON_OF[skill] ? itemIcon(ICON_OF[skill]) : '';
  if (!url) {
    images.set(skill, null);
    return null;
  }
  const img = new Image();
  img.src = url;
  images.set(skill, img);
  return img;
}

/** "Pine forest · Snowpine Reach · Woodcutting 15", in the player's language. */
export function spotLabel(s: MapSpot): string {
  const skill = trName(NAME_OF[s.skill] ?? s.skill);
  const parts = [trName(s.what)];
  if (s.place) parts.push(trName(s.place));
  parts.push(s.level ? `${skill} ${s.level}` : skill);
  return parts.join(' · ');
}

/** The spot nearest a tile (within `r` tiles) that the filter shows, if any. */
export function spotNear(game: Game, z: number, x: number, y: number, r: number): MapSpot | null {
  let best: MapSpot | null = null, bd = r * r;
  for (const s of game.world.trades?.spots ?? []) {
    if (s.z !== z || !spotFilter.shows(s.skill)) continue;
    const d = (s.x + 0.5 - x) ** 2 + (s.y + 0.5 - y) ** 2;
    if (d <= bd) { bd = d; best = s; }
  }
  return best;
}

/**
 * Draws the shown spots of floor `z` that fall inside the canvas. `at` gives a tile's centre on
 * the canvas; `size` is the diamond's width in pixels.
 */
export function drawSpots(ctx: CanvasRenderingContext2D, game: Game, z: number, at: (x: number, y: number) => { x: number; y: number }, size: number): void {
  if (!spotFilter.on) return;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const h = size / 2;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  for (const s of game.world.trades?.spots ?? []) {
    if (s.z !== z || !spotFilter.shows(s.skill)) continue;
    const c = at(s.x, s.y);
    if (c.x < -size || c.y < -size || c.x > W + size || c.y > H + size) continue;
    // the brand's diamond: panel fill, accent-gold edge
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - h - 1);
    ctx.lineTo(c.x + h + 1, c.y);
    ctx.lineTo(c.x, c.y + h + 1);
    ctx.lineTo(c.x - h - 1, c.y);
    ctx.closePath();
    ctx.fillStyle = '#2b2621';
    ctx.fill();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = '#c9a24a';
    ctx.stroke();
    const img = iconImage(s.skill);
    if (img?.complete && img.naturalWidth) {
      const k = size * 0.78;
      ctx.drawImage(img, c.x - k / 2, c.y - k / 2, k, k);
    }
  }
  ctx.restore();
}

/** The legend: every skill with its icon and a tick to show or hide its spots; All / None. */
export function buildSpotLegend(parent: HTMLElement): HTMLDivElement {
  const box = el('div', 'spot-legend', parent);
  const head = el('div', 'spot-legend-head', box);
  el('span', 'spot-legend-title', head, t('Training spots'));
  const master = el('label', 'spot-legend-master', box);
  const mc = el('input', '', master);
  mc.type = 'checkbox';
  el('span', '', master, t('Show on the maps'));
  const tools = el('div', 'spot-legend-tools', box);
  button(tools, t('All'), () => spotFilter.setAll(true), 'btn tiny');
  button(tools, t('None'), () => spotFilter.setAll(false), 'btn tiny');
  const list = el('div', 'spot-legend-list', box);
  const rows: Array<[string, HTMLInputElement]> = [];
  for (const d of NONCOMBAT_SKILLS) {
    const row = el('label', 'spot-legend-row', list);
    const cb = el('input', '', row);
    cb.type = 'checkbox';
    const ic = el('img', 'spot-legend-icon', row);
    ic.src = itemIcon(d.icon);
    ic.alt = '';
    el('span', '', row, trName(d.name));
    cb.addEventListener('change', () => spotFilter.set(d.id, cb.checked));
    rows.push([d.id, cb]);
  }
  mc.addEventListener('change', () => spotFilter.setOn(mc.checked));
  const sync = () => {
    mc.checked = spotFilter.on;
    box.classList.toggle('off', !spotFilter.on);
    for (const [id, cb] of rows) cb.checked = !spotFilter.hidden.has(id);
  };
  spotFilter.onChange(sync);
  sync();
  return box;
}

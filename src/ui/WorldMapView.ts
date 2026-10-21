import type { Controller } from '../client/Controller';
import { NPCS } from '../game/npc/npcs';
import { FLOOR_MAX, FLOOR_MIN } from '../game/world/WorldMap';
import { button, el } from './dom';
import type { Minimap } from './Minimap';

const MAX_ZOOM = 20;

/**
 * Full-screen world map (key M). Shows any floor of the whole world with
 * region names, temples, NPCs and players. Wheel zooms, dragging pans,
 * clicking a spot on your own floor walks there.
 */
export class WorldMapView {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private floorLabel: HTMLSpanElement;
  private info: HTMLDivElement;
  private z = 0;
  /** Tile at the centre of the view and pixels per tile. */
  private cx = 0;
  private cy = 0;
  private scale = 4;
  private fitted = false;
  private timer = 0;
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  private hover: { x: number; y: number } | null = null;

  constructor(parent: HTMLElement, private readonly ctl: Controller, private readonly mini: Minimap) {
    this.root = el('div', 'worldmap', parent);
    this.root.hidden = true;
    const head = el('div', 'win-head', this.root);
    el('span', 'win-title', head, 'World map');
    const tools = el('div', 'wm-tools', head);
    button(tools, '▲', () => this.setFloor(this.z + 1), 'btn small');
    this.floorLabel = el('span', 'wm-floor', tools);
    button(tools, '▼', () => this.setFloor(this.z - 1), 'btn small');
    button(tools, 'My position', () => this.centerOnMe(true), 'btn small');
    button(tools, 'Whole world', () => this.fit(), 'btn small');
    button(tools, '✕', () => this.close(), 'btn tiny');
    const body = el('div', 'wm-body', this.root);
    this.canvas = el('canvas', 'wm-canvas', body);
    this.ctx = this.canvas.getContext('2d');
    this.info = el('div', 'wm-info', this.root);

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const before = this.tileAt(e.clientX - r.left, e.clientY - r.top);
      const k = e.deltaY > 0 ? 1 / 1.25 : 1.25;
      this.scale = Math.max(this.fitScale(), Math.min(MAX_ZOOM, this.scale * k));
      const after = this.tileAt(e.clientX - r.left, e.clientY - r.top);
      this.cx += before.x - after.x;
      this.cy += before.y - after.y;
      this.draw();
    }, { passive: false });
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, moved: false };
    });
    window.addEventListener('mousemove', (e) => {
      if (this.root.hidden) return;
      const r = this.canvas.getBoundingClientRect();
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
        if (this.drag.moved) {
          this.cx = this.drag.cx - dx / this.scale;
          this.cy = this.drag.cy - dy / this.scale;
          this.draw();
        }
      }
      const inside = e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
      const t = this.tileAt(e.clientX - r.left, e.clientY - r.top);
      this.hover = inside ? { x: Math.floor(t.x), y: Math.floor(t.y) } : null;
      this.updateInfo();
    });
    window.addEventListener('mouseup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved || this.root.hidden) return;
      const r = this.canvas.getBoundingClientRect();
      const t = this.tileAt(e.clientX - r.left, e.clientY - r.top);
      this.walkTo(Math.floor(t.x), Math.floor(t.y));
    });
    window.addEventListener('resize', () => {
      if (!this.root.hidden) this.resize();
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    const p = this.ctl.game.getPlayer(this.ctl.pid);
    this.root.hidden = false;
    this.z = p?.z ?? 0;
    this.resize();
    if (!this.fitted) {
      this.fit();
      this.fitted = true;
    }
    this.setFloor(this.z);
  }

  close(): void {
    this.root.hidden = true;
    this.drag = null;
  }

  private resize(): void {
    const body = this.canvas.parentElement!;
    this.canvas.width = Math.max(100, body.clientWidth);
    this.canvas.height = Math.max(100, body.clientHeight);
    this.scale = Math.max(this.scale, this.fitScale());
    this.draw();
  }

  private fitScale(): number {
    const w = this.ctl.game.world;
    return Math.min(this.canvas.width / w.width, this.canvas.height / w.height);
  }

  private fit(): void {
    const w = this.ctl.game.world;
    this.scale = this.fitScale();
    this.cx = w.width / 2;
    this.cy = w.height / 2;
    this.draw();
  }

  private centerOnMe(zoom: boolean): void {
    const p = this.ctl.game.getPlayer(this.ctl.pid);
    if (!p) return;
    this.cx = p.x + 0.5;
    this.cy = p.y + 0.5;
    if (zoom) this.scale = Math.max(this.scale, 8);
    this.setFloor(p.z);
  }

  private setFloor(z: number): void {
    this.z = Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, z));
    this.floorLabel.textContent = this.z === 0 ? 'Ground' : this.z > 0 ? `Floor +${this.z}` : `Floor ${this.z}`;
    this.draw();
    this.updateInfo();
  }

  private tileAt(px: number, py: number): { x: number; y: number } {
    return { x: this.cx + (px - this.canvas.width / 2) / this.scale, y: this.cy + (py - this.canvas.height / 2) / this.scale };
  }

  private screenOf(tx: number, ty: number): { x: number; y: number } {
    return { x: (tx - this.cx) * this.scale + this.canvas.width / 2, y: (ty - this.cy) * this.scale + this.canvas.height / 2 };
  }

  private walkTo(x: number, y: number): void {
    const g = this.ctl.game;
    const p = g.getPlayer(this.ctl.pid);
    if (!p || !g.world.inBounds(x, y)) return;
    if (this.z !== p.z) {
      this.info.textContent = 'You can only walk to places on the floor you are standing on.';
      return;
    }
    this.ctl.send({ c: 'moveTo', x, y });
  }

  private updateInfo(): void {
    const g = this.ctl.game;
    const h = this.hover;
    if (!h || !g.world.inBounds(h.x, h.y)) {
      this.info.textContent = 'Wheel: zoom · drag: move · click: walk there · ▲▼: change floor · M or Esc: close';
      return;
    }
    const r = g.world.regionAt(h.x, h.y, this.z);
    this.info.textContent = `${h.x}, ${h.y}, floor ${this.z}${r ? ` — ${r.name}${r.level && r.level !== '—' ? ` (level ${r.level})` : ''}${r.safe ? ' · protection zone' : ''}` : ''}`;
  }

  update(dt: number): void {
    if (this.root.hidden) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.2;
    this.draw();
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx || this.root.hidden) return;
    const g = this.ctl.game;
    const w = g.world;
    const s = this.scale;
    // keep the view on the map
    const halfW = this.canvas.width / 2 / s;
    const halfH = this.canvas.height / 2 / s;
    this.cx = halfW * 2 >= w.width ? w.width / 2 : Math.max(halfW, Math.min(w.width - halfW, this.cx));
    this.cy = halfH * 2 >= w.height ? w.height / 2 : Math.max(halfH, Math.min(w.height - halfH, this.cy));

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const o = this.screenOf(0, 0);
    ctx.drawImage(this.mini.floorImage(this.z), o.x, o.y, w.width * s, w.height * s);

    // region names
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of w.regions) {
      if (this.z < r.z0 || this.z > r.z1) continue;
      const area = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
      if (area < 60 && s < 10) continue;
      if (area < 20) continue;
      const c = this.screenOf((r.x0 + r.x1 + 1) / 2, (r.y0 + r.y1 + 1) / 2);
      const big = area > 600;
      ctx.font = `700 ${big ? 13 : 11}px Verdana, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.fillStyle = r.safe ? '#9fe8ff' : big ? '#ffe9a8' : '#f0f0f0';
      ctx.strokeText(r.name, c.x, c.y);
      ctx.fillText(r.name, c.x, c.y);
      if (r.temple && r.temple.z === this.z) {
        const t = this.screenOf(r.temple.x + 0.5, r.temple.y + 0.5);
        ctx.font = '700 14px Verdana, sans-serif';
        ctx.strokeText('✚', t.x, t.y);
        ctx.fillStyle = '#ffd84a';
        ctx.fillText('✚', t.x, t.y);
      }
    }

    // NPCs and players
    const dot = (x: number, y: number, color: string, r: number) => {
      const c = this.screenOf(x + 0.5, y + 0.5);
      ctx.fillStyle = '#000';
      ctx.fillRect(c.x - r - 1, c.y - r - 1, r * 2 + 2, r * 2 + 2);
      ctx.fillStyle = color;
      ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
      return c;
    };
    ctx.font = '600 10px Verdana, sans-serif';
    for (const n of g.npcs) {
      if (n.z !== this.z) continue;
      const c = dot(n.x, n.y, '#6fc8ff', Math.max(2, s * 0.3));
      if (s >= 6) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.fillStyle = '#9fd3ff';
        const label = `${n.name}${NPCS[n.key] ? ` · ${NPCS[n.key].role}` : ''}`;
        ctx.strokeText(label, c.x, c.y - 10);
        ctx.fillText(label, c.x, c.y - 10);
      }
    }
    // an active world boss (gold crown) and raid (red swords), on every floor so nobody misses them
    for (const m of g.worldMarks()) {
      const c = this.screenOf(m.x + 0.5, m.y + 0.5);
      const pulse = 9 + Math.sin(performance.now() / 200) * 3;
      const col = m.kind === 'worldboss' ? '#ffd23a' : '#ff4a2a';
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, pulse + Math.max(0, s * 0.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = '700 18px Verdana, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      const icon = m.kind === 'worldboss' ? '♛' : '⚔';
      ctx.strokeText(icon, c.x, c.y);
      ctx.fillStyle = col;
      ctx.fillText(icon, c.x, c.y);
      ctx.font = '700 12px Verdana, sans-serif';
      const label = `${m.name}${m.z !== this.z ? ` (floor ${m.z})` : ''}`;
      ctx.strokeText(label, c.x, c.y - 20);
      ctx.fillText(label, c.x, c.y - 20);
    }
    ctx.font = '600 10px Verdana, sans-serif';
    const me = g.getPlayer(this.ctl.pid);
    for (const p of g.players()) {
      if (p.z !== this.z || p === me) continue;
      dot(p.x, p.y, '#ffffff', Math.max(2, s * 0.3));
    }
    if (me && me.z === this.z) {
      const c = this.screenOf(me.x + 0.5, me.y + 0.5);
      const pulse = 6 + Math.sin(performance.now() / 150) * 2;
      ctx.strokeStyle = '#ff3a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, pulse + Math.max(0, s * 0.4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(c.x - 6, c.y - 1, 12, 2);
      ctx.fillRect(c.x - 1, c.y - 6, 2, 12);
    } else if (me) {
      ctx.textAlign = 'left';
      ctx.font = '600 11px Verdana, sans-serif';
      ctx.fillStyle = '#ffb0a8';
      ctx.fillText(`You are on floor ${me.z}`, 10, 14);
    }
  }
}

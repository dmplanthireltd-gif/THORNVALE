import type { Controller } from '../client/Controller';
import { Ground, Obj, WorldMap } from '../game/world/WorldMap';

export const GROUND_RGB: Record<number, string> = {
  [Ground.Grass]: '#3f8a2e', [Ground.Path]: '#a08a62', [Ground.Stone]: '#8a8a88', [Ground.Wood]: '#7a5530', [Ground.Water]: '#2f6ab0',
  [Ground.Dirt]: '#7a6040', [Ground.Crop]: '#8a7a32', [Ground.Sand]: '#d8c88a', [Ground.DarkGrass]: '#2f6a24', [Ground.Lava]: '#e0501a',
  [Ground.Ash]: '#4a4440', [Ground.Swamp]: '#4a5a2a', [Ground.Cave]: '#6a5a4a', [Ground.Jungle]: '#2a6a1e', [Ground.Marble]: '#d0ccc4',
  [Ground.DeepWater]: '#1f4a8a', [Ground.Snow]: '#eef2f6', [Ground.Ice]: '#b4dcee',
};

export const OBJ_RGB: Partial<Record<number, string>> = {
  [Obj.Tree]: '#1f5a1a', [Obj.Pine]: '#1a4a20', [Obj.JungleTree]: '#164a14', [Obj.Palm]: '#2a7a2a', [Obj.Rock]: '#6a6a6a',
  [Obj.Wall]: '#5a4a3a', [Obj.StoneWall]: '#6a6460', [Obj.Cliff]: '#77736e', [Obj.Palisade]: '#6a4a2a', [Obj.Stalagmite]: '#5a5048',
  [Obj.StairsUp]: '#ffe040', [Obj.StairsDown]: '#ffe040', [Obj.Ladder]: '#ffe040', [Obj.RopeSpot]: '#ffe040', [Obj.Hole]: '#ffe040',
  [Obj.LooseStone]: '#c8b080', [Obj.FireField]: '#ff7a1a', [Obj.Locker]: '#e0b03c', [Obj.Chest]: '#e0b03c', [Obj.Pillar]: '#9a948c',
  [Obj.SandWall]: '#e8c040', [Obj.Door]: '#8a6a3a', [Obj.MarketBoard]: '#e0b03c', [Obj.Stump]: '#5a4a2a',
  [Obj.CopperRock]: '#a8704a', [Obj.TinRock]: '#9aa0a8', [Obj.IronRock]: '#8a5a44', [Obj.CoalRock]: '#3a3a3e', [Obj.SilverRock]: '#c8ccd4',
  [Obj.GoldRock]: '#d8b040', [Obj.StarsteelRock]: '#5a7ab8', [Obj.DarkstoneRock]: '#5a3a6a', [Obj.DepletedRock]: '#6a665e',
  [Obj.Furnace]: '#c86a2a', [Obj.Anvil]: '#4a4e56', [Obj.Stove]: '#c86a2a', [Obj.TanningRack]: '#a8743f', [Obj.Campfire]: '#ff7a1a', [Obj.FoundersStone]: '#e0b03c',
};

/** Canvas size in pixels; the zoom decides how many tiles fit in it. */
const SIZE = 156;
const ZOOMS = [1, 2, 3, 4, 6, 8];

/** Floor-aware minimap: one cached image per floor, cropped around the player. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private cache = new Map<number, HTMLCanvasElement>();
  private timer = 0;
  private zoom = 2;
  /** Pan offset in tiles (right-drag), cleared by a double-click. */
  private panX = 0;
  private panY = 0;
  private get px(): number { return ZOOMS[this.zoom]; }
  private get view(): number { return Math.floor(SIZE / this.px); }

  constructor(parent: HTMLElement, private readonly ctl: Controller) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.canvas.title = 'Minimap — click to walk, mouse wheel to zoom, right-drag to move, double-click to centre';
    try { this.zoom = Math.min(ZOOMS.length - 1, Math.max(0, Number(localStorage.getItem('thornvale.minimapZoom') ?? 2))); } catch { /* storage off */ }
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.min(ZOOMS.length - 1, Math.max(0, this.zoom + (e.deltaY < 0 ? 1 : -1)));
      try { localStorage.setItem('thornvale.minimapZoom', String(this.zoom)); } catch { /* storage off */ }
      this.timer = 0;
    }, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('dblclick', () => { this.panX = 0; this.panY = 0; this.timer = 0; });
    let drag: { x: number; y: number; px: number; py: number } | null = null;
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 2) return;
      e.stopPropagation();
      drag = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY };
    }, true);
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const k = this.view / this.canvas.getBoundingClientRect().width;
      this.panX = Math.round(drag.px - (e.clientX - drag.x) * k);
      this.panY = Math.round(drag.py - (e.clientY - drag.y) * k);
      this.timer = 0;
    });
    window.addEventListener('mouseup', () => { drag = null; });
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const p = this.ctl.game.getPlayer(this.ctl.pid);
      if (!p) return;
      const r = this.canvas.getBoundingClientRect();
      const tx = Math.floor(((e.clientX - r.left) / r.width) * this.view) + this.origin(p.x) + this.panX;
      const ty = Math.floor(((e.clientY - r.top) / r.height) * this.view) + this.origin(p.y) + this.panY;
      this.ctl.send({ c: 'moveTo', x: tx, y: ty });
    });
  }

  private origin(c: number): number {
    return Math.round(c) - Math.floor(this.view / 2);
  }

  invalidate(z: number): void {
    this.cache.delete(z);
  }

  /** Whole-floor image, one pixel per tile (cached). */
  floorImage(z: number): HTMLCanvasElement {
    let c = this.cache.get(z);
    if (c) return c;
    const w: WorldMap = this.ctl.game.world;
    c = document.createElement('canvas');
    c.width = w.width;
    c.height = w.height;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w.width, w.height);
      for (let y = 0; y < w.height; y++) {
        for (let x = 0; x < w.width; x++) {
          const gr = w.getGround(x, y, z);
          if (gr === Ground.Void) continue;
          const o = w.getObj(x, y, z);
          g.fillStyle = OBJ_RGB[o] ?? GROUND_RGB[gr] ?? '#444';
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    this.cache.set(z, c);
    return c;
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0 || !this.ctx) return;
    this.timer = 0.25;
    const g = this.ctl.game;
    const p = g.getPlayer(this.ctl.pid);
    if (!p) return;
    const ctx = this.ctx;
    const PX = this.px;
    const VIEW = this.view;
    const ox = this.origin(p.x) + this.panX;
    const oy = this.origin(p.y) + this.panY;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.floorImage(p.z), ox, oy, VIEW, VIEW, 0, 0, VIEW * PX, VIEW * PX);
    const dot = (x: number, y: number, color: string, size = Math.max(2, PX)) => {
      ctx.fillStyle = color;
      ctx.fillRect((x - ox) * PX + (PX - size) / 2, (y - oy) * PX + (PX - size) / 2, size, size);
    };
    for (const n of g.npcs) if (n.z === p.z) dot(n.x, n.y, '#6fc8ff');
    for (const e of g.enemies) if (e.z === p.z && !e.dead && Math.abs(e.x - p.x) < 10 && Math.abs(e.y - p.y) < 8) dot(e.x, e.y, '#ff3a2a', Math.max(2, PX));
    for (const o of g.players()) if (o.z === p.z && o !== p) dot(o.x, o.y, '#ffffff');
    // the player: a white cross like the classic map marker
    ctx.fillStyle = '#ffffff';
    const cx = (p.x - ox) * PX;
    const cy = (p.y - oy) * PX;
    const arm = Math.max(3, PX);
    ctx.fillRect(cx + PX / 2 - arm, cy + PX / 2, arm * 2 + 1, 1);
    ctx.fillRect(cx + PX / 2, cy + PX / 2 - arm, 1, arm * 2 + 1);
  }
}

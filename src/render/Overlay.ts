import * as THREE from 'three';

interface FloatText {
  el: HTMLDivElement;
  anchor: THREE.Vector3;
  follow: (() => THREE.Vector3) | null;
  life: number;
  max: number;
  rise: number;
  offset: number;
}

interface Label {
  el: HTMLDivElement;
  name: HTMLSpanElement;
  skull: HTMLSpanElement;
  /** Bosses: crown before the name and the title underneath (created on first use). */
  crown?: HTMLSpanElement;
  title?: HTMLDivElement;
  bar: HTMLDivElement;
  fill: HTMLDivElement;
}

const v = new THREE.Vector3();

export function hpColor(frac: number): string {
  if (frac > 0.6) return '#3ccf3c';
  if (frac > 0.3) return '#d6c536';
  if (frac > 0.1) return '#e0782f';
  return '#d6332b';
}

/** HTML layer for creature name plates and floating combat text. */
export class Overlay {
  readonly root: HTMLDivElement;
  private labels = new Map<number, Label>();
  private texts: FloatText[] = [];
  private w = 1;
  private h = 1;

  constructor(parent: HTMLElement, private readonly camera: THREE.Camera) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    parent.appendChild(this.root);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  private project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    v.copy(p).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, visible: Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
  }

  setLabel(id: number, anchor: THREE.Vector3 | null, name: string, hpFrac: number, opts: { player?: boolean; npc?: boolean; other?: boolean; targeted?: boolean; skull?: 0 | 1 | 2; party?: 0 | 1 | 2 | 3; boss?: string } = {}): void {
    let l = this.labels.get(id);
    if (!l) {
      const el = document.createElement('div');
      el.className = 'nameplate';
      const nm = document.createElement('span');
      nm.className = 'np-name';
      const sk = document.createElement('span');
      sk.className = 'np-skull';
      sk.textContent = '☠';
      const bar = document.createElement('div');
      bar.className = 'np-bar';
      const fill = document.createElement('div');
      fill.className = 'np-fill';
      bar.appendChild(fill);
      const head = document.createElement('div');
      head.className = 'np-head';
      head.append(sk, nm);
      el.append(head, bar);
      this.root.appendChild(el);
      l = { el, name: nm, skull: sk, bar, fill };
      this.labels.set(id, l);
    }
    if (!anchor) {
      l.el.style.display = 'none';
      return;
    }
    const p = this.project(anchor);
    if (!p.visible) {
      l.el.style.display = 'none';
      return;
    }
    l.el.style.display = '';
    l.el.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y - 10).toFixed(1)}px) translate(-50%, -100%)`;
    const col = opts.npc ? '#9fd3ff' : hpColor(hpFrac);
    l.el.classList.toggle('other-player', !!opts.other);
    if (l.name.textContent !== name) l.name.textContent = name;
    l.name.style.color = col;
    l.fill.style.width = `${Math.max(0, Math.min(1, hpFrac)) * 100}%`;
    l.fill.style.background = col;
    l.bar.style.display = opts.npc ? 'none' : '';
    l.el.classList.toggle('targeted', !!opts.targeted);
    // PvP skull next to the name: white or red
    const sk = opts.skull ?? 0;
    const skCls = sk === 2 ? 'np-skull red' : sk === 1 ? 'np-skull white' : 'np-skull';
    if (l.skull.className !== skCls) l.skull.className = skCls;
    // party shield: blue for members, flashing yellow for an open invitation
    const pt = opts.party ?? 0;
    l.el.classList.toggle('party-member', pt === 1);
    l.el.classList.toggle('party-invite', pt === 2 || pt === 3);
    if (opts.boss !== undefined && !l.crown) {
      l.crown = document.createElement('span');
      l.crown.className = 'np-crown';
      l.crown.textContent = '♛';
      l.name.before(l.crown);
      l.title = document.createElement('div');
      l.title.className = 'np-title';
      l.title.textContent = opts.boss;
      l.bar.before(l.title);
      l.el.classList.add('boss');
    }
  }

  removeLabel(id: number): void {
    const l = this.labels.get(id);
    if (l) {
      l.el.remove();
      this.labels.delete(id);
    }
  }

  /** Floating text; `follow` keeps it attached to a moving creature. */
  float(text: string, cls: string, anchor: THREE.Vector3, follow: (() => THREE.Vector3) | null = null, max = 1.1): void {
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    this.root.appendChild(el);
    // stack texts that start together so they don't overlap
    const stacked = this.texts.filter((t) => t.life < 0.25 && t.anchor.distanceTo(anchor) < 0.5).length;
    const speech = cls.includes('speech');
    // spoken text barely drifts so it can be read; damage numbers rise and fade quickly
    this.texts.push({ el, anchor: anchor.clone(), follow, life: 0, max, rise: speech ? 10 : 34, offset: stacked * (speech ? 22 : 16) });
  }

  update(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dt;
      if (t.life >= t.max) {
        t.el.remove();
        this.texts.splice(i, 1);
        continue;
      }
      if (t.follow) t.anchor.copy(t.follow());
      const p = this.project(t.anchor);
      const k = t.life / t.max;
      const y = p.y - t.offset - k * t.rise;
      t.el.style.transform = `translate(${p.x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      t.el.style.opacity = k > 0.8 ? String(1 - (k - 0.8) / 0.2) : '1';
    }
  }
}

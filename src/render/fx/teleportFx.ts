import * as THREE from 'three';
import type { GameEvent } from '../../game/core/events';
import type { CreatureView } from '../CreatureView';
import type { Effects } from '../Effects';
import type { GraphicsQuality } from '../graphics';
import { PAINTED } from '../style';

/**
 * Teleport runes (game/magic/teleport.ts), the look: while the rune is channelled a
 * carved rune circle swirls open on the ground (two rings turning against each other),
 * a column of sea-green light rises around the caster and motes drift up through it;
 * in the last moments the body thins into the light. At the jump the column flares
 * and collapses where they stood, and at the destination a burst of light, a shock
 * ring and a short column put them back together.
 *
 * Driven only by the `teleportCast` / `teleportCancel` / `teleportDone` events, so it
 * works online and offline. Small fixed pools (4 circles, 6 columns), shared
 * geometries and materials per pool slot; no allocations per frame. Painted style:
 * soft, smooth fades; classic: opacity in four steps and a stepped turn, like the
 * rest of the pixel effects. Graphics Low: fewer motes, no point lights.
 */

export interface TeleportFxContext {
  view(id: number): CreatureView | undefined;
  /** Height of floor z as drawn, or null when that floor is not shown. */
  floorY(z: number): number | null;
  /** Close enough to the local player to bother. */
  near(x: number, y: number): boolean;
  quality(): GraphicsQuality;
  /** Id of the local player (their own arrival always plays, even before the next snapshot moves the camera). */
  localId(): number | null;
}

/** Sea-green waystone light (the rune stones glow the same colour, ui/runeIcons.ts). */
const GLOW = 0x4fe0c8;
const CORE = 0xe8fff6;
const GOLD = 0xffd98a;
/** How long before the jump the body starts to thin out. */
const DISSOLVE = 0.6;
/** How long the arrival takes to put the body back together. */
const ARRIVE = 0.55;

const step4 = (k: number) => (PAINTED ? Math.max(0, Math.min(1, k)) : Math.round(Math.max(0, Math.min(1, k)) * 4) / 4);
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

function reducedMotion(): boolean {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ textures (drawn once)

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Outer ring: a double band with carved rune marks between the bands. Drawn white; tinted by the material. */
function outerRingTexture(): THREE.Texture {
  const S = 256, C = S / 2;
  const [cv, x] = canvas(S);
  x.strokeStyle = '#fff';
  x.fillStyle = '#fff';
  x.shadowColor = '#fff';
  x.shadowBlur = PAINTED ? 6 : 0;
  x.lineCap = 'round';
  const band = (r: number, w: number) => { x.beginPath(); x.arc(C, C, r, 0, Math.PI * 2); x.lineWidth = w; x.stroke(); };
  band(122, 4);
  band(100, 3);
  // 16 rune marks between the bands: strokes, forks and dots, all original
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    x.save();
    x.translate(C + Math.cos(a) * 111, C + Math.sin(a) * 111);
    x.rotate(a + Math.PI / 2);
    x.lineWidth = 2.6;
    x.beginPath();
    switch (i % 4) {
      case 0: x.moveTo(0, -7); x.lineTo(0, 7); x.moveTo(0, -1); x.lineTo(5, -6); break;
      case 1: x.moveTo(-5, 6); x.lineTo(0, -7); x.lineTo(5, 6); break;
      case 2: x.moveTo(-4, -6); x.lineTo(4, 6); x.moveTo(4, -6); x.lineTo(-4, 6); break;
      default: x.arc(0, 0, 4, 0, Math.PI * 2); x.moveTo(0, -8); x.lineTo(0, -5); break;
    }
    x.stroke();
    x.restore();
  }
  // ticks on the inner band
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    x.beginPath();
    x.moveTo(C + Math.cos(a) * 94, C + Math.sin(a) * 94);
    x.lineTo(C + Math.cos(a) * (i % 3 ? 90 : 86), C + Math.sin(a) * (i % 3 ? 90 : 86));
    x.lineWidth = 1.6;
    x.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Inner ring: two interlaced triangles inside a circle, a spiral at the heart. */
function innerRingTexture(): THREE.Texture {
  const S = 256, C = S / 2;
  const [cv, x] = canvas(S);
  x.strokeStyle = '#fff';
  x.shadowColor = '#fff';
  x.shadowBlur = PAINTED ? 5 : 0;
  x.lineJoin = 'round';
  x.lineWidth = 3;
  x.beginPath();
  x.arc(C, C, 82, 0, Math.PI * 2);
  x.stroke();
  for (const rot of [-Math.PI / 2, Math.PI / 2]) {
    x.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = rot + (i / 3) * Math.PI * 2;
      const px = C + Math.cos(a) * 80, py = C + Math.sin(a) * 80;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.lineWidth = 2.2;
    x.stroke();
  }
  x.beginPath();
  x.arc(C, C, 40, 0, Math.PI * 2);
  x.lineWidth = 2;
  x.stroke();
  // the spiral the traveller is drawn into
  x.beginPath();
  for (let i = 0; i <= 60; i++) {
    const k = i / 60, a = k * Math.PI * 4, r = 34 * (1 - k) + 3;
    const px = C + Math.cos(a) * r, py = C + Math.sin(a) * r;
    if (i === 0) x.moveTo(px, py);
    else x.lineTo(px, py);
  }
  x.lineWidth = 2.4;
  x.stroke();
  // soft glow pooled in the middle
  const g = x.createRadialGradient(C, C, 0, C, C, 84);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Light column: bright at the foot, fading upward, with vertical streaks around the cylinder. */
function columnTexture(): THREE.Texture {
  const W = 128, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = cv.getContext('2d')!;
  const img = x.createImageData(W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const streak = new Float32Array(W);
  for (let i = 0; i < W; i++) streak[i] = 0.45 + rnd() * 0.55;
  for (let k = 0; k < 3; k++) for (let i = 1; i < W; i++) streak[i] = (streak[i] + streak[i - 1]) / 2;
  for (let py = 0; py < H; py++) {
    const v = 1 - py / (H - 1); // canvas top = column top
    const fall = Math.pow(1 - v, 1.6);
    for (let px = 0; px < W; px++) {
      const a = fall * (0.55 + 0.45 * streak[px]) * (1 - Math.pow(v, 6) * 0);
      const o = (py * W + px) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(255 * Math.min(1, a));
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ pooled pieces

interface Circle {
  root: THREE.Group;
  outer: THREE.Mesh;
  inner: THREE.Mesh;
  busy: boolean;
}

interface Column {
  mesh: THREE.Mesh;
  core: THREE.Mesh;
  busy: boolean;
  /** 0..1 life of a flash (arrival / departure) column; -1 = follows a channel. */
  t: number;
  dur: number;
  peak: number;
  collapse: boolean;
}

/** One channel in progress (or the moment just after the jump). */
interface Channel {
  id: number;
  x: number;
  y: number;
  z: number;
  dur: number;
  t: number;
  circle: Circle;
  /** null for the arrival's fading circle. */
  column: Column | null;
  moteT: number;
  /** Set when cancelled: fade out over a short while. */
  ending: number;
}

/** Per creature: how thin the body is drawn right now (0 = normal, 1 = a thread of light). */
interface Body {
  thin: number;
  /** 'out': thinning during the channel; 'in': arriving; 'back': cancelled, easing back. */
  mode: 'out' | 'in' | 'back';
  t: number;
  base: number;
  rig: THREE.Object3D;
}

export class TeleportFx {
  private readonly group = new THREE.Group();
  private readonly circles: Circle[] = [];
  private readonly columns: Column[] = [];
  private readonly channels = new Map<number, Channel>();
  private readonly bodies = new Map<number, Body>();
  /** Creatures whose next plain `teleport` event is a rune jump (Renderer skips its stairs flash). */
  private readonly runeJumps = new Set<number>();
  private readonly arrivals: Array<{ id: number; x: number; y: number; z: number }> = [];
  private readonly tmp = new THREE.Vector3();
  private readonly circleGeo = new THREE.PlaneGeometry(1, 1);
  private readonly columnGeo = new THREE.CylinderGeometry(0.42, 0.5, 3.2, 20, 1, true);
  private readonly coreGeo = new THREE.CylinderGeometry(0.16, 0.22, 3.4, 12, 1, true);
  private tex: { outer: THREE.Texture; inner: THREE.Texture; column: THREE.Texture } | null = null;
  private time = 0;

  constructor(scene: THREE.Scene, private readonly effects: Effects, private readonly ctx: TeleportFxContext) {
    this.circleGeo.rotateX(-Math.PI / 2);
    // column pivots at its foot
    this.columnGeo.translate(0, 1.6, 0);
    this.coreGeo.translate(0, 1.7, 0);
    this.group.name = 'teleportFx';
    scene.add(this.group);
  }

  private textures(): { outer: THREE.Texture; inner: THREE.Texture; column: THREE.Texture } {
    if (!this.tex) this.tex = { outer: outerRingTexture(), inner: innerRingTexture(), column: columnTexture() };
    return this.tex;
  }

  private material(map: THREE.Texture, color: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      map, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
    });
  }

  private takeCircle(): Circle {
    let c = this.circles.find((x) => !x.busy);
    if (!c && this.circles.length < 4) {
      const t = this.textures();
      const outer = new THREE.Mesh(this.circleGeo, this.material(t.outer, GLOW));
      const inner = new THREE.Mesh(this.circleGeo, this.material(t.inner, CORE));
      outer.renderOrder = inner.renderOrder = 3;
      const root = new THREE.Group();
      root.add(outer, inner);
      this.group.add(root);
      c = { root, outer, inner, busy: false };
      this.circles.push(c);
    }
    c ??= this.circles[0];
    c.busy = true;
    c.root.visible = true;
    return c;
  }

  private takeColumn(): Column {
    let c = this.columns.find((x) => !x.busy);
    if (!c && this.columns.length < 6) {
      const t = this.textures();
      const mesh = new THREE.Mesh(this.columnGeo, this.material(t.column, GLOW));
      const core = new THREE.Mesh(this.coreGeo, this.material(t.column, CORE));
      mesh.renderOrder = core.renderOrder = 4;
      mesh.add(core);
      this.group.add(mesh);
      c = { mesh, core, busy: false, t: 0, dur: 1, peak: 1, collapse: false };
      this.columns.push(c);
    }
    c ??= this.columns[0];
    c.busy = true;
    c.mesh.visible = true;
    c.t = -1;
    return c;
  }

  private free(c: Circle | Column): void {
    c.busy = false;
    if ('root' in c) c.root.visible = false;
    else c.mesh.visible = false;
  }

  private low(): boolean {
    return this.ctx.quality() === 'low';
  }

  // ------------------------------------------------------------------ events

  onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'teleportCast': {
        this.end(e.id, false);
        const fy = this.ctx.floorY(e.z);
        if (fy === null || !this.ctx.near(e.x, e.y)) return;
        const column = this.takeColumn();
        const ch: Channel = { id: e.id, x: e.x, y: e.y, z: e.z, dur: e.dur, t: 0, circle: this.takeCircle(), column, moteT: 0, ending: -1 };
        ch.circle.root.position.set(e.x, fy + 0.035, e.y);
        column.mesh.position.set(e.x, fy, e.y);
        this.channels.set(e.id, ch);
        this.effects.ring(this.tmp.set(e.x, fy + 0.05, e.y), GLOW, 0.2, 0.75, 0.5);
        break;
      }
      case 'teleportCancel':
        this.end(e.id, true);
        break;
      case 'teleportDone': {
        this.runeJumps.add(e.id);
        this.end(e.id, false);
        this.depart(e.fx, e.fy, e.fz);
        // the jump itself comes right after this event: play the arrival once the views (and the
        // local camera) have moved, so "near" and the floor height are judged at the destination
        this.arrivals.push({ id: e.id, x: e.x, y: e.y, z: e.z });
        break;
      }
    }
  }

  /** True once for the plain `teleport` event that belongs to a rune jump (the caller skips its default flash). */
  consumeJump(id: number): boolean {
    return this.runeJumps.delete(id);
  }

  /** Ends a channel: `fizzle` = broken off (sparks out, body eases back). */
  private end(id: number, fizzle: boolean): void {
    const ch = this.channels.get(id);
    const b = this.bodies.get(id);
    if (b && b.mode === 'out') {
      b.mode = 'back';
      b.t = 0;
    }
    if (!ch) return;
    if (fizzle) {
      const fy = this.ctx.floorY(ch.z) ?? 0;
      this.effects.burst(this.tmp.set(ch.x, fy + 0.5, ch.y), GLOW, this.low() ? 6 : 12, 1.6, 4, 0.06);
      ch.ending = 0;
      return;
    }
    this.channels.delete(id);
    this.free(ch.circle);
    if (ch.column) this.free(ch.column);
  }

  /** Where they stood: the column flares and collapses into the ground, sparks rise. */
  private depart(x: number, y: number, z: number): void {
    const fy = this.ctx.floorY(z);
    if (fy === null || !this.ctx.near(x, y)) return;
    const col = this.takeColumn();
    col.mesh.position.set(x, fy, y);
    col.t = 0;
    col.dur = 0.7;
    col.peak = 1.4;
    col.collapse = true;
    const at = this.tmp.set(x, fy + 0.9, y);
    this.effects.sparkle(at, CORE, this.low() ? 8 : 18, 0.35);
    this.effects.burst(at, GLOW, this.low() ? 8 : 16, 2.6, 2, 0.07);
    this.effects.ring(this.tmp.set(x, fy + 0.05, y), GLOW, 0.9, 0.15, 0.45, 0, true);
    if (!this.low()) this.effects.light(this.tmp.set(x, fy + 1.2, y), GLOW, 2.4, 6, 0.5);
  }

  /** At the destination: burst of light, shock ring, a short column and the body knitting back together. */
  private arrive(id: number, x: number, y: number, z: number): void {
    const v = this.ctx.view(id);
    const old = this.bodies.get(id);
    if (v) this.bodies.set(id, { thin: 1, mode: 'in', t: 0, base: old && old.rig === v.rig.root ? old.base : v.rig.root.scale.y, rig: v.rig.root });
    const mine = id === this.ctx.localId();
    const fy = this.ctx.floorY(z) ?? (mine ? 0 : null);
    if (fy === null || (!mine && !this.ctx.near(x, y))) return;
    const col = this.takeColumn();
    col.mesh.position.set(x, fy, y);
    col.t = 0;
    col.dur = 0.85;
    col.peak = 1.2;
    col.collapse = false;
    const c = this.takeCircle();
    c.root.position.set(x, fy + 0.035, y);
    // the rune circle flashes open under them and fades on its own
    const flash: Channel = { id: -1 - id, x, y, z, dur: 0.8, t: 0.8 * 0.65, circle: c, column: null, moteT: 9, ending: 0 };
    const prev = this.channels.get(flash.id);
    if (prev) this.free(prev.circle);
    this.channels.set(flash.id, flash);
    const at = this.tmp.set(x, fy + 0.7, y);
    this.effects.burst(at, CORE, this.low() ? 10 : 22, 3.2, 3, 0.08);
    this.effects.burst(at, GOLD, this.low() ? 4 : 10, 2.2, 5, 0.06);
    this.effects.sparkle(at, GLOW, this.low() ? 8 : 16, 0.6);
    this.effects.ring(this.tmp.set(x, fy + 0.05, y), GLOW, 0.2, 1.7, 0.6, 0, true);
    this.effects.ring(this.tmp.set(x, fy + 0.06, y), CORE, 0.1, 1.1, 0.45, 0, false, 0.08);
    if (!this.low()) this.effects.light(this.tmp.set(x, fy + 1, y), GLOW, 3, 7, 0.7);
    if (!reducedMotion()) this.effects.shakeNear(x, y, 1, 0.2);
  }

  // ------------------------------------------------------------------ per creature, after CreatureView.update

  /** Thins the body into the light while channelling, and knits it back on arrival. */
  apply(view: CreatureView, dt: number): void {
    const id = view.creature.id;
    const ch = this.channels.get(id);
    let b = this.bodies.get(id);
    if (ch && ch.ending < 0 && ch.dur - ch.t <= DISSOLVE) {
      if (!b || b.mode !== 'out') {
        b = { thin: b?.thin ?? 0, mode: 'out', t: 0, base: b?.base ?? view.rig.root.scale.y, rig: view.rig.root };
        this.bodies.set(id, b);
      }
    }
    if (!b) return;
    if (b.rig !== view.rig.root) {
      // the model was rebuilt (illusion, gear): its own scale is the new base
      b.rig = view.rig.root;
      b.base = view.rig.root.scale.y;
    }
    b.t += dt;
    if (b.mode === 'out') b.thin = Math.min(1, b.thin + dt / DISSOLVE);
    else if (b.mode === 'in') b.thin = 1 - easeOut(Math.min(1, b.t / ARRIVE));
    else b.thin = Math.max(0, b.thin - dt / 0.25);
    const k = PAINTED ? b.thin : step4(b.thin);
    const r = view.rig.root;
    r.scale.set(b.base * (1 - 0.88 * k), b.base * (1 + 0.45 * k), b.base * (1 - 0.88 * k));
    r.position.y += 0.35 * k;
    if (b.mode !== 'out' && b.thin <= 0) {
      r.scale.setScalar(b.base);
      this.bodies.delete(id);
    }
  }

  /** The view of a creature is gone (left the screen, logged out): forget its body state. */
  forget(id: number): void {
    const b = this.bodies.get(id);
    if (b) b.rig.scale.setScalar(b.base);
    this.bodies.delete(id);
    this.end(id, false);
  }

  // ------------------------------------------------------------------ per frame

  frame(dt: number): void {
    this.time += dt;
    while (this.arrivals.length) {
      const a = this.arrivals.shift()!;
      this.arrive(a.id, a.x, a.y, a.z);
    }
    const low = this.low();
    for (const [key, ch] of this.channels) {
      ch.t += dt;
      const fy = this.ctx.floorY(ch.z);
      if (fy === null && ch.ending < 0) {
        this.end(key, false);
        continue;
      }
      let k: number;
      if (ch.ending >= 0) {
        ch.ending += dt;
        k = Math.max(0, 1 - ch.ending / 0.35) * Math.min(1, ch.t / ch.dur + 0.3);
        if (ch.id < 0) k = Math.max(0, 1 - ch.ending / 0.8);
        if (k <= 0) {
          this.channels.delete(key);
          this.free(ch.circle);
          if (ch.column) this.free(ch.column);
          continue;
        }
      } else k = Math.min(1, ch.t / ch.dur);
      // the circle opens fast, then keeps brightening; the column grows with the channel
      const open = easeOut(Math.min(1, (ch.ending >= 0 ? 1 : ch.t / 0.45)));
      const spin = PAINTED ? this.time : Math.floor(this.time * 8) / 8;
      const c = ch.circle;
      const size = 0.4 + 1.5 * open;
      c.outer.scale.set(size, 1, size);
      c.inner.scale.set(size * 0.78, 1, size * 0.78);
      c.outer.rotation.y = spin * (0.9 + k * 1.6);
      c.inner.rotation.y = -spin * (1.4 + k * 2.2);
      const pulse = 0.85 + 0.15 * Math.sin(this.time * 9);
      (c.outer.material as THREE.MeshBasicMaterial).opacity = step4(open * (0.55 + 0.45 * k) * pulse);
      (c.inner.material as THREE.MeshBasicMaterial).opacity = step4(open * (0.35 + 0.55 * k) * pulse);
      const col = ch.column;
      if (col) {
        const grow = easeOut(Math.min(1, k * 1.3));
        col.mesh.scale.set(0.7 + 0.3 * grow, Math.max(0.05, grow), 0.7 + 0.3 * grow);
        col.mesh.rotation.y = -spin * 1.2;
        col.core.rotation.y = spin * 2.4;
        (col.mesh.material as THREE.MeshBasicMaterial).opacity = step4((0.15 + 0.45 * k) * pulse * (ch.ending >= 0 ? k : 1));
        (col.core.material as THREE.MeshBasicMaterial).opacity = step4(Math.max(0, k - 0.35) * 0.9 * (ch.ending >= 0 ? k : 1));
        // motes drifting up through the column, more as the channel builds
        if (ch.ending < 0 && fy !== null) {
          ch.moteT -= dt;
          if (ch.moteT <= 0) {
            ch.moteT = (low ? 0.16 : 0.07) / (0.5 + k);
            const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.55 * size * 0.5;
            this.effects.sparkle(this.tmp.set(ch.x + Math.cos(a) * r, fy + 0.1, ch.y + Math.sin(a) * r), Math.random() < 0.7 ? GLOW : CORE, 1, 0.05);
          }
        }
      }
    }
    // flash columns (departure collapse, arrival flare)
    for (const col of this.columns) {
      if (!col.busy || col.t < 0) continue;
      col.t += dt / col.dur;
      if (col.t >= 1) {
        this.free(col);
        continue;
      }
      const t = col.t;
      const k = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      const w = col.collapse ? 1.2 - 0.9 * t : 0.6 + 0.6 * easeOut(Math.min(1, t * 2));
      const h = col.collapse ? 1.2 * (1 - t * 0.6) : 0.4 + 0.8 * easeOut(Math.min(1, t * 3));
      col.mesh.scale.set(w, h, w);
      col.mesh.rotation.y += dt * 3;
      (col.mesh.material as THREE.MeshBasicMaterial).opacity = step4(k * 0.8 * col.peak);
      (col.core.material as THREE.MeshBasicMaterial).opacity = step4(k * col.peak);
    }
  }
}

import * as THREE from 'three';
import type { Effect } from '../game/core/events';

/**
 * Spell, rune, missile and hit effects.
 *
 * Everything is pooled: two instanced particle meshes (solid debris and
 * additive glow), and fixed pools of rings, tile flashes, ground decals, glow
 * sprites, light columns, domes, lightning bolts, beams and point lights.
 * Nothing allocates geometry or materials per effect, so many effects at once
 * stay cheap. Shapes are sized in whole art pixels (1/32 tile) so they read in
 * the pixel-art pass.
 */

/** Colours used by every effect type. */
export const EFFECT_COLOR: Record<Effect, number> = {
  physical: 0xd8d8d8, fire: 0xff7a1a, energy: 0xb07aff, ice: 0x8adcff, earth: 0x7ad04a, death: 0x8a3ab0, holy: 0xfff0a0,
  arrow: 0xc9b28a, bolt: 0x9aa0a8, spear: 0xc9d0da, star: 0xd8dde6, stone: 0x9a8a7a,
  heal: 0x7dff9a, haste: 0x9fe8ff, shield: 0x7fb2ff, light: 0xfff2b0, blood: 0xb3221b,
};

const ELEMENTAL = new Set<Effect>(['fire', 'energy', 'ice', 'earth', 'death', 'holy', 'physical']);

/** Field kinds the renderer animates. */
export type FieldKind = 'fire' | 'energy' | 'poison' | 'wall';

// ------------------------------------------------------------------ pool sizes

const MAX_SOLID = 1400;
const MAX_GLOW = 1800;
const RINGS = 56;
const FLASHES = 260;
const DECALS = 110;
const SPRITES = 90;
const COLUMNS = 8;
const DOMES = 4;
const BOLTS = 32;
const BOLT_PTS = 14;
const BEAMS = 4;
const LIGHTS = 3;

// ------------------------------------------------------------------ helpers

const colorCache = new Map<number, THREE.Color>();
function col(hex: number): THREE.Color {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
/** Opacity stepped into a few levels so fades read as pixel-art frames. */
const step4 = (k: number) => Math.round(Math.max(0, Math.min(1, k)) * 4) / 4;

function reducedMotion(): boolean {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** A small canvas texture drawn pixel by pixel; `px(x, y)` returns [r,g,b,a] 0..255 or null. */
function pixTex(size: number, px: (x: number, y: number) => [number, number, number, number] | null, repeat = false): THREE.Texture {
  const t = typeof document !== 'undefined' ? (() => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d')!;
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = px(x, y);
      if (!v) continue;
      const i = (y * size + x) * 4;
      img.data[i] = v[0];
      img.data[i + 1] = v[1];
      img.data[i + 2] = v[2];
      img.data[i + 3] = v[3];
    }
    g.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  })() : new THREE.Texture();
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

// ------------------------------------------------------------------ pooled things

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number; grow: number;
  g: number; drag: number;
  c0: THREE.Color; c1: THREE.Color | null;
  floor: number; bounce: number;
  stretch: number;
  spin: number;
  /** orbit: spiral around (ox, oz) with radius or, angle oa, angular speed ow */
  orbit: boolean; ox: number; oz: number; or: number; oa: number; ow: number; oshrink: number;
  /** pops into a few tiny motes when it dies (poison bubbles) */
  pop: number;
}

interface Slot<M extends THREE.Object3D> {
  obj: M;
  busy: boolean;
  life: number;
  max: number;
  delay: number;
  data: Record<string, number>;
  color: THREE.Color;
}

interface Timer { t: number; fn: () => void }

interface Missile {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  spin: number;
  trail: Effect | null;
  orient: boolean;
  onHit: () => void;
  acc: number;
  effect: Effect;
}

type DecalKind = 'scorch' | 'frost' | 'crack' | 'death' | 'sigil' | 'burn';

const dummy = new THREE.Object3D();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);
const WHITE = new THREE.Color(0xffffff);

/** Pooled particles, rings, flashes, decals, sprites, bolts, missiles and tile markers. */
export class Effects {
  readonly group = new THREE.Group();
  private solid: Particle[] = [];
  private glow: Particle[] = [];
  private solidMesh: THREE.InstancedMesh;
  private glowMesh: THREE.InstancedMesh;
  private missiles: Missile[] = [];
  private timers: Timer[] = [];

  private rings: Slot<THREE.Mesh>[] = [];
  private flashes: Slot<THREE.Mesh>[] = [];
  private decals: Slot<THREE.Mesh>[] = [];
  private sprites: Slot<THREE.Sprite>[] = [];
  private columns: Slot<THREE.Mesh>[] = [];
  private domes: Slot<THREE.Mesh>[] = [];
  private bolts: Slot<THREE.Group>[] = [];
  private beams: Slot<THREE.Group>[] = [];
  private lights: Slot<THREE.PointLight>[] = [];

  private ringThin = new THREE.RingGeometry(0.86, 1, 40);
  private ringThick = new THREE.RingGeometry(0.55, 1, 40);
  private flashGeo = new THREE.PlaneGeometry(0.96, 0.96);
  private decalGeo = new THREE.PlaneGeometry(1, 1);

  private tex: Record<string, THREE.Texture> = {};
  private decalTex: Record<DecalKind, THREE.Texture>;
  private missileParts = new Map<Effect, () => { obj: THREE.Object3D; orient: boolean; spin: number }>();
  private shakeAmp = 0;
  private shakeT = 0;
  private time = 0;

  readonly targetMarker: THREE.Mesh;
  readonly hoverMarker: THREE.Mesh;
  readonly followMarker: THREE.Mesh;
  private clickMarker: THREE.Mesh;
  private clickLife = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.buildTextures();
    this.decalTex = {
      scorch: this.tex.scorch, frost: this.tex.frost, crack: this.tex.crack, death: this.tex.deathMark, sigil: this.tex.sigil, burn: this.tex.burn,
    };

    const box = new THREE.BoxGeometry(1, 1, 1);
    this.solidMesh = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_SOLID);
    this.glowMesh = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true,
    }), MAX_GLOW);
    for (const m of [this.solidMesh, this.glowMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color());
      this.group.add(m);
    }
    this.glowMesh.renderOrder = 6;

    const additive = (map?: THREE.Texture) => new THREE.MeshBasicMaterial({
      color: 0xffffff, map: map ?? null, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const flat = (m: THREE.Mesh, order: number) => {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = order;
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    const slot = <M extends THREE.Object3D>(obj: M): Slot<M> => ({ obj, busy: false, life: 0, max: 1, delay: 0, data: {}, color: new THREE.Color() });

    for (let i = 0; i < RINGS; i++) this.rings.push(slot(flat(new THREE.Mesh(this.ringThin, additive()), 5)));
    for (let i = 0; i < FLASHES; i++) this.flashes.push(slot(flat(new THREE.Mesh(this.flashGeo, additive(this.tex.tile)), 4)));
    for (let i = 0; i < DECALS; i++) {
      const m = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      }));
      this.decals.push(slot(flat(m, 2)));
    }
    for (let i = 0; i < SPRITES; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      s.renderOrder = 7;
      s.frustumCulled = false;
      this.group.add(s);
      this.sprites.push(slot(s));
    }
    const colGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
    colGeo.translate(0, 0.5, 0);
    for (let i = 0; i < COLUMNS; i++) {
      const m = new THREE.Mesh(colGeo, additive(this.tex.column));
      m.visible = false;
      m.renderOrder = 6;
      m.frustumCulled = false;
      this.group.add(m);
      this.columns.push(slot(m));
    }
    const domeGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let i = 0; i < DOMES; i++) {
      const mat = additive(this.tex.hex);
      mat.side = THREE.FrontSide;
      const m = new THREE.Mesh(domeGeo, mat);
      m.visible = false;
      m.renderOrder = 6;
      m.frustumCulled = false;
      this.group.add(m);
      this.domes.push(slot(m));
    }
    for (let i = 0; i < BOLTS; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 2; k++) {
        const geo = new THREE.BufferGeometry();
        const attr = new THREE.BufferAttribute(new Float32Array(BOLT_PTS * 3), 3);
        attr.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('position', attr);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        line.frustumCulled = false;
        line.renderOrder = 8;
        g.add(line);
      }
      g.visible = false;
      this.group.add(g);
      this.bolts.push(slot(g));
    }
    const beamGeo = new THREE.BoxGeometry(1, 1, 1);
    beamGeo.translate(0, 0, 0.5);
    for (let i = 0; i < BEAMS; i++) {
      const g = new THREE.Group();
      const glow = new THREE.Mesh(beamGeo, additive());
      const core = new THREE.Mesh(beamGeo, additive());
      glow.renderOrder = 7;
      core.renderOrder = 8;
      g.add(glow, core);
      g.visible = false;
      this.group.add(g);
      this.beams.push(slot(g));
    }
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 6, 1.6);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(slot(l));
    }

    this.targetMarker = this.makeSquare(0xe8342b, 0.44, 0.5);
    this.followMarker = this.makeSquare(0x3ccf3c, 0.44, 0.5);
    this.hoverMarker = this.makeSquare(0xffffff, 0.46, 0.5, 0.35);
    this.clickMarker = this.makeSquare(0xffe27a, 0.3, 0.38);
    this.targetMarker.visible = false;
    this.followMarker.visible = false;
    this.clickMarker.visible = false;
  }

  // ------------------------------------------------------------------ textures

  private buildTextures(): void {
    const S = 32;
    // soft round glow in four hard steps (sprites, flashes)
    this.tex.glow = pixTex(S, (x, y) => {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16;
      if (d > 1) return null;
      const k = d < 0.25 ? 1 : d < 0.5 ? 0.7 : d < 0.75 ? 0.4 : 0.16;
      const v = Math.round(255 * k);
      return [v, v, v, 255];
    });
    // a magic tile: bright rim, dimmer heart, cut corners
    this.tex.tile = pixTex(S, (x, y) => {
      const e = Math.min(x, y, S - 1 - x, S - 1 - y);
      if ((x < 3 || x > S - 4) && (y < 3 || y > S - 4)) return null;
      const k = e < 2 ? 1 : e < 4 ? 0.75 : ((x + y) % 6 === 0 ? 0.6 : 0.45);
      const v = Math.round(255 * k);
      return [v, v, v, 255];
    });
    // ground scorch: charred blob with a few glowing cinders
    {
      const r = seeded(7);
      const blobs = Array.from({ length: 9 }, () => [16 + (r() - 0.5) * 12, 16 + (r() - 0.5) * 12, 6 + r() * 6]);
      this.tex.scorch = pixTex(S, (x, y) => {
        let m = 0;
        for (const [bx, by, br] of blobs) m = Math.max(m, 1 - Math.hypot(x - bx, y - by) / br);
        if (m <= 0) return null;
        const n = r();
        if (m > 0.35 && n < 0.05) return [255, 140, 40, 255];
        const a = m > 0.5 ? 235 : m > 0.25 ? 180 : 110;
        const v = 18 + Math.round(n * 22);
        return [v + 8, v, v - 6, a];
      });
      // scorch tinted later; a burn mark for energy
      this.tex.burn = pixTex(S, (x, y) => {
        const d = Math.hypot(x - 15.5, y - 15.5);
        let m = 0;
        for (const [bx, by, br] of blobs) m = Math.max(m, 1 - Math.hypot(x - bx, y - by) / br);
        const ray = Math.abs(Math.sin(Math.atan2(y - 15.5, x - 15.5) * 5)) > 0.92 && d < 15;
        if (m <= 0 && !ray) return null;
        const v = 30 + Math.round(r() * 20);
        return [v, v - 6, v + 10, m > 0.4 || ray ? 220 : 140];
      });
    }
    // frost: pale crystal star
    {
      const r = seeded(11);
      this.tex.frost = pixTex(S, (x, y) => {
        const dx = x - 15.5, dy = y - 15.5;
        const d = Math.hypot(dx, dy);
        if (d > 15.5) return null;
        const a = Math.atan2(dy, dx);
        const arm = Math.abs(Math.sin(a * 3)) > 0.93 - d * 0.002;
        const twig = Math.abs(Math.sin(a * 6 + d * 0.4)) > 0.96;
        const core = d < 6 - r() * 2;
        if (arm || core) return [225, 248, 255, 230];
        if (twig && d < 13) return [190, 230, 255, 190];
        if (d < 11 && r() < 0.22) return [170, 220, 250, 120];
        return null;
      });
    }
    // cracks: dark lines splitting out from the middle
    {
      const r = seeded(3);
      const pts = new Set<number>();
      for (let k = 0; k < 7; k++) {
        let x = 16, y = 16;
        let a = (k / 7) * Math.PI * 2 + r() * 0.6;
        for (let s = 0; s < 18; s++) {
          a += (r() - 0.5) * 0.9;
          x += Math.cos(a);
          y += Math.sin(a);
          const ix = Math.round(x), iy = Math.round(y);
          if (ix < 0 || iy < 0 || ix >= S || iy >= S) break;
          pts.add(iy * S + ix);
          if (s < 6) pts.add(iy * S + ix + 1);
        }
      }
      this.tex.crack = pixTex(S, (x, y) => {
        if (pts.has(y * S + x)) return [24, 18, 14, 240];
        const d = Math.hypot(x - 15.5, y - 15.5);
        if (d < 5) return [40, 32, 26, 200];
        if (d < 9 && r() < 0.15) return [60, 50, 40, 150];
        return null;
      });
    }
    // death mark: black-violet stain with a dark ring
    {
      const r = seeded(5);
      this.tex.deathMark = pixTex(S, (x, y) => {
        const d = Math.hypot(x - 15.5, y - 15.5);
        if (d > 15) return null;
        if (d > 12.5) return [80, 20, 110, 220];
        if (d > 11) return null;
        if (d < 8 + r() * 2) return [16, 6, 22, 230];
        return r() < 0.4 ? [40, 12, 56, 160] : null;
      });
    }
    // healing / holy sigil: ring of runes (additive, tinted)
    this.tex.sigil = pixTex(S, (x, y) => {
      const dx = x - 15.5, dy = y - 15.5;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (d > 15.5) return null;
      if (d > 14) return [255, 255, 255, 255];
      if (d > 11 && d < 13 && Math.sin(a * 8) > 0.2) return [200, 200, 200, 255];
      if (d > 9 && d < 10.2) return [150, 150, 150, 255];
      // inner star
      const star = Math.abs(Math.cos(a * 3)) * 8;
      if (Math.abs(d - star) < 0.8) return [180, 180, 180, 255];
      if (d < 2.5) return [255, 255, 255, 255];
      return null;
    });
    // a pixel skull (death)
    {
      const rows = [
        '................',
        '.....######.....',
        '...##########...',
        '..############..',
        '..############..',
        '.##############.',
        '.###..####..###.',
        '.##....##....##.',
        '.##....##....##.',
        '.###..####..###.',
        '..######.#####..',
        '...####...###...',
        '....########....',
        '....#.#.#.#.....',
        '.....######.....',
        '................',
      ];
      this.tex.skull = pixTex(16, (x, y) => (rows[y][x] === '#' ? [235, 225, 255, 255] : null));
    }
    // vertical light column: bright foot fading to nothing, with streaks
    this.tex.column = pixTex(S, (x, y) => {
      const h = 1 - y / (S - 1); // 1 at top of texture (uv v=1 at top of cylinder)
      const k = Math.pow(1 - h, 1.4);
      const streak = x % 8 === 0 || x % 8 === 3 ? 1 : 0.55;
      const v = Math.round(255 * k * streak);
      return [v, v, v, 255];
    }, true);
    // shield dome: hex-ish cells
    this.tex.hex = pixTex(S, (x, y) => {
      const row = Math.floor(y / 8);
      const xx = (x + (row % 2) * 4) % 8;
      const yy = y % 8;
      const edge = xx === 0 || yy === 0;
      const v = edge ? 255 : 40;
      return [v, v, v, 255];
    }, true);
    // magic wall runes
    {
      const r = seeded(19);
      const glyph = new Set<number>();
      for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
        const ox = gx * 16 + 3, oy = gy * 16 + 3;
        for (let s = 0; s < 4; s++) {
          const horiz = r() < 0.5;
          const p0 = Math.floor(r() * 10), len = 4 + Math.floor(r() * 6), q = Math.floor(r() * 10);
          for (let i = 0; i < len; i++) glyph.add(horiz ? (oy + q) * S + ox + Math.min(9, p0 + i) : (oy + Math.min(9, p0 + i)) * S + ox + q);
        }
      }
      this.tex.wall = pixTex(S, (x, y) => {
        if (glyph.has(y * S + x)) return [235, 245, 255, 255];
        const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
        if (edge) return [140, 170, 255, 255];
        return [26, 40, 90, 255];
      }, true);
    }
    // field ground patterns (additive)
    {
      const r = seeded(23);
      this.tex.fieldFire = pixTex(S, (x, y) => {
        const d = Math.hypot(x - 15.5, y - 15.5) / 16;
        const n = r();
        if (d > 1.02 || (d > 0.85 && n < 0.5)) return null;
        const k = (1 - d) * 0.8 + n * 0.35;
        return k > 0.7 ? [255, 230, 120, 255] : k > 0.45 ? [255, 120, 30, 255] : [150, 30, 5, 255];
      });
      this.tex.fieldEnergy = pixTex(S, (x, y) => {
        const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5)) / 16;
        const n = r();
        if (d > 0.98) return null;
        const grid = (x + y) % 7 === 0 || (x - y + 64) % 9 === 0;
        if (grid && n < 0.8) return [230, 200, 255, 255];
        return n < 0.1 ? [255, 255, 255, 255] : [70 + Math.round(n * 30), 30, 130, 255];
      });
      this.tex.fieldPoison = pixTex(S, (x, y) => {
        const d = Math.hypot(x - 15.5, y - 15.5) / 16;
        const n = r();
        if (d > 1 || (d > 0.85 && n < 0.5)) return null;
        const bub = n < 0.06;
        return bub ? [200, 255, 140, 255] : [40 + Math.round(n * 40), 120 + Math.round(n * 50), 20, 255];
      });
    }
  }

  /** Texture for a field's ground tile or a magic wall. */
  fieldTexture(kind: FieldKind): THREE.Texture {
    return kind === 'fire' ? this.tex.fieldFire : kind === 'energy' ? this.tex.fieldEnergy : kind === 'poison' ? this.tex.fieldPoison : this.tex.wall;
  }

  // ------------------------------------------------------------------ markers

  /** Flat square outline lying on a tile. */
  private makeSquare(color: number, inner: number, outer: number, opacity = 0.95): THREE.Mesh {
    const s = new THREE.Shape();
    s.moveTo(-outer, -outer); s.lineTo(outer, -outer); s.lineTo(outer, outer); s.lineTo(-outer, outer); s.lineTo(-outer, -outer);
    const hole = new THREE.Path();
    hole.moveTo(-inner, -inner); hole.lineTo(-inner, inner); hole.lineTo(inner, inner); hole.lineTo(inner, -inner); hole.lineTo(-inner, -inner);
    s.holes.push(hole);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.025;
    mesh.renderOrder = 3;
    this.group.add(mesh);
    return mesh;
  }

  showClick(x: number, z: number): void {
    this.clickMarker.position.set(x, 0.03, z);
    this.clickMarker.visible = true;
    this.clickLife = 0.6;
  }

  // ------------------------------------------------------------------ primitives

  /** Runs `fn` after `t` seconds of effect time. */
  after(t: number, fn: () => void): void {
    if (t <= 0) fn();
    else this.timers.push({ t, fn });
  }

  private particle(glow: boolean, x: number, y: number, z: number, vx: number, vy: number, vz: number, max: number, size: number, color: number, o: Partial<Particle> = {}): Particle {
    const p: Particle = {
      x, y, z, vx, vy, vz, life: 0, max, size, grow: 0, g: 0, drag: 0, c0: col(color), c1: null,
      floor: Number.NaN, bounce: 0, stretch: 0, spin: 4, orbit: false, ox: 0, oz: 0, or: 0, oa: 0, ow: 0, oshrink: 0, pop: 0, ...o,
    };
    const list = glow ? this.glow : this.solid;
    const cap = glow ? MAX_GLOW : MAX_SOLID;
    if (list.length >= cap) list[Math.floor(Math.random() * cap)] = p;
    else list.push(p);
    return p;
  }

  private take<M extends THREE.Object3D>(pool: Slot<M>[]): Slot<M> {
    let best = pool[0];
    for (const s of pool) {
      if (!s.busy) return s;
      if (s.life / s.max > best.life / best.max) best = s;
    }
    return best;
  }

  /** Ground ring. `thick` = shockwave band. */
  ring(pos: THREE.Vector3, color: number, from: number, to: number, dur: number, rise = 0, thick = false, delay = 0, peak = 0.9): void {
    const s = this.take(this.rings);
    s.busy = true;
    s.life = 0;
    s.max = dur;
    s.delay = delay;
    s.data = { from, to, rise, peak };
    s.obj.geometry = thick ? this.ringThick : this.ringThin;
    s.obj.position.copy(pos);
    s.obj.scale.setScalar(from);
    s.obj.visible = false;
    (s.obj.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  /** A glowing tile, the classic area-spell look. */
  tileFlash(x: number, y: number, z: number, effect: Effect, delay = 0, dur = 0.55, colorHex?: number): void {
    const s = this.take(this.flashes);
    s.busy = true;
    s.life = 0;
    s.max = dur;
    s.delay = delay;
    s.obj.position.set(x, y + 0.04, z);
    s.obj.visible = false;
    (s.obj.material as THREE.MeshBasicMaterial).color.setHex(colorHex ?? EFFECT_COLOR[effect]);
  }

  /** A mark left on the ground that fades after a few seconds. */
  decal(x: number, y: number, z: number, kind: DecalKind, size: number, life: number, tint = 0xffffff, additive = false, delay = 0): void {
    const s = this.take(this.decals);
    s.busy = true;
    s.life = 0;
    s.max = life;
    s.delay = delay;
    s.data = { add: additive ? 1 : 0 };
    s.obj.position.set(x, y + 0.018 + Math.random() * 0.004, z);
    s.obj.rotation.z = Math.floor(Math.random() * 4) * (Math.PI / 2);
    s.obj.scale.set(size, size, 1);
    s.obj.visible = false;
    const m = s.obj.material as THREE.MeshBasicMaterial;
    if (m.map !== this.decalTex[kind]) {
      m.map = this.decalTex[kind];
      m.needsUpdate = true;
    }
    m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.color.setHex(tint);
  }

  /** A camera-facing glow (flash, fireball core, implosion, skull). */
  sprite(pos: THREE.Vector3, color: number, from: number, to: number, dur: number, o: { delay?: number; rise?: number; tex?: 'glow' | 'skull'; dark?: boolean; peak?: number; hold?: number } = {}): void {
    const s = this.take(this.sprites);
    s.busy = true;
    s.life = 0;
    s.max = dur;
    s.delay = o.delay ?? 0;
    s.data = { from, to, rise: o.rise ?? 0, peak: o.peak ?? 1, hold: o.hold ?? 0.15 };
    s.obj.position.copy(pos);
    s.obj.scale.setScalar(from);
    s.obj.visible = false;
    const m = s.obj.material as THREE.SpriteMaterial;
    const map = o.tex === 'skull' ? this.tex.skull : this.tex.glow;
    if (m.map !== map) {
      m.map = map;
      m.needsUpdate = true;
    }
    m.blending = o.dark || o.tex === 'skull' ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.color.setHex(color);
  }

  /** A rising column of light. */
  column(pos: THREE.Vector3, color: number, radius: number, height: number, dur: number, delay = 0): void {
    const s = this.take(this.columns);
    s.busy = true;
    s.life = 0;
    s.max = dur;
    s.delay = delay;
    s.data = { r: radius, h: height };
    s.obj.position.copy(pos);
    s.obj.visible = false;
    (s.obj.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  /** A shimmering half-sphere (shields and buffs). */
  dome(pos: THREE.Vector3, color: number, radius: number, dur: number): void {
    const s = this.take(this.domes);
    s.busy = true;
    s.life = 0;
    s.max = dur;
    s.delay = 0;
    s.data = { r: radius };
    s.obj.position.copy(pos);
    s.obj.visible = false;
    (s.obj.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  /** A jagged lightning bolt that re-forks every few frames. */
  bolt(from: THREE.Vector3, to: THREE.Vector3, color: number, dur: number, jitter = 0.3, delay = 0): void {
    const s = this.take(this.bolts);
    s.busy = true;
    s.life = 0;
    s.max = dur;
    s.delay = delay;
    s.data = { fx: from.x, fy: from.y, fz: from.z, tx: to.x, ty: to.y, tz: to.z, j: jitter, next: 0 };
    s.color.setHex(color);
    s.obj.visible = false;
    const [core, glow] = s.obj.children as THREE.Line[];
    (core.material as THREE.LineBasicMaterial).color.copy(WHITE).lerp(col(color), 0.25);
    (glow.material as THREE.LineBasicMaterial).color.setHex(color);
    this.reforkBolt(s);
  }

  private reforkBolt(s: Slot<THREE.Group>): void {
    const d = s.data;
    const lines = s.obj.children as THREE.Line[];
    const from = tmpV.set(d.fx, d.fy, d.fz);
    const to = tmpV2.set(d.tx, d.ty, d.tz);
    const len = from.distanceTo(to);
    // sideways direction, horizontal and perpendicular to the bolt
    const sx = -(to.z - from.z), sz = to.x - from.x;
    const sl = Math.hypot(sx, sz) || 1;
    const vertical = Math.abs(to.y - from.y) > len * 0.7;
    for (let k = 0; k < 2; k++) {
      const attr = lines[k].geometry.getAttribute('position') as THREE.BufferAttribute;
      let off = 0;
      let offY = 0;
      for (let i = 0; i < BOLT_PTS; i++) {
        const t = i / (BOLT_PTS - 1);
        const env = Math.sin(t * Math.PI);
        if (i > 0 && i < BOLT_PTS - 1) {
          off += (Math.random() - 0.5) * d.j;
          offY += (Math.random() - 0.5) * d.j * 0.5;
        }
        off *= 0.85;
        const o = off * (0.3 + env);
        const shift = k * 0.035;
        const x = from.x + (to.x - from.x) * t + (vertical ? o : (sx / sl) * o) + shift;
        const z = from.z + (to.z - from.z) * t + (vertical ? offY * 1.6 : (sz / sl) * o);
        const y = from.y + (to.y - from.y) * t + (vertical ? 0 : offY);
        attr.setXYZ(i, x, y, z);
      }
      attr.needsUpdate = true;
    }
  }

  /** A straight beam from `from` to `to` (energy beams). */
  beamMesh(from: THREE.Vector3, to: THREE.Vector3, color: number, dur: number, width = 0.32): void {
    const s = this.take(this.beams);
    s.busy = true;
    s.life = 0;
    s.max = dur;
    s.delay = 0;
    const len = from.distanceTo(to);
    s.data = { len, w: width };
    s.obj.position.copy(from);
    s.obj.lookAt(to);
    s.obj.visible = false;
    const [glow, core] = s.obj.children as THREE.Mesh[];
    (glow.material as THREE.MeshBasicMaterial).color.setHex(color);
    (core.material as THREE.MeshBasicMaterial).color.copy(WHITE).lerp(col(color), 0.15);
  }

  /** A brief point-light flash from a small shared pool. */
  light(pos: THREE.Vector3, color: number, intensity: number, distance: number, dur: number, delay = 0): void {
    const s = this.take(this.lights);
    s.busy = true;
    s.life = 0;
    s.max = dur;
    s.delay = delay;
    s.data = { i: intensity };
    s.obj.position.copy(pos);
    s.obj.color.setHex(color);
    s.obj.distance = distance;
    s.obj.intensity = 0;
  }

  /** Camera shake (in art pixels); the renderer reads `shakeOffset`. */
  shake(amount: number, dur = 0.3): void {
    if (reducedMotion()) return;
    this.shakeAmp = Math.min(4, Math.max(this.shakeAmp, amount));
    this.shakeT = Math.max(this.shakeT, dur);
  }

  /** This frame's shake offset in art pixels (x right, y down), or null. */
  shakeOffset(): { x: number; y: number } | null {
    if (this.shakeT <= 0 || this.shakeAmp <= 0) return null;
    const a = this.shakeAmp * Math.min(1, this.shakeT / 0.25);
    return { x: Math.round((Math.random() * 2 - 1) * a), y: Math.round((Math.random() * 2 - 1) * a) };
  }

  // ------------------------------------------------------------------ simple particle bursts

  burst(pos: THREE.Vector3, color: number, count: number, speed = 2.2, gravity = 7, size = 0.07): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.9;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.particle(false, pos.x, pos.y, pos.z, Math.cos(a) * sp, up * sp, Math.sin(a) * sp, 0.45 + Math.random() * 0.35,
        size * (0.7 + Math.random() * 0.6), color, { g: gravity });
    }
  }

  /** Rising sparkles (level up, buffs). */
  sparkle(pos: THREE.Vector3, color: number, count: number, radius = 0.5): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * Math.random();
      this.particle(true, pos.x + Math.cos(a) * r, pos.y + Math.random() * 0.4, pos.z + Math.sin(a) * r, 0, 1.2 + Math.random() * 1.4, 0,
        0.7 + Math.random() * 0.5, 0.06 + Math.random() * 0.05, color, { spin: 0 });
    }
  }

  /** Motes spiralling up around a point (heals, mana, conjuring). */
  spiral(x: number, y: number, z: number, colors: readonly number[], count: number, radius: number, rise: number, dur: number, size = 0.07): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 * 2 + Math.random() * 0.4;
      this.particle(true, x, y + Math.random() * 0.25, z, 0, rise * rand(0.7, 1.3), 0, dur * rand(0.7, 1.1), size * rand(0.7, 1.3), pick(colors), {
        orbit: true, ox: x, oz: z, or: radius * rand(0.75, 1.15), oa: a, ow: rand(4.5, 7) * (i % 2 ? 1 : -1) * (i % 5 === 0 ? -1 : 1), oshrink: 0.35, spin: 0,
        c1: col(0xffffff),
      });
    }
  }

  // ------------------------------------------------------------------ element pieces

  /** Debris and glow thrown out by an element at a point. `n` scales the amount. */
  private debris(effect: Effect, x: number, y: number, z: number, floor: number, n: number, speed: number): void {
    const out = (glow: boolean, max: number, size: number, color: number, up: number, o: Partial<Particle> = {}) => {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * rand(0.35, 1.1);
      return this.particle(glow, x, y, z, Math.cos(a) * sp, up * rand(0.5, 1.2), Math.sin(a) * sp, max, size, color, o);
    };
    switch (effect) {
      case 'fire':
        for (let i = 0; i < n; i++) {
          // burning chunks: arc out, bounce, cool from yellow to dark red
          out(true, rand(0.6, 1.1), rand(0.06, 0.11), pick([0xffe070, 0xffb030, 0xff7a1a]), rand(3, 5.5), { g: 11, floor, bounce: 0.35, c1: col(0x8a1a05), drag: 0.4 });
          if (i % 2 === 0) out(true, rand(0.4, 0.7), rand(0.08, 0.14), 0xff9a2a, rand(1.5, 3), { g: -2.5, drag: 2.5, c1: col(0xa01a00), grow: 0.6 });
          if (i % 3 === 0) out(false, rand(1.0, 1.6), rand(0.1, 0.16), pick([0x2a2420, 0x3a302a, 0x1e1a18]), rand(0.6, 1.4), { g: -1.2, drag: 2.2, grow: 1.8 });
        }
        break;
      case 'ice':
        for (let i = 0; i < n; i++) {
          out(false, rand(0.6, 1.0), rand(0.05, 0.09), pick([0xe8fbff, 0xb6ecff, 0x8adcff]), rand(3, 5), { g: 12, floor, bounce: 0.25, stretch: 2.2, drag: 0.3 });
          if (i % 2 === 0) out(true, rand(0.5, 0.9), rand(0.08, 0.14), 0x9fdcff, rand(0.3, 0.8), { drag: 3, grow: 1.4, c1: col(0x2a5a8a) });
        }
        break;
      case 'earth':
      case 'stone':
        for (let i = 0; i < n; i++) {
          out(false, rand(0.7, 1.2), rand(0.08, 0.16), pick([0x7a6a58, 0x5a5048, 0x8a7a62, 0x4a4038]), rand(3.5, 6), { g: 14, floor, bounce: 0.3, drag: 0.3, spin: 8 });
          if (i % 2 === 0) out(false, rand(0.8, 1.3), rand(0.1, 0.16), pick([0xa89a7a, 0x8a7e66]), rand(0.4, 1), { g: -0.6, drag: 3, grow: 2 });
          if (effect === 'earth' && i % 2 === 1) out(true, rand(0.6, 1.0), rand(0.05, 0.08), pick([0x9aff5a, 0x6ad03a]), rand(1, 2.2), { g: 1.5, drag: 1.5, c1: col(0x1a5a10) });
        }
        break;
      case 'energy':
        for (let i = 0; i < n; i++) {
          out(true, rand(0.25, 0.5), rand(0.04, 0.06), pick([0xffffff, 0xe2c8ff, 0xb07aff]), rand(1.5, 4), { g: 6, drag: 1.2, stretch: 3, c1: col(0x5a2aa0), floor, bounce: 0.5 });
        }
        break;
      case 'death':
        for (let i = 0; i < n; i++) {
          out(false, rand(1.0, 1.6), rand(0.1, 0.16), pick([0x140a18, 0x22102a, 0x0a060c]), rand(0.6, 1.6), { g: -1.5, drag: 2.4, grow: 1.6 });
          if (i % 2 === 0) out(true, rand(0.6, 1.0), rand(0.05, 0.08), pick([0xc06aff, 0x8a3ab0, 0xe0a0ff]), rand(1, 2.4), { g: -1, drag: 1.8, c1: col(0x2a0a40) });
        }
        break;
      case 'holy':
      case 'light':
        for (let i = 0; i < n; i++) out(true, rand(0.6, 1.1), rand(0.05, 0.08), pick([0xfff6c0, 0xffe27a, 0xffffff]), rand(1.5, 3), { g: -1, drag: 1.6, c1: col(0xb08020) });
        break;
      case 'blood':
        for (let i = 0; i < n; i++) {
          out(false, rand(0.5, 0.9), rand(0.05, 0.1), pick([0xb3221b, 0x8a140e, 0xd0302a]), rand(2.5, 4.5), { g: 12, floor, bounce: 0.1 });
          if (i % 2 === 0) out(false, rand(0.8, 1.2), rand(0.1, 0.15), 0x9a8a72, rand(0.3, 0.9), { g: -0.5, drag: 3, grow: 1.6 });
        }
        break;
      case 'heal':
        for (let i = 0; i < n; i++) out(true, rand(0.7, 1.2), rand(0.05, 0.08), pick([0x7dff9a, 0xffe27a, 0xd8ffe0]), rand(1.2, 2.4), { g: -0.5, drag: 1.5, spin: 0 });
        break;
      default:
        for (let i = 0; i < n; i++) out(false, rand(0.4, 0.7), rand(0.05, 0.08), EFFECT_COLOR[effect], rand(2, 3.5), { g: 9, floor, bounce: 0.3 });
    }
  }

  private flashColor(effect: Effect): number {
    switch (effect) {
      case 'fire': return 0xffc060;
      case 'ice': return 0xd8f6ff;
      case 'energy': return 0xe6d0ff;
      case 'earth': return 0xb8ff80;
      case 'stone': return 0xd8c8a8;
      case 'death': return 0xb050ff;
      case 'holy': case 'light': return 0xfff4c0;
      case 'blood': return 0xff6040;
      default: return 0xffffff;
    }
  }

  private decalFor(effect: Effect): { kind: DecalKind; tint: number; add: boolean } | null {
    switch (effect) {
      case 'fire': return { kind: 'scorch', tint: 0xffffff, add: false };
      case 'ice': return { kind: 'frost', tint: 0xffffff, add: false };
      case 'earth': return { kind: 'crack', tint: 0xb0d890, add: false };
      case 'stone': case 'physical': case 'blood': return { kind: 'crack', tint: 0xffffff, add: false };
      case 'energy': return { kind: 'burn', tint: 0xd0b8ff, add: false };
      case 'death': return { kind: 'death', tint: 0xffffff, add: false };
      case 'holy': case 'light': return { kind: 'sigil', tint: 0xb89a40, add: true };
      default: return null;
    }
  }

  // ------------------------------------------------------------------ spell and rune looks

  /**
   * Area spell or rune: a short anticipation flash, then the blast — core
   * flash, shockwave, tiles lighting outwards, element debris, a lingering
   * ground mark and a light flash.
   */
  explosion(cx: number, cz: number, off: number, radius: number, effect: Effect): void {
    const R = Math.max(0, radius);
    const big = R >= 2;
    const fc = this.flashColor(effect);
    const color = EFFECT_COLOR[effect];
    const centre = new THREE.Vector3(cx, off + 0.35, cz);
    const ground = new THREE.Vector3(cx, off + 0.05, cz);

    if (effect === 'heal') return this.massHeal(cx, cz, off, R);
    if (R >= 4) return this.ultimate(cx, cz, off, R, effect);

    // anticipation: everything is sucked in for a blink
    const pre = effect === 'death' ? 0.16 : 0.1;
    if (effect === 'death') {
      this.sprite(centre, 0x12041c, 1.6 + R * 0.7, 0.25, pre + 0.04, { dark: true, peak: 0.9 });
      this.sprite(centre, 0x9a40ff, 1.2 + R * 0.6, 0.2, pre + 0.04, { peak: 0.6 });
      for (let i = 0; i < 18 + R * 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.6 + R * 0.7 + Math.random() * 0.6;
        this.particle(true, cx + Math.cos(a) * r, off + rand(0.2, 1.0), cz + Math.sin(a) * r, -Math.cos(a) * r / pre, rand(-1, 1), -Math.sin(a) * r / pre, pre, 0.06, 0xd090ff, { spin: 0, stretch: 1.2 });
      }
    } else {
      this.sprite(centre, fc, 0.3, 0.9 + R * 0.35, pre + 0.04, { peak: 0.8 });
      this.ring(ground, fc, 0.6 + R * 1.0, 0.15, pre, 0, false, 0, 0.7);
    }

    this.after(pre, () => {
      // the blast
      this.sprite(centre, fc, 0.6, 1.6 + R * 1.1, 0.28, { peak: 1, hold: 0.05 });
      this.sprite(centre.clone().setY(off + 0.25), color, 0.8, 2.2 + R * 1.3, 0.5, { peak: 0.75, hold: 0.1 });
      this.ring(ground, fc, 0.3, R + 0.75, 0.4 + R * 0.04, 0, true, 0, 1);
      this.ring(ground.clone().setY(off + 0.06), color, 0.2, R + 1.4, 0.65, 0, false, 0.05, 0.6);
      this.light(new THREE.Vector3(cx, off + 1.4, cz), fc, 5 + R * 3, 4 + R * 2.5, 0.45);
      if (big) this.shakeNear(cx, cz, 1.5 + R * 0.5);

      // tiles light up outwards
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R + R) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const delay = d * 0.05;
        this.tileFlash(cx + dx, off, cz + dy, effect, delay, 0.5, fc);
        this.after(delay, () => this.tileBurst(effect, cx + dx, off, cz + dy, d === 0 ? 1 : 0.6));
      }
      // main debris from the centre
      this.debris(effect, cx, off + 0.35, cz, off + 0.04, 14 + R * 8, 2.4 + R * 1.1);

      // element signatures
      switch (effect) {
        case 'fire':
          for (let i = 0; i < 2 + R * 2; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * R;
            this.sprite(new THREE.Vector3(cx + Math.cos(a) * r, off + rand(0.3, 0.7), cz + Math.sin(a) * r), pick([0xff9a2a, 0xffc04a, 0xff6010]), 0.3, rand(0.9, 1.5), rand(0.35, 0.5), { delay: rand(0, 0.15), rise: 0.8, peak: 0.8 });
          }
          break;
        case 'energy':
          for (let i = 0; i < 2 + R * 2; i++) {
            const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : Math.random() * R;
            const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
            this.bolt(new THREE.Vector3(tx + rand(-0.4, 0.4), off + 6, tz - 1.5), new THREE.Vector3(tx, off + 0.05, tz), 0xc89aff, 0.22, 0.45, i * 0.05);
            this.after(i * 0.05, () => this.sprite(new THREE.Vector3(tx, off + 0.2, tz), 0xe6d0ff, 0.3, 1.2, 0.2, { peak: 0.9 }));
          }
          break;
        case 'death':
          this.sprite(centre.clone().setY(off + 0.6), 0xe8d8ff, 0.5, 0.95, 1.2, { tex: 'skull', rise: 0.9, peak: 1, hold: 0.25 });
          this.spiral(cx, off + 0.2, cz, [0xb060ff, 0x6a20a0, 0xe0b0ff], 12 + R * 4, 0.4 + R * 0.25, 1.4, 1.2, 0.07);
          break;
        case 'holy':
          this.column(new THREE.Vector3(cx, off, cz), 0xffe9a0, 0.5 + R * 0.25, 5, 0.7);
          break;
        case 'ice':
          // ice spikes burst up from the ground
          for (let i = 0; i < 3 + R * 3; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * (R + 0.4);
            this.particle(false, cx + Math.cos(a) * r, off + 0.05, cz + Math.sin(a) * r, 0, rand(2.5, 3.5), 0, rand(0.5, 0.8), rand(0.09, 0.13), pick([0xe8fbff, 0xb6ecff]), { g: 9, drag: 2, stretch: 3.2, spin: 0 });
          }
          break;
        default:
          break;
      }

      // ground marks that linger
      const dec = this.decalFor(effect);
      if (dec) {
        const life = big ? 3.6 : 2.6;
        this.decal(cx, off, cz, dec.kind, 1.2 + R * 0.9, life, dec.tint, dec.add);
        const extra = R * 2;
        for (let i = 0; i < extra; i++) {
          const a = Math.random() * Math.PI * 2, r = rand(0.6, R);
          this.decal(cx + Math.round(Math.cos(a) * r), off, cz + Math.round(Math.sin(a) * r), dec.kind, rand(0.6, 1.0), life * rand(0.6, 0.9), dec.tint, dec.add, rand(0.05, 0.25));
        }
      }
    });
  }

  /**
   * The ultimate explosions (radius 4+ around the caster): a gathering flash,
   * then the element erupts across every tile, rolling outwards from the
   * caster, with a blinding flash, a huge shockwave, heavy shake and scorched
   * ground.
   */
  private ultimate(cx: number, cz: number, off: number, R: number, effect: Effect): void {
    const fc = this.flashColor(effect);
    const color = EFFECT_COLOR[effect];
    const centre = new THREE.Vector3(cx, off + 0.5, cz);
    const ground = new THREE.Vector3(cx, off + 0.05, cz);
    const pre = 0.16;
    // gathering: the caster draws the power in
    this.sprite(centre, fc, 0.3, 1.6, pre + 0.05, { peak: 1 });
    this.ring(ground, fc, R + 1.2, 0.2, pre, 0, true, 0, 0.8);
    this.column(new THREE.Vector3(cx, off, cz), fc, 0.45, 4, pre + 0.2);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = R * rand(0.6, 1.1);
      this.particle(true, cx + Math.cos(a) * r, off + rand(0.2, 1.4), cz + Math.sin(a) * r, -Math.cos(a) * r / pre, rand(-1, 1), -Math.sin(a) * r / pre, pre, 0.06, fc, { spin: 0, stretch: 2 });
    }

    this.after(pre, () => {
      // blinding flash, huge light, shockwaves, shake
      this.sprite(centre, 0xffffff, 1, 3 + R * 1.5, 0.3, { peak: 1, hold: 0.1 });
      this.sprite(centre.clone().setY(off + 0.3), fc, 1, 4 + R * 2, 0.55, { peak: 0.9, hold: 0.15 });
      this.light(new THREE.Vector3(cx, off + 2.5, cz), fc, 16, 9 + R * 2, 0.7);
      this.light(new THREE.Vector3(cx + R * 0.6, off + 1.5, cz - R * 0.4), color, 8, 6 + R, 0.6, 0.12);
      this.ring(ground, 0xffffff, 0.4, R + 1.3, 0.6, 0, true, 0, 1);
      this.ring(ground.clone().setY(off + 0.06), fc, 0.3, R + 2.2, 0.85, 0, true, 0.08, 0.7);
      this.ring(ground.clone().setY(off + 0.07), color, 0.2, R + 0.6, 0.5, 0, false, 0.2, 0.8);
      this.shakeNear(cx, cz, 3.2, 0.7);
      this.debris(effect, cx, off + 0.4, cz, off + 0.04, 30, 5);

      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R + R || (dx === 0 && dy === 0)) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const delay = (d - 1) * 0.065 + Math.random() * 0.04;
        const x = cx + dx, z = cz + dy;
        this.tileFlash(x, off, z, effect, delay, 0.75, fc);
        this.after(delay, () => this.ultimateTile(effect, x, off, z, cx, cz, d === R));
      }
    });
  }

  private ultimateTile(effect: Effect, x: number, off: number, z: number, cx: number, cz: number, edge: boolean): void {
    // outward direction from the caster
    let ox = x - cx, oz = z - cz;
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol;
    oz /= ol;
    const roll = Math.random();
    switch (effect) {
      case 'fire': {
        // tall flame tongues
        for (let i = 0; i < 5; i++) {
          this.particle(true, x + rand(-0.4, 0.4), off + 0.08, z + rand(-0.4, 0.4), ox * rand(0.2, 0.9), rand(3, 5.5), oz * rand(0.2, 0.9), rand(0.45, 0.75), rand(0.1, 0.17), pick([0xfff0a0, 0xffd050, 0xffa030, 0xff7a1a]), { g: -0.5, drag: 1.2, c1: col(0x8a1000), grow: 0.5, spin: 0 });
        }
        // rolling fireballs
        if (roll < 0.45) this.sprite(new THREE.Vector3(x + rand(-0.2, 0.2), off + rand(0.3, 0.6), z + rand(-0.2, 0.2)), pick([0xff9a2a, 0xffc04a, 0xff6010]), 0.4, rand(1.1, 1.7), rand(0.4, 0.6), { rise: 1.2, peak: 0.85, hold: 0.2 });
        // burning chunks and smoke
        this.particle(true, x, off + 0.3, z, ox * rand(1, 2.5) + rand(-0.5, 0.5), rand(3, 5), oz * rand(1, 2.5) + rand(-0.5, 0.5), rand(0.7, 1.1), rand(0.06, 0.1), 0xffd060, { g: 11, floor: off + 0.04, bounce: 0.35, c1: col(0x6a0a00) });
        if (roll > 0.55) this.particle(false, x, off + 0.8, z, ox * 0.4, rand(0.8, 1.4), oz * 0.4, rand(1.4, 2), rand(0.14, 0.2), pick([0x2a2420, 0x1e1a18, 0x3a302a]), { g: -0.4, drag: 1.2, grow: 2.2 });
        if (roll < 0.7) this.decal(x, off, z, 'scorch', rand(0.85, 1.15), rand(3, 4), 0xffffff, false, 0.1);
        break;
      }
      case 'energy': {
        // lightning on many tiles, arcs jumping between neighbours
        if (roll < 0.42) {
          this.bolt(new THREE.Vector3(x + rand(-0.5, 0.5), off + 7, z - 2), new THREE.Vector3(x, off + 0.05, z), pick([0xc89aff, 0xe6d0ff]), rand(0.2, 0.32), 0.5);
          this.sprite(new THREE.Vector3(x, off + 0.25, z), 0xf0e4ff, 0.3, 1.5, 0.22, { peak: 1 });
          this.decal(x, off, z, 'burn', rand(0.8, 1.1), rand(2.8, 3.8), 0xd0b8ff, false, 0.05);
          this.debris('energy', x, off + 0.2, z, off + 0.04, 6, 2.5);
        } else if (roll < 0.7) {
          const a = Math.floor(Math.random() * 4) * (Math.PI / 2);
          this.bolt(new THREE.Vector3(x, off + rand(0.1, 0.5), z), new THREE.Vector3(x + Math.round(Math.cos(a)), off + rand(0.1, 0.5), z + Math.round(Math.sin(a))), 0xb07aff, rand(0.15, 0.28), 0.35);
        }
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particle(true, x, off + 0.15, z, Math.cos(a) * rand(1.5, 3), rand(0.5, 2.5), Math.sin(a) * rand(1.5, 3), rand(0.2, 0.4), 0.05, pick([0xffffff, 0xd8b8ff]), { g: 5, stretch: 3, c1: col(0x6a2ac0) });
        }
        break;
      }
      case 'ice': {
        // the blizzard: ice spikes burst up, shards fly, frost spreads
        for (let i = 0; i < 2; i++) this.particle(false, x + rand(-0.3, 0.3), off + 0.05, z + rand(-0.3, 0.3), 0, rand(3, 4.2), 0, rand(0.55, 0.85), rand(0.1, 0.15), pick([0xe8fbff, 0xb6ecff]), { g: 10, drag: 2.2, stretch: 3.5, spin: 0 });
        for (let i = 0; i < 2; i++) this.particle(false, x, off + 0.3, z, ox * rand(1, 3) + rand(-1, 1), rand(2, 4), oz * rand(1, 3) + rand(-1, 1), rand(0.6, 0.9), rand(0.05, 0.08), pick([0xe8fbff, 0x8adcff]), { g: 12, floor: off + 0.04, bounce: 0.25, stretch: 2.2 });
        this.particle(true, x, off + 0.25, z, -oz * 2.5, rand(0.2, 0.6), ox * 2.5, rand(0.7, 1.0), rand(0.16, 0.24), 0x6ab0e0, { drag: 1.5, grow: 1.6, spin: 0, c1: col(0x0a1a2a) });
        if (roll < 0.35) this.sprite(new THREE.Vector3(x, off + 0.3, z), 0xd8f6ff, 0.3, 1.1, 0.3, { peak: 0.8 });
        if (roll < 0.75) this.decal(x, off, z, 'frost', rand(0.9, 1.15), rand(3, 4), 0xffffff, false, 0.05);
        break;
      }
      case 'earth': {
        // the ground erupts: rocks, thorns and spores
        for (let i = 0; i < 3; i++) this.particle(false, x + rand(-0.3, 0.3), off + 0.05, z + rand(-0.3, 0.3), ox * rand(0.3, 1.5) + rand(-0.6, 0.6), rand(3.5, 5.5), oz * rand(0.3, 1.5) + rand(-0.6, 0.6), rand(0.7, 1.0), rand(0.08, 0.16), pick([0x7a6a58, 0x5a5048, 0x8a7a62]), { g: 14, floor: off + 0.04, bounce: 0.3, spin: 9 });
        if (roll < 0.6) for (let i = 0; i < 2; i++) this.particle(false, x + rand(-0.3, 0.3), off + 0.05, z + rand(-0.3, 0.3), rand(-0.2, 0.2), rand(3, 4), rand(-0.2, 0.2), rand(0.6, 0.9), rand(0.07, 0.1), pick([0x3a6a20, 0x4a8a2a, 0x2a5a18]), { g: 9, drag: 2.5, stretch: 3.5, spin: 0 });
        this.particle(true, x, off + 0.2, z, rand(-0.6, 0.6), rand(1, 2.2), rand(-0.6, 0.6), 0.9, 0.06, 0x9aff5a, { drag: 1.5, c1: col(0x1a5a10) });
        this.particle(false, x, off + 0.2, z, ox * 0.8, 0.5, oz * 0.8, 1.2, 0.18, 0x9a8c70, { drag: 2.2, grow: 2.2 });
        if (roll < 0.65) this.decal(x, off, z, 'crack', rand(0.85, 1.1), rand(3, 4), 0xb0d890, false, 0.05);
        break;
      }
      default:
        this.tileBurst(effect, x, off, z, 1);
        if (roll < 0.5) {
          const dec = this.decalFor(effect);
          if (dec) this.decal(x, off, z, dec.kind, rand(0.8, 1.1), rand(2.6, 3.6), dec.tint, dec.add, 0.05);
        }
    }
    if (edge && roll < 0.5) this.ring(new THREE.Vector3(x, off + 0.06, z), this.flashColor(effect), 0.2, 0.6, 0.3, 0, true, 0, 0.6);
  }

  /** What one tile of an area or wave spits out. */
  private tileBurst(effect: Effect, x: number, off: number, z: number, k: number): void {
    const n = Math.max(1, Math.round(4 * k));
    switch (effect) {
      case 'fire':
        for (let i = 0; i < n + 2; i++) {
          this.particle(true, x + rand(-0.35, 0.35), off + 0.1, z + rand(-0.35, 0.35), rand(-0.3, 0.3), rand(1.6, 3), rand(-0.3, 0.3), rand(0.35, 0.6), rand(0.08, 0.14), pick([0xffe070, 0xffa030]), { g: -1, drag: 1.5, c1: col(0xa01a00), grow: 0.4, spin: 0 });
        }
        break;
      case 'ice':
        for (let i = 0; i < n; i++) {
          this.particle(false, x + rand(-0.35, 0.35), off + 0.05, z + rand(-0.35, 0.35), rand(-0.4, 0.4), rand(1.8, 3), rand(-0.4, 0.4), rand(0.4, 0.7), rand(0.05, 0.09), pick([0xe8fbff, 0xb6ecff, 0x8adcff]), { g: 10, floor: off + 0.04, bounce: 0.2, stretch: 2.4 });
        }
        this.particle(true, x, off + 0.15, z, 0, 0.4, 0, 0.7, 0.2, 0x5a9ac8, { drag: 2, grow: 1.4, spin: 0, c1: col(0x0a1a2a) });
        break;
      case 'earth':
      case 'stone':
        for (let i = 0; i < n; i++) {
          this.particle(false, x + rand(-0.3, 0.3), off + 0.05, z + rand(-0.3, 0.3), rand(-0.8, 0.8), rand(2.5, 4), rand(-0.8, 0.8), rand(0.6, 0.9), rand(0.07, 0.13), pick([0x7a6a58, 0x5a5048, 0x8a7a62]), { g: 14, floor: off + 0.04, bounce: 0.3, spin: 8 });
        }
        this.particle(false, x, off + 0.12, z, 0, 0.3, 0, 0.9, 0.16, 0x9a8c70, { drag: 3, grow: 1.8 });
        break;
      case 'energy':
        for (let i = 0; i < n + 1; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particle(true, x, off + 0.15, z, Math.cos(a) * rand(1.5, 3), rand(0.5, 2.5), Math.sin(a) * rand(1.5, 3), rand(0.2, 0.4), 0.05, pick([0xffffff, 0xd8b8ff]), { g: 5, stretch: 3, c1: col(0x6a2ac0) });
        }
        break;
      case 'death':
        for (let i = 0; i < n; i++) {
          this.particle(false, x + rand(-0.3, 0.3), off + 0.1, z + rand(-0.3, 0.3), rand(-0.3, 0.3), rand(0.5, 1.2), rand(-0.3, 0.3), rand(0.8, 1.2), rand(0.1, 0.15), pick([0x140a18, 0x26102e]), { drag: 2, grow: 1.5, g: -0.5 });
          if (i % 2 === 0) this.particle(true, x, off + 0.1, z, rand(-0.5, 0.5), rand(1, 2), rand(-0.5, 0.5), rand(0.5, 0.8), 0.06, 0xc070ff, { drag: 1.5, c1: col(0x2a0a40) });
        }
        break;
      case 'blood':
        for (let i = 0; i < n; i++) this.particle(false, x, off + 0.3, z, rand(-1.5, 1.5), rand(1.5, 3), rand(-1.5, 1.5), rand(0.5, 0.8), rand(0.05, 0.09), pick([0xb3221b, 0x8a140e]), { g: 12, floor: off + 0.04, bounce: 0.1 });
        break;
      case 'holy':
      case 'light':
      case 'heal':
        for (let i = 0; i < n; i++) this.particle(true, x + rand(-0.3, 0.3), off + 0.1, z + rand(-0.3, 0.3), 0, rand(1, 2.2), 0, rand(0.6, 1.0), 0.06, pick([0xfff6c0, 0xffe27a]), { spin: 0, c1: col(0x806010) });
        break;
      default:
        this.burst(new THREE.Vector3(x, off + 0.15, z), EFFECT_COLOR[effect], n, 1.6, 5, 0.08);
    }
  }

  /** Small single-target hit (missile lands, strike spell). `power` ~0.3–1.6 by damage. */
  impact(pos: THREE.Vector3, effect: Effect, power = 1): void {
    const p = Math.max(0.3, Math.min(1.6, power));
    const fc = this.flashColor(effect);
    const floor = pos.y - 0.6;
    switch (effect) {
      case 'heal':
      case 'holy':
      case 'light':
        this.sprite(pos, fc, 0.3, 0.9 + p * 0.5, 0.3, { peak: 0.85 });
        this.debris(effect, pos.x, pos.y, pos.z, floor, Math.round(8 + 8 * p), 1.4);
        if (effect === 'holy' && p > 0.5) this.column(new THREE.Vector3(pos.x, floor + 0.05, pos.z), 0xffe9a0, 0.3, 4, 0.45);
        return;
      case 'death':
        // implosion, then a dark burst and a skull rising from the victim
        this.sprite(pos, 0x10041a, 1.1 + p * 0.4, 0.2, 0.14, { dark: true, peak: 0.95 });
        this.sprite(pos, 0xa040ff, 0.9 + p * 0.3, 0.15, 0.14, { peak: 0.7 });
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2, r = 0.7 + Math.random() * 0.3;
          this.particle(true, pos.x + Math.cos(a) * r, pos.y + rand(-0.3, 0.4), pos.z + Math.sin(a) * r, -Math.cos(a) * r / 0.13, 0, -Math.sin(a) * r / 0.13, 0.13, 0.06, 0xe0b0ff, { spin: 0, stretch: 1.4 });
        }
        this.after(0.12, () => {
          this.sprite(pos, 0xc070ff, 0.4, 1.3 + p * 0.6, 0.3, { peak: 1, hold: 0.05 });
          this.sprite(pos.clone().setY(pos.y + 0.3), 0xeedcff, 0.45, 0.85, 1.1, { tex: 'skull', rise: 0.8, hold: 0.3 });
          this.ring(new THREE.Vector3(pos.x, floor + 0.06, pos.z), 0xa040ff, 0.2, 1.1 + p * 0.4, 0.35, 0, true);
          this.debris('death', pos.x, pos.y, pos.z, floor, Math.round(8 + 8 * p), 1.8);
          this.spiral(pos.x, floor + 0.2, pos.z, [0xb060ff, 0x6a20a0, 0xe0b0ff], Math.round(6 + 6 * p), 0.35, 1.5, 1.0, 0.06);
          if (p > 0.7) this.decal(pos.x, floor, pos.z, 'death', 0.9 + p * 0.3, 2.6, 0xffffff);
          this.light(pos, 0xa040ff, 3 + p * 3, 4, 0.4);
        });
        return;
      default: {
        this.sprite(pos, fc, 0.3, 0.75 + p * 0.55, 0.22, { peak: 0.95, hold: 0.05 });
        this.debris(effect, pos.x, pos.y, pos.z, floor, Math.round(6 + 7 * p), 1.8 + p * 0.8);
        if (effect === 'energy') {
          this.bolt(new THREE.Vector3(pos.x + rand(-0.3, 0.3), pos.y + 3.5, pos.z - 1), pos, 0xc89aff, 0.16, 0.3);
        }
        if (effect === 'ice') {
          for (let i = 0; i < 4; i++) this.particle(false, pos.x + rand(-0.3, 0.3), floor + 0.05, pos.z + rand(-0.3, 0.3), 0, rand(2, 3), 0, 0.5, rand(0.07, 0.1), 0xe8fbff, { g: 9, drag: 2, stretch: 3, spin: 0 });
        }
        if (ELEMENTAL.has(effect) && effect !== 'physical') {
          this.ring(new THREE.Vector3(pos.x, floor + 0.06, pos.z), fc, 0.2, 0.7 + p * 0.4, 0.3, 0, true, 0, 0.7);
          if (p >= 0.6) this.light(pos, fc, 2 + p * 2.5, 3.5, 0.3);
          const dec = this.decalFor(effect);
          if (dec && p >= 0.9) this.decal(pos.x, floor, pos.z, dec.kind, 0.7 + p * 0.25, 2.2, dec.tint, dec.add);
        }
      }
    }
  }

  /** Waves roll outwards row by row: each row bursts its element. `dir` = caster's facing. */
  wave(tiles: number[], ox: number, oz: number, off: number, effect: Effect): void {
    const fc = this.flashColor(effect);
    let far = 1;
    let sx = 0, sz = 0;
    for (let i = 0; i < tiles.length; i += 2) {
      const x = tiles[i], z = tiles[i + 1];
      const d = Math.max(Math.abs(x - ox), Math.abs(z - oz));
      far = Math.max(far, d);
      sx += x;
      sz += z;
    }
    const n = tiles.length / 2 || 1;
    // direction the wave travels
    let dx = sx / n - ox, dz = sz / n - oz;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    for (let i = 0; i < tiles.length; i += 2) {
      const x = tiles[i], z = tiles[i + 1];
      const d = Math.max(Math.abs(x - ox), Math.abs(z - oz));
      const delay = (d - 1) * 0.07;
      this.tileFlash(x, off, z, effect, delay, 0.5, fc);
      this.after(delay, () => this.waveTile(effect, x, off, z, dx, dz, d === far));
    }
    this.light(new THREE.Vector3(ox + dx * far * 0.6, off + 1.2, oz + dz * far * 0.6), fc, 4 + far, 5 + far, 0.5);
    this.shakeNear(ox, oz, 1);
    // the leading edge: a shockwave front along the last row
    this.sprite(new THREE.Vector3(ox + dx * 0.8, off + 0.4, oz + dz * 0.8), fc, 0.3, 1.0, 0.18, { peak: 0.8 });
  }

  private waveTile(effect: Effect, x: number, off: number, z: number, dx: number, dz: number, last: boolean): void {
    const push = 1.6;
    switch (effect) {
      case 'fire':
        for (let i = 0; i < 6; i++) {
          this.particle(true, x + rand(-0.4, 0.4), off + 0.1, z + rand(-0.4, 0.4), dx * push * rand(0.5, 1.2), rand(1.8, 3.4), dz * push * rand(0.5, 1.2), rand(0.35, 0.6), rand(0.09, 0.15), pick([0xffe070, 0xffb030, 0xff7a1a]), { g: -1, drag: 1.4, c1: col(0x901800), grow: 0.5, spin: 0 });
        }
        this.particle(false, x, off + 0.5, z, dx * 0.5, 1, dz * 0.5, 1.1, 0.13, 0x2a2420, { g: -0.6, drag: 2, grow: 1.6 });
        this.particle(true, x, off + 0.2, z, rand(-1, 1), rand(2.5, 4), rand(-1, 1), 0.8, 0.07, 0xffd060, { g: 9, floor: off + 0.04, bounce: 0.3, c1: col(0x801000) });
        if (last || Math.random() < 0.3) this.decal(x, off, z, 'scorch', rand(0.7, 1.0), rand(2.2, 3.2), 0xffffff);
        break;
      case 'ice':
        for (let i = 0; i < 4; i++) {
          this.particle(false, x + rand(-0.35, 0.35), off + 0.05, z + rand(-0.35, 0.35), dx * rand(0.2, 1), rand(2.2, 3.4), dz * rand(0.2, 1), rand(0.45, 0.75), rand(0.06, 0.1), pick([0xe8fbff, 0xb6ecff, 0x8adcff]), { g: 10, floor: off + 0.04, bounce: 0.25, stretch: 2.8 });
        }
        for (let i = 0; i < 2; i++) this.particle(true, x + rand(-0.3, 0.3), off + 0.2, z + rand(-0.3, 0.3), dx * push, rand(0.2, 0.6), dz * push, rand(0.6, 0.9), rand(0.14, 0.2), 0x6ab0e0, { drag: 2.5, grow: 1.5, spin: 0, c1: col(0x0a1a2a) });
        if (last || Math.random() < 0.4) this.decal(x, off, z, 'frost', rand(0.8, 1.05), rand(2.4, 3.4), 0xffffff);
        break;
      case 'earth':
      case 'stone':
        for (let i = 0; i < 4; i++) {
          this.particle(false, x + rand(-0.3, 0.3), off + 0.05, z + rand(-0.3, 0.3), dx * rand(0.3, 1.2) + rand(-0.5, 0.5), rand(3, 4.8), dz * rand(0.3, 1.2) + rand(-0.5, 0.5), rand(0.6, 0.9), rand(0.08, 0.15), pick([0x7a6a58, 0x5a5048, 0x8a7a62]), { g: 14, floor: off + 0.04, bounce: 0.3, spin: 9 });
        }
        if (effect === 'earth') for (let i = 0; i < 2; i++) this.particle(true, x, off + 0.2, z, rand(-0.6, 0.6), rand(1, 2), rand(-0.6, 0.6), 0.8, 0.06, 0x9aff5a, { drag: 1.5, c1: col(0x1a5a10) });
        this.particle(false, x, off + 0.15, z, dx * 0.6, 0.4, dz * 0.6, 1.0, 0.16, 0x9a8c70, { drag: 2.5, grow: 2 });
        if (last || Math.random() < 0.3) this.decal(x, off, z, 'crack', rand(0.7, 1.0), rand(2.2, 3.2), effect === 'earth' ? 0xb0d890 : 0xffffff);
        break;
      case 'energy':
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particle(true, x, off + 0.2, z, Math.cos(a) * 2 + dx * push, rand(0.5, 2.5), Math.sin(a) * 2 + dz * push, rand(0.2, 0.4), 0.05, pick([0xffffff, 0xd8b8ff]), { g: 5, stretch: 3, c1: col(0x6a2ac0) });
        }
        if (Math.random() < 0.5) this.bolt(new THREE.Vector3(x + rand(-0.4, 0.4), off + 0.05, z + rand(-0.4, 0.4)), new THREE.Vector3(x + rand(-0.4, 0.4), off + rand(0.5, 1), z + rand(-0.4, 0.4)), 0xc89aff, 0.14, 0.2);
        if (last) this.decal(x, off, z, 'burn', 0.8, 2.4, 0xd0b8ff);
        break;
      default:
        this.tileBurst(effect, x, off, z, 0.8);
    }
  }

  /** A beam: a bright core and glow along the tiles, with crackling arcs. */
  beam(tiles: number[], ox: number, oz: number, off: number, effect: Effect): void {
    if (!tiles.length) return;
    const fc = this.flashColor(effect);
    const color = EFFECT_COLOR[effect];
    const lx = tiles[tiles.length - 2], lz = tiles[tiles.length - 1];
    const dx = Math.sign(lx - ox), dz = Math.sign(lz - oz);
    const y = off + 0.6;
    const from = new THREE.Vector3(ox + dx * 0.35, y, oz + dz * 0.35);
    const to = new THREE.Vector3(lx + dx * 0.45, y, lz + dz * 0.45);
    this.beamMesh(from, to, color, 0.42);
    this.bolt(from, to, fc, 0.4, 0.22);
    this.bolt(from, to, color, 0.35, 0.32, 0.04);
    this.sprite(from, fc, 0.4, 1.1, 0.25, { peak: 1 });
    this.sprite(to, fc, 0.4, 1.3, 0.35, { peak: 0.9, delay: 0.05 });
    this.light(new THREE.Vector3((from.x + to.x) / 2, y + 0.6, (from.z + to.z) / 2), fc, 6, 6, 0.45);
    for (let i = 0; i < tiles.length; i += 2) {
      const x = tiles[i], z = tiles[i + 1];
      const delay = (i / 2) * 0.02;
      this.tileFlash(x, off, z, effect, delay, 0.45, fc);
      this.after(delay, () => {
        for (let k = 0; k < 5; k++) {
          const a = Math.random() * Math.PI * 2;
          this.particle(true, x, y + rand(-0.1, 0.1), z, Math.cos(a) * rand(1, 2.6), rand(-0.5, 2), Math.sin(a) * rand(1, 2.6), rand(0.2, 0.45), 0.05, pick([0xffffff, fc, color]), { g: 6, stretch: 3, floor: off + 0.04, bounce: 0.5, c1: col(0x4a1a90) });
        }
      });
    }
    this.decal(lx, off, lz, effect === 'energy' ? 'burn' : 'scorch', 0.9, 2.6, effect === 'energy' ? 0xd0b8ff : 0xffffff);
    this.shakeNear(ox, oz, 1);
  }

  /** Mass healing: a wide ring of light sweeping out and motes rising on every tile. */
  private massHeal(cx: number, cz: number, off: number, R: number): void {
    const ground = new THREE.Vector3(cx, off + 0.05, cz);
    this.decal(cx, off, cz, 'sigil', 1.6 + R * 0.8, 1.8, 0x5ad07a, true);
    this.ring(ground, 0xb8ffc8, 0.3, R + 0.8, 0.7, 0, true, 0, 0.8);
    this.ring(ground.clone().setY(off + 0.07), 0xffe27a, 0.2, R + 0.4, 0.9, 0, false, 0.12, 0.7);
    this.light(new THREE.Vector3(cx, off + 1.6, cz), 0x9dffb0, 4, 5 + R * 2, 0.9);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R + R) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      const delay = d * 0.06;
      this.tileFlash(cx + dx, off, cz + dy, 'heal', delay, 0.7, 0x5ad07a);
      this.after(delay, () => {
        for (let i = 0; i < 3; i++) {
          this.particle(true, cx + dx + rand(-0.35, 0.35), off + 0.1, cz + dy + rand(-0.35, 0.35), 0, rand(1.0, 2.0), 0, rand(0.8, 1.2), rand(0.05, 0.08), pick([0x7dff9a, 0xffe27a, 0xd8ffe0]), { spin: 0, drag: 0.6, c1: col(0x2a8a40) });
        }
      });
    }
  }

  /** Healing: a rising column of light with spiralling green-gold motes. `power` 0–1.5 by how much was healed. */
  heal(foot: THREE.Vector3, power: number, height = 1.4): void {
    const p = Math.max(0.15, Math.min(1.5, power));
    const g = new THREE.Vector3(foot.x, foot.y + 0.02, foot.z);
    this.column(g, 0x5ad07a, 0.3 + p * 0.16, 1.4 + p * 1.6, 0.85 + p * 0.35);
    this.column(g, 0xe8ffc0, 0.14 + p * 0.06, 1.8 + p * 2, 0.6 + p * 0.3, 0.05);
    this.spiral(foot.x, foot.y + 0.1, foot.z, [0x7dff9a, 0xffe27a, 0xb8ffc8, 0xffffff], Math.round(12 + 26 * p), 0.38 + p * 0.1, 1.2 + p * 0.5, 0.9 + p * 0.3, 0.06 + p * 0.015);
    this.ring(new THREE.Vector3(foot.x, foot.y + 0.05, foot.z), 0x9dffb0, 0.2, 0.75 + p * 0.45, 0.55, 0, true, 0, 0.75);
    this.ring(new THREE.Vector3(foot.x, foot.y + 0.06, foot.z), 0xffe27a, 0.15, 0.6 + p * 0.4, 0.7, 0, false, 0.15, 0.6);
    this.decal(foot.x, foot.y, foot.z, 'sigil', 0.9 + p * 0.5, 1.1 + p * 0.5, 0x4ab86a, true);
    // a few golden petals drifting down from the top of the column
    for (let i = 0; i < Math.round(3 + 6 * p); i++) {
      this.particle(true, foot.x + rand(-0.4, 0.4), foot.y + height + p, foot.z + rand(-0.4, 0.4), rand(-0.2, 0.2), rand(-0.8, -0.3), rand(-0.2, 0.2), rand(0.8, 1.3), 0.05, pick([0xffe27a, 0xfff6c0]), { spin: 0 });
    }
    if (p > 0.45) this.light(new THREE.Vector3(foot.x, foot.y + 1.2, foot.z), 0x9dffb0, 1.5 + p * 2.5, 3.5 + p, 0.8);
  }

  /** Mana: blue motes swirling up. */
  mana(foot: THREE.Vector3, power: number): void {
    const p = Math.max(0.2, Math.min(1.5, power));
    this.spiral(foot.x, foot.y + 0.15, foot.z, [0x7fb2ff, 0xb8d8ff, 0x4a7aff, 0xffffff], Math.round(10 + 18 * p), 0.36, 1.3, 0.9, 0.06);
    this.ring(new THREE.Vector3(foot.x, foot.y + 0.05, foot.z), 0x7fb2ff, 0.2, 0.7 + p * 0.3, 0.5, 0, true, 0, 0.6);
    if (p > 0.6) this.column(new THREE.Vector3(foot.x, foot.y + 0.02, foot.z), 0x4a7aff, 0.26, 1.6, 0.7);
  }

  /** Self-buffs (radius-0 support areas): shields get a dome, haste a whirl, light a warm flash. */
  buff(foot: THREE.Vector3, effect: Effect): void {
    const g = new THREE.Vector3(foot.x, foot.y + 0.03, foot.z);
    const color = EFFECT_COLOR[effect];
    switch (effect) {
      case 'shield':
        this.dome(g, 0x6a9aff, 0.62, 1.3);
        this.ring(g, 0x9fc4ff, 0.2, 0.9, 0.5, 0, true);
        this.spiral(foot.x, foot.y + 0.1, foot.z, [0x9fc4ff, 0xffffff], 14, 0.6, 0.6, 1.0, 0.05);
        break;
      case 'haste':
        this.ring(g, color, 0.2, 1.0, 0.5, 0, true);
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          this.particle(true, foot.x, foot.y + rand(0.1, 0.9), foot.z, 0, rand(0.2, 0.8), 0, rand(0.4, 0.7), 0.05, pick([0x9fe8ff, 0xffffff]), {
            orbit: true, ox: foot.x, oz: foot.z, or: rand(0.4, 0.6), oa: a, ow: 11, oshrink: -0.6, stretch: 2.5, spin: 0,
          });
        }
        break;
      case 'light':
        this.sprite(foot.clone().setY(foot.y + 0.9), 0xfff2b0, 0.4, 2.4, 0.6, { peak: 0.8 });
        this.sparkle(foot.clone().setY(foot.y + 0.2), 0xffe27a, 18, 0.5);
        this.light(foot.clone().setY(foot.y + 1.5), 0xfff2b0, 4, 6, 0.8);
        break;
      case 'heal':
        // cures and heal-rune landings: the sigil and ring (the heal event adds the column)
        this.ring(g, 0x9dffb0, 0.2, 0.8, 0.5, 0, false);
        this.sparkle(foot.clone().setY(foot.y + 0.2), 0x7dff9a, 10, 0.4);
        break;
      default:
        // conjuring and other radius-0 casts: the element swirls up around the caster
        this.spiral(foot.x, foot.y + 0.1, foot.z, [color, this.flashColor(effect), 0xffffff], 18, 0.45, 1.4, 0.8, 0.06);
        this.ring(g, color, 0.2, 0.85, 0.5, 0, true, 0, 0.7);
        this.sprite(foot.clone().setY(foot.y + 0.6), this.flashColor(effect), 0.3, 1.0, 0.3, { peak: 0.6 });
    }
  }

  /** A field or wall appearing on its tiles. */
  fieldPlaced(tiles: number[], off: number, effect: Effect): void {
    for (let i = 0; i < tiles.length; i += 2) {
      const x = tiles[i], z = tiles[i + 1];
      const d = (i / 2) * 0.03;
      this.tileFlash(x, off, z, effect, d, 0.45, this.flashColor(effect));
      this.after(d, () => {
        if (effect === 'shield') {
          this.column(new THREE.Vector3(x, off, z), 0x7fb2ff, 0.5, 1.8, 0.5);
          this.sparkle(new THREE.Vector3(x, off + 0.2, z), 0xb8d8ff, 8, 0.45);
        } else if (effect === 'energy') {
          this.bolt(new THREE.Vector3(x, off + 3, z - 0.8), new THREE.Vector3(x, off + 0.05, z), 0xc89aff, 0.16, 0.3);
          this.tileBurst('energy', x, off, z, 1);
        } else if (effect === 'earth') {
          for (let k = 0; k < 6; k++) this.particle(false, x, off + 0.1, z, rand(-1, 1), rand(1.5, 3), rand(-1, 1), 0.6, 0.07, pick([0x6ad03a, 0x9aff5a]), { g: 10, floor: off + 0.04, bounce: 0.2 });
        } else this.tileBurst(effect, x, off, z, 1);
      });
    }
  }

  /** One frame of a standing field's life: flames, crackles, bubbles. */
  fieldTick(kind: FieldKind, x: number, off: number, z: number, dt: number): void {
    const chance = (rate: number) => Math.random() < rate * dt;
    switch (kind) {
      case 'fire':
        for (let i = 0; i < 3; i++) if (chance(5)) {
          this.particle(true, x + rand(-0.38, 0.38), off + 0.06, z + rand(-0.38, 0.38), rand(-0.15, 0.15), rand(0.9, 1.7), rand(-0.15, 0.15), rand(0.4, 0.7), rand(0.08, 0.14), pick([0xffe070, 0xffb030, 0xff8a20]), { g: -0.5, drag: 1, c1: col(0x901800), grow: 0.3, spin: 0 });
        }
        if (chance(1.5)) this.particle(true, x + rand(-0.3, 0.3), off + 0.3, z + rand(-0.3, 0.3), rand(-0.3, 0.3), rand(1.5, 2.5), rand(-0.3, 0.3), 1.0, 0.04, 0xffd060, { g: 0.5, c1: col(0x801000) });
        if (chance(0.8)) this.particle(false, x, off + 0.6, z, 0, 0.6, 0, 1.2, 0.1, 0x2a2420, { g: -0.3, drag: 1, grow: 1.5 });
        break;
      case 'energy':
        if (chance(6)) {
          const a = Math.random() * Math.PI * 2;
          this.particle(true, x + rand(-0.3, 0.3), off + rand(0.05, 0.5), z + rand(-0.3, 0.3), Math.cos(a) * 1.5, rand(0, 1.5), Math.sin(a) * 1.5, 0.2, 0.04, pick([0xffffff, 0xd8b8ff]), { g: 4, stretch: 3 });
        }
        if (chance(1.4)) this.bolt(new THREE.Vector3(x + rand(-0.4, 0.4), off + 0.05, z + rand(-0.4, 0.4)), new THREE.Vector3(x + rand(-0.4, 0.4), off + rand(0.4, 0.9), z + rand(-0.4, 0.4)), 0xc89aff, 0.1, 0.25);
        break;
      case 'poison':
        if (chance(3.5)) this.particle(false, x + rand(-0.35, 0.35), off + 0.05, z + rand(-0.35, 0.35), 0, rand(0.15, 0.35), 0, rand(0.6, 1.0), rand(0.06, 0.1), pick([0x6ad03a, 0x8ae050, 0x4aa02a]), { grow: 0.8, spin: 0, pop: 1 });
        if (chance(1)) this.particle(true, x, off + 0.15, z, rand(-0.1, 0.1), 0.2, rand(-0.1, 0.1), 1.2, 0.2, 0x2a6a10, { drag: 1, grow: 1.2, spin: 0 });
        break;
      case 'wall':
        if (chance(3)) this.particle(true, x + rand(-0.45, 0.45), off + rand(0.1, 1.2), z + rand(-0.45, 0.45), 0, rand(0.4, 0.8), 0, rand(0.6, 1), 0.05, pick([0xb8d8ff, 0xffffff, 0x7fb2ff]), { spin: 0 });
        break;
    }
  }

  /** Shake if the local player stands near (set by the renderer). */
  shakeNear(x: number, z: number, amount: number, dur = 0.3): void {
    const f = this.focus;
    if (!f) return;
    const d = Math.max(Math.abs(f.x - x), Math.abs(f.z - z));
    if (d <= 6) this.shake(amount * (d <= 2 ? 1 : d <= 4 ? 0.6 : 0.35), dur);
  }

  /** Where the local player is (for shake distance). */
  focus: { x: number; z: number } | null = null;

  // ------------------------------------------------------------------ missiles

  private missileObject(effect: Effect): { obj: THREE.Object3D; orient: boolean; spin: number } {
    let make = this.missileParts.get(effect);
    if (!make) {
      make = this.missileFactory(effect);
      this.missileParts.set(effect, make);
    }
    return make();
  }

  /** Builds the shared geometry/materials for a missile type once; returns a maker. */
  private missileFactory(effect: Effect): () => { obj: THREE.Object3D; orient: boolean; spin: number } {
    const color = EFFECT_COLOR[effect];
    const basic = (c: number, opts: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color: c, ...opts });
    const add = (c: number) => basic(c, { transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const glowSprite = (c: number) => new THREE.SpriteMaterial({ map: this.tex.glow, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    switch (effect) {
      case 'arrow':
      case 'bolt': {
        const len = effect === 'arrow' ? 0.55 : 0.4;
        const shaft = new THREE.BoxGeometry(0.04, 0.04, len), shaftM = basic(0x8a6a3e);
        const tipG = new THREE.ConeGeometry(0.05, 0.12, 4), tipM = basic(0xd8dde6);
        const flG = new THREE.BoxGeometry(0.12, 0.02, 0.1), flM = basic(effect === 'arrow' ? 0xf0f0f0 : 0x6a5040);
        return () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(shaft, shaftM));
          const tip = new THREE.Mesh(tipG, tipM);
          tip.rotation.x = Math.PI / 2;
          tip.position.z = len / 2 + 0.05;
          g.add(tip);
          const fl = new THREE.Mesh(flG, flM);
          fl.position.z = -len / 2;
          g.add(fl);
          return { obj: g, orient: true, spin: 0 };
        };
      }
      case 'spear': {
        const shaft = new THREE.BoxGeometry(0.05, 0.05, 1.0), shaftM = basic(0x7a5530);
        const tipG = new THREE.ConeGeometry(0.06, 0.2, 4), tipM = basic(0xc9d0da);
        return () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(shaft, shaftM));
          const tip = new THREE.Mesh(tipG, tipM);
          tip.rotation.x = Math.PI / 2;
          tip.position.z = 0.58;
          g.add(tip);
          return { obj: g, orient: true, spin: 0 };
        };
      }
      case 'star': {
        const cone = new THREE.ConeGeometry(0.05, 0.18, 3), m = basic(color);
        return () => {
          const g = new THREE.Group();
          for (let i = 0; i < 4; i++) {
            const c = new THREE.Mesh(cone, m);
            c.rotation.z = (i * Math.PI) / 2;
            c.position.set(Math.sin((i * Math.PI) / 2) * -0.09, Math.cos((i * Math.PI) / 2) * 0.09, 0);
            g.add(c);
          }
          const holder = new THREE.Group();
          g.rotation.x = Math.PI / 2;
          holder.add(g);
          return { obj: holder, orient: false, spin: 25 };
        };
      }
      case 'stone':
      case 'earth': {
        const rock = new THREE.DodecahedronGeometry(effect === 'stone' ? 0.2 : 0.15, 0);
        const m = new THREE.MeshToonMaterial({ color: effect === 'stone' ? color : 0x6a7a48 });
        const sm = glowSprite(0x7ad04a);
        return () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(rock, m));
          if (effect === 'earth') {
            const s = new THREE.Sprite(sm);
            s.scale.setScalar(0.5);
            g.add(s);
          }
          return { obj: g, orient: false, spin: 9 };
        };
      }
      case 'ice': {
        // a spinning icicle pointing where it flies
        const shard = new THREE.OctahedronGeometry(0.1, 0);
        shard.scale(0.8, 0.8, 2.6);
        const m = basic(0xe8fbff);
        const sm = glowSprite(0x8adcff);
        return () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(shard, m));
          const s = new THREE.Sprite(sm);
          s.scale.setScalar(0.55);
          g.add(s);
          return { obj: g, orient: true, spin: 0 };
        };
      }
      case 'death': {
        const core = new THREE.IcosahedronGeometry(0.12, 1), cm = basic(0x0a0410);
        const sm = glowSprite(0xa040ff);
        return () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(core, cm));
          const s = new THREE.Sprite(sm);
          s.scale.setScalar(0.75);
          g.add(s);
          return { obj: g, orient: false, spin: 0 };
        };
      }
      default: {
        const size = ELEMENTAL.has(effect) ? 0.15 : 0.12;
        const core = new THREE.IcosahedronGeometry(size, 1);
        const cm = add(0xffffff);
        const om = add(color);
        const outer = new THREE.IcosahedronGeometry(size * 1.5, 1);
        const sm = glowSprite(this.flashColor(effect));
        return () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(core, cm));
          g.add(new THREE.Mesh(outer, om));
          const s = new THREE.Sprite(sm);
          s.scale.setScalar(effect === 'heal' ? 0.6 : 0.8);
          g.add(s);
          return { obj: g, orient: false, spin: 0 };
        };
      }
    }
  }

  /** A projectile flying from `from` to a (possibly moving) target. Returns its flight time. */
  missile(from: THREE.Vector3, to: () => THREE.Vector3, effect: Effect, onHit: () => void = () => {}): number {
    const { obj, orient, spin } = this.missileObject(effect);
    obj.position.copy(from);
    this.group.add(obj);
    const dist = from.distanceTo(to());
    const physical = !ELEMENTAL.has(effect) && effect !== 'heal';
    const dur = Math.max(0.12, dist * (physical ? 0.045 : 0.06));
    this.missiles.push({
      obj, from: from.clone(), to, t: 0, dur, arc: physical ? Math.min(0.5, dist * 0.05) : 0.25,
      spin, trail: effect, orient, onHit, acc: 0, effect,
    });
    // a muzzle flash for spells
    if (!physical) this.sprite(from, this.flashColor(effect), 0.2, 0.6, 0.14, { peak: 0.7 });
    return dur;
  }

  private trail(m: Missile, dt: number): void {
    const p = m.obj.position;
    m.acc += dt;
    const every = 0.012;
    while (m.acc >= every) {
      m.acc -= every;
      const j = () => rand(-0.05, 0.05);
      switch (m.effect) {
        case 'fire':
          this.particle(true, p.x + j(), p.y + j(), p.z + j(), rand(-0.3, 0.3), rand(0.3, 0.9), rand(-0.3, 0.3), rand(0.2, 0.35), rand(0.08, 0.12), pick([0xffe070, 0xffa030]), { c1: col(0x8a1000), spin: 0 });
          if (Math.random() < 0.25) this.particle(false, p.x, p.y, p.z, 0, 0.5, 0, 0.5, 0.08, 0x2a2420, { grow: 1.2, drag: 2 });
          break;
        case 'ice':
          this.particle(true, p.x + j(), p.y + j(), p.z + j(), 0, -0.2, 0, 0.3, 0.05, pick([0xe8fbff, 0x8adcff]), { g: 2, spin: 0 });
          break;
        case 'energy':
          this.particle(true, p.x + j(), p.y + j(), p.z + j(), rand(-1.5, 1.5), rand(-1.5, 1.5), rand(-1.5, 1.5), rand(0.1, 0.2), 0.04, pick([0xffffff, 0xd8b8ff, 0xb07aff]), { stretch: 2, spin: 0 });
          break;
        case 'death':
          this.particle(false, p.x + j(), p.y + j(), p.z + j(), 0, 0.3, 0, 0.45, 0.09, pick([0x140a18, 0x2a1036]), { grow: 0.8, drag: 2 });
          if (Math.random() < 0.5) this.particle(true, p.x, p.y, p.z, rand(-0.4, 0.4), rand(-0.2, 0.4), rand(-0.4, 0.4), 0.35, 0.05, 0xc070ff, { c1: col(0x2a0a40), spin: 0 });
          break;
        case 'earth':
        case 'stone':
          if (Math.random() < 0.45) this.particle(false, p.x, p.y, p.z, rand(-0.3, 0.3), 0.2, rand(-0.3, 0.3), 0.4, 0.07, 0x8a7a62, { grow: 1, drag: 2 });
          if (m.effect === 'earth' && Math.random() < 0.4) this.particle(true, p.x, p.y, p.z, rand(-0.3, 0.3), 0.3, rand(-0.3, 0.3), 0.35, 0.05, 0x9aff5a, { spin: 0 });
          break;
        case 'holy':
          this.particle(true, p.x + j(), p.y + j(), p.z + j(), 0, 0.2, 0, 0.35, 0.06, pick([0xfff6c0, 0xffe27a]), { spin: 0 });
          break;
        case 'heal':
          this.particle(true, p.x + j() * 2, p.y + j() * 2, p.z + j() * 2, 0, 0.4, 0, 0.4, 0.05, pick([0x7dff9a, 0xffe27a]), { spin: 0 });
          break;
        case 'arrow':
        case 'bolt':
        case 'spear':
          if (Math.random() < 0.35) this.particle(true, p.x, p.y, p.z, 0, 0, 0, 0.1, 0.03, 0x8a8a8a, { spin: 0 });
          break;
        default:
          if (Math.random() < 0.5) this.particle(true, p.x, p.y, p.z, 0, 0.3, 0, 0.3, 0.06, EFFECT_COLOR[m.effect], { spin: 0 });
      }
    }
  }

  private removeMissile(o: THREE.Object3D): void {
    // shared geometry and materials stay alive in the missile cache
    this.group.remove(o);
  }

  // ------------------------------------------------------------------ frame

  private stepParticles(list: Particle[], mesh: THREE.InstancedMesh, dt: number, cap: number): void {
    let n = 0;
    const c = new THREE.Color();
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.max) {
        if (p.pop) {
          for (let k = 0; k < 3; k++) this.particle(true, p.x, p.y, p.z, rand(-0.6, 0.6), rand(0.3, 0.9), rand(-0.6, 0.6), 0.25, 0.035, 0xc8ff8a, { spin: 0 });
        }
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
    for (const p of list) {
      if (p.orbit) {
        p.oa += p.ow * dt;
        p.or = Math.max(0.02, p.or * (1 - p.oshrink * dt));
        p.y += p.vy * dt;
        p.vy -= p.g * dt;
        p.x = p.ox + Math.cos(p.oa) * p.or;
        p.z = p.oz + Math.sin(p.oa) * p.or;
      } else {
        if (p.drag) {
          const k = Math.max(0, 1 - p.drag * dt);
          p.vx *= k;
          p.vy *= k;
          p.vz *= k;
        }
        p.vy -= p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < p.floor) {
          p.y = p.floor;
          if (p.vy < 0) p.vy = -p.vy * p.bounce;
          p.vx *= 0.55;
          p.vz *= 0.55;
          p.spin *= 0.5;
        }
      }
      if (n >= cap) continue;
      const t = p.life / p.max;
      const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const s = p.size * (1 + p.grow * t) * (0.35 + 0.65 * fade);
      dummy.position.set(p.x, p.y, p.z);
      if (p.stretch > 0 && !p.orbit) {
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        if (sp > 0.05) {
          tmpV.set(p.vx / sp, p.vy / sp, p.vz / sp);
          dummy.quaternion.setFromUnitVectors(FWD, tmpV);
        }
        dummy.scale.set(s, s, s * (1 + p.stretch * Math.min(1.5, sp * 0.25)));
      } else if (p.stretch > 0) {
        // orbiting streaks: lie along the circle
        dummy.rotation.set(0, -p.oa, 0);
        dummy.scale.set(s, s, s * (1 + p.stretch));
      } else {
        dummy.rotation.set(p.life * p.spin, p.life * p.spin * 0.6, 0);
        dummy.scale.set(s, s, s);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      if (p.c1) c.copy(p.c0).lerp(p.c1, Math.min(1, t * 1.2));
      else c.copy(p.c0);
      mesh.setColorAt(n, c);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Advances a pooled slot; returns its 0..1 progress, or -1 if idle / waiting. */
  private tick<M extends THREE.Object3D>(s: Slot<M>, dt: number): number {
    if (!s.busy) return -1;
    if (s.delay > 0) {
      s.delay -= dt;
      if (s.delay > 0) return -1;
    }
    s.life += dt;
    const t = s.life / s.max;
    if (t >= 1) {
      s.busy = false;
      s.obj.visible = false;
      return -1;
    }
    s.obj.visible = true;
    return t;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.shakeT <= 0) this.shakeAmp = 0;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers[i] = this.timers[this.timers.length - 1];
        this.timers.pop();
        tm.fn();
      }
    }

    // missiles (before particles, so their trails draw this frame)
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const p = this.missiles[i];
      p.t += dt / p.dur;
      const to = p.to();
      if (p.t >= 1) {
        this.removeMissile(p.obj);
        this.missiles.splice(i, 1);
        p.onHit();
        continue;
      }
      const prev = tmpV2.copy(p.obj.position);
      p.obj.position.lerpVectors(p.from, to, p.t);
      p.obj.position.y += Math.sin(p.t * Math.PI) * p.arc;
      if (p.orient) {
        const dir = tmpV.copy(p.obj.position).sub(prev);
        if (dir.lengthSq() > 1e-8) p.obj.lookAt(dir.add(p.obj.position));
        if (p.effect === 'ice') p.obj.rotateZ(this.time * 14);
      }
      if (p.spin) p.obj.rotation.y += p.spin * dt;
      if (p.spin && p.effect !== 'star') p.obj.rotation.x += p.spin * 0.7 * dt;
      if (p.trail) this.trail(p, dt);
    }

    this.stepParticles(this.solid, this.solidMesh, dt, MAX_SOLID);
    this.stepParticles(this.glow, this.glowMesh, dt, MAX_GLOW);

    for (const s of this.rings) {
      const t = this.tick(s, dt);
      if (t < 0) continue;
      const k = easeOut(t);
      const sc = s.data.from + (s.data.to - s.data.from) * k;
      s.obj.scale.set(sc, sc, sc);
      s.obj.position.y += s.data.rise * dt;
      (s.obj.material as THREE.MeshBasicMaterial).opacity = step4(1 - t) * s.data.peak;
    }

    for (const s of this.flashes) {
      const t = this.tick(s, dt);
      if (t < 0) continue;
      // quick flare in, slow fade out, stepped so it reads as pixel-art frames
      const k = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      (s.obj.material as THREE.MeshBasicMaterial).opacity = step4(k) * 0.9;
    }

    for (const s of this.decals) {
      const t = this.tick(s, dt);
      if (t < 0) continue;
      const k = t < 0.04 ? t / 0.04 : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      (s.obj.material as THREE.MeshBasicMaterial).opacity = step4(k) * (s.data.add ? 0.8 : 0.85);
    }

    for (const s of this.sprites) {
      const t = this.tick(s, dt);
      if (t < 0) continue;
      const d = s.data;
      const sc = d.from + (d.to - d.from) * easeOut(t);
      s.obj.scale.set(sc, sc, 1);
      s.obj.position.y += d.rise * dt;
      const k = t < d.hold ? 1 : 1 - (t - d.hold) / (1 - d.hold);
      (s.obj.material as THREE.SpriteMaterial).opacity = step4(k) * d.peak;
    }

    for (const s of this.columns) {
      const t = this.tick(s, dt);
      if (t < 0) continue;
      // shoots up fast, then thins out and fades
      const up = Math.min(1, t / 0.25);
      const w = s.data.r * (t < 0.2 ? 0.6 + 2 * t : 1 - (t - 0.2) * 0.5);
      s.obj.scale.set(w, s.data.h * easeOut(up), w);
      s.obj.rotation.y += dt * 1.5;
      const k = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      (s.obj.material as THREE.MeshBasicMaterial).opacity = step4(k) * 0.9;
    }
    (this.tex.column as THREE.Texture).offset.y = -this.time * 0.8;

    for (const s of this.domes) {
      const t = this.tick(s, dt);
      if (t < 0) continue;
      const grow = Math.min(1, t / 0.15);
      const r = s.data.r * (0.5 + 0.5 * easeOut(grow));
      s.obj.scale.set(r, r * 1.15, r);
      s.obj.rotation.y += dt * 0.8;
      const k = t < 0.15 ? 1 : 1 - (t - 0.15) / 0.85;
      const shimmer = 0.7 + 0.3 * Math.sin(this.time * 18);
      (s.obj.material as THREE.MeshBasicMaterial).opacity = step4(k * shimmer) * 0.75;
    }
    this.tex.hex.offset.set(this.time * 0.05, this.time * 0.35);

    for (const s of this.bolts) {
      const t = this.tick(s, dt);
      if (t < 0) continue;
      s.data.next -= dt;
      if (s.data.next <= 0) {
        s.data.next = 0.045;
        this.reforkBolt(s);
      }
      const flick = Math.random() < 0.2 ? 0.4 : 1;
      const k = step4((1 - t) * flick);
      const [core, glow] = s.obj.children as THREE.Line[];
      (core.material as THREE.LineBasicMaterial).opacity = k;
      (glow.material as THREE.LineBasicMaterial).opacity = k * 0.8;
    }

    for (const s of this.beams) {
      const t = this.tick(s, dt);
      if (t < 0) continue;
      const [glow, core] = s.obj.children as THREE.Mesh[];
      const shoot = Math.min(1, t / 0.12);
      const thin = t < 0.5 ? 1 : 1 - (t - 0.5) * 1.6;
      const pulse = 0.85 + 0.3 * Math.sin(this.time * 60);
      const w = s.data.w * thin * pulse;
      glow.scale.set(w, w, s.data.len * shoot);
      core.scale.set(w * 0.3, w * 0.3, s.data.len * shoot);
      (glow.material as THREE.MeshBasicMaterial).opacity = step4(1 - t * 0.8) * 0.6;
      (core.material as THREE.MeshBasicMaterial).opacity = step4(1 - t * 0.6);
    }

    for (const s of this.lights) {
      const t = this.tick(s, dt);
      if (t < 0) {
        if (!s.busy) s.obj.intensity = 0;
        continue;
      }
      s.obj.visible = true;
      s.obj.intensity = s.data.i * (t < 0.1 ? t / 0.1 : (1 - t) / 0.9);
    }
    // lights stay in the scene (visible) so shaders never recompile
    for (const s of this.lights) s.obj.visible = true;

    if (this.clickLife > 0) {
      this.clickLife -= dt;
      const k = Math.max(0, this.clickLife / 0.6);
      (this.clickMarker.material as THREE.MeshBasicMaterial).opacity = k;
      const s = 1 + (1 - k) * 0.25;
      this.clickMarker.scale.set(s, s, 1);
      if (this.clickLife <= 0) this.clickMarker.visible = false;
    }
  }
}

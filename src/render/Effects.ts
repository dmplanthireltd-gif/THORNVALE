import * as THREE from 'three';
import type { Effect } from '../game/core/events';

/**
 * Spell, rune, missile and hit effects in the classic tile-sprite style.
 *
 * Every effect is a small pixel-art animation (32×32 art pixels, 8 frames)
 * played on a tile: an area spell plays its element's burst on every affected
 * tile, a rune lands with a burst on its target, missiles are little sprites
 * flying from caster to target. All animations live in ONE atlas painted on a
 * canvas at startup (original art, no files) and are drawn by ONE instanced
 * mesh of camera-facing quads, each instance picking its frame by atlas cell.
 * So any number of effects costs a single draw call, and nothing allocates
 * geometry or materials per effect. A few extras support the look: a small
 * pool of point lights, ground marks (scorch, frost, cracks), a subtle camera
 * shake for big blasts near you, and a capped particle system for embers.
 */

/** Colours used by every effect type. */
export const EFFECT_COLOR: Record<Effect, number> = {
  physical: 0xd8d8d8, fire: 0xff7a1a, energy: 0xb07aff, ice: 0x8adcff, earth: 0x7ad04a, death: 0x8a3ab0, holy: 0xfff0a0,
  arrow: 0xc9b28a, bolt: 0x9aa0a8, spear: 0xc9d0da, star: 0xd8dde6, stone: 0x9a8a7a,
  heal: 0x7dff9a, haste: 0x9fe8ff, shield: 0x7fb2ff, light: 0xfff2b0, blood: 0xb3221b,
};

/** Field kinds the renderer animates. */
export type FieldKind = 'fire' | 'energy' | 'poison' | 'wall';

/** The tile animations in the atlas. */
export type TileAnim = 'fire' | 'energy' | 'ice' | 'earth' | 'death' | 'holy' | 'hit' | 'block' | 'heal' | 'mana' | 'poff' | 'buff' | 'teleport';
const ANIM_ROW: Record<TileAnim, number> = {
  fire: 0, energy: 1, ice: 2, earth: 3, death: 4, holy: 5, hit: 6, block: 7, heal: 8, mana: 9, poff: 10, buff: 11, teleport: 12,
};
/** Missile sprites: [row, first column] of a 4-frame spin. */
type MissileSprite = 'fireball' | 'energyball' | 'iceshard' | 'stone' | 'skull' | 'holystar' | 'healorb' | 'earthball';
const MISSILE_CELL: Record<MissileSprite, [number, number]> = {
  fireball: [13, 0], energyball: [13, 4], iceshard: [14, 0], stone: [14, 4], skull: [15, 0], holystar: [15, 4], healorb: [16, 0], earthball: [16, 4],
};
const CELL = 32;
const ACOLS = 8;
const AROWS = 17;
const FRAMES = 8;

// ------------------------------------------------------------------ pool sizes

const MAX_TILE_FX = 900;
const MAX_SOLID = 500;
const MAX_GLOW = 700;
const RINGS = 24;
const DECALS = 90;
const LIGHTS = 3;

/** The view tilt (keep in step with CameraController.CAMERA_TILT_DEG). */
const TILT = THREE.MathUtils.degToRad(32);
/** Unit vector from the scene toward the camera. */
const TO_CAM = new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT));
/** Height of a camera-facing quad that shows exactly 32 art pixels tall. */
const QUAD_H = Math.cos(TILT);

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

/** Like pixTex but any width/height; `px(x, yUp)` gets y counted from the bottom row. */
function pixTexWH(w: number, h: number, px: (x: number, yUp: number) => [number, number, number, number] | null): THREE.Texture {
  const t = typeof document !== 'undefined' ? (() => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = px(x, h - 1 - y);
      if (!v) continue;
      const i = (y * w + x) * 4;
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
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

// ------------------------------------------------------------------ pixel-art atlas

type RGB = readonly [number, number, number];
const hh = (a: number, b: number, c = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

/** One 32×32 frame being painted. */
class Pix {
  readonly d = new Uint8ClampedArray(CELL * CELL * 4);
  set(x: number, y: number, c: RGB): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 1 || y < 1 || x > CELL - 2 || y > CELL - 2) return;
    const i = (y * CELL + x) * 4;
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = 255;
  }
  has(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= CELL || y >= CELL) return false;
    return this.d[(y * CELL + x) * 4 + 3] > 0;
  }
  clear(x: number, y: number): void {
    this.d[(y * CELL + x) * 4 + 3] = 0;
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (Math.hypot(x - cx, y - cy) <= r) this.set(x, y, c);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  /** A little sparkle: a plus with a bright centre. */
  plus(x: number, y: number, s: number, arm: RGB, core: RGB): void {
    for (let k = 1; k <= s; k++) {
      this.set(x + k, y, arm);
      this.set(x - k, y, arm);
      this.set(x, y + k, arm);
      this.set(x, y - k, arm);
    }
    this.set(x, y, core);
  }
  /** Dark rim around everything painted: the classic sprite outline. */
  outline(c: RGB): void {
    const src = new Uint8ClampedArray(this.d);
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < CELL && y < CELL && src[(y * CELL + x) * 4 + 3] > 0;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      if (at(x, y)) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.set(x, y, c);
    }
  }
  /** Knocks out a share of the pixels (a pixel-art fade). */
  dither(share: number, seed: number): void {
    if (share <= 0) return;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (hh(x, y, seed) < share) this.clear(x, y);
  }
}

const SKULL = [
  '..######..',
  '.########.',
  '##########',
  '#..####..#',
  '#..####..#',
  '##########',
  '.###..###.',
  '..######..',
  '..#.##.#..',
];

function skull(P: Pix, ox: number, oy: number, bone: RGB, dark: RGB): void {
  SKULL.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '#') P.set(ox + x, oy + y, bone);
    else if (y >= 3 && y <= 6 && x > 0 && x < 9) P.set(ox + x, oy + y, dark);
  }));
}

const C = {
  white: [255, 255, 240], yellow: [255, 222, 70], orange: [255, 136, 24], red: [214, 50, 12], darkRed: [110, 18, 4],
  vWhite: [250, 240, 255], violet: [184, 96, 255], deepViolet: [62, 12, 120],
  iceHi: [240, 252, 255], ice: [150, 214, 255], iceDark: [32, 84, 168],
  rock: [138, 108, 70], rockHi: [184, 152, 102], rockDark: [52, 36, 18], leaf: [86, 186, 48], leafHi: [150, 232, 84], dust: [172, 150, 110],
  dVoid: [36, 8, 52], dPurple: [128, 46, 186], dGlow: [196, 116, 255], bone: [232, 222, 242], dRim: [16, 0, 26],
  gold: [255, 214, 80], goldHi: [255, 250, 210], goldRim: [140, 88, 8],
  blood: [204, 20, 20], bloodDark: [130, 6, 6], grey: [232, 232, 232], greyRim: [56, 56, 64],
  hBlue: [124, 192, 255], hWhite: [245, 252, 255], hRim: [20, 58, 150],
  mBlue: [86, 136, 255], mLight: [206, 222, 255], mRim: [18, 28, 118],
  puffHi: [222, 222, 222], puff: [168, 168, 168], puffRim: [88, 88, 92],
  cyan: [140, 232, 255],
} as const satisfies Record<string, RGB>;

/** Paints frame `f` (0–7) of a tile animation. */
function paintAnim(name: TileAnim, f: number, P: Pix): void {
  const t = f / (FRAMES - 1);
  switch (name) {
    case 'fire': {
      const R = [6, 9, 12, 14, 15, 15, 14, 12][f];
      const cy = 17 - f * 0.7;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const dx = x - 16, dy = y - cy;
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        // flames lick upwards: the top edge reaches higher and is more ragged
        const up = dy < 0 ? 1 + (-dy / (R + 1)) * 0.3 * (0.4 + t) : 0.92;
        const rr = R * (0.74 + 0.36 * hh(Math.floor((a + Math.PI) * 3.2), f)) * up;
        if (d > rr) continue;
        const k = d / rr;
        if (f >= 6 && hh(x, y, f) < (f - 5) * 0.32) continue;
        let c: RGB = k < 0.3 ? (f < 4 ? C.white : C.yellow) : k < 0.56 ? C.yellow : k < 0.82 ? C.orange : C.red;
        if (f >= 4 && k < 0.25 + (f - 4) * 0.12) c = f >= 6 ? C.red : C.orange;
        P.set(x, y, c);
      }
      if (f >= 5) for (let i = 0; i < 5; i++) P.set(6 + hh(i, f) * 20, 4 + hh(i, f, 3) * 10, C.yellow);
      P.outline(C.darkRed);
      return;
    }
    case 'energy': {
      const r = seeded(40 + f * 7);
      if (f < 4) {
        P.disc(16, 16, 4 + f * 1.6, C.violet);
        P.disc(16, 16, 2.5 + f * 1.1, C.vWhite);
      }
      const nb = [6, 8, 8, 7, 6, 5, 4, 2][f];
      for (let b = 0; b < nb; b++) {
        let a = r() * Math.PI * 2;
        let x = 16 + Math.cos(a) * f * 0.9, y = 16 + Math.sin(a) * f * 0.9;
        const len = 5 + r() * (4 + f * 1.3);
        for (let s = 0; s < len; s++) {
          a += (r() - 0.5) * 1.3;
          const nx = x + Math.cos(a) * 1.4, ny = y + Math.sin(a) * 1.4;
          P.line(x + 1, y, nx + 1, ny, C.violet);
          P.line(x - 1, y, nx - 1, ny, C.violet);
          P.line(x, y + 1, nx, ny + 1, C.violet);
          P.line(x, y, nx, ny, C.vWhite);
          x = nx;
          y = ny;
        }
      }
      if (f >= 6) P.dither(0.25, f);
      P.outline(C.deepViolet);
      return;
    }
    case 'ice': {
      if (f <= 2) {
        const s = (f + 1) / 3;
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
          const dx = x - 16, dy = y - 16;
          if (Math.abs(dx) / (3.5 * s) + Math.abs(dy) / (8 * s) <= 1) P.set(x, y, dx < 0 ? C.iceHi : C.ice);
        }
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.4;
        const dist = 3 + f * 1.75;
        const sz = f < 6 ? 1 : 0.65;
        const sx = 16 + Math.cos(a) * dist, sy = 16 + Math.sin(a) * dist;
        for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
          const u = x * Math.cos(a) + y * Math.sin(a);
          const v = -x * Math.sin(a) + y * Math.cos(a);
          if (Math.abs(u) / (3.8 * sz) + Math.abs(v) / (1.7 * sz) > 1) continue;
          P.set(sx + x, sy + y, u > 1.6 || v > 0.4 ? C.iceHi : C.ice);
        }
      }
      if (f >= 6) P.dither(0.2 * (f - 5), f);
      P.outline(C.iceDark);
      return;
    }
    case 'earth': {
      if (f < 5) {
        P.disc(16, 18, 3 + f * 1.6, C.dust);
        P.dither(0.45 + f * 0.1, 9 + f);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const sp = 0.8 + hh(i, 2) * 0.5;
        const x = 16 + Math.cos(a) * (2 + f * 1.8) * sp;
        const y = 17 + Math.sin(a) * (2 + f * 1.4) * sp * 0.7 - (f * 2.4 - f * f * 0.32);
        P.disc(x, y, f < 6 ? 2.3 : 1.6, C.rock);
        P.set(x - 1, y - 1, C.rockHi);
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 1.1 + f * 0.25;
        const x = 16 + Math.cos(a) * (1 + f * 1.9), y = 14 + Math.sin(a) * (1 + f * 1.5) + f * 0.5;
        P.set(x, y, C.leaf);
        P.set(x + 1, y, C.leafHi);
        P.set(x, y + 1, C.leaf);
      }
      P.outline(C.rockDark);
      return;
    }
    case 'death': {
      const R = [8, 11, 13, 14, 14, 14, 12, 10][f];
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const dx = x - 16, dy = y - 16;
        const d = Math.hypot(dx, dy);
        if (d > R) continue;
        const v = Math.sin(Math.atan2(dy, dx) * 2 + d * 0.55 - f * 1.3);
        if (v < 0.15) continue;
        P.set(x, y, v > 0.8 && d > R * 0.45 ? C.dGlow : d < R * 0.55 ? C.dVoid : C.dPurple);
      }
      if (f >= 2 && f <= 5) skull(P, 11, 11 - (f - 2), C.bone, C.dRim);
      if (f >= 6) P.dither(0.3 * (f - 5), f);
      P.outline(C.dRim);
      return;
    }
    case 'holy': {
      const L = [4, 8, 11, 13, 13, 12, 9, 6][f];
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + f * 0.08;
        const len = k % 2 === 0 ? L : L * 0.6;
        P.line(16, 16, 16 + Math.cos(a) * len, 16 + Math.sin(a) * len, C.gold);
        P.line(16, 16, 16 + Math.cos(a) * len * 0.5, 16 + Math.sin(a) * len * 0.5, C.goldHi);
      }
      P.disc(16, 16, f < 5 ? 3 : 2, C.goldHi);
      if (f >= 3) for (let i = 0; i < 6; i++) {
        const a = hh(i, f) * Math.PI * 2, r = L * (0.6 + hh(i, f, 2) * 0.5);
        P.plus(16 + Math.cos(a) * r, 16 + Math.sin(a) * r, 1, C.gold, C.goldHi);
      }
      if (f >= 6) P.dither(0.25 * (f - 5), f);
      P.outline(C.goldRim);
      return;
    }
    case 'hit':
    case 'block': {
      const s = [4, 7, 6, 4, 2, 0, 0, 0][f];
      if (s) {
        P.line(16 - s, 16, 16 + s, 16, C.grey);
        P.line(16, 16 - s, 16, 16 + s, C.grey);
        P.line(16 - s * 0.6, 16 - s * 0.6, 16 + s * 0.6, 16 + s * 0.6, C.grey);
        P.line(16 - s * 0.6, 16 + s * 0.6, 16 + s * 0.6, 16 - s * 0.6, C.grey);
        P.disc(16, 16, 1, C.white);
      }
      if (name === 'hit') {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + 0.2;
          const dist = 2 + f * 1.8 * (0.8 + hh(i, 1) * 0.4);
          const x = 16 + Math.cos(a) * dist, y = 16 + Math.sin(a) * dist * 0.8 + f * f * 0.16;
          if (f < 7 || i % 2) P.disc(x, y, f < 5 ? 1.5 : 1, i % 3 ? C.blood : C.bloodDark);
        }
        P.outline(C.bloodDark);
      } else {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const r0 = 3 + f * 1.5;
          if (f < 6) P.line(16 + Math.cos(a) * r0, 16 + Math.sin(a) * r0, 16 + Math.cos(a) * (r0 + 2), 16 + Math.sin(a) * (r0 + 2), C.hWhite);
        }
        P.outline(C.greyRim);
      }
      return;
    }
    case 'heal': {
      for (let i = 0; i < 13; i++) {
        const start = i % 3;
        if (f < start) continue;
        const x = 5 + hh(i, 1) * 22;
        const y = 28 - hh(i, 2) * 14 - (f - start) * 2.4;
        const big = (f + i) % 3 === 0;
        P.plus(x, y, big ? 3 : 2, C.hBlue, C.hWhite);
        if (big) P.set(x, y + 1, C.hWhite);
      }
      P.outline(C.hRim);
      return;
    }
    case 'mana': {
      for (const lag of [0, 5]) {
        const r = 2 + f * 1.9 - lag;
        if (r < 1.5) continue;
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
          const d = Math.hypot(x - 16, y - 16);
          if (Math.abs(d - r) <= 1) P.set(x, y, d < r ? C.mLight : C.mBlue);
        }
      }
      if (f >= 6) P.dither(0.3 * (f - 5), f);
      P.outline(C.mRim);
      return;
    }
    case 'poff': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.5;
        const o = 3 * (1 + f * 0.45);
        const cx = 16 + Math.cos(a) * o, cy = 17 + Math.sin(a) * o * 0.8 - f * 0.6;
        const r = Math.min(6, 2.5 + f * 0.8);
        for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if (Math.hypot(x - cx, y - cy) > r) continue;
          P.set(x, y, x - cx + (y - cy) < 0 ? C.puffHi : C.puff);
        }
      }
      if (f >= 4) P.dither(0.18 * (f - 3), f);
      P.outline(C.puffRim);
      return;
    }
    case 'buff':
    case 'teleport': {
      const tel = name === 'teleport';
      const R = tel ? 3 + f * 1.4 : f > 5 ? 11 - (f - 5) * 2 : 11;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + f * 0.3;
        P.plus(16 + Math.cos(a) * R, 16 + Math.sin(a) * R * 0.9, (f + i) % 2 ? 2 : 1, tel ? C.cyan : C.gold, C.hWhite);
      }
      P.outline(tel ? C.hRim : C.goldRim);
      return;
    }
  }
}

/** Paints frame `f` (0–3) of a missile's spin. */
function paintMissile(name: MissileSprite, f: number, P: Pix): void {
  const rot = (f * Math.PI) / 4;
  switch (name) {
    case 'fireball':
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const d = Math.hypot(x - 16, y - 16);
        const rr = 5 * (0.8 + 0.35 * hh(Math.floor((Math.atan2(y - 16, x - 16) + Math.PI) * 2.5), f));
        if (d <= rr) P.set(x, y, d < 2 ? C.white : d < 3.5 ? C.yellow : C.orange);
      }
      P.outline(C.darkRed);
      return;
    case 'energyball':
      P.disc(16, 16, 4, C.violet);
      P.disc(16, 16, 2.2, C.vWhite);
      for (let k = 0; k < 4; k++) {
        const a = rot + (k * Math.PI) / 2;
        P.line(16 + Math.cos(a) * 5, 16 + Math.sin(a) * 5, 16 + Math.cos(a + 0.4) * 8, 16 + Math.sin(a + 0.4) * 8, C.vWhite);
      }
      P.outline(C.deepViolet);
      return;
    case 'iceshard':
      for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) {
        const u = x * Math.cos(rot) + y * Math.sin(rot);
        const v = -x * Math.sin(rot) + y * Math.cos(rot);
        if (Math.abs(u) / 7 + Math.abs(v) / 2.4 <= 1 || Math.abs(v) / 4 + Math.abs(u) / 1.8 <= 1) P.set(16 + x, 16 + y, v > 0 ? C.iceHi : C.ice);
      }
      P.outline(C.iceDark);
      return;
    case 'stone':
    case 'earthball':
      P.disc(16, 16, 4.5, name === 'stone' ? C.rock : [96, 120, 56]);
      P.disc(16 + Math.cos(rot) * 2, 16 + Math.sin(rot) * 2, 1.3, C.rockHi);
      if (name === 'earthball') {
        P.set(16 + Math.cos(rot + 2) * 6, 16 + Math.sin(rot + 2) * 6, C.leafHi);
        P.set(16 + Math.cos(rot + 4) * 6, 16 + Math.sin(rot + 4) * 6, C.leaf);
      }
      P.outline(C.rockDark);
      return;
    case 'skull':
      P.disc(16, 16, 7 + (f % 2), C.dPurple);
      P.dither(0.5, f);
      skull(P, 11, 12, C.bone, C.dRim);
      P.outline(C.dRim);
      return;
    case 'holystar': {
      const s = 6;
      const a0 = f % 2 ? Math.PI / 4 : 0;
      for (let k = 0; k < 4; k++) {
        const a = a0 + (k * Math.PI) / 2;
        P.line(16, 16, 16 + Math.cos(a) * s, 16 + Math.sin(a) * s, C.gold);
      }
      P.disc(16, 16, 2, C.goldHi);
      P.outline(C.goldRim);
      return;
    }
    case 'healorb':
      P.plus(16, 16, 3, C.hBlue, C.hWhite);
      P.disc(16, 16, 1.2, C.hWhite);
      for (let k = 0; k < 4; k++) P.set(16 + Math.cos(rot + (k * Math.PI) / 2) * 6, 16 + Math.sin(rot + (k * Math.PI) / 2) * 6, C.hWhite);
      P.outline(C.hRim);
      return;
  }
}

/** The whole effect atlas: 8 columns of 32×32 frames, one row per animation. */
function buildAtlas(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = ACOLS * CELL;
  c.height = AROWS * CELL;
  const g = c.getContext('2d')!;
  const put = (P: Pix, col: number, row: number) => g.putImageData(new ImageData(P.d, CELL, CELL), col * CELL, row * CELL);
  for (const [name, row] of Object.entries(ANIM_ROW) as Array<[TileAnim, number]>) {
    for (let f = 0; f < FRAMES; f++) {
      const P = new Pix();
      paintAnim(name, f, P);
      put(P, f, row);
    }
  }
  for (const [name, [row, col]] of Object.entries(MISSILE_CELL) as Array<[MissileSprite, [number, number]]>) {
    for (let f = 0; f < 4; f++) {
      const P = new Pix();
      paintMissile(name, f, P);
      put(P, col + f, row);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
}

/** One playing tile animation. */
interface TileFx {
  x: number; y: number; z: number;
  row: number;
  t: number;
  dur: number;
  delay: number;
  scale: number;
}

interface Missile {
  /** a 3D projectile (arrows, bolts, spears, throwing stars) or null for a sprite */
  obj: THREE.Object3D | null;
  cell: [number, number] | null;
  pos: THREE.Vector3;
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  spin: number;
  orient: boolean;
  onHit: () => void;
}

type DecalKind = 'scorch' | 'frost' | 'crack' | 'death' | 'sigil' | 'burn';

const dummy = new THREE.Object3D();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);

/** Tile animations, missiles, fields, ground marks, light flashes and markers. */
export class Effects {
  readonly group = new THREE.Group();
  private solid: Particle[] = [];
  private glow: Particle[] = [];
  private solidMesh: THREE.InstancedMesh;
  private glowMesh: THREE.InstancedMesh;
  private missiles: Missile[] = [];
  private timers: Array<{ t: number; fn: () => void }> = [];

  private tileFx: TileFx[] = [];
  private spriteMesh: THREE.InstancedMesh;
  private spriteCell: THREE.InstancedBufferAttribute;

  private rings: Slot<THREE.Mesh>[] = [];
  private decals: Slot<THREE.Mesh>[] = [];
  private lights: Slot<THREE.PointLight>[] = [];

  private ringThin = new THREE.RingGeometry(0.86, 1, 40);
  private ringThick = new THREE.RingGeometry(0.55, 1, 40);
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

  /** Where the local player is (for shake distance). */
  focus: { x: number; z: number } | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.buildTextures();
    // coloured art (not tint masks) is authored in sRGB
    for (const k of ['scorch', 'burn', 'frost', 'crack', 'deathMark', 'wall', 'fieldFire', 'fieldEnergy', 'fieldPoison', 'skull']) {
      this.tex[k].colorSpace = THREE.SRGBColorSpace;
      this.tex[k].needsUpdate = true;
    }
    this.decalTex = {
      scorch: this.tex.scorch, frost: this.tex.frost, crack: this.tex.crack, death: this.tex.deathMark, sigil: this.tex.sigil, burn: this.tex.burn,
    };

    // the tile-sprite layer: one instanced quad facing the camera, frames picked per instance
    const quad = new THREE.PlaneGeometry(1, QUAD_H);
    quad.rotateX(-(Math.PI / 2 - TILT));
    this.spriteCell = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TILE_FX * 2), 2);
    this.spriteCell.setUsage(THREE.DynamicDrawUsage);
    quad.setAttribute('aCell', this.spriteCell);
    const spriteMat = new THREE.MeshBasicMaterial({ map: buildAtlas(), transparent: true, alphaTest: 0.5, depthWrite: false });
    spriteMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec2 aCell;\n' + sh.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>\n  vMapUv = vec2((uv.x + aCell.x) / ${ACOLS}.0, 1.0 - ((1.0 - uv.y) + aCell.y) / ${AROWS}.0);`,
      );
    };
    spriteMat.customProgramCacheKey = () => 'tile-sprites';
    this.spriteMesh = new THREE.InstancedMesh(quad, spriteMat, MAX_TILE_FX);
    this.spriteMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.spriteMesh.count = 0;
    this.spriteMesh.frustumCulled = false;
    this.spriteMesh.renderOrder = 9;
    this.group.add(this.spriteMesh);

    const box = new THREE.BoxGeometry(1, 1, 1);
    this.solidMesh = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_SOLID);
    this.glowMesh = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), MAX_GLOW);
    for (const m of [this.solidMesh, this.glowMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color());
      this.group.add(m);
    }
    this.glowMesh.renderOrder = 6;

    const flat = (m: THREE.Mesh, order: number) => {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = order;
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    const slot = <M extends THREE.Object3D>(obj: M): Slot<M> => ({ obj, busy: false, life: 0, max: 1, delay: 0, data: {} });
    for (let i = 0; i < RINGS; i++) {
      this.rings.push(slot(flat(new THREE.Mesh(this.ringThin, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      })), 5)));
    }
    for (let i = 0; i < DECALS; i++) {
      const m = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      }));
      this.decals.push(slot(flat(m, 2)));
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

  // ------------------------------------------------------------------ standing fields

  /** Animation frames for standing fields (built once). */
  private fieldFrames: Record<'flame' | 'arc' | 'slime', THREE.Texture[]> | null = null;
  /** Shared materials: two phases per look, so neighbouring tiles never flicker in step. */
  private fieldMats: Record<string, THREE.Material> = {};
  private fieldGeo: { quad: THREE.PlaneGeometry; ground: THREE.PlaneGeometry; glow: THREE.PlaneGeometry; wall: THREE.BoxGeometry } | null = null;

  private buildFieldFrames(): void {
    const W = 32, H = 40;
    const flame: THREE.Texture[] = [];
    const arc: THREE.Texture[] = [];
    const slime: THREE.Texture[] = [];
    for (let f = 0; f < 4; f++) {
      // tall flames: a few tongues whose heights dance from frame to frame
      const r = seeded(101 + f * 17);
      const tongues = [4, 10, 16, 22, 28].map((c) => ({ c: c + (r() - 0.5) * 3, h: 18 + r() * 21, w: 4 + r() * 3 }));
      const embers = new Set<number>();
      for (let i = 0; i < 4; i++) embers.add(Math.floor(r() * W) + (Math.floor(26 + r() * 13)) * W);
      flame.push(pixTexWH(W, H, (x, y) => {
        let h = 0;
        let core = 0;
        for (const t of tongues) {
          const d = (x + 0.5 - t.c) / t.w;
          if (Math.abs(d) >= 1) continue;
          const v = t.h * (1 - d * d);
          if (v > h) {
            h = v;
            core = 1 - Math.abs(d);
          }
        }
        // the base is a solid bed of fire, ragged at the edges of the tile
        const edge = Math.min(x, W - 1 - x);
        h = Math.max(h, edge < 2 ? 3 : 7);
        if (y >= h) return embers.has(y * W + x) ? [255, 210, 90, 255] : null;
        const rel = y / h;
        if (y >= h - 1.2) return [150, 26, 6, 255];
        if (rel < 0.42 && core > 0.45) return [255, 250, 205, 255];
        if (rel < 0.62 && core > 0.25) return [255, 214, 80, 255];
        if (rel < 0.82) return [255, 132, 26, 255];
        return [214, 54, 12, 255];
      }));

      // crackling arcs: jagged bolts climbing from the ground
      const ra = seeded(301 + f * 23);
      const lit = new Map<number, number>();
      for (let b = 0; b < 3; b++) {
        let x = 4 + ra() * 24;
        const top = 16 + ra() * 22;
        for (let y = 0; y < top; y++) {
          x += (ra() - 0.5) * 3.2;
          x = Math.max(1, Math.min(W - 2, x));
          const ix = Math.round(x);
          lit.set(y * W + ix, 2);
          for (const n of [ix - 1, ix + 1]) if (!lit.has(y * W + n)) lit.set(y * W + n, 1);
          if (ra() < 0.12) {
            // a short side fork
            let fx = ix, fy = y;
            const dir = ra() < 0.5 ? -1 : 1;
            for (let k = 0; k < 4; k++) {
              fx += dir;
              fy += ra() < 0.5 ? 1 : 0;
              if (fx > 0 && fx < W && fy < H) lit.set(fy * W + fx, Math.max(lit.get(fy * W + fx) ?? 0, 1));
            }
          }
        }
      }
      arc.push(pixTexWH(W, H, (x, y) => {
        const v = lit.get(y * W + x);
        if (v === 2) return [255, 255, 255, 255];
        if (v === 1) return [190, 120, 255, 255];
        if (y < 3 && ra() < 0.25) return [120, 60, 220, 255];
        return null;
      }));

      // bubbling slime: a green puddle with bubbles swelling and popping
      const rs = seeded(501);
      const blobs = Array.from({ length: 8 }, () => [16 + (rs() - 0.5) * 14, 16 + (rs() - 0.5) * 14, 7 + rs() * 6]);
      const bubbles = Array.from({ length: 7 }, (_, i) => ({ x: 6 + rs() * 20, y: 6 + rs() * 20, ph: i }));
      const rn = seeded(601 + f);
      slime.push(pixTex(32, (x, y) => {
        let m = 0;
        for (const [bx, by, br] of blobs) m = Math.max(m, 1 - Math.hypot(x - bx, y - by) / br);
        if (m <= 0) return null;
        for (const b of bubbles) {
          const stage = (b.ph + f) % 4; // 0 small, 1 big, 2 popping ring, 3 gone
          const d = Math.hypot(x - b.x, y - b.y);
          if (stage === 0 && d < 1.3) return [190, 255, 120, 255];
          if (stage === 1 && d < 2.4) return d > 1.5 ? [170, 245, 100, 255] : [220, 255, 170, 255];
          if (stage === 2 && Math.abs(d - 3) < 0.6) return [200, 255, 140, 255];
        }
        const n = rn();
        if (m < 0.18) return [30, 80, 12, 255];
        return n < 0.1 ? [120, 210, 60, 255] : m > 0.55 ? [70, 170, 34, 255] : [50, 130, 22, 255];
      }));
    }
    for (const t of slime) t.colorSpace = THREE.SRGBColorSpace;
    this.fieldFrames = { flame, arc, slime };

    const quad = new THREE.PlaneGeometry(1, 1.25);
    quad.translate(0, 0.625, 0);
    // lean the standing quads back so they face the tilted camera at full height
    quad.rotateX(-THREE.MathUtils.degToRad(90 - 32));
    this.fieldGeo = {
      quad,
      ground: new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2),
      glow: new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2),
      wall: new THREE.BoxGeometry(0.96, 1.6, 0.96).translate(0, 0.8, 0),
    };
    const cut = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const add = (map: THREE.Texture, color = 0xffffff, opacity = 1) => new THREE.MeshBasicMaterial({
      map, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.fieldMats = {
      flameA: cut(flame[0]), flameB: cut(flame[2]),
      fireGround: add(this.tex.fieldFire, 0xffffff, 0.85),
      fireGlow: add(this.tex.glow, 0xff6a10, 0.55),
      arcA: add(arc[0]), arcB: add(arc[2]),
      energyGround: add(this.tex.fieldEnergy, 0xffffff, 0.9),
      energyGlow: add(this.tex.glow, 0x8a4aff, 0.6),
      slimeA: new THREE.MeshBasicMaterial({ map: slime[0], transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      slimeB: new THREE.MeshBasicMaterial({ map: slime[2], transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      poisonGlow: add(this.tex.glow, 0x4aff2a, 0.35),
      wall: new THREE.MeshBasicMaterial({ map: this.tex.wall, color: 0xc8dcff, transparent: true, opacity: 0.82, depthWrite: false }),
      wallGlow: add(this.tex.glow, 0x6a9aff, 0.7),
    };
  }

  /**
   * The standing look of a field or magic wall on one tile: tall flickering
   * flames, crackling arcs, bubbling slime or a rune-lit wall. Built from shared
   * geometry and materials only; the caller just adds it to the scene and
   * drops it when the field goes (nothing to dispose).
   */
  fieldObject(kind: FieldKind, x: number, z: number): THREE.Object3D {
    if (!this.fieldFrames) this.buildFieldFrames();
    const G = this.fieldGeo!;
    const M = this.fieldMats;
    const g = new THREE.Group();
    const phase = (x + z) & 1;
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, order: number, px = 0, py = 0, pz = 0, sx = 1, sy = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.scale.set(sx, sy, 1);
      m.renderOrder = order;
      m.frustumCulled = false;
      g.add(m);
      return m;
    };
    const h = (k: number) => {
      const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
      return v - Math.floor(v);
    };
    switch (kind) {
      case 'fire': {
        mesh(G.glow, M.fireGlow, 3, 0, 0.03, 0);
        mesh(G.ground, M.fireGround, 4, 0, 0.035, 0);
        // a back row and a front row of flames, mirrored at random
        mesh(G.quad, phase ? M.flameA : M.flameB, 5, (h(1) - 0.5) * 0.1, 0.02, -0.22, h(2) < 0.5 ? -1 : 1, 0.95 + h(3) * 0.3);
        mesh(G.quad, phase ? M.flameB : M.flameA, 6, (h(4) - 0.5) * 0.12, 0.02, 0.18, (h(5) < 0.5 ? -1 : 1) * 0.92, 0.75 + h(6) * 0.25);
        break;
      }
      case 'energy': {
        mesh(G.glow, M.energyGlow, 3, 0, 0.03, 0);
        mesh(G.ground, M.energyGround, 4, 0, 0.035, 0);
        mesh(G.quad, phase ? M.arcA : M.arcB, 6, 0, 0.02, -0.15, h(2) < 0.5 ? -1 : 1, 0.85 + h(3) * 0.3);
        mesh(G.quad, phase ? M.arcB : M.arcA, 6, 0, 0.02, 0.2, (h(5) < 0.5 ? -1 : 1) * 0.8, 0.6 + h(6) * 0.2);
        break;
      }
      case 'poison': {
        mesh(G.glow, M.poisonGlow, 3, 0, 0.03, 0);
        const s = mesh(G.ground, phase ? M.slimeA : M.slimeB, 4, 0, 0.04, 0);
        s.rotation.y = Math.floor(h(7) * 4) * (Math.PI / 2);
        break;
      }
      case 'wall': {
        mesh(G.glow, M.wallGlow, 3, 0, 0.03, 0, 1.2, 1.2);
        mesh(G.wall, M.wall, 6);
        break;
      }
    }
    return g;
  }

  private animateFields(): void {
    if (!this.fieldFrames) return;
    const F = this.fieldFrames;
    const M = this.fieldMats as Record<string, THREE.MeshBasicMaterial>;
    const fi = Math.floor(this.time * 9) % 4;
    const ai = Math.floor(this.time * 14) % 4;
    const si = Math.floor(this.time * 3.5) % 4;
    M.flameA.map = F.flame[fi];
    M.flameB.map = F.flame[(fi + 2) % 4];
    M.arcA.map = F.arc[ai];
    M.arcB.map = F.arc[(ai + 1) % 4];
    // arcs blink like real sparks
    const blink = Math.floor(this.time * 20) % 5;
    M.arcA.opacity = blink === 0 ? 0.35 : 1;
    M.arcB.opacity = blink === 2 ? 0.35 : 1;
    M.slimeA.map = F.slime[si];
    M.slimeB.map = F.slime[(si + 2) % 4];
    const step = (v: number) => Math.round(v * 5) / 5;
    M.fireGlow.opacity = step(0.45 + 0.2 * Math.sin(this.time * 11) * Math.sin(this.time * 4.3));
    M.fireGround.opacity = step(0.7 + 0.2 * Math.sin(this.time * 9));
    M.energyGround.opacity = Math.floor(this.time * 20) % 7 === 0 ? 1 : 0.7;
    M.wall.opacity = step(0.74 + 0.1 * Math.sin(this.time * 3));
    M.wallGlow.opacity = step(0.55 + 0.2 * Math.sin(this.time * 5));
    this.tex.wall.offset.y = (this.time * 0.12) % 1;
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

  /** How busy the effect layer is, 0..1 (extras are skipped when it is crowded). */
  private load(): number {
    return Math.max(this.tileFx.length / MAX_TILE_FX, (this.solid.length + this.glow.length) / (MAX_SOLID + MAX_GLOW));
  }

  private particle(glow: boolean, x: number, y: number, z: number, vx: number, vy: number, vz: number, max: number, size: number, color: number, o: Partial<Particle> = {}): void {
    const list = glow ? this.glow : this.solid;
    const cap = glow ? MAX_GLOW : MAX_SOLID;
    const p: Particle = {
      x, y, z, vx, vy, vz, life: 0, max, size, grow: 0, g: 0, drag: 0, c0: col(color), c1: null,
      floor: Number.NaN, bounce: 0, stretch: 0, spin: 4, orbit: false, ox: 0, oz: 0, or: 0, oa: 0, ow: 0, oshrink: 0, pop: 0, ...o,
    };
    if (list.length >= cap) list[Math.floor(Math.random() * cap)] = p;
    else list.push(p);
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

  /** A brief point-light flash from a small shared pool; skipped when the pool is busy and the screen is crowded. */
  light(pos: THREE.Vector3, color: number, intensity: number, distance: number, dur: number, delay = 0): void {
    if (this.lights.every((l) => l.busy) && this.load() > 0.3) return;
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

  /** Shake if the local player stands near; skipped when lots is going on. */
  shakeNear(x: number, z: number, amount: number, dur = 0.3): void {
    const f = this.focus;
    if (!f || this.load() > 0.75) return;
    const d = Math.max(Math.abs(f.x - x), Math.abs(f.z - z));
    if (d <= 6) this.shake(amount * (d <= 2 ? 1 : d <= 4 ? 0.6 : 0.35), dur);
  }

  // ------------------------------------------------------------------ small particle bursts

  burst(pos: THREE.Vector3, color: number, count: number, speed = 2.2, gravity = 7, size = 0.07): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.9;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.particle(false, pos.x, pos.y, pos.z, Math.cos(a) * sp, up * sp, Math.sin(a) * sp, 0.45 + Math.random() * 0.35,
        size * (0.7 + Math.random() * 0.6), color, { g: gravity });
    }
  }

  /** Rising sparkles (level up). */
  sparkle(pos: THREE.Vector3, color: number, count: number, radius = 0.5): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * Math.random();
      this.particle(true, pos.x + Math.cos(a) * r, pos.y + Math.random() * 0.4, pos.z + Math.sin(a) * r, 0, 1.2 + Math.random() * 1.4, 0,
        0.7 + Math.random() * 0.5, 0.06 + Math.random() * 0.05, color, { spin: 0 });
    }
  }

  // ------------------------------------------------------------------ tile animations

  /** The tile animation an element plays. */
  animFor(effect: Effect): TileAnim {
    switch (effect) {
      case 'fire': return 'fire';
      case 'energy': return 'energy';
      case 'ice': return 'ice';
      case 'earth': case 'stone': return 'earth';
      case 'death': return 'death';
      case 'holy': case 'light': return 'holy';
      case 'heal': return 'heal';
      case 'haste': return 'teleport';
      case 'shield': return 'buff';
      default: return 'hit';
    }
  }

  /** Plays `anim` centred on a world point (seen from the camera), e.g. a creature's chest. */
  playAt(anim: TileAnim, at: THREE.Vector3, delay = 0, scale = 1, dur = 0.6): void {
    let fx: TileFx;
    if (this.tileFx.length >= MAX_TILE_FX) {
      // full: recycle the oldest-looking one
      fx = this.tileFx[Math.floor(Math.random() * MAX_TILE_FX)];
    } else {
      fx = { x: 0, y: 0, z: 0, row: 0, t: 0, dur: 0, delay: 0, scale: 1 };
      this.tileFx.push(fx);
    }
    // pulled toward the camera so it draws over whoever stands there; an
    // orthographic view does not move it on screen
    fx.x = at.x + TO_CAM.x;
    fx.y = at.y + TO_CAM.y;
    fx.z = at.z + TO_CAM.z;
    fx.row = ANIM_ROW[anim];
    fx.t = 0;
    fx.dur = dur;
    fx.delay = delay;
    fx.scale = scale;
  }

  /** Plays `anim` on tile (x, z) of the floor at height `off`. */
  playTile(anim: TileAnim, x: number, off: number, z: number, delay = 0, scale = 1, dur = 0.6): void {
    this.playAt(anim, tmpV2.set(x, off + 0.02, z), delay, scale, dur);
  }

  private flashColor(effect: Effect): number {
    switch (effect) {
      case 'fire': return 0xffa040;
      case 'ice': return 0xa8e6ff;
      case 'energy': return 0xc890ff;
      case 'earth': case 'stone': return 0x9ae060;
      case 'death': return 0x9040e0;
      case 'holy': case 'light': return 0xfff0b0;
      case 'heal': return 0x9dc8ff;
      default: return 0xffffff;
    }
  }

  private decalFor(effect: Effect): { kind: DecalKind; tint: number } | null {
    switch (effect) {
      case 'fire': return { kind: 'scorch', tint: 0xffffff };
      case 'ice': return { kind: 'frost', tint: 0xffffff };
      case 'earth': return { kind: 'crack', tint: 0xb0d890 };
      case 'stone': return { kind: 'crack', tint: 0xffffff };
      case 'energy': return { kind: 'burn', tint: 0xd0b8ff };
      case 'death': return { kind: 'death', tint: 0xffffff };
      default: return null;
    }
  }

  // ------------------------------------------------------------------ spell and rune looks

  /**
   * Area spell or rune: every affected tile plays the element's burst at the
   * same moment. The ultimate spells (radius 4+) roll out from the caster in a
   * fast stagger and add a light flash, ground marks and a shake.
   */
  explosion(cx: number, cz: number, off: number, radius: number, effect: Effect): void {
    const R = Math.max(0, radius);
    const big = R >= 4;
    const anim = this.animFor(effect);
    const dec = big ? this.decalFor(effect) : null;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R + R) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      const delay = big ? d * 0.03 : 0;
      this.playTile(anim, cx + dx, off, cz + dy, delay, 1, big ? 0.7 : 0.6);
      if (dec && (dx + dy * 3) % 2 === 0) this.decal(cx + dx, off, cz + dy, dec.kind, 0.95, 2.6 + Math.random(), dec.tint, false, delay + 0.1);
    }
    if (effect === 'heal') {
      this.light(new THREE.Vector3(cx, off + 1.5, cz), 0x9dc8ff, 2.5, 4 + R, 0.6);
      return;
    }
    const fc = this.flashColor(effect);
    this.light(new THREE.Vector3(cx, off + 1.6, cz), fc, big ? 9 : 2 + R * 1.5, big ? 12 : 4 + R * 1.5, big ? 0.7 : 0.45);
    if (big) this.shakeNear(cx, cz, 2.5, 0.5);
    else if (R >= 2) this.shakeNear(cx, cz, 1, 0.2);
  }

  /** Waves: every tile of the cone bursts at once. */
  wave(tiles: number[], ox: number, oz: number, off: number, effect: Effect): void {
    const anim = this.animFor(effect);
    let sx = 0, sz = 0;
    for (let i = 0; i < tiles.length; i += 2) {
      this.playTile(anim, tiles[i], off, tiles[i + 1]);
      sx += tiles[i];
      sz += tiles[i + 1];
    }
    const n = tiles.length / 2 || 1;
    this.light(new THREE.Vector3((sx / n + ox) / 2, off + 1.4, (sz / n + oz) / 2), this.flashColor(effect), 3, 6, 0.4);
    this.shakeNear(ox, oz, 1, 0.2);
  }

  /** Beams: every tile of the line bursts at once. */
  beam(tiles: number[], ox: number, oz: number, off: number, effect: Effect): void {
    this.wave(tiles, ox, oz, off, effect);
  }

  /** A hit on a creature (missile landing, strike spell, melee). `power` ~0.3–1.6 by damage. */
  impact(pos: THREE.Vector3, effect: Effect, power = 1): void {
    const anim = this.animFor(effect);
    this.playAt(anim, pos, 0, (anim === 'death' ? 1.2 : 1) + Math.max(0, Math.min(0.25, (power - 0.8) * 0.3)));
    if (power >= 0.8 && anim !== 'hit') this.light(pos, this.flashColor(effect), 1.5 + power * 1.5, 3.5, 0.3);
  }

  /** A miss: the grey puff. */
  poff(pos: THREE.Vector3): void {
    this.playAt('poff', pos, 0, 1, 0.5);
  }

  /** A blocked blow: grey sparks. */
  block(pos: THREE.Vector3): void {
    this.playAt('block', pos, 0, 1, 0.4);
  }

  /** Healing: blue-white sparkles rising on the tile; bigger heals stack a second, larger wave. */
  heal(foot: THREE.Vector3, power: number): void {
    const at = tmpV.set(foot.x, foot.y + 0.75, foot.z);
    this.playAt('heal', at, 0, 1.2, 0.9);
    if (power > 0.6) this.playAt('heal', at, 0.2, 1.45, 0.9);
    if (power > 1) this.playAt('buff', at, 0.05, 1.1, 0.7);
  }

  /** Mana: blue rings. */
  mana(foot: THREE.Vector3, power: number): void {
    const at = tmpV.set(foot.x, foot.y + 0.45, foot.z);
    this.playAt('mana', at, 0, 1, 0.6);
    if (power > 0.8) this.playAt('mana', at, 0.15, 1.2, 0.6);
  }

  /** Self-buffs and other radius-0 casts on the caster's tile. */
  buff(foot: THREE.Vector3, effect: Effect): void {
    // a heal's sparkles come with its heal event; the cast itself rings the caster
    const anim = effect === 'shield' || effect === 'heal' ? 'buff' : this.animFor(effect);
    this.playAt(anim, tmpV.set(foot.x, foot.y + 0.45, foot.z), 0, 1, 0.7);
  }

  /** A teleport or spawn: the ring of sparkles. */
  teleport(foot: THREE.Vector3): void {
    this.playAt('teleport', tmpV.set(foot.x, foot.y + 0.45, foot.z), 0, 1, 0.6);
  }

  /** A field or wall appearing on its tiles. */
  fieldPlaced(tiles: number[], off: number, effect: Effect): void {
    const anim = effect === 'shield' ? 'teleport' : this.animFor(effect);
    for (let i = 0; i < tiles.length; i += 2) this.playTile(anim, tiles[i], off, tiles[i + 1]);
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
        if (chance(0.35)) this.particle(false, x + rand(-0.2, 0.2), off + 1.0, z - 0.3, 0, 0.5, 0, 1.4, 0.09, pick([0x5a524c, 0x4a4440]), { g: -0.3, drag: 1, grow: 1.8 });
        break;
      case 'energy':
        if (chance(6)) {
          const a = Math.random() * Math.PI * 2;
          this.particle(true, x + rand(-0.3, 0.3), off + rand(0.05, 0.5), z + rand(-0.3, 0.3), Math.cos(a) * 1.5, rand(0, 1.5), Math.sin(a) * 1.5, 0.2, 0.04, pick([0xffffff, 0xd8b8ff]), { g: 4, stretch: 3 });
        }
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

  // ------------------------------------------------------------------ missiles

  private missileSprite(effect: Effect): MissileSprite | null {
    switch (effect) {
      case 'fire': return 'fireball';
      case 'energy': return 'energyball';
      case 'ice': return 'iceshard';
      case 'stone': case 'physical': case 'blood': return 'stone';
      case 'earth': return 'earthball';
      case 'death': return 'skull';
      case 'holy': case 'light': return 'holystar';
      case 'heal': case 'haste': case 'shield': return 'healorb';
      default: return null;
    }
  }

  /** Arrows, bolts, spears and throwing stars stay little 3D models that point where they fly. */
  private missileFactory(effect: Effect): () => { obj: THREE.Object3D; orient: boolean; spin: number } {
    const basic = (c: number) => new THREE.MeshBasicMaterial({ color: c });
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
      default: {
        const cone = new THREE.ConeGeometry(0.05, 0.18, 3), m = basic(EFFECT_COLOR[effect] ?? 0xd8dde6);
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
    }
  }

  /** A projectile flying from `from` to a (possibly moving) target. Returns its flight time. */
  missile(from: THREE.Vector3, to: () => THREE.Vector3, effect: Effect, onHit: () => void = () => {}): number {
    const dist = from.distanceTo(to());
    const sprite = this.missileSprite(effect);
    const dur = Math.max(0.12, dist * (sprite ? 0.055 : 0.045));
    let obj: THREE.Object3D | null = null;
    let orient = false;
    let spin = 0;
    if (!sprite) {
      let make = this.missileParts.get(effect);
      if (!make) {
        make = this.missileFactory(effect);
        this.missileParts.set(effect, make);
      }
      ({ obj, orient, spin } = make());
      obj.position.copy(from);
      this.group.add(obj);
    }
    this.missiles.push({
      obj, cell: sprite ? MISSILE_CELL[sprite] : null, pos: from.clone(), from: from.clone(), to, t: 0, dur,
      arc: sprite ? 0.15 : Math.min(0.5, dist * 0.05), spin, orient, onHit,
    });
    return dur;
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

  /** Writes one camera-facing sprite instance. */
  private spriteInstance(n: number, x: number, y: number, z: number, scale: number, col: number, row: number): void {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    this.spriteMesh.setMatrixAt(n, dummy.matrix);
    this.spriteCell.setXY(n, col, row);
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

    // tile animations
    let n = 0;
    const list = this.tileFx;
    for (let i = list.length - 1; i >= 0; i--) {
      const fx = list[i];
      if (fx.delay > 0) {
        fx.delay -= dt;
        continue;
      }
      fx.t += dt;
      if (fx.t >= fx.dur) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
    for (const fx of list) {
      if (fx.delay > 0 || n >= MAX_TILE_FX) continue;
      const frame = Math.min(FRAMES - 1, Math.floor((fx.t / fx.dur) * FRAMES));
      this.spriteInstance(n++, fx.x, fx.y, fx.z, fx.scale, frame, fx.row);
    }

    // missiles
    const spin = Math.floor(this.time * 12) % 4;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.t += dt / m.dur;
      if (m.t >= 1) {
        if (m.obj) this.group.remove(m.obj);
        this.missiles.splice(i, 1);
        m.onHit();
        continue;
      }
      const prev = tmpV2.copy(m.pos);
      m.pos.lerpVectors(m.from, m.to(), m.t);
      m.pos.y += Math.sin(m.t * Math.PI) * m.arc;
      if (m.cell) {
        if (n < MAX_TILE_FX) this.spriteInstance(n++, m.pos.x + TO_CAM.x * 0.6, m.pos.y + TO_CAM.y * 0.6, m.pos.z + TO_CAM.z * 0.6, 1, m.cell[1] + spin, m.cell[0]);
      } else if (m.obj) {
        m.obj.position.copy(m.pos);
        if (m.orient) {
          const dir = tmpV.copy(m.pos).sub(prev);
          if (dir.lengthSq() > 1e-8) m.obj.lookAt(dir.add(m.pos));
        }
        if (m.spin) m.obj.rotation.y += m.spin * dt;
      }
    }
    this.spriteMesh.count = n;
    this.spriteMesh.instanceMatrix.needsUpdate = true;
    this.spriteCell.needsUpdate = true;

    this.stepParticles(this.solid, this.solidMesh, dt, MAX_SOLID);
    this.stepParticles(this.glow, this.glowMesh, dt, MAX_GLOW);

    for (const s of this.rings) {
      const t = this.tick(s, dt);
      if (t < 0) continue;
      const k = 1 - (1 - t) * (1 - t);
      const sc = s.data.from + (s.data.to - s.data.from) * k;
      s.obj.scale.set(sc, sc, sc);
      s.obj.position.y += s.data.rise * dt;
      (s.obj.material as THREE.MeshBasicMaterial).opacity = step4(1 - t) * s.data.peak;
    }

    for (const s of this.decals) {
      const t = this.tick(s, dt);
      if (t < 0) continue;
      const k = t < 0.04 ? t / 0.04 : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      (s.obj.material as THREE.MeshBasicMaterial).opacity = step4(k) * (s.data.add ? 0.8 : 0.85);
    }

    this.animateFields();

    for (const s of this.lights) {
      const t = this.tick(s, dt);
      if (t >= 0) s.obj.intensity = s.data.i * (t < 0.1 ? t / 0.1 : (1 - t) / 0.9);
      else if (!s.busy) s.obj.intensity = 0;
      // lights stay in the scene (visible) so shaders never recompile
      s.obj.visible = true;
    }

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

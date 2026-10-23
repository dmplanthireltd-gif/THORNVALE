import * as THREE from 'three';
import { Rng } from '../../game/core/rng';
import type { Mat } from './parts';

/**
 * Painted style (render/style.ts), owner 2026-10-23: grim, brutal, detailed monsters for
 * older players. Every dark monster rig (darkRigs*.ts) gets worn surface detail from ONE
 * canvas-painted monster atlas instead of extra triangles: wrinkled and scarred hide, raw
 * flesh, wet glistening skin, overlapping scales, glossy chitin, cracked bone, ridged horn,
 * matted fur, rotting linen, blood-soaked cloth, pitted rust, scratched steel, chain mail,
 * notched blades, basalt with glowing ember cracks, frost rime, torn wing membrane, crystal
 * and stone. Everything is generated in code (original art).
 *
 * How it stays cheap:
 * - the Mesher (darkRigsCore.ts) writes UVs per primitive into one atlas cell, so each limb
 *   is still ONE merged geometry with the same two materials per creature (no new draw calls);
 * - the atlas alpha channel is a glow mask (ember cracks, crystal hearts, frost glints): the
 *   body shader adds `rgb × (1 − alpha) × glow` as light, so cracks glow without a new mesh;
 * - one shader variant for every monster (`customProgramCacheKey`), per-kind values are
 *   uniforms: rim sheen (wet sea skin, chitin, frost), a soft specular glint, ember glow.
 *
 * The per-family pass (`GRIM`) decides what each kind's surfaces become and adds grime at
 * build time on the vertex colours: blood on claws, teeth and blades of predators and
 * warriors, mould and rot on the undead, frost rime on the top faces of ice creatures
 * (what the top-down camera sees most), soot and char on fire creatures.
 */
export type MonDetail =
  | 'plain' | 'hide' | 'scarSkin' | 'flesh' | 'wet'
  | 'scale' | 'chitin' | 'bone' | 'horn' | 'fur'
  | 'hair' | 'leather' | 'cloth' | 'rotCloth' | 'clothBlood'
  | 'iron' | 'steel' | 'chain' | 'blade' | 'wood'
  | 'ember' | 'frost' | 'membrane' | 'crystal' | 'stone';

export const MON_CELLS: MonDetail[] = [
  'plain', 'hide', 'scarSkin', 'flesh', 'wet',
  'scale', 'chitin', 'bone', 'horn', 'fur',
  'hair', 'leather', 'cloth', 'rotCloth', 'clothBlood',
  'iron', 'steel', 'chain', 'blade', 'wood',
  'ember', 'frost', 'membrane', 'crystal', 'stone',
];
const CELL = 256;
export const MON_COLS = 5;

// ------------------------------------------------------------------ per-family look

/** How one monster kind is dressed in the painted style. */
export interface Grim {
  /** What its own body (the chromatic, non-gear colours) becomes. */
  skin: MonDetail;
  /** Browns and greys of the body read as fur / pelts (beasts, barbarians, minotaurs). */
  fur?: boolean;
  /** Greys are stone rather than steel (golems, behemoth, fire elemental). */
  stone?: boolean;
  /** Cloth parts become this (blood-soaked tabards, rotting linen). */
  cloth?: MonDetail;
  /** Thin two-sided parts are wing membrane. */
  wings?: boolean;
  /** Blood on claws, teeth, blades and spikes; a few splashes on the hide (0–1). */
  blood?: number;
  /** Blood colour (ichor for insects, dried brown for the undead). */
  bloodColor?: number;
  /** Mould and rot patches, heavier low down (undead). */
  rot?: number;
  /** Frost rime on upward faces (ice). */
  frost?: number;
  /** Soot and char low down (fire). */
  soot?: number;
  /** Specular glint strength (wet skin, chitin). */
  spec?: number;
  /** Rim sheen strength and colour. */
  rim?: number;
  rimColor?: number;
  /** Ember / crystal glow from the atlas glow mask. */
  glow?: number;
  /** Glow colour multiplier (ember orange by default). */
  glowColor?: number;
}

const ICHOR = 0x6a7a14;
const DRIED = 0x3a1608;

const beast = (blood: number, extra: Partial<Grim> = {}): Grim => ({ skin: 'hide', fur: true, blood, spec: 0.04, ...extra });
const warrior = (extra: Partial<Grim> = {}): Grim => ({ skin: 'scarSkin', blood: 0.22, cloth: 'clothBlood', spec: 0.05, ...extra });
const undead = (skin: MonDetail, extra: Partial<Grim> = {}): Grim => ({ skin, rot: 0.4, cloth: 'rotCloth', blood: 0.2, bloodColor: DRIED, spec: 0.03, ...extra });
const bug = (extra: Partial<Grim> = {}): Grim => ({ skin: 'chitin', blood: 0.18, bloodColor: ICHOR, spec: 0.22, rim: 0.22, rimColor: 0x9aa890, ...extra });
const sea = (skin: MonDetail, extra: Partial<Grim> = {}): Grim => ({ skin, spec: 0.5, rim: 0.32, rimColor: 0x5ab8c8, blood: 0.12, ...extra });
const ice = (extra: Partial<Grim> = {}): Grim => ({ skin: 'hide', frost: 0.45, rim: 0.25, rimColor: 0x9ad8ff, spec: 0.12, glowColor: 0x7ad0ff, ...extra });

export const GRIM: Record<string, Grim> = {
  // beasts and predators: matted fur, blood on muzzles, claws and teeth
  rat: beast(0.35), wolf: beast(0.45), bear: beast(0.4), deer: beast(0, { blood: 0 }), silver_rabbit: beast(0),
  winter_wolf: beast(0.4, { frost: 0.4, rim: 0.2, rimColor: 0x9ad8ff }),
  polar_bear: beast(0.45, { frost: 0.3, rim: 0.15, rimColor: 0x9ad8ff }),
  dire_penguin: beast(0.15, { fur: false, rim: 0.15, rimColor: 0x9ad8ff }),
  snake: { skin: 'scale', blood: 0.15, spec: 0.22, rim: 0.12, rimColor: 0xa0b080 },
  crocodile: { skin: 'scale', blood: 0.4, spec: 0.3, rim: 0.18, rimColor: 0x7aa080 },
  hydra: { skin: 'scale', blood: 0.35, spec: 0.3, rim: 0.2, rimColor: 0x6ab090 },
  // undead: rotting linen, exposed bone, mould, old dried blood
  skeleton: undead('bone', { rot: 0.3 }),
  ghoul: undead('flesh', { rot: 0.5, blood: 0.45, bloodColor: 0x5a0c06 }),
  mummy: undead('rotCloth', { rot: 0.45 }),
  // orcs, folk, northmen, brutes: scars, battle damage, blood-soaked cloth, notched weapons
  orc: warrior(), orc_spearman: warrior(), orc_shaman: warrior({ blood: 0.15 }), orc_warrior: warrior({ blood: 0.3 }),
  orc_berserker: warrior({ blood: 0.45 }), orc_leader: warrior({ blood: 0.3 }), orc_warlord: warrior({ blood: 0.35 }),
  bandit: warrior({ blood: 0.2 }), amazon: warrior({ blood: 0.2 }), valkyrie: warrior({ blood: 0.2 }),
  elf: warrior({ skin: 'hide', blood: 0.1, cloth: 'cloth' }), elf_scout: warrior({ skin: 'hide', blood: 0.12, cloth: 'cloth' }),
  elf_arcanist: warrior({ skin: 'hide', blood: 0.08, cloth: 'cloth' }), elf_warden: warrior({ skin: 'hide', blood: 0.15, cloth: 'cloth' }),
  dwarf: warrior({ blood: 0.15, soot: 0.25 }), dwarf_soldier: warrior({ blood: 0.18, soot: 0.25 }), dwarf_guard: warrior({ blood: 0.2, soot: 0.25 }),
  barbarian_raider: warrior({ fur: true, frost: 0.08 }), barbarian_headsplitter: warrior({ fur: true, blood: 0.45, frost: 0.08 }),
  barbarian_skullhunter: warrior({ fur: true, blood: 0.35, frost: 0.08 }), barbarian_brutetamer: warrior({ fur: true, frost: 0.2, rim: 0.12, rimColor: 0x9ad8ff }),
  frostkin: ice({ fur: true, frost: 0.3 }), frostkin_toolshaper: ice({ fur: true, frost: 0.3 }), frostkin_windcaller: ice({ fur: true, frost: 0.25 }),
  minotaur: warrior({ fur: true, blood: 0.3 }), minotaur_archer: warrior({ fur: true, blood: 0.22 }), minotaur_mage: warrior({ fur: true, blood: 0.15 }),
  cyclops: warrior({ blood: 0.35 }), jungle_troll: warrior({ blood: 0.35, spec: 0.08 }),
  behemoth: warrior({ skin: 'stone', stone: true, blood: 0.3 }),
  lizard_sentinel: warrior({ skin: 'scale', spec: 0.16, blood: 0.15 }), lizard_templar: warrior({ skin: 'scale', spec: 0.16, blood: 0.18 }),
  // giants and ice
  frost_giant: ice({ skin: 'scarSkin', blood: 0.25, cloth: 'clothBlood', fur: true }),
  frost_giantess: ice({ skin: 'scarSkin', blood: 0.2, fur: true }),
  ice_golem: ice({ skin: 'crystal', stone: true, frost: 0.55, glow: 0.7, rim: 0.4 }),
  ice_witch: ice({ frost: 0.35, cloth: 'cloth', glow: 0.4 }),
  frost_dragon: ice({ skin: 'scale', wings: true, frost: 0.5, blood: 0.2, glow: 0.4 }),
  crystal_spider: bug({ frost: 0.12, glow: 0.6, glowColor: 0x7ad0ff, rimColor: 0x9ad8ff }),
  // fire: basalt and scorched hide with ember cracks, soot low down
  fire_elemental: { skin: 'ember', stone: true, soot: 0.5, glow: 1.4, spec: 0.05, rim: 0.3, rimColor: 0xff7a2a },
  demon: { skin: 'ember', wings: true, soot: 0.35, blood: 0.45, glow: 0.8, spec: 0.08, rim: 0.18, rimColor: 0xff5a1a, cloth: 'clothBlood' },
  dragon: { skin: 'scale', wings: true, soot: 0.25, blood: 0.3, spec: 0.06, glow: 0.3 },
  dragon_lord: { skin: 'scale', wings: true, soot: 0.35, blood: 0.35, spec: 0.07, glow: 0.6, rim: 0.12, rimColor: 0xff6a20 },
  // spiders and insects: glossy chitin, bristles, ichor
  tarantula: bug({ fur: true }), dread_weaver: bug({ fur: true, blood: 0.25 }), gravesilk_colossus: bug({ fur: true, blood: 0.3, spec: 0.1 }),
  scorpion: bug(), scarab: bug({ spec: 0.3 }),
  // the Sunken Reach: wet, glistening skin
  lantern_jelly: sea('wet', { glow: 0.5, glowColor: 0x7ad8ff, blood: 0 }), blight_jelly: sea('wet', { glow: 0.5, glowColor: 0xa8ff4a, blood: 0 }),
  ironshell_crab: sea('chitin', { blood: 0.1 }),
  deepfin_raider: sea('scale', { blood: 0.25, cloth: 'clothBlood' }), deepfin_harpooner: sea('scale', { blood: 0.2 }), deepfin_tidecaller: sea('scale', { blood: 0.12 }),
  gloom_eel: sea('wet', { blood: 0.2, glow: 0.3, glowColor: 0x8ae0ff }),
};

/** The painted-style look of a dark monster kind (null for kinds it does not cover, e.g. pets). */
export function grimFor(kind: string): Grim | null {
  return GRIM[kind] ?? null;
}

// ------------------------------------------------------------------ choosing a surface per part

const _hsl = { h: 0, s: 0, l: 0 };

/**
 * Guesses the surface of one primitive from its colour, shape and the kind's look.
 * `size` = the primitive's largest extent, `thin` = flattest / largest extent,
 * `two` = drawn two-sided (cloth, membranes).
 */
export function guessDetail(g: Grim, color: THREE.Color, size: number, thin: number, two: boolean, long: number): MonDetail {
  color.getHSL(_hsl);
  const h = _hsl.h * 360, s = _hsl.s, l = _hsl.l;
  if (size < 0.03) return 'plain';
  if (l < 0.06) return 'plain'; // sockets, mouths
  // thin two-sided slabs: cloth strips or wing membrane
  if (two && thin < 0.12) return g.wings && size > 0.35 ? 'membrane' : g.cloth ?? 'cloth';
  // bone and fang (pale yellow-grey)
  if (h >= 30 && h <= 60 && s >= 0.12 && s <= 0.5 && l >= 0.5) return 'bone';
  // near-black claws and horns
  if (l < 0.16 && s < 0.35 && size < 0.5 && long > 2.2) return 'horn';
  // greys: metal (or stone)
  if (s < 0.14) {
    if (g.stone) return g.skin === 'ember' && l < 0.25 ? 'ember' : 'stone';
    if (long > 4 && thin < 0.35 && l > 0.3) return 'blade';
    if (g.skin === 'chitin' || g.skin === 'wet' || (g.skin === 'scale' && !g.cloth && size > 0.08)) return g.skin;
    if (g.fur && l < 0.5 && size > 0.12) return 'fur';
    return l > 0.4 ? 'steel' : l > 0.16 ? 'iron' : 'leather';
  }
  // gold and brass
  if (h >= 36 && h <= 56 && s > 0.45 && l > 0.3) return 'steel';
  // rust
  if (h >= 12 && h <= 32 && s > 0.45 && l >= 0.18 && l <= 0.36) return g.skin === 'ember' ? 'ember' : 'iron';
  // browns: leather and wood, or fur on beasts
  if (h >= 14 && h <= 45 && l < 0.42) {
    if (g.fur) return 'fur';
    if (g.skin === 'chitin' || g.skin === 'scale' || g.skin === 'ember' || g.skin === 'wet') return g.skin;
    if (long > 3.5) return 'wood';
    return 'leather';
  }
  // saturated reds / blues / purples on a warrior are cloth; everything else is the body
  if ((h < 14 || h > 200) && s > 0.4 && l < 0.45 && g.cloth && thin < 0.5) return g.cloth;
  return g.skin;
}

// ------------------------------------------------------------------ painting

class VNoise {
  private v = new Float32Array(64 * 64);
  constructor(seed: number) {
    const r = new Rng(seed);
    for (let i = 0; i < this.v.length; i++) this.v[i] = r.next();
  }
  /** Tileable value noise, `p` lattice cells across the cell. */
  at(x: number, y: number, p: number): number {
    const fx0 = (x / CELL) * p, fy0 = (y / CELL) * p;
    const ix = Math.floor(fx0), iy = Math.floor(fy0);
    let fx = fx0 - ix, fy = fy0 - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const m = (a: number) => ((a % p) + p) % p;
    const q = (a: number, b: number) => this.v[(m(b) & 63) * 64 + (m(a) & 63)];
    const a = q(ix, iy) + (q(ix + 1, iy) - q(ix, iy)) * fx;
    const b = q(ix, iy + 1) + (q(ix + 1, iy + 1) - q(ix, iy + 1)) * fx;
    return a + (b - a) * fy;
  }
  fbm(x: number, y: number, p: number, oct = 4): number {
    let s = 0, w = 0.5, t = 0;
    for (let o = 0; o < oct; o++) { s += this.at(x, y, p << o) * w; t += w; w *= 0.5; }
    return s / t;
  }
  /** Thin ridges where the noise crosses 0.5 (cracks, veins, wrinkles): 1 on the line. */
  ridge(x: number, y: number, p: number, w = 0.04): number {
    const d = Math.abs(this.fbm(x, y, p, 3) - 0.5);
    return Math.max(0, 1 - d / w);
  }
}

interface P { ctx: CanvasRenderingContext2D; r: Rng; n: VNoise }
type RGBA = [number, number, number] | [number, number, number, number];

/** Fills the cell pixel by pixel: f returns [r, g, b(, glow-mask alpha)] in 0..1. */
function field(p: P, f: (x: number, y: number) => RGBA): void {
  const img = p.ctx.createImageData(CELL, CELL);
  const d = img.data;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const c = f(x, y);
    const i = (y * CELL + x) * 4;
    d[i] = Math.max(0, Math.min(255, c[0] * 255));
    d[i + 1] = Math.max(0, Math.min(255, c[1] * 255));
    d[i + 2] = Math.max(0, Math.min(255, c[2] * 255));
    d[i + 3] = c.length > 3 ? Math.max(0, Math.min(255, (c as number[])[3] * 255)) : 255;
  }
  p.ctx.putImageData(img, 0, 0);
}

/** 0 at the top of the cell, 1 at the bottom (where grime collects: v = 0 is a face's bottom). */
const low = (y: number, from = 0.55) => Math.max(0, (y / CELL - from) / (1 - from));
const grey = (v: number, warm = 0.03): [number, number, number] => [v + warm, v, v - warm];

function splat(p: P, x: number, y: number, rad: number, color: string, drops = 7, runs = 2): void {
  const { ctx, r } = p;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, rr = rad * (0.5 + r.next() * 0.7);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < drops; i++) {
    const a = r.next() * Math.PI * 2, rr = rad * (1 + r.next() * 1.5);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1 + r.next() * rad * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < runs; i++) {
    const dx = x + (r.next() - 0.5) * rad;
    ctx.fillRect(dx, y, 1.5 + r.next() * 2.5, rad * (0.8 + r.next() * 2.4));
  }
}

function scratches(p: P, n: number, light: string, dark: string, len = 40, w = 1.1): void {
  const { ctx, r } = p;
  for (let i = 0; i < n; i++) {
    const x = r.next() * CELL, y = r.next() * CELL, a = r.next() * Math.PI, l = 6 + r.next() * len;
    ctx.lineWidth = 0.6 + r.next() * w;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + 1 + Math.cos(a) * l, y + 1 + Math.sin(a) * l); ctx.stroke();
    ctx.strokeStyle = light;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
}

function dents(p: P, n: number): void {
  const { ctx, r } = p;
  for (let i = 0; i < n; i++) {
    const x = r.next() * CELL, y = r.next() * CELL, rad = 5 + r.next() * 16;
    const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.3)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
}

/** A healed scar: pale raised line with dark edges and stitch marks across it. */
function scar(p: P, x: number, y: number, len: number, a: number, stitches: boolean): void {
  const { ctx, r } = p;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([x + Math.cos(a) * len * t + (r.next() - 0.5) * 4, y + Math.sin(a) * len * t + (r.next() - 0.5) * 4]);
  }
  const line = (w: number, c: string, dx = 0, dy = 0) => {
    ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineCap = 'round';
    ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy))); ctx.stroke();
  };
  line(7, 'rgba(40,14,10,0.55)', 1, 1.5);
  line(4.5, 'rgba(250,200,185,0.75)');
  line(1.6, 'rgba(120,40,30,0.7)');
  if (stitches) {
    ctx.strokeStyle = 'rgba(20,12,8,0.8)'; ctx.lineWidth = 1.4;
    const nx = -Math.sin(a), ny = Math.cos(a);
    for (let i = 1; i < 8; i++) {
      const [px, py] = pts[i];
      ctx.beginPath(); ctx.moveTo(px - nx * 6, py - ny * 6); ctx.lineTo(px + nx * 6, py + ny * 6); ctx.stroke();
    }
  }
}

function blood(p: P, n: number, big = 20, dark = false): void {
  const { r } = p;
  for (let i = 0; i < n; i++) {
    const c = dark ? `rgba(${45 + r.int(0, 25)},6,3,${0.6 + r.next() * 0.3})` : `rgba(${95 + r.int(0, 50)},8,5,${0.6 + r.next() * 0.3})`;
    splat(p, r.next() * CELL, 30 + r.next() * 210, 5 + r.next() * big, c);
  }
}

const PAINTERS: Record<MonDetail, (p: P) => void> = {
  plain: (p) => field(p, (x, y) => grey(0.93 + p.n.at(x, y, 8) * 0.07, 0.01)),
  hide: (p) => {
    // thick wrinkled hide: folds, pores, blotches, dirt low down, old scratches
    field(p, (x, y) => {
      const wr = p.n.ridge(x, y, 6, 0.035) * -0.22 + p.n.ridge(x + 50, y, 12, 0.03) * -0.12;
      const pore = (p.n.at(x, y, 128) - 0.5) * 0.12;
      const blot = (p.n.fbm(x, y, 4) - 0.5) * 0.3;
      const v = 0.86 + wr + pore + blot - low(y, 0.6) * 0.3;
      return [v + 0.02, v - 0.01, v - 0.04];
    });
    scratches(p, 14, 'rgba(255,220,200,0.3)', 'rgba(40,10,5,0.4)', 26);
    const { r } = p;
    for (let i = 0; i < 7; i++) splat(p, r.next() * CELL, 120 + r.next() * 130, 6 + r.next() * 16, 'rgba(35,24,14,0.3)', 3, 0);
  },
  scarSkin: (p) => {
    PAINTERS.hide(p);
    const { r } = p;
    for (let i = 0; i < 5; i++) scar(p, 20 + r.next() * 200, 20 + r.next() * 200, 40 + r.next() * 90, r.next() * Math.PI, i % 2 === 0);
    // a fresh cut, still bleeding
    splat(p, 60 + r.next() * 140, 60 + r.next() * 120, 8, 'rgba(120,8,4,0.85)', 5, 3);
    for (let i = 0; i < 3; i++) splat(p, r.next() * CELL, r.next() * CELL, 5 + r.next() * 8, 'rgba(60,6,3,0.6)', 4, 1);
  },
  flesh: (p) => {
    // grey-green dead flesh with dark veins, raw red sores and torn skin
    field(p, (x, y) => {
      const vein = p.n.ridge(x, y, 5, 0.025) * -0.3;
      const blot = (p.n.fbm(x, y, 4) - 0.5) * 0.35;
      const sore = Math.max(0, p.n.fbm(x + 90, y + 40, 3) - 0.62) * 3.2;
      const v = 0.82 + vein + blot - low(y, 0.6) * 0.3;
      return [v + sore * 0.35, v - sore * 0.45, v - sore * 0.45 - 0.03];
    });
    const { ctx, r } = p;
    for (let i = 0; i < 6; i++) { // torn edges with dark gaps
      const x = r.next() * CELL, y = r.next() * CELL;
      ctx.fillStyle = 'rgba(30,8,6,0.75)';
      ctx.beginPath(); ctx.ellipse(x, y, 6 + r.next() * 12, 3 + r.next() * 5, r.next() * Math.PI, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(230,210,180,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    blood(p, 6, 14, true);
  },
  wet: (p) => {
    // smooth slick skin: soft mottles, slime specks and bright wet streaks
    field(p, (x, y) => {
      const m = (p.n.fbm(x, y, 3) - 0.5) * 0.32;
      const spot = p.n.at(x, y, 48) > 0.76 ? -0.18 : 0;
      const streak = Math.pow(Math.max(0, Math.sin((x + p.n.at(x, y, 4) * 90) / CELL * Math.PI * 7)), 40) * 0.35;
      const v = 0.8 + m + spot + streak - low(y, 0.7) * 0.2;
      return [v - 0.02, v + 0.01, v + 0.03];
    });
    const { ctx, r } = p;
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + r.next() * 0.4})`;
      ctx.beginPath(); ctx.ellipse(r.next() * CELL, r.next() * CELL, 1 + r.next() * 4, 0.8 + r.next() * 1.5, r.next() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  },
  scale: (p) => {
    // rows of overlapping scales, each with a dark lower edge and a lit crown; some chipped
    field(p, (x, y) => {
      const s = 34, row = Math.floor(y / (s * 0.62)), off = row % 2 ? s / 2 : 0;
      const cx = (Math.floor((x + off) / s) + 0.5) * s - off, cy = (row + 0.5) * s * 0.62;
      const dx = (x - cx) / (s * 0.5), dy = (y - cy) / (s * 0.42);
      const d = Math.sqrt(dx * dx + dy * dy);
      const edge = d > 0.82 ? -0.3 : 0;
      const lit = (1 - Math.min(1, d)) * 0.16 - dy * 0.08;
      const wear = (p.n.fbm(x, y, 4) - 0.5) * 0.25;
      const v = 0.8 + edge + lit + wear - low(y, 0.7) * 0.22;
      return [v + 0.01, v, v - 0.03];
    });
    scratches(p, 18, 'rgba(255,250,230,0.3)', 'rgba(0,0,0,0.45)', 30);
  },
  chitin: (p) => {
    // glossy segmented plates, sheen streak, pits, fine bristles at the plate seams
    field(p, (x, y) => {
      const band = Math.sin((y / CELL) * Math.PI * 4);
      const seam = Math.pow(1 - Math.abs(band), 10) * -0.4;
      const sheen = Math.pow(Math.max(0, 1 - Math.abs(x / CELL - 0.35 - (y / CELL) * 0.2) * 7), 2) * 0.32;
      const pit = p.n.at(x, y, 64) > 0.8 ? -0.2 : 0;
      const v = 0.72 + seam + sheen + pit + (p.n.fbm(x, y, 4) - 0.5) * 0.15;
      return [v, v + 0.01, v - 0.02];
    });
    const { ctx, r } = p;
    ctx.strokeStyle = 'rgba(10,8,6,0.6)'; ctx.lineWidth = 1;
    for (let i = 0; i < 260; i++) {
      const band = r.int(0, 3), y = (band + 0.5) * CELL / 4 + (r.next() - 0.5) * 10, x = r.next() * CELL;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r.next() - 0.5) * 5, y + 5 + r.next() * 8); ctx.stroke();
    }
    scratches(p, 16, 'rgba(255,255,240,0.35)', 'rgba(0,0,0,0.4)', 22);
  },
  bone: (p) => {
    field(p, (x, y) => {
      const crack = p.n.ridge(x, y, 5, 0.018) * -0.4;
      const v = 0.86 + crack + (p.n.fbm(x, y, 4) - 0.5) * 0.25 - low(y, 0.55) * 0.34;
      return [v + 0.03, v, v - 0.08];
    });
    scratches(p, 25, 'rgba(255,255,240,0.3)', 'rgba(60,40,20,0.5)', 16);
    const { r } = p;
    for (let i = 0; i < 6; i++) splat(p, r.next() * CELL, 120 + r.next() * 130, 6 + r.next() * 14, 'rgba(70,50,20,0.35)', 3, 1);
  },
  horn: (p) => {
    // growth rings, lengthwise grooves, darker toward the base
    field(p, (x, y) => {
      const ring = Math.pow(Math.abs(Math.sin((y / CELL) * Math.PI * 9 + p.n.at(x, y, 4) * 2)), 6) * -0.18;
      const groove = (p.n.at(x * 0.1, y, 64) - 0.5) * 0.2;
      return grey(0.84 + ring + groove - low(y, 0.4) * 0.3, 0.05);
    });
    scratches(p, 10, 'rgba(255,240,210,0.3)', 'rgba(0,0,0,0.4)', 18);
  },
  fur: (p) => {
    // clumped strands, matted and grimy low down, a few dark clots
    field(p, (x, y) => {
      const clump = Math.pow(Math.abs(Math.sin((x / CELL) * Math.PI * 5 + p.n.at(x, y, 3) * 5)), 3) * -0.22; // matted locks
      return grey(0.78 + clump + (p.n.at(x * 0.3, y, 128) - 0.5) * 0.4 + (p.n.fbm(x, y, 3) - 0.5) * 0.34 - low(y, 0.65) * 0.25, 0.04);
    });
    const { ctx, r } = p;
    for (let i = 0; i < 1300; i++) {
      const x = r.next() * CELL, y = r.next() * CELL, dark = r.next() < 0.55;
      ctx.strokeStyle = dark ? 'rgba(18,12,6,0.4)' : 'rgba(255,240,215,0.28)';
      ctx.lineWidth = dark ? 1.4 : 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (r.next() - 0.5) * 6, y + 6, x + (r.next() - 0.5) * 6, y + 10 + r.next() * 10); ctx.stroke();
    }
    for (let i = 0; i < 4; i++) splat(p, r.next() * CELL, 150 + r.next() * 100, 5 + r.next() * 10, 'rgba(60,8,4,0.55)', 4, 1);
  },
  hair: (p) => {
    field(p, (x, y) => grey(0.82 + (p.n.at(x * 0.25, y * 0.02, 128) - 0.5) * 0.5 + (p.n.fbm(x, y, 4) - 0.5) * 0.15, 0.02));
    const { ctx, r } = p;
    for (let i = 0; i < 500; i++) {
      const x = r.next() * CELL, y = r.next() * CELL;
      ctx.strokeStyle = r.next() < 0.6 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (r.next() - 0.5) * 8, y + 12, x + (r.next() - 0.5) * 6, y + 26); ctx.stroke();
    }
  },
  leather: (p) => {
    field(p, (x, y) => {
      const grain = (p.n.at(x, y, 64) - 0.5) * 0.16 + (p.n.at(x, y, 32) - 0.5) * 0.1;
      const crease = Math.pow(Math.abs(Math.sin((y / CELL) * Math.PI * 5 + p.n.at(x, y, 4) * 4)), 18) * -0.2;
      const wear = (p.n.fbm(x, y, 4) - 0.5) * 0.32;
      return grey(0.8 + grain + crease + wear - low(y, 0.7) * 0.25, 0.05);
    });
    scratches(p, 30, 'rgba(255,235,200,0.28)', 'rgba(20,10,0,0.3)', 22);
    const { ctx, r } = p;
    ctx.strokeStyle = 'rgba(25,15,8,0.65)';
    ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, CELL - 16, CELL - 16);
    ctx.setLineDash([]);
    for (let i = 0; i < 3; i++) splat(p, r.next() * CELL, r.next() * CELL, 5 + r.next() * 9, 'rgba(70,8,4,0.5)', 4, 1);
  },
  cloth: (p) => {
    field(p, (x, y) => {
      const weave = ((x >> 1) + (y >> 1)) % 2 ? 0.035 : -0.035;
      const fold = Math.sin((x / CELL) * Math.PI * 6 + p.n.at(x, y, 4) * 3) * 0.1;
      const blot = (p.n.fbm(x, y, 4) - 0.5) * 0.24;
      return grey(0.84 + weave + fold + blot - low(y, 0.6) * 0.4, 0.02);
    });
    const { ctx, r } = p;
    ctx.fillStyle = 'rgba(30,22,14,0.55)';
    for (let x = 0; x < CELL; x += 3) ctx.fillRect(x, CELL - 6 - r.next() * 16, 3, 22);
    for (let i = 0; i < 5; i++) splat(p, r.next() * CELL, 60 + r.next() * 180, 6 + r.next() * 14, `rgba(40,30,20,${0.14 + r.next() * 0.12})`, 3, 0);
  },
  rotCloth: (p) => {
    // yellowed, mouldy linen wraps with holes and a ragged, rotten hem
    field(p, (x, y) => {
      const wrap = Math.pow(Math.abs(Math.sin((y / CELL) * Math.PI * 7 + (x / CELL) * 2.2)), 8) * -0.22;
      const weave = ((x >> 1) + (y >> 1)) % 2 ? 0.03 : -0.03;
      const mould = Math.max(0, p.n.fbm(x + 30, y, 4) - 0.55) * 2.4 + low(y, 0.5) * 0.5;
      const v = 0.86 + wrap + weave + (p.n.fbm(x, y, 4) - 0.5) * 0.25 - low(y, 0.6) * 0.25;
      return [v - mould * 0.28, v - mould * 0.2, v - mould * 0.42 - 0.05];
    });
    const { ctx, r } = p;
    for (let i = 0; i < 9; i++) { // holes showing the dark beneath
      const x = r.next() * CELL, y = r.next() * CELL, rad = 3 + r.next() * 9;
      ctx.fillStyle = 'rgba(20,14,8,0.85)';
      ctx.beginPath(); ctx.ellipse(x, y, rad, rad * (0.5 + r.next() * 0.5), r.next() * Math.PI, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(200,180,140,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.fillStyle = 'rgba(25,18,10,0.7)';
    for (let x = 0; x < CELL; x += 4) ctx.fillRect(x, CELL - 4 - r.next() * 26, 4, 30);
    for (let i = 0; i < 4; i++) splat(p, r.next() * CELL, r.next() * CELL, 6 + r.next() * 12, 'rgba(60,24,8,0.45)', 3, 2); // old seepage
  },
  clothBlood: (p) => {
    PAINTERS.cloth(p);
    blood(p, 7, 22);
    blood(p, 4, 7, true);
  },
  iron: (p) => {
    field(p, (x, y) => {
      const pit = p.n.at(x, y, 64) > 0.78 ? -0.25 : 0;
      const mott = (p.n.fbm(x, y, 4) - 0.5) * 0.4;
      const rust = Math.max(0, p.n.fbm(x + 77, y, 4) - 0.52) * 1.9 + low(y, 0.5) * 0.45;
      const v = 0.78 + mott + pit;
      return [v + rust * 0.25, v - rust * 0.06, v - rust * 0.32];
    });
    dents(p, 12);
    scratches(p, 70, 'rgba(230,220,210,0.42)', 'rgba(0,0,0,0.42)', 26);
    blood(p, 2, 10, true);
  },
  steel: (p) => {
    field(p, (x, y) => {
      const brush = (p.n.at(x * 0.15, y, 128) - 0.5) * 0.12;
      const mott = (p.n.fbm(x, y, 4) - 0.5) * 0.3;
      return grey(0.84 + brush + mott - low(y, 0.6) * 0.42, -0.01);
    });
    dents(p, 18);
    scratches(p, 120, 'rgba(255,255,255,0.45)', 'rgba(0,0,0,0.38)', 34);
    const { r } = p;
    for (let i = 0; i < 6; i++) splat(p, r.next() * CELL, 120 + r.next() * 130, 4 + r.next() * 9, `rgba(${90 + r.int(0, 30)},50,25,0.42)`, 3, 1);
    blood(p, 2, 9);
  },
  chain: (p) => {
    field(p, (_x, y) => grey(0.25 - low(y, 0.6) * 0.1, 0));
    const { ctx } = p;
    const s = 16;
    for (let row = 0; row < CELL / (s * 0.7) + 1; row++) {
      for (let col = -1; col < CELL / s + 1; col++) {
        const x = col * s + (row % 2 ? s / 2 : 0), y = row * s * 0.7;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(30,30,30,1)';
        ctx.beginPath(); ctx.ellipse(x + 1, y + 1, s * 0.42, s * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(${200 - (y / CELL) * 90},${195 - (y / CELL) * 95},${190 - (y / CELL) * 100},1)`;
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.ellipse(x, y, s * 0.42, s * 0.36, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      }
    }
    const { r } = p;
    for (let i = 0; i < 6; i++) splat(p, r.next() * CELL, 130 + r.next() * 120, 6 + r.next() * 10, 'rgba(110,55,20,0.5)', 3, 1);
  },
  blade: (p) => {
    // a hard-used blade: fuller, bright edges, deep notches, old and fresh blood toward the point
    field(p, (x, y) => {
      const fuller = Math.abs(x - CELL / 2) < 18 ? -0.18 : 0;
      const edge = Math.min(x, CELL - x) < 14 ? 0.14 : 0;
      return grey(0.86 + fuller + edge + (p.n.at(x * 0.1, y, 128) - 0.5) * 0.12, -0.01);
    });
    scratches(p, 90, 'rgba(255,255,255,0.5)', 'rgba(0,0,0,0.4)', 30);
    const { ctx, r } = p;
    ctx.fillStyle = 'rgba(20,16,14,1)';
    for (let i = 0; i < 11; i++) {
      const y = r.next() * CELL, side = r.next() < 0.5 ? 0 : CELL, d = 8 + r.next() * 14;
      ctx.beginPath(); ctx.moveTo(side, y - 6); ctx.lineTo(Math.abs(side - d), y); ctx.lineTo(side, y + 7); ctx.fill();
    }
    for (let i = 0; i < 5; i++) splat(p, r.next() * CELL, r.next() * CELL * 0.5, 8 + r.next() * 16, 'rgba(110,6,4,0.8)', 6, 3);
    for (let i = 0; i < 3; i++) splat(p, r.next() * CELL, CELL * 0.4 + r.next() * CELL * 0.5, 6 + r.next() * 10, 'rgba(50,6,3,0.7)', 4, 2);
  },
  wood: (p) => {
    field(p, (x, y) => {
      const ring = Math.sin((x / CELL) * 40 + p.n.fbm(x, y, 4) * 9) * 0.5 + 0.5;
      return grey(0.7 + ring * 0.2 + (p.n.at(x, y, 64) - 0.5) * 0.1 - low(y, 0.75) * 0.2, 0.05);
    });
    scratches(p, 14, 'rgba(255,240,210,0.22)', 'rgba(0,0,0,0.32)', 18);
    blood(p, 2, 8, true);
  },
  ember: (p) => {
    // black basalt / scorched hide split by glowing cracks (alpha < 1 = glow mask)
    field(p, (x, y) => {
      const crack = Math.max(p.n.ridge(x, y, 4, 0.03), p.n.ridge(x + 70, y + 20, 7, 0.022) * 0.8);
      const char = (p.n.fbm(x, y, 4) - 0.5) * 0.3;
      const v = 0.5 + char - low(y, 0.6) * 0.15;
      if (crack > 0.05) {
        const k = Math.min(1, crack * 1.4);
        return [v + (1.0 - v) * k, v + (0.55 - v) * k, v + (0.12 - v) * k, 1 - k * 0.85];
      }
      return [v + 0.03, v, v - 0.02];
    });
  },
  frost: (p) => {
    // pale rime: feathery frost crystals, glints that catch the light (soft glow mask)
    field(p, (x, y) => {
      const feather = p.n.ridge(x, y, 9, 0.05) * 0.15 + p.n.ridge(x + 13, y, 18, 0.05) * 0.1;
      const v = 0.86 + feather + (p.n.fbm(x, y, 4) - 0.5) * 0.15;
      const glint = p.n.at(x, y, 128) > 0.88 ? 0.5 : 0;
      return [v - 0.04, v, v + 0.06, 1 - glint];
    });
  },
  membrane: (p) => {
    // leathery wing skin: veins, darker patches, torn holes with frayed edges
    field(p, (x, y) => {
      const vein = p.n.ridge(x, y, 3, 0.03) * -0.25 + p.n.ridge(x + 40, y, 6, 0.02) * -0.12;
      const blot = (p.n.fbm(x, y, 4) - 0.5) * 0.3;
      const v = 0.8 + vein + blot;
      return [v + 0.03, v - 0.01, v - 0.03];
    });
    const { ctx, r } = p;
    for (let i = 0; i < 5; i++) {
      const x = r.next() * CELL, y = r.next() * CELL, rad = 4 + r.next() * 10;
      ctx.fillStyle = 'rgba(14,8,6,0.85)';
      ctx.beginPath(); ctx.ellipse(x, y, rad, rad * 0.6, r.next() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    scratches(p, 10, 'rgba(255,220,200,0.25)', 'rgba(30,5,0,0.45)', 30);
  },
  crystal: (p) => {
    // faceted ice / crystal: hard bright facet edges and a glowing heart (glow mask)
    field(p, (x, y) => {
      const f = Math.floor(p.n.at(x, y, 6) * 6) / 6;
      const edge = p.n.ridge(x, y, 6, 0.03) * 0.3;
      const heart = Math.max(0, 0.5 - Math.hypot(x / CELL - 0.5, y / CELL - 0.5)) * 1.6;
      const v = 0.68 + f * 0.25 + edge;
      return [v - 0.05, v + 0.02, v + 0.08, 1 - Math.min(0.7, heart * 0.6 + edge * 0.6)];
    });
  },
  stone: (p) => {
    // cracked rock hide: chips, deep cracks, lichen-ish grime
    field(p, (x, y) => {
      const crack = p.n.ridge(x, y, 4, 0.025) * -0.4 + p.n.ridge(x + 20, y + 60, 9, 0.02) * -0.2;
      const grain = (p.n.at(x, y, 96) - 0.5) * 0.14;
      const v = 0.8 + crack + grain + (p.n.fbm(x, y, 4) - 0.5) * 0.3 - low(y, 0.6) * 0.25;
      return [v + 0.02, v, v - 0.03];
    });
    scratches(p, 20, 'rgba(255,250,240,0.25)', 'rgba(0,0,0,0.4)', 18);
  },
};

let atlasTex: THREE.CanvasTexture | null = null;
/** The monster detail atlas (5 × 5 cells of 256 px, built once on first use). */
export function monsterAtlas(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas');
  c.width = c.height = CELL * MON_COLS;
  const out = c.getContext('2d')!;
  const cell = document.createElement('canvas');
  cell.width = cell.height = CELL;
  const ctx = cell.getContext('2d', { willReadFrequently: true })!;
  MON_CELLS.forEach((d, i) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, CELL, CELL);
    PAINTERS[d]({ ctx, r: new Rng(9103 + i * 7919), n: new VNoise(311 + i * 17) });
    out.drawImage(cell, (i % MON_COLS) * CELL, Math.floor(i / MON_COLS) * CELL);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  atlasTex = t;
  return t;
}

/** Where a cell sits in the atlas: [u0, v0, span] (with a small inset against bleeding). */
export function cellRect(d: MonDetail): [number, number, number] {
  const i = MON_CELLS.indexOf(d);
  const inset = 0.05 / MON_COLS;
  return [(i % MON_COLS) / MON_COLS + inset, 1 - (Math.floor(i / MON_COLS) + 1) / MON_COLS + inset, 1 / MON_COLS - 2 * inset];
}

// ------------------------------------------------------------------ the body material

/**
 * Gives a dark monster's body material the atlas and the grim shader (one program for
 * every monster; per-kind values in uniforms). The hurt flash (emissive) and the fade
 * (opacity) in CreatureView keep working; the atlas alpha only drives the glow.
 */
export function grimBody(m: Mat, g: Grim): void {
  m.map = monsterAtlas();
  const rim = new THREE.Color(g.rimColor ?? 0xffffff).multiplyScalar(g.rim ?? 0.06);
  const glow = new THREE.Color(g.glowColor ?? 0xffffff).multiplyScalar(g.glow ?? 0);
  const spec = g.spec ?? 0.05;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.gRim = { value: rim };
    sh.uniforms.gGlow = { value: glow };
    sh.uniforms.gSpec = { value: spec };
    sh.fragmentShader = 'uniform vec3 gRim;\nuniform vec3 gGlow;\nuniform float gSpec;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', 'vec4 gTex = texture2D( map, vMapUv );\ndiffuseColor.rgb *= gTex.rgb * 1.22;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 gV = normalize( vViewPosition );
  vec3 gN = normalize( normal );
  float gF = pow( 1.0 - clamp( dot( gN, gV ), 0.0, 1.0 ), 3.0 );
  vec3 gH = normalize( gV + vec3( -0.3, 0.72, 0.62 ) );
  float gS = pow( max( dot( gN, gH ), 0.0 ), 70.0 );
  totalEmissiveRadiance += gRim * gF * vColor.rgb * 2.0 + vec3( gS * gSpec ) * ( 0.15 + 0.85 * gTex.g * gTex.g );
  totalEmissiveRadiance += gTex.rgb * ( 1.0 - gTex.a ) * gGlow * 1.6;
}`);
  };
  m.customProgramCacheKey = () => 'grimMonster';
  m.needsUpdate = true;
}

import type { ItemDef } from '../game/inventory/items';
import { TELEPORT_DESTS, teleportRuneId } from '../game/magic/teleport';

/**
 * Rune icons: small flat river-stone tablets with one carved glyph whose
 * grooves glow in the spell's element colour, plus a crisp short name plate
 * so runes stay easy to tell apart at backpack / hotbar size (~32–40 px).
 * Drawn in the shared 32×32 icon space (the canvas is 64 px, so shadowBlur
 * values below are in 64-px device pixels). Original art; Gothic-style
 * stones were only the inspiration.
 */

type Ctx = CanvasRenderingContext2D;

/** Short labels so every rune can be told apart at a glance (also on the action bar). Add one for every new rune. */
export const RUNE_LABEL: Record<string, string> = {
  spark_rune: 'SPRK', fireball_rune: 'FIRE', avalanche_rune: 'AVA', stoneshower_rune: 'STON', death_rune: 'DEATH',
  healing_rune: 'MEND', blank_rune: '', thunderbolt_rune: 'BOLT', ember_rune: 'EMBR', icicle_rune: 'ICE', rockspike_rune: 'ROCK',
  stormcloud_rune: 'STRM', blast_rune: 'BLST', sunlance_rune: 'SUN', soothing_rune: 'HEAL', antidote_rune: 'CURE', snare_rune: 'SNAR',
  flame_field_rune: 'FF', static_field_rune: 'EF', venom_field_rune: 'PF', firebloom_rune: 'FB', stormbloom_rune: 'EB', venombloom_rune: 'PB',
  flame_barrier_rune: 'FW', static_barrier_rune: 'EW', venom_barrier_rune: 'PW', arcane_wall_rune: 'MW', dispel_rune: 'DISP',
  // teleport runes: the destination's short name (magic/teleport.ts)
  ...Object.fromEntries(TELEPORT_DESTS.map((d) => [teleportRuneId(d.key), d.label])),
};

interface Look {
  /** Mid tone of the stone. */
  stone: string;
  /** Glow colour of the carved grooves. */
  glow: string;
  /** Hot centre of the grooves (and the label text). */
  core: string;
  /** Deep colour of the cut itself. */
  groove: string;
}

const LOOKS: Record<string, Look> = {
  fire: { stone: '#5a4a40', glow: '#ff7a1a', core: '#ffe4a8', groove: '#2a0e04' },
  ice: { stone: '#4c5864', glow: '#5fd8ff', core: '#f0fcff', groove: '#04202e' },
  energy: { stone: '#4c4659', glow: '#b06cff', core: '#f4e8ff', groove: '#1a0634' },
  earth: { stone: '#4c5442', glow: '#62d23a', core: '#e2ffcc', groove: '#0c2204' },
  death: { stone: '#2e2832', glow: '#cdb4ec', core: '#f6efff', groove: '#060208' },
  holy: { stone: '#6e6048', glow: '#ffcf3a', core: '#fff7cc', groove: '#2e2004' },
  heal: { stone: '#686d68', glow: '#90f0a2', core: '#f6fff6', groove: '#0a2a12' },
  physical: { stone: '#5e5248', glow: '#e4a868', core: '#fff0da', groove: '#2a1606' },
  arcane: { stone: '#464c5e', glow: '#5aa0ff', core: '#e6f2ff', groove: '#04122e' },
  snare: { stone: '#48445a', glow: '#c8a8ff', core: '#f8f2ff', groove: '#140a2a' },
  dispel: { stone: '#545862', glow: '#c8d4ee', core: '#ffffff', groove: '#10141e' },
  // teleport runes: sea-green waystone light (the same colour as the teleport effect, render/fx/teleportFx.ts)
  travel: { stone: '#434c4a', glow: '#4fe0c8', core: '#effff9', groove: '#032420' },
};

function lookOf(d: ItemDef): Look {
  const r = d.rune;
  if (d.id === 'arcane_wall_rune') return LOOKS.arcane;
  if (!r) return LOOKS.physical;
  if (r.type === 'heal' || r.type === 'cure') return LOOKS.heal;
  if (r.type === 'paralyze') return LOOKS.snare;
  if (r.type === 'destroyField') return LOOKS.dispel;
  if (r.type === 'teleport') return LOOKS.travel;
  return LOOKS[r.element ?? 'physical'] ?? LOOKS.physical;
}

// ------------------------------------------------------------------ helpers

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Small deterministic generator so every rune's stone keeps the same shape. */
function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ------------------------------------------------------------------ the stone

/** Irregular rounded tablet outline (a slightly squared, chipped river stone). */
function stonePath(x: Ctx, rand: () => number): void {
  const N = 14;
  const pts: { px: number; py: number; chip: boolean }[] = [];
  const chipA = Math.floor(rand() * N);
  const chipB = (chipA + 4 + Math.floor(rand() * 5)) % N;
  const rot = rand() * 0.4;
  for (let i = 0; i < N; i++) {
    const a = rot + (i / N) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    // superellipse: a tablet rather than a pebble
    const sx = Math.sign(c) * Math.pow(Math.abs(c), 0.78);
    const sy = Math.sign(s) * Math.pow(Math.abs(s), 0.78);
    const chip = i === chipA || i === chipB;
    const k = (0.91 + rand() * 0.09) * (chip ? 0.9 : 1);
    pts.push({ px: 16 + sx * 13.8 * k, py: 16.2 + sy * 14.2 * k, chip });
  }
  const mid = (i: number) => {
    const p = pts[i % N], q = pts[(i + 1) % N];
    return [(p.px + q.px) / 2, (p.py + q.py) / 2];
  };
  x.beginPath();
  const [m0x, m0y] = mid(0);
  x.moveTo(m0x, m0y);
  for (let i = 1; i <= N; i++) {
    const p = pts[i % N];
    const [mx, my] = mid(i);
    if (p.chip) { x.lineTo(p.px, p.py); x.lineTo(mx, my); } // a flat chipped facet
    else x.quadraticCurveTo(p.px, p.py, mx, my);
  }
  x.closePath();
}

function drawStone(x: Ctx, d: ItemDef, look: Look, blank: boolean): void {
  const rand = rng(hash(d.id));
  // faint aura around the stone
  if (!blank) {
    const g = x.createRadialGradient(16, 15, 6, 16, 16, 17);
    g.addColorStop(0, rgba(look.glow, 0.45));
    g.addColorStop(1, rgba(look.glow, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
  }
  // drop shadow
  x.save();
  x.translate(0.5, 0.9);
  stonePath(x, rng(hash(d.id)));
  x.fillStyle = 'rgba(0,0,0,0.55)';
  x.fill();
  x.restore();

  stonePath(x, rand);
  x.save();
  x.clip();
  const base = x.createLinearGradient(4, 2, 26, 30);
  base.addColorStop(0, shade(look.stone, 1.32));
  base.addColorStop(0.55, look.stone);
  base.addColorStop(1, shade(look.stone, 0.55));
  x.fillStyle = base;
  x.fillRect(0, 0, 32, 32);
  // mottling
  for (let i = 0; i < 5; i++) {
    const cx = 5 + rand() * 22, cy = 5 + rand() * 22, r = 3 + rand() * 5;
    const m = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    m.addColorStop(0, i % 2 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.16)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = m;
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  // grain speckles
  for (let i = 0; i < 90; i++) {
    const light = rand() < 0.45;
    x.fillStyle = light ? `rgba(255,255,255,${0.06 + rand() * 0.12})` : `rgba(0,0,0,${0.12 + rand() * 0.22})`;
    x.fillRect(2 + rand() * 28, 2 + rand() * 28, 0.35 + rand() * 0.45, 0.35 + rand() * 0.45);
  }
  // a hairline crack or two
  x.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    let px = rand() < 0.5 ? 3 + rand() * 4 : 25 + rand() * 4, py = 4 + rand() * 24;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 3; k++) { px += (16 - px) * 0.18 + (rand() - 0.5) * 2.4; py += (rand() - 0.5) * 3.2; x.lineTo(px, py); }
    x.strokeStyle = 'rgba(0,0,0,0.35)';
    x.lineWidth = 0.4;
    x.stroke();
  }
  // soft inner glow: the magic bound inside
  if (!blank) {
    const ig = x.createRadialGradient(16, 12.5, 1, 16, 12.5, 11);
    ig.addColorStop(0, rgba(look.glow, 0.22));
    ig.addColorStop(1, rgba(look.glow, 0));
    x.fillStyle = ig;
    x.fillRect(0, 0, 32, 32);
  }
  // bevel: dark rim inside, light catch on the upper-left edge
  stonePath(x, rng(hash(d.id)));
  x.strokeStyle = 'rgba(0,0,0,0.45)';
  x.lineWidth = 2.6;
  x.stroke();
  x.save();
  x.translate(0.7, 0.8);
  stonePath(x, rng(hash(d.id)));
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,0.16)';
  x.lineWidth = 1.1;
  x.stroke();
  x.restore();
  // outline
  stonePath(x, rng(hash(d.id)));
  x.strokeStyle = '#0d0a08';
  x.lineWidth = 1.1;
  x.stroke();
}

// ------------------------------------------------------------------ glyph pieces (paths only)

const CX = 16;
const CY = 12.6;

function diamond(x: Ctx): void {
  x.moveTo(16, 3.8); x.lineTo(24.8, 12.6); x.lineTo(16, 21.4); x.lineTo(7.2, 12.6); x.closePath();
}

function ring(x: Ctx, cx: number, cy: number, r: number): void {
  x.moveTo(cx + r, cy);
  x.arc(cx, cy, r, 0, Math.PI * 2);
}

function dot(x: Ctx, cx: number, cy: number): void {
  x.moveTo(cx, cy);
  x.lineTo(cx + 0.01, cy);
}

/** A licking flame, tip up, h = half height. */
function flame(x: Ctx, cx: number, cy: number, h: number): void {
  x.moveTo(cx, cy + h * 0.75);
  x.bezierCurveTo(cx - h * 0.95, cy + h * 0.7, cx - h * 0.7, cy - h * 0.25, cx + h * 0.05, cy - h);
  x.bezierCurveTo(cx + h * 0.05, cy - h * 0.4, cx + h * 0.85, cy - h * 0.2, cx + h * 0.65, cy + h * 0.3);
  x.bezierCurveTo(cx + h * 0.55, cy + h * 0.65, cx + h * 0.3, cy + h * 0.75, cx, cy + h * 0.75);
  x.moveTo(cx - h * 0.05, cy - h * 0.05);
  x.quadraticCurveTo(cx + h * 0.4, cy + h * 0.3, cx + h * 0.05, cy + h * 0.55);
}

/** A round-bottomed drop, tip up, h = half height. */
function drop(x: Ctx, cx: number, cy: number, h: number): void {
  x.moveTo(cx, cy - h);
  x.bezierCurveTo(cx + h * 0.35, cy - h * 0.35, cx + h * 0.75, cy + h * 0.05, cx + h * 0.72, cy + h * 0.38);
  x.arc(cx, cy + h * 0.38, h * 0.72, 0, Math.PI);
  x.bezierCurveTo(cx - h * 0.75, cy + h * 0.05, cx - h * 0.35, cy - h * 0.35, cx, cy - h);
}

/** A lightning zigzag from (x0,y0) to (x1,y1). */
function zig(x: Ctx, x0: number, y0: number, x1: number, y1: number, n: number, amp: number): void {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  x.moveTo(x0, y0);
  for (let i = 1; i < n; i++) {
    const t = i / n, s = i % 2 ? amp : -amp;
    x.lineTo(x0 + dx * t + nx * s, y0 + dy * t + ny * s);
  }
  x.lineTo(x1, y1);
}

/** Runs `f` with the path builder rotated around (cx, cy); the path keeps the rotation. */
function turned(x: Ctx, cx: number, cy: number, a: number, f: () => void): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(a);
  f();
  x.restore();
}

type Mark = 'fire' | 'energy' | 'poison';

function fieldMark(d: ItemDef): Mark {
  const f = d.rune?.field;
  return f === 'energy' ? 'energy' : f === 'poison' ? 'poison' : 'fire';
}

// ------------------------------------------------------------------ one glyph per rune

const GLYPHS: Record<string, (x: Ctx, d: ItemDef) => void> = {
  // energy ---------------------------------------------------------------
  spark_rune: (x) => {
    x.moveTo(16, 4.5);
    x.quadraticCurveTo(17.2, 11.4, 23.5, 12.6);
    x.quadraticCurveTo(17.2, 13.8, 16, 20.7);
    x.quadraticCurveTo(14.8, 13.8, 8.5, 12.6);
    x.quadraticCurveTo(14.8, 11.4, 16, 4.5);
    dot(x, 21.8, 6.4); dot(x, 10.2, 18.8);
  },
  thunderbolt_rune: (x) => {
    x.moveTo(20, 3.8); x.lineTo(11, 13.4); x.lineTo(17, 13.4); x.lineTo(12, 21.2);
    x.moveTo(12, 21.2); x.lineTo(12.1, 17.4);
    x.moveTo(12, 21.2); x.lineTo(15.4, 19.2);
  },
  stormcloud_rune: (x) => {
    x.moveTo(9.5, 13.2);
    x.quadraticCurveTo(6, 9.8, 10.2, 8.4);
    x.quadraticCurveTo(11.6, 3.8, 16.6, 5.4);
    x.quadraticCurveTo(21.6, 4.2, 22.2, 8.8);
    x.quadraticCurveTo(26, 10.6, 22.8, 13.2);
    x.closePath();
    x.moveTo(13.4, 15.2); x.lineTo(11.6, 17.8); x.lineTo(13.8, 17.8); x.lineTo(12, 20.8);
    x.moveTo(19.6, 15.2); x.lineTo(17.8, 17.8); x.lineTo(20, 17.8); x.lineTo(18.2, 20.8);
  },
  // fire -----------------------------------------------------------------
  ember_rune: (x) => {
    flame(x, 15.6, 13.6, 7.2);
    dot(x, 9.2, 7.2); dot(x, 22.6, 6.6); dot(x, 23.4, 16.2);
  },
  fireball_rune: (x) => {
    ring(x, CX, CY, 6.2);
    flame(x, 15.8, 13.2, 4.2);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      x.moveTo(CX + Math.cos(a) * 7.6, CY + Math.sin(a) * 7.6);
      x.lineTo(CX + Math.cos(a) * 9.8, CY + Math.sin(a) * 9.6);
    }
  },
  // ice ------------------------------------------------------------------
  icicle_rune: (x) => {
    x.moveTo(8.5, 4.6); x.lineTo(23.5, 4.6);
    x.moveTo(11.8, 4.6); x.lineTo(16, 21.4); x.lineTo(20.2, 4.6);
    x.moveTo(16, 7.4); x.lineTo(16, 14.6);
    x.moveTo(9.6, 4.6); x.lineTo(10.4, 9.4);
    x.moveTo(22.4, 4.6); x.lineTo(21.6, 9.4);
  },
  avalanche_rune: (x) => {
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 3;
      const c = Math.cos(a), s = Math.sin(a);
      x.moveTo(CX - c * 8.6, CY - s * 8.6); x.lineTo(CX + c * 8.6, CY + s * 8.6);
      for (const k of [1, -1]) {
        const bx = CX + c * 5.2 * k, by = CY + s * 5.2 * k;
        for (const t of [0.75, -0.75]) {
          const b = a + (k < 0 ? Math.PI : 0) + t;
          x.moveTo(bx, by); x.lineTo(bx + Math.cos(b) * 2.8, by + Math.sin(b) * 2.8);
        }
      }
    }
  },
  // earth ----------------------------------------------------------------
  rockspike_rune: (x) => {
    x.moveTo(6.8, 20.6); x.lineTo(25.2, 20.6);
    x.moveTo(8.4, 20.6); x.lineTo(11.4, 10.6); x.lineTo(13.6, 20.6);
    x.moveTo(12.8, 20.6); x.lineTo(16, 4.2); x.lineTo(19.2, 20.6);
    x.moveTo(18.4, 20.6); x.lineTo(20.8, 12); x.lineTo(23.8, 20.6);
  },
  stoneshower_rune: (x) => {
    x.moveTo(7, 6.4); x.quadraticCurveTo(16, 1.6, 25, 6.4);
    for (const [sx, sy] of [[10.6, 13], [16.4, 18.2], [21.6, 12.2]]) {
      x.moveTo(sx, sy - 2.4); x.lineTo(sx + 2.2, sy); x.lineTo(sx, sy + 2.4); x.lineTo(sx - 2.2, sy); x.closePath();
      x.moveTo(sx - 1.2, sy - 3.6); x.lineTo(sx - 2.6, sy - 6.4);
    }
  },
  // death ----------------------------------------------------------------
  death_rune: (x) => {
    x.moveTo(10.2, 14.6);
    x.quadraticCurveTo(8.6, 4.6, 16, 4.4);
    x.quadraticCurveTo(23.4, 4.6, 21.8, 14.6);
    x.lineTo(20, 16); x.lineTo(20, 20.4); x.lineTo(12, 20.4); x.lineTo(12, 16); x.closePath();
    ring(x, 13.3, 11.2, 1.7);
    ring(x, 18.7, 11.2, 1.7);
    x.moveTo(16, 13.6); x.lineTo(15.1, 15.2); x.lineTo(16.9, 15.2); x.closePath();
    x.moveTo(14.6, 17.4); x.lineTo(14.6, 20.4);
    x.moveTo(17.4, 17.4); x.lineTo(17.4, 20.4);
  },
  // holy -----------------------------------------------------------------
  sunlance_rune: (x) => {
    x.moveTo(16, 21.4); x.lineTo(16, 4.2);
    x.moveTo(13.4, 8.4); x.lineTo(16, 3.8); x.lineTo(18.6, 8.4);
    ring(x, 16, 13.4, 3.6);
    x.moveTo(8.6, 13.4); x.lineTo(10.6, 13.4);
    x.moveTo(21.4, 13.4); x.lineTo(23.4, 13.4);
    x.moveTo(10.6, 8.6); x.lineTo(11.8, 9.8);
    x.moveTo(21.4, 8.6); x.lineTo(20.2, 9.8);
  },
  // physical -------------------------------------------------------------
  blast_rune: (x) => {
    const radii = [9, 3.4, 7.2, 3.4, 8.4, 3.4, 6.8, 3.4, 8.8, 3.4, 7, 3.4, 8.2, 3.4, 6.6, 3.4];
    for (let i = 0; i < radii.length; i++) {
      const a = -Math.PI / 2 + (i / radii.length) * Math.PI * 2;
      const px = CX + Math.cos(a) * radii[i], py = CY + Math.sin(a) * radii[i] * 0.95;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath();
  },
  // healing --------------------------------------------------------------
  healing_rune: (x) => {
    ring(x, CX, CY, 8.2);
    x.moveTo(16, 7); x.lineTo(16, 18.2);
    x.moveTo(10.4, 12.6); x.lineTo(21.6, 12.6);
  },
  soothing_rune: (x) => {
    x.moveTo(16, 4.4); x.lineTo(16, 20.8);
    x.moveTo(7.8, 12.6); x.lineTo(24.2, 12.6);
    dot(x, 11.2, 7.8); dot(x, 20.8, 7.8); dot(x, 11.2, 17.4); dot(x, 20.8, 17.4);
  },
  antidote_rune: (x) => {
    x.moveTo(16, 4); x.lineTo(16, 21.4);
    x.moveTo(13.6, 6); x.lineTo(18.4, 6);
    x.moveTo(20, 7.6);
    x.bezierCurveTo(10.6, 8.2, 21.6, 13.2, 12.6, 14.6);
    x.bezierCurveTo(9.6, 15.2, 13.6, 19.6, 19.6, 18.4);
  },
  // control --------------------------------------------------------------
  snare_rune: (x) => {
    const turns = 2.4, steps = 64;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = t * turns * Math.PI * 2, r = 0.6 + t * 8;
      const px = CX + Math.cos(a) * r, py = CY + Math.sin(a) * r * 0.98;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
  },
  dispel_rune: (x) => {
    x.moveTo(CX + 7.6 * Math.cos(-0.55), CY + 7.6 * Math.sin(-0.55));
    x.arc(CX, CY, 7.6, -0.55, Math.PI - 0.95);
    x.moveTo(CX + 7.6 * Math.cos(Math.PI - 0.55), CY + 7.6 * Math.sin(Math.PI - 0.55));
    x.arc(CX, CY, 7.6, Math.PI - 0.55, Math.PI * 2 - 0.95);
    x.moveTo(10.2, 18.6); x.lineTo(21.8, 6.6);
  },
  arcane_wall_rune: (x) => {
    x.moveTo(8.4, 4.8); x.lineTo(23.6, 4.8); x.lineTo(23.6, 20.6); x.lineTo(8.4, 20.6); x.closePath();
    x.moveTo(8.4, 10.1); x.lineTo(23.6, 10.1);
    x.moveTo(8.4, 15.3); x.lineTo(23.6, 15.3);
    x.moveTo(16, 4.8); x.lineTo(16, 10.1);
    x.moveTo(12.2, 10.1); x.lineTo(12.2, 15.3);
    x.moveTo(19.8, 10.1); x.lineTo(19.8, 15.3);
    x.moveTo(16, 15.3); x.lineTo(16, 20.6);
  },
};

/** Ground fields: one diamond (a single tile) with the element's mark inside. */
function fieldGlyph(x: Ctx, m: Mark): void {
  diamond(x);
  if (m === 'fire') flame(x, 15.8, 13.4, 5.2);
  else if (m === 'energy') { x.moveTo(17.6, 7.4); x.lineTo(14, 13); x.lineTo(18, 13); x.lineTo(14.4, 18.2); }
  else drop(x, 16, 12.4, 5);
}

/** Blooms (3×3 bombs): a hub with four element arms. */
function bloomGlyph(x: Ctx, m: Mark): void {
  ring(x, CX, CY, 2.2);
  for (let i = 0; i < 4; i++) {
    turned(x, CX, CY, (i * Math.PI) / 2, () => {
      if (m === 'fire') flame(x, 0, -6.2, 3.1);
      else if (m === 'energy') zig(x, 0, -3.2, 0, -9, 3, 1.5);
      else drop(x, 0, -6.6, 2.9);
    });
  }
}

/** Barriers (walls): three uprights on a ground line, styled by element. */
function barrierGlyph(x: Ctx, m: Mark): void {
  x.moveTo(6.8, 20.8); x.lineTo(25.2, 20.8);
  for (const bx of [10, 16, 22]) {
    if (m === 'fire') flame(x, bx, 13.6, 5.6);
    else if (m === 'energy') zig(x, bx, 20.8, bx, 4.6, 4, 1.4);
  }
  if (m === 'poison') {
    x.moveTo(6.8, 4.8); x.lineTo(25.2, 4.8);
    for (const bx of [10, 16, 22]) {
      x.moveTo(bx, 4.8); x.lineTo(bx, 9.4);
      turned(x, bx, 14.4, Math.PI, () => drop(x, 0, 0, 3.6));
    }
  }
}

function buildGlyph(x: Ctx, d: ItemDef): boolean {
  const own = GLYPHS[d.id];
  x.beginPath();
  if (own) { own(x, d); return true; }
  const r = d.rune;
  if (!r) return false;
  if (r.type === 'teleport') {
    waystoneGlyph(x);
    return true;
  }
  if (r.type === 'field') {
    const m = fieldMark(d);
    if (r.shape === 'bomb') bloomGlyph(x, m);
    else if (r.shape === 'wall') barrierGlyph(x, m);
    else fieldGlyph(x, m);
    return true;
  }
  // fallback for a future rune without its own glyph: an element mark
  if (r.element === 'fire') flame(x, 16, 13.4, 7);
  else if (r.element === 'energy') zig(x, 19, 4.4, 13, 20.8, 4, 2);
  else if (r.element === 'earth') drop(x, 16, 12.4, 7);
  else ring(x, CX, CY, 7);
  return true;
}

/** Teleport runes: a gate ring open at the top, a spiral drawing inward and a rising chevron. */
function waystoneGlyph(x: Ctx): void {
  // the ring, broken at the top where the traveller leaves
  x.moveTo(CX + Math.cos(-Math.PI / 2 + 0.55) * 7.6, CY + Math.sin(-Math.PI / 2 + 0.55) * 7.6);
  x.arc(CX, CY, 7.6, -Math.PI / 2 + 0.55, -Math.PI / 2 - 0.55 + Math.PI * 2);
  // spiral (1.4 turns) toward the centre
  const turns = 1.4, steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = Math.PI / 2 + t * turns * Math.PI * 2;
    const r = 5 * (1 - t) + 0.6;
    const px = CX + Math.cos(a) * r, py = CY + Math.sin(a) * r;
    if (i === 0) x.moveTo(px, py);
    else x.lineTo(px, py);
  }
  // chevron rising out of the gap
  x.moveTo(CX - 2.6, CY - 6.4);
  x.lineTo(CX, CY - 9);
  x.lineTo(CX + 2.6, CY - 6.4);
}

/** Strokes the current glyph path as a glowing carved groove. */
function carve(x: Ctx, look: Look, rebuild: () => void): void {
  x.lineCap = 'round';
  x.lineJoin = 'round';
  // the cut's shadow edge
  x.save();
  x.translate(0.35, 0.5);
  rebuild();
  x.restore();
  x.strokeStyle = 'rgba(0,0,0,0.7)';
  x.lineWidth = 3.4;
  x.stroke();
  rebuild();
  x.strokeStyle = look.groove;
  x.lineWidth = 2.9;
  x.stroke();
  // glow pouring out of the groove
  x.save();
  x.shadowColor = look.glow;
  x.shadowBlur = 9;
  x.strokeStyle = look.glow;
  x.lineWidth = 1.9;
  x.stroke();
  x.shadowBlur = 4;
  x.stroke();
  x.restore();
  // hot centre
  x.strokeStyle = look.core;
  x.lineWidth = 0.8;
  x.stroke();
}

function drawLabel(x: Ctx, label: string, look: Look): void {
  const size = label.length > 4 ? 5.7 : label.length > 2 ? 6.8 : 7.6;
  x.font = `900 ${size}px Verdana, sans-serif`;
  const w = Math.min(24, x.measureText(label).width + 4.2);
  const lx = 16 - w / 2;
  // a dark recessed plate cut into the stone
  x.fillStyle = 'rgba(8,6,4,0.86)';
  x.fillRect(lx, 22.6, w, 6.6);
  x.fillStyle = rgba(look.glow, 0.55);
  x.fillRect(lx, 28.8, w, 0.45);
  x.fillStyle = 'rgba(255,255,255,0.12)';
  x.fillRect(lx, 22.6, w, 0.4);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.save();
  x.shadowColor = look.glow;
  x.shadowBlur = 3;
  x.fillStyle = look.core;
  x.fillText(label, 16, 26.05);
  x.restore();
  x.fillStyle = look.core;
  x.fillText(label, 16, 26.05);
}

/** Paints a rune (or the blank rune) as a carved, glowing stone tablet. */
export function drawRuneStone(x: Ctx, d: ItemDef): void {
  const blank = d.id === 'blank_rune';
  const look = blank ? { stone: '#6e665c', glow: '#a09888', core: '#d8d0c0', groove: '#2a241e' } : lookOf(d);
  drawStone(x, d, look, blank);
  if (blank) {
    // uncarved: only faint guide scratches where a glyph will go
    x.beginPath();
    x.moveTo(10, 9); x.lineTo(22, 9);
    x.moveTo(11, 16); x.lineTo(21, 16.6);
    x.moveTo(16, 6); x.lineTo(15.6, 20);
    x.strokeStyle = 'rgba(0,0,0,0.28)';
    x.lineWidth = 0.7;
    x.stroke();
    x.save();
    x.translate(0.4, 0.5);
    x.beginPath();
    x.moveTo(10, 9); x.lineTo(22, 9);
    x.moveTo(11, 16); x.lineTo(21, 16.6);
    x.moveTo(16, 6); x.lineTo(15.6, 20);
    x.restore();
    x.strokeStyle = 'rgba(255,255,255,0.1)';
    x.lineWidth = 0.5;
    x.stroke();
    return;
  }
  if (buildGlyph(x, d)) carve(x, look, () => buildGlyph(x, d));
  const label = RUNE_LABEL[d.id] ?? d.name.slice(0, 4).toUpperCase();
  if (label) drawLabel(x, label, look);
}

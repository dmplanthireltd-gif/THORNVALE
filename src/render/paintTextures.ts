import * as THREE from 'three';
import { Rng } from '../game/core/rng';
import { Ground } from '../game/world/WorldMap';

/**
 * Painted style (render/style.ts): high-resolution, hand-painted-looking ground
 * textures, drawn once at load on canvases (layered noise, grass blades, pebbles,
 * cracks, cobbles, marble veins…). Everything is original and generated in code.
 *
 * All kinds sit in one 4 × 4 atlas (CELL px each); one cell covers SPAN × SPAN
 * tiles, so a tile gets CELL / SPAN texels. The ground shader (paintGround.ts)
 * samples it in world space, so there is no tile grid in the pattern.
 */
export const CELL = 256;
export const SPAN = 2;
export const ATLAS_COLS = 4;

/** Atlas cell of each painted ground kind (kinds not listed keep the classic look). */
export const PAINT_CELL: Partial<Record<Ground, number>> = {
  [Ground.Grass]: 0, [Ground.DarkGrass]: 1, [Ground.Jungle]: 2, [Ground.Dirt]: 3, [Ground.Path]: 4, [Ground.Stone]: 5,
  [Ground.Marble]: 6, [Ground.Cave]: 7, [Ground.Sand]: 8, [Ground.Swamp]: 9, [Ground.Ash]: 10, [Ground.Crop]: 11,
  [Ground.Wood]: 12, [Ground.Seabed]: 13, [Ground.Snow]: 14, [Ground.Ice]: 15,
};

/**
 * Which ground spills over which at a border (higher spills into lower), like the
 * classic hand-made border tiles: grass creeps over paths and dirt, everything over
 * bare cave floor. Built floors (stone, marble, wood) take only a thin fringe.
 */
export const PAINT_PRIORITY: Partial<Record<Ground, number>> = {
  [Ground.Marble]: 1, [Ground.Wood]: 1, [Ground.Stone]: 2, [Ground.Cave]: 3, [Ground.Crop]: 4, [Ground.Dirt]: 5, [Ground.Ash]: 5,
  [Ground.Path]: 6, [Ground.Seabed]: 6, [Ground.Sand]: 7, [Ground.Swamp]: 8, [Ground.Grass]: 9, [Ground.DarkGrass]: 10,
  [Ground.Jungle]: 10, [Ground.Ice]: 11, [Ground.Snow]: 12,
};
/** Built floors: laid on a grid (no anti-tiling mix, so slabs and planks stay square), and only a thin fringe spills onto them. */
export const PAINT_BUILT = new Set<Ground>([Ground.Stone, Ground.Marble, Ground.Wood, Ground.Crop]);

// ------------------------------------------------------------------ tileable noise

class Noise {
  private v = new Float32Array(256 * 256);
  constructor(seed: number) {
    const r = new Rng(seed);
    for (let i = 0; i < this.v.length; i++) this.v[i] = r.next();
  }
  /** Value noise with period `p` lattice cells (tiles seamlessly). */
  at(x: number, y: number, p: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const m = (a: number) => ((a % p) + p) % p;
    const x0 = m(ix), x1 = m(ix + 1), y0 = m(iy), y1 = m(iy + 1);
    const g = (a: number, b: number) => this.v[(b & 255) * 256 + (a & 255)];
    const a = g(x0, y0) + (g(x1, y0) - g(x0, y0)) * fx;
    const b = g(x0, y1) + (g(x1, y1) - g(x0, y1)) * fx;
    return a + (b - a) * fy;
  }
  /** Fractal noise over a CELL-px canvas; `f` = lattice cells across the canvas at the first octave. */
  fbm(px: number, py: number, f: number, oct = 4): number {
    let s = 0, w = 0.5, tot = 0;
    for (let o = 0; o < oct; o++) {
      const ff = f << o;
      s += this.at((px / CELL) * ff, (py / CELL) * ff, ff) * w;
      tot += w;
      w *= 0.5;
    }
    return s / tot;
  }
}

type RGB = [number, number, number];
const hex = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

interface Paint {
  ctx: CanvasRenderingContext2D;
  rng: Rng;
  n: Noise;
}

/** Per-pixel base: colour from a function of the pixel (runs once per texel). */
function base(p: Paint, fn: (x: number, y: number) => RGB): void {
  const img = p.ctx.createImageData(CELL, CELL);
  const d = img.data;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const c = fn(x, y);
    const i = (y * CELL + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  p.ctx.putImageData(img, 0, 0);
}

/** Draws a shape at its spot and wrapped across the edges, so the cell tiles. */
function wrapped(_p: Paint, x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
  for (const ox of [-CELL, 0, CELL]) for (const oy of [-CELL, 0, CELL]) {
    const xx = x + ox, yy = y + oy;
    if (xx + r < 0 || yy + r < 0 || xx - r > CELL || yy - r > CELL) continue;
    draw(xx, yy);
  }
}

/** Small rounded stones lit from the upper left, with a soft contact shadow. */
function pebbles(p: Paint, count: number, cols: RGB[], rMin: number, rMax: number): void {
  const { ctx, rng } = p;
  for (let i = 0; i < count; i++) {
    const x = rng.next() * CELL, y = rng.next() * CELL;
    const r = rMin + rng.next() * (rMax - rMin);
    const sq = 0.6 + rng.next() * 0.4;
    const rot = rng.next() * Math.PI;
    const c = cols[rng.int(0, cols.length - 1)];
    wrapped(p, x, y, r * 2, (xx, yy) => {
      ctx.save();
      ctx.translate(xx, yy);
      ctx.rotate(rot);
      // contact shadow
      ctx.fillStyle = 'rgba(20,14,8,0.35)';
      ctx.beginPath(); ctx.ellipse(r * 0.25, r * 0.3, r * 1.1, r * sq * 1.1, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35 * sq, r * 0.1, 0, 0, r * 1.05);
      g.addColorStop(0, css(mixC(c, [255, 250, 235], 0.35)));
      g.addColorStop(0.55, css(c));
      g.addColorStop(1, css(mixC(c, [20, 14, 8], 0.45)));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * sq, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }
}

/** Thin dark cracks as wandering lines, with a light lip on one side. */
function cracks(p: Paint, count: number, col: RGB, len: number, alpha = 0.55): void {
  const { ctx, rng } = p;
  for (let i = 0; i < count; i++) {
    const pts: Array<[number, number]> = [];
    let x = rng.next() * CELL, y = rng.next() * CELL, a = rng.next() * Math.PI * 2;
    const steps = 4 + rng.int(0, 6);
    for (let k = 0; k < steps; k++) {
      pts.push([x, y]);
      a += (rng.next() - 0.5) * 1.3;
      const l = len * (0.5 + rng.next());
      x += Math.cos(a) * l; y += Math.sin(a) * l;
    }
    pts.push([x, y]);
    const w = 0.8 + rng.next() * 0.9;
    wrapped(p, pts[0][0], pts[0][1], len * steps * 1.5, (xx, yy) => {
      const dx = xx - pts[0][0], dy = yy - pts[0][1];
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(255,245,225,${alpha * 0.25})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(px + dx + 0.8, py + dy + 0.8) : ctx.moveTo(px + dx + 0.8, py + dy + 0.8)));
      ctx.stroke();
      ctx.strokeStyle = css(col, alpha);
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)));
      ctx.stroke();
    });
  }
}

/** Short curved grass blades seen from above. */
function blades(p: Paint, count: number, light: RGB, dark: RGB, len: number): void {
  const { ctx, rng } = p;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rng.next() * CELL, y = rng.next() * CELL;
    // blades lean mostly "up" the screen (away from the camera), a little to either side
    const a = -Math.PI / 2 + (rng.next() - 0.5) * 1.6;
    const l = len * (0.5 + rng.next() * 0.8);
    const bend = (rng.next() - 0.5) * l * 0.6;
    const isLight = rng.next() < 0.55;
    const c = isLight ? light : dark;
    const al = 0.45 + rng.next() * 0.45;
    const w = 0.7 + rng.next() * 0.9;
    wrapped(p, x, y, l + 2, (xx, yy) => {
      const ex = xx + Math.cos(a) * l, ey = yy + Math.sin(a) * l;
      ctx.strokeStyle = css(c, al);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.quadraticCurveTo((xx + ex) / 2 + bend, (yy + ey) / 2, ex, ey);
      ctx.stroke();
    });
  }
}

function dots(p: Paint, count: number, cols: RGB[], rMin: number, rMax: number, alpha = 1): void {
  const { ctx, rng } = p;
  for (let i = 0; i < count; i++) {
    const x = rng.next() * CELL, y = rng.next() * CELL, r = rMin + rng.next() * (rMax - rMin);
    const c = cols[rng.int(0, cols.length - 1)];
    wrapped(p, x, y, r, (xx, yy) => {
      ctx.fillStyle = css(c, alpha);
      ctx.beginPath(); ctx.arc(xx, yy, r, 0, Math.PI * 2); ctx.fill();
    });
  }
}

/** Soft blotches (damp patches, moss, darker earth) blended with low alpha. */
function blotches(p: Paint, count: number, col: RGB, rMin: number, rMax: number, alpha: number): void {
  const { ctx, rng } = p;
  for (let i = 0; i < count; i++) {
    const x = rng.next() * CELL, y = rng.next() * CELL, r = rMin + rng.next() * (rMax - rMin);
    wrapped(p, x, y, r, (xx, yy) => {
      const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, r);
      g.addColorStop(0, css(col, alpha));
      g.addColorStop(1, css(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(xx, yy, r, 0, Math.PI * 2); ctx.fill();
    });
  }
}

/** Two-tone earth/grass base with large soft patches and fine grain. */
function earthy(p: Paint, a: number, b: number, c: number, grain = 10): void {
  const A = hex(a), B = hex(b), C = hex(c);
  base(p, (x, y) => {
    const n1 = p.n.fbm(x, y, 4, 5);
    const n2 = p.n.fbm(x + 77, y + 31, 8, 3);
    let col = mixC(A, B, sstep(0.3, 0.7, n1));
    col = mixC(col, C, sstep(0.55, 0.8, n2) * 0.7);
    const gr = (p.n.at(x * 0.5, y * 0.5, 128) - 0.5) * grain + (p.rng.next() - 0.5) * grain * 0.6;
    return [col[0] + gr, col[1] + gr, col[2] + gr * 0.8];
  });
}

// ------------------------------------------------------------------ the kinds

const PAINTERS: Array<(p: Paint) => void> = [];

// 0 grass
PAINTERS[0] = (p) => {
  earthy(p, 0x4a7f2b, 0x5d9334, 0x3e6c25, 12);
  blotches(p, 10, hex(0x86b04a), 14, 34, 0.18);
  blotches(p, 8, hex(0x2f5a1e), 12, 30, 0.2);
  blades(p, 2600, hex(0x8cc256), hex(0x2e5a1c), 7);
  dots(p, 18, [hex(0xf2efe0), hex(0xf0d860), hex(0xd8b8f0)], 0.9, 1.6);
  dots(p, 40, [hex(0x6a9a3c)], 1.2, 2.2, 0.6);
};
// 1 dark grass
PAINTERS[1] = (p) => {
  earthy(p, 0x44772a, 0x548a30, 0x386424, 12);
  blotches(p, 8, hex(0x22421a), 12, 30, 0.25);
  blades(p, 2800, hex(0x6f9e43), hex(0x22421a), 7);
  dots(p, 8, [hex(0xe8e0c8)], 0.8, 1.3);
};
// 2 jungle
PAINTERS[2] = (p) => {
  earthy(p, 0x3a7428, 0x4c8a30, 0x2c5a1c, 12);
  blotches(p, 6, hex(0x5a4428), 10, 22, 0.3);
  blades(p, 3000, hex(0x7cba48), hex(0x24501a), 9);
  dots(p, 20, [hex(0x2c5a1c)], 2, 4, 0.5);
};
// 3 dirt
PAINTERS[3] = (p) => {
  earthy(p, 0x6a4e32, 0x7c5c3b, 0x56402a, 14);
  blotches(p, 10, hex(0x4a3420), 10, 28, 0.3);
  blotches(p, 6, hex(0x9a7a52), 10, 24, 0.18);
  cracks(p, 7, hex(0x3a2818), 9, 0.5);
  pebbles(p, 55, [hex(0x8a7660), hex(0x7a6650), hex(0x9a8a72), hex(0x6a5a4a)], 1.4, 4.2);
  dots(p, 220, [hex(0x4a3422), hex(0x9a8060)], 0.5, 1.1, 0.7);
};
// 4 path (packed road)
PAINTERS[4] = (p) => {
  earthy(p, 0x9a7b52, 0xab8c60, 0x86683f, 12);
  // faint wheel ruts along the road (both directions blur together)
  blotches(p, 12, hex(0x7a5c38), 8, 20, 0.22);
  blotches(p, 8, hex(0xc4a87c), 10, 26, 0.2);
  cracks(p, 4, hex(0x5a4228), 8, 0.4);
  pebbles(p, 70, [hex(0xb0a088), hex(0x9a8a72), hex(0xc4b498), hex(0x8a7a64)], 1.2, 3.6);
  dots(p, 260, [hex(0x6a5034), hex(0xc8b08a)], 0.5, 1.0, 0.7);
};
// 5 cobbles
PAINTERS[5] = (p) => {
  const { rng } = p;
  const G = 7; // stones across the cell
  const pts: Array<[number, number, RGB]> = [];
  const tones = [0x8f8a80, 0x9a948a, 0x847e75, 0xa39c90, 0x8a8378, 0x968c7c].map(hex);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    pts.push([(i + 0.2 + rng.next() * 0.6) * (CELL / G), (j + 0.2 + rng.next() * 0.6) * (CELL / G), tones[rng.int(0, tones.length - 1)]]);
  }
  const mortar = hex(0x3e3a34);
  const L = [-0.62, -0.78];
  base(p, (x, y) => {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let k = 0; k < pts.length; k++) {
      let dx = x - pts[k][0], dy = y - pts[k][1];
      dx -= Math.round(dx / CELL) * CELL; dy -= Math.round(dy / CELL) * CELL;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
    }
    const e = Math.sqrt(d2) - Math.sqrt(d1);
    const pt = pts[best];
    let dx = x - pt[0], dy = y - pt[1];
    dx -= Math.round(dx / CELL) * CELL; dy -= Math.round(dy / CELL) * CELL;
    const r = Math.sqrt(dx * dx + dy * dy) + 0.001;
    const n = p.n.fbm(x, y, 16, 3);
    if (e < 2.6) {
      const t = sstep(0.6, 2.6, e);
      return mixC(mixC(mortar, [70, 64, 56], n), mixC(pt[2], [0, 0, 0], 0.4), t * 0.6);
    }
    // a gently domed stone, lit from the upper left
    const dome = sstep(2.6, 11, e);
    const lit = (dx / r) * L[0] + (dy / r) * L[1];
    let c = mixC(pt[2], [0, 0, 0], 0.32 * (1 - dome));
    c = mixC(c, lit > 0 ? [250, 244, 228] : [30, 26, 22], Math.abs(lit) * 0.22 * (1 - dome * 0.6));
    const gr = (n - 0.5) * 34 + (rng.next() - 0.5) * 6;
    return [c[0] + gr, c[1] + gr, c[2] + gr * 0.9];
  });
  cracks(p, 6, hex(0x2e2a26), 5, 0.45);
  blotches(p, 6, hex(0x56603a), 8, 18, 0.18);
};
// 6 marble slabs, one per tile, with veins and a little gold inlay at the corners
PAINTERS[6] = (p) => {
  const T = CELL / SPAN;
  const A = hex(0xe2dccf), B = hex(0xd0c9ba), V = hex(0x9e968a);
  base(p, (x, y) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    const lx = x - tx * T, ly = y - ty * T;
    const n = p.n.fbm(x, y, 4, 5);
    const alt = (tx + ty) % 2 === 0;
    let c = mixC(alt ? A : B, alt ? B : A, n * 0.5);
    const v = Math.abs(Math.sin((x * 0.6 + y * 0.35) * 0.05 + p.n.fbm(x + 40, y + 9, 4, 5) * 9 + tx * 1.7));
    c = mixC(c, V, (1 - sstep(0.0, 0.07, v)) * 0.55);
    const v2 = Math.abs(Math.sin((y * 0.7 - x * 0.2) * 0.07 + p.n.fbm(x + 3, y + 70, 8, 4) * 7));
    c = mixC(c, V, (1 - sstep(0.0, 0.04, v2)) * 0.3);
    // seams: a dark groove with a light lip
    const edge = Math.min(lx, ly, T - 1 - lx, T - 1 - ly);
    if (edge < 1.5) c = mixC(c, [120, 112, 100], 0.7);
    else if (edge < 3) c = mixC(c, [250, 248, 240], 0.35);
    // polish: a soft sheen across each slab
    const sheen = Math.max(0, 1 - Math.hypot(lx - T * 0.3, ly - T * 0.3) / (T * 0.9));
    c = mixC(c, [255, 255, 250], sheen * 0.12);
    const gr = (p.rng.next() - 0.5) * 5;
    return [c[0] + gr, c[1] + gr, c[2] + gr];
  });
  const { ctx } = p;
  // gold diamonds where four slabs meet
  for (let j = 0; j <= SPAN; j++) for (let i = 0; i <= SPAN; i++) {
    const cx = i * T, cy = j * T, r = 9;
    wrapped(p, cx, cy, r, (xx, yy) => {
      ctx.fillStyle = 'rgba(176,132,48,0.9)';
      ctx.beginPath(); ctx.moveTo(xx, yy - r); ctx.lineTo(xx + r, yy); ctx.lineTo(xx, yy + r); ctx.lineTo(xx - r, yy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(236,200,110,0.95)';
      ctx.beginPath(); ctx.moveTo(xx, yy - r + 3); ctx.lineTo(xx + r - 3, yy); ctx.lineTo(xx, yy + r - 3); ctx.lineTo(xx - r + 3, yy); ctx.closePath(); ctx.fill();
    });
  }
};
// 7 cave floor
PAINTERS[7] = (p) => {
  earthy(p, 0x4c443b, 0x5a5047, 0x3c352e, 14);
  blotches(p, 10, hex(0x2c2620), 10, 30, 0.35);
  blotches(p, 5, hex(0x6a6052), 10, 22, 0.2);
  cracks(p, 10, hex(0x221c16), 8, 0.6);
  pebbles(p, 60, [hex(0x6a6258), hex(0x5a524a), hex(0x7a7064), hex(0x4a443e)], 1.5, 5);
  dots(p, 300, [hex(0x2a241e), hex(0x7a7064)], 0.5, 1.2, 0.7);
};
// 8 sand
PAINTERS[8] = (p) => {
  earthy(p, 0xd2ba84, 0xdcc794, 0xc2a874, 8);
  const { ctx, rng } = p;
  for (let i = 0; i < 26; i++) {
    const y = rng.next() * CELL, x = rng.next() * CELL, l = 20 + rng.next() * 40;
    wrapped(p, x, y, l, (xx, yy) => {
      ctx.strokeStyle = 'rgba(160,130,80,0.25)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.bezierCurveTo(xx + l * 0.3, yy - 3, xx + l * 0.6, yy + 3, xx + l, yy); ctx.stroke();
      ctx.strokeStyle = 'rgba(250,236,200,0.3)';
      ctx.beginPath(); ctx.moveTo(xx, yy - 1.5); ctx.bezierCurveTo(xx + l * 0.3, yy - 4.5, xx + l * 0.6, yy + 1.5, xx + l, yy - 1.5); ctx.stroke();
    });
  }
  pebbles(p, 14, [hex(0xb8a080), hex(0xe8dcc0)], 1, 2.4);
  dots(p, 300, [hex(0xa88e60), hex(0xf0e2bc)], 0.4, 0.9, 0.7);
};
// 9 swamp
PAINTERS[9] = (p) => {
  earthy(p, 0x4a5a2e, 0x586a36, 0x3a4826, 12);
  blotches(p, 10, hex(0x2a4038), 10, 26, 0.5);
  blades(p, 1200, hex(0x8aa05a), hex(0x2c3a1e), 8);
};
// 10 ash
PAINTERS[10] = (p) => {
  earthy(p, 0x4a4340, 0x56504b, 0x3a3432, 12);
  cracks(p, 8, hex(0x1e1a18), 8, 0.6);
  dots(p, 40, [hex(0xa3401c), hex(0x6a2a14)], 0.6, 1.4, 0.8);
  pebbles(p, 30, [hex(0x3a3634), hex(0x5a5450)], 1.4, 3.5);
};
// 11 crop field (furrows along the tile rows)
PAINTERS[11] = (p) => {
  earthy(p, 0x5c432a, 0x6a4e31, 0x4a3522, 12);
  const { ctx } = p;
  const step = CELL / (SPAN * 4);
  for (let y = step / 2; y < CELL; y += step) {
    ctx.fillStyle = 'rgba(40,28,16,0.45)'; ctx.fillRect(0, y, CELL, 4);
    ctx.fillStyle = 'rgba(150,118,80,0.25)'; ctx.fillRect(0, y - 3, CELL, 2);
  }
  pebbles(p, 20, [hex(0x8a7660)], 1, 2.5);
};
// 12 wood planks (4 per tile)
PAINTERS[12] = (p) => {
  const T = CELL / SPAN, ph = T / 4;
  const tones = [0x7d5833, 0x87613a, 0x73502e, 0x805a35].map(hex);
  const seams: number[] = [];
  for (let r = 0; r < SPAN * 4; r++) seams.push(p.rng.next() * CELL);
  base(p, (x, y) => {
    const row = Math.floor(y / ph), ly = y - row * ph;
    const c0 = tones[(row * 7 + (x > seams[row] ? 1 : 0)) % tones.length];
    const grain = Math.sin(y * 0.9 + p.n.fbm(x, y, 2, 3) * 18) * 0.5 + 0.5;
    let c = mixC(c0, [60, 40, 22], grain * 0.25);
    if (ly < 1.5) c = mixC(c, [40, 26, 14], 0.8);
    else if (ly < 3) c = mixC(c, [170, 130, 85], 0.3);
    if (Math.abs(x - seams[row]) < 1.2) c = mixC(c, [40, 26, 14], 0.8);
    return c;
  });
};
// 13 sea bed
PAINTERS[13] = (p) => {
  earthy(p, 0xb8ab84, 0xc4b890, 0xa89a74, 8);
  blotches(p, 6, hex(0x5a6a3a), 6, 14, 0.3);
  pebbles(p, 20, [hex(0xefe8d8), hex(0xa89a74)], 1, 2.5);
};
// 14 snow
PAINTERS[14] = (p) => {
  earthy(p, 0xe8eef4, 0xf6f9fb, 0xd2dce8, 6);
  blotches(p, 12, hex(0xb8c8dc), 10, 26, 0.25);
  dots(p, 120, [hex(0xffffff)], 0.5, 1.2, 0.8);
};
// 15 ice
PAINTERS[15] = (p) => {
  earthy(p, 0xb4dcee, 0xc8e6f4, 0x9ccae2, 6);
  cracks(p, 10, hex(0xf2faff), 10, 0.7);
  cracks(p, 5, hex(0x6aa0c4), 8, 0.35);
};

let atlas: THREE.CanvasTexture | null = null;
/** The painted ground atlas (built on first use, about a quarter second). */
export function paintedAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = c.height = CELL * ATLAS_COLS;
  const out = c.getContext('2d')!;
  const cell = document.createElement('canvas');
  cell.width = cell.height = CELL;
  const ctx = cell.getContext('2d', { willReadFrequently: true })!;
  PAINTERS.forEach((paint, i) => {
    ctx.clearRect(0, 0, CELL, CELL);
    paint({ ctx, rng: new Rng(1009 + i * 7919), n: new Noise(31 + i * 17) });
    out.drawImage(cell, (i % ATLAS_COLS) * CELL, Math.floor(i / ATLAS_COLS) * CELL);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  atlas = t;
  return t;
}

let noiseTex: THREE.DataTexture | null = null;
/** A small tiling noise texture: R = broad, G = medium, B = fine (borders and colour variation). */
export function paintNoise(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const S = 128;
  const d = new Uint8Array(S * S * 4);
  const n = new Noise(4242);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const fx = (x / S) * CELL, fy = (y / S) * CELL;
    d[i] = n.fbm(fx, fy, 4, 4) * 255;
    d[i + 1] = n.fbm(fx + 50, fy + 20, 8, 3) * 255;
    d[i + 2] = n.fbm(fx + 9, fy + 90, 16, 2) * 255;
    d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  noiseTex = t;
  return t;
}

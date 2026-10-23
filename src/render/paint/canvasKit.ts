import { Rng } from '../../game/core/rng';

/**
 * Small painting kit for the painted style's canvas textures (render/paint/*):
 * tileable value noise, per-pixel fills and a few brush helpers (cracks, blotches,
 * specks, moss) that wrap around the canvas edges so every texture tiles.
 * Everything is original and generated in code.
 */
export type RGB = [number, number, number];
export const hex = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Tileable value noise over an S-px canvas. */
export class Noise {
  private v = new Float32Array(256 * 256);
  constructor(seed: number, readonly S: number) {
    const r = new Rng(seed);
    for (let i = 0; i < this.v.length; i++) this.v[i] = r.next();
  }
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
  /** Fractal noise; `f` lattice cells across the canvas at the first octave. */
  fbm(px: number, py: number, f: number, oct = 4): number {
    let s = 0, w = 0.5, tot = 0;
    for (let o = 0; o < oct; o++) {
      const ff = f << o;
      s += this.at((px / this.S) * ff, (py / this.S) * ff, ff) * w;
      tot += w;
      w *= 0.5;
    }
    return s / tot;
  }
}

export interface Paint {
  ctx: CanvasRenderingContext2D;
  rng: Rng;
  n: Noise;
  S: number;
}

/** Fills every pixel from `fn` (fast: one ImageData). */
export function fill(p: Paint, fn: (x: number, y: number) => RGB): void {
  const { S } = p;
  const img = p.ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = fn(x, y);
    const i = (y * S + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  p.ctx.putImageData(img, 0, 0);
}

/** Runs `draw` at (x, y) and at its wrapped copies near the edges. */
export function wrapped(p: Paint, x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
  const { S } = p;
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
    const xx = x + ox, yy = y + oy;
    if (xx + r < 0 || yy + r < 0 || xx - r > S || yy - r > S) continue;
    draw(xx, yy);
  }
}

export function cracks(p: Paint, count: number, col: RGB, len: number, alpha = 0.55, width = 1.1): void {
  const { ctx, rng, S } = p;
  for (let i = 0; i < count; i++) {
    const x0 = rng.next() * S, y0 = rng.next() * S;
    let a = rng.next() * Math.PI * 2;
    const pts: Array<[number, number]> = [[0, 0]];
    let x = 0, y = 0;
    for (let k = 0; k < len; k++) {
      a += (rng.next() - 0.5) * 1.1;
      const st = 3 + rng.next() * 5;
      x += Math.cos(a) * st; y += Math.sin(a) * st;
      pts.push([x, y]);
    }
    wrapped(p, x0, y0, len * 8, (xx, yy) => {
      ctx.strokeStyle = css(col, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(xx + px, yy + py) : ctx.moveTo(xx + px, yy + py)));
      ctx.stroke();
      // a light lip on one side of the crack
      ctx.strokeStyle = css([255, 250, 235], alpha * 0.22);
      ctx.lineWidth = width * 0.8;
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(xx + px + 1, yy + py + 1) : ctx.moveTo(xx + px + 1, yy + py + 1)));
      ctx.stroke();
    });
  }
}

export function blotches(p: Paint, count: number, col: RGB, rMin: number, rMax: number, alpha: number): void {
  const { ctx, rng, S } = p;
  for (let i = 0; i < count; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = rMin + rng.next() * (rMax - rMin);
    wrapped(p, x, y, r, (xx, yy) => {
      const g = ctx.createRadialGradient(xx, yy, 0, xx, yy, r);
      g.addColorStop(0, css(col, alpha));
      g.addColorStop(1, css(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(xx, yy, r, 0, Math.PI * 2); ctx.fill();
    });
  }
}

export function dots(p: Paint, count: number, cols: RGB[], rMin: number, rMax: number, alpha = 1): void {
  const { ctx, rng, S } = p;
  for (let i = 0; i < count; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = rMin + rng.next() * (rMax - rMin);
    const c = cols[rng.int(0, cols.length - 1)];
    wrapped(p, x, y, r, (xx, yy) => {
      ctx.fillStyle = css(c, alpha);
      ctx.beginPath(); ctx.arc(xx, yy, r, 0, Math.PI * 2); ctx.fill();
    });
  }
}

/** Moss / lichen creeping in patches (mostly along the bottom when `low`). */
export function moss(p: Paint, count: number, low: boolean, cols: RGB[] = [hex(0x4a5e2a), hex(0x5e7234), hex(0x3a4a22)]): void {
  const { ctx, rng, S } = p;
  for (let i = 0; i < count; i++) {
    const cx = rng.next() * S;
    const cy = low ? S * (0.75 + rng.next() * 0.3) : rng.next() * S;
    const r = 6 + rng.next() * 14;
    for (let k = 0; k < 26; k++) {
      const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * r;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7;
      const rr = 0.8 + rng.next() * 2.2;
      const c = cols[rng.int(0, cols.length - 1)];
      wrapped(p, x, y, rr, (xx, yy) => {
        ctx.fillStyle = css(c, 0.55 + rng.next() * 0.35);
        ctx.beginPath(); ctx.arc(xx, yy, rr, 0, Math.PI * 2); ctx.fill();
      });
    }
  }
}

/** Vertical streaks of grime / soot running down from the top (or rain stains). */
export function streaks(p: Paint, count: number, col: RGB, alpha: number, fromTop = true): void {
  const { ctx, rng, S } = p;
  for (let i = 0; i < count; i++) {
    const x = rng.next() * S, w = 2 + rng.next() * 7, l = S * (0.2 + rng.next() * 0.5);
    wrapped(p, x, 0, w, (xx) => {
      const y0 = fromTop ? 0 : S - l;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + l);
      g.addColorStop(fromTop ? 0 : 1, css(col, alpha));
      g.addColorStop(fromTop ? 1 : 0, css(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(xx - w / 2, y0, w, l);
    });
  }
}

import * as THREE from 'three';
import { Rng } from '../../game/core/rng';
import { blotches, clamp01, cracks, dots, fill, hex, mix, moss, Noise, sstep, streaks, wrapped, css, type Paint, type RGB } from './canvasKit';

/**
 * Painted style (render/style.ts): ONE hand-painted atlas for the whole built world
 * — house walls of every kind, roofs, timber, doors, windows, furniture woods, iron,
 * sacking, straw, grave stone and soil, cloth, bone, parchment — and a few neutral
 * "detail" cells that only add wear to vertex-coloured models (plaza, depot halls).
 *
 * Every cell is a 256 px tile that wraps seamlessly, stored with a 16 px wrapped
 * gutter so mip levels never bleed into the neighbour. Meshes carry the cell in a
 * vertex attribute `aCell` and tile UVs in world units; one material
 * (`builtMaterial`) draws them all, so a whole map chunk of walls, fences and props
 * is a single draw call. Everything is original and generated in code.
 */
export enum Cell {
  Brick = 0, Fieldstone, Plaster, Sandstone, Logs, Elven, Dwarven, Marble,
  RoofTile, Thatch, Slate, Shingle, Plank, Beam, Crate, Staves,
  Iron, Burlap, Straw, Gravestone, Earth, Cloth, Window, Steps,
  Bark, Door, Plain, Bone, Leather, Butcher, Moss, Paper,
  DWood, DStone, DMetal, DCloth, DPlant, DGold, Soot, Blood,
}

const S = 256;
const PAD = 16;
const SLOT = S + PAD * 2;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 5;
export const ATLAS_W = SLOT * ATLAS_COLS;
export const ATLAS_H = SLOT * ATLAS_ROWS;

const h2 = (a: number, b: number, k = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

type Painter = (p: Paint) => void;
const P: Painter[] = [];

/** Rows of blocks (bricks, ashlar, basalt): per-pixel block shading, chipped edges, grain. */
function blocks(p: Paint, rows: number, cols: (row: number) => number[], tones: RGB[], mortar: RGB, mw: number, bevel: number, grainAmt: number, seed: number): void {
  const rh = S / rows;
  const layout: number[][] = [];
  for (let r = 0; r < rows; r++) layout.push(cols(r));
  fill(p, (x, y) => {
    const row = Math.floor(y / rh), ly = y - row * rh;
    const L = layout[row];
    let x0 = 0, ci = 0;
    // the row's joints, offset per row and wrapping
    const off = L[L.length - 1];
    let xx = (x + off) % S;
    for (ci = 0; ci < L.length - 1; ci++) { if (xx < x0 + L[ci]) break; x0 += L[ci]; }
    const w = L[Math.min(ci, L.length - 2)];
    const lx = xx - x0;
    const n = p.n.fbm(x, y, 8, 4);
    const edgeN = (p.n.fbm(x + 99, y + 7, 16, 2) - 0.5) * mw * 1.6;
    const e = Math.min(lx, w - lx, ly, rh - ly) + edgeN;
    const h = h2(ci + seed, row, 3);
    const base = tones[Math.floor(h * tones.length)];
    if (e < mw) return mix(mortar, [mortar[0] * 0.6, mortar[1] * 0.6, mortar[2] * 0.6], clamp01(1 - e / mw) * 0.6 + n * 0.3);
    let c = mix(base, [base[0] * 0.78, base[1] * 0.76, base[2] * 0.74], n * 1.2 - 0.2);
    // bevel: light top/left lip, dark bottom/right
    const t = clamp01((e - mw) / bevel);
    if (t < 1) {
      const lit = (ly < rh / 2 ? 1 : -1) * 0.5 + (lx < w / 2 ? 0.3 : -0.3);
      c = mix(c, lit > 0 ? [255, 246, 228] : [24, 20, 16], (1 - t) * Math.abs(lit) * 0.35);
    }
    const g = (p.rng.next() - 0.5) * grainAmt + (h2(x, y, 9) - 0.5) * grainAmt * 0.5;
    // each block a touch darker at the bottom (dirt settles)
    const k = 1 - (ly / rh) * 0.08;
    return [c[0] * k + g, c[1] * k + g, c[2] * k + g];
  });
}

/** Voronoi stones (fieldstone walls). */
function stones(p: Paint, G: number, tones: RGB[], mortar: RGB, moss_: number): void {
  const { rng } = p;
  const pts: Array<[number, number, RGB]> = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    pts.push([(i + 0.15 + rng.next() * 0.7) * (S / G), (j + 0.2 + rng.next() * 0.6) * (S / G), tones[rng.int(0, tones.length - 1)]]);
  }
  fill(p, (x, y) => {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let k = 0; k < pts.length; k++) {
      let dx = x - pts[k][0], dy = (y - pts[k][1]) * 1.35;
      dx -= Math.round(dx / S) * S; dy -= Math.round(dy / (S * 1.35)) * S * 1.35;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
    }
    const e = Math.sqrt(d2) - Math.sqrt(d1);
    const n = p.n.fbm(x, y, 8, 4);
    if (e < 3.2) return mix(mortar, [20, 18, 16], clamp01(1 - e / 3.2) * 0.7 + n * 0.2);
    const pt = pts[best];
    let dx = x - pt[0], dy = y - pt[1];
    dx -= Math.round(dx / S) * S; dy -= Math.round(dy / S) * S;
    const r = Math.hypot(dx, dy) + 0.001;
    const dome = sstep(3, 14, e);
    const lit = (-dx / r) * 0.6 + (-dy / r) * 0.8;
    let c = mix(pt[2], [pt[2][0] * 0.7, pt[2][1] * 0.7, pt[2][2] * 0.7], n);
    c = mix(c, lit > 0 ? [250, 244, 230] : [20, 18, 14], Math.abs(lit) * 0.28 * (1 - dome * 0.7));
    const g = (p.rng.next() - 0.5) * 10;
    return [c[0] + g, c[1] + g, c[2] + g];
  });
  if (moss_) moss(p, moss_, true);
}

/** Strands of straw / thatch / grass running mostly along `angle`. */
function strands(p: Paint, count: number, cols: RGB[], len: number, angle: number, spread: number, width = 1.1, alpha = 0.85): void {
  const { ctx, rng } = p;
  for (let i = 0; i < count; i++) {
    const x = rng.next() * S, y = rng.next() * S;
    const a = angle + (rng.next() - 0.5) * spread;
    const l = len * (0.5 + rng.next());
    const c = cols[rng.int(0, cols.length - 1)];
    const bend = (rng.next() - 0.5) * l * 0.25;
    wrapped(p, x, y, l, (xx, yy) => {
      ctx.strokeStyle = css(c, alpha);
      ctx.lineWidth = width * (0.6 + rng.next() * 0.8);
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.quadraticCurveTo(xx + Math.cos(a) * l * 0.5 - Math.sin(a) * bend, yy + Math.sin(a) * l * 0.5 + Math.cos(a) * bend, xx + Math.cos(a) * l, yy + Math.sin(a) * l);
      ctx.stroke();
    });
  }
}

/** Wood with grain along x (`vertical` = along y), in planks of `pw` px. */
function wood(p: Paint, pw: number, tones: RGB[], vertical: boolean, gap: RGB, knots = 3, nails = false, wear = 0.15): void {
  const n = S / pw;
  const seams: number[] = [];
  for (let r = 0; r < n; r++) seams.push(p.rng.next() * S);
  fill(p, (x0, y0) => {
    const x = vertical ? y0 : x0, y = vertical ? x0 : y0;
    const row = Math.floor(y / pw), ly = y - row * pw;
    const c0 = tones[(row * 3 + (x > seams[row] ? 1 : 0)) % tones.length];
    const warp = p.n.fbm(vertical ? y : x, vertical ? x : y, 4, 3) * 26;
    const grain = Math.sin(ly * 0.55 + warp + row * 2.1) * 0.5 + 0.5;
    const fine = Math.sin(ly * 2.3 + warp * 2.6) * 0.5 + 0.5;
    let c = mix(c0, [c0[0] * 0.62, c0[1] * 0.58, c0[2] * 0.55], grain * 0.38 + fine * 0.12);
    const dirt = p.n.fbm(x0 + 40, y0 + 13, 6, 3);
    c = mix(c, [40, 30, 20], sstep(0.55, 0.85, dirt) * 0.35);
    if (ly < 1.6 || Math.abs(x - seams[row]) < 1.4) c = mix(c, gap, 0.85);
    else if (ly < 3.5) c = mix(c, [230, 200, 160], wear);
    else if (ly > pw - 3) c = mix(c, [20, 14, 8], 0.3);
    const g = (p.rng.next() - 0.5) * 8;
    return [c[0] + g, c[1] + g, c[2] + g];
  });
  const { ctx, rng } = p;
  for (let i = 0; i < knots * n; i++) {
    const row = rng.int(0, n - 1);
    const along = rng.next() * S, across = row * pw + pw * (0.3 + rng.next() * 0.4);
    const x = vertical ? across : along, y = vertical ? along : across;
    const r = 2 + rng.next() * 3;
    wrapped(p, x, y, r * 3, (xx, yy) => {
      ctx.fillStyle = 'rgba(40,24,12,0.75)';
      ctx.beginPath(); ctx.ellipse(xx, yy, vertical ? r : r * 1.8, vertical ? r * 1.8 : r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(60,36,18,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(xx, yy, (vertical ? r : r * 1.8) * 1.8, (vertical ? r * 1.8 : r) * 1.8, 0, 0, Math.PI * 2); ctx.stroke();
    });
  }
  if (nails) {
    for (let r = 0; r < n; r++) for (const s of [seams[r] - 7, seams[r] + 7]) {
      const across = r * pw + pw / 2;
      const x = vertical ? across : (s + S) % S, y = vertical ? (s + S) % S : across;
      wrapped(p, x, y, 3, (xx, yy) => {
        ctx.fillStyle = 'rgba(30,26,24,0.9)'; ctx.beginPath(); ctx.arc(xx, yy, 2.2, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(150,90,50,0.6)'; ctx.beginPath(); ctx.arc(xx + 1.4, yy + 1.6, 2.6, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(190,180,170,0.6)'; ctx.beginPath(); ctx.arc(xx - 0.6, yy - 0.6, 0.9, 0, 7); ctx.fill();
      });
    }
  }
}

/** Overlapping roof units (tiles, slates, shingles): per row a list of widths, painted top to bottom so each row overlaps the one above. */
function roofRows(p: Paint, rows: number, widths: (row: number) => number[], draw: (x: number, y: number, w: number, h: number, row: number, k: number) => void): void {
  const rh = S / rows;
  // bottom row first: each higher course laps over the one below, like a real roof
  for (let row = rows; row >= -1; row--) {
    const W = widths(((row % rows) + rows) % rows);
    let x = -(h2(row, 5) * 40);
    let k = 0;
    while (x < S + 40) {
      const w = W[k % W.length];
      wrapped(p, x, row * rh, w + rh, (xx, yy) => draw(xx, yy, w, rh * 1.3, ((row % rows) + rows) % rows, k));
      x += w;
      k++;
    }
  }
}

// ------------------------------------------------------------------ walls

P[Cell.Brick] = (p) => {
  blocks(p, 8, (r) => [64, 64, 64, 64, r % 2 ? 32 : 0], [hex(0x9a4a32), hex(0x8a4030), hex(0xa85a3c), hex(0x7a3a2a), hex(0x94523a), hex(0x6e3a2c)], hex(0x8a8274), 2.8, 5, 14, 1);
  // broken and missing bricks, soot from the top, mould at the foot
  const { ctx, rng } = p;
  for (let i = 0; i < 5; i++) {
    const row = rng.int(0, 7), col = rng.int(0, 3);
    const x = col * 64 + (row % 2 ? 32 : 0) + 4, y = row * 32 + 4;
    wrapped(p, x, y, 70, (xx, yy) => {
      ctx.fillStyle = 'rgba(34,24,20,0.82)';
      ctx.beginPath();
      ctx.moveTo(xx + rng.next() * 10, yy); ctx.lineTo(xx + 30 + rng.next() * 26, yy + rng.next() * 6);
      ctx.lineTo(xx + 56, yy + 10 + rng.next() * 14); ctx.lineTo(xx + 20 + rng.next() * 20, yy + 24); ctx.lineTo(xx, yy + 12 + rng.next() * 10);
      ctx.closePath(); ctx.fill();
    });
  }
  cracks(p, 6, hex(0x2a1c16), 7, 0.5);
  streaks(p, 10, hex(0x241a14), 0.22);
  blotches(p, 6, hex(0x3a3024), 14, 30, 0.22);
  moss(p, 5, true);
};

P[Cell.Fieldstone] = (p) => {
  stones(p, 6, [hex(0x8a857a), hex(0x7a756c), hex(0x968e80), hex(0x6e6a62), hex(0x8e8676), hex(0x7e7466)], hex(0x4a443c), 7);
  cracks(p, 5, hex(0x2a2622), 6, 0.45);
  streaks(p, 8, hex(0x2a2620), 0.18);
};

P[Cell.Plaster] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 4, 5), m = p.n.fbm(x + 77, y + 31, 16, 2);
    let c = mix(hex(0xe6ddc8), hex(0xcfc3a8), n);
    c = mix(c, hex(0xb8ab90), sstep(0.5, 0.9, m) * 0.3);
    // dirt rising from the ground (bottom of the canvas)
    c = mix(c, hex(0x7a6a54), sstep(0.55, 1, y / S) * 0.35 * (0.6 + n));
    const g = (p.rng.next() - 0.5) * 6;
    return [c[0] + g, c[1] + g, c[2] + g];
  });
  // plaster fallen away: bare brick and lath showing through
  const { ctx, rng } = p;
  for (let i = 0; i < 3; i++) {
    const cx = rng.next() * S, cy = rng.next() * S, rx = 14 + rng.next() * 22, ry = 10 + rng.next() * 14;
    wrapped(p, cx, cy, rx + 4, (xx, yy) => {
      ctx.save();
      ctx.beginPath();
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, rr = 0.7 + rng.next() * 0.45;
        const px = xx + Math.cos(a) * rx * rr, py = yy + Math.sin(a) * ry * rr;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#6a5a4a';
      ctx.fill();
      ctx.clip();
      for (let by = yy - ry - 8; by < yy + ry + 8; by += 9) for (let bx = xx - rx - 16 + ((by / 9) % 2) * 8; bx < xx + rx + 16; bx += 17) {
        ctx.fillStyle = `rgb(${130 + rng.int(-20, 20)},${70 + rng.int(-10, 10)},${50 + rng.int(-10, 10)})`;
        ctx.fillRect(bx, by, 15, 7);
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(250,244,230,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }
  cracks(p, 9, hex(0x5a4a3a), 8, 0.5, 1);
  streaks(p, 12, hex(0x5a4a36), 0.18);
  blotches(p, 8, hex(0x8a7a52), 10, 26, 0.16);
  moss(p, 4, true);
};

P[Cell.Sandstone] = (p) => {
  blocks(p, 4, (r) => [128, 96, 32, r % 2 ? 64 : 10], [hex(0xd8b878), hex(0xceac6a), hex(0xe2c48a), hex(0xc8a464), hex(0xd4b072)], hex(0xa88a58), 2.5, 9, 10, 4);
  const { ctx, rng } = p;
  // wind-worn pits and soft erosion bands
  for (let i = 0; i < 160; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 0.6 + rng.next() * 2;
    wrapped(p, x, y, r, (xx, yy) => { ctx.fillStyle = 'rgba(120,88,48,0.5)'; ctx.beginPath(); ctx.arc(xx, yy, r, 0, 7); ctx.fill(); });
  }
  blotches(p, 10, hex(0xf2dca8), 12, 28, 0.25);
  streaks(p, 6, hex(0x8a6a3a), 0.15);
  cracks(p, 4, hex(0x7a5a30), 6, 0.4);
};

P[Cell.Logs] = (p) => {
  const LH = S / 4;
  fill(p, (x, y) => {
    const row = Math.floor(y / LH), ly = (y - row * LH) / LH;
    const r = Math.sin(ly * Math.PI);
    const n = p.n.fbm(x, y, 6, 4);
    const bark = Math.sin(x * 0.09 + p.n.fbm(x, y, 3, 3) * 8 + row) * 0.5 + 0.5;
    let c = mix(hex(0x4a3420), hex(0x8a6a48), r * 0.85 + n * 0.25);
    c = mix(c, hex(0x2e2014), (1 - r) * 0.6);
    c = mix(c, hex(0x5a4430), bark * 0.25);
    // the gaps between logs: dark chinking with moss
    if (ly < 0.06 || ly > 0.94) c = mix(hex(0x2a2418), hex(0x4a5a2a), p.n.fbm(x + 30, y, 16, 2));
    const g = (p.rng.next() - 0.5) * 10;
    return [c[0] + g, c[1] + g, c[2] + g];
  });
  const { ctx, rng } = p;
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const row = rng.int(0, 3), y = row * LH + LH * (0.25 + rng.next() * 0.5), x = rng.next() * S, l = 20 + rng.next() * 50;
    wrapped(p, x, y, l, (xx, yy) => {
      ctx.strokeStyle = 'rgba(26,16,8,0.55)';
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.bezierCurveTo(xx + l * 0.3, yy + 1.5, xx + l * 0.6, yy - 1.5, xx + l, yy); ctx.stroke();
    });
  }
  moss(p, 5, false);
};

P[Cell.Elven] = (p) => {
  wood(p, 32, [hex(0xb8b09a), hex(0xa8a28c), hex(0xc4bca4), hex(0x9e9a86)], true, hex(0x4a4a3a), 1, false, 0.1);
  // carved vines: flowing curves cut into the boards, with leaves
  const { ctx } = p;
  for (let v = 0; v < 3; v++) {
    const x0 = 30 + v * 85;
    for (const [off, col, w] of [[1.5, 'rgba(40,44,30,0.6)', 3], [0, 'rgba(230,236,210,0.55)', 1.6]] as const) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath();
      for (let y = -10; y <= S + 10; y += 4) {
        const x = x0 + Math.sin(y * 0.045 + v) * 16 + off;
        if (y === -10) ctx.moveTo(x, y + off); else ctx.lineTo(x, y + off);
      }
      ctx.stroke();
    }
    for (let y = 8; y < S; y += 28) {
      const x = x0 + Math.sin(y * 0.045 + v) * 16, side = (y / 28) % 2 ? 1 : -1;
      ctx.fillStyle = 'rgba(70,96,52,0.55)';
      ctx.beginPath(); ctx.ellipse(x + side * 9, y + 3, 7, 3, side * 0.6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(220,230,190,0.35)';
      ctx.beginPath(); ctx.ellipse(x + side * 8, y + 2, 5, 1.5, side * 0.6, 0, 7); ctx.fill();
    }
  }
  moss(p, 6, true, [hex(0x5a7a3a), hex(0x6e8e44), hex(0x48662e)]);
  streaks(p, 6, hex(0x3a4030), 0.15);
};

P[Cell.Dwarven] = (p) => {
  blocks(p, 2, (r) => [128, 128, r ? 64 : 0], [hex(0x4e4a46), hex(0x46423e), hex(0x55504a), hex(0x3e3a36)], hex(0x1e1c1a), 3.5, 7, 12, 7);
  const { ctx, rng } = p;
  // chisel marks
  for (let i = 0; i < 220; i++) {
    const x = rng.next() * S, y = rng.next() * S, l = 3 + rng.next() * 6, a = 0.6 + (rng.next() - 0.5) * 0.4;
    wrapped(p, x, y, l, (xx, yy) => {
      ctx.strokeStyle = 'rgba(20,18,16,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + Math.cos(a) * l, yy + Math.sin(a) * l); ctx.stroke();
      ctx.strokeStyle = 'rgba(140,130,120,0.25)';
      ctx.beginPath(); ctx.moveTo(xx + 1, yy + 1); ctx.lineTo(xx + 1 + Math.cos(a) * l, yy + 1 + Math.sin(a) * l); ctx.stroke();
    });
  }
  // a carved rune band across the upper blocks
  const by = 40;
  ctx.fillStyle = 'rgba(20,18,16,0.5)';
  ctx.fillRect(0, by - 14, S, 3); ctx.fillRect(0, by + 12, S, 3);
  for (let gx = 6; gx < S; gx += 21) {
    const segs = 2 + rng.int(0, 2);
    for (let s = 0; s < segs; s++) {
      const x1 = gx + rng.int(0, 10), y1 = by - 9 + rng.int(0, 8), x2 = gx + rng.int(0, 12), y2 = by - 2 + rng.int(0, 10);
      ctx.strokeStyle = 'rgba(10,8,6,0.7)'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,140,70,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1 + 0.8, y1 + 0.8); ctx.lineTo(x2 + 0.8, y2 + 0.8); ctx.stroke();
    }
  }
  streaks(p, 10, hex(0x0e0c0a), 0.3);
  cracks(p, 5, hex(0x0e0c0a), 7, 0.6);
};

P[Cell.Marble] = (p) => {
  blocks(p, 4, (r) => [128, 128, r % 2 ? 64 : 0], [hex(0xe8e2d6), hex(0xdcd6c8), hex(0xf0ebe0), hex(0xd2ccbe)], hex(0x9a9286), 1.8, 4, 6, 9);
  const { ctx, rng } = p;
  for (let i = 0; i < 7; i++) {
    let x = rng.next() * S, y = rng.next() * S;
    ctx.strokeStyle = `rgba(110,104,96,${0.25 + rng.next() * 0.25})`;
    ctx.lineWidth = 0.6 + rng.next() * 1.2;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 14; k++) { x += 6 + rng.next() * 10; y += (rng.next() - 0.45) * 14; ctx.lineTo(x % (S + 20), y); }
    ctx.stroke();
  }
  streaks(p, 8, hex(0x6a6258), 0.16);
  blotches(p, 6, hex(0x9a9078), 10, 24, 0.14);
  cracks(p, 3, hex(0x5a5248), 6, 0.35);
};

// ------------------------------------------------------------------ roofs (rows run along u, the slope runs down the canvas)

P[Cell.RoofTile] = (p) => {
  const { ctx, rng } = p;
  ctx.fillStyle = '#4a2a1c';
  ctx.fillRect(0, 0, S, S);
  roofRows(p, 5, () => [42, 44, 40, 46, 42, 42], (x, y, w, h, row, k) => {
    const broken = h2(row, k, 3) < 0.018;
    if (broken) return; // a missing tile: dark battens show
    const tone = [hex(0x8a4a30), hex(0x7a4028), hex(0x94563a), hex(0x6e3a26), hex(0x845034), hex(0x5e3a2a)][Math.floor(h2(row, k, 1) * 6)];
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, css(mix(tone, [0, 0, 0], 0.22)));
    g.addColorStop(0.35, css(mix(tone, [255, 230, 200], 0.08)));
    g.addColorStop(0.7, css(tone));
    g.addColorStop(1, css(mix(tone, [0, 0, 0], 0.25)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + 1, y);
    ctx.lineTo(x + w - 1, y);
    ctx.lineTo(x + w - 1, y + h * 0.75);
    ctx.quadraticCurveTo(x + w / 2, y + h + 3, x + 1, y + h * 0.75);
    ctx.closePath();
    ctx.fill();
    // the lower lip casts a shadow on the row below; grime in the lower half
    const sh = ctx.createLinearGradient(0, y + h * 0.6, 0, y + h);
    sh.addColorStop(0, 'rgba(30,18,12,0)'); sh.addColorStop(1, 'rgba(30,18,12,0.6)');
    ctx.fillStyle = sh;
    ctx.fill();
    if (h2(row, k, 7) < 0.12) { ctx.strokeStyle = 'rgba(30,16,10,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + 4); ctx.lineTo(x + w * 0.55, y + h * 0.5); ctx.lineTo(x + w * 0.45, y + h * 0.85); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,240,220,0.08)';
    ctx.fillRect(x + w * 0.28, y + 3, 3, h * 0.55);
  });
  moss(p, 7, false, [hex(0x5a6a2e), hex(0x6a7a36), hex(0x8a8a4a)]);
  dots(p, 60, [hex(0xc8c090), hex(0xa8a070)], 0.8, 2, 0.5);
  void rng;
};

P[Cell.Thatch] = (p) => {
  const { ctx } = p;
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 6, 4);
    const band = (y % 51) / 51;
    let c = mix(hex(0x7a6638), hex(0x9a8048), n);
    c = mix(c, hex(0x3a2e1a), sstep(0.7, 1, band) * 0.6);
    return c;
  });
  strands(p, 3200, [hex(0xb89a5a), hex(0x9a7e44), hex(0x7a6232), hex(0xc8aa68), hex(0x6a5a3a)], 22, Math.PI / 2, 0.35, 1.2, 0.8);
  // bundle edges every row: a darker, ragged line of cut ends
  for (let r = 0; r < 5; r++) {
    const y = r * 51.2 + 46;
    for (let x = 0; x < S; x += 2) {
      ctx.fillStyle = `rgba(40,30,16,${0.3 + p.rng.next() * 0.4})`;
      ctx.fillRect(x, y + p.rng.next() * 4, 2, 2 + p.rng.next() * 4);
    }
  }
  blotches(p, 10, hex(0x4a4a2a), 14, 30, 0.3);
  moss(p, 6, false, [hex(0x4a5a26), hex(0x5a6a2e)]);
  blotches(p, 6, hex(0x2a2418), 10, 24, 0.3);
};

P[Cell.Slate] = (p) => {
  const { ctx } = p;
  ctx.fillStyle = '#16181c';
  ctx.fillRect(0, 0, S, S);
  roofRows(p, 5, (r) => (r % 2 ? [38, 52, 44, 60, 46] : [56, 40, 48, 36, 58]), (x, y, w, h, row, k) => {
    const v = 0.85 + h2(row, k, 2) * 0.3;
    const tone = mix(hex(0x4a5260), hex(0x5a5e66), h2(row, k, 5));
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, css([tone[0] * v * 0.7, tone[1] * v * 0.7, tone[2] * v * 0.7]));
    g.addColorStop(0.5, css([tone[0] * v, tone[1] * v, tone[2] * v]));
    g.addColorStop(1, css([tone[0] * v * 0.75, tone[1] * v * 0.75, tone[2] * v * 0.75]));
    ctx.fillStyle = g;
    ctx.beginPath();
    const chip = h2(row, k, 9) < 0.3 ? 6 : 0;
    ctx.moveTo(x + 1, y); ctx.lineTo(x + w - 1, y); ctx.lineTo(x + w - 1, y + h - chip); ctx.lineTo(x + w - 1 - chip, y + h); ctx.lineTo(x + 1, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,210,220,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 2, y + h - 1); ctx.lineTo(x + w - 2, y + h - 1); ctx.stroke();
  });
  dots(p, 120, [hex(0xb8b88a), hex(0x9a9a7a), hex(0xd0d0b0)], 0.8, 2.6, 0.55);
  moss(p, 4, false, [hex(0x5a6a3a), hex(0x6a7a44)]);
  streaks(p, 8, hex(0x0a0c10), 0.25);
};

P[Cell.Shingle] = (p) => {
  const { ctx, rng } = p;
  ctx.fillStyle = '#1e1610';
  ctx.fillRect(0, 0, S, S);
  roofRows(p, 5, (r) => [26 + (r * 7) % 14, 34, 22, 40, 30, 28, 36], (x, y, w, h, row, k) => {
    const tone = mix(hex(0x7a6a56), hex(0x5e5040), h2(row, k, 4));
    ctx.fillStyle = css(tone);
    ctx.fillRect(x + 1, y, w - 2, h);
    // grain and splits
    for (let i = 0; i < 5; i++) {
      const gx = x + 3 + rng.next() * (w - 6);
      ctx.strokeStyle = `rgba(30,22,14,${0.25 + rng.next() * 0.3})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + (rng.next() - 0.5) * 3, y + h); ctx.stroke();
    }
    const sh = ctx.createLinearGradient(0, y, 0, y + h);
    sh.addColorStop(0, 'rgba(10,8,6,0.5)'); sh.addColorStop(0.3, 'rgba(10,8,6,0)'); sh.addColorStop(0.9, 'rgba(10,8,6,0)'); sh.addColorStop(1, 'rgba(10,8,6,0.5)');
    ctx.fillStyle = sh;
    ctx.fillRect(x + 1, y, w - 2, h);
  });
  moss(p, 8, false, [hex(0x4a5a2a), hex(0x5e6e34), hex(0x3a4824)]);
  blotches(p, 8, hex(0x9a9a8a), 10, 22, 0.15);
};

// ------------------------------------------------------------------ wood, metal, stuff

P[Cell.Plank] = (p) => {
  wood(p, 64, [hex(0x8a6038), hex(0x7a5430), hex(0x946a40), hex(0x72502e)], false, hex(0x22160c), 2, true, 0.18);
  blotches(p, 6, hex(0x3a2614), 12, 26, 0.25);
  dots(p, 30, [hex(0x2a1a10)], 0.6, 1.6, 0.5);
};
P[Cell.Beam] = (p) => {
  wood(p, 128, [hex(0x5a3e24), hex(0x4e3620), hex(0x62442a)], true, hex(0x1a120a), 1, false, 0.08);
  cracks(p, 6, hex(0x140c06), 6, 0.6);
  streaks(p, 6, hex(0x1a120a), 0.3);
};
P[Cell.Crate] = (p) => {
  wood(p, 51, [hex(0xa07a48), hex(0x8e6a3e), hex(0xaa8450), hex(0x84603a)], false, hex(0x2a1c10), 1, true, 0.22);
  blotches(p, 8, hex(0x4a3420), 12, 30, 0.28);
  streaks(p, 5, hex(0x3a2818), 0.2, false);
};
P[Cell.Staves] = (p) => {
  wood(p, 32, [hex(0x7a5230), hex(0x6e4a2a), hex(0x845a36), hex(0x684628)], true, hex(0x1e140a), 0, false, 0.12);
  blotches(p, 8, hex(0x2e1e10), 12, 26, 0.3);
  // a stain dribbling down from the top (wine, ale)
  streaks(p, 4, hex(0x3a1410), 0.3);
};
P[Cell.Iron] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 8, 4), r = p.n.fbm(x + 50, y + 20, 6, 4);
    let c = mix(hex(0x3a3a3e), hex(0x55565c), n);
    c = mix(c, hex(0x7a3e1c), sstep(0.5, 0.75, r) * 0.75);
    c = mix(c, hex(0xa85a24), sstep(0.68, 0.85, r) * 0.5);
    const g = (p.rng.next() - 0.5) * 10;
    return [c[0] + g, c[1] + g, c[2] + g];
  });
  const { ctx, rng } = p;
  for (let i = 0; i < 50; i++) {
    const x = rng.next() * S, y = rng.next() * S, l = 6 + rng.next() * 20, a = rng.next() * 3;
    wrapped(p, x, y, l, (xx, yy) => { ctx.strokeStyle = 'rgba(190,190,196,0.25)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + Math.cos(a) * l, yy + Math.sin(a) * l); ctx.stroke(); });
  }
  streaks(p, 8, hex(0x6a3014), 0.3);
};
P[Cell.Burlap] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 8, 3);
    const wx = Math.sin(x * 1.6) * 0.5 + 0.5, wy = Math.sin(y * 1.6 + (Math.floor(x / 4) % 2) * 3) * 0.5 + 0.5;
    let c = mix(hex(0xa88e62), hex(0x8a7048), n);
    c = mix(c, hex(0x5a4628), (wx * wy) * 0.35);
    return c;
  });
  blotches(p, 8, hex(0x4a3a24), 10, 26, 0.3);
  dots(p, 20, [hex(0xd8c8a0)], 0.6, 1.4, 0.4);
};
P[Cell.Straw] = (p) => {
  fill(p, (x, y) => mix(hex(0x9a7a3a), hex(0xb89448), p.n.fbm(x, y, 6, 3)));
  strands(p, 2600, [hex(0xd8b85a), hex(0xc8a24a), hex(0xa8863a), hex(0xe8cc70), hex(0x8a6a2e)], 24, 0, 0.7, 1.3, 0.85);
  blotches(p, 6, hex(0x5a4420), 10, 24, 0.3);
};
P[Cell.Gravestone] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 6, 5);
    let c = mix(hex(0x8a8882), hex(0x6e6c66), n);
    c = mix(c, hex(0x3a3a34), sstep(0.62, 0.85, p.n.fbm(x + 9, y + 50, 4, 3)) * 0.5);
    const g = (p.rng.next() - 0.5) * 12;
    return [c[0] + g, c[1] + g, c[2] + g];
  });
  dots(p, 90, [hex(0xc8c070), hex(0xd8d4b0), hex(0xa8b070)], 1, 3.4, 0.55);
  moss(p, 8, true, [hex(0x3e5a26), hex(0x4e6a2e), hex(0x2e4220)]);
  streaks(p, 10, hex(0x1e1e1a), 0.3);
  cracks(p, 6, hex(0x1a1a16), 8, 0.6);
};
P[Cell.Earth] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 8, 5);
    const c = mix(hex(0x3a2a1c), hex(0x5a4430), n);
    const g = (p.rng.next() - 0.5) * 14;
    return [c[0] + g, c[1] + g, c[2] + g];
  });
  dots(p, 80, [hex(0x6a5a48), hex(0x7a6a56), hex(0x2a1e14)], 1, 3.5, 0.8);
  const { ctx, rng } = p;
  for (let i = 0; i < 10; i++) {
    let x = rng.next() * S, y = rng.next() * S;
    ctx.strokeStyle = 'rgba(110,80,50,0.6)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rng.next() - 0.5) * 18; y += 4 + rng.next() * 8; ctx.lineTo(x, y); }
    ctx.stroke();
  }
};
P[Cell.Cloth] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 6, 4);
    const weave = ((Math.floor(x / 2) + Math.floor(y / 2)) % 2) * 0.06;
    const c = mix(hex(0xe8e0d0), hex(0xc8bea8), n + weave);
    return c;
  });
  blotches(p, 8, hex(0x6a5a40), 12, 30, 0.2);
  streaks(p, 6, hex(0x4a3a28), 0.15, false);
};
P[Cell.Window] = (p) => {
  const { ctx } = p;
  // dark glass, a faint warm glow from inside, and a cold sky reflection at the top
  const g = ctx.createLinearGradient(0, 0, S * 0.4, S);
  g.addColorStop(0, '#5a6a78'); g.addColorStop(0.35, '#2a323a'); g.addColorStop(0.75, '#3a2a1c'); g.addColorStop(1, '#6a4a24');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  blotches(p, 4, hex(0xffb050), 30, 60, 0.18);
  // lead came: diamond lattice
  ctx.strokeStyle = '#1a1612';
  ctx.lineWidth = 4;
  for (let k = -S; k < S * 2; k += 43) {
    ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + S, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(k, S); ctx.lineTo(k + S, 0); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(200,210,220,0.18)';
  ctx.lineWidth = 1;
  for (let k = -S; k < S * 2; k += 43) { ctx.beginPath(); ctx.moveTo(k + 2, 0); ctx.lineTo(k + 2 + S, S); ctx.stroke(); }
  // grime in the corners of the panes
  blotches(p, 10, hex(0x1a1610), 16, 34, 0.35);
};
P[Cell.Steps] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 6, 5);
    let c = mix(hex(0xa49e92), hex(0x86807a), n);
    c = mix(c, hex(0x5a564e), sstep(0.6, 0.9, p.n.fbm(x + 5, y + 3, 12, 2)) * 0.4);
    const g = (p.rng.next() - 0.5) * 10;
    return [c[0] + g, c[1] + g, c[2] + g];
  });
  cracks(p, 6, hex(0x3a3630), 6, 0.5);
  blotches(p, 6, hex(0x5a5a3a), 10, 22, 0.2);
  dots(p, 50, [hex(0x6a645c), hex(0xc8c2b6)], 0.6, 1.8, 0.5);
};
P[Cell.Bark] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 6, 4);
    const furrow = Math.abs(Math.sin(x * 0.19 + p.n.fbm(x, y, 2, 3) * 9));
    let c = mix(hex(0x3a2a1c), hex(0x6e5a44), n * 0.6 + furrow * 0.5);
    c = mix(c, hex(0x1a120a), sstep(0.25, 0, furrow) * 0.8);
    const g = (p.rng.next() - 0.5) * 10;
    return [c[0] + g, c[1] + g, c[2] + g];
  });
  moss(p, 8, false, [hex(0x4a5a2a), hex(0x5a6a30), hex(0x8a8a60)]);
};
P[Cell.Door] = (p) => {
  wood(p, 51, [hex(0x6a4626), hex(0x5e3e22), hex(0x74502c), hex(0x583a20)], true, hex(0x140c06), 1, false, 0.12);
  const { ctx } = p;
  // two iron straps with rivets and a ring handle
  for (const y of [42, 200]) {
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(0, y, S * 0.85, 16);
    ctx.fillStyle = 'rgba(140,70,30,0.5)'; ctx.fillRect(0, y + 10, S * 0.85, 6);
    ctx.fillStyle = 'rgba(200,200,210,0.25)'; ctx.fillRect(0, y, S * 0.85, 2);
    for (let x = 12; x < S * 0.85; x += 34) { ctx.fillStyle = '#18181a'; ctx.beginPath(); ctx.arc(x, y + 8, 3.5, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(220,220,230,0.4)'; ctx.beginPath(); ctx.arc(x - 1, y + 7, 1.2, 0, 7); ctx.fill(); }
  }
  ctx.strokeStyle = '#1e1e22'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(S * 0.86, 130, 13, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#2a2a2e'; ctx.fillRect(S * 0.86 - 8, 104, 16, 14);
  streaks(p, 6, hex(0x140c06), 0.3, false);
  moss(p, 2, true);
};
P[Cell.Plain] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 4, 5);
    const v = 236 - n * 34 + (p.rng.next() - 0.5) * 6;
    return [v, v - 2, v - 5];
  });
  blotches(p, 6, hex(0x8a8070), 12, 30, 0.12);
};
P[Cell.Bone] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 8, 4);
    const c = mix(hex(0xe8dcc0), hex(0xbcae8e), n);
    return c;
  });
  dots(p, 200, [hex(0x8a7a5a), hex(0x6a5a40)], 0.5, 1.2, 0.5);
  cracks(p, 7, hex(0x5a4a34), 6, 0.5);
  blotches(p, 5, hex(0x6a3a20), 10, 22, 0.25);
};
P[Cell.Leather] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 8, 5);
    const crease = Math.abs(Math.sin(x * 0.07 + y * 0.03 + p.n.fbm(x, y, 3, 3) * 10));
    let c = mix(hex(0x6a4428), hex(0x8a5a34), n);
    c = mix(c, hex(0x2a180c), sstep(0.12, 0, crease) * 0.6);
    return c;
  });
  blotches(p, 6, hex(0x2a1a0e), 12, 26, 0.3);
};
P[Cell.Butcher] = (p) => {
  wood(p, 64, [hex(0x8a6a48), hex(0x7a5c3e), hex(0x947250)], false, hex(0x2a1a10), 1, false, 0.1);
  const { ctx, rng } = p;
  // knife cuts and soaked-in blood
  for (let i = 0; i < 40; i++) {
    const x = rng.next() * S, y = rng.next() * S, l = 6 + rng.next() * 16, a = rng.next() * 3;
    wrapped(p, x, y, l, (xx, yy) => { ctx.strokeStyle = 'rgba(30,18,10,0.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + Math.cos(a) * l, yy + Math.sin(a) * l); ctx.stroke(); });
  }
  blotches(p, 7, hex(0x4a0a06), 12, 34, 0.55);
  blotches(p, 5, hex(0x6a120a), 6, 16, 0.5);
  dots(p, 40, [hex(0x5a0c08), hex(0x3a0806)], 0.8, 2.4, 0.7);
};
P[Cell.Moss] = (p) => {
  fill(p, (x, y) => mix(hex(0x2e4a1e), hex(0x4e6e2c), p.n.fbm(x, y, 8, 4)));
  dots(p, 500, [hex(0x5a7e34), hex(0x6e9040), hex(0x3a5a24), hex(0x2a3e1a)], 1.2, 3.6, 0.7);
};
P[Cell.Paper] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 4, 4);
    return mix(hex(0xe8dcc0), hex(0xc8b890), n);
  });
  const { ctx, rng } = p;
  for (let line = 18; line < S; line += 14) {
    let x = 14;
    while (x < S - 20) {
      const w = 6 + rng.next() * 22;
      ctx.strokeStyle = 'rgba(40,30,22,0.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, line);
      for (let k = 0; k < w; k += 3) ctx.lineTo(x + k, line + Math.sin(k * 1.3 + x) * 1.6);
      ctx.stroke();
      x += w + 5;
    }
  }
  blotches(p, 6, hex(0x8a6a3a), 10, 28, 0.25);
};

// ------------------------------------------------------------------ neutral detail cells (multiplied with vertex colours)

const neutral = (p: Paint, fn: (x: number, y: number) => number) => fill(p, (x, y) => { const v = Math.max(0, Math.min(255, fn(x, y))); return [v, v, v]; });
P[Cell.DWood] = (p) => {
  neutral(p, (x, y) => {
    const warp = p.n.fbm(x, y, 4, 3) * 24;
    const grain = Math.sin(y * 0.5 + warp) * 0.5 + 0.5;
    return 250 - grain * 50 - p.n.fbm(x + 3, y + 9, 8, 3) * 30 + (p.rng.next() - 0.5) * 8;
  });
  cracks(p, 6, [60, 60, 60], 6, 0.35);
  streaks(p, 6, [90, 90, 90], 0.2);
};
P[Cell.DStone] = (p) => {
  neutral(p, (x, y) => 246 - p.n.fbm(x, y, 6, 5) * 60 + (p.rng.next() - 0.5) * 14);
  cracks(p, 7, [50, 50, 50], 7, 0.4);
  dots(p, 90, [[150, 150, 150], [255, 255, 255]], 0.6, 2, 0.4);
  streaks(p, 8, [80, 80, 80], 0.2);
  moss(p, 4, true, [[150, 170, 120], [130, 150, 110]]);
};
P[Cell.DMetal] = (p) => {
  neutral(p, (x, y) => 236 - p.n.fbm(x, y, 8, 4) * 50 + (p.rng.next() - 0.5) * 10);
  blotches(p, 10, [140, 90, 60], 8, 22, 0.5);
  const { ctx, rng } = p;
  for (let i = 0; i < 60; i++) {
    const x = rng.next() * S, y = rng.next() * S, l = 5 + rng.next() * 18, a = rng.next() * 3;
    wrapped(p, x, y, l, (xx, yy) => { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + Math.cos(a) * l, yy + Math.sin(a) * l); ctx.stroke(); });
  }
};
P[Cell.DCloth] = (p) => {
  neutral(p, (x, y) => 240 - p.n.fbm(x, y, 6, 4) * 40 - ((Math.floor(x / 2) + Math.floor(y / 2)) % 2) * 14);
  blotches(p, 8, [110, 100, 90], 12, 28, 0.25);
  streaks(p, 5, [100, 100, 100], 0.18, false);
};
P[Cell.DPlant] = (p) => {
  neutral(p, (x, y) => 225 - p.n.fbm(x, y, 8, 4) * 50);
  dots(p, 420, [[255, 255, 255], [150, 150, 150], [190, 190, 190]], 1.4, 4, 0.55);
};
P[Cell.DGold] = (p) => {
  neutral(p, (x, y) => 240 - p.n.fbm(x, y, 6, 4) * 36 + Math.sin(x * 0.4 + y * 0.1) * 6);
  blotches(p, 8, [120, 110, 90], 8, 20, 0.35);
};
P[Cell.Soot] = (p) => {
  fill(p, (x, y) => mix(hex(0x1a1612), hex(0x3a2e24), p.n.fbm(x, y, 6, 4)));
  dots(p, 60, [hex(0x6a3a1a), hex(0x8a5a2a)], 0.6, 1.6, 0.6);
};
P[Cell.Blood] = (p) => {
  fill(p, (x, y) => {
    const n = p.n.fbm(x, y, 6, 4);
    return mix(hex(0x3a0806), hex(0x6a100a), n);
  });
  blotches(p, 6, hex(0x1a0404), 12, 30, 0.5);
  dots(p, 40, [hex(0x8a1a10)], 1, 3, 0.4);
};

// ------------------------------------------------------------------ atlas + material

let atlas: THREE.CanvasTexture | null = null;

/** The painted built-world atlas (drawn once, on first use). */
export function builtAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const out = c.getContext('2d')!;
  const cell = document.createElement('canvas');
  cell.width = cell.height = S;
  const ctx = cell.getContext('2d', { willReadFrequently: true })!;
  P.forEach((paint, i) => {
    if (!paint) return;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, S, S);
    paint({ ctx, rng: new Rng(2203 + i * 7919), n: new Noise(57 + i * 31, S), S });
    const ox = (i % ATLAS_COLS) * SLOT + PAD, oy = Math.floor(i / ATLAS_COLS) * SLOT + PAD;
    // the tile and its wrapped gutter
    out.save();
    out.beginPath();
    out.rect(ox - PAD, oy - PAD, SLOT, SLOT);
    out.clip();
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) out.drawImage(cell, ox + dx, oy + dy);
    out.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  atlas = t;
  return t;
}

/**
 * Turns a cel material into the built-world material: atlas cell per vertex
 * (`aCell`), UVs in world units wrapping inside the cell, mip level picked from
 * the unwrapped UVs (no seams) and clamped to the gutter. Vertex colours tint it.
 */
export function useBuiltAtlas(m: THREE.MeshToonMaterial): THREE.MeshToonMaterial {
  m.map = builtAtlas();
  m.vertexColors = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;\nvarying float vCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vCell = aCell;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCell;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  float cid = floor(vCell + 0.5);
  vec2 slot = vec2(mod(cid, ${ATLAS_COLS}.0), floor(cid / ${ATLAS_COLS}.0)) * ${SLOT}.0 + ${PAD}.0;
  vec2 tp = vMapUv * ${S}.0;
  vec2 ddx = dFdx(tp), ddy = dFdy(tp);
  float lod = clamp(0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy))), 0.0, 4.0);
  vec2 f = fract(vMapUv) * ${S}.0;
  vec2 auv = (slot + vec2(f.x, ${S}.0 - f.y)) / vec2(${ATLAS_W}.0, ${ATLAS_H}.0);
  diffuseColor *= textureLod(map, auv, lod);
#endif`);
  };
  m.customProgramCacheKey = () => 'paintBuilt';
  return m;
}

import * as THREE from 'three';
import { Rng } from '../../game/core/rng';
import type { Mat } from './parts';
import type { Rig } from './rigs';

/**
 * Painted style (render/style.ts), owner 2026-10-23: "more detail, more brutal, for older
 * players". Characters get worn, dirty surface detail from one canvas-painted atlas instead
 * of extra triangles: cloth weave and folds with grimy hems, blood-stained cloth, leather
 * grain and creases, scorched leather, scratched and dented steel, pitted rusty iron, chain
 * mail, skin with pores and soot, hair strands, wood grain, fur, bone, a notched blade and
 * a rune-stitched robe. Everything is generated in code (original art).
 *
 * Every part of a character samples the SAME atlas (its UVs are squeezed into one cell),
 * so rigMerge.ts still bakes each joint group into one mesh: the detail costs no extra
 * draw calls. `paintRig` picks a cell per part — from `userData.detail` when a model sets
 * it (grim NPCs), else from the part's colour (steel, iron, leather, cloth, skin, hair).
 *
 * Canvas v = 0 is the bottom of every face (box sides, cylinders), so grime, soot and
 * blood that collect at the bottom of a cell end up at hems, boots and hands.
 */
export type Detail =
  | 'plain' | 'cloth' | 'clothBlood' | 'leather' | 'leatherBurnt' | 'steel' | 'iron' | 'chain'
  | 'skin' | 'skinSoot' | 'hair' | 'wood' | 'fur' | 'bone' | 'blade' | 'runeCloth';

const CELLS: Detail[] = [
  'plain', 'cloth', 'clothBlood', 'runeCloth',
  'leather', 'leatherBurnt', 'fur', 'wood',
  'steel', 'iron', 'chain', 'blade',
  'skin', 'skinSoot', 'hair', 'bone',
];
const CELL = 256;
const COLS = 4;

/** Tags a part with the detail it should get (read and removed by paintRig). */
export function detail<T extends THREE.Object3D>(o: T, d: Detail): T {
  o.userData.detail = d;
  return o;
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
    const g = (a: number, b: number) => this.v[(m(b) & 63) * 64 + (m(a) & 63)];
    const a = g(ix, iy) + (g(ix + 1, iy) - g(ix, iy)) * fx;
    const b = g(ix, iy + 1) + (g(ix + 1, iy + 1) - g(ix, iy + 1)) * fx;
    return a + (b - a) * fy;
  }
  fbm(x: number, y: number, p: number, oct = 4): number {
    let s = 0, w = 0.5, t = 0;
    for (let o = 0; o < oct; o++) { s += this.at(x, y, p << o) * w; t += w; w *= 0.5; }
    return s / t;
  }
}

interface P { ctx: CanvasRenderingContext2D; r: Rng; n: VNoise }

/** Fills the cell pixel by pixel: f returns [r, g, b] in 0..1. */
function field(p: P, f: (x: number, y: number) => [number, number, number]): void {
  const img = p.ctx.createImageData(CELL, CELL);
  const d = img.data;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const [r, g, b] = f(x, y);
    const i = (y * CELL + x) * 4;
    d[i] = Math.max(0, Math.min(255, r * 255));
    d[i + 1] = Math.max(0, Math.min(255, g * 255));
    d[i + 2] = Math.max(0, Math.min(255, b * 255));
    d[i + 3] = 255;
  }
  p.ctx.putImageData(img, 0, 0);
}

/** 0 at the top of the cell, 1 at the bottom (where grime collects). */
const low = (y: number, from = 0.55) => Math.max(0, (y / CELL - from) / (1 - from));
const grey = (v: number, warm = 0.03): [number, number, number] => [v + warm, v, v - warm];

function splat(p: P, x: number, y: number, rad: number, color: string, drops = 7): void {
  const { ctx, r } = p;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, rr = rad * (0.55 + r.next() * 0.6);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < drops; i++) {
    const a = r.next() * Math.PI * 2, rr = rad * (1 + r.next() * 1.4);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1 + r.next() * rad * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  // a run or two dripping down
  for (let i = 0; i < 2; i++) {
    const dx = x + (r.next() - 0.5) * rad;
    ctx.fillRect(dx, y, 1.5 + r.next() * 2, rad * (0.8 + r.next() * 2));
  }
}

function scratches(p: P, n: number, light: string, dark: string, len = 40): void {
  const { ctx, r } = p;
  for (let i = 0; i < n; i++) {
    const x = r.next() * CELL, y = r.next() * CELL, a = r.next() * Math.PI, l = 6 + r.next() * len;
    ctx.lineWidth = 0.6 + r.next() * 1.1;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + 1 + Math.cos(a) * l, y + 1 + Math.sin(a) * l); ctx.stroke();
    ctx.strokeStyle = light;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
}

function dents(p: P, n: number): void {
  const { ctx, r } = p;
  for (let i = 0; i < n; i++) {
    const x = r.next() * CELL, y = r.next() * CELL, rad = 5 + r.next() * 14;
    const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
}

const PAINTERS: Record<Detail, (p: P) => void> = {
  plain: (p) => field(p, (x, y) => grey(0.93 + p.n.at(x, y, 8) * 0.07, 0.01)),
  cloth: (p) => {
    // weave, soft vertical folds, worn patches, a grimy frayed hem
    field(p, (x, y) => {
      const weave = ((x >> 1) + (y >> 1)) % 2 ? 0.035 : -0.035;
      const fold = Math.sin((x / CELL) * Math.PI * 6 + p.n.at(x, y, 4) * 3) * 0.09;
      const blot = (p.n.fbm(x, y, 4) - 0.5) * 0.22;
      const v = 0.84 + weave + fold + blot - low(y, 0.6) * 0.38;
      return grey(v, 0.02);
    });
    const { ctx, r } = p;
    ctx.fillStyle = 'rgba(30,22,14,0.55)';
    for (let x = 0; x < CELL; x += 3) ctx.fillRect(x, CELL - 6 - r.next() * 14, 3, 20); // frayed hem
    for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(40,30,20,${0.12 + r.next() * 0.12})`; splat(p, r.next() * CELL, 60 + r.next() * 180, 6 + r.next() * 14, ctx.fillStyle as string, 3); }
  },
  clothBlood: (p) => {
    PAINTERS.cloth(p);
    const { r } = p;
    for (let i = 0; i < 6; i++) splat(p, r.next() * CELL, 40 + r.next() * 200, 8 + r.next() * 20, `rgba(${70 + r.int(0, 40)},6,4,${0.55 + r.next() * 0.3})`);
    for (let i = 0; i < 4; i++) splat(p, r.next() * CELL, r.next() * CELL, 4 + r.next() * 6, 'rgba(40,4,2,0.8)', 4);
  },
  runeCloth: (p) => {
    PAINTERS.cloth(p);
    const { ctx, r } = p;
    // faint stitched rune bands
    ctx.strokeStyle = 'rgba(210,190,150,0.45)';
    ctx.lineWidth = 2;
    for (const by of [70, 190]) {
      ctx.beginPath(); ctx.moveTo(0, by - 14); ctx.lineTo(CELL, by - 14); ctx.moveTo(0, by + 14); ctx.lineTo(CELL, by + 14); ctx.stroke();
      for (let x = 10; x < CELL; x += 30) {
        ctx.beginPath();
        const k = r.int(0, 3);
        ctx.moveTo(x, by - 9); ctx.lineTo(x, by + 9);
        if (k === 0) { ctx.moveTo(x, by - 9); ctx.lineTo(x + 9, by - 2); }
        if (k === 1) { ctx.moveTo(x - 6, by); ctx.lineTo(x + 6, by - 7); ctx.moveTo(x - 6, by); ctx.lineTo(x + 6, by + 7); }
        if (k === 2) { ctx.moveTo(x, by); ctx.lineTo(x + 8, by + 8); ctx.moveTo(x, by); ctx.lineTo(x - 8, by + 8); }
        if (k === 3) { ctx.arc(x, by, 5, 0, Math.PI * 2); }
        ctx.stroke();
      }
    }
    for (let i = 0; i < 3; i++) splat(p, r.next() * CELL, 150 + r.next() * 100, 8 + r.next() * 10, 'rgba(50,30,40,0.35)', 3);
  },
  leather: (p) => {
    field(p, (x, y) => {
      const grain = (p.n.at(x, y, 64) - 0.5) * 0.16 + (p.n.at(x, y, 32) - 0.5) * 0.1;
      const crease = Math.pow(Math.abs(Math.sin((y / CELL) * Math.PI * 5 + p.n.at(x, y, 4) * 4)), 18) * -0.18;
      const wear = (p.n.fbm(x, y, 4) - 0.5) * 0.3;
      return grey(0.8 + grain + crease + wear - low(y, 0.7) * 0.25, 0.05);
    });
    scratches(p, 30, 'rgba(255,235,200,0.25)', 'rgba(20,10,0,0.25)', 22);
    const { ctx } = p;
    ctx.strokeStyle = 'rgba(25,15,8,0.6)'; // stitched edges
    ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, CELL - 16, CELL - 16);
    ctx.setLineDash([]);
  },
  leatherBurnt: (p) => {
    PAINTERS.leather(p);
    const { ctx, r } = p;
    for (let i = 0; i < 14; i++) {
      const x = r.next() * CELL, y = r.next() * CELL, rad = 8 + r.next() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(8,6,4,0.85)'); g.addColorStop(0.6, 'rgba(30,18,10,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 4; i++) splat(p, r.next() * CELL, r.next() * CELL, 6 + r.next() * 8, 'rgba(80,10,6,0.6)', 5);
    const g = ctx.createLinearGradient(0, CELL * 0.5, 0, CELL);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,8,6,0.7)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CELL, CELL);
  },
  fur: (p) => {
    field(p, (x, y) => grey(0.75 + (p.n.at(x * 0.3, y, 128) - 0.5) * 0.4 + (p.n.fbm(x, y, 4) - 0.5) * 0.2, 0.04));
    const { ctx, r } = p;
    for (let i = 0; i < 900; i++) {
      const x = r.next() * CELL, y = r.next() * CELL;
      ctx.strokeStyle = r.next() < 0.5 ? 'rgba(20,14,8,0.35)' : 'rgba(255,240,220,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r.next() - 0.5) * 4, y + 6 + r.next() * 8); ctx.stroke();
    }
  },
  wood: (p) => {
    field(p, (x, y) => {
      const ring = Math.sin((x / CELL) * 40 + p.n.fbm(x, y, 4) * 9) * 0.5 + 0.5;
      return grey(0.7 + ring * 0.2 + (p.n.at(x, y, 64) - 0.5) * 0.1 - low(y, 0.75) * 0.2, 0.05);
    });
    scratches(p, 12, 'rgba(255,240,210,0.2)', 'rgba(0,0,0,0.3)', 18);
  },
  steel: (p) => {
    // brushed, scratched and dented steel; dark grime in the bottom third
    field(p, (x, y) => {
      const brush = (p.n.at(x * 0.15, y, 128) - 0.5) * 0.12;
      const mott = (p.n.fbm(x, y, 4) - 0.5) * 0.3;
      return grey(0.84 + brush + mott - low(y, 0.6) * 0.42, -0.01);
    });
    dents(p, 16);
    scratches(p, 120, 'rgba(255,255,255,0.45)', 'rgba(0,0,0,0.35)', 34);
    const { r } = p;
    for (let i = 0; i < 6; i++) splat(p, r.next() * CELL, 120 + r.next() * 130, 4 + r.next() * 9, `rgba(${90 + r.int(0, 30)},50,25,0.4)`, 3); // rust bloom
  },
  iron: (p) => {
    field(p, (x, y) => {
      const pit = p.n.at(x, y, 64) > 0.78 ? -0.25 : 0;
      const mott = (p.n.fbm(x, y, 4) - 0.5) * 0.4;
      const rust = Math.max(0, p.n.fbm(x + 77, y, 4) - 0.55) * 1.8 + low(y, 0.5) * 0.4;
      const v = 0.78 + mott + pit;
      return [v + rust * 0.25, v - rust * 0.05, v - rust * 0.3];
    });
    dents(p, 10);
    scratches(p, 70, 'rgba(230,220,210,0.4)', 'rgba(0,0,0,0.4)', 26);
  },
  chain: (p) => {
    field(p, (_x, y) => grey(0.25 + low(y, 0.6) * -0.1, 0));
    const { ctx } = p;
    const s = 16;
    for (let row = 0; row < CELL / (s * 0.7) + 1; row++) {
      for (let col = -1; col < CELL / s + 1; col++) {
        const x = col * s + (row % 2 ? s / 2 : 0), y = row * s * 0.7;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(30,30,30,1)';
        ctx.beginPath(); ctx.ellipse(x + 1, y + 1, s * 0.42, s * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(${200 - (y / CELL) * 90},${200 - (y / CELL) * 95},${205 - (y / CELL) * 100},1)`;
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.ellipse(x, y, s * 0.42, s * 0.36, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,120,125,1)';
        ctx.beginPath(); ctx.ellipse(x, y, s * 0.42, s * 0.36, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
      }
    }
    const { r } = p;
    for (let i = 0; i < 5; i++) splat(p, r.next() * CELL, 140 + r.next() * 110, 6 + r.next() * 10, 'rgba(110,55,20,0.45)', 3);
  },
  blade: (p) => {
    field(p, (x, y) => {
      const fuller = Math.abs(x - CELL / 2) < 18 ? -0.18 : 0;
      const edge = Math.min(x, CELL - x) < 14 ? 0.12 : 0;
      return grey(0.86 + fuller + edge + (p.n.at(x * 0.1, y, 128) - 0.5) * 0.12, -0.01);
    });
    scratches(p, 90, 'rgba(255,255,255,0.5)', 'rgba(0,0,0,0.4)', 30);
    const { ctx, r } = p;
    ctx.fillStyle = 'rgba(20,16,14,1)';
    for (let i = 0; i < 9; i++) { // notches on both edges
      const y = r.next() * CELL, side = r.next() < 0.5 ? 0 : CELL, d = 6 + r.next() * 12;
      ctx.beginPath(); ctx.moveTo(side, y - 5); ctx.lineTo(Math.abs(side - d), y); ctx.lineTo(side, y + 6); ctx.fill();
    }
    for (let i = 0; i < 4; i++) splat(p, r.next() * CELL, r.next() * CELL * 0.45, 8 + r.next() * 14, 'rgba(90,6,4,0.75)', 6); // old blood toward the tip
  },
  skin: (p) => {
    field(p, (x, y) => {
      const pore = (p.n.at(x, y, 128) - 0.5) * 0.06;
      const blotch = (p.n.fbm(x, y, 4) - 0.5) * 0.16;
      const v = 0.9 + pore + blotch - low(y, 0.7) * 0.15;
      return [v + 0.02, v - 0.01, v - 0.03];
    });
    const { r } = p;
    for (let i = 0; i < 6; i++) splat(p, r.next() * CELL, r.next() * CELL, 4 + r.next() * 10, 'rgba(40,28,20,0.18)', 2); // dirt
  },
  skinSoot: (p) => {
    PAINTERS.skin(p);
    const { ctx, r } = p;
    const g = ctx.createLinearGradient(0, CELL * 0.15, 0, CELL);
    g.addColorStop(0, 'rgba(15,12,10,0.5)'); g.addColorStop(0.5, 'rgba(15,12,10,0.66)'); g.addColorStop(1, 'rgba(10,8,6,0.8)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CELL, CELL);
    for (let i = 0; i < 12; i++) splat(p, r.next() * CELL, r.next() * CELL, 6 + r.next() * 18, 'rgba(10,8,6,0.35)', 2);
    scratches(p, 8, 'rgba(255,160,140,0.35)', 'rgba(90,20,10,0.5)', 20); // burns and nicks
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
  bone: (p) => {
    field(p, (x, y) => {
      const v = 0.86 + (p.n.fbm(x, y, 4) - 0.5) * 0.25 - low(y, 0.6) * 0.3;
      return [v + 0.02, v, v - 0.06];
    });
    scratches(p, 25, 'rgba(255,255,240,0.3)', 'rgba(60,40,20,0.45)', 16);
  },
};

let atlasTex: THREE.CanvasTexture | null = null;
/** The character detail atlas (built once, on first use). */
export function detailAtlas(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas');
  c.width = c.height = CELL * COLS;
  const out = c.getContext('2d')!;
  const cell = document.createElement('canvas');
  cell.width = cell.height = CELL;
  const ctx = cell.getContext('2d', { willReadFrequently: true })!;
  CELLS.forEach((d, i) => {
    ctx.clearRect(0, 0, CELL, CELL);
    PAINTERS[d]({ ctx, r: new Rng(7001 + i * 104729), n: new VNoise(91 + i * 13) });
    out.drawImage(cell, (i % COLS) * CELL, Math.floor(i / COLS) * CELL);
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

// ------------------------------------------------------------------ applying it to a rig

const remapped = new WeakMap<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>();
/** The geometry with its UVs squeezed into one atlas cell (cached; shared geometries are never touched). */
function cellGeometry(geo: THREE.BufferGeometry, cell: number): THREE.BufferGeometry {
  let m = remapped.get(geo);
  if (!m) { m = new Map(); remapped.set(geo, m); }
  let g = m.get(cell);
  if (g) return g;
  g = geo.clone();
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  const n = g.attributes.position.count;
  const u0 = (cell % COLS) / COLS, v0 = 1 - (Math.floor(cell / COLS) + 1) / COLS;
  const inset = 0.06 / COLS, span = 1 / COLS - 2 * inset;
  const out = new Float32Array(n * 2);
  // geometry without UVs (custom gear shells): project the cell onto it from the front/side
  const pos = g.attributes.position as THREE.BufferAttribute;
  if (!uv) g.computeBoundingBox();
  const bb = g.boundingBox ?? new THREE.Box3();
  const sx = Math.max(1e-4, bb.max.x - bb.min.x), sy = Math.max(1e-4, bb.max.y - bb.min.y), sz = Math.max(1e-4, bb.max.z - bb.min.z);
  for (let i = 0; i < n; i++) {
    const u = uv ? Math.min(1, Math.max(0, uv.getX(i))) : 0.5 * ((pos.getX(i) - bb.min.x) / sx + (pos.getZ(i) - bb.min.z) / sz);
    const v = uv ? Math.min(1, Math.max(0, uv.getY(i))) : (pos.getY(i) - bb.min.y) / sy;
    out[i * 2] = u0 + inset + u * span;
    out[i * 2 + 1] = v0 + inset + v * span;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(out, 2));
  g.userData = { ...geo.userData, detailCell: cell };
  m.set(cell, g);
  return g;
}

/** Guesses the surface of an untagged part from its colour. */
function guess(me: THREE.Mesh, m: Mat, skin: Mat | undefined): Detail {
  const cover = me.userData.cover as string | undefined;
  if (m === skin) return 'skin';
  if (me.userData.face) return 'plain';
  if (cover) return 'hair';
  if (!me.geometry.boundingSphere) me.geometry.computeBoundingSphere();
  const r = (me.geometry.boundingSphere?.radius ?? 1) * Math.max(me.scale.x, me.scale.y, me.scale.z);
  if (r < 0.035) return 'plain';
  const hsl = { h: 0, s: 0, l: 0 };
  m.color.getHSL(hsl);
  const hue = hsl.h * 360;
  if (hsl.s < 0.2) return hsl.l > 0.32 ? 'steel' : hsl.l > 0.12 ? 'iron' : 'leather';
  if (hue >= 38 && hue <= 58 && hsl.s > 0.45 && hsl.l > 0.35) return 'steel'; // gold, brass
  if (hue >= 12 && hue <= 45 && hsl.l < 0.5) return 'leather';
  return 'cloth';
}

/** Blends a colour a little toward its grey (the painted look's darker, desaturated palette). */
function grim(m: Mat, k: number): void {
  const c = m.color;
  const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
  // very bright paint (polished steel, white cloth) is dulled: nothing gleams like new
  const dim = l > 0.4 ? 1 - (l - 0.4) * 0.9 : 1;
  c.setRGB((c.r + (l - c.r) * k) * dim, (c.g + (l - c.g) * k) * dim, (c.b + (l - c.b) * k) * dim);
}

/**
 * Gives every plain part of a character the detail atlas (painted style only). Safe to
 * call again after re-dressing: parts already done are skipped, new gear is painted.
 */
export function paintRig(rig: Rig): void {
  const atlas = detailAtlas();
  const skin = rig.type === 'biped' ? rig.gear?.skin : undefined;
  const meshes: THREE.Mesh[] = [];
  rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== rig.hitbox) meshes.push(o as THREE.Mesh); });
  // a material shared by a part we cannot paint stays untextured for all its parts
  const blocked = new Set<THREE.Material>();
  // materials painted by an earlier call (their parts, merged or not, already sample the atlas)
  const done = new Set<THREE.Material>();
  for (const me of meshes) if (!Array.isArray(me.material) && (me.material as Mat).map === atlas) done.add(me.material as Mat);
  for (const me of meshes) {
    const m = me.material as Mat;
    const plain = !Array.isArray(me.material) && m.isMeshToonMaterial && !m.transparent
      && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile
      && !(me as THREE.InstancedMesh).isInstancedMesh && !me.geometry.morphAttributes.position && me.geometry.attributes.position;
    if (!plain && !Array.isArray(me.material)) blocked.add(me.material as THREE.Material);
    if (m.map && m.map !== atlas) blocked.add(m);
  }
  for (const me of meshes) {
    const m = me.material as Mat;
    if (Array.isArray(me.material) || blocked.has(m) || done.has(m)) { delete me.userData.detail; continue; }
    if (me.geometry.userData.detailCell !== undefined) { delete me.userData.detail; continue; } // done before
    const lit = m.emissive.r + m.emissive.g + m.emissive.b > 0.05;
    const d: Detail = (me.userData.detail as Detail | undefined) ?? (lit ? 'plain' : guess(me, m, skin));
    delete me.userData.detail;
    me.geometry = cellGeometry(me.geometry, CELLS.indexOf(d));
    if (m.map !== atlas) {
      m.map = atlas;
      if (!m.vertexColors && !lit) grim(m, 0.38);
      m.needsUpdate = true;
    }
  }
}

import * as THREE from 'three';
import { Rng } from '../../game/core/rng';
import { Ground, type WorldMap } from '../../game/world/WorldMap';
import type { PlazaProp, SpawnPlaza } from '../../game/world/spawnPlaza';
import { Mesher, type V3 } from './darkRigsCore';
import type { Mat } from './parts';
import { applyWind, WIND, WIND_CLOTH } from '../weather/wind';
import { PAINTED } from '../style';
import { paintDetail } from '../paint/detail';
import { useBuiltAtlas } from '../paint/builtAtlas';
import { GlowSprites } from '../paint/glowSprites';

/** Makes a cel material; WorldView passes its floor-tracked factory so the plaza dims with its floor. */
export type MatFn = (color: number, opts?: { emissive?: number; map?: THREE.Texture | null }) => Mat;

/**
 * The Thornvale spawn plaza (layout in game/world/spawnPlaza.ts): painted paving,
 * the fountain and every decoration.
 *
 * Performance: every static prop is merged into ONE vertex-coloured mesh plus one
 * glowing mesh (flames, lantern glass, runes); the floor is one textured plane;
 * water is a handful of meshes sharing two animated textures; spray and embers are
 * two instanced meshes. Nothing is allocated per frame.
 */
export interface PlazaView {
  group: THREE.Group;
  /** Materials whose glow should flicker like fire (WorldView animates them). */
  flameMats: Mat[];
  update(dt: number): void;
}

/** Texels per tile of the painted paving (painted style, style.ts: twice as fine and smoothly filtered). */
const TILE = PAINTED ? 64 : 32;

// ------------------------------------------------------------------ helpers

function hash(x: number, y: number, k = 0): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

function lerpC(a: number, b: number, t: number): number {
  const A = rgb(a), B = rgb(b);
  return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t);
}

function canvasTex(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Light, rippled water for basins (tinted per design). */
function waterTexture(seed: number): THREE.CanvasTexture {
  const rng = new Rng(seed);
  return canvasTex(32, 32, (ctx) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const r = rng.next();
      ctx.fillStyle = r < 0.55 ? '#c4dcef' : r < 0.85 ? '#d4e6f4' : '#b2cde4';
      ctx.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 10; i++) {
      const x = rng.int(0, 28), y = rng.int(0, 31);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, rng.int(2, 4), 1);
      ctx.fillStyle = '#9fbfda';
      ctx.fillRect(x + 1, (y + 1) % 32, 3, 1);
    }
  }, true);
}

/** Vertical streaks for falling water. */
function streakTexture(): THREE.CanvasTexture {
  const rng = new Rng(77);
  return canvasTex(16, 32, (ctx) => {
    ctx.fillStyle = '#d6ecfb';
    ctx.fillRect(0, 0, 16, 32);
    for (let x = 0; x < 16; x++) {
      if (rng.chance(0.45)) {
        const y = rng.int(0, 31), l = rng.int(4, 14);
        for (let k = 0; k < l; k++) {
          ctx.fillStyle = rng.chance(0.5) ? '#ffffff' : '#a9cbe6';
          ctx.fillRect(x, (y + k) % 32, 1, 1);
        }
      }
    }
  }, true);
}

// ------------------------------------------------------------------ floor painting

type Painter = (wx: number, wy: number, dx: number, dy: number) => number;

/** Square setts in running bond (8 px = a quarter tile). */
function setts(wx: number, wy: number, size: number, base: number[], mortar: number): number {
  const sx = wx / size, sy = wy / size;
  const row = Math.floor(sy);
  const col = Math.floor(sx + (row % 2) * 0.5);
  const fx = sx + (row % 2) * 0.5 - col, fy = sy - row;
  const m = 0.12;
  if (fx < m || fy < m) return mortar;
  const h = hash(col, row, 3);
  let c = base[Math.floor(h * base.length)];
  if (fx > 1 - m * 1.6 || fy > 1 - m * 1.6) c = lerpC(c, 0x000000, 0.18);
  else if (fx < m * 2.4 || fy < m * 2.4) c = lerpC(c, 0xffffff, 0.14);
  return c;
}

/** Cobbles laid in rings around the fountain. */
function ringCobbles(r: number, th: number, r0: number, w: number, base: number[], mortar: number): number {
  const ri = Math.floor((r - r0) / w);
  const fr = (r - r0) / w - ri;
  const rc = r0 + (ri + 0.5) * w;
  const n = Math.max(6, Math.round((2 * Math.PI * rc) / w));
  const a = ((th / (2 * Math.PI)) * n + (ri % 2) * 0.5 + n) % n;
  const ai = Math.floor(a);
  const fa = a - ai;
  if (fr < 0.13 || fa < 0.1) return mortar;
  let c = base[Math.floor(hash(ai, ri, 9) * base.length)];
  if (fr > 0.8 || fa > 0.86) c = lerpC(c, 0x000000, 0.16);
  else if (fr < 0.28) c = lerpC(c, 0xffffff, 0.12);
  return c;
}

/** Irregular flagstones (nearest-point cells). */
function flags(wx: number, wy: number, scale: number, base: number[], seam: number, k = 1): number {
  const gx = wx / scale, gy = wy / scale;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = ix + ox, cy = iy + oy;
    const px = cx + 0.15 + hash(cx, cy, k) * 0.7, py = cy + 0.15 + hash(cx, cy, k + 1) * 0.7;
    const d = Math.hypot(gx - px, gy - py);
    if (d < d1) { d2 = d1; d1 = d; id = cx * 7919 + cy; } else if (d < d2) d2 = d;
  }
  if (d2 - d1 < 0.07) return seam;
  let c = base[Math.floor(hash(id, 1, k + 5) * base.length)];
  if (d2 - d1 < 0.14) c = lerpC(c, 0x000000, 0.14);
  return c;
}

function grain(c: number, wx: number, wy: number, amt = 0.07): number {
  const n = hash(Math.floor(wx * TILE), Math.floor(wy * TILE), 31) - 0.5;
  return lerpC(c, n > 0 ? 0xffffff : 0x000000, Math.abs(n) * amt * 2);
}

const ANG = (dx: number, dy: number) => Math.atan2(dy, dx) + Math.PI;

function classicFloor(): Painter {
  const cob = [0x9a958b, 0xa39e93, 0x928c82, 0xaaa499, 0x8c877e];
  const ring = [0xb4ab9b, 0xbdb4a3, 0xa99f8f];
  return (wx, wy, dx, dy) => {
    const r = Math.hypot(dx, dy);
    const th = ANG(dx, dy);
    // granite band framing the square
    const edge = Math.min(wx - 20.5, 34.5 - wx, wy - 17.5, 27.5 - wy);
    if (edge < 0.32) return grain(edge < 0.05 ? 0x5e5a54 : hash(Math.floor(wx * 2), Math.floor(wy * 2), 4) > 0.5 ? 0x77726a : 0x6e6962, wx, wy);
    if (edge < 0.4) return 0xc9c1b0;
    if (r < 2.05) return 0x6a655e;
    if (r < 4.35) {
      // eight rays of pale stone from the fountain
      const ray = Math.abs(((th / (Math.PI / 4)) % 1) - 0.5);
      if (ray > 0.46 && r > 2.2 && r < 4.2) return grain(0xd8cfbc, wx, wy);
      return ringCobbles(r, th, 2.05, 0.3, ring, 0x5f5a52);
    }
    if (r < 4.62) return grain(r < 4.42 || r > 4.55 ? 0x5e5952 : 0x77716a, wx, wy);
    return setts(wx + 0.5, wy + 0.5, 0.25, cob, 0x625e57);
  };
}

function templeFloor(): Painter {
  return (wx, wy, dx, dy) => {
    const r = Math.hypot(dx, dy);
    const th = ANG(dx, dy);
    const edge = Math.min(wx - 20.5, 34.5 - wx, wy - 17.5, 27.5 - wy);
    if (edge < 0.45) return grain(edge > 0.33 && edge < 0.39 ? 0xd8b04a : 0x2f4a3e, wx, wy, 0.1);
    // crimson runners from the north and south gates to the fountain
    if (Math.abs(dx) < 0.62 && Math.abs(dy) > 1.9) {
      if (Math.abs(dx) > 0.5) return 0xd8b04a;
      const st = Math.floor(wy * 4) % 4 === 0 && Math.abs(dx) < 0.3 ? 0xa83a2a : 0x8a2420;
      return grain(st, wx, wy, 0.06);
    }
    if (r < 2.05) return 0x2f4a3e;
    // eight-point star of gilded inlay
    const k = 8;
    const a = ((th * k) / (2 * Math.PI)) % 1;
    const star = 2.3 + 1.9 * Math.pow(Math.abs(a - 0.5) * 2, 1.6);
    if (r < star) {
      if (r > star - 0.12) return 0xe6c25a;
      return grain(Math.floor(a * 2) % 2 ? 0xe9e2d2 : 0xd8cfbc, wx, wy, 0.05);
    }
    if (r < 4.35 && r > 4.2) return 0xd8b04a;
    // marble slabs, a tile each, laid like a chessboard
    const tx = Math.round(wx), ty = Math.round(wy);
    const fx = wx - tx + 0.5, fy = wy - ty + 0.5;
    if (fx < 0.04 || fy < 0.04) return 0xa8a090;
    const base = (tx + ty) % 2 ? 0xe4ded2 : 0xd2cbbd;
    const vein = Math.sin(wx * 9 + Math.sin(wy * 5 + tx) * 2 + ty) > 0.97 ? 0xb9b1a2 : base;
    return grain(vein, wx, wy, 0.04);
  };
}

function gardenFloor(): Painter {
  const gravel = [0xc8b48c, 0xbfa981, 0xd2c09a, 0xb39d76];
  return (wx, wy, dx, dy) => {
    // flagstone ring around the pond (an ellipse a little wider than the water)
    const e = Math.hypot(dx / 3.35, dy / 2.35);
    if (e < 1.0) return flags(wx, wy, 0.45, [0xa49c8c, 0x9a9282, 0xafa797], 0x6f685c, 2);
    if (e < 1.07) return 0x857c6c;
    const n = hash(Math.floor(wx * TILE), Math.floor(wy * TILE), 2);
    let c = gravel[Math.floor(n * gravel.length)];
    if (hash(Math.floor(wx * 16), Math.floor(wy * 16), 6) > 0.93) c = 0xe6d8ba;
    if (hash(Math.floor(wx * 16), Math.floor(wy * 16), 7) > 0.95) c = 0x8f7a58;
    return c;
  };
}

function marketFloor(): Painter {
  const cob = [0x8e877b, 0x968f82, 0x847d71, 0x9d9588, 0x7f786d];
  return (wx, wy, dx, dy) => {
    const edge = Math.min(wx - 20.5, 34.5 - wx, wy - 17.5, 27.5 - wy);
    if (edge < 0.5) return setts(wx * 0.5, wy * 0.5 + 0.25, 0.25, [0x7a7166, 0x837a6e, 0x726a60], 0x4e4943);
    // a square of large slabs round the well-fountain
    if (Math.abs(dx) < 2.1 && Math.abs(dy) < 2.1) {
      if (Math.abs(dx) > 1.95 || Math.abs(dy) > 1.95) return 0x5a544c;
      return setts(wx * 0.5 + 0.5, wy * 0.5, 0.5, [0xa8a091, 0xb2aa9a, 0x9e9688], 0x5f5951);
    }
    // fan (scallop) cobbles: arcs of setts in rows
    const S = 1.0;
    const gx = wx / S, gy = wy / S;
    const row = Math.floor(gy * 2);
    const ox = row % 2 ? 0.5 : 0;
    const cx = Math.floor(gx + ox) + 0.5 - ox, cy = (row + 1) / 2;
    const rr = Math.hypot(gx - cx, (gy - cy) * 1.0);
    const ring = Math.floor(rr / 0.16);
    const ang = Math.atan2(gy - cy, gx - cx);
    const seg = Math.floor((ang + Math.PI) * (ring + 2) * 0.9);
    const fr = rr / 0.16 - ring;
    if (rr > 0.66 || fr < 0.16) return 0x57514a;
    const fa = ((ang + Math.PI) * (ring + 2) * 0.9) % 1;
    if (fa < 0.12) return 0x57514a;
    let c = cob[Math.floor(hash(seg, ring + row * 13 + Math.floor(gx + ox) * 101, 4) * cob.length)];
    if (fr > 0.8) c = lerpC(c, 0x000000, 0.15);
    return c;
  };
}

function ashenFloor(glow: (c: number) => void): Painter {
  const basalt = [0x3a3a3e, 0x34343a, 0x403f44, 0x2e2e34, 0x45434a];
  return (wx, wy, dx, dy) => {
    const r = Math.hypot(dx, dy);
    const th = ANG(dx, dy);
    const edge = Math.min(wx - 20.5, 34.5 - wx, wy - 17.5, 27.5 - wy);
    if (edge < 0.3) return grain(0x24232a, wx, wy, 0.1);
    if (r < 2.05) return 0x1f1e24;
    // carved circle of runes round the fountain
    if (r > 2.25 && r < 2.95) {
      if (r < 2.33 || r > 2.87) return 0x151418;
      const n = 28;
      const a = (th / (2 * Math.PI)) * n;
      const ai = Math.floor(a), fa = a - ai;
      const fr = (r - 2.33) / 0.54;
      // each glyph: a few strokes picked by hash
      const h = hash(ai, 5, 5);
      const stroke = (fa > 0.2 && fa < 0.3) || (h > 0.5 && fr > 0.45 && fr < 0.58 && fa > 0.2 && fa < 0.8) ||
        (h > 0.3 && Math.abs(fa - 0.25 - fr * 0.5) < 0.07) || (h < 0.6 && fa > 0.68 && fa < 0.78 && fr > 0.2);
      if (stroke && fa > 0.15 && fa < 0.85 && fr > 0.12 && fr < 0.88) { glow(0xff5a1a); return 0x8a2a10; }
      return grain(0x2a292e, wx, wy, 0.08);
    }
    if (r > 4.2 && r < 4.34) { glow(0x6a1a08); return 0x3a1a12; }
    let c = flags(wx, wy, 0.85, basalt, 0x141317, 11);
    // cracks
    const cr = Math.abs(Math.sin(wx * 3.1 + Math.sin(wy * 2.3) * 2.2) + Math.sin(wy * 4.7 + wx * 0.7));
    if (cr < 0.03 && hash(Math.floor(wx), Math.floor(wy), 8) > 0.5) c = 0x111014;
    return grain(c, wx, wy, 0.06);
  };
}

/** Paints the paving under the whole plaza; grass beds and houses stay see-through. */
function paintFloor(world: WorldMap, pz: SpawnPlaza): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture | null } {
  const W = (pz.x1 - pz.x0 + 1) * TILE, H = (pz.y1 - pz.y0 + 1) * TILE;
  let glowC = 0;
  const painter: Painter = (() => {
    switch (pz.style) {
      case 2: return templeFloor();
      case 3: return gardenFloor();
      case 4: return marketFloor();
      case 5: return ashenFloor((c) => { glowC = c; });
      default: return classicFloor();
    }
  })();
  // painters are written in village coordinates (fountain at 27.5, 22.5)
  const vx = pz.cx - 27.5, vy = pz.cy - 22.5;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const hasGlow = pz.style === 5;
  const gc = hasGlow ? document.createElement('canvas') : null;
  const gctx = gc ? (gc.width = W, gc.height = H, gc.getContext('2d')!) : null;
  const gimg = gctx ? gctx.createImageData(W, H) : null;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const wx = pz.x0 - 0.5 + (px + 0.5) / TILE, wy = pz.y0 - 0.5 + (py + 0.5) / TILE;
      const tx = Math.round(wx), ty = Math.round(wy);
      const i = (py * W + px) * 4;
      const g = world.getGround(tx, ty, 0);
      if (world.houseAt(tx, ty, 0) || g === Ground.Grass || g === Ground.DarkGrass) continue;
      glowC = 0;
      const col = painter(wx - vx, wy - vy, wx - pz.cx, wy - pz.cy);
      img.data[i] = (col >> 16) & 255;
      img.data[i + 1] = (col >> 8) & 255;
      img.data[i + 2] = col & 255;
      img.data[i + 3] = 255;
      if (gimg) {
        gimg.data[i] = (glowC >> 16) & 255;
        gimg.data[i + 1] = (glowC >> 8) & 255;
        gimg.data[i + 2] = glowC & 255;
        gimg.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (gctx && gimg) gctx.putImageData(gimg, 0, 0);
  const wrap = (cv: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = PAINTED ? THREE.LinearFilter : THREE.NearestFilter;
    t.minFilter = PAINTED ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
    t.generateMipmaps = PAINTED;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: wrap(c), glow: gc ? wrap(gc) : null };
}

// ------------------------------------------------------------------ water & particles

interface Emitter { p: V3; v: V3; jitter: number; rate: number; ember?: boolean }

class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private src: Uint16Array;
  private m = new THREE.Matrix4();
  constructor(private readonly emitters: Emitter[], private readonly n: number, color: number, size: number, private readonly gravity: number, private readonly maxLife: number) {
    const geo = new THREE.OctahedronGeometry(size, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), n);
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.src = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      this.src[i] = i % Math.max(1, emitters.length);
      this.spawn(i);
      this.life[i] = Math.random() * maxLife;
    }
  }

  private spawn(i: number): void {
    const e = this.emitters[this.src[i]];
    if (!e) return;
    const j = e.jitter;
    this.pos[i * 3] = e.p[0] + (Math.random() - 0.5) * j * 0.3;
    this.pos[i * 3 + 1] = e.p[1];
    this.pos[i * 3 + 2] = e.p[2] + (Math.random() - 0.5) * j * 0.3;
    this.vel[i * 3] = e.v[0] + (Math.random() - 0.5) * j;
    this.vel[i * 3 + 1] = e.v[1] * (0.85 + Math.random() * 0.3);
    this.vel[i * 3 + 2] = e.v[2] + (Math.random() - 0.5) * j;
    this.life[i] = 0;
  }

  update(dt: number, floorY: number): void {
    const d = Math.min(dt, 0.05);
    for (let i = 0; i < this.n; i++) {
      this.life[i] += d;
      this.vel[i * 3 + 1] -= this.gravity * d;
      this.pos[i * 3] += this.vel[i * 3] * d;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * d;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * d;
      if (this.life[i] > this.maxLife || this.pos[i * 3 + 1] < floorY) this.spawn(i);
      const s = this.gravity < 0 ? Math.max(0.2, 1 - this.life[i] / this.maxLife) : 1;
      this.m.makeScale(s, s, s).setPosition(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ the builder

export function buildPlazaView(world: WorldMap, pz: SpawnPlaza, M: MatFn): PlazaView {
  const group = new THREE.Group();
  group.name = 'spawnPlaza';
  const flameMats: Mat[] = [];
  const animTex: Array<{ t: THREE.Texture; vx: number; vy: number }> = [];

  // --- paving
  const floor = paintFloor(world, pz);
  const fw = pz.x1 - pz.x0 + 1, fh = pz.y1 - pz.y0 + 1;
  const floorMat = M(0xffffff, { map: floor.map, emissive: floor.glow ? 0xffffff : 0x000000 });
  floorMat.alphaTest = 0.5;
  if (floor.glow) {
    floorMat.emissiveMap = floor.glow;
    flameMats.push(floorMat);
  }
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), floorMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(pz.x0 - 0.5 + fw / 2, 0.022, pz.y0 - 0.5 + fh / 2);
  plane.receiveShadow = true;
  group.add(plane);

  // --- water materials (shared by every basin, curtain and stream)
  const tint = pz.style === 5 ? 0x4a7a78 : pz.style === 3 ? 0x5f9a96 : pz.style === 2 ? 0x6aaee0 : 0x5a96cc;
  const wTex = waterTexture(pz.style * 13 + 5);
  wTex.repeat.set(2, 2);
  animTex.push({ t: wTex, vx: 0.02, vy: 0.05 });
  const waterMat = M(tint, { map: wTex, emissive: pz.style === 5 ? 0x0a2422 : 0x0c2236 });
  const sTex = streakTexture();
  animTex.push({ t: sTex, vx: 0, vy: 0.9 });
  const fallMat = new THREE.MeshBasicMaterial({ color: pz.style === 5 ? 0x9ac0bc : 0xdcefff, map: sTex, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });

  const water = (geo: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sz = 1) => {
    const me = new THREE.Mesh(geo, waterMat);
    me.position.set(x, y, z);
    me.scale.set(sx, 1, sz);
    me.receiveShadow = true;
    group.add(me);
  };
  const disc = (r: number, x: number, y: number, z: number, seg = 20, sx = 1, sz = 1) => water(new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2), x, y, z, sx, sz);
  /** A ring of falling water from one bowl rim down to the level below. */
  const curtain = (r: number, top: number, bottom: number, x: number, z: number, seg = 16, r2 = r) => {
    const g = new THREE.CylinderGeometry(r, r2, top - bottom, seg, 1, true);
    const me = new THREE.Mesh(g, fallMat);
    me.position.set(x, (top + bottom) / 2, z);
    me.renderOrder = 2;
    group.add(me);
  };
  /** An arcing jet of water from a to b, peaking `lift` above the higher end. */
  const stream = (a: V3, b: V3, lift: number, radius = 0.045) => {
    const mid = new THREE.Vector3((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + lift, (a[2] + b[2]) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a), mid, new THREE.Vector3(...b));
    const me = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, radius, 5), fallMat);
    me.renderOrder = 2;
    group.add(me);
  };

  const emitters: Emitter[] = [];
  const embers: Emitter[] = [];

  // --- static props, merged
  const S = new Mesher();
  S.ao = 0.1;
  const X = pz.cx, Z = pz.cy;
  // banner cloth goes into its own meshes (one per banner type, by the height it hangs from) so it can sway in the wind
  const CLOTH = { column: new Mesher(), pole: new Mesher(), wall: new Mesher() };
  const CLOTH_TOP = { column: 2.42, pole: 2.53, wall: 1.66 };
  for (const m of Object.values(CLOTH)) m.ao = 0.1;
  const at = (p: PlazaProp, f: () => void) => {
    S.push([p.x, 0, p.y], [0, p.r ?? 0, 0]);
    for (const m of Object.values(CLOTH)) m.push([p.x, 0, p.y], [0, p.r ?? 0, 0]);
    f();
    S.pop();
    for (const m of Object.values(CLOTH)) m.pop();
  };

  /** Hollow round wall: inner and outer faces plus a flat top. */
  const wall = (rIn: number, rOut: number, h: number, y: number, c: number, seg = 20, top = c, o: { grit?: number } = {}) => {
    S.add(new THREE.CylinderGeometry(rOut, rOut, h, seg, 1, true), c, [0, y + h / 2, 0], { grit: o.grit ?? 0.1 });
    S.add(new THREE.CylinderGeometry(rIn, rIn, h, seg, 1, true), lerpC(c, 0x000000, 0.25), [0, y + h / 2, 0], { two: true, grit: 0.08 });
    S.add(new THREE.RingGeometry(rIn, rOut, seg).rotateX(-Math.PI / 2), top, [0, y + h + 0.001, 0], { grit: o.grit ?? 0.1 });
  };
  /** A shallow bowl: sloping outside, flat top rim, floor. */
  const bowl = (r: number, rb: number, h: number, y: number, c: number, seg = 16) => {
    S.add(new THREE.CylinderGeometry(r, rb, h, seg, 1, true), c, [0, y + h / 2, 0], { grit: 0.08 });
    S.add(new THREE.RingGeometry(r - 0.07, r, seg).rotateX(-Math.PI / 2), lerpC(c, 0xffffff, 0.15), [0, y + h + 0.002, 0]);
    S.add(new THREE.CircleGeometry(rb, seg).rotateX(Math.PI / 2), lerpC(c, 0x000000, 0.2), [0, y, 0]);
  };
  const flame = (x: number, y: number, z: number, s = 1) => {
    S.cone(0.13 * s, 0.34 * s, 0xffa035, [x, y + 0.17 * s, z], { glow: true }, 5);
    S.cone(0.07 * s, 0.24 * s, 0xffe08a, [x, y + 0.14 * s, z], { glow: true }, 4);
  };

  // ................................................................ fountains
  const fountain = (p: PlazaProp) => {
    S.push([X, 0, Z]);
    switch (p.k) {
      case 'fountain_tiered': {
        const st = 0xb3ab9c, dk = 0x857d71;
        S.add(new THREE.CylinderGeometry(1.95, 2.0, 0.08, 24), 0x5f5a53, [0, 0.06, 0]);
        wall(1.58, 1.84, 0.42, 0.06, 0x8f877a, 24, 0xd6cebd);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          S.box(0.2, 0.5, 0.2, dk, [Math.cos(a) * 1.71, 0.3, Math.sin(a) * 1.71], { r: [0, -a, 0] });
          S.sph(0.08, 0xd8cfbe, [Math.cos(a) * 1.71, 0.6, Math.sin(a) * 1.71], {}, 0);
        }
        S.cyl(0.32, 0.42, 0.65, dk, [0, 0.55, 0], {}, 10);
        S.cyl(0.24, 0.3, 0.12, st, [0, 0.9, 0], {}, 10);
        bowl(0.98, 0.36, 0.24, 0.92, st, 18);
        S.cyl(0.13, 0.17, 0.62, st, [0, 1.42, 0], {}, 8);
        S.ring(0.15, 0.04, 0xd8cfbe, [0, 1.5, 0], {}, Math.PI * 2, 10);
        bowl(0.55, 0.18, 0.17, 1.72, st, 14);
        S.cyl(0.07, 0.1, 0.24, dk, [0, 2.0, 0], {}, 6);
        S.sph(0.11, 0xd8cfbe, [0, 2.17, 0], {}, 1);
        disc(1.62, X, 0.4, Z, 24);
        disc(0.9, X, 1.12, Z, 18);
        disc(0.48, X, 1.86, Z, 14);
        curtain(0.99, 1.15, 0.4, X, Z, 18, 1.06);
        curtain(0.56, 1.88, 1.12, X, Z, 14, 0.6);
        emitters.push({ p: [X, 2.25, Z], v: [0, 2.6, 0], jitter: 1.0, rate: 1 }, { p: [X, 2.25, Z], v: [0, 2.6, 0], jitter: 1.0, rate: 1 });
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          emitters.push({ p: [X + Math.cos(a) * 1.0, 1.15, Z + Math.sin(a) * 1.0], v: [Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4], jitter: 0.4, rate: 1 });
        }
        break;
      }
      case 'fountain_statue': {
        const mar = 0xe2dccd, gold = 0xd8b04a, dk = 0xb9b1a2;
        S.add(new THREE.CylinderGeometry(2.0, 2.05, 0.1, 8), 0x2f4a3e, [0, 0.06, 0], { r: [0, Math.PI / 8, 0] });
        S.push([0, 0, 0], [0, Math.PI / 8, 0]);
        wall(1.58, 1.84, 0.46, 0.08, mar, 8, 0xf0ebe0);
        S.ring(1.85, 0.03, gold, [0, 0.4, 0], { flat: true }, Math.PI * 2, 8);
        S.pop();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          S.cyl(0.07, 0.09, 0.12, gold, [Math.cos(a) * 1.71, 0.6, Math.sin(a) * 1.71], { flat: true }, 6);
          S.sph(0.07, gold, [Math.cos(a) * 1.71, 0.71, Math.sin(a) * 1.71], { flat: true }, 0);
        }
        // stepped pedestal
        S.box(0.9, 0.3, 0.9, dk, [0, 0.4, 0]);
        S.box(0.66, 0.5, 0.66, mar, [0, 0.8, 0]);
        S.box(0.76, 0.08, 0.76, gold, [0, 1.07, 0], { flat: true });
        // robed figure holding a bowl over its head
        S.cone(0.32, 1.0, 0xeae5d8, [0, 1.6, 0], {}, 10);
        S.cyl(0.13, 0.17, 0.3, 0xeae5d8, [0, 2.1, 0], {}, 8);
        S.sph(0.13, 0xf0ebe0, [0, 2.34, 0], {}, 1);
        S.cone(0.17, 0.28, 0xe4dfd2, [0, 2.4, -0.02], {}, 8);
        for (const s of [-1, 1]) S.seg([s * 0.15, 2.1, 0], [s * 0.26, 2.55, 0.02], 0.055, 0.045, 0xeae5d8);
        bowl(0.48, 0.2, 0.14, 2.56, gold, 14);
        S.ring(0.33, 0.025, gold, [0, 1.62, 0.0], { flat: true }, Math.PI * 2, 10);
        disc(1.6, X, 0.42, Z, 8);
        disc(0.42, X, 2.69, Z, 12);
        curtain(0.49, 2.66, 1.12, X, Z, 14, 0.62);
        emitters.push({ p: [X, 2.72, Z], v: [0, 1.2, 0], jitter: 0.8, rate: 1 });
        // four small jets from the rim arcing toward the pedestal
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const ax = Math.cos(a), az = Math.sin(a);
          S.cyl(0.05, 0.07, 0.1, gold, [ax * 1.55, 0.58, az * 1.55], { flat: true }, 6);
          stream([X + ax * 1.55, 0.62, Z + az * 1.55], [X + ax * 0.55, 0.42, Z + az * 0.55], 0.55, 0.035);
          emitters.push({ p: [X + ax * 0.6, 0.45, Z + az * 0.6], v: [0, 0.6, 0], jitter: 0.5, rate: 1 });
        }
        break;
      }
      case 'fountain_pond': {
        const edge = 0x9a9282, top = 0xb2aa98;
        S.push([0, 0, 0], [0, 0, 0], [3.0, 1, 2.0]);
        S.add(new THREE.CylinderGeometry(1, 1, 0.16, 28, 1, true), edge, [0, 0.08, 0]);
        S.add(new THREE.RingGeometry(0.9, 1, 28).rotateX(-Math.PI / 2), top, [0, 0.161, 0]);
        S.add(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 28, 1, true), 0x5a5448, [0, 0.06, 0], { two: true });
        S.pop();
        disc(1, X, 0.09, Z, 28, 2.72, 1.8);
        // a rock islet with a stone urn spilling over
        S.sph(0.42, 0x8a8478, [0, 0.12, 0], { s: [1.3, 0.5, 1] }, 0);
        S.sph(0.3, 0x958f82, [0.28, 0.12, 0.12], { s: [1, 0.6, 1] }, 0);
        S.cyl(0.12, 0.16, 0.3, 0xb8b0a0, [0, 0.42, 0], {}, 8);
        bowl(0.34, 0.14, 0.24, 0.56, 0xb8b0a0, 12);
        disc(0.29, X, 0.78, Z, 12);
        curtain(0.35, 0.79, 0.14, X, Z, 12, 0.48);
        emitters.push({ p: [X, 0.86, Z], v: [0, 1.5, 0], jitter: 0.7, rate: 1 });
        // lily pads and flowers
        const pads: Array<[number, number, number]> = [[-1.7, 0.5, 0.28], [-1.3, -0.7, 0.22], [1.5, 0.75, 0.25], [1.95, -0.3, 0.2], [-0.8, 1.05, 0.18], [0.9, -1.0, 0.2]];
        pads.forEach(([px, pzz, r], i) => {
          S.add(new THREE.CircleGeometry(r, 8, 0.4, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2), i % 2 ? 0x3f8a3a : 0x4f9a42, [px, 0.1, pzz], { r: [0, i * 1.3, 0] });
          if (i % 2 === 0) S.sph(0.06, 0xf2a6c8, [px + 0.05, 0.14, pzz], { flat: true }, 0);
        });
        // reeds at the ends
        for (const [rx, rz] of [[-2.55, -0.3], [-2.4, 0.5], [2.5, 0.35], [2.6, -0.4]] as const) {
          for (let k = 0; k < 4; k++) S.cone(0.025, 0.55 + k * 0.08, 0x5f8a3a, [rx + (k - 1.5) * 0.06, 0.3 + k * 0.04, rz + (k % 2) * 0.05], {}, 3);
          S.cyl(0.03, 0.03, 0.12, 0x6a4a2a, [rx, 0.68, rz], {}, 4);
        }
        break;
      }
      case 'fountain_well': {
        const st = 0xa69e8f, dk = 0x7e776c, bronze = 0x9a6a2e;
        S.push([0, 0, 0], [0, Math.PI / 8, 0]);
        S.add(new THREE.CylinderGeometry(1.05, 1.1, 0.08, 8), 0x5f5951, [0, 0.05, 0]);
        wall(0.78, 0.98, 0.55, 0.06, st, 8, 0xbdb4a3);
        S.pop();
        S.box(0.42, 1.45, 0.42, dk, [0, 0.78, 0]);
        S.box(0.52, 0.12, 0.52, st, [0, 1.5, 0]);
        S.cone(0.42, 0.4, 0x8e3b2e, [0, 1.76, 0], { r: [0, Math.PI / 4, 0] }, 4);
        S.cyl(0.02, 0.02, 0.35, 0x3a3a3e, [0, 2.1, 0], {}, 4);
        S.box(0.22, 0.08, 0.02, bronze, [0.06, 2.22, 0], { flat: true });
        S.sph(0.04, 0xe0b040, [0, 2.3, 0], { flat: true }, 0);
        disc(0.8, X, 0.48, Z, 8);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const ax = Math.cos(a), az = Math.sin(a);
          S.push([ax * 0.22, 1.05, az * 0.22], [0, -a, 0]);
          S.box(0.22, 0.07, 0.07, bronze, [0.08, 0, 0], { flat: true });
          S.sph(0.07, bronze, [-0.01, 0, 0], { flat: true }, 0);
          S.pop();
          stream([X + ax * 0.42, 1.04, Z + az * 0.42], [X + ax * 0.7, 0.48, Z + az * 0.7], 0.06, 0.04);
          emitters.push({ p: [X + ax * 0.7, 0.5, Z + az * 0.7], v: [ax * 0.2, 0.7, az * 0.2], jitter: 0.5, rate: 1 });
        }
        // a bucket on the rim
        S.cyl(0.12, 0.1, 0.2, 0x7a5434, [0.66, 0.72, 0.42], {}, 8);
        S.ring(0.12, 0.012, 0x3a3a3e, [0.66, 0.8, 0.42], {}, Math.PI * 2, 8);
        break;
      }
      case 'fountain_gargoyle': {
        const ba = 0x3c3b42, dk = 0x2a2930, rim = 0x4d4b52;
        S.add(new THREE.CylinderGeometry(2.0, 2.05, 0.1, 8), 0x1f1e24, [0, 0.06, 0], { r: [0, Math.PI / 8, 0] });
        S.push([0, 0, 0], [0, Math.PI / 8, 0]);
        wall(1.56, 1.84, 0.5, 0.08, ba, 8, rim);
        S.pop();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const px = Math.cos(a) * 1.72, pz2 = Math.sin(a) * 1.72;
          if (i % 2 === 0) {
            S.box(0.26, 0.6, 0.26, dk, [px, 0.38, pz2], { r: [0, -a, 0] });
            S.cone(0.17, 0.3, rim, [px, 0.83, pz2], { r: [0, Math.PI / 4 - a, 0] }, 4);
          } else {
            // crouching gargoyle facing the obelisk, spitting water
            S.push([px, 0.6, pz2], [0, Math.PI / 2 - a + Math.PI, 0]);
            const g = 0x55535a;
            S.box(0.3, 0.12, 0.34, dk, [0, 0, 0]);
            S.sph(0.17, g, [0, 0.2, -0.02], { s: [1, 1.1, 1.15] }, 0);
            S.sph(0.12, g, [0, 0.42, 0.1], {}, 0);
            S.box(0.14, 0.07, 0.14, 0x47454c, [0, 0.38, 0.22]);
            S.spike([-0.07, 0.5, 0.08], [-0.4, 1, -0.6], 0.16, 0.035, 0x2a2930);
            S.spike([0.07, 0.5, 0.08], [0.4, 1, -0.6], 0.16, 0.035, 0x2a2930);
            for (const s of [-1, 1]) S.poly([[0, 0], [0.35, 0.25], [0.42, -0.05], [0.2, -0.15]], 0x302f36, [s * 0.12, 0.3, -0.1], { r: [0.3, s > 0 ? -0.6 : Math.PI + 0.6, 0] });
            S.box(0.035, 0.025, 0.02, 0xff5a1a, [-0.05, 0.46, 0.2], { glow: true });
            S.box(0.035, 0.025, 0.02, 0xff5a1a, [0.05, 0.46, 0.2], { glow: true });
            S.pop();
            const ax = Math.cos(a), az = Math.sin(a);
            stream([X + ax * 1.48, 0.98, Z + az * 1.48], [X + ax * 0.45, 0.44, Z + az * 0.45], 0.22, 0.04);
            emitters.push({ p: [X + ax * 0.5, 0.46, Z + az * 0.5], v: [0, 0.7, 0], jitter: 0.5, rate: 1 });
          }
        }
        // jagged obelisk with glowing rune lines
        S.box(0.7, 0.3, 0.7, dk, [0, 0.45, 0]);
        S.push([0, 0.6, 0]);
        S.add(new THREE.CylinderGeometry(0.12, 0.28, 1.9, 4), 0x2c2b32, [0, 0.95, 0], { r: [0, Math.PI / 4, 0] });
        S.cone(0.13, 0.35, 0x34333a, [0, 2.07, 0], { r: [0, Math.PI / 4, 0] }, 4);
        for (const [y, w] of [[0.45, 0.4], [0.8, 0.33], [1.15, 0.27], [1.5, 0.2]] as const) {
          for (const s of [-1, 1]) {
            S.box(w * 0.5, 0.035, 0.02, 0xff4a12, [0, y, s * (0.27 - y * 0.08)], { glow: true });
            S.box(0.02, 0.035, w * 0.5, 0xff4a12, [s * (0.27 - y * 0.08), y + 0.08, 0], { glow: true });
          }
        }
        S.pop();
        disc(1.58, X, 0.44, Z, 8);
        break;
      }
    }
    S.pop();
  };

  // ................................................................ props
  const lampDouble = () => {
    const iron = 0x2d2d33;
    S.box(0.34, 0.12, 0.34, 0x77716a, [0, 0.06, 0]);
    S.cyl(0.06, 0.09, 1.9, iron, [0, 1.0, 0], {}, 8);
    S.ring(0.08, 0.025, iron, [0, 0.35, 0], {}, Math.PI * 2, 8);
    S.box(0.66, 0.05, 0.05, iron, [0, 1.85, 0]);
    for (const s of [-1, 1]) {
      S.cyl(0.015, 0.015, 0.12, iron, [s * 0.3, 1.78, 0], {}, 4);
      S.box(0.18, 0.22, 0.18, 0xffd27a, [s * 0.3, 1.6, 0], { glow: true });
      S.cone(0.15, 0.12, iron, [s * 0.3, 1.77, 0], { r: [0, Math.PI / 4, 0] }, 4);
      S.box(0.2, 0.03, 0.2, iron, [s * 0.3, 1.48, 0]);
    }
    S.sph(0.06, iron, [0, 2.0, 0], {}, 0);
  };
  const bench = () => {
    const wood = 0x8a5e34, st = 0x8c8478;
    for (const s of [-1, 1]) S.box(0.12, 0.3, 0.34, st, [s * 0.36, 0.15, 0]);
    for (let i = 0; i < 3; i++) S.box(0.92, 0.04, 0.1, i % 2 ? 0x7d5530 : wood, [0, 0.32, -0.11 + i * 0.11], { grit: 0.06 });
    S.box(0.92, 0.18, 0.04, wood, [0, 0.5, -0.17], { r: [-0.15, 0, 0], grit: 0.06 });
    for (const s of [-1, 1]) S.box(0.06, 0.3, 0.06, st, [s * 0.36, 0.45, -0.15]);
  };
  const planter = (v: number) => {
    const st = 0xa8a091;
    S.box(0.78, 0.4, 0.78, st, [0, 0.2, 0]);
    S.box(0.86, 0.06, 0.86, 0xc4bcac, [0, 0.42, 0]);
    S.box(0.66, 0.04, 0.66, 0x4a3a28, [0, 0.43, 0]);
    if (v === 0) {
      S.cyl(0.04, 0.05, 0.3, 0x6a4a2a, [0, 0.58, 0], {}, 5);
      S.sph(0.36, 0x3f7d34, [0, 0.95, 0], {}, 1);
      S.sph(0.22, 0x4f9340, [0.1, 1.15, 0.08], {}, 0);
    } else {
      S.sph(0.3, 0x3f7d34, [0, 0.6, 0], { s: [1.1, 0.6, 1.1] }, 1);
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        S.sph(0.06, [0xe8d24a, 0xd84a3a, 0xf2f0e8, 0xb46ad8][i % 4], [Math.cos(a) * 0.24, 0.72, Math.sin(a) * 0.24], { flat: true }, 0);
      }
    }
  };
  const flowerTub = (v: number) => {
    S.cyl(0.3, 0.24, 0.36, 0x9a6a44, [0, 0.18, 0], {}, 10);
    S.ring(0.3, 0.03, 0x5a3a24, [0, 0.33, 0], {}, Math.PI * 2, 10);
    S.sph(0.28, 0x3f7d34, [0, 0.42, 0], { s: [1, 0.6, 1] }, 1);
    const cols = [[0xd84a3a, 0xe8d24a], [0xb46ad8, 0xf2f0e8], [0xe87aa0, 0xe8d24a]][v % 3];
    for (let i = 0; i < 8; i++) {
      const a = i * 0.8 + v;
      S.sph(0.055, cols[i % 2], [Math.cos(a) * (0.08 + (i % 3) * 0.08), 0.55, Math.sin(a) * (0.08 + (i % 3) * 0.08)], { flat: true }, 0);
    }
  };
  const column = () => {
    const mar = 0xe2dccd;
    S.box(0.66, 0.16, 0.66, 0xc8c0b0, [0, 0.08, 0]);
    S.cyl(0.27, 0.3, 0.12, mar, [0, 0.22, 0], {}, 12);
    S.cyl(0.22, 0.25, 2.2, mar, [0, 1.38, 0], {}, 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      S.box(0.03, 2.1, 0.03, 0xc4bcac, [Math.cos(a) * 0.235, 1.38, Math.sin(a) * 0.235]);
    }
    S.cyl(0.32, 0.24, 0.16, mar, [0, 2.56, 0], {}, 12);
    S.box(0.7, 0.14, 0.7, 0xeae5d8, [0, 2.71, 0]);
    S.box(0.72, 0.04, 0.72, 0xd8b04a, [0, 2.64, 0], { flat: true });
  };
  const bannerColumn = (v: number) => {
    const cloth = v ? 0x2f4a3e : 0x8a2420;
    S.box(0.5, 0.05, 0.05, 0xd8b04a, [0, 2.45, 0.3], { flat: true });
    const C = CLOTH.column;
    C.box(0.44, 1.2, 0.02, cloth, [0, 1.82, 0.31], { grit: 0.05 });
    C.poly([[-0.22, 0], [0.22, 0], [0, -0.22]], cloth, [0, 1.22, 0.31], { grit: 0.05 });
    // gold diamond emblem and trim
    C.box(0.16, 0.16, 0.02, 0xe6c25a, [0, 1.95, 0.33], { r: [0, 0, Math.PI / 4], flat: true });
    C.box(0.44, 0.03, 0.02, 0xe6c25a, [0, 2.38, 0.325], { flat: true });
    C.box(0.44, 0.03, 0.02, 0xe6c25a, [0, 1.28, 0.325], { flat: true });
  };
  const brazierGold = () => {
    const gold = 0xc89a3a;
    S.box(0.4, 0.1, 0.4, 0x9a9282, [0, 0.05, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      S.seg([Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2], [Math.cos(a) * 0.08, 0.75, Math.sin(a) * 0.08], 0.035, 0.03, gold);
    }
    bowl(0.3, 0.14, 0.18, 0.75, gold, 10);
    S.sph(0.18, 0x3a2418, [0, 0.88, 0], { s: [1, 0.4, 1] }, 0);
    flame(0, 0.9, 0, 1.3);
    flame(0.08, 0.9, 0.05, 0.8);
    embers.push({ p: [0, 1.2, 0], v: [0, 0.5, 0], jitter: 0.25, rate: 1, ember: true });
  };
  const statueGuard = () => {
    const st = 0xd8d0c0;
    S.box(0.6, 0.35, 0.6, 0xb9b1a2, [0, 0.18, 0]);
    S.box(0.66, 0.06, 0.66, 0xd8b04a, [0, 0.36, 0], { flat: true });
    S.cone(0.25, 0.8, st, [0, 0.79, 0], {}, 8);
    S.cyl(0.13, 0.17, 0.32, st, [0, 1.3, 0], {}, 8);
    S.sph(0.11, st, [0, 1.55, 0], {}, 1);
    S.cone(0.12, 0.16, 0xc8c0b0, [0, 1.68, 0], {}, 6);
    // shield in front and a spear
    S.box(0.3, 0.38, 0.05, 0xc8c0b0, [0, 1.0, 0.22]);
    S.box(0.1, 0.1, 0.02, 0xd8b04a, [0, 1.04, 0.25], { r: [0, 0, Math.PI / 4], flat: true });
    S.cyl(0.02, 0.02, 1.5, 0xb9b1a2, [0.22, 1.1, 0.05], {}, 4);
    S.cone(0.05, 0.16, 0xd8b04a, [0.22, 1.93, 0.05], { flat: true }, 4);
  };
  const dais = () => {
    S.box(1.5, 0.06, 1.3, 0xc8c0b0, [0, 0.05, 0.05]);
    S.box(1.25, 0.06, 1.1, 0xe2dccd, [0, 0.1, 0.0]);
    S.box(1.27, 0.015, 0.03, 0xd8b04a, [0, 0.13, 0.55], { flat: true });
  };
  const hedge = () => {
    S.box(0.92, 0.5, 0.92, 0x3a7030, [0, 0.27, 0], { grit: 0.18 });
    S.box(0.8, 0.12, 0.8, 0x4a8a3c, [0, 0.55, 0], { grit: 0.2 });
  };
  const treeBlossom = (v: number) => {
    const leaf = v ? 0xe8a6c4 : 0xf2c9d8;
    S.cyl(0.08, 0.12, 1.1, 0x6a4a30, [0, 0.55, 0], {}, 6);
    S.seg([0, 0.9, 0], [0.25, 1.3, 0.1], 0.05, 0.04, 0x6a4a30);
    S.seg([0, 0.9, 0], [-0.22, 1.25, -0.1], 0.05, 0.04, 0x6a4a30);
    S.sph(0.55, leaf, [0, 1.55, 0], { grit: 0.18 }, 1);
    S.sph(0.38, lerpC(leaf, 0xffffff, 0.25), [0.3, 1.45, 0.2], { grit: 0.15 }, 1);
    S.sph(0.35, lerpC(leaf, 0x000000, 0.1), [-0.32, 1.4, -0.12], { grit: 0.15 }, 1);
    S.ring(0.2, 0.03, 0x8a8478, [0, 0.04, 0], {}, Math.PI * 2, 10);
  };
  const archPost = () => {
    S.box(0.14, 2.1, 0.14, 0x6a4a2c, [0, 1.05, 0]);
    for (let k = 0; k < 5; k++) S.sph(0.13, k % 2 ? 0x3f7d34 : 0x4a8a3c, [0.05 * (k % 2 ? 1 : -1), 0.4 + k * 0.38, 0.06], {}, 0);
    S.sph(0.05, 0xf2a6c8, [0.1, 1.2, 0.12], { flat: true }, 0);
  };
  const arch = (p: PlazaProp) => {
    const x2 = p.x2 ?? p.x, z2 = p.y2 ?? p.y;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const y0 = 2.1 + Math.sin(t0 * Math.PI) * 0.45, y1 = 2.1 + Math.sin(t1 * Math.PI) * 0.45;
      S.seg([p.x + (x2 - p.x) * t0, y0, p.y + (z2 - p.y) * t0], [p.x + (x2 - p.x) * t1, y1, p.y + (z2 - p.y) * t1], 0.06, 0.06, 0x6a4a2c);
      S.sph(0.16, i % 2 ? 0x3f7d34 : 0x4f9340, [p.x + (x2 - p.x) * t0, y0 + 0.08, p.y + (z2 - p.y) * t0], {}, 0);
      if (i % 2) S.sph(0.05, i % 4 === 1 ? 0xf2a6c8 : 0xf2f0e8, [p.x + (x2 - p.x) * t0 + 0.1, y0 + 0.16, p.y + (z2 - p.y) * t0 + 0.08], { flat: true }, 0);
    }
  };
  const flowerbed = (p: PlazaProp) => {
    const pal = [[0xd84a3a, 0xe8d24a], [0xb46ad8, 0xf2f0e8], [0xe87aa0, 0xf2f0e8], [0xe8d24a, 0xd8803a]][p.v ?? 0];
    for (let i = 0; i < 5; i++) {
      const ox = (hash(p.x, p.y, i) - 0.5) * 0.7, oz = (hash(p.x, p.y, i + 7) - 0.5) * 0.7;
      S.cone(0.05, 0.16, 0x3f7a2a, [p.x + ox, 0.08, p.y + oz], {}, 3);
      S.sph(0.05, pal[i % 2], [p.x + ox, 0.18, p.y + oz], { flat: true }, 0);
    }
  };
  const stall = (v: number) => {
    const canopy = [[0xb83a2e, 0xefe6cf], [0x3f7a4a, 0xefe6cf], [0x3a5a9a, 0xe8c64a], [0xc88a2a, 0x6a3a26]][v % 4];
    const wood = 0x7a5434;
    for (const sx of [-0.85, 0.85]) for (const sz of [-0.3, 0.3]) S.box(0.07, 1.55, 0.07, wood, [sx, 0.78, sz]);
    S.box(1.8, 0.5, 0.5, 0x8a6440, [0, 0.45, 0.15], { grit: 0.08 });
    S.box(1.86, 0.05, 0.6, 0x9a7448, [0, 0.72, 0.15]);
    // striped canopy sloping toward the front
    for (let i = 0; i < 6; i++) S.box(0.31, 0.04, 0.95, canopy[i % 2], [-0.78 + i * 0.31, 1.6, 0.12], { r: [0.28, 0, 0], grit: 0.04 });
    for (let i = 0; i < 6; i++) S.poly([[-0.155, 0], [0.155, 0], [0, -0.14]], canopy[i % 2], [-0.78 + i * 0.31, 1.47, 0.58], { grit: 0.04 });
    // goods on the counter
    const goods = [[0xc83a2a, 0x3f8a3a], [0xd8a83a, 0xa86a2a], [0x8a5ac8, 0xe8e0d0], [0xe8c86a, 0xc8a050]][v % 4];
    for (let i = 0; i < 6; i++) S.sph(0.08, goods[i % 2], [-0.6 + i * 0.24, 0.8, 0.22 + (i % 2) * 0.1], { flat: true }, 0);
    S.box(0.3, 0.14, 0.24, 0x9a7444, [0.62, 0.82, 0.05]);
  };
  const crates = () => {
    S.box(0.5, 0.42, 0.5, 0x9a7444, [-0.12, 0.21, 0.05], { r: [0, 0.2, 0] });
    S.box(0.36, 0.32, 0.36, 0x8a6a40, [0.2, 0.16, -0.15], { r: [0, -0.3, 0] });
    S.box(0.34, 0.3, 0.34, 0xa07a4a, [-0.08, 0.57, 0.02], { r: [0, 0.5, 0] });
  };
  const barrels = () => {
    for (const [bx, bz] of [[-0.18, 0.1], [0.2, -0.12]] as const) {
      S.cyl(0.22, 0.24, 0.56, 0x7b5230, [bx, 0.28, bz], {}, 10);
      S.ring(0.235, 0.02, 0x3d3d42, [bx, 0.14, bz], {}, Math.PI * 2, 10);
      S.ring(0.235, 0.02, 0x3d3d42, [bx, 0.44, bz], {}, Math.PI * 2, 10);
    }
    S.sph(0.08, 0xc83a2a, [-0.18, 0.6, 0.1], {}, 0);
    S.sph(0.08, 0x8ac83a, [-0.1, 0.6, 0.16], {}, 0);
  };
  const sacks = () => {
    for (const [sx, sz, c] of [[-0.18, 0.1, 0xc8b48a], [0.18, 0.05, 0xb8a47a], [0, -0.2, 0xd2c09a]] as const) {
      S.sph(0.22, c, [sx, 0.2, sz], { s: [1, 1.1, 0.9] }, 1);
      S.cyl(0.05, 0.08, 0.1, c, [sx, 0.42, sz], {}, 5);
    }
  };
  const pole = () => {
    S.cyl(0.05, 0.07, 2.3, 0x6a4a2c, [0, 1.15, 0], {}, 6);
    S.cone(0.09, 0.18, 0xd8b04a, [0, 2.38, 0], { flat: true }, 6);
  };
  const bunting = (p: PlazaProp) => {
    const x2 = p.x2 ?? p.x, z2 = p.y2 ?? p.y;
    const len = Math.hypot(x2 - p.x, z2 - p.y);
    const n = Math.max(4, Math.round(len * 2.2));
    const cols = [0xb83a2e, 0xe8c64a, 0x3a5a9a, 0xefe6cf, 0x3f7a4a];
    const dir = Math.atan2(z2 - p.y, x2 - p.x);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const sag = (t: number) => 2.15 - Math.sin(t * Math.PI) * 0.35;
      S.seg([p.x + (x2 - p.x) * t0, sag(t0), p.y + (z2 - p.y) * t0], [p.x + (x2 - p.x) * t1, sag(t1), p.y + (z2 - p.y) * t1], 0.01, 0.01, 0x3a2a1a);
      const tm = (t0 + t1) / 2;
      S.poly([[-0.1, 0], [0.1, 0], [0, -0.22]], cols[(i + (p.v ?? 0)) % cols.length], [p.x + (x2 - p.x) * tm, sag(tm), p.y + (z2 - p.y) * tm], { r: [0, -dir, 0], flat: true, grit: 0.02 });
    }
  };
  const produce = (p: PlazaProp) => {
    S.push([p.x, 0, p.y]);
    S.box(0.44, 0.16, 0.34, 0x9a7444, [0, 0.08, 0]);
    for (let i = 0; i < 5; i++) S.sph(0.07, p.v ? 0x8ac83a : 0xd84a2a, [-0.14 + (i % 3) * 0.14, 0.2, -0.06 + Math.floor(i / 3) * 0.12], { flat: true }, 0);
    S.pop();
  };
  const brazierIron = () => {
    const iron = 0x2a2a2e;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      S.seg([Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [Math.cos(a) * 0.1, 1.05, Math.sin(a) * 0.1], 0.04, 0.035, iron);
      S.spike([Math.cos(a) * 0.3, 1.25, Math.sin(a) * 0.3], [Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4], 0.22, 0.03, iron);
    }
    S.ring(0.2, 0.03, iron, [0, 0.5, 0], {}, Math.PI * 2, 8);
    // open iron basket
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      S.seg([Math.cos(a) * 0.14, 1.02, Math.sin(a) * 0.14], [Math.cos(a) * 0.32, 1.32, Math.sin(a) * 0.32], 0.02, 0.02, iron);
    }
    S.ring(0.32, 0.025, iron, [0, 1.32, 0], {}, Math.PI * 2, 10);
    S.sph(0.24, 0x3a1a10, [0, 1.12, 0], { s: [1, 0.5, 1] }, 0);
    S.sph(0.16, 0xff6a1a, [0, 1.18, 0], { s: [1, 0.4, 1], glow: true }, 0);
    flame(0, 1.16, 0, 1.7);
    flame(0.1, 1.16, -0.06, 1.0);
    flame(-0.1, 1.16, 0.06, 1.1);
    embers.push({ p: [0, 1.55, 0], v: [0, 0.7, 0], jitter: 0.35, rate: 1, ember: true });
  };
  const statueWarden = () => {
    const st = 0x55535a, dk = 0x3a3940;
    S.box(0.62, 0.4, 0.62, dk, [0, 0.2, 0]);
    S.box(0.68, 0.06, 0.68, 0x4a4850, [0, 0.42, 0]);
    // hooded figure leaning on a greatsword
    S.cone(0.28, 1.05, st, [0, 0.97, 0], {}, 7);
    S.sph(0.2, st, [0, 1.48, -0.02], { s: [1.2, 0.8, 1] }, 0);
    S.cone(0.16, 0.36, st, [0, 1.62, -0.04], { r: [-0.25, 0, 0] }, 6);
    S.box(0.14, 0.1, 0.06, 0x111014, [0, 1.54, 0.12]);
    S.box(0.03, 0.02, 0.02, 0xff5a1a, [-0.035, 1.55, 0.15], { glow: true });
    S.box(0.03, 0.02, 0.02, 0xff5a1a, [0.035, 1.55, 0.15], { glow: true });
    S.box(0.06, 0.95, 0.02, 0x6a6870, [0, 0.95, 0.27]);
    S.box(0.28, 0.05, 0.06, dk, [0, 1.42, 0.27]);
    S.sph(0.05, dk, [0, 1.5, 0.27], {}, 0);
    for (const s of [-1, 1]) S.seg([s * 0.2, 1.3, 0.02], [s * 0.06, 1.38, 0.25], 0.05, 0.04, st);
  };
  const bannerPole = () => {
    const iron = 0x2a2a2e, cloth = 0x5a1410;
    S.cyl(0.05, 0.06, 2.7, iron, [0, 1.35, 0], {}, 6);
    S.box(0.6, 0.04, 0.04, iron, [0, 2.55, 0.06]);
    S.spike([0, 2.7, 0], [0, 1, 0], 0.25, 0.05, iron);
    const C = CLOTH.pole;
    C.poly([[-0.26, 0], [0.26, 0], [0.26, -1.25], [0.12, -1.05], [0.02, -1.3], [-0.1, -1.0], [-0.26, -1.2]], cloth, [0, 2.53, 0.08], { grit: 0.08 });
    C.poly([[-0.26, 0], [0.26, 0], [0.26, -0.06], [-0.26, -0.06]], 0x111014, [0, 2.53, 0.09], { flat: true });
    // a pale horned emblem
    C.box(0.14, 0.14, 0.02, 0x8a8478, [0, 2.0, 0.095], { r: [0, 0, Math.PI / 4], flat: true });
    C.spike([-0.06, 2.06, 0.095], [-0.5, 1, 0], 0.14, 0.02, 0x8a8478, { flat: true });
    C.spike([0.06, 2.06, 0.095], [0.5, 1, 0], 0.14, 0.02, 0x8a8478, { flat: true });
  };
  const treeCaged = () => {
    const iron = 0x2a2a2e, bark = 0x3a3028;
    S.cyl(0.4, 0.4, 0.12, 0x24232a, [0, 0.06, 0], {}, 8);
    S.seg([0, 0, 0], [0.05, 1.0, 0.02], 0.13, 0.09, bark);
    S.horn([[0.05, 0.95, 0.02], [0.32, 1.35, 0.1], [0.52, 1.65, 0.0], [0.62, 1.9, -0.1]], 0.07, bark);
    S.horn([[0.05, 1.0, 0.02], [-0.25, 1.4, -0.05], [-0.45, 1.7, 0.1], [-0.4, 2.0, 0.2]], 0.07, bark);
    S.horn([[0.05, 1.1, 0.02], [0.0, 1.55, -0.2], [0.1, 1.95, -0.3]], 0.05, bark);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      S.box(0.03, 0.9, 0.03, iron, [Math.cos(a) * 0.38, 0.5, Math.sin(a) * 0.38]);
      S.cone(0.03, 0.1, iron, [Math.cos(a) * 0.38, 1.0, Math.sin(a) * 0.38], {}, 4);
    }
    S.ring(0.38, 0.02, iron, [0, 0.85, 0], {}, Math.PI * 2, 8);
    S.ring(0.38, 0.02, iron, [0, 0.3, 0], {}, Math.PI * 2, 8);
  };
  const railing = () => {
    const iron = 0x2a2a2e;
    S.box(1.0, 0.1, 0.12, 0x24232a, [0, 0.05, 0]);
    S.box(1.0, 0.04, 0.04, iron, [0, 0.75, 0]);
    S.box(1.0, 0.04, 0.04, iron, [0, 0.3, 0]);
    for (let i = 0; i < 5; i++) {
      S.box(0.035, 0.85, 0.035, iron, [-0.4 + i * 0.2, 0.45, 0]);
      S.cone(0.045, 0.16, iron, [-0.4 + i * 0.2, 0.95, 0], {}, 4);
    }
  };

  // ................................................................ the city around the plaza
  const smoke: Emitter[] = [];
  const beams: Array<{ x: number; z: number }> = [];
  const flagsAt: Array<{ p: V3; c: number; s: number }> = [];
  const GOLD = 0xe6c25a, IRON = 0x34343a, WOOD = 0x7a5232, DKWOOD = 0x4e3420;
  /** Emblems drawn on a board facing +z, centred on the origin, about 0.5 across. */
  const emblem = (v: number) => {
    const o = { flat: true };
    switch (v) {
      case 0: // bell
        S.cone(0.17, 0.3, GOLD, [0, 0.0, 0.02], o, 8);
        S.box(0.4, 0.05, 0.03, GOLD, [0, -0.15, 0.02], o);
        S.sph(0.05, 0xb8862a, [0, -0.2, 0.03], o, 0);
        S.box(0.05, 0.08, 0.03, GOLD, [0, 0.18, 0.02], o);
        break;
      case 1: // chest
        S.box(0.42, 0.24, 0.04, 0x8a5a2a, [0, -0.07, 0.02], o);
        S.box(0.42, 0.12, 0.04, 0xa06a32, [0, 0.11, 0.02], o);
        S.box(0.44, 0.03, 0.05, GOLD, [0, 0.04, 0.03], o);
        S.box(0.08, 0.1, 0.05, GOLD, [0, -0.02, 0.04], o);
        for (const sx of [-0.18, 0.18]) S.box(0.03, 0.38, 0.05, GOLD, [sx, -0.01, 0.03], o);
        break;
      case 2: // gold coin
        S.add(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16).rotateX(Math.PI / 2), 0xd8a832, [0, 0, 0.03], o);
        S.add(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16).rotateX(Math.PI / 2), 0xf2d270, [0, 0, 0.035], o);
        S.box(0.08, 0.08, 0.07, 0xb8862a, [0, 0, 0.04], { r: [0, 0, Math.PI / 4], flat: true });
        break;
      case 3: // crossed sword and hammer
        S.push([0, 0, 0.03], [0, 0, Math.PI / 4]);
        S.box(0.05, 0.5, 0.03, 0xd8dce4, [0, 0.03, 0], o);
        S.box(0.18, 0.04, 0.04, GOLD, [0, -0.17, 0], o);
        S.box(0.04, 0.1, 0.04, 0x6a4a2a, [0, -0.24, 0], o);
        S.pop();
        S.push([0, 0, 0.035], [0, 0, -Math.PI / 4]);
        S.box(0.04, 0.48, 0.03, 0x8a5a2a, [0, -0.02, 0], o);
        S.box(0.2, 0.1, 0.05, 0x6a6e78, [0, 0.2, 0], o);
        S.pop();
        break;
      case 4: { // star
        const pts: [number, number][] = [];
        for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * Math.PI * 2; const r = i % 2 ? 0.1 : 0.24; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
        S.poly(pts, 0xc8a8ff, [0, 0, 0.03], { glow: true });
        break;
      }
      case 5: // sack of goods
        S.sph(0.17, 0xc8b48a, [0, -0.06, 0.03], { s: [1, 1, 0.3], flat: true }, 1);
        S.box(0.1, 0.1, 0.04, 0xb8a47a, [0, 0.14, 0.03], o);
        S.box(0.16, 0.03, 0.05, 0x8a2a20, [0, 0.1, 0.04], o);
        break;
      case 6: // bow and arrow
        S.add(new THREE.TorusGeometry(0.22, 0.025, 4, 12, Math.PI), 0x8a5a2a, [0, 0, 0.03], { r: [0, 0, -Math.PI / 2], flat: true });
        S.box(0.012, 0.44, 0.02, 0xeae0c8, [0, 0, 0.03], o);
        S.box(0.4, 0.025, 0.03, 0xd8dce4, [0.06, 0, 0.04], o);
        S.cone(0.05, 0.1, 0xd8dce4, [0.29, 0, 0.04], { r: [0, 0, -Math.PI / 2], flat: true }, 4);
        break;
      case 7: // crossed swords
        for (const sg of [-1, 1]) {
          S.push([0, 0, 0.03], [0, 0, sg * Math.PI / 4]);
          S.box(0.045, 0.5, 0.03, 0xd8dce4, [0, 0.03, 0], o);
          S.box(0.16, 0.04, 0.04, GOLD, [0, -0.16, 0], o);
          S.pop();
        }
        break;
      case 8: // notices
        S.box(0.18, 0.22, 0.02, 0xf2ead2, [-0.1, 0.05, 0.03], { r: [0, 0, 0.1], flat: true });
        S.box(0.18, 0.2, 0.02, 0xe8dcb8, [0.12, -0.04, 0.03], { r: [0, 0, -0.12], flat: true });
        S.box(0.04, 0.04, 0.03, 0xc83a2a, [-0.1, 0.15, 0.04], o);
        break;
      default: // anchor
        S.box(0.05, 0.42, 0.03, 0x2a3a5a, [0, 0, 0.03], o);
        S.box(0.24, 0.04, 0.03, 0x2a3a5a, [0, 0.14, 0.03], o);
        S.add(new THREE.TorusGeometry(0.17, 0.03, 4, 12, Math.PI), 0x2a3a5a, [0, -0.1, 0.03], { r: [0, 0, Math.PI], flat: true });
        S.add(new THREE.TorusGeometry(0.05, 0.02, 4, 8), 0x2a3a5a, [0, 0.24, 0.03], o);
        break;
    }
  };
  const signBoard = (v: number) => {
    S.box(0.66, 0.66, 0.06, 0x3a2414, [0, 0, 0]);
    S.box(0.58, 0.58, 0.04, v === 9 ? 0xd8d0b8 : 0x6a4426, [0, 0, 0.02], { grit: 0.05 });
    for (const [x, y] of [[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3]] as const) S.box(0.09, 0.09, 0.05, GOLD, [x, y, 0.03], { flat: true });
    emblem(v);
  };
  const signpost = (v: number) => {
    S.box(0.3, 0.1, 0.3, 0x77716a, [0, 0.05, 0]);
    S.cyl(0.06, 0.07, 2.5, DKWOOD, [0, 1.25, -0.25], {}, 6);
    S.box(1.1, 0.07, 0.08, DKWOOD, [0, 2.45, -0.25]);
    S.sph(0.07, GOLD, [0, 2.55, -0.25], { flat: true }, 0);
    for (const sx of [-0.4, 0.4]) S.box(0.02, 0.2, 0.02, IRON, [sx, 2.33, -0.2]);
    S.push([0, 1.82, -0.15], [-0.45, 0, 0], [1.35, 1.35, 1.35]);
    signBoard(v);
    S.pop();
  };
  const wallSign = (v: number) => {
    S.box(0.05, 0.05, 0.5, IRON, [0, 1.62, 0.3]);
    S.push([0, 1.2, 0.62], [-0.4, 0, 0], [1.3, 1.3, 1.3]);
    signBoard(v);
    S.pop();
  };
  const wallBanner = () => {
    S.box(0.06, 0.06, 0.4, GOLD, [0, 1.75, 0.25], { flat: true });
    const C = CLOTH.wall;
    C.box(0.5, 1.3, 0.03, 0xf0ead8, [0, 1.05, 0.47], { grit: 0.04 });
    C.poly([[-0.25, 0], [0.25, 0], [0, -0.25]], 0xf0ead8, [0, 0.4, 0.47]);
    C.box(0.5, 0.05, 0.035, GOLD, [0, 1.66, 0.48], { flat: true });
    C.box(0.18, 0.18, 0.04, GOLD, [0, 1.15, 0.49], { r: [0, 0, Math.PI / 4], flat: true });
    C.box(0.08, 0.08, 0.045, 0x3c5a8c, [0, 1.15, 0.5], { r: [0, 0, Math.PI / 4], flat: true });
  };
  const bellTower = () => {
    const st = 0xe6dfcc, tr = 0xc8bfa8;
    S.box(1.1, 4.2, 1.1, st, [0, 2.1, 0], { grit: 0.08 });
    for (const y of [1.0, 2.2, 3.4]) S.box(1.16, 0.08, 1.16, tr, [0, y, 0]);
    S.box(0.22, 0.5, 0.04, 0x2a3048, [0, 2.8, 0.56]);
    // open belfry
    for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const) S.box(0.18, 1.0, 0.18, st, [x, 4.7, z]);
    S.box(1.2, 0.12, 1.2, tr, [0, 4.25, 0]);
    S.box(1.25, 0.14, 1.25, tr, [0, 5.24, 0]);
    S.cone(0.3, 0.42, 0xd8a832, [0, 4.75, 0], { flat: true }, 10);
    S.sph(0.06, 0xd8a832, [0, 4.5, 0], { flat: true }, 0);
    S.cone(0.95, 1.4, 0x3c5a8c, [0, 6.0, 0], { r: [0, Math.PI / 4, 0] }, 4);
    S.sph(0.1, GOLD, [0, 6.75, 0], { flat: true }, 0);
    S.cyl(0.025, 0.025, 0.9, IRON, [0, 7.1, 0], {}, 4);
    flagsAt.push({ p: [pz.x0 * 0 + 0, 7.45, 0], c: 0xf0ead8, s: 0.5 });
  };
  const holyLight = (p: PlazaProp) => {
    S.add(new THREE.RingGeometry(0.32, 0.46, 20).rotateX(-Math.PI / 2), 0xffe6a0, [p.x, 0.035, p.y], { glow: true });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      S.box(0.06, 0.01, 0.14, 0xffe6a0, [p.x + Math.cos(a) * 0.56, 0.035, p.y + Math.sin(a) * 0.56], { glow: true, r: [0, -a + Math.PI / 2, 0] });
    }
    beams.push({ x: p.x, z: p.y });
  };
  const pew = () => {
    S.box(0.9, 0.06, 0.36, WOOD, [0, 0.36, 0]);
    S.box(0.9, 0.4, 0.06, WOOD, [0, 0.55, -0.17]);
    for (const sx of [-0.4, 0.4]) S.box(0.06, 0.36, 0.36, DKWOOD, [sx, 0.18, 0]);
  };
  const candles = () => {
    S.box(0.5, 0.7, 0.3, 0xc8bfa8, [0, 0.35, 0]);
    for (let i = 0; i < 5; i++) {
      const x = -0.18 + i * 0.09, h = 0.12 + (i % 2) * 0.08;
      S.cyl(0.025, 0.025, h, 0xf2ead2, [x, 0.7 + h / 2, 0], {}, 5);
      S.cone(0.025, 0.07, 0xffc860, [x, 0.74 + h, 0], { glow: true }, 4);
    }
  };
  const scales = () => {
    S.box(0.36, 0.04, 0.24, GOLD, [0, 0.82, 0], { flat: true });
    S.cyl(0.025, 0.025, 0.5, GOLD, [0, 1.07, 0], {}, 5);
    S.box(0.5, 0.025, 0.025, GOLD, [0, 1.3, 0], { flat: true });
    for (const sx of [-0.22, 0.22]) {
      S.cyl(0.005, 0.005, 0.22, 0x9a7a3a, [sx, 1.19, 0], {}, 3);
      S.cyl(0.1, 0.06, 0.04, GOLD, [sx, 1.07, 0], { flat: true }, 10);
    }
    S.cyl(0.07, 0.07, 0.05, 0xf2d270, [0.12, 0.87, 0.05], { flat: true }, 8);
  };
  const mageTower = () => {
    const st = 0xb8b0c8, dk = 0x8a80a0;
    S.cyl(0.62, 0.7, 5.6, st, [0, 2.8, 0], { grit: 0.1 }, 12);
    for (const y of [1.9, 3.6, 5.2]) S.cyl(0.68, 0.68, 0.1, dk, [0, y, 0], {}, 12);
    // glowing coloured windows all round
    const wc = [0x9a6aff, 0x5ac8ff, 0xff7ad8, 0x6affb8];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + row * 0.4 + Math.PI / 2;
      S.box(0.18, 0.36, 0.05, wc[(i + row) % 4], [Math.cos(a) * 0.66, 1.3 + row * 1.7, Math.sin(a) * 0.66], { glow: true, r: [0, -a + Math.PI / 2, 0] });
    }
    S.cyl(0.8, 0.8, 0.14, dk, [0, 5.66, 0], {}, 12);
    S.cone(0.85, 2.1, 0x4a2a7a, [0, 6.78, 0], {}, 12);
    // floating crystal and runes at the top
    S.add(new THREE.OctahedronGeometry(0.22, 0), 0x9ae8ff, [0, 8.2, 0], { glow: true, s: [1, 1.6, 1] });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      S.box(0.14, 0.14, 0.03, 0xc8a8ff, [Math.cos(a) * 0.5, 7.7, Math.sin(a) * 0.5], { glow: true, r: [0, -a, Math.PI / 4] });
    }
  };
  const crystals = (v: number) => {
    const c = v ? 0x7ad8ff : 0xb88aff;
    S.box(0.4, 0.14, 0.4, 0x6a6278, [0, 0.07, 0]);
    S.add(new THREE.OctahedronGeometry(0.16, 0), c, [0, 0.42, 0], { glow: true, s: [1, 2.1, 1] });
    S.add(new THREE.OctahedronGeometry(0.1, 0), c, [0.14, 0.3, 0.08], { glow: true, s: [1, 1.8, 1], r: [0, 0, -0.4] });
    S.add(new THREE.OctahedronGeometry(0.09, 0), c, [-0.13, 0.28, -0.04], { glow: true, s: [1, 1.7, 1], r: [0, 0, 0.4] });
  };
  const potionShelf = () => {
    S.box(0.8, 1.2, 0.28, DKWOOD, [0, 0.6, -0.2]);
    const pc = [0xd83a3a, 0x3a6ad8, 0x8a3ad8, 0x3ad87a];
    for (const y of [0.45, 0.85]) {
      S.box(0.78, 0.04, 0.3, WOOD, [0, y - 0.02, -0.08]);
      for (let i = 0; i < 5; i++) {
        S.sph(0.06, pc[(i + Math.round(y * 10)) % 4], [-0.3 + i * 0.15, y + 0.06, -0.05], { glow: true }, 0);
        S.cyl(0.02, 0.02, 0.06, 0xd8d0c0, [-0.3 + i * 0.15, y + 0.14, -0.05], {}, 4);
      }
    }
  };
  const mannequin = (v: number) => {
    const c = v ? 0x3f6b4a : 0x8a3a2a;
    S.box(0.3, 0.06, 0.3, DKWOOD, [0, 0.03, 0]);
    S.cyl(0.03, 0.03, 0.8, DKWOOD, [0, 0.45, 0], {}, 5);
    S.cyl(0.2, 0.15, 0.55, c, [0, 1.1, 0], {}, 8);
    S.box(0.5, 0.12, 0.2, c, [0, 1.32, 0]);
    S.sph(0.1, 0xd8c8a8, [0, 1.5, 0], {}, 1);
    S.box(0.2, 0.06, 0.04, 0xd8b04a, [0, 1.2, 0.17], { flat: true });
  };
  const fabric = () => {
    const cs = [0x8a2a2a, 0x2a5a8a, 0x3f6b4a, 0xc8a84a, 0x6a3a7a];
    S.box(0.8, 0.08, 0.5, DKWOOD, [0, 0.3, 0]);
    for (const sx of [-0.35, 0.35]) S.box(0.06, 0.3, 0.45, DKWOOD, [sx, 0.15, 0]);
    for (let i = 0; i < 5; i++) S.add(new THREE.CylinderGeometry(0.075, 0.075, 0.44, 8).rotateX(Math.PI / 2), cs[i], [-0.3 + i * 0.15, 0.42, 0], {});
    for (let i = 0; i < 3; i++) S.add(new THREE.CylinderGeometry(0.075, 0.075, 0.44, 8).rotateX(Math.PI / 2), cs[(i + 2) % 5], [-0.15 + i * 0.15, 0.55, 0], {});
  };
  const chimney = () => {
    S.box(0.75, 4.0, 0.75, 0x6a5a50, [0, 2.0, 0], { grit: 0.12 });
    S.box(0.86, 0.16, 0.86, 0x4a3e38, [0, 4.0, 0]);
    S.box(0.5, 0.05, 0.5, 0xff6a20, [0, 4.09, 0], { glow: true });
    smoke.push({ p: [0, 4.15, 0], v: [0.15, 0.7, 0.05], jitter: 0.35, rate: 1 });
  };
  const anvilCoals = () => {
    // a stone forge hearth with glowing coals and an anvil beside it
    S.box(0.5, 0.42, 0.5, 0x6a6058, [-0.18, 0.21, -0.1]);
    S.box(0.4, 0.05, 0.4, 0x2a1a14, [-0.18, 0.44, -0.1]);
    for (let i = 0; i < 6; i++) S.sph(0.06, i % 2 ? 0xff5a18 : 0xffa030, [-0.32 + (i % 3) * 0.13, 0.48, -0.2 + Math.floor(i / 3) * 0.17], { glow: true }, 0);
    flame(-0.18, 0.46, -0.1, 0.7);
    embers.push({ p: [-0.18, 0.6, -0.1], v: [0, 0.6, 0], jitter: 0.3, rate: 1, ember: true });
    S.box(0.14, 0.3, 0.14, 0x3a2a1e, [0.24, 0.15, 0.2]);
    S.box(0.36, 0.1, 0.16, 0x4a4a52, [0.24, 0.35, 0.2]);
    S.cone(0.06, 0.16, 0x4a4a52, [0.47, 0.36, 0.2], { r: [0, 0, -Math.PI / 2] }, 4);
    S.box(0.05, 0.24, 0.04, 0x6a4a2a, [0.2, 0.5, 0.2], { r: [0, 0, 0.6] });
    S.box(0.12, 0.06, 0.08, 0x5a5a62, [0.14, 0.6, 0.2], { r: [0, 0, 0.6] });
  };
  const weaponRack = () => {
    S.box(0.86, 0.06, 0.2, DKWOOD, [0, 1.1, -0.15]);
    S.box(0.86, 0.06, 0.2, DKWOOD, [0, 0.25, -0.15]);
    for (const sx of [-0.4, 0.4]) S.box(0.06, 1.2, 0.06, DKWOOD, [sx, 0.6, -0.15]);
    for (let i = 0; i < 4; i++) {
      const x = -0.27 + i * 0.18;
      S.box(0.04, 0.8, 0.02, 0xd0d4dc, [x, 0.75, -0.08]);
      S.box(0.14, 0.03, 0.04, i % 2 ? GOLD : 0x6a6e78, [x, 0.34, -0.08], { flat: true });
      if (i === 1) S.box(0.18, 0.14, 0.04, 0x8a8e98, [x, 1.15, -0.06]);
    }
  };
  const armourStand = (v: number) => {
    const m = v ? 0x8a8e98 : 0xb0b4bc;
    S.box(0.34, 0.06, 0.34, DKWOOD, [0, 0.03, 0]);
    S.cyl(0.03, 0.03, 0.8, DKWOOD, [0, 0.45, 0], {}, 5);
    S.cyl(0.22, 0.17, 0.55, m, [0, 1.1, 0], {}, 8);
    S.sph(0.12, m, [-0.25, 1.33, 0], { s: [1, 0.7, 1] }, 1);
    S.sph(0.12, m, [0.25, 1.33, 0], { s: [1, 0.7, 1] }, 1);
    S.sph(0.14, m, [0, 1.55, 0], {}, 1);
    S.box(0.18, 0.04, 0.05, 0x2a2a30, [0, 1.56, 0.12]);
    if (!v) S.box(0.36, 0.42, 0.05, 0x8a3a2a, [0.35, 0.6, 0.1], { r: [0, -0.4, 0] });
  };
  const dummy = () => {
    S.box(0.3, 0.08, 0.3, DKWOOD, [0, 0.04, 0]);
    S.cyl(0.04, 0.04, 1.4, DKWOOD, [0, 0.7, 0], {}, 5);
    S.cyl(0.2, 0.18, 0.55, 0xc8b48a, [0, 1.05, 0], {}, 8);
    S.box(0.8, 0.07, 0.07, DKWOOD, [0, 1.2, 0]);
    S.sph(0.15, 0xc8b48a, [0, 1.48, 0], {}, 1);
    S.add(new THREE.RingGeometry(0.06, 0.11, 10), 0xc83a2a, [0, 1.1, 0.19], { flat: true });
    S.box(0.6, 0.03, 0.03, 0x8a6a40, [0, 0.9, 0.0], { r: [0, 0, 0.2] });
  };
  const ringRug = (p: PlazaProp) => {
    S.add(new THREE.RingGeometry(1.0, 1.15, 20).rotateX(-Math.PI / 2), 0xc8a84a, [p.x, 0.03, p.y], { flat: true });
    S.add(new THREE.CircleGeometry(1.0, 20).rotateX(-Math.PI / 2), 0x9a6a3a, [p.x, 0.028, p.y], { flat: true });
  };
  const awning = () => {
    const red = 0xb83a2a, wh = 0xf0e6d0;
    for (let i = 0; i < 6; i++) S.box(0.42, 0.04, 0.95, i % 2 ? wh : red, [-1.05 + i * 0.42, 1.55, 0.4], { r: [0.35, 0, 0] });
    for (let i = 0; i < 6; i++) S.poly([[-0.21, 0], [0.21, 0], [0, -0.16]], i % 2 ? wh : red, [-1.05 + i * 0.42, 1.38, 0.86]);
    for (const sx of [-1.25, 1.25]) S.cyl(0.035, 0.035, 1.4, DKWOOD, [sx, 0.7, 0.85], {}, 5);
  };
  const pavilion = () => {
    for (const [x, z] of [[-0.45, -0.4], [0.45, -0.4], [-0.45, 0.4], [0.45, 0.4]] as const) S.cyl(0.05, 0.06, 1.9, DKWOOD, [x, 0.95, z], {}, 6);
    S.box(1.25, 0.08, 1.1, DKWOOD, [0, 1.9, 0]);
    for (const sg of [-1, 1]) S.box(1.35, 0.06, 0.72, 0x8e3b2e, [0, 2.12, sg * 0.3], { r: [sg * 0.55, 0, 0] });
    S.box(1.4, 0.08, 0.08, 0x4a2f1b, [0, 2.32, 0]);
    // the notice board itself (the market board object) gets a header plank and a sign
    S.box(1.0, 0.16, 0.05, 0x5a3a20, [0, 1.62, 0.38]);
    S.push([0, 2.5, 0.25], [-0.35, 0, 0]);
    S.push([0, 0, 0], [0, 0, 0], [0.7, 0.7, 0.7]);
    signBoard(8);
    S.pop();
    S.pop();
  };

  for (const p of pz.props) {
    switch (p.k) {
      case 'fountain_tiered': case 'fountain_statue': case 'fountain_pond': case 'fountain_well': case 'fountain_gargoyle':
        fountain(p);
        break;
      case 'lamp_double': at(p, lampDouble); break;
      case 'bench': at(p, bench); break;
      case 'planter': at(p, () => planter(p.v ?? 0)); break;
      case 'flower_tub': at(p, () => flowerTub(p.v ?? 0)); break;
      case 'column': at(p, column); break;
      case 'banner_column': at(p, () => bannerColumn(p.v ?? 0)); break;
      case 'brazier_gold': at(p, brazierGold); break;
      case 'statue_guard': at(p, statueGuard); break;
      case 'dais': at(p, dais); break;
      case 'hedge': at(p, hedge); break;
      case 'tree_blossom': at(p, () => treeBlossom(p.v ?? 0)); break;
      case 'arch_post': at(p, archPost); break;
      case 'arch': arch(p); break;
      case 'flowerbed': flowerbed(p); break;
      case 'stall': at(p, () => stall(p.v ?? 0)); break;
      case 'crates': at(p, crates); break;
      case 'barrels': at(p, barrels); break;
      case 'sacks': at(p, sacks); break;
      case 'pole': at(p, pole); break;
      case 'bunting': bunting(p); break;
      case 'produce': produce(p); break;
      case 'brazier_iron': at(p, brazierIron); break;
      case 'statue_warden': at(p, statueWarden); break;
      case 'banner_pole': at(p, bannerPole); break;
      case 'tree_caged': at(p, treeCaged); break;
      case 'railing_spiked': at(p, railing); break;
      case 'signpost': at(p, () => signpost(p.v ?? 0)); break;
      case 'wall_sign': at(p, () => wallSign(p.v ?? 0)); break;
      case 'wall_banner': at(p, wallBanner); break;
      case 'bell_tower': at(p, bellTower); for (const f of flagsAt) if (f.p[0] === 0 && f.p[2] === 0) { f.p = [p.x, f.p[1], p.y]; } break;
      case 'holy_light': holyLight(p); break;
      case 'pew': at(p, pew); break;
      case 'candles': at(p, candles); break;
      case 'scales': at(p, scales); break;
      case 'mage_tower': at(p, mageTower); break;
      case 'crystals': at(p, () => crystals(p.v ?? 0)); break;
      case 'potion_shelf': at(p, potionShelf); break;
      case 'mannequin': at(p, () => mannequin(p.v ?? 0)); break;
      case 'fabric': at(p, fabric); break;
      case 'chimney': at(p, chimney); break;
      case 'anvil_coals': at(p, anvilCoals); break;
      case 'weapon_rack': at(p, weaponRack); break;
      case 'armour_stand': at(p, () => armourStand(p.v ?? 0)); break;
      case 'dummy': at(p, dummy); break;
      case 'ring': ringRug(p); break;
      case 'awning': at(p, awning); break;
      case 'pavilion': at(p, pavilion); break;
      default: break;
    }
    for (const e of smoke) if (!(e as { placed?: boolean }).placed) {
      e.p = [e.p[0] + p.x, e.p[1], e.p[2] + p.y];
      (e as { placed?: boolean }).placed = true;
    }
    // embers are pushed in prop-local coordinates: move them to the prop's tile
    for (const e of embers) if (!(e as { placed?: boolean }).placed) {
      e.p = [e.p[0] + p.x, e.p[1], e.p[2] + p.y];
      (e as { placed?: boolean }).placed = true;
    }
  }

  const base = S.build('base');
  const glow = S.build('glow');
  if (base) {
    const bm = M(0xffffff);
    bm.vertexColors = true;
    // painted style: hand-painted wear (grain, chips, moss, rust) from the built atlas, same vertex colours
    if (PAINTED) { paintDetail(base); useBuiltAtlas(bm); }
    const me = new THREE.Mesh(base, bm);
    me.castShadow = true;
    me.receiveShadow = true;
    group.add(me);
  }
  for (const k of ['column', 'pole', 'wall'] as const) {
    const geo = CLOTH[k].build('base');
    if (!geo) continue;
    const cm = M(0xffffff);
    cm.vertexColors = true;
    cm.side = THREE.DoubleSide;
    // wall banners hang flat against a wall: they only stir
    applyWind(cm, k === 'wall' ? { ...WIND_CLOTH, gale: 0.05, calm: 0.01 } : WIND_CLOTH, `max(0.0, ${CLOTH_TOP[k].toFixed(2)} - wLocal.y)`);
    const me = new THREE.Mesh(geo, cm);
    me.castShadow = true;
    me.receiveShadow = true;
    group.add(me);
  }
  // flames, lantern glass and runes are unlit (full colour) and flicker together
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  if (glow) group.add(new THREE.Mesh(glow, glowMat));

  const spray = emitters.length ? new Particles(emitters, Math.min(110, emitters.length * 18), pz.style === 5 ? 0xb8d8d4 : 0xf4fbff, 0.048, 4.2, 1.4) : null;
  if (spray) group.add(spray.mesh);
  // painted style: a soft halo over every brazier / fire bowl
  const halos = PAINTED && embers.length ? new GlowSprites() : null;
  if (halos) { for (const e of embers) halos.add(e.p[0], e.p[1] + 0.05, e.p[2], 1.9, 0xffa040); halos.build(group); }
  const sparks = embers.length ? new Particles(embers, embers.length * 6, 0xffa040, 0.025, -0.4, 1.3) : null;
  if (sparks) group.add(sparks.mesh);
  const fumes = smoke.length ? new Particles(smoke, smoke.length * 28, 0x8a8480, 0.13, -0.15, 3.2) : null;
  if (fumes) group.add(fumes.mesh);
  // shafts of holy light over the spawn point
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const b of beams) {
    const me = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 4.5, 16, 1, true), beamMat);
    me.position.set(b.x, 2.25, b.z);
    me.renderOrder = 3;
    group.add(me);
  }
  // waving flags
  const flagMeshes: Array<{ geo: THREE.BufferGeometry; base: Float32Array }> = [];
  for (const f of flagsAt) {
    const geo = new THREE.PlaneGeometry(1.0 * f.s * 2, 0.6 * f.s * 2, 8, 2).translate(f.s, 0, 0);
    const me = new THREE.Mesh(geo, M(f.c));
    (me.material as THREE.Material).side = THREE.DoubleSide;
    me.position.set(f.p[0], f.p[1], f.p[2]);
    group.add(me);
    flagMeshes.push({ geo, base: Float32Array.from(geo.attributes.position.array as Float32Array) });
  }

  let time = 0;
  let flagPhase = 0, flagWind = 0.3;
  return {
    group,
    flameMats,
    update(dt: number): void {
      time += dt;
      glowMat.color.setScalar(0.86 + Math.sin(time * 9) * 0.08 + Math.sin(time * 23) * 0.06);
      if (halos) halos.material.opacity = 0.5 + Math.sin(time * 9) * 0.07 + Math.sin(time * 23) * 0.05;
      for (const a of animTex) {
        a.t.offset.x = (a.t.offset.x + a.vx * dt) % 1;
        a.t.offset.y = (a.t.offset.y + a.vy * dt) % 1;
      }
      spray?.update(dt, 0.3);
      sparks?.update(dt, -1);
      fumes?.update(dt, -1);
      beamMat.opacity = 0.18 + Math.sin(time * 1.6) * 0.06;
      flagWind = WIND.enabled.value ? WIND.strength.value : 0.3;
      flagPhase += dt * (4 + flagWind * 5);
      for (const f of flagMeshes) {
        const pos = f.geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const x = f.base[i * 3];
          // flags flap harder and faster in a strong wind (render/weather/wind.ts)
          pos.setZ(i, Math.sin(flagPhase - x * 4) * (0.07 + flagWind * 0.16) * x);
        }
        pos.needsUpdate = true;
      }
    },
  };
}

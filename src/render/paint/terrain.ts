import * as THREE from 'three';
import { hash2, Rng } from '../../game/core/rng';
import { Ground, type WorldMap } from '../../game/world/WorldMap';
import type { Mat } from '../models/parts';
import { CAVE_UNIFORMS } from '../caveRock';
import { applyWind, WIND_GRASS } from '../weather/wind';
import { base, blotches, CELL, cracks, dots, mixC, Noise, paintNoise, type Paint } from '../paintTextures';

/**
 * Painted style (render/style.ts), owner 2026-10-23 "grim, brutal, detailed — work
 * on the whole game": the wet-and-rocky set of the terrain.
 *
 * - Rounded, irregular rock masses for cliffs, cave walls and reef walls (subdivided
 *   blocks with rounded corners, bulges, strata ledges and an uneven top), smooth-shaded.
 * - One hand-painted rock face texture (layers, cracks, ledge highlights) tinted per
 *   instance, plus a shader overlay per region: moss on earth, frost on ice, warm
 *   wind-bands on sandstone, ash and glowing seams on volcanic rock, grime on crypt
 *   stone, slime on swamp rock, coral crust on the reef. Cave walls read the region from
 *   the cave-rock mask, everything else from a uniform.
 * - Reeds along swamp water and some lake shores (sway in the wind), embers rising off lava.
 *
 * Everything is instanced in map chunks (BIBLE §6 performance rules).
 */

/** Rock regions (same order as caveRock RockStyle, plus the reef). */
export enum RockLook { Earth = 0, Ice = 1, Sandstone = 2, Volcanic = 3, Crypt = 4, Swamp = 5, Reef = 6 }

/** Base tint of each look (multiplies the neutral painted rock texture). */
export const ROCK_TINT: Record<number, number> = {
  0: 0x8c7a66, 1: 0x7c8894, 2: 0xb48e5c, 3: 0x4c423e, 4: 0x5e5a56, 5: 0x5e6248, 6: 0x6a8a88,
};

/** The look of a cliff from the ground around it. */
export function cliffLook(world: WorldMap, x: number, y: number, z: number): RockLook {
  const c = [0, 0, 0, 0];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const g = world.getGround(x + dx, y + dy, z);
    if (g === Ground.Snow || g === Ground.Ice) c[1]++;
    else if (g === Ground.Sand) c[2]++;
    else if (g === Ground.Ash || g === Ground.Lava) c[3]++;
    else if (g === Ground.Swamp) c[0] += 0.5;
    else if (g !== Ground.Void && g !== Ground.Water && g !== Ground.DeepWater) c[0]++;
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (c[i] > c[best]) best = i;
  return best as RockLook;
}

// ------------------------------------------------------------------ geometry

/** Welds vertices at the same position, so normals come out smooth (positions only). */
function weld(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.attributes.position;
  const map = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(x, y, z); }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

function wob(x: number, y: number, z: number, s: number): number {
  return Math.sin(x * 3.7 + s) * Math.cos(z * 3.1 + s * 1.3) * 0.5 + Math.sin(y * 5.3 + z * 2.1 + s * 2.1) * 0.3 + Math.sin((x - y) * 7.9 + z * 4.3 + s * 0.7) * 0.2;
}

/**
 * w = block width (a little over one tile so the open faces bulge ~0.1 into the floor),
 * round = top-edge rounding, corner = plan radius of an outer corner (two open sides
 * meeting) — owner 2026-10-23 "a corner must NOT look angular".
 */
interface RockShape { w: number; h: number; segs: [number, number, number]; round: number; corner: number; amp: number; taper: number; strata: number; top: number }

export type RockKind = 'cliff' | 'wall' | 'reef' | 'crypt';
const SHAPES: Record<RockKind, RockShape> = {
  cliff: { w: 1.2, h: 3.1, segs: [5, 6, 5], round: 0.3, corner: 0.44, amp: 0.09, taper: 0.16, strata: 0.04, top: 0.22 },
  wall: { w: 1.2, h: 1, segs: [5, 4, 5], round: 0.24, corner: 0.42, amp: 0.08, taper: 0.12, strata: 0.03, top: 0.12 },
  reef: { w: 1.2, h: 1.9, segs: [5, 4, 5], round: 0.34, corner: 0.44, amp: 0.1, taper: 0.22, strata: 0.02, top: 0.2 },
  // crypt masonry: worn, rounded corners but straighter faces
  crypt: { w: 1.16, h: 1, segs: [5, 3, 5], round: 0.12, corner: 0.3, amp: 0.025, taper: 0.03, strata: 0, top: 0.03 },
};

/** Open sides of a rock tile: N = −z, E = +x, S = +z, W = −x. */
export const SIDE_N = 1, SIDE_E = 2, SIDE_S = 4, SIDE_W = 8;
/** The six shape classes of open sides (every mask is one of these turned by quarter turns). */
export const ROCK_CLASSES = [0, 1, 3, 5, 7, 15];
/** The open-side mask after a quarter turn (+90° about y: E→N, N→W, W→S, S→E). */
function turn(m: number): number {
  return (m & SIDE_E ? SIDE_N : 0) | (m & SIDE_N ? SIDE_W : 0) | (m & SIDE_W ? SIDE_S : 0) | (m & SIDE_S ? SIDE_E : 0);
}
const SHAPE_OF: Array<{ cls: number; rot: number }> = [];
for (let ci = 0; ci < ROCK_CLASSES.length; ci++) {
  let m = ROCK_CLASSES[ci];
  for (let r = 0; r < 4; r++) { SHAPE_OF[m] ??= { cls: ci, rot: r }; m = turn(m); }
}
/** Which shape class (index into ROCK_CLASSES) and how many quarter turns (about +y) draw a rock tile with these open sides. */
export function rockShape(open: number): { cls: number; rot: number } {
  return SHAPE_OF[open & 15];
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/**
 * A rock block standing on y = 0 (centre x = z = 0). Its open sides (class from
 * ROCK_CLASSES) are rounded, bulging, layered and lean back toward the top; closed
 * sides stay flat and reach just past the tile edge, so neighbouring blocks join
 * into one rock mass with a level top instead of a grid of boxes.
 */
export function rockGeo(kind: RockKind, cls = 15): THREE.BufferGeometry {
  const mask = ROCK_CLASSES[cls] ?? 15;
  const key = `${kind}${mask}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const S = SHAPES[kind];
  const hw = S.w / 2, hc = 0.53;
  const oE = !!(mask & SIDE_E), oW = !!(mask & SIDE_W), oN = !!(mask & SIDE_N), oS = !!(mask & SIDE_S);
  let g: THREE.BufferGeometry = new THREE.BoxGeometry(2, S.h, 2, S.segs[0], S.segs[1], S.segs[2]);
  g.translate(0, S.h / 2, 0);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = weld(g);
  const p = g.attributes.position as THREE.BufferAttribute;
  const seed = mask * 1.37 + (kind === 'cliff' ? 1.1 : kind === 'reef' ? 5.3 : kind === 'crypt' ? 7.4 : 3.2);
  const r = S.round;
  const v = new THREE.Vector3(), inner = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const ux = p.getX(i), uz = p.getZ(i);
    v.set(ux * (ux > 0 ? (oE ? hw : hc) : (oW ? hw : hc)), p.getY(i), uz * (uz > 0 ? (oS ? hw : hc) : (oN ? hw : hc)));
    const ty = v.y / S.h;
    // rounded only toward the open sides (and the top edge along them)
    const x0 = oW ? -hw + r : -hc, x1 = oE ? hw - r : hc, z0 = oN ? -hw + r : -hc, z1 = oS ? hw - r : hc;
    inner.set(THREE.MathUtils.clamp(v.x, x0, x1), Math.min(v.y, S.h - r), THREE.MathUtils.clamp(v.z, z0, z1));
    dir.subVectors(v, inner);
    const dl = dir.length();
    if (dl > 1e-5) v.copy(inner).addScaledVector(dir, r / dl);
    // outer corners (two open sides meeting) round off in plan: the square corner quadrant is
    // mapped onto a quarter circle, the same at every height
    const ox = v.x > 0 ? oE : oW, oz = v.z > 0 ? oS : oN;
    if (ox && oz) {
      const c0 = hw - S.corner;
      const a = Math.abs(v.x) - c0, b = Math.abs(v.z) - c0;
      if (a > 0 && b > 0) {
        const k = Math.max(a, b) / Math.hypot(a, b);
        v.x = Math.sign(v.x) * (c0 + a * k);
        v.z = Math.sign(v.z) * (c0 + b * k);
      }
    }
    // how much this vertex faces an open side
    const wx = v.x > 0 ? (oE ? Math.abs(ux) : 0) : (oW ? Math.abs(ux) : 0);
    const wz = v.z > 0 ? (oS ? Math.abs(uz) : 0) : (oN ? Math.abs(uz) : 0);
    const wo = Math.max(wx, wz);
    if (ty < 0.001) { v.x += Math.sign(v.x) * wx * 0.04; v.z += Math.sign(v.z) * wz * 0.04; p.setXYZ(i, v.x, v.y, v.z); continue; }
    const strata = S.strata ? Math.sign(Math.sin((v.y + wob(v.x, 0, v.z, seed) * 0.25) * (kind === 'cliff' ? 4.2 : 6.5))) * S.strata : 0;
    const bulge = wob(v.x * 1.3, v.y * 0.9, v.z * 1.3, seed) * S.amp * (0.6 + ty * 0.8) + strata;
    const lean = S.taper * ty * ty;
    v.x += Math.sign(v.x) * wx * (bulge - lean * hw);
    v.z += Math.sign(v.z) * wz * (bulge - lean * hw);
    if (ty > 0.95) v.y += wob(v.x * 2.1, 3, v.z * 2.1, seed + 9) * S.top * wo;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // uv (the painted rock shader maps the texture in world space; three still wants the attribute)
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) - p.getZ(i); uv[i * 2 + 1] = p.getY(i); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

/**
 * The fillet that rounds an inner (concave) rock corner: a curved rock mass standing in the
 * corner where two rock faces meet at 90°, so the floor meets the rock in a rounded curve.
 * Local frame: the corner is at the origin, the open floor is the +x / +z quadrant.
 */
export function filletGeo(kind: RockKind): THREE.BufferGeometry {
  const key = `fillet-${kind}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const S = SHAPES[kind];
  const face = S.w / 2 - 0.5;
  const rf = kind === 'crypt' ? 0.3 : 0.42;
  const cc = face + rf;
  const NA = 9, NY = kind === 'cliff' ? 7 : 5;
  const pos: number[] = [];
  const idx: number[] = [];
  const seed = kind.length * 2.3 + 11;
  for (let j = 0; j <= NY; j++) {
    const ty = j / NY;
    const y = ty * S.h * 0.985;
    const lean = S.taper * ty * ty * (S.w / 2);
    for (let i = 0; i <= NA; i++) {
      const th = (i / NA) * Math.PI / 2;
      const ex = Math.sin(th * 2);
      let x = cc - rf * Math.cos(th), z = cc - rf * Math.sin(th);
      // bulge like the faces it joins (only in the middle of the arc, so the ends meet the walls)
      const bulge = (wob(x * 1.3, y * 0.9, z * 1.3, seed) * S.amp * (0.6 + ty * 0.8)) * ex;
      // the face normal points at the arc centre (into the floor); the top leans back like the walls
      x += Math.cos(th) * (bulge - lean);
      z += Math.sin(th) * (bulge - lean);
      pos.push(x, y + (j === NY ? wob(x * 2.1, 3, z * 2.1, seed + 9) * S.top * 0.5 : 0), z);
    }
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) {
    const a = j * (NA + 1) + i, b = a + 1, c2 = a + NA + 1, d = c2 + 1;
    idx.push(a, b, c2, b, d, c2);
  }
  // top cap: a fan from the corner (inside the rock) to the top arc
  const top0 = NY * (NA + 1);
  const ci = pos.length / 3;
  pos.push(-0.06, S.h * 0.985, -0.06);
  for (let i = 0; i < NA; i++) idx.push(ci, top0 + i, top0 + i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) - p.getZ(i); uv[i * 2 + 1] = p.getY(i); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

/**
 * Inner corners of a rock mass: for every rock tile whose diagonal neighbour is open while
 * both tiles beside that diagonal are rock, a fillet at the shared tile corner. `rock(x, y)`
 * says whether a tile is part of the mass. Returns the corner point and the turn (about +y)
 * that points the fillet's open quadrant at the floor.
 */
export function innerCorners(x: number, y: number, rock: (x: number, y: number) => boolean, out: Array<{ x: number; y: number; rot: number }>): void {
  for (const [dx, dy, rot] of DIAG) {
    if (rock(x + dx, y + dy) || !rock(x + dx, y) || !rock(x, y + dy)) continue;
    out.push({ x: x + dx * 0.5, y: y + dy * 0.5, rot });
  }
}
// local +x/+z quadrant turned to face the diagonal (dx, dy): rotation about +y maps (1, 1) → (dx, dy)
const DIAG: Array<[number, number, number]> = [[1, 1, 0], [1, -1, Math.PI / 2], [-1, -1, Math.PI], [-1, 1, -Math.PI / 2]];

// ------------------------------------------------------------------ textures

function canvasTex(paint: (p: Paint) => void, seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = CELL;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  paint({ ctx, rng: new Rng(seed), n: new Noise(seed * 3 + 7) });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

let rockFaceTex: THREE.CanvasTexture | null = null;
/** A neutral, light hand-painted rock face: strata layers, cracks, ledge highlights and shadows. */
export function rockFace(): THREE.CanvasTexture {
  if (rockFaceTex) return rockFaceTex;
  rockFaceTex = canvasTex((p) => {
    base(p, (x, y) => {
      const n = p.n.fbm(x, y, 4, 5);
      const n2 = p.n.fbm(x + 40, y * 0.35, 8, 3);
      // layers: bands across the face, bent by noise
      const band = Math.sin((y + n * 60) * 0.11);
      const ledge = Math.max(0, Math.sin((y + n2 * 40) * 0.055));
      let v = 150 + band * 14 + (n - 0.5) * 38;
      v += ledge > 0.94 ? 20 : ledge < 0.08 ? -18 : 0;
      const gr = (p.rng.next() - 0.5) * 14;
      const warm = (n2 - 0.5) * 16;
      return [v + gr + warm, v + gr, v + gr - warm * 0.6];
    });
    blotches(p, 14, [40, 36, 30], 12, 36, 0.16);
    blotches(p, 8, [230, 224, 210], 10, 24, 0.07);
    cracks(p, 18, [30, 26, 22], 10, 0.7);
    cracks(p, 8, [30, 26, 22], 16, 0.5);
    dots(p, 260, [mixC([60, 56, 50], [0, 0, 0], 0.2), [210, 204, 190]], 0.5, 1.4, 0.55);
  }, 777);
  return rockFaceTex;
}

let cryptTex: THREE.CanvasTexture | null = null;
/** Rough-hewn crypt masonry: big uneven blocks, deep grimy joints, chips and stains. */
export function cryptMasonry(): THREE.CanvasTexture {
  if (cryptTex) return cryptTex;
  cryptTex = canvasTex((p) => {
    const rows = 4, rh = CELL / rows;
    const offs = [0, 0.45, 0.2, 0.7];
    const widths: number[][] = [];
    for (let r = 0; r < rows; r++) { const w: number[] = []; let s = 0; while (s < CELL) { const bw = 52 + p.rng.next() * 50; w.push(s); s += bw; } widths.push(w); }
    base(p, (x, y) => {
      const r = Math.floor(y / rh);
      const xx = (x + offs[r] * CELL) % CELL;
      const ws = widths[r];
      let k = 0;
      while (k + 1 < ws.length && ws[k + 1] <= xx) k++;
      const x0 = ws[k], x1 = k + 1 < ws.length ? ws[k + 1] : CELL;
      const ly = y - r * rh;
      const wob = (p.n.fbm(x, y, 16, 2) - 0.5) * 6;
      const edge = Math.min(xx - x0, x1 - xx, ly, rh - ly) + wob;
      const n = p.n.fbm(x, y, 8, 4);
      const tone = 130 + ((k * 37 + r * 11) % 5) * 9;
      let v = tone + (n - 0.5) * 50;
      if (edge < 3) v = 40 + n * 20;
      else if (edge < 6) v += ly < rh / 2 ? 16 : -26;
      const g = (p.rng.next() - 0.5) * 10;
      return [v + g, v + g - 2, v + g - 6];
    });
    blotches(p, 14, [24, 30, 18], 8, 24, 0.35);
    cracks(p, 14, [24, 20, 16], 8, 0.6);
  }, 919);
  return cryptTex;
}

// ------------------------------------------------------------------ material

const OVERLAY_HEAD = /* glsl */ `
uniform sampler2D uRockNoise;
uniform float uRockLook;
uniform float uRockTime;
uniform float uRockSelf;
#ifdef ROCK_MASK
uniform sampler2D uRockMask;
uniform vec2 uRockSize;
#endif
varying vec3 vRockW;
varying vec3 vRockN;
vec3 rockGlow = vec3(0.0);
vec3 rgbL(vec3 c) { return pow(c, vec3(2.2)); }`;

const OVERLAY_VERT_HEAD = /* glsl */ `
varying vec3 vRockW;
varying vec3 vRockN;`;
const OVERLAY_VERT = /* glsl */ `
  {
    vec4 rw = vec4(transformed, 1.0);
    vec3 rn = objectNormal;
    #ifdef USE_INSTANCING
      rw = instanceMatrix * rw;
      rn = mat3(instanceMatrix) * rn;
    #endif
    rw = modelMatrix * rw;
    vRockW = rw.xyz;
    vRockN = normalize(mat3(modelMatrix) * rn);
  }`;

// world-space (triplanar) painted texture: neighbouring blocks share one continuous face, nothing stretches
const TRI_FRAG = /* glsl */ `
#ifdef USE_MAP
  {
    vec3 an = abs(normalize(vRockN));
    an = pow(an, vec3(4.0));
    an /= an.x + an.y + an.z;
    vec3 P = vRockW;
    vec4 tx = texture2D(map, vec2(P.z * 0.8, P.y * 0.7));
    vec4 tz = texture2D(map, vec2(P.x * 0.8, P.y * 0.7));
    vec4 ty = 0.5 * (texture2D(map, P.xz * 0.9) + texture2D(map, mat2(0.6, -0.8, 0.8, 0.6) * P.xz * 1.23 + 0.31));
    diffuseColor *= tx * an.x + ty * an.y + tz * an.z;
  }
#endif`;

const OVERLAY_FRAG = /* glsl */ `
  {
    float look = uRockLook;
    #ifdef ROCK_MASK
    look = floor(texture2D(uRockMask, (floor(vRockW.xz + 0.5) + 0.5) / uRockSize).g * 255.0 + 0.5);
    #endif
    vec3 wn = normalize(vRockN);
    float up = smoothstep(0.3, 0.85, wn.y);
    vec2 sp = vRockW.xz * 0.55 + vec2(vRockW.y * 0.31, -vRockW.y * 0.17);
    float nz = texture2D(uRockNoise, sp).g;
    float nz2 = texture2D(uRockNoise, sp * 2.7 + 0.3).b;
    // broad tint drifting across the rock in world space (instances carry one flat colour, so no tile grid shows)
    diffuseColor.rgb *= 0.8 + texture2D(uRockNoise, vRockW.xz * 0.043 + 0.21).r * 0.4;
    // dark water stains running down the faces
    float streak = smoothstep(0.58, 0.78, texture2D(uRockNoise, vec2(vRockW.x * 1.3 + vRockW.z * 1.1, vRockW.y * 0.06)).r);
    vec3 c = diffuseColor.rgb;
    // the tops: a field of rounded boulders with dark crevices (world space, continuous across blocks)
    if (up > 0.0) {
      vec2 g = vRockW.xz * 1.5 + (vec2(texture2D(uRockNoise, vRockW.xz * 0.11).r, texture2D(uRockNoise, vRockW.xz * 0.11 + 0.5).g) - 0.5) * 2.4;
      vec2 ip = floor(g), fp = fract(g);
      float d1 = 8.0, d2 = 8.0; vec2 rel = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 o = vec2(float(i), float(j));
        vec2 h = fract(sin(vec2(dot(ip + o, vec2(127.1, 311.7)), dot(ip + o, vec2(269.5, 183.3)))) * 43758.5453);
        vec2 r = o + h * 0.8 + 0.1 - fp;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; rel = r; } else if (d < d2) d2 = d;
      }
      float crev = 1.0 - smoothstep(0.02, 0.14, sqrt(d2) - sqrt(d1));
      float dome = clamp(dot(-rel, vec2(-0.66, -0.6)) * 0.9 + 0.5, 0.0, 1.0);
      c *= mix(1.0, (0.75 + dome * 0.45) * (1.0 - crev * 0.6), up);
    }
    c *= 1.0 - streak * 0.3 * (1.0 - up);
    // darker toward the foot of the rock
    c *= 0.7 + 0.3 * smoothstep(0.0, 0.9, vRockW.y - floor(vRockW.y / 3.4 + 0.02) * 3.4);
    if (look < 0.5) {
      float moss = up * smoothstep(0.55, 0.7, nz + nz2 * 0.2) + (1.0 - up) * smoothstep(0.68, 0.82, nz + nz2 * 0.3) * 0.5;
      #ifdef ROCK_MASK
      moss *= 0.4; // damp cave rock: only a little moss
#endif
      c = mix(c, rgbL(vec3(0.27, 0.3, 0.16)) * (0.7 + nz2 * 0.6), clamp(moss, 0.0, 1.0) * 0.6);
    } else if (look < 1.5) {
      float frost = up * smoothstep(0.3, 0.46, nz + nz2 * 0.2) + (1.0 - up) * smoothstep(0.62, 0.72, nz2) * 0.45;
      c = mix(c * rgbL(vec3(0.9, 0.96, 1.04)), rgbL(vec3(0.82, 0.87, 0.92)), clamp(frost, 0.0, 1.0) * 0.9);
    } else if (look < 2.5) {
      c *= 1.0 + sin(vRockW.y * 10.0 + nz * 5.0) * 0.1;
      c = mix(c, rgbL(vec3(0.7, 0.58, 0.4)), up * smoothstep(0.4, 0.55, nz) * 0.6);
    } else if (look < 3.5) {
      c = mix(c, rgbL(vec3(0.24, 0.22, 0.21)), up * smoothstep(0.45, 0.6, nz) * 0.6);
      float ridge = 1.0 - smoothstep(0.0, 0.018, abs(texture2D(uRockNoise, vRockW.xz * 0.21 + vec2(vRockW.y * 0.13, 0.0)).r - 0.5));
      float seam = ridge * (1.0 - up) * smoothstep(0.6, 0.72, nz2);
      float pulse = 0.6 + 0.4 * sin(uRockTime * 1.5 + vRockW.x * 0.7 + vRockW.z * 0.5);
      c = mix(c, rgbL(vec3(0.85, 0.3, 0.08)), seam * 0.8);
      rockGlow += rgbL(vec3(0.95, 0.35, 0.08)) * seam * pulse;
    } else if (look < 4.5) {
      c *= 0.8;
      c = mix(c, rgbL(vec3(0.12, 0.13, 0.09)), smoothstep(0.55, 0.75, nz) * 0.6);
    } else if (look < 5.5) {
      float slime = smoothstep(0.4, 0.56, nz + nz2 * 0.25);
      c = mix(c, rgbL(vec3(0.2, 0.25, 0.12)) * (0.7 + nz2 * 0.6), slime * 0.75);
      c *= 1.0 - streak * 0.2;
    } else {
      float crust = smoothstep(0.52, 0.64, nz + nz2 * 0.3);
      c = mix(c, mix(rgbL(vec3(0.5, 0.3, 0.28)), rgbL(vec3(0.6, 0.5, 0.4)), nz2), crust * 0.7);
      c = mix(c, rgbL(vec3(0.22, 0.3, 0.18)), up * smoothstep(0.4, 0.55, nz2) * 0.7);
      c += rgbL(vec3(0.3)) * step(0.82, nz2) * (1.0 - up) * 0.5;
    }
    diffuseColor.rgb = c;
  }`;

export interface RockMatOpts {
  /** Fixed look for the whole material (cliffs, reef). */
  look?: RockLook;
  /** Read the look per fragment from a cave-rock mask (G = style) instead. */
  mask?: { tex: THREE.Texture; size: THREE.Vector2 };
  /** Share of its own colour that glows (unlit cave rock never goes fully black). */
  selfLit?: number;
  map?: THREE.Texture;
}

/** A painted rock material: cel material + the rock face texture + the per-region overlay. */
export function rockMat(M: (color: number, opts?: { emissive?: number; map?: THREE.Texture | null }) => Mat, o: RockMatOpts): Mat {
  const m = M(0xffffff, { map: o.map ?? rockFace() });
  const noise = paintNoise();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRockNoise = { value: noise };
    sh.uniforms.uRockLook = { value: o.look ?? 0 };
    sh.uniforms.uRockTime = CAVE_UNIFORMS.uTime;
    sh.uniforms.uRockSelf = { value: o.selfLit ?? 0 };
    if (o.mask) {
      sh.uniforms.uRockMask = { value: o.mask.tex };
      sh.uniforms.uRockSize = { value: o.mask.size };
      sh.defines = { ...(sh.defines ?? {}), ROCK_MASK: '' };
    }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>${OVERLAY_VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${OVERLAY_VERT}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>${OVERLAY_HEAD}`)
      .replace('#include <map_fragment>', TRI_FRAG)
      .replace('#include <color_fragment>', `#include <color_fragment>${OVERLAY_FRAG}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += rockGlow + diffuseColor.rgb * uRockSelf;');
  };
  m.customProgramCacheKey = () => `paintRock2${o.mask ? 'M' : ''}`;
  return m;
}

// ------------------------------------------------------------------ instancing helper

const CHUNK = 32;
const _c = new THREE.Color();
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
function compose(x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0, rotZ = 0): THREE.Matrix4 {
  tmpQ.setFromEuler(tmpE.set(rotX, rotY, rotZ));
  return tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
}
class Inst {
  private chunks = new Map<number, { m: number[]; c: number[] }>();
  constructor(readonly geo: THREE.BufferGeometry, readonly mat: THREE.Material, readonly shadows = false, readonly tag = '') {}
  add(mx: THREE.Matrix4, color: number | THREE.Color = 0xffffff): void {
    const e = mx.elements;
    const key = Math.floor((e[14] + 0.5) / CHUNK) * 4096 + Math.floor((e[12] + 0.5) / CHUNK);
    let ch = this.chunks.get(key);
    if (!ch) this.chunks.set(key, (ch = { m: [], c: [] }));
    for (let k = 0; k < 16; k++) ch.m.push(e[k]);
    const c = color instanceof THREE.Color ? color : _c.setHex(color);
    ch.c.push(c.r, c.g, c.b);
  }
  build(group: THREE.Group): void {
    for (const ch of this.chunks.values()) {
      const im = new THREE.InstancedMesh(this.geo, this.mat, ch.m.length / 16);
      im.instanceMatrix.array.set(ch.m);
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ch.c), 3);
      im.castShadow = this.shadows;
      im.receiveShadow = true;
      if (this.tag) im.userData.gfx = this.tag;
      im.computeBoundingSphere();
      im.boundingSphere!.radius += 0.5;
      group.add(im);
    }
  }
}

// ------------------------------------------------------------------ reeds

let reedGeoCache: [THREE.BufferGeometry, THREE.BufferGeometry] | null = null;
function reedGeos(): [THREE.BufferGeometry, THREE.BufferGeometry] {
  if (reedGeoCache) return reedGeoCache;
  const blades: THREE.BufferGeometry[] = [];
  const heads: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const h = 0.42 + hash2(i, 3, 91) * 0.38;
    const a = (i / 7) * Math.PI * 2 + hash2(i, 1, 91);
    const r = 0.04 + hash2(i, 2, 91) * 0.1;
    const b = new THREE.ConeGeometry(0.018, h, 3).translate(0, h / 2, 0).scale(1, 1, 0.35);
    b.rotateZ((hash2(i, 4, 91) - 0.5) * 0.5).rotateX((hash2(i, 5, 91) - 0.5) * 0.4).rotateY(a).translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    blades.push(b);
    if (i % 3 === 0) {
      const head = new THREE.CylinderGeometry(0.022, 0.022, 0.1, 5).translate(Math.cos(a) * r, h + 0.02, Math.sin(a) * r);
      heads.push(head);
    }
  }
  const join = (list: THREE.BufferGeometry[]) => {
    const parts = list.map((g) => g.toNonIndexed());
    const out = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3]] as const) {
      const arr = new Float32Array(parts.reduce((n, g) => n + g.attributes[name].count * size, 0));
      let o = 0;
      for (const g of parts) { arr.set(g.attributes[name].array as Float32Array, o); o += g.attributes[name].count * size; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    out.computeBoundingSphere();
    return out;
  };
  reedGeoCache = [join(blades), join(heads)];
  return reedGeoCache;
}

/** Reed clumps standing in the shallows of swamp water and along some lake and river banks. */
export function buildReeds(world: WorldMap, z: number, group: THREE.Group, M: (color: number) => Mat): void {
  if (z < 0) return;
  const [bg, hg] = reedGeos();
  const bladeMat = M(0xffffff);
  const headMat = M(0xffffff);
  applyWind(bladeMat, WIND_GRASS);
  applyWind(headMat, WIND_GRASS);
  const blades = new Inst(bg, bladeMat, false, 'decor');
  const heads = new Inst(hg, headMat, false, 'decor');
  const isWater = (x: number, y: number) => { const g = world.getGround(x, y, z); return g === Ground.Water; };
  for (let y = 1; y < world.height - 1; y++) for (let x = 1; x < world.width - 1; x++) {
    const g = world.getGround(x, y, z);
    if (g !== Ground.Swamp && g !== Ground.Grass && g !== Ground.DarkGrass && g !== Ground.Jungle) continue;
    if (world.getObj(x, y, z)) continue;
    // the water side of this land tile
    let wx = 0, wy = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isWater(x + dx, y + dy)) { wx += dx; wy += dy; }
    if (!wx && !wy) continue;
    const chance = g === Ground.Swamp ? 0.75 : 0.22;
    if (hash2(x, y, 61) > chance) continue;
    const n = g === Ground.Swamp ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const along = (hash2(x, y, 62 + k) - 0.5) * 0.8;
      const px = x + wx * 0.42 + (wy ? along : 0), py = y + wy * 0.42 + (wx ? along : 0);
      const s = 0.8 + hash2(x, y, 64 + k) * 0.6;
      const mx = compose(px, 0, py, hash2(x, y, 66 + k) * 6.28, s, s * (0.8 + hash2(x, y, 68 + k) * 0.5), s);
      const tone = 0.75 + hash2(x, y, 70 + k) * 0.35;
      blades.add(mx, _c.setRGB(0.42 * tone, 0.46 * tone, 0.2 * tone));
      heads.add(mx, _c.setRGB(0.26, 0.17, 0.1));
    }
  }
  blades.build(group);
  heads.build(group);
}

// ------------------------------------------------------------------ embers

const EMBER_VERT = /* glsl */ `
attribute vec3 seed;
uniform float uTime;
varying float vA;
void main() {
  float ph = fract(uTime * (0.18 + seed.x * 0.22) + seed.y);
  vec3 p = position;
  p.y += ph * (1.4 + seed.z * 1.6);
  p.x += sin(uTime * 1.3 + seed.y * 30.0) * 0.18 * ph;
  p.z += cos(uTime * 1.1 + seed.x * 30.0) * 0.18 * ph;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vA = sin(ph * 3.14159) * (0.6 + 0.4 * sin(uTime * 9.0 + seed.z * 40.0));
  gl_PointSize = 2.0 + seed.z * 2.5;
}`;
const EMBER_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = 1.0 - smoothstep(0.2, 0.5, length(d));
  gl_FragColor = vec4(1.0, 0.55 + vA * 0.25, 0.15, vA * r);
}`;

let emberMat: THREE.ShaderMaterial | null = null;
/** Embers drifting up off the lava tiles of a floor (one Points per map chunk, culled with the chunk). */
export function buildEmbers(world: WorldMap, z: number, group: THREE.Group): void {
  const chunks = new Map<number, number[]>();
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    if (world.getGround(x, y, z) !== Ground.Lava) continue;
    const key = Math.floor(y / CHUNK) * 4096 + Math.floor(x / CHUNK);
    let list = chunks.get(key);
    if (!list) chunks.set(key, (list = []));
    const n = hash2(x, y, 81) < 0.5 ? 1 : 2;
    for (let k = 0; k < n; k++) list.push(x + (hash2(x, y, 82 + k) - 0.5) * 0.9, 0.05, y + (hash2(x, y, 84 + k) - 0.5) * 0.9, hash2(x, y, 86 + k), hash2(x, y, 88 + k), hash2(x, y, 90 + k));
  }
  if (!chunks.size) return;
  emberMat ??= new THREE.ShaderMaterial({
    uniforms: { uTime: CAVE_UNIFORMS.uTime },
    vertexShader: EMBER_VERT,
    fragmentShader: EMBER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (const list of chunks.values()) {
    const n = list.length / 6;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos.set(list.slice(i * 6, i * 6 + 3), i * 3); seed.set(list.slice(i * 6 + 3, i * 6 + 6), i * 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    g.computeBoundingSphere();
    g.boundingSphere!.radius += 3.5;
    const pts = new THREE.Points(g, emberMat);
    pts.name = 'embers';
    pts.renderOrder = 4;
    pts.userData.gfx = 'decor';
    group.add(pts);
  }
}

import * as THREE from 'three';
import { PAINTED } from './style';
import { hash2 } from '../game/core/rng';
import { Ground, Obj, SOLID_OBJ, type WorldMap } from '../game/world/WorldMap';
import type { Mat } from './models/parts';
import { objTex } from './textures';
import { cryptMasonry, filletGeo, innerCorners, ROCK_CLASSES, RockLook, rockGeo, rockMat, rockShape, SIDE_E, SIDE_N, SIDE_S, SIDE_W } from './paint/terrain';

/**
 * Solid rock for the floors below ground. Instead of black nothing between and
 * around the caves, every rock tile is drawn as rock:
 *
 * - one big plane per floor at the height of the rock top, whose shader reads a
 *   per-tile mask (open / wall / rock, rock style, distance to the caves) and
 *   paints rough, cracked stone in the region's colours (earth, ice, desert
 *   sandstone, volcanic with glowing seams, crypt masonry, mossy swamp);
 * - rough, jagged wall blocks along every cave edge (three displaced shapes,
 *   instanced), with stalactites hanging over the faces you look at, rubble and
 *   stalagmites at their feet, torches on the walls of mines, crypts and tombs,
 *   and glowing crystals in the ice and crystal caves;
 * - glow pools under every light, a glow over lava, and drifting dust motes.
 *
 * Everything is built once per floor; animation runs in shaders and on shared
 * materials (no per-tile work per frame).
 */

/** Rock styles, picked from the nearest cave floor. */
export enum RockStyle { Earth = 0, Ice = 1, Sandstone = 2, Volcanic = 3, Crypt = 4, Swamp = 5 }

/** Base colour of each style (walls and rock top). */
export const ROCK_COLOR: Record<RockStyle, number> = {
  [RockStyle.Earth]: 0x7a6858,
  [RockStyle.Ice]: 0x6e8494,
  [RockStyle.Sandstone]: 0xb08c58,
  [RockStyle.Volcanic]: 0x3e3230,
  [RockStyle.Crypt]: 0x524e4a,
  [RockStyle.Swamp]: 0x4e5640,
};

/** Floors drawn with solid rock (rolled out floor by floor). */
export const CAVE_ROCK_FLOORS: number[] = [-1, -2, -3, -4];

/** Height of the rock top above the floor. */
export const ROCK_TOP = 1.85;

/** Shared animation clock and the light the player carries (updated by WorldView). */
export const CAVE_UNIFORMS = {
  uTime: { value: 0 },
  uLight: { value: new THREE.Vector3(0, 0, 0) },
  uLightR: { value: 7 },
};

export interface LightSource { x: number; y: number; h: number; color: number; power: number }

export interface CaveRockView {
  group: THREE.Group;
  lights: LightSource[];
  /** Per-tile rock style of the floor (for the decorations). */
  styleAt: (x: number, y: number) => RockStyle;
}

function styleOfGround(g: Ground): RockStyle {
  switch (g) {
    case Ground.Ice: case Ground.Snow: return RockStyle.Ice;
    case Ground.Sand: return RockStyle.Sandstone;
    case Ground.Ash: case Ground.Lava: return RockStyle.Volcanic;
    case Ground.Stone: case Ground.Marble: case Ground.Wood: return RockStyle.Crypt;
    case Ground.Swamp: case Ground.Water: case Ground.DeepWater: return RockStyle.Swamp;
    default: return RockStyle.Earth;
  }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
function compose(x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0, rotZ = 0): THREE.Matrix4 {
  tmpQ.setFromEuler(tmpE.set(rotX, rotY, rotZ));
  return tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
}

/** Collects instances for one geometry/material pair. */
/**
 * Collects instances for one geometry/material pair, split into square chunks
 * of the map so the camera only draws the few chunks it can see.
 */
class Inst {
  private chunks = new Map<number, { m: number[]; c: number[] }>();
  constructor(readonly geo: THREE.BufferGeometry, readonly mat: THREE.Material, readonly shadows = false) {}
  add(mx: THREE.Matrix4, color: THREE.Color | number = 0xffffff): void {
    const e = mx.elements;
    const key = Math.floor(e[14] / CHUNK) * 4096 + Math.floor(e[12] / CHUNK);
    let ch = this.chunks.get(key);
    if (!ch) this.chunks.set(key, (ch = { m: [], c: [] }));
    for (let k = 0; k < 16; k++) ch.m.push(e[k]);
    const c = color instanceof THREE.Color ? color : _c.setHex(color);
    ch.c.push(c.r, c.g, c.b);
  }
  build(group: THREE.Group, order = 0): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    for (const ch of this.chunks.values()) {
      const n = ch.m.length / 16;
      const im = new THREE.InstancedMesh(this.geo, this.mat, n);
      im.instanceMatrix.array.set(ch.m);
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ch.c), 3);
      im.castShadow = this.shadows;
      im.receiveShadow = true;
      im.renderOrder = order;
      im.computeBoundingSphere();
      group.add(im);
      out.push(im);
    }
    return out;
  }
}
/** Chunk size in tiles for instanced batches. */
const CHUNK = 24;
const _c = new THREE.Color();

// ------------------------------------------------------------------ shared textures and geometry

let wallTexCache: THREE.Texture | null = null;
/** A grey, layered rock face with cracks (tinted per style by the instance colour). */
function wallTex(): THREE.Texture {
  if (wallTexCache) return wallTexCache;
  const S = 32;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d')!;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const strata = Math.sin((j + hash2(i >> 3, 0, 3) * 3) * 0.75) * 10;
    const v = 150 + strata + (hash2(i, j, 11) - 0.5) * 46;
    x.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
    x.fillRect(i, j, 1, 1);
  }
  // cracks
  x.fillStyle = 'rgb(70,70,70)';
  for (let k = 0; k < 7; k++) {
    let cx = Math.floor(hash2(k, 1, 21) * S), cy = Math.floor(hash2(k, 2, 21) * S);
    for (let s = 0; s < 9; s++) { x.fillRect(cx, cy, 1, 1); cx += Math.floor(hash2(k, s, 22) * 3) - 1; cy += 1; }
  }
  // highlights on ledges
  x.fillStyle = 'rgb(196,196,196)';
  for (let k = 0; k < 14; k++) x.fillRect(Math.floor(hash2(k, 3, 23) * S), Math.floor(hash2(k, 4, 23) * S), 2, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  wallTexCache = t;
  return t;
}

let glowTexCache: THREE.Texture | null = null;
/** A soft round glow (for light pools on the floor and halos). */
export function glowTex(): THREE.Texture {
  if (glowTexCache) return glowTexCache;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  glowTexCache = new THREE.CanvasTexture(c);
  return glowTexCache;
}

/** A jagged block: a subdivided box whose sides are pushed in and out (three variants). */
const jagCache: THREE.BufferGeometry[] = [];
function jaggedBlock(v: number): THREE.BufferGeometry {
  if (jagCache[v]) return jagCache[v];
  const g = new THREE.BoxGeometry(1.1, 1, 1.1, 2, 3, 2);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = (a: number) => hash2(Math.round(x * 40) + v * 997, Math.round(y * 40) * 31 + Math.round(z * 40), a);
    if (y > 0.01) {
      // sides bulge in and out more toward the top; the top itself is uneven
      const amt = 0.07 + y * 0.07;
      p.setX(i, x + (k(1) - 0.5) * amt * 2);
      p.setZ(i, z + (k(2) - 0.5) * amt * 2);
      if (y > 0.99) p.setY(i, y + (k(3) - 0.5) * 0.24);
    }
  }
  g.computeVertexNormals();
  jagCache[v] = g.toNonIndexed();
  jagCache[v].computeVertexNormals();
  return jagCache[v];
}

/** Adds a share of a material's own (textured, instance-tinted) colour as glow, so unlit rock still reads as rock. */
export function selfLit<T extends THREE.Material>(m: T, k: number): T {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * ${k.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => 'selfLit' + k;
  return m;
}

// ------------------------------------------------------------------ the rock top shader

const ROCK_TOP_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const ROCK_TOP_FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform vec2 uSize;
uniform float uTime;
uniform vec3 uLight;
uniform float uLightR;
uniform float uYOff;
uniform vec3 uPal[6];
varying vec3 vWorld;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
#ifdef PAINTED
vec3 rgbL(vec3 c) { return pow(c, vec3(2.2)); }
// smooth rock contour (owner 2026-10-23 "a corner must NOT look angular"): the rock share of the
// 4 x 4 tiles round the point through a Catmull-Rom / B-spline mix, as a distance in tiles
// (> 0 inside the rock) — the top only covers the rock a little inside its faces, along a rounded line
vec4 rkW(float t) {
  float t2 = t * t, t3 = t2 * t, u = 1.0 - t;
  vec4 cr = vec4(-t3 + 2.0 * t2 - t, 3.0 * t3 - 5.0 * t2 + 2.0, -3.0 * t3 + 4.0 * t2 + t, t3 - t2) * 0.5;
  vec4 bs = vec4(u * u * u, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0;
  return mix(cr, bs, 0.8);
}
vec4 rkD(float t) {
  float t2 = t * t, u = 1.0 - t;
  vec4 cr = vec4(-3.0 * t2 + 4.0 * t - 1.0, 9.0 * t2 - 10.0 * t, -9.0 * t2 + 8.0 * t + 1.0, 3.0 * t2 - 2.0 * t) * 0.5;
  vec4 bs = vec4(-u * u, 3.0 * t2 - 4.0 * t, -3.0 * t2 + 2.0 * t + 1.0, t2) * 0.5;
  return mix(cr, bs, 0.8);
}
float rockDist(vec2 w) {
  vec2 b = floor(w), t = w - b;
  vec4 wx = rkW(t.x), wy = rkW(t.y), dx = rkD(t.x), dy = rkD(t.y);
  float F = 0.0, gx = 0.0, gy = 0.0;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    vec2 c = clamp(b + vec2(float(i - 1), float(j - 1)), vec2(0.0), uSize - 1.0);
    float r = texture2D(uMask, (c + 0.5) / uSize).r > 0.75 ? 0.0 : 1.0;
    F += wx[i] * wy[j] * r;
    gx += dx[i] * wy[j] * r;
    gy += wx[i] * dy[j] * r;
  }
  return (F - 0.5) / max(length(vec2(gx, gy)), 0.18);
}
// painted style: a field of rounded boulders (cells lit from the upper left, dark crevices),
// with the region's overlay: moss, frost, sand bands, ash with glowing seams, slime
vec3 paintedTop(vec3 base, vec2 q, int st, out float seam) {
  vec2 g = q * 1.4 + (vec2(vn(q * 0.6), vn(q * 0.6 + 5.0)) - 0.5) * 2.2 + (vec2(vn(q * 1.7 + 2.0), vn(q * 1.7 + 9.0)) - 0.5) * 0.9;
  vec2 ip = floor(g), fp = fract(g);
  float d1 = 8.0, d2 = 8.0; vec2 rel = vec2(0.0); float hid = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec2 r = o + vec2(h21(ip + o), h21(ip + o + 13.1)) * 0.8 + 0.1 - fp;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; rel = r; hid = h21(ip + o + 7.7); } else if (d < d2) d2 = d;
  }
  float gap = sqrt(d2) - sqrt(d1);
  float crev = (1.0 - smoothstep(0.015, 0.1, gap)) * smoothstep(0.25, 0.55, vn(q * 2.3 + 1.0));
  // dome: brighter toward the light side of each boulder
  float dome = clamp(dot(-rel, normalize(vec2(-0.6, -0.55))) * 0.8 + 0.5, 0.0, 1.0);
  float n = vn(q * 3.1) * 0.6 + vn(q * 8.7) * 0.4;
  vec3 col = base * (0.66 + hid * 0.16) * (0.78 + dome * 0.38) * (0.7 + n * 0.6);
  col *= 1.0 - crev * 0.55;
  float up = (1.0 - crev) * smoothstep(0.35, 0.9, dome);
  float nn = vn(q * 1.9 + 4.0);
  seam = 0.0;
  if (st == 0) col = mix(col, rgbL(vec3(0.2, 0.25, 0.1)) * (0.7 + n * 0.5), smoothstep(0.62, 0.78, nn) * (1.0 - crev) * 0.55);
  else if (st == 1) col = mix(col, rgbL(vec3(0.8, 0.86, 0.92)), up * smoothstep(0.4, 0.6, nn + n * 0.2) * 0.85);
  else if (st == 2) { col *= 1.0 + sin(q.y * 6.0 + nn * 4.0) * 0.08; col = mix(col, rgbL(vec3(0.7, 0.56, 0.36)), smoothstep(0.6, 0.75, nn) * 0.5); }
  else if (st == 3) { col = mix(col, rgbL(vec3(0.28, 0.26, 0.25)), up * smoothstep(0.45, 0.6, nn) * 0.8); seam = crev; }
  else if (st == 5) col = mix(col, rgbL(vec3(0.15, 0.2, 0.08)), smoothstep(0.45, 0.6, nn) * 0.75);
  return col;
}
#endif
void main() {
  vec2 tile = floor(vWorld.xz + 0.5);
  if (tile.x < 0.0 || tile.y < 0.0 || tile.x >= uSize.x || tile.y >= uSize.y) discard;
  vec4 m = texture2D(uMask, (tile + 0.5) / uSize);
  #ifdef PAINTED
  // over the wall blocks too, but only from a rounded line a little inside the rock faces
  if (m.r > 0.75) discard;
  if (m.r > 0.25 && rockDist(vWorld.xz) < 0.3 + (vn(vWorld.xz * 2.3) - 0.5) * 0.16) discard;
  #else
  if (m.r > 0.25) discard; // open floor or a wall block stands here
  #endif
  // the style is read a little off the tile (by noise), so regions blend along ragged seams, not tile edges
  vec2 jit = vec2(vn(vWorld.xz * 0.8 + 11.0), vn(vWorld.xz * 0.8 + 23.0)) - 0.5;
  vec4 ms = texture2D(uMask, (floor(vWorld.xz + 0.5 + jit * 1.6) + 0.5) / uSize);
  int st = int(ms.g * 255.0 + 0.5);
  vec3 base = uPal[0];
  if (st == 1) base = uPal[1]; else if (st == 2) base = uPal[2]; else if (st == 3) base = uPal[3]; else if (st == 4) base = uPal[4]; else if (st == 5) base = uPal[5];
  vec2 q = vWorld.xz;
  #ifdef PAINTED
  float pseam;
  vec3 col = paintedTop(base, q, st, pseam);
  if (st == 4) {
    vec2 b = fract(vec2(q.x * 1.0 + floor(q.y * 2.0) * 0.5, q.y * 2.0));
    float mortar = 1.0 - smoothstep(0.03, 0.09, min(min(b.x, 1.0 - b.x) * 1.0, min(b.y, 1.0 - b.y) * 0.5));
    col = base * (0.5 + vn(q * 5.0) * 0.25) * (1.0 - mortar * 0.6) * 0.9;
  }
  #else
  // pixel-art friendly: quantise to the 32-px art grid (not in the painted style: smooth)
  #ifndef PAINTED
  q = floor(q * 16.0) / 16.0;
  #endif
  float n = vn(q * 1.7) * 0.55 + vn(q * 4.1) * 0.3 + vn(q * 9.3) * 0.15;
  // boulders: a lumpy height field, lit from the upper left (normal from its slope)
  float e = 0.12;
  float h0 = vn(q * 0.9 + 7.0) * 0.7 + vn(q * 2.2 + 3.0) * 0.3;
  float hx = vn((q + vec2(e, 0.0)) * 0.9 + 7.0) * 0.7 + vn((q + vec2(e, 0.0)) * 2.2 + 3.0) * 0.3;
  float hz = vn((q + vec2(0.0, e)) * 0.9 + 7.0) * 0.7 + vn((q + vec2(0.0, e)) * 2.2 + 3.0) * 0.3;
  vec3 nrm = normalize(vec3((h0 - hx) * 6.0, 1.0, (h0 - hz) * 6.0));
  float sun = clamp(dot(nrm, normalize(vec3(-0.5, 1.0, 0.45))), 0.0, 1.0);
  float lump = smoothstep(0.3, 0.7, h0);
  vec3 col = base * (0.62 + n * 0.5) * (0.55 + sun * 0.6) * (0.85 + lump * 0.25);
  // cracks
  float cr = abs(vn(q * 2.3 + 3.1) - 0.5);
  float crack = 1.0 - smoothstep(0.015, 0.05, cr);
  #ifdef PAINTED
  col *= 1.0 - crack * 0.22;
  #else
  col *= 1.0 - crack * 0.55;
  #endif
  if (st == 4) {
    // crypt: rough-hewn blocks
    vec2 b = fract(vec2(q.x * 1.0 + floor(q.y * 2.0) * 0.5, q.y * 2.0));
    float mortar = step(b.x, 0.06) + step(b.y, 0.1);
    col *= (1.0 - clamp(mortar, 0.0, 1.0) * 0.35) * 0.62;
  }
  if (st == 1) col += vec3(0.10, 0.14, 0.18) * pow(vn(q * 6.0), 6.0) * 2.0; // ice glints
  #endif
  // deep rock darkens away from the caves, but never to black
  float dist = m.b * 255.0;
  col *= mix(1.0, 0.52, smoothstep(1.0, 10.0, dist));
  // light: a little ambient, the carried light, and glowing seams in volcanic rock
  float d = length(vWorld.xz - uLight.xz);
  // rock tops catch more light than the cave floor (they stand nearer the roof), so they read as rock, not as void
  float lit = 0.8 + 1.0 * pow(clamp(1.0 - d / uLightR, 0.0, 1.0), 1.6);
  col *= lit;
  #ifdef PAINTED
  // painted style: the rock mass stays dark and recedes, so the lit cave floor reads first (glowing seams excepted)
  col *= 0.45;
  if (st == 3) col += rgbL(vec3(1.0, 0.45, 0.12)) * pseam * (0.5 + 0.5 * sin(uTime * 1.7 + q.x * 0.7 + q.y * 0.5)) * 0.22;
  #else
  if (st == 3) {
    float seam = crack * (0.6 + 0.4 * sin(uTime * 1.7 + q.x * 0.7 + q.y * 0.5));
    col += vec3(1.0, 0.32, 0.06) * seam * 0.9;
  }
  #endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------ build

/**
 * Builds the rock of one floor below ground. `M` makes a floor-owned toon
 * material; `flameMats` flicker with every other flame in the world.
 */
export function buildCaveRock(world: WorldMap, z: number, M: (color: number, opts?: { emissive?: number; map?: THREE.Texture | null }) => Mat, flameMats: Mat[]): CaveRockView {
  const W = world.width, H = world.height;
  const group = new THREE.Group();
  group.name = 'caveRock';
  const lights: LightSource[] = [];
  const f = world.floor(z);
  const style = new Uint8Array(W * H);
  if (!f) return { group, lights, styleAt: () => RockStyle.Earth };
  const G = f.ground, O = f.obj;
  const open = (i: number) => G[i] !== Ground.Void;
  // the Sunken Reach keeps its own reef look (render/sea): no cave rock in its box
  const sea = world.sea && world.sea.z === z ? world.sea : null;
  const inSea = (i: number) => !!sea && (i % W) >= sea.x0 && (i % W) <= sea.x1 && ((i / W) | 0) >= sea.y0 && ((i / W) | 0) <= sea.y1;

  // distance to the nearest cave floor and the style of that floor (multi-source BFS, 8-way)
  const dist = new Uint8Array(W * H).fill(255);
  const queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  for (let i = 0; i < W * H; i++) if (open(i)) { dist[i] = 0; style[i] = styleOfGround(G[i] as Ground); queue[tail++] = i; }
  while (head < tail) {
    const c = queue[head++];
    const d = dist[c];
    if (d >= 24) continue;
    const cx = c % W, cy = (c / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (dist[n] !== 255) continue;
      dist[n] = d + 1;
      style[n] = style[c];
      queue[tail++] = n;
    }
  }
  const styleAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? RockStyle.Earth : style[y * W + x]) as RockStyle;
  if (tail === 0) return { group, lights, styleAt };

  // the mask texture: R = 255 open floor, 128 wall block, 0 rock; G = style; B = distance
  const mask = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    mask[i * 4] = open(i) || inSea(i) ? 255 : dist[i] === 1 ? 128 : 0;
    mask[i * 4 + 1] = style[i];
    mask[i * 4 + 2] = Math.min(dist[i], 40);
    mask[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(mask, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  const top = new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: tex },
      uSize: { value: new THREE.Vector2(W, H) },
      uTime: CAVE_UNIFORMS.uTime,
      uLight: CAVE_UNIFORMS.uLight,
      uLightR: CAVE_UNIFORMS.uLightR,
      uYOff: { value: 0 },
      uPal: { value: [0, 1, 2, 3, 4, 5].map((s) => new THREE.Color(ROCK_COLOR[s as RockStyle])) },
    },
    vertexShader: ROCK_TOP_VERT,
    fragmentShader: ROCK_TOP_FRAG,
    defines: PAINTED ? { PAINTED: '' } : {},
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), top);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(W / 2 - 0.5, ROCK_TOP, H / 2 - 0.5);
  plane.name = 'rockTop';
  plane.frustumCulled = false;
  group.add(plane);

  // ---------------------------------------------------------------- wall blocks along every cave edge
  // rock is never fully black: a little of its own colour glows back (fake bounce light)
  // painted style: rounded, layered painted rock with the region's overlay read from the mask (render/paint/terrain.ts)
  const wallMat = PAINTED ? rockMat(M, { mask: { tex, size: new THREE.Vector2(W, H) }, selfLit: 0.42 }) : selfLit(M(0xffffff, { map: wallTex() }), 0.42);
  const brickMat = PAINTED ? rockMat(M, { look: RockLook.Crypt, map: cryptMasonry(), selfLit: 0.3 }) : selfLit(M(0xffffff, { map: objTex.brick() }), 0.36);
  const jag = [0, 1, 2].map((v) => new Inst(jaggedBlock(v), wallMat, true));
  const shapes = PAINTED ? ROCK_CLASSES.map((_m, ci) => new Inst(rockGeo('wall', ci), wallMat, true)) : [];
  // painted style: no angular corners (owner 2026-10-23) — worn rounded masonry in crypts, fillets in inner corners
  const brickShapes = PAINTED ? ROCK_CLASSES.map((_m, ci) => new Inst(rockGeo('crypt', ci), brickMat, true)) : [];
  const fillets = PAINTED ? new Inst(filletGeo('wall'), wallMat, true) : null;
  const brickFillets = PAINTED ? new Inst(filletGeo('crypt'), brickMat, true) : null;
  const corners: Array<{ x: number; y: number; rot: number }> = [];
  const bricks = new Inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), brickMat, true);
  const capRocks = new Inst(new THREE.DodecahedronGeometry(0.34, 0), wallMat, false);
  const stalactite = new Inst(new THREE.ConeGeometry(0.09, 0.5, 5).rotateX(Math.PI).translate(0, -0.25, 0), wallMat, false);
  const rubble = new Inst(new THREE.DodecahedronGeometry(0.16, 0), wallMat, false);
  const stalagmite = new Inst(new THREE.ConeGeometry(0.12, 0.6, 5).translate(0, 0.3, 0), wallMat, false);
  const fireMat = M(0xff8a2a, { emissive: 0xff5a10 });
  flameMats.push(fireMat);
  const torchStick = new Inst(new THREE.CylinderGeometry(0.03, 0.04, 0.42, 5).translate(0, 0.21, 0), M(0x4a3020), false);
  const bracket = new Inst(new THREE.BoxGeometry(0.16, 0.06, 0.14), M(0x2a2a2e), false);
  const torchFlame = new Inst(new THREE.ConeGeometry(0.075, 0.24, 5).translate(0, 0.12, 0), fireMat, false);
  const crystalMat = M(0xbfefff, { emissive: 0x2a8ab8 });
  const amethystMat = M(0xd8b8ff, { emissive: 0x6a2ab8 });
  const wallCrystal = new Inst(new THREE.OctahedronGeometry(0.12, 0).scale(0.7, 2.2, 0.7), crystalMat, false);
  const wallAmethyst = new Inst(new THREE.OctahedronGeometry(0.11, 0).scale(0.7, 2.2, 0.7), amethystMat, false);
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const glows = new Inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowMat, false);
  const col = new THREE.Color();

  const isOpen = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && open(y * W + x);
  const walkableBelow = (x: number, y: number) => isOpen(x, y) && !SOLID_OBJ[O[y * W + x]] && O[y * W + x] !== Obj.StairsUp && O[y * W + x] !== Obj.StairsDown;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (open(i) || dist[i] !== 1 || inSea(i)) continue;
    const st = style[i] as RockStyle;
    const h = hash2(x, y, 3);
    // painted style: one level rock top (no per-tile steps) and one colour per region (the shader varies it in world space)
    const hgt = PAINTED ? ROCK_TOP - 0.04 : ROCK_TOP - 0.1 + h * 0.55;
    col.setHex(ROCK_COLOR[st]).multiplyScalar(PAINTED ? 0.97 : 0.82 + hash2(x, y, 4) * 0.3);
    const masonry = st === RockStyle.Crypt && hash2(x >> 1, y >> 1, 9) < 0.75;
    if (PAINTED) {
      corners.length = 0;
      innerCorners(x, y, (ax, ay) => !isOpen(ax, ay), corners);
      for (const k of corners) (masonry ? brickFillets! : fillets!).add(compose(k.x, 0, k.y, k.rot, 1, ROCK_TOP - 0.06, 1), masonry ? col.clone().multiplyScalar(1.25) : col);
    }
    if (masonry && PAINTED) {
      const sh = rockShape((isOpen(x, y - 1) ? SIDE_N : 0) | (isOpen(x + 1, y) ? SIDE_E : 0) | (isOpen(x, y + 1) ? SIDE_S : 0) | (isOpen(x - 1, y) ? SIDE_W : 0));
      brickShapes[sh.cls].add(compose(x, 0, y, sh.rot * Math.PI / 2, 1, hgt, 1), col.clone().multiplyScalar(1.25));
    } else if (masonry) {
      bricks.add(compose(x, 0, y, 0, 1, hgt, 1), col.clone().multiplyScalar(1.25));
    } else {
      if (PAINTED) {
        const sh = rockShape((isOpen(x, y - 1) ? SIDE_N : 0) | (isOpen(x + 1, y) ? SIDE_E : 0) | (isOpen(x, y + 1) ? SIDE_S : 0) | (isOpen(x - 1, y) ? SIDE_W : 0));
        shapes[sh.cls].add(compose(x, 0, y, sh.rot * Math.PI / 2, 1, hgt, 1), col);
      } else jag[Math.floor(hash2(x, y, 5) * 3)].add(compose(x, 0, y, Math.floor(hash2(x, y, 6) * 4) * Math.PI / 2, 1, hgt, 1), col);
      if (h > 0.55) capRocks.add(compose(x + (hash2(x, y, 7) - 0.5) * 0.4, hgt - 0.05, y + (hash2(x, y, 8) - 0.5) * 0.4, h * 6, 1, 0.6, 1), col.clone().multiplyScalar(0.92));
    }
    // the open sides of this wall tile
    const sOpen = isOpen(x, y + 1), nOpen = isOpen(x, y - 1), eOpen = isOpen(x + 1, y), wOpen = isOpen(x - 1, y);
    // stalactites hang over the faces the camera sees (south faces)
    if (sOpen && st !== RockStyle.Crypt) {
      const n = 1 + Math.floor(hash2(x, y, 12) * 3);
      for (let k = 0; k < n; k++) {
        const s = 0.6 + hash2(x, y, 13 + k) * 0.9;
        stalactite.add(compose(x - 0.35 + hash2(x, y, 16 + k) * 0.7, hgt - 0.02, y + 0.56, 0, s, s * (0.8 + hash2(x, y, 19 + k)), s), col.clone().multiplyScalar(0.9));
      }
    }
    // rubble and stalagmites at the foot of the wall, inside the wall tile
    const feet: Array<[number, number]> = [];
    if (sOpen) feet.push([0, 0.42]);
    if (eOpen) feet.push([0.42, 0]);
    if (wOpen) feet.push([-0.42, 0]);
    if (nOpen) feet.push([0, -0.42]);
    for (const [fx, fz] of feet) {
      const r = hash2(x + fx * 7, y + fz * 7, 30);
      if (r < 0.35) rubble.add(compose(x + fx + (hash2(x, y, 31) - 0.5) * 0.5, 0.05, y + fz, r * 9, 1, 0.7, 1), col.clone().multiplyScalar(0.85));
      else if (r < 0.5 && st !== RockStyle.Crypt) {
        const s = 0.6 + hash2(x, y, 32) * 0.7;
        stalagmite.add(compose(x + fx * 0.9, 0, y + fz * 0.9, 0, s, s * 1.3, s), col.clone().multiplyScalar(0.95));
      }
    }
    // torches on the walls of mines, crypts and tombs; crystals in the ice; amethyst seams in deep earth
    if (sOpen && walkableBelow(x, y + 1)) {
      const t = hash2(x, y, 40);
      const torchy = st === RockStyle.Crypt ? 0.09 : st === RockStyle.Sandstone ? 0.08 : st === RockStyle.Earth ? 0.035 : st === RockStyle.Volcanic ? 0.02 : 0;
      if (t < torchy && hash2(x >> 2, y, 41) < 0.6) {
        bracket.add(compose(x, 1.05, y + 0.5));
        torchStick.add(compose(x, 1.0, y + 0.56, 0, 1, 1, 1, 0.35));
        torchFlame.add(compose(x, 1.36, y + 0.66));
        glows.add(compose(x, 0.04, y + 1, 0, 3.0, 1, 3.0), 0x5a3010);
        glows.add(compose(x, 1.4, y + 0.7, 0, 0.8, 1, 0.8, Math.PI / 2), 0x8a5020);
        lights.push({ x, y: y + 0.8, h: 1.4, color: 0xffa050, power: 1 });
      } else if (st === RockStyle.Ice && t < 0.14) {
        for (let k = 0; k < 3; k++) wallCrystal.add(compose(x - 0.25 + k * 0.25, 0.25 + hash2(x, y, 42 + k) * 0.9, y + 0.52, 0, 1, 0.8 + hash2(x, y, 45 + k) * 0.6, 1, 0.5 + k * 0.1, (k - 1) * 0.5));
        glows.add(compose(x, 0.04, y + 0.9, 0, 2.0, 1, 2.0), 0x0e3446);
      } else if (st === RockStyle.Earth && t > 0.975) {
        for (let k = 0; k < 3; k++) wallAmethyst.add(compose(x - 0.2 + k * 0.2, 0.4 + hash2(x, y, 46 + k) * 0.7, y + 0.52, 0, 1, 0.8 + hash2(x, y, 49 + k) * 0.5, 1, 0.5, (k - 1) * 0.5));
        glows.add(compose(x, 0.04, y + 0.9, 0, 1.6, 1, 1.6), 0x1e0e38);
      }
    }
  }

  // ---------------------------------------------------------------- glow over lava, around fires and lights on the floor
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (G[i] === Ground.Lava) {
      if ((x + y) % 2 === 0) glows.add(compose(x, 0.02, y, 0, 2.4, 1, 2.4), 0x4a1503);
      if (hash2(x, y, 60) < 0.05) lights.push({ x, y, h: 0.6, color: 0xff6a20, power: 0.8 });
      continue;
    }
    const o = O[i];
    if (o === Obj.Torch || o === Obj.FireField || o === Obj.Campfire || o === Obj.Altar) {
      glows.add(compose(x, 0.04, y, 0, o === Obj.Torch ? 2.6 : 3.0, 1, o === Obj.Torch ? 2.6 : 3.0), 0x4e2a0c);
      lights.push({ x, y, h: 1.1, color: 0xff9a40, power: o === Obj.Torch ? 0.8 : 1 });
    }
  }

  for (const b of [...jag, ...shapes, ...brickShapes, ...(fillets ? [fillets, brickFillets!] : []), bricks, capRocks, stalactite, rubble, stalagmite, torchStick, bracket, torchFlame, wallCrystal, wallAmethyst]) b.build(group);
  for (const gm of glows.build(group, 3)) gm.name = 'caveGlow';

  // ---------------------------------------------------------------- dust motes drifting around the player
  group.add(dustMotes());
  return { group, lights, styleAt };
}

const DUST_VERT = /* glsl */ `
attribute vec3 seed;
uniform float uTime;
uniform vec3 uLight;
varying float vA;
void main() {
  vec3 box = vec3(34.0, 2.6, 26.0);
  vec3 p = seed * box + vec3(uTime * 0.12, 0.0, uTime * 0.05);
  p.y += sin(uTime * 0.4 + seed.x * 40.0) * 0.25;
  p = mod(p - vec3(uLight.x, 0.0, uLight.z) + box * 0.5, box) - box * 0.5 + vec3(uLight.x, 0.0, uLight.z);
  p.y = 0.25 + mod(seed.y * box.y + sin(uTime * 0.3 + seed.z * 20.0) * 0.3, box.y);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = length(p.xz - uLight.xz);
  vA = (0.25 + 0.75 * clamp(1.0 - d / 9.0, 0.0, 1.0)) * (0.55 + 0.45 * sin(uTime * 1.3 + seed.z * 30.0));
  gl_PointSize = 2.0;
}`;
const DUST_FRAG = /* glsl */ `
varying float vA;
void main() { gl_FragColor = vec4(1.0, 0.86, 0.62, vA * 0.55); }`;

function dustMotes(): THREE.Points {
  const N = 420;
  const seed = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) seed[i] = hash2(i, 77, 5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: CAVE_UNIFORMS.uTime, uLight: CAVE_UNIFORMS.uLight },
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.name = 'dust';
  p.renderOrder = 4;
  return p;
}

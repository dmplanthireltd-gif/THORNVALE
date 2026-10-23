import * as THREE from 'three';
import { Ground, Obj, type WorldMap } from '../game/world/WorldMap';
import {
  ATLAS_COLS, ATLAS_ROWS, CELL_CRYPT_BONES, CELL_MUD, CELL_PEBBLES, CELL_SCORCH, PAINT_BUILT, PAINT_CELL, PAINT_PRIORITY,
  paintedAtlas, paintNoise, SPAN, UNDER_CELL,
} from './paintTextures';
import { CAVE_UNIFORMS } from './caveRock';

/**
 * Painted style ground (render/style.ts). Every painted ground tile of a floor is
 * drawn by ONE material that:
 * - samples the painted atlas in world space (no tile grid in the pattern), twice at
 *   different angles blended by broad noise for the natural kinds, so it never repeats visibly;
 * - looks up the kinds of the 8 neighbour tiles in a small per-floor data texture and
 *   lets the "stronger" ground spill over the border along a noisy, soft edge with a faint
 *   dark rim (grass over the road, everything over bare cave floor);
 * - draws water, deep water, swamp water and lava as painted liquids (owner 2026-10-23
 *   "work on the whole game"): the shoreline is a smooth field over the 3 × 3 tiles
 *   (rounded, wobbly, never the square tile edge), with depth colour, slow ripples and
 *   glints, lapping foam lines, a dark bank shadow, wet sand / pebble / mud bands on the
 *   land side; murky swamp water with scum and bubbles; lava with a cracked glowing
 *   crust that drifts and shimmers, a cooled rim and a scorched hot lip on the bank;
 * - darkens the ground where it meets walls, cliffs and cave rock (contact shadows);
 * - adds broad colour variation across the land.
 * Below ground some kinds use their grimmer cave cells (paintTextures UNDER_CELL),
 * and flagstones near bones and graves become crypt floors.
 */

/** Ground kinds this material draws as land. */
export function paintsGround(g: Ground): boolean {
  return PAINT_CELL[g] !== undefined;
}

/** Liquid kinds the painted material draws (instead of the classic animated tiles). */
export function paintsLiquid(g: Ground): boolean {
  return g === Ground.Water || g === Ground.DeepWater || g === Ground.Lava;
}

/** Liquid codes in the aux texture (R). */
const enum Liq { None = 0, Water = 1, Deep = 2, Murky = 3, Lava = 4, Cold = 5 }

/** Objects that stand tall on their tile and shade the ground at their foot. */
const OCCLUDERS = new Set<number>([Obj.Cliff, Obj.Wall, Obj.StoneWall, Obj.SandWall, Obj.Hull]);

export interface PaintedGroundData {
  /** R = atlas cell (255 = not painted), G = border priority, B = 1 for built floors. */
  ids: THREE.DataTexture;
  /** R = liquid code, G = depth (tiles × 24), B = 255 where a tall occluder stands, A = flags (1 liquid within 2 tiles, 2 occluder near, 4 another ground kind within 2 tiles). */
  aux: THREE.DataTexture;
  /**
   * Smooth shore field (owner 2026-10-23 "improve the shorelines, some rounding … not square
   * against square"): R = liquid-ness blurred over ~2 tiles (0..255, > 128 = liquid; every
   * liquid tile ≥ 0.64 and land tile ≤ 0.36 so the tiles you walk on keep their side),
   * G = smoothed depth (tiles × 24), B = liquid code of the nearest liquid (also on the land
   * near it). The shader interpolates R between tile centres with a smooth spline, so the
   * shoreline is one rounded contour that cuts diagonally across stepped coasts.
   */
  shore: THREE.DataTexture;
}

/** Blur of the shore field (Gaussian sigma in tiles) and the clamp that keeps each tile on its side. */
const SHORE_SIGMA = 0.9, SHORE_LIQ_MIN = 0.64, SHORE_LAND_MAX = 0.36;

function tex(d: Uint8Array<ArrayBuffer>, W: number, H: number): THREE.DataTexture {
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Builds the per-floor data textures of the painted ground. */
export function paintedGroundData(world: WorldMap, z: number): PaintedGroundData {
  const W = world.width, H = world.height, N = W * H;
  const G = new Uint8Array(N);
  const O = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    G[y * W + x] = world.getGround(x, y, z);
    O[y * W + x] = world.getObj(x, y, z);
  }
  const liquid = (g: number) => paintsLiquid(g as Ground);
  // nearest land kind and distance for every liquid tile (8-way BFS from the land)
  const bed = new Uint8Array(N).fill(255);
  const dist = new Uint8Array(N).fill(255);
  const q = new Int32Array(N);
  let head = 0, tail = 0;
  for (let i = 0; i < N; i++) {
    const g = G[i];
    if (g === Ground.Void || liquid(g)) continue;
    dist[i] = 0;
    bed[i] = PAINT_BUILT.has(g as Ground) ? Ground.Sand : g;
    q[tail++] = i;
  }
  while (head < tail) {
    const c = q[head++];
    const d = dist[c];
    if (d >= 40) continue;
    const cx = c % W, cy = (c / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (dist[n] !== 255 || !liquid(G[n])) continue;
      dist[n] = d + 1;
      bed[n] = bed[c];
      q[tail++] = n;
    }
  }
  // crypts: flagstones within 10 tiles of bones or graves below ground
  const crypt = new Uint8Array(N);
  if (z < 0) {
    head = tail = 0;
    const cd = new Uint8Array(N).fill(255);
    for (let i = 0; i < N; i++) if (O[i] === Obj.Bones || O[i] === Obj.Grave) { cd[i] = 0; q[tail++] = i; }
    while (head < tail) {
      const c = q[head++];
      crypt[c] = 1;
      if (cd[c] >= 10) continue;
      const cx = c % W, cy = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (cd[n] !== 255 || G[n] === Ground.Void) continue;
        cd[n] = cd[c] + 1;
        q[tail++] = n;
      }
    }
  }
  const ids = new Uint8Array(N * 4);
  const aux = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const g = G[i] as Ground;
    const o = i * 4;
    let kind = g;
    let liq = Liq.None;
    if (liquid(g)) {
      const b = (bed[i] === 255 ? Ground.Sand : bed[i]) as Ground;
      kind = b;
      liq = g === Ground.Lava ? Liq.Lava : b === Ground.Swamp ? Liq.Murky : b === Ground.Snow || b === Ground.Ice ? Liq.Cold : g === Ground.DeepWater ? Liq.Deep : Liq.Water;
    }
    let cell = (z < 0 ? UNDER_CELL[kind] : undefined) ?? PAINT_CELL[kind];
    if (cell !== undefined && z < 0 && crypt[i] && (kind === Ground.Stone || kind === Ground.Marble)) cell = CELL_CRYPT_BONES;
    if (liq !== Liq.None) {
      // the bed under the liquid: sand stays sand; otherwise wet pebbles, swamp mud, scorched rock under lava
      cell = liq === Liq.Lava ? CELL_SCORCH : kind === Ground.Sand ? cell ?? CELL_PEBBLES : liq === Liq.Murky ? CELL_MUD : CELL_PEBBLES;
    }
    ids[o] = cell ?? 255;
    ids[o + 1] = cell === undefined ? 0 : liq !== Liq.None ? 4 : PAINT_PRIORITY[kind] ?? 1;
    ids[o + 2] = liq === Liq.None && PAINT_BUILT.has(kind) ? 1 : 0;
    ids[o + 3] = 255;
    aux[o] = liq;
    aux[o + 1] = liq === Liq.None ? 0 : Math.min(255, (dist[i] === 255 ? 40 : dist[i]) * 24 + (g === Ground.DeepWater ? 48 : 0));
    const occ = (z < 0 && g === Ground.Void) || OCCLUDERS.has(O[i]);
    aux[o + 2] = occ ? 255 : 0;
  }
  // flags (so the shader skips the work elsewhere): a liquid within 2 tiles, an occluder within 1,
  // another painted ground kind within 2 (the smooth borders read a 4 × 4 tile window)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let f = 0;
    const me = ids[(y * W + x) * 4];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = (ny * W + nx) * 4;
      if (aux[n]) f |= 1;
      if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1 && aux[n + 2]) f |= 2;
      if (ids[n] !== me && ids[n] !== 255) f |= 4;
    }
    aux[(y * W + x) * 4 + 3] = f;
  }
  return { ids: tex(ids, W, H), aux: tex(aux, W, H), shore: tex(shoreField(aux, W, H), W, H) };
}

/** The smooth shore field (see PaintedGroundData.shore). */
function shoreField(aux: Uint8Array, W: number, H: number): Uint8Array<ArrayBuffer> {
  const N = W * H;
  const out = new Uint8Array(N * 4);
  // only the neighbourhood of liquids matters: rows/cols with liquid get the blur, the rest stay 0
  const L = new Float32Array(N), D = new Float32Array(N);
  let any = false;
  for (let i = 0; i < N; i++) if (aux[i * 4]) { L[i] = 1; D[i] = aux[i * 4 + 1]; any = true; }
  if (!any) return out;
  const R = 2;
  const k: number[] = [];
  let ks = 0;
  for (let i = -R; i <= R; i++) { const v = Math.exp(-(i * i) / (2 * SHORE_SIGMA * SHORE_SIGMA)); k.push(v); ks += v; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const blur = (src: Float32Array, wsrc: Float32Array | null): Float32Array => {
    // separable, edge-clamped; with wsrc = a weighted average (depth over liquid tiles only)
    const t = new Float32Array(N), tw = wsrc ? new Float32Array(N) : null;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let a = 0, b = 0;
      for (let i = -R; i <= R; i++) {
        const n = y * W + Math.min(W - 1, Math.max(0, x + i));
        const ww = k[i + R] * (wsrc ? wsrc[n] : 1);
        a += src[n] * ww; b += ww;
      }
      t[y * W + x] = a;
      if (tw) tw[y * W + x] = b;
    }
    const o = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let a = 0, b = 0;
      for (let i = -R; i <= R; i++) {
        const n = Math.min(H - 1, Math.max(0, y + i)) * W + x;
        a += t[n] * k[i + R]; b += (tw ? tw[n] : 1) * k[i + R];
      }
      o[y * W + x] = tw ? (b > 1e-4 ? a / b : 0) : a;
    }
    return o;
  };
  const F = blur(L, null);
  const DS = blur(D, L);
  // nearest liquid code for the land round the water (4 tiles), so the bank knows what it borders
  const code = new Uint8Array(N), cd = new Uint8Array(N).fill(255);
  const q = new Int32Array(N);
  let head = 0, tail = 0;
  for (let i = 0; i < N; i++) if (aux[i * 4]) { code[i] = aux[i * 4]; cd[i] = 0; q[tail++] = i; }
  while (head < tail) {
    const c = q[head++];
    if (cd[c] >= 4) continue;
    const cx = c % W, cy = (c / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (cd[n] !== 255) continue;
      cd[n] = cd[c] + 1; code[n] = code[c]; q[tail++] = n;
    }
  }
  for (let i = 0; i < N; i++) {
    let f = F[i];
    f = L[i] ? Math.max(f, SHORE_LIQ_MIN) : Math.min(f, SHORE_LAND_MAX);
    const o = i * 4;
    out[o] = Math.round(f * 255);
    out[o + 1] = Math.min(255, Math.round(DS[i]));
    out[o + 2] = code[i];
    out[o + 3] = 255;
  }
  return out;
}

const VERT_HEAD = /* glsl */ `
varying vec2 vPaintW;`;
const VERT_BODY = /* glsl */ `
  {
    vec4 pw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      pw = instanceMatrix * pw;
    #endif
    pw = modelMatrix * pw;
    vPaintW = pw.xz;
  }`;

const C = ATLAS_COLS.toFixed(1), R = ATLAS_ROWS.toFixed(1);
const FRAG_HEAD = /* glsl */ `
uniform sampler2D uPaintAtlas;
uniform sampler2D uPaintIds;
uniform sampler2D uPaintAux;
uniform sampler2D uPaintShore;
uniform sampler2D uPaintNoise;
uniform vec2 uPaintSize;
uniform float uPaintTime;
uniform float uPaintAO;
varying vec2 vPaintW;
vec3 paintGlow = vec3(0.0);
vec3 rgbL(vec3 c) { return pow(c, vec3(2.2)); }
vec4 paintId(vec2 cell) {
  ivec2 c = ivec2(clamp(cell, vec2(0.0), uPaintSize - 1.0));
  return texelFetch(uPaintIds, c, 0) * 255.0;
}
vec4 paintAux(vec2 cell) {
  ivec2 c = ivec2(clamp(cell, vec2(0.0), uPaintSize - 1.0));
  return texelFetch(uPaintAux, c, 0) * 255.0;
}
// Smooth splines between tile centres (tile x, y has its centre at world x, y): a mix of
// Catmull-Rom (passes through the tiles, keeps one-tile ponds and paths) and a cubic B-spline
// (rounder, straightens stepped diagonals). k = share of the B-spline.
vec4 paintSplW(float t, float k) {
  float t2 = t * t, t3 = t2 * t;
  vec4 cr = vec4(-t3 + 2.0 * t2 - t, 3.0 * t3 - 5.0 * t2 + 2.0, -3.0 * t3 + 4.0 * t2 + t, t3 - t2) * 0.5;
  float u = 1.0 - t;
  vec4 bs = vec4(u * u * u, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0;
  return mix(cr, bs, k);
}
vec4 paintSplD(float t, float k) {
  float t2 = t * t;
  vec4 cr = vec4(-3.0 * t2 + 4.0 * t - 1.0, 9.0 * t2 - 10.0 * t, -9.0 * t2 + 8.0 * t + 1.0, 3.0 * t2 - 2.0 * t) * 0.5;
  float u = 1.0 - t;
  vec4 bs = vec4(-u * u, 3.0 * t2 - 4.0 * t, -3.0 * t2 + 2.0 * t + 1.0, t2) * 0.5;
  return mix(cr, bs, k);
}
// The shoreline: signed distance in tiles from the smooth liquid contour (> 0 in the liquid),
// with the smoothed depth (tiles) and the liquid code of the nearest liquid.
float paintShore(vec2 w, out float depth, out float code) {
  vec2 b = floor(w), t = w - b;
  vec4 wx = paintSplW(t.x, 0.45), wy = paintSplW(t.y, 0.45);
  vec4 dx = paintSplD(t.x, 0.45), dy = paintSplD(t.y, 0.45);
  float F = 0.0, gx = 0.0, gy = 0.0;
  depth = 0.0;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    ivec2 c = ivec2(clamp(b + vec2(float(i - 1), float(j - 1)), vec2(0.0), uPaintSize - 1.0));
    vec4 s = texelFetch(uPaintShore, c, 0);
    float wxy = wx[i] * wy[j];
    F += wxy * s.r;
    gx += dx[i] * wy[j] * s.r;
    gy += wx[i] * dy[j] * s.r;
    depth += wxy * s.g;
  }
  depth *= 255.0 / 24.0;
  code = texelFetch(uPaintShore, ivec2(clamp(floor(w + 0.5), vec2(0.0), uPaintSize - 1.0)), 0).b * 255.0;
  return clamp((F - 0.5) / max(length(vec2(gx, gy)), 0.18), -1.5, 1.5);
}
float paintH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 paintSample(float cell, vec2 uv, vec2 dx, vec2 dy) {
  // canvas textures are flipped: atlas row 0 (top of the canvas) is the top of the texture
  vec2 o = vec2(mod(cell, ${C}), ${(ATLAS_ROWS - 1).toFixed(1)} - floor(cell / ${C}));
  // stay half a texel inside the cell so filtering never reads the neighbour kind
  vec2 f = fract(uv) * (1.0 - 2.0 / 256.0) + 1.0 / 256.0;
  vec2 sc = vec2(${C}, ${R});
  return textureGrad(uPaintAtlas, (o + f) / sc, dx / sc, dy / sc).rgb;
}
vec3 paintKind(vec4 id, vec2 w, float mixN) {
  vec2 uv = w / ${SPAN.toFixed(1)};
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec3 a = paintSample(id.r, uv, dx, dy);
  if (id.b > 0.5) return a;
  // natural ground: a second sample, turned and shifted, blended in by broad noise (no visible repeats)
  const mat2 R = mat2(0.809, 0.588, -0.588, 0.809);
  vec2 uv2 = R * uv * 0.93 + vec2(0.37, 0.71);
  vec3 b = paintSample(id.r, uv2, R * dx * 0.93, R * dy * 0.93);
  return mix(a, b, smoothstep(0.38, 0.62, mixN));
}
// painted water: depth colour over the bed, ripples, glints, bank shadow, lapping foam; murky scum and bubbles
vec3 paintWater(float kind, float deep, float e, vec3 bed, vec2 w) {
  float T = uPaintTime;
  bool murky = kind > 2.5 && kind < 3.5;
  bool cold = kind > 4.5;
  vec3 shal = murky ? rgbL(vec3(0.24, 0.25, 0.13)) : cold ? rgbL(vec3(0.24, 0.38, 0.44)) : rgbL(vec3(0.17, 0.38, 0.42));
  vec3 dpc = murky ? rgbL(vec3(0.11, 0.12, 0.065)) : cold ? rgbL(vec3(0.08, 0.15, 0.21)) : rgbL(vec3(0.08, 0.18, 0.25));
  float dp = smoothstep(0.0, 1.0, deep);
  vec3 c = mix(mix(bed * (murky ? rgbL(vec3(0.45, 0.48, 0.32)) : rgbL(vec3(0.45, 0.62, 0.72))), shal, murky ? 0.75 : 0.62), dpc, dp);
  // broad painterly patches drifting slowly, and short broken highlight strokes on the swell
  float nb = texture2D(uPaintNoise, w * 0.07 + vec2(T * 0.006, T * 0.004)).r;
  float nb2 = texture2D(uPaintNoise, w * 0.11 - vec2(T * 0.005, -T * 0.007)).r;
  c *= 0.85 + (nb + nb2 - 1.0) * 0.6 + 0.15;
  float s1 = sin(w.x * 1.3 + w.y * 4.6 + T * 1.1 + nb * 14.0);
  float s2 = sin(-w.x * 0.9 + w.y * 3.9 - T * 0.8 + nb2 * 14.0);
  float brk = texture2D(uPaintNoise, w * 0.37 + vec2(T * 0.01, 0.0)).g;
  float stroke = smoothstep(0.86, 0.98, s1 * 0.6 + s2 * 0.4 + (brk - 0.5) * 0.5) * smoothstep(0.35, 0.6, brk);
  c = mix(c, c * 1.5 + (murky ? rgbL(vec3(0.1, 0.11, 0.06)) : rgbL(vec3(0.22, 0.32, 0.32))), stroke * (murky ? 0.35 : 0.55) * (1.0 - dp * 0.3));
  if (!murky) {
    float glint = stroke * smoothstep(0.64, 0.72, brk);
    paintGlow += rgbL(vec3(0.5, 0.56, 0.54)) * glint * 0.4;
  }
  // the bank: a dark band just inside the shoreline, so the water sits below the land
  c *= 1.0 - 0.38 * (1.0 - smoothstep(0.0, 0.14, e));
  if (murky) {
    // floating scum and slow bubbles
    float scum = smoothstep(0.56, 0.7, texture2D(uPaintNoise, w * 0.15 + vec2(T * 0.004, 0.0)).r + texture2D(uPaintNoise, w * 0.5).b * 0.3 - 0.1);
    c = mix(c, rgbL(vec3(0.20, 0.23, 0.09)), scum * 0.75);
    vec2 g = w * 1.3;
    vec2 id = floor(g);
    float h = paintH(id);
    vec2 l = fract(g) - 0.5 - (vec2(paintH(id + 3.7), paintH(id + 9.1)) - 0.5) * 0.4;
    float ph = fract(T * 0.3 + h * 7.0);
    float on = step(0.55, h);
    float ring = (1.0 - smoothstep(0.0, 0.025, abs(length(l) - ph * 0.32))) * (1.0 - ph) * on;
    float dot0 = (1.0 - smoothstep(0.02, 0.05, length(l))) * (1.0 - smoothstep(0.0, 0.18, ph)) * on;
    c += rgbL(vec3(0.09, 0.1, 0.07)) * (ring + dot0 * 1.5);
  } else {
    // lapping foam: a broken line along the shore that swells in and out, and a fainter second line further out
    float lap = sin(T * 1.2 + w.x * 0.35 + w.y * 0.27) * 0.025;
    float brk = smoothstep(0.38, 0.6, texture2D(uPaintNoise, w * 1.1 + vec2(T * 0.02, T * 0.01)).b + texture2D(uPaintNoise, w * 0.3).g * 0.3);
    float f1 = smoothstep(0.0, 0.012, e) * (1.0 - smoothstep(0.03, 0.08, e - lap));
    float e2 = e - 0.17 - lap * 2.0;
    float f2 = (1.0 - smoothstep(0.0, 0.025, abs(e2))) * 0.55;
    float foam = clamp(f1 * (0.55 + 0.45 * brk) + f2 * brk, 0.0, 1.0) * (1.0 - dp * 0.6);
    c = mix(c, cold ? rgbL(vec3(0.78, 0.84, 0.86)) : rgbL(vec3(0.74, 0.77, 0.70)), foam * 0.85);
  }
  return c;
}
// painted lava: drifting cracked crust over a glowing melt, a cooled rim along the bank
vec3 paintLava(float e, float deep, vec2 w) {
  float T = uPaintTime;
  vec2 q = w * 1.2 + vec2(T * 0.03, T * 0.017);
  // heat shimmer: the whole pattern wavers
  q += (vec2(texture2D(uPaintNoise, w * 0.45 + vec2(T * 0.06, 0.0)).r, texture2D(uPaintNoise, w * 0.45 - vec2(0.0, T * 0.05)).g) - 0.5) * 0.7;
  vec2 ip = floor(q), fp = fract(q);
  float d1 = 8.0, d2 = 8.0, hid = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec2 r = o + vec2(paintH(ip + o), paintH(ip + o + 17.3)) - fp;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; hid = paintH(ip + o + 5.1); } else if (d < d2) d2 = d;
  }
  float gap = sqrt(d2) - sqrt(d1);
  float cool = 1.0 - smoothstep(0.0, 0.4, e);
  float crk = (1.0 - smoothstep(0.015, 0.11 - cool * 0.06, gap));
  // deep pools stay more molten
  crk = max(crk, smoothstep(0.65, 1.0, deep) * smoothstep(0.45, 0.75, texture2D(uPaintNoise, w * 0.2 + T * 0.01).r) * 0.8);
  float pulse = 0.72 + 0.28 * sin(T * 1.7 + hid * 6.283);
  vec3 crust = mix(rgbL(vec3(0.09, 0.055, 0.045)), rgbL(vec3(0.17, 0.09, 0.06)), hid) * (1.05 - sqrt(d1) * 0.45);
  vec3 hot = mix(rgbL(vec3(0.85, 0.24, 0.03)), rgbL(vec3(1.0, 0.72, 0.26)), smoothstep(0.55, 1.0, crk) * pulse);
  vec3 c = mix(crust, hot, crk * (1.0 - cool * 0.55));
  paintGlow += hot * crk * pulse * (1.0 - cool * 0.5) * 1.5 + rgbL(vec3(0.32, 0.07, 0.01)) * (1.0 - crk) * (1.0 - cool) * 0.15;
  return c;
}`;

const FRAG_BODY = /* glsl */ `
  {
    vec2 w = vPaintW;
    vec2 p = w + 0.5;
    vec2 cell = floor(p);
    vec2 f = p - cell;
    vec4 n = texture2D(uPaintNoise, w * 0.11);
    vec4 nf = texture2D(uPaintNoise, w * 0.43 + 0.31);
    vec4 id0 = paintId(cell);
    vec4 ax0 = paintAux(cell);
    int fl = int(ax0.a + 0.5);
    vec3 col;
    if ((fl & 4) == 0) col = paintKind(id0, w, n.g);
    else {
      // Borders between ground kinds (owner 2026-10-23: no square corners): each kind's share of
      // the 4 x 4 tiles round the point, interpolated by the smooth spline, plus its own wobble
      // noise and a small head start by priority; the kind with the highest score wins, the
      // runner-up blends in along a soft edge. Contours are rounded and cut stepped diagonals.
      vec2 b = floor(w), t = w - b;
      vec4 wx = paintSplW(t.x, 0.5), wy = paintSplW(t.y, 0.5);
      vec4 kid0 = id0, kid1 = vec4(0.0), kid2 = vec4(0.0), kid3 = vec4(0.0);
      vec4 ks = vec4(0.0);
      int nk = 1;
      for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
        vec4 idn = paintId(b + vec2(float(i - 1), float(j - 1)));
        if (idn.r > 254.0) continue;
        float wgt = wx[i] * wy[j];
        if (abs(idn.r - kid0.r) < 0.5) ks.x += wgt;
        else if (nk > 1 && abs(idn.r - kid1.r) < 0.5) ks.y += wgt;
        else if (nk > 2 && abs(idn.r - kid2.r) < 0.5) ks.z += wgt;
        else if (nk > 3 && abs(idn.r - kid3.r) < 0.5) ks.w += wgt;
        else if (nk == 1) { kid1 = idn; ks.y = wgt; nk = 2; }
        else if (nk == 2) { kid2 = idn; ks.z = wgt; nk = 3; }
        else if (nk == 3) { kid3 = idn; ks.w = wgt; nk = 4; }
      }
      // wobble: two octaves of world noise, a different phase per kind; built floors stay straighter
      vec4 sc = ks;
      for (int s = 0; s < 4; s++) {
        if (s >= nk) { sc[s] = -9.0; continue; }
        vec4 k = s == 0 ? kid0 : s == 1 ? kid1 : s == 2 ? kid2 : kid3;
        vec2 off = vec2(k.r * 0.137, k.r * 0.291);
        float nz = texture2D(uPaintNoise, w * 0.19 + off).r * 0.7 + texture2D(uPaintNoise, w * 0.61 + off.yx).b * 0.3;
        sc[s] += (nz - 0.5) * (k.b > 0.5 ? 0.14 : 0.5) + k.g * 0.03;
      }
      int b1 = 0;
      for (int s = 1; s < 4; s++) if (sc[s] > sc[b1]) b1 = s;
      int b2 = b1 == 0 ? 1 : 0;
      for (int s = 0; s < 4; s++) if (s != b1 && sc[s] > sc[b2]) b2 = s;
      vec4 k1 = b1 == 0 ? kid0 : b1 == 1 ? kid1 : b1 == 2 ? kid2 : kid3;
      col = paintKind(k1, w, n.g);
      if (nk > 1) {
        vec4 k2 = b2 == 0 ? kid0 : b2 == 1 ? kid1 : b2 == 2 ? kid2 : kid3;
        float td = sc[b1] - sc[b2];
        bool close = abs(k1.g - k2.g) < 1.5 && max(k1.b, k2.b) < 0.5;
        float soft = close ? 0.3 : 0.06;
        if (td < soft) {
          col = mix(paintKind(k2, w, n.g), col, 0.5 + 0.5 * smoothstep(0.0, soft, td));
          // a faint dark seam where one ground meets another
          if (!close) col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, soft, td));
        }
        if (!close) col *= 1.0 - 0.12 * (1.0 - smoothstep(soft, soft * 3.0, td));
      }
    }
    // broad colour variation across the land (sunnier and shadier patches)
    col *= mix(vec3(0.84, 0.86, 0.88), vec3(1.09, 1.07, 1.0), n.r);
    // contact shadows at the foot of walls, cliffs and cave rock: the occluder share of the
    // 4 x 4 tiles round the point through the smooth spline, so inner corners get a rounded
    // shadow fillet instead of two square bands
    if ((fl & 2) != 0) {
      vec2 b = floor(w), t = w - b;
      vec4 wx = paintSplW(t.x, 0.7), wy = paintSplW(t.y, 0.7);
      float occ = 0.0;
      for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
        vec4 a = paintAux(b + vec2(float(i - 1), float(j - 1)));
        if (a.b > 128.0) occ += wx[i] * wy[j];
      }
      float ao = smoothstep(0.08, 0.62, occ + (nf.b - 0.5) * 0.1);
      col *= 1.0 - uPaintAO * ao * ao;
    }
    // liquids: one smooth contour through the shore field decides water or land (rounded, never the tile edge)
    if ((fl & 1) != 0) {
      float depth, kind;
      float e0 = paintShore(w, depth, kind);
      if (kind > 0.5) {
        vec4 nw = texture2D(uPaintNoise, w * 0.13 + 0.17);
        // slow wobble along the contour, and a finer ripple
        float e = e0 + (nw.g - 0.5) * 0.34 + (nf.b - 0.5) * 0.1;
        // planks (piers, bridges) keep their straight edge over the water; paving follows the rounded shore
        if (abs(id0.r - ${(PAINT_CELL[Ground.Wood] ?? 12).toFixed(1)}) < 0.5 && ax0.r < 0.5) e = min(e, -0.01);
        float aa = max(fwidth(e) * 0.75, 0.004);
        float m = smoothstep(-aa, aa, e);
        bool lava = kind > 3.5 && kind < 4.5;
        bool murky = kind > 2.5 && kind < 3.5;
        // the land side: a band of pebbles / mud / scorched rock, and wet, darker ground
        float el = -e;
        if (el > 0.0) {
          float bw = 0.17 + nf.g * 0.14;
          float band = 1.0 - smoothstep(bw * 0.55, bw, el);
          float bandCell = lava ? ${CELL_SCORCH.toFixed(1)} : murky ? ${CELL_MUD.toFixed(1)} : ${CELL_PEBBLES.toFixed(1)};
          float sandy = abs(id0.r - ${(PAINT_CELL[Ground.Sand] ?? 8).toFixed(1)}) < 0.5 ? 0.3 : 0.85;
          if (abs(id0.r - bandCell) > 0.5) col = mix(col, paintKind(vec4(bandCell, 0.0, 0.0, 0.0), w, n.g), band * sandy);
          float wet = 1.0 - smoothstep(0.0, 0.3 + nf.r * 0.1, el);
          col *= 1.0 - wet * (lava ? 0.55 : 0.36);
          if (lava) paintGlow += rgbL(vec3(1.0, 0.34, 0.05)) * (1.0 - smoothstep(0.0, 0.06, el)) * 0.9 + rgbL(vec3(0.25, 0.05, 0.0)) * wet * 0.5;
        }
        if (m > 0.0) {
          float deep = clamp((depth - 1.0) / 3.5 + e * 0.15, 0.0, 1.0);
          vec3 glow0 = paintGlow;
          vec3 lc = lava ? paintLava(e, deep, w) : paintWater(kind, deep, e, col, w);
          paintGlow = mix(glow0, paintGlow, m);
          col = mix(col, lc, m);
        }
      }
    }
    diffuseColor.rgb *= col;
  }`;

/**
 * Turns a floor's ground material into the painted ground shader (from that floor's
 * paintedGroundData). `ao` = strength of the contact shadows.
 */
export function usePaintedGround(m: THREE.Material, data: PaintedGroundData, world: WorldMap, ao = 0.5): void {
  const atlas = paintedAtlas();
  const noise = paintNoise();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPaintAtlas = { value: atlas };
    sh.uniforms.uPaintIds = { value: data.ids };
    sh.uniforms.uPaintAux = { value: data.aux };
    sh.uniforms.uPaintShore = { value: data.shore };
    sh.uniforms.uPaintNoise = { value: noise };
    sh.uniforms.uPaintSize = { value: new THREE.Vector2(world.width, world.height) };
    sh.uniforms.uPaintTime = CAVE_UNIFORMS.uTime;
    sh.uniforms.uPaintAO = { value: ao };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>${VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>${FRAG_HEAD}`)
      .replace('#include <map_fragment>', FRAG_BODY)
      // lava and water glints glow (dimmed with the floor, like its colour)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += paintGlow * diffuse;');
  };
  m.customProgramCacheKey = () => 'paintedGround3';
}

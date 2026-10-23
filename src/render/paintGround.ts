import * as THREE from 'three';
import { Ground, type WorldMap } from '../game/world/WorldMap';
import { ATLAS_COLS, PAINT_BUILT, PAINT_CELL, PAINT_PRIORITY, paintedAtlas, paintNoise, SPAN } from './paintTextures';

/**
 * Painted style ground (render/style.ts). Every painted ground tile of a floor is
 * drawn by ONE material that:
 * - samples the painted atlas in world space (no tile grid in the pattern), twice at
 *   different angles blended by broad noise for the natural kinds, so it never repeats visibly;
 * - looks up the kinds of the 8 neighbour tiles in a small per-floor data texture and
 *   lets the "stronger" ground spill over the border along a noisy, soft edge with a faint
 *   dark rim (grass over the road, everything over bare cave floor);
 * - adds broad colour variation across the land.
 */

/** Ground kinds this material draws (water, deep water and lava keep their own animated look). */
export function paintsGround(g: Ground): boolean {
  return PAINT_CELL[g] !== undefined;
}

/**
 * One texel per tile: R = atlas cell (255 = not painted), G = border priority,
 * B = 1 for built floors (thin fringe, no anti-tiling mix).
 */
export function groundIdTexture(world: WorldMap, z: number): THREE.DataTexture {
  const W = world.width, H = world.height;
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = world.getGround(x, y, z);
    const i = (y * W + x) * 4;
    const cell = PAINT_CELL[g];
    d[i] = cell ?? 255;
    d[i + 1] = cell === undefined ? 0 : PAINT_PRIORITY[g] ?? 1;
    d[i + 2] = PAINT_BUILT.has(g) ? 1 : 0;
    d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
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

const FRAG_HEAD = /* glsl */ `
uniform sampler2D uPaintAtlas;
uniform sampler2D uPaintIds;
uniform sampler2D uPaintNoise;
uniform vec2 uPaintSize;
varying vec2 vPaintW;
vec4 paintId(vec2 cell) {
  ivec2 c = ivec2(clamp(cell, vec2(0.0), uPaintSize - 1.0));
  return texelFetch(uPaintIds, c, 0) * 255.0;
}
vec3 paintSample(float cell, vec2 uv, vec2 dx, vec2 dy) {
  // canvas textures are flipped: atlas row 0 (top of the canvas) is the top of the texture
  vec2 o = vec2(mod(cell, ${ATLAS_COLS.toFixed(1)}), ${(ATLAS_COLS - 1).toFixed(1)} - floor(cell / ${ATLAS_COLS.toFixed(1)}));
  // stay half a texel inside the cell so filtering never reads the neighbour kind
  vec2 f = fract(uv) * (1.0 - 2.0 / 256.0) + 1.0 / 256.0;
  return textureGrad(uPaintAtlas, (o + f) / ${ATLAS_COLS.toFixed(1)}, dx / ${ATLAS_COLS.toFixed(1)}, dy / ${ATLAS_COLS.toFixed(1)}).rgb;
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
    vec3 col = paintKind(id0, w, n.g);
    // Borders: one shared, wobbly line between two kinds instead of the straight tile edge.
    // u wobbles that line around the edge; the stronger kind (priority) gets a small head start.
    // Each side of the edge evaluates the same field, so the two tiles meet without a seam.
    float u = (nf.r - 0.5) * 0.85 + (nf.b - 0.5) * 0.3;
    float bestW = 0.0, bestP = -1.0;
    vec4 bestId = id0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      if (i == 0 && j == 0) continue;
      vec4 idn = paintId(cell + vec2(float(i), float(j)));
      if (idn.r > 254.0 || abs(idn.r - id0.r) < 0.5) continue;
      float ex = i > 0 ? 1.0 - f.x : (i < 0 ? f.x : 0.0);
      float ey = j > 0 ? 1.0 - f.y : (j < 0 ? f.y : 0.0);
      float d = (i != 0 && j != 0) ? length(vec2(ex, ey)) : max(ex, ey);
      // built floors (paving, planks) keep a tighter, straighter edge
      float built = max(id0.b, idn.b);
      float amp = built > 0.5 ? 0.25 : 1.0;
      // the same signed field on both sides: the stronger kind (priority, then cell) pushes forward by u
      bool stronger = idn.g > id0.g || (abs(idn.g - id0.g) < 0.5 && idn.r > id0.r);
      float head = abs(idn.g - id0.g) < 0.5 ? 0.0 : 0.1;
      float s = stronger ? u * amp + head : -(u * amp + head);
      // close kinds (grass and dark grass) melt into each other; others meet along a crisper line
      float close = abs(idn.g - id0.g) < 1.5 && built < 0.5 ? 1.0 : 0.0;
      float soft = mix(0.05, 0.22, close);
      float wgt = 1.0 - smoothstep(-soft, soft, d - s);
      if (wgt > bestW + 0.001 || (wgt > 0.0 && abs(wgt - bestW) < 0.001 && idn.g > bestP)) { bestW = wgt; bestP = idn.g; bestId = idn; }
    }
    if (bestW > 0.0) {
      vec3 over = paintKind(bestId, w, n.g);
      col = mix(col, over, bestW);
      // a faint dark seam where one ground meets the other
      if (abs(bestP - id0.g) > 1.5 || max(bestId.b, id0.b) > 0.5) col *= 1.0 - 0.35 * bestW * (1.0 - bestW) * 4.0;
    }
    // broad colour variation across the land (sunnier and shadier patches)
    col *= mix(vec3(0.84, 0.86, 0.88), vec3(1.09, 1.07, 1.0), n.r);
    diffuseColor.rgb *= col;
  }`;

/**
 * Turns a floor's ground material into the painted ground shader. `ids` is the
 * floor's groundIdTexture.
 */
export function usePaintedGround(m: THREE.Material, ids: THREE.DataTexture, world: WorldMap): void {
  const atlas = paintedAtlas();
  const noise = paintNoise();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPaintAtlas = { value: atlas };
    sh.uniforms.uPaintIds = { value: ids };
    sh.uniforms.uPaintNoise = { value: noise };
    sh.uniforms.uPaintSize = { value: new THREE.Vector2(world.width, world.height) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>${VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>${FRAG_HEAD}`)
      .replace('#include <map_fragment>', FRAG_BODY);
  };
  m.customProgramCacheKey = () => 'paintedGround';
}

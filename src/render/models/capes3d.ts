import * as THREE from 'three';
import { capeLook, paintCapeFace, type CapeFx, type CapeLook } from './capeLooks';
import { box, group, sphere, toonGradient, type Mat, type MatFn } from './parts';
import type { BipedRig } from './rigs';
import { WIND } from '../weather/wind';

/**
 * Worn capes (equipment slot `cape`): real cloth hanging from both shoulders, with a
 * shoulder mantle, collar and clasp on top, painted with the cape's look (capeLooks.ts).
 *
 * - Size and place come from the character's torso and legs as they are built
 *   (measured bounding boxes), so the cape fits any body, build or armour: it is
 *   pinned over the shoulder blades just outside the armour and hangs to the calves.
 * - **Cloth simulation** (`CapeCloth`): the panel is a 7 × 11 grid of particles
 *   integrated in world space (position-based dynamics: gravity, air drag against the
 *   weather wind, distance + shear + bend constraints, collision with an elliptic
 *   cylinder round the torso, a capsule round each leg and the ground). The top row is
 *   pinned to the shoulders and wraps forward round them. Because the particles live
 *   in world space, walking makes the cape billow back, stopping lets it settle,
 *   turning swings it and the wind sways it, with no animation code anywhere else.
 * - It runs from the cloth mesh's `onBeforeRender`, so it only runs for capes that
 *   are drawn (on screen), at most `CLOTH_BUDGET` capes a frame; the others (and the
 *   first frames after a cape comes back into view) fall back to the old cheap vertex
 *   ripple in the shader. Fixed typed arrays per cape, nothing allocated per frame.
 * - Animated capes (stars, embers, flames, frost, storm, wisps, glint, aurora) draw
 *   their effect in the fragment shader from one shared time uniform.
 * - Textures are shared and cached; each wearer gets its own geometry (the cloth
 *   moves) and material instance (same compiled program), so hit flashes and fades
 *   stay per creature.
 */

const FX_ID: Record<CapeFx, number> = { none: 0, stars: 1, embers: 2, flames: 3, frost: 4, storm: 5, wisps: 6, glint: 7, aurora: 8 };

/** One time uniform for every cape. */
const CAPE_TIME = { value: 0 };

/** Capes simulated in one frame (a few more may keep going while already moving); the rest use the shader sway. */
export const CLOTH_BUDGET = 24;
/** Grid of the cloth panel (vertices across × down). */
export const CLOTH_COLS = 7;
export const CLOTH_ROWS = 11;

const textures = new Map<string, THREE.Texture>();
function capeTexture(id: string, lk: CapeLook): THREE.Texture {
  let t = textures.get(id);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 192;
  const x = c.getContext('2d');
  if (x) paintCapeFace(x, lk, 128, 192);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 1;
  textures.set(id, t);
  return t;
}

const VERT_HEAD = 'uniform float uCapeTime;\nuniform float uCapeSim;\n';
const FRAG_HEAD = `uniform float uCapeTime;
uniform vec3 uCapeFx;
float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;
// the cheap sway: only while the cloth is not simulated (far / over budget / just back on screen)
const VERT_RIPPLE = `
  {
    float hang = (1.0 - vMapUv.y) * (1.0 - uCapeSim);
    float ph = modelMatrix[3].x * 1.7 + modelMatrix[3].z * 1.3;
    transformed.z -= sin(uCapeTime * 2.4 + hang * 4.0 + ph) * 0.035 * hang * hang;
    transformed.x += sin(uCapeTime * 1.7 + hang * 3.0 + ph * 0.7) * 0.015 * hang;
  }
`;
const FRAG_FX = `
#if CAPE_FX > 0
  {
    vec2 cu = vMapUv; float t = uCapeTime; float e = 0.0; vec3 col = uCapeFx;
#if CAPE_FX == 1
    vec2 q = cu * vec2(9.0, 14.0); float h = cHash(floor(q));
    e = step(0.84, h) * smoothstep(0.28, 0.0, length(fract(q) - 0.5)) * (0.45 + 0.55 * sin(t * 3.0 + h * 40.0)) * 1.6;
#elif CAPE_FX == 2
    vec2 q = vec2(cu.x * 8.0, cu.y * 12.0 - t * 1.6); float h = cHash(floor(q));
    e = step(0.8, h) * smoothstep(0.32, 0.0, length(fract(q) - 0.5)) * (0.6 + 0.4 * sin(t * 9.0 + h * 30.0)) * 1.4;
    e += pow(1.0 - cu.y, 5.0) * (0.7 + 0.3 * sin(t * 5.0 + cu.x * 12.0));
#elif CAPE_FX == 3
    float n = cNoise(vec2(cu.x * 7.0, cu.y * 5.0 - t * 2.2)); float b = 1.0 - cu.y;
    e = smoothstep(0.5, 0.95, n + b * 0.95 - 0.3) * b * 1.25;
    col = mix(col, vec3(1.0, 0.9, 0.45), smoothstep(0.65, 1.0, n));
#elif CAPE_FX == 4
    float band = pow(max(0.0, sin((cu.y * 1.4 + cu.x * 0.6) * 6.2832 - t * 1.8)), 14.0);
    float h = cHash(floor(cu * vec2(14.0, 20.0)) + floor(t * 2.5));
    e = band * 0.75 + step(0.95, h) * 0.9;
#elif CAPE_FX == 5
    float k = floor(t * 6.0);
    float flash = step(0.5, cHash(vec2(k, 3.0)));
    float vein = abs(fract(cu.x * 2.0 + cNoise(vec2(cu.y * 8.0, k)) * 0.7) - 0.5);
    e = smoothstep(0.07, 0.0, vein) * flash * 1.6 + 0.1 + 0.08 * sin(t * 2.0);
#elif CAPE_FX == 6
    float n = cNoise(vec2(cu.x * 4.0 + sin(t * 0.7) * 0.3, cu.y * 3.0 - t * 0.5)) * cNoise(vec2(cu.x * 7.0, cu.y * 6.0 - t * 0.9));
    e = smoothstep(0.22, 0.6, n) * 0.9;
    diffuseColor.rgb *= 1.0 - smoothstep(0.1, 0.45, n) * 0.55;
#elif CAPE_FX == 7
    float s = 1.0 - abs(fract(cu.x * 0.6 + cu.y * 0.6 - t * 0.25) - 0.5) * 7.0;
    e = pow(max(0.0, s), 3.0) * 0.8;
#elif CAPE_FX == 8
    float w0 = 0.72 + sin(cu.x * 5.0 + t * 0.8) * 0.1;
    float a = smoothstep(0.16, 0.0, abs(cu.y - w0)) + smoothstep(0.12, 0.0, abs(cu.y - w0 + 0.25 + sin(cu.x * 7.0 - t) * 0.05)) * 0.7;
    col = mix(vec3(0.42, 0.94, 0.69), vec3(0.62, 0.42, 1.0), 0.5 + 0.5 * sin(cu.x * 4.0 + t * 0.6));
    e = a * 0.9;
#endif
    totalEmissiveRadiance += col * e;
  }
#endif
`;

/** A fresh cloth material for one wearer (shares texture and compiled program with every other wearer). */
function capeMaterial(id: string, lk: CapeLook, sim: { value: number }): Mat {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), map: capeTexture(id, lk), side: THREE.DoubleSide, alphaTest: 0.5 });
  const fx = FX_ID[lk.fx];
  const fxColor = new THREE.Color(lk.fxColor ?? 0xffffff);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCapeTime = CAPE_TIME;
    sh.uniforms.uCapeSim = sim;
    sh.uniforms.uCapeFx = { value: fxColor };
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + VERT_RIPPLE);
    sh.fragmentShader = `#define CAPE_FX ${fx}\n` + FRAG_HEAD + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + FRAG_FX);
  };
  m.customProgramCacheKey = () => `cape${fx}`;
  m.userData.cape = id;
  return m;
}

// ------------------------------------------------------------------ rest shape

/**
 * The cloth's rest shape in its own space (top centre at the origin, +z towards the
 * wearer's front): `w` wide across the shoulders, flaring to the hem, `len` long. The
 * top row wraps forward round the shoulders (`wrap`), lower rows curve round the back
 * and fall into soft folds.
 */
function restShape(out: Float32Array, w: number, len: number, wrap: number): void {
  for (let r = 0; r < CLOTH_ROWS; r++) {
    const v = r / (CLOTH_ROWS - 1);
    // how much this row still follows the shoulders (1 at the top, 0 by a quarter down)
    const sh = Math.max(0, 1 - v / 0.28);
    const s2 = sh * sh * (3 - 2 * sh);
    for (let c = 0; c < CLOTH_COLS; c++) {
      const a = (c / (CLOTH_COLS - 1)) * 2 - 1; // -1 … 1 across
      const i = (r * CLOTH_COLS + c) * 3;
      const half = (w / 2) * (1 + 0.32 * v) * (1 - 0.1 * s2);
      out[i] = a * half;
      out[i + 1] = -v * len + s2 * 0.02 * (1 - a * a);
      const back = -0.05 * (1 - a * a) - 0.03 * v;
      // deep vertical folds that open towards the hem (the bend constraints keep them as the cloth moves)
      const folds = Math.sin(a * Math.PI * 2.5 + 0.4) * (0.012 + 0.03 * v) * (1 - s2);
      out[i + 2] = back + folds + s2 * wrap * a * a;
    }
  }
}

// ------------------------------------------------------------------ cloth simulation

const GRAVITY = 11;
/** Air drag (1/s): how strongly the cloth is dragged towards the air's speed. */
const DRAG = 3.8;
/** Most sideways push the air gives the cloth (× gravity ≈ tan of the steepest billow angle). */
const MAX_LIFT = GRAVITY * 0.85;
const ITER = 3;
const MAX_STEP = 1 / 55;
const N = CLOTH_COLS * CLOTH_ROWS;

/** Constraint list shared by every cape: index pairs and stiffness. */
const EDGES: { a: Uint16Array; b: Uint16Array; k: Float32Array; n: number } = (() => {
  const A: number[] = [], B: number[] = [], K: number[] = [];
  const id = (r: number, c: number) => r * CLOTH_COLS + c;
  const add = (a: number, b: number, k: number) => { A.push(a); B.push(b); K.push(k); };
  for (let r = 0; r < CLOTH_ROWS; r++) for (let c = 0; c < CLOTH_COLS; c++) {
    if (c + 1 < CLOTH_COLS) add(id(r, c), id(r, c + 1), 1);
    if (r + 1 < CLOTH_ROWS) add(id(r, c), id(r + 1, c), 1);
    if (r + 1 < CLOTH_ROWS && c + 1 < CLOTH_COLS) { add(id(r, c), id(r + 1, c + 1), 0.45); add(id(r, c + 1), id(r + 1, c), 0.45); }
    if (r + 2 < CLOTH_ROWS) add(id(r, c), id(r + 2, c), 0.3);
    if (c + 2 < CLOTH_COLS) add(id(r, c), id(r, c + 2), 0.18);
  }
  return { a: Uint16Array.from(A), b: Uint16Array.from(B), k: Float32Array.from(K), n: A.length };
})();

/** Shared per-frame budget bookkeeping (per renderer frame number). */
const budget = { frame: -1, live: 0, prev: 0, wakes: 0 };
const _inv = new THREE.Matrix4();

/** p' = M·p for a 4×4 column-major matrix (affine), written into o at offset oi. */
function xf(e: ArrayLike<number>, x: number, y: number, z: number, o: Float32Array, oi: number): void {
  o[oi] = e[0] * x + e[4] * y + e[8] * z + e[12];
  o[oi + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
  o[oi + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
}

interface Collider {
  /** Torso: elliptic cylinder in torso space. */
  cz: number; rx: number; rz: number; y0: number; y1: number;
  /** Legs: capsule from the leg pivot straight down `len`, radius `r` (leg space). */
  legLen: number; legR: number;
}

/**
 * One wearer's cloth. Positions and velocities are in world space; the pinned top row
 * follows the shoulders (the cloth mesh's own transform), and the result is written back
 * into the mesh's local space with fresh normals.
 */
export class CapeCloth {
  readonly rest = new Float32Array(N * 3);
  private readonly p = new Float32Array(N * 3);
  private readonly v = new Float32Array(N * 3);
  private readonly q = new Float32Array(N * 3);
  private readonly len = new Float32Array(EDGES.n);
  /** Pinned row now and at the last step (world), for smooth pinning between frames. */
  private readonly pinNow = new Float32Array(CLOTH_COLS * 3);
  private readonly pinPrev = new Float32Array(CLOTH_COLS * 3);
  private readonly tmp = new Float32Array(3);
  private lastFrame = -1;
  private lastTime = -1;
  private live = false;
  private seed: number;
  constructor(
    readonly mesh: THREE.Mesh,
    /** The material's sway switch: 1 while the cloth is simulated (shader sway off). */
    private readonly simU: { value: number },
    private readonly torso: THREE.Object3D,
    private readonly legs: THREE.Object3D[],
    private readonly root: THREE.Object3D,
    private readonly col: Collider,
  ) {
    this.seed = Math.random() * 100;
  }

  /** Called from the mesh's onBeforeRender with the renderer's frame number. */
  frame(frameNo: number, now: number): void {
    if (frameNo === this.lastFrame) return;
    if (budget.frame !== frameNo) { budget.frame = frameNo; budget.prev = budget.live; budget.live = 0; budget.wakes = 0; }
    // capes already moving keep going; a resting one wakes (a settling burst) only while there is
    // room, two a frame at most, so a crowd never makes capes flicker between the two modes
    if (this.live) {
      if (budget.live >= CLOTH_BUDGET + 8) { this.sleep(); return; }
    } else {
      if (budget.prev + budget.wakes >= CLOTH_BUDGET || budget.wakes >= 2) { this.sleep(); return; }
      budget.wakes++;
    }
    budget.live++;
    // off screen for a while (not drawn for several frames, or long ago): start again from rest
    const missed = this.lastFrame < 0 || frameNo - this.lastFrame > 4;
    const gap = this.lastTime < 0 ? 9 : now - this.lastTime;
    this.lastFrame = frameNo;
    this.lastTime = now;
    this.mesh.updateWorldMatrix(true, false);
    const e = this.mesh.matrixWorld.elements;
    // pinned row where the shoulders are now
    for (let c = 0; c < CLOTH_COLS; c++) xf(e, this.rest[c * 3], this.rest[c * 3 + 1], this.rest[c * 3 + 2], this.pinNow, c * 3);
    const jump = Math.hypot(this.pinNow[9] - this.pinPrev[9], this.pinNow[11] - this.pinPrev[11]);
    if (!this.live || (missed && gap > 0.3) || gap > 2 || jump > 2) { this.reset(e); return; }
    let dt = Math.min(gap, 0.1);
    const steps = Math.max(1, Math.min(4, Math.ceil(dt / MAX_STEP)));
    dt /= steps;
    for (let s = 1; s <= steps; s++) this.step(dt, s / steps, now);
    this.pinPrev.set(this.pinNow);
    this.writeBack();
  }

  /** Back to the rest shape under the shoulders, at rest. */
  private reset(e: ArrayLike<number>): void {
    for (let i = 0; i < N; i++) xf(e, this.rest[i * 3], this.rest[i * 3 + 1], this.rest[i * 3 + 2], this.p, i * 3);
    this.v.fill(0);
    for (let k = 0; k < EDGES.n; k++) {
      const a = EDGES.a[k] * 3, b = EDGES.b[k] * 3;
      this.len[k] = Math.hypot(this.p[a] - this.p[b], this.p[a + 1] - this.p[b + 1], this.p[a + 2] - this.p[b + 2]);
    }
    this.pinPrev.set(this.pinNow);
    this.live = true;
    this.simU.value = 1;
    // let it fall into its drape before anyone sees it
    for (let s = 0; s < 12; s++) this.step(1 / 30, 1, this.lastTime);
    this.v.fill(0);
    this.writeBack();
  }

  /** Off budget: the plain rest shape and the shader sway. */
  private sleep(): void {
    if (!this.live && this.simU.value === 0) return;
    this.live = false;
    this.simU.value = 0;
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    (pos.array as Float32Array).set(this.rest);
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  private step(h: number, k: number, now: number): void {
    const p = this.p, v = this.v, q = this.q;
    // air: the weather wind with gusts, plus a slow breathing turbulence so idle capes stir
    const on = WIND.enabled.value;
    const ws = (0.35 + WIND.strength.value * 4.5) * on;
    const gust = 0.6 + 0.4 * Math.sin(now * 0.9 + this.seed) * Math.sin(now * 0.37 + this.seed * 2);
    const wx = WIND.dir.value.x * ws * gust;
    const wz = WIND.dir.value.y * ws * gust;
    const damp = Math.exp(-0.6 * h);
    for (let i = CLOTH_COLS; i < N; i++) {
      const o = i * 3;
      const turb = Math.sin(now * 2.3 + i * 0.7 + this.seed) * (0.25 + 0.6 * on * WIND.strength.value);
      // air drag, capped so the cloth billows out to about 40° at a run but never flies flat like a board
      // the lower cloth catches more air (the body shelters the top), so a moving cape curves and ripples
      const row = (i / CLOTH_COLS) | 0;
      const exp = 0.45 + 0.55 * (row / (CLOTH_ROWS - 1));
      let ax = DRAG * exp * (wx + turb - v[o]), az = DRAG * exp * (wz + turb * 0.6 - v[o + 2]);
      const am = Math.sqrt(ax * ax + az * az);
      if (am > MAX_LIFT) { ax *= MAX_LIFT / am; az *= MAX_LIFT / am; }
      v[o] = (v[o] + ax * h) * damp;
      const flutter = Math.sin(now * 9 - row * 0.9 + this.seed) * Math.min(1, am / GRAVITY) * 4 * exp;
      v[o + 1] = (v[o + 1] + (-GRAVITY + flutter - DRAG * v[o + 1] * 0.3) * h) * damp;
      v[o + 2] = (v[o + 2] + az * h) * damp;
      q[o] = p[o] + v[o] * h;
      q[o + 1] = p[o + 1] + v[o + 1] * h;
      q[o + 2] = p[o + 2] + v[o + 2] * h;
    }
    // pinned row, eased from where it was to where it is this frame
    for (let c = 0; c < CLOTH_COLS; c++) {
      const o = c * 3;
      for (let j = 0; j < 3; j++) q[o + j] = this.pinPrev[o + j] + (this.pinNow[o + j] - this.pinPrev[o + j]) * k;
    }
    for (let it = 0; it < ITER; it++) {
      for (let n = 0; n < EDGES.n; n++) {
        const ia = EDGES.a[n], ib = EDGES.b[n];
        const a = ia * 3, b = ib * 3;
        const dx = q[b] - q[a], dy = q[b + 1] - q[a + 1], dz = q[b + 2] - q[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-6) continue;
        const wa = ia < CLOTH_COLS ? 0 : 1, wb = ib < CLOTH_COLS ? 0 : 1;
        const wsum = wa + wb;
        if (!wsum) continue;
        const f = ((d - this.len[n]) / d) * EDGES.k[n] / wsum;
        q[a] += dx * f * wa; q[a + 1] += dy * f * wa; q[a + 2] += dz * f * wa;
        q[b] -= dx * f * wb; q[b + 1] -= dy * f * wb; q[b + 2] -= dz * f * wb;
      }
    }
    this.collide();
    const ih = 1 / h;
    for (let i = 0; i < N * 3; i++) {
      if (i >= CLOTH_COLS * 3) v[i] = (q[i] - p[i]) * ih;
      p[i] = q[i];
    }
  }

  /** Keeps the cloth outside the torso, the legs and the ground. */
  private collide(): void {
    const q = this.q, t = this.tmp, C = this.col;
    this.torso.updateWorldMatrix(true, false);
    const te = this.torso.matrixWorld.elements;
    const ti = _inv.copy(this.torso.matrixWorld).invert().elements;
    const ground = this.root.matrixWorld.elements[13] + 0.03;
    for (let i = CLOTH_COLS; i < N; i++) {
      const o = i * 3;
      // torso (and hips): elliptic cylinder
      xf(ti, q[o], q[o + 1], q[o + 2], t, 0);
      if (t[1] > C.y0 && t[1] < C.y1) {
        const nx = t[0] / C.rx, nz = (t[2] - C.cz) / C.rz;
        const d2 = nx * nx + nz * nz;
        if (d2 < 1) {
          const s = 1 / Math.sqrt(Math.max(d2, 1e-6));
          if (d2 < 1e-6) { t[2] = C.cz - C.rz; } else { t[0] *= s; t[2] = C.cz + (t[2] - C.cz) * s; }
          xf(te, t[0], t[1], t[2], q, o);
        }
      }
      if (q[o + 1] < ground) q[o + 1] = ground;
    }
    for (const leg of this.legs) {
      const le = leg.matrixWorld.elements;
      const li = _inv.copy(leg.matrixWorld).invert().elements;
      for (let i = CLOTH_COLS; i < N; i++) {
        const o = i * 3;
        xf(li, q[o], q[o + 1], q[o + 2], t, 0);
        const y = Math.min(0, Math.max(-C.legLen, t[1]));
        const dx = t[0], dy = t[1] - y, dz = t[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= C.legR * C.legR) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-5) { t[2] = -C.legR; } else { const s = C.legR / d; t[0] = dx * s; t[1] = y + dy * s; t[2] = dz * s; }
        xf(le, t[0], t[1], t[2], q, o);
      }
    }
  }

  /** World particles → the mesh's local positions, with normals from the grid. */
  private writeBack(): void {
    const g = this.mesh.geometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const P = pos.array as Float32Array;
    const Nn = nor.array as Float32Array;
    const ie = _inv.copy(this.mesh.matrixWorld).invert().elements;
    for (let i = 0; i < N; i++) xf(ie, this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2], P, i * 3);
    for (let r = 0; r < CLOTH_ROWS; r++) for (let c = 0; c < CLOTH_COLS; c++) {
      const L = (r * CLOTH_COLS + Math.max(0, c - 1)) * 3, R = (r * CLOTH_COLS + Math.min(CLOTH_COLS - 1, c + 1)) * 3;
      const U = (Math.max(0, r - 1) * CLOTH_COLS + c) * 3, D = (Math.min(CLOTH_ROWS - 1, r + 1) * CLOTH_COLS + c) * 3;
      const ax = P[R] - P[L], ay = P[R + 1] - P[L + 1], az = P[R + 2] - P[L + 2];
      const bx = P[U] - P[D], by = P[U + 1] - P[D + 1], bz = P[U + 2] - P[D + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const o = (r * CLOTH_COLS + c) * 3;
      Nn[o] = nx; Nn[o + 1] = ny; Nn[o + 2] = nz;
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ mantle (shoulder cape over the cloth's top)

/**
 * A short shoulder mantle: an arc round the back of the neck that wraps forward over
 * both shoulders and drops a little skirt over the cloth's pinned edge. `band` = 0
 * builds the mantle itself, 1 builds the trim band along its edge.
 */
function mantleGeometry(cz: number, rxIn: number, rzIn: number, rxOut: number, rzOut: number, top: number, drop: number, band: 0 | 1): THREE.BufferGeometry {
  const SEG = 14;
  const a0 = -Math.PI * 0.64, a1 = Math.PI * 0.64;
  const rings: Array<(a: number) => [number, number, number]> = band === 0
    ? [
      (a) => [Math.sin(a) * rxIn, top + 0.05, cz - Math.cos(a) * rzIn],
      (a) => [Math.sin(a) * (rxIn + rxOut) * 0.5, top + 0.02, cz - Math.cos(a) * (rzIn + rzOut) * 0.5],
      (a) => [Math.sin(a) * rxOut, top - 0.05, cz - Math.cos(a) * rzOut],
      (a) => [Math.sin(a) * rxOut * 1.04, top - drop * (0.75 + 0.35 * Math.abs(Math.sin(a))), cz - Math.cos(a) * rzOut * 1.05],
    ]
    : [
      (a) => [Math.sin(a) * rxOut * 1.045, top - drop * (0.75 + 0.35 * Math.abs(Math.sin(a))) + 0.03, cz - Math.cos(a) * rzOut * 1.055],
      (a) => [Math.sin(a) * rxOut * 1.06, top - drop * (0.75 + 0.35 * Math.abs(Math.sin(a))) - 0.015, cz - Math.cos(a) * rzOut * 1.07],
    ];
  const pos: number[] = [];
  const idx: number[] = [];
  const R = rings.length;
  for (let r = 0; r < R; r++) for (let s = 0; s <= SEG; s++) {
    const a = a0 + ((a1 - a0) * s) / SEG;
    const p = rings[r](a);
    pos.push(p[0], p[1], p[2]);
  }
  for (let r = 0; r < R - 1; r++) for (let s = 0; s < SEG; s++) {
    const i = r * (SEG + 1) + s, j = i + SEG + 1;
    idx.push(i, i + 1, j, i + 1, j + 1, j); // outside
    idx.push(i, j, i + 1, i + 1, j, j + 1); // inside (no back-face culling worries)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ fitting to the body

const tmpBox = new THREE.Box3();
const tmpMesh = new THREE.Box3();
const tmpInv = new THREE.Matrix4();
const tmpM = new THREE.Matrix4();

/** Bounds of `node` and what it wears, in the space of `space` (outfit capes and hidden parts left out). */
function boundsIn(node: THREE.Object3D, space: THREE.Object3D, skip: THREE.Object3D | null, out: THREE.Box3): THREE.Box3 {
  space.updateWorldMatrix(true, true);
  node.updateWorldMatrix(true, true);
  tmpInv.copy(space.matrixWorld).invert();
  out.makeEmpty();
  const walk = (o: THREE.Object3D) => {
    if (!o.visible || o === skip || o.userData.capePart) return;
    const me = o as THREE.Mesh;
    if (me.isMesh && me.geometry && !me.userData.hitbox) {
      if (!me.geometry.boundingBox) me.geometry.computeBoundingBox();
      tmpMesh.copy(me.geometry.boundingBox!).applyMatrix4(tmpM.multiplyMatrices(tmpInv, me.matrixWorld));
      out.union(tmpMesh);
    }
    for (const c of o.children) walk(c);
  };
  for (const c of node.children) walk(c);
  return out;
}

export interface BuiltCape {
  /** Hangs the cloth; becomes rig.cape. */
  pivot: THREE.Group;
  /** Mantle, collar and clasp on the shoulders. */
  mantle: THREE.Group;
  cloth: CapeCloth;
}

/**
 * Builds the worn cape for a rig, sized to its torso and legs. `skip` is the outfit's
 * own cape (left out of the measurement and hidden by the caller). M is the wearer's
 * material cache (mantle, collar and clasp colours).
 */
export function buildCape(rig: BipedRig, id: string, M: MatFn, skip: THREE.Object3D | null): BuiltCape | null {
  const lk = capeLook(id);
  const b = boundsIn(rig.torso, rig.torso, skip, tmpBox);
  if (b.isEmpty()) b.set(new THREE.Vector3(-0.25, -0.1, -0.2), new THREE.Vector3(0.25, 0.6, 0.2));
  const top = b.max.y;
  const back = b.min.z;
  const front = b.max.z;
  const depth = front - back;
  const width = Math.min(0.82, Math.max(0.46, (b.max.x - b.min.x) * 0.86));
  // the shoulders' top (shoulder plates and pauldrons can stand higher than the collar)
  const shoulderY = top - 0.06;
  // legs: their length and thickness, and where the calves are in torso space
  const lb = boundsIn(rig.legL, rig.legL, null, new THREE.Box3());
  const legLen = lb.isEmpty() ? 0.62 : Math.max(0.3, -lb.min.y);
  const legR = lb.isEmpty() ? 0.11 : Math.max(0.07, Math.max(lb.max.x - lb.min.x, lb.max.z - lb.min.z) * 0.5);
  const footT = boundsIn(rig.legL, rig.torso, null, new THREE.Box3());
  const footY = footT.isEmpty() ? -0.64 : footT.min.y;
  const hemY = footY + 0.3 * (0 - footY);
  const len = Math.max(0.7, shoulderY - hemY);

  // the cloth: its own geometry (it moves), the shared painted texture
  const geo = new THREE.PlaneGeometry(1, 1, CLOTH_COLS - 1, CLOTH_ROWS - 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  pos.setUsage(THREE.DynamicDrawUsage);
  (geo.attributes.normal as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const wrap = Math.min(0.24, depth * 0.55);
  const sim = { value: 0 };
  const cloth = new THREE.Mesh(geo, capeMaterial(id, lk, sim));
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  cloth.userData.capeCloth = true;
  const pivot = group(0, shoulderY, back - 0.03, cloth);
  pivot.rotation.x = 0.12;
  const sim3 = new CapeCloth(cloth, sim, rig.torso, [rig.legL, rig.legR], rig.root, {
    cz: (front + back) / 2, rx: Math.max(0.12, (b.max.x - b.min.x) * 0.48), rz: depth / 2 + 0.035,
    y0: -0.32, y1: shoulderY - 0.04, legLen, legR: legR + 0.04,
  });
  restShape(sim3.rest, width, len, wrap);
  (pos.array as Float32Array).set(sim3.rest);
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  // generous bounds: the cloth flies out behind the wearer
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -len * 0.5, -len * 0.3), len * 1.25);
  cloth.onBeforeRender = (renderer) => {
    const now = performance.now() / 1000;
    CAPE_TIME.value = now;
    sim3.frame(renderer.info.render.frame, now);
  };

  // mantle over the shoulders, wrapping forward, pinned by a clasp at the collar
  const mainM = M(lk.main);
  const darkM = M(lk.dark);
  const trimM = M(lk.trim);
  const cz = (front + back) / 2;
  const rxOut = width / 2 + 0.05;
  const rzOut = depth / 2 + 0.05;
  const rxIn = Math.min(0.12, width * 0.2);
  const rzIn = Math.min(0.11, depth * 0.35);
  const drop = 0.13;
  const mantle = group(0, 0, 0,
    new THREE.Mesh(mantleGeometry(cz, rxIn, rzIn, rxOut, rzOut, top - 0.02, drop, 0), mainM),
    new THREE.Mesh(mantleGeometry(cz, rxIn, rzIn, rxOut, rzOut, top - 0.02, drop, 1), trimM),
  );
  // clasp: two brooches at the front of the shoulders joined by a chain across the collar
  const fz = front + 0.01;
  for (const s of [-1, 1]) {
    const br = sphere(0.04, trimM, s * Math.min(0.13, width * 0.24), top - 0.08, fz - 0.02, 1, 1, 0.5);
    mantle.add(br);
    mantle.add(sphere(0.018, darkM, s * Math.min(0.13, width * 0.24), top - 0.08, fz + 0.0, 1, 1, 0.6));
  }
  mantle.add(box(Math.min(0.26, width * 0.48), 0.014, 0.014, trimM, 0, top - 0.1, fz - 0.005));
  if (lk.collar === 'fur') {
    const furM = M(0xd8ccb2);
    const furD = M(0xa89a80);
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI * 0.6 + (Math.PI * 1.2 * i) / 8;
      mantle.add(sphere(0.06, i % 2 ? furM : furD, Math.sin(a) * (rxIn + 0.03), top + 0.04, cz - Math.cos(a) * (rzIn + 0.03), 1.1, 0.8, 1.1, 0));
    }
  } else if (lk.collar === 'gold') {
    const gm = M(0xe8b232);
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI * 0.6 + (Math.PI * 1.2 * i) / 6;
      mantle.add(box(0.07, 0.07, 0.03, gm, Math.sin(a) * (rxIn + 0.02), top + 0.06, cz - Math.cos(a) * (rzIn + 0.02)));
    }
  }
  pivot.userData.capePart = true;
  mantle.userData.capePart = true;
  return { pivot, mantle, cloth: sim3 };
}

import * as THREE from 'three';
import { capeLook, paintCapeFace, type CapeFx, type CapeLook } from './capeLooks';
import { box, group, toonGradient, type Mat, type MatFn } from './parts';
import type { BipedRig } from './rigs';

/**
 * Worn capes (equipment slot `cape`): a cloth panel hanging from the shoulders
 * with a mantle and clasp on top, painted with the cape's look (capeLooks.ts).
 *
 * - Size and place come from the character's torso as it is built (its measured
 *   bounding box), so the cape fits any body, build or armour without knowing
 *   how the body was made.
 * - The panel hangs from a pivot that becomes `rig.cape`, so CreatureView swings
 *   it out while walking and running; a vertex ripple in the shader adds cloth
 *   movement on top (phase from the wearer's position, so capes do not wave in step).
 * - Animated capes (stars, embers, flames, frost, storm, wisps, glint, aurora)
 *   draw their effect in the fragment shader from one shared time uniform.
 * - Textures and geometries are shared and cached; each wearer gets its own
 *   material instance (same compiled program) so hit flashes and fades stay per
 *   creature. Nothing is allocated per frame.
 */

const FX_ID: Record<CapeFx, number> = { none: 0, stars: 1, embers: 2, flames: 3, frost: 4, storm: 5, wisps: 6, glint: 7, aurora: 8 };

/** One time uniform for every cape, advanced once per drawn cape mesh (no allocation). */
const CAPE_TIME = { value: 0 };
function tick(): void {
  CAPE_TIME.value = performance.now() / 1000;
}

const textures = new Map<string, THREE.Texture>();
function capeTexture(id: string, lk: CapeLook): THREE.Texture {
  let t = textures.get(id);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 96;
  const x = c.getContext('2d');
  if (x) paintCapeFace(x, lk, 64, 96);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 1;
  textures.set(id, t);
  return t;
}

const VERT_HEAD = 'uniform float uCapeTime;\n';
const FRAG_HEAD = `uniform float uCapeTime;
uniform vec3 uCapeFx;
float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;
const VERT_RIPPLE = `
  {
    float hang = 1.0 - vMapUv.y;
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
function capeMaterial(id: string, lk: CapeLook): Mat {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), map: capeTexture(id, lk), side: THREE.DoubleSide, alphaTest: 0.5 });
  const fx = FX_ID[lk.fx];
  const fxColor = new THREE.Color(lk.fxColor ?? 0xffffff);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCapeTime = CAPE_TIME;
    sh.uniforms.uCapeFx = { value: fxColor };
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + VERT_RIPPLE);
    sh.fragmentShader = `#define CAPE_FX ${fx}\n` + FRAG_HEAD + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + FRAG_FX);
  };
  m.customProgramCacheKey = () => `cape${fx}`;
  m.userData.cape = id;
  return m;
}

const geometries = new Map<string, THREE.BufferGeometry>();
/** The cloth panel: w wide at the top, flaring a little to the hem, curving round the back. Top edge at y 0. */
function capeGeometry(w: number, len: number): THREE.BufferGeometry {
  const key = `${Math.round(w * 50)}:${Math.round(len * 50)}`;
  let g = geometries.get(key);
  if (g) return g;
  g = new THREE.PlaneGeometry(1, 1, 6, 10);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const v = 0.5 - pos.getY(i); // 0 at the top, 1 at the hem
    const across = 2 * px; // -1 … 1
    pos.setXYZ(i, px * w * (1 + 0.3 * v), -v * len, -0.06 * (1 - across * across) - 0.02 * v);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  geometries.set(key, g);
  return g;
}

const tmpBox = new THREE.Box3();
const tmpMesh = new THREE.Box3();
const tmpInv = new THREE.Matrix4();
const tmpM = new THREE.Matrix4();

/** Bounds of the torso and what it wears, in torso space (outfit capes and hidden parts left out). */
function torsoBounds(torso: THREE.Object3D, skip: THREE.Object3D | null): THREE.Box3 {
  torso.updateWorldMatrix(true, true);
  tmpInv.copy(torso.matrixWorld).invert();
  tmpBox.makeEmpty();
  const walk = (o: THREE.Object3D) => {
    if (!o.visible || o === skip || o.userData.capePart) return;
    const me = o as THREE.Mesh;
    if (me.isMesh && me.geometry) {
      if (!me.geometry.boundingBox) me.geometry.computeBoundingBox();
      tmpMesh.copy(me.geometry.boundingBox!).applyMatrix4(tmpM.multiplyMatrices(tmpInv, me.matrixWorld));
      tmpBox.union(tmpMesh);
    }
    for (const c of o.children) walk(c);
  };
  for (const c of torso.children) walk(c);
  if (tmpBox.isEmpty()) tmpBox.set(new THREE.Vector3(-0.25, -0.1, -0.2), new THREE.Vector3(0.25, 0.6, 0.2));
  return tmpBox;
}

export interface BuiltCape {
  /** Hangs the cloth; becomes rig.cape (CreatureView swings it). */
  pivot: THREE.Group;
  /** Mantle, collar and clasp on the shoulders. */
  mantle: THREE.Group;
}

/**
 * Builds the worn cape for a rig, sized to its torso. `skip` is the outfit's own
 * cape (left out of the measurement and hidden by the caller). M is the wearer's
 * material cache (mantle and clasp colours). Returns null for a non-cape id.
 */
export function buildCape(rig: BipedRig, id: string, M: MatFn, skip: THREE.Object3D | null): BuiltCape | null {
  const lk = capeLook(id);
  const b = torsoBounds(rig.torso, skip);
  const top = b.max.y;
  const back = b.min.z;
  const front = b.max.z;
  const width = Math.min(0.78, Math.max(0.44, (b.max.x - b.min.x) * 0.82));
  // hem at about knee height: the torso's origin is at the hips
  const len = Math.max(0.7, top + 0.32);
  const cloth = new THREE.Mesh(capeGeometry(width, len), capeMaterial(id, lk));
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  cloth.onBeforeRender = tick;
  const pivot = group(0, top - 0.05, back - 0.015, cloth);
  pivot.rotation.x = 0.12;
  // mantle over the shoulders, open at the front, pinned by a clasp at the collar
  const mainM = M(lk.main);
  const darkM = M(lk.dark);
  const trimM = M(lk.trim);
  const depth = front - back;
  const mw = width + 0.08;
  const mantle = group(0, 0, 0,
    box(mw, 0.07, depth * 0.6, mainM, 0, top - 0.01, back + depth * 0.3),
    box(mw + 0.02, 0.025, 0.035, trimM, 0, top - 0.03, back + depth * 0.6),
    box(0.07, 0.07, 0.04, trimM, 0, top - 0.04, front + 0.005),
  );
  for (const s of [-1, 1]) mantle.add(box(0.07, 0.16, depth * 0.58, darkM, s * (mw / 2 - 0.02), top - 0.09, back + depth * 0.31));
  if (lk.collar !== 'plain') {
    const cm = M(lk.collar === 'fur' ? 0xe8dcc4 : 0xe8b232);
    mantle.add(box(width * 0.7, 0.07, 0.09, cm, 0, top + 0.03, back + 0.03));
  }
  pivot.userData.capePart = true;
  mantle.userData.capePart = true;
  return { pivot, mantle };
}

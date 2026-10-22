import * as THREE from 'three';
import { hash2 } from '../../game/core/rng';
import { Obj, type WorldMap } from '../../game/world/WorldMap';
import type { SeaLayout, SeaPropKind } from '../../game/world/sea';
import { Mesher, type V3 } from '../models/darkRigsCore';
import { toonGradient } from '../models/parts';

/**
 * Everything the Sunken Reach (game/world/sea.ts) adds to the world view:
 * reef and wreck props (one instanced mesh per kind; kelp and anemones sway
 * in the vertex shader), the planked hulls of the wrecks, slow caustics over
 * the sea floor, the whirlpool at the end of Pearl Pier and the bubble column
 * under it. Built once; `update` only advances one shared time uniform and
 * spins the whirlpool.
 */
export interface SeaView {
  /** Floor 0: the whirlpool on the pier. */
  surface: THREE.Group;
  /** The sea floor's floor (−1): props, hulls, caustics, the bubble column glow. */
  floor: THREE.Group;
  update(dt: number, pz: number): void;
}

const KELP_G = [0x2e4a1c, 0x3a5a22, 0x4a6626, 0x5a6a2a];

type Built = { base: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null };

/** Merged vertex-coloured geometry for one prop kind (shared by every instance). */
function propGeo(k: SeaPropKind): Built {
  const m = new Mesher();
  m.ao = 0.25;
  const P = (x: number, y: number, z: number): V3 => [x, y, z];
  switch (k) {
    case 'kelp': {
      // three ribbons of blades rising and leaning
      for (let s = 0; s < 3; s++) {
        const a = s * 2.1;
        const bx = Math.sin(a) * 0.14, bz = Math.cos(a) * 0.14;
        const h = 1.1 + s * 0.25;
        for (let i = 0; i < 6; i++) {
          const y = (i / 6) * h;
          m.box(0.035, h / 6 + 0.02, 0.035, KELP_G[(s + i) % 4], [bx + Math.sin(i + s) * 0.04, y + h / 12, bz], { grit: 0.15, flat: true });
          m.box(0.16, 0.012, 0.07, KELP_G[(s + i + 1) % 4], [bx + 0.07 * (i % 2 ? 1 : -1), y + 0.08, bz], { r: [0, a + i, (i % 2 ? 1 : -1) * 0.5], two: true, flat: true });
        }
      }
      break;
    }
    case 'kelpTall': {
      for (let s = 0; s < 5; s++) {
        const a = s * 1.3;
        const bx = Math.sin(a) * 0.22, bz = Math.cos(a) * 0.22;
        const h = 2.2 + (s % 3) * 0.35;
        for (let i = 0; i < 8; i++) {
          const y = (i / 8) * h;
          m.box(0.05, h / 8 + 0.02, 0.05, KELP_G[(s + i) % 4], [bx, y + h / 16, bz], { grit: 0.15, flat: true });
          m.box(0.24, 0.014, 0.1, KELP_G[(s + i + 2) % 4], [bx + 0.1 * (i % 2 ? 1 : -1), y + 0.1, bz], { r: [0, a + i * 0.7, (i % 2 ? 1 : -1) * 0.55], two: true, flat: true });
          if (i % 3 === 2) m.sph(0.045, 0x6a6a2a, [bx, y + 0.12, bz + 0.05], { flat: true }, 0); // gas bladder
        }
      }
      m.sph(0.3, 0x3a3428, [0, 0.05, 0], { s: [1.2, 0.3, 1.2], grit: 0.3 }); // holdfast rock
      break;
    }
    case 'anemone': {
      m.cyl(0.08, 0.1, 0.16, 0x6a3a4a, [0, 0.08, 0], { grit: 0.2 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        m.spike(P(Math.sin(a) * 0.06, 0.15, Math.cos(a) * 0.06), [Math.sin(a) * 0.6, 1, Math.cos(a) * 0.6], 0.22 + (i % 3) * 0.04, 0.018, i % 2 ? 0xc06a8a : 0xe0a0b0, { flat: true });
      }
      m.sph(0.03, 0xffd0e0, [0, 0.16, 0], { glow: true }, 0);
      break;
    }
    case 'coralFan': {
      // a lattice fan standing on edge
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + i * 0.3;
        m.seg([0, 0, 0], [Math.sin(a) * 0.5, 0.3 + Math.cos(a) * 0.35, 0], 0.02, 0.012, 0xb04a3a, { flat: true });
      }
      for (let r = 1; r <= 3; r++) m.ring(0.18 * r, 0.01, 0xc0584a, [0, 0.22, 0], { r: [Math.PI / 2, 0, 0] }, Math.PI * 0.95, 8);
      break;
    }
    case 'coralTube': {
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25;
        const h = 0.25 + (i % 3) * 0.12;
        const c = i % 2 ? 0x8a5ab0 : 0xc8a03a;
        m.cyl(0.05, 0.06, h, c, [Math.sin(a) * 0.1, h / 2, Math.cos(a) * 0.1], { grit: 0.25 }, 7);
        m.cyl(0.035, 0.035, 0.012, 0x1a1418, [Math.sin(a) * 0.1, h + 0.002, Math.cos(a) * 0.1], { flat: true }, 7);
      }
      break;
    }
    case 'coralBranch': {
      // a branching staghorn coral, pale with purple tips
      const branch = (a: V3, dir: V3, len: number, r: number, depth: number) => {
        const b: V3 = [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len];
        m.seg(a, b, r, r * 0.75, depth > 1 ? 0xd8c8b8 : 0xb070a8, { grit: 0.2 });
        if (depth <= 0) return;
        for (const t of [-0.6, 0.6]) {
          const d: V3 = [dir[0] * 0.6 + t * dir[2] + t * 0.3, dir[1] * 0.8 + 0.2, dir[2] * 0.6 - t * dir[0]];
          const n = Math.hypot(...d);
          branch(b, [d[0] / n, d[1] / n, d[2] / n], len * 0.72, r * 0.7, depth - 1);
        }
      };
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1;
        branch([0, 0, 0], [Math.sin(a) * 0.4, 0.9, Math.cos(a) * 0.4], 0.45, 0.07, 3);
      }
      m.sph(0.28, 0x5a4a40, [0, 0.02, 0], { s: [1.2, 0.35, 1.2], grit: 0.3 });
      break;
    }
    case 'coralBrain': {
      m.sph(0.42, 0xb8905a, [0, 0.24, 0], { s: [1, 0.62, 1], grit: 0.25 });
      for (let i = 0; i < 5; i++) m.ring(0.12 + i * 0.06, 0.018, 0x8a6a3a, [0, 0.4 - i * 0.03, 0], { r: [0.1 * i, i, 0] }, Math.PI * 1.4, 10);
      m.sph(0.1, 0x6a8a5a, [0.28, 0.12, 0.12], { s: [1.4, 0.5, 1], grit: 0.3 });
      break;
    }
    case 'spire': {
      m.cone(0.36, 1.4, 0x4a4844, [0, 0.7, 0], { grit: 0.35 }, 6);
      m.cone(0.22, 0.9, 0x5a5650, [0.18, 0.45, -0.1], { r: [0, 0, -0.25], grit: 0.35 }, 5);
      m.sph(0.1, 0xb04a3a, [0.08, 0.9, 0.12], { s: [1, 0.6, 1], grit: 0.3 });
      m.sph(0.12, 0x5a6a3a, [-0.14, 0.4, 0.16], { s: [1.2, 0.5, 1], grit: 0.4 });
      for (let i = 0; i < 4; i++) m.cyl(0.03, 0.04, 0.05, 0xa8a090, [Math.sin(i * 1.7) * 0.22, 0.25 + i * 0.12, Math.cos(i * 1.7) * 0.22], {}, 5);
      break;
    }
    case 'anchor': {
      m.push([0, 0, 0], [0.5, 0.4, 0.3]);
      m.cyl(0.05, 0.05, 1.4, 0x5a3a24, [0, 0.6, 0], { grit: 0.4 });
      m.ring(0.12, 0.03, 0x5a3a24, [0, 1.35, 0], { r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 8);
      m.box(0.6, 0.06, 0.06, 0x4a3020, [0, 1.1, 0], { grit: 0.4 });
      m.ring(0.45, 0.05, 0x5a3a24, [0, 0.4, 0], { r: [Math.PI / 2, 0, Math.PI] }, Math.PI, 8);
      for (const s of [-1, 1]) m.spike([s * 0.45, 0.4, 0], [s * 0.4, 1, 0], 0.18, 0.06, 0x4a3020);
      m.pop();
      break;
    }
    case 'shell': {
      m.sph(0.1, 0xd8c0a0, [0, 0.03, 0], { s: [1, 0.35, 1.2], grit: 0.2 });
      for (let i = 0; i < 4; i++) m.box(0.012, 0.02, 0.2, 0xa88a6a, [-0.045 + i * 0.03, 0.06, 0], { r: [0, (i - 1.5) * 0.25, 0], flat: true });
      break;
    }
    case 'starfish': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        m.seg([0, 0.03, 0], [Math.sin(a) * 0.17, 0.02, Math.cos(a) * 0.17], 0.04, 0.012, i % 2 ? 0xc0602a : 0xd0703a, { flat: true });
      }
      m.sph(0.045, 0xc0602a, [0, 0.03, 0], { s: [1, 0.5, 1], flat: true });
      break;
    }
    case 'urchin': {
      m.sph(0.08, 0x2a1a2a, [0, 0.08, 0], { grit: 0.2 });
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4, b = (i / 14) * Math.PI;
        m.spike([0, 0.08, 0], [Math.sin(b) * Math.cos(a), Math.cos(b) * 0.8 + 0.2, Math.sin(b) * Math.sin(a)], 0.17, 0.008, 0x3a2438, { flat: true }, 3);
      }
      break;
    }
    case 'clam': {
      m.sph(0.24, 0x7a8a7a, [0, 0.08, 0], { s: [1.2, 0.35, 1], grit: 0.3 });
      m.push([0, 0.1, -0.1], [-0.55, 0, 0]);
      m.sph(0.24, 0x8a9a8a, [0, 0.0, 0.12], { s: [1.2, 0.3, 1], grit: 0.3 });
      m.pop();
      m.sph(0.06, 0xffffff, [0, 0.12, 0.05], { glow: true }, 1); // a pearl inside
      m.sph(0.18, 0xd8b8b0, [0, 0.09, 0.02], { s: [1, 0.2, 0.8], flat: true });
      break;
    }
    case 'ribs': {
      // the bleached ribcage of something huge
      m.seg([-0.5, 0.06, 0], [0.5, 0.06, 0], 0.05, 0.04, 0xd8ccb0, { grit: 0.2 });
      for (let i = 0; i < 6; i++) {
        const x = -0.42 + i * 0.17;
        for (const s of [-1, 1]) m.horn([[x, 0.06, 0], [x, 0.36, s * 0.22], [x + 0.05, 0.48, s * 0.42]], 0.03, 0xe0d4b8, 0xb8ac90);
      }
      break;
    }
    case 'plank': {
      for (let i = 0; i < 3; i++) m.box(0.9 - i * 0.2, 0.05, 0.16, i % 2 ? 0x3a2a1e : 0x4a3424, [0, 0.03 + i * 0.03, -0.18 + i * 0.18], { r: [0, (i - 1) * 0.6, 0.05], grit: 0.35 });
      m.cyl(0.015, 0.015, 0.1, 0x5a3a24, [0.3, 0.08, 0], {}, 4); // a bent nail
      break;
    }
    case 'mast': {
      // a broken mast lying on the floor, the torn sail draped over it
      m.cyl(0.11, 0.13, 3.6, 0x3e2c1e, [0, 0.13, 0], { r: [0, 0, Math.PI / 2], grit: 0.35 });
      m.cyl(0.05, 0.05, 1.4, 0x3e2c1e, [0.6, 0.18, 0], { r: [Math.PI / 2, 0, 0], grit: 0.35 }); // yard
      m.box(1.5, 0.02, 1.0, 0x6a6450, [-0.3, 0.2, 0.35], { r: [0.12, 0.1, 0.05], two: true, grit: 0.4 });
      m.box(0.9, 0.02, 0.6, 0x5a5440, [-1.0, 0.1, -0.3], { r: [-0.1, 0.4, 0.05], two: true, grit: 0.4 });
      for (let i = 0; i < 4; i++) m.sph(0.06, 0xa8a090, [-1.4 + i * 0.8, 0.22, 0.05], { s: [1, 0.6, 1], grit: 0.3 });
      break;
    }
    case 'cannon': {
      m.cyl(0.11, 0.14, 0.9, 0x2a2c2e, [0, 0.14, 0], { r: [Math.PI / 2, 0, 0], grit: 0.3 });
      m.cyl(0.13, 0.13, 0.08, 0x3a3c3e, [0, 0.14, 0.42], { r: [Math.PI / 2, 0, 0] });
      m.cyl(0.06, 0.06, 0.02, 0x0a0a0a, [0, 0.14, 0.46], { r: [Math.PI / 2, 0, 0], flat: true });
      m.sph(0.09, 0x6a5a3a, [0.05, 0.22, -0.2], { s: [1.2, 0.5, 1.4], grit: 0.4 }); // crusted with growth
      break;
    }
    case 'vent': {
      m.cone(0.22, 0.4, 0x3a3634, [0, 0.2, 0], { grit: 0.35 }, 6);
      m.cyl(0.06, 0.06, 0.02, 0x0a0806, [0, 0.4, 0], { flat: true }, 6);
      m.sph(0.04, 0xffffff, [0, 0.4, 0], { glow: true }, 0);
      break;
    }
  }
  return { base: m.build('base'), glow: m.build('glow') };
}

/** Kinds that sway with the water. */
const SWAY: Partial<Record<SeaPropKind, number>> = { kelp: 1, kelpTall: 0.7, anemone: 0.5, coralFan: 0.08 };

/** A toon material with vertex colours whose vertices sway with the current. */
function swayMat(time: { value: number }, sway: number, glow = 0): THREE.MeshToonMaterial {
  const mt = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient(), emissive: glow, emissiveIntensity: glow ? 1.6 : 1 });
  if (sway > 0) {
    mt.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #else
    vec3 ip = vec3(0.0);
  #endif
  float hh = max(position.y, 0.0);
  float sw = sin(uTime * 1.1 + ip.x * 0.7 + ip.z * 0.9) * 0.16 + sin(uTime * 2.3 + ip.z * 1.3) * 0.05;
  transformed.x += sw * hh * hh * ${sway.toFixed(2)};
  transformed.z += cos(uTime * 0.9 + ip.x * 1.1) * 0.1 * hh * hh * ${sway.toFixed(2)};`);
    };
    mt.customProgramCacheKey = () => `sea-sway-${sway}`;
  }
  return mt;
}

/** The planked hull of a wreck: one block per hull tile. */
function hullGeo(): THREE.BufferGeometry {
  const m = new Mesher();
  m.ao = 0.4;
  for (let i = 0; i < 5; i++) {
    const y = 0.12 + i * 0.26;
    m.box(1.02, 0.22, 0.9 - (i % 2) * 0.06, i % 2 ? 0x3a2a1e : 0x4a3424, [0, y, 0], { grit: 0.4 });
    m.box(1.04, 0.03, 0.92, 0x1e1610, [0, y + 0.12, 0], { flat: true });
  }
  m.box(0.16, 1.5, 0.16, 0x2a1e14, [0.4, 0.75, 0.4], { grit: 0.3 }); // a rib post
  m.box(1.06, 0.08, 1.0, 0x5a4a36, [0, 1.42, 0], { grit: 0.35 }); // gunwale
  for (const [x, y, z] of [[-0.3, 0.3, 0.46], [0.2, 0.6, 0.47], [0.35, 0.2, -0.46], [-0.2, 0.9, -0.47]] as const) m.cyl(0.05, 0.07, 0.06, 0xa8a090, [x, y, z], { r: [Math.PI / 2, 0, 0] }, 5);
  m.sph(0.2, 0x3a5030, [0.1, 1.46, 0], { s: [1.6, 0.25, 1.2], grit: 0.4 }); // weed on the rail
  return m.build('base')!;
}

/** A spiral foam texture for the whirlpool. */
function swirlTexture(): THREE.Texture {
  const N = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d')!;
  const img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = (i - N / 2 + 0.5) / (N / 2), dy = (j - N / 2 + 0.5) / (N / 2);
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const arm = Math.sin(a * 3 + r * 9) * 0.5 + 0.5;
    const foam = r < 1 ? Math.pow(arm, 3) * Math.min(1, r * 1.6) : 0;
    const deep = r < 1 ? 1 - r : 0;
    const k = (j * N + i) * 4;
    img.data[k] = 30 + foam * 200 + deep * 10;
    img.data[k + 1] = 70 + foam * 180 - deep * 30;
    img.data[k + 2] = 110 + foam * 140 - deep * 50;
    img.data[k + 3] = r < 1 ? 255 : 0;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Slow sun-net caustics drawn over the sea floor (additive, no depth write). */
function causticMaterial(time: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uColor: { value: new THREE.Color(0x8fe6ff) } },
    vertexShader: `varying vec2 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vW;
float net(vec2 p, float t) {
  float a = sin(p.x * 1.7 + sin(p.y * 1.3 + t * 0.8) * 1.4 + t * 0.6);
  float b = sin(p.y * 1.9 + sin(p.x * 1.1 - t * 0.7) * 1.4 - t * 0.5);
  return pow(clamp(1.0 - abs(a + b) * 0.55, 0.0, 1.0), 5.0);
}
void main() {
  vec2 p = vW * 0.85;
  float k = net(p, uTime) * 0.7 + net(p * 1.9 + 3.1, uTime * 1.3) * 0.45;
  gl_FragColor = vec4(uColor * k * 0.32, 1.0);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function buildSeaView(world: WorldMap, sea: SeaLayout): SeaView {
  const time = { value: 0 };
  const surface = new THREE.Group();
  const floor = new THREE.Group();
  floor.name = 'sea-floor';

  // ---- props: one instanced mesh (+ one glow mesh) per kind
  const byKind = new Map<SeaPropKind, Array<(typeof sea.props)[number]>>();
  for (const p of sea.props) {
    const l = byKind.get(p.k);
    if (l) l.push(p);
    else byKind.set(p.k, [p]);
  }
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const S = new THREE.Vector3();
  const V = new THREE.Vector3();
  const C = new THREE.Color();
  for (const [k, list] of byKind) {
    const g = propGeo(k);
    const sway = SWAY[k] ?? 0;
    const parts: Array<[THREE.BufferGeometry | null, THREE.Material]> = [
      [g.base, swayMat(time, sway)],
      [g.glow, swayMat(time, sway, 0x9fe8ff)],
    ];
    for (const [geo, mt] of parts) {
      if (!geo) continue;
      const im = new THREE.InstancedMesh(geo, mt, list.length);
      list.forEach((p, i) => {
        const big = k === 'mast' || k === 'ribs';
        M.compose(V.set(p.x, 0, p.y), Q.setFromEuler(E.set(0, p.r, 0)), S.setScalar(big ? 1 : p.s));
        im.setMatrixAt(i, M);
        im.setColorAt(i, C.setScalar(0.85 + hash2(p.x, p.y, 420) * 0.3));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = k !== 'kelp' && k !== 'anemone';
      im.receiveShadow = true;
      im.computeBoundingSphere();
      floor.add(im);
    }
  }

  // ---- wreck hulls
  const hullTiles: Array<[number, number]> = [];
  for (let y = sea.y0; y <= sea.y1; y++) for (let x = sea.x0; x <= sea.x1; x++) if (world.getObj(x, y, sea.z) === Obj.Hull) hullTiles.push([x, y]);
  if (hullTiles.length) {
    const im = new THREE.InstancedMesh(hullGeo(), new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() }), hullTiles.length);
    hullTiles.forEach(([x, y], i) => {
      // broken, uneven hull tops: some planks rotted lower than others
      const h = 0.55 + hash2(x, y, 421) * 0.5;
      M.compose(V.set(x, 0, y), Q.setFromEuler(E.set((hash2(x, y, 422) - 0.5) * 0.08, Math.floor(hash2(x, y, 423) * 4) * (Math.PI / 2), (hash2(x, y, 424) - 0.5) * 0.08)), S.set(1, h, 1));
      im.setMatrixAt(i, M);
      im.setColorAt(i, C.setScalar(0.8 + hash2(x, y, 425) * 0.35));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    floor.add(im);
  }

  // ---- caustics over the whole sea floor
  const w = sea.x1 - sea.x0 + 1, h = sea.y1 - sea.y0 + 1;
  const caustics = new THREE.Mesh(new THREE.PlaneGeometry(w, h), causticMaterial(time));
  caustics.rotation.x = -Math.PI / 2;
  caustics.position.set(sea.x0 + w / 2 - 0.5, 0.012, sea.y0 + h / 2 - 0.5);
  caustics.renderOrder = 1;
  floor.add(caustics);

  // ---- the bubble column: a pale glow on the floor and a soft shaft of light rising
  const col = sea.column;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.46, 20), new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(col.x, 0.03, col.y);
  const shaftGeo = new THREE.CylinderGeometry(0.32, 0.45, 4.5, 14, 1, true);
  shaftGeo.translate(0, 2.25, 0);
  const shaft = new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  shaft.position.set(col.x, 0, col.y);
  floor.add(ring, shaft);

  // ---- the whirlpool at the end of the pier (floor 0)
  const wp = sea.whirlpool;
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ map: swirlTexture(), transparent: true, depthWrite: false }));
  swirl.rotation.x = -Math.PI / 2;
  swirl.position.set(wp.x, 0.03, wp.y);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.045, 4, 20), new THREE.MeshToonMaterial({ color: 0x4a3424, gradientMap: toonGradient() }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(wp.x, 0.04, wp.y);
  surface.add(swirl, rim);

  return {
    surface,
    floor,
    update(dt: number, pz: number): void {
      time.value += dt;
      if (pz === 0 || pz === 1) swirl.rotation.z -= dt * 2.6;
      if (pz === sea.z) {
        const k = 0.5 + Math.sin(time.value * 2.2) * 0.15;
        (ring.material as THREE.MeshBasicMaterial).opacity = k;
        (shaft.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(time.value * 1.3) * 0.04;
      }
    },
  };
}

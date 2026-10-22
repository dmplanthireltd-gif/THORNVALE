import * as THREE from 'three';
import { hash2 } from '../game/core/rng';
import { Obj, type WorldMap } from '../game/world/WorldMap';
import { CAVE_UNIFORMS, glowTex, type LightSource } from './caveRock';
import type { Mat } from './models/parts';

/**
 * Cave and wilderness dressing (world/underground.ts, world/spiderSteppe.ts):
 * cobwebs, glowing mushrooms, crystal clusters, braziers, puddles under
 * dripping water, mine-cart rails and spider egg sacs. Instanced per floor;
 * drips and ripples are animated in their shaders.
 */

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
function compose(x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0, rotZ = 0): THREE.Matrix4 {
  tmpQ.setFromEuler(tmpE.set(rotX, rotY, rotZ));
  return tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
}
const _c = new THREE.Color();

class Inst {
  m: number[] = [];
  c: number[] = [];
  constructor(readonly geo: THREE.BufferGeometry, readonly mat: THREE.Material, readonly shadows = false) {}
  add(mx: THREE.Matrix4, color: number | THREE.Color = 0xffffff): void {
    for (const e of mx.elements) this.m.push(e);
    const c = color instanceof THREE.Color ? color : _c.setHex(color);
    this.c.push(c.r, c.g, c.b);
  }
  build(group: THREE.Group, order = 0): void {
    const n = this.m.length / 16;
    if (!n) return;
    const im = new THREE.InstancedMesh(this.geo, this.mat, n);
    im.instanceMatrix.array.set(this.m);
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.c), 3);
    im.castShadow = this.shadows;
    im.receiveShadow = true;
    im.renderOrder = order;
    im.computeBoundingSphere();
    group.add(im);
  }
}

let webTexCache: THREE.Texture | null = null;
/** A torn spider web: spokes and a spiral, white on transparent. */
function webTex(): THREE.Texture {
  if (webTexCache) return webTexCache;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d')!;
  x.strokeStyle = 'rgba(235,235,230,0.9)';
  x.lineWidth = 1;
  const cx = 8, cy = 8; // anchored in a corner, like a web strung across a nook
  const spokes = 7;
  for (let k = 0; k < spokes; k++) {
    const a = (k / (spokes - 1)) * (Math.PI / 2) + (hash2(k, 1, 3) - 0.5) * 0.12;
    x.beginPath();
    x.moveTo(cx, cy);
    x.lineTo(cx + Math.cos(a) * 62, cy + Math.sin(a) * 62);
    x.stroke();
  }
  x.strokeStyle = 'rgba(225,225,220,0.75)';
  for (let r = 8; r < 60; r += 6 + (r % 4)) {
    x.beginPath();
    for (let k = 0; k < spokes; k++) {
      if (hash2(r, k, 7) < 0.12) { x.stroke(); x.beginPath(); continue; } // torn strands
      const a = (k / (spokes - 1)) * (Math.PI / 2);
      const rr = r + (hash2(r, k, 9) - 0.5) * 2;
      if (k === 0) x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  webTexCache = t;
  return t;
}

const DROP_VERT = /* glsl */ `
uniform float uTime;
varying float vA;
void main() {
  vec3 o = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
  float ph = fract(sin(dot(o.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float t = fract(uTime * 0.38 + ph);
  float y = 1.85 * (1.0 - t * t * 2.2);
  vA = step(0.0, y);
  vec3 p = position * (0.7 + 0.3 * vA) + vec3(o.x, max(y, 0.0) + 0.05, o.z);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}`;
const DROP_FRAG = /* glsl */ `
varying float vA;
void main() { if (vA < 0.5) discard; gl_FragColor = vec4(0.62, 0.78, 0.95, 0.85); }`;

const RIPPLE_VERT = /* glsl */ `
varying vec2 vUv;
varying float vPh;
void main() {
  vUv = uv;
  vec3 o = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
  vPh = fract(sin(dot(o.xz, vec2(12.9898, 78.233))) * 43758.5453);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const RIPPLE_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vPh;
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  // the drop lands when its fall ends (see DROP_VERT): a ring runs out from there
  float t = fract(uTime * 0.38 + vPh);
  float lt = clamp((t - 0.674) / 0.326, 0.0, 1.0);
  float ring = (1.0 - smoothstep(0.0, 0.08, abs(r - lt * 0.9))) * (1.0 - lt) * step(0.001, lt);
  vec3 water = vec3(0.07, 0.10, 0.14) + vec3(0.25, 0.35, 0.45) * ring;
  float a = 0.82 * (1.0 - smoothstep(0.8, 1.0, r));
  gl_FragColor = vec4(water, a);
}`;

export class DecorBuilder {
  private readonly webs: Inst;
  private readonly stems: Inst;
  private readonly caps: Inst;
  private readonly crystal: Inst;
  private readonly crystalBase: Inst;
  private readonly bowl: Inst;
  private readonly legs: Inst;
  private readonly coals: Inst;
  private readonly flames: Inst;
  private readonly puddles: Inst;
  private readonly drops: Inst;
  private readonly rails: Inst;
  private readonly sleepers: Inst;
  private readonly eggs: Inst;
  private readonly glows: Inst;
  readonly lights: LightSource[] = [];

  constructor(private readonly world: WorldMap, private readonly z: number, M: (color: number, opts?: { emissive?: number; map?: THREE.Texture | null }) => Mat, flameMats: Mat[]) {
    const webMat = new THREE.MeshBasicMaterial({ map: webTex(), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, depthWrite: false, color: 0xd8d8d0 });
    this.webs = new Inst(new THREE.PlaneGeometry(1.15, 1.15), webMat);
    this.stems = new Inst(new THREE.CylinderGeometry(0.018, 0.024, 0.14, 4).translate(0, 0.07, 0), M(0xd8d0b8));
    this.caps = new Inst(new THREE.SphereGeometry(0.07, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.13, 0), M(0xffffff, { emissive: 0x2a8a7a }));
    this.crystal = new Inst(new THREE.OctahedronGeometry(0.13, 0).scale(0.75, 2.4, 0.75).translate(0, 0.28, 0), M(0xc8f0ff, { emissive: 0x3a90c0 }), true);
    this.crystalBase = new Inst(new THREE.DodecahedronGeometry(0.26, 0).scale(1, 0.45, 1), M(0x5a5450), true);
    const iron = M(0x2e2c2c);
    this.bowl = new Inst(new THREE.CylinderGeometry(0.34, 0.2, 0.22, 8).translate(0, 0.62, 0), iron, true);
    this.legs = new Inst(new THREE.CylinderGeometry(0.03, 0.04, 0.55, 4).translate(0, 0.27, 0), iron, true);
    this.coals = new Inst(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8).translate(0, 0.72, 0), M(0x3a1a0c, { emissive: 0x8a2a00 }));
    const fireMat = M(0xff8a2a, { emissive: 0xff5a10 });
    flameMats.push(fireMat);
    this.flames = new Inst(new THREE.ConeGeometry(0.12, 0.42, 5).translate(0, 0.94, 0), fireMat);
    this.puddles = new Inst(new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2).translate(0, 0.012, 0), new THREE.ShaderMaterial({
      uniforms: { uTime: CAVE_UNIFORMS.uTime }, vertexShader: RIPPLE_VERT, fragmentShader: RIPPLE_FRAG, transparent: true, depthWrite: false,
    }));
    this.drops = new Inst(new THREE.SphereGeometry(0.035, 4, 3).scale(0.8, 1.6, 0.8), new THREE.ShaderMaterial({
      uniforms: { uTime: CAVE_UNIFORMS.uTime }, vertexShader: DROP_VERT, fragmentShader: DROP_FRAG,
    }));
    this.rails = new Inst(new THREE.BoxGeometry(1.0, 0.05, 0.05), M(0x5a5652));
    this.sleepers = new Inst(new THREE.BoxGeometry(0.16, 0.04, 0.72), M(0x4a3420));
    this.eggs = new Inst(new THREE.IcosahedronGeometry(0.13, 1).scale(1, 1.25, 1).translate(0, 0.13, 0), M(0xcfc8b0, { emissive: 0x1a1a0a }));
    this.glows = new Inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  }

  /** Adds the model for a decoration object; false for anything else. */
  add(o: Obj, x: number, y: number): boolean {
    const h = hash2(x, y, 3);
    const rot = hash2(x, y, 5) * Math.PI * 2;
    const under = this.z < 0;
    switch (o) {
      case Obj.Cobweb: {
        // strung across the tile at an angle, and a second, smaller one low down
        const q = Math.floor(h * 4) * (Math.PI / 2);
        this.webs.add(compose(x, 0.62, y, q + 0.6, 1, 1, 1, 0.15, 0));
        if (h > 0.4) this.webs.add(compose(x + 0.1, 0.06, y + 0.05, q, 0.7, 0.7, 0.7, -Math.PI / 2, 0));
        return true;
      }
      case Obj.GlowShrooms: {
        const tint = [0x3ad8c0, 0x7ae84a, 0xb06aff][Math.floor(hash2(x, y, 8) * 3)];
        for (let i = 0; i < 5; i++) {
          const ox = (hash2(x, y, 10 + i) - 0.5) * 0.7, oz = (hash2(x, y, 20 + i) - 0.5) * 0.7;
          const s = 0.6 + hash2(x, y, 30 + i) * 0.9;
          this.stems.add(compose(x + ox, 0, y + oz, 0, s, s, s));
          this.caps.add(compose(x + ox, 0, y + oz, rot, s, s, s), _c.setHex(tint).multiplyScalar(1.2));
        }
        this.glows.add(compose(x, 0.03, y, 0, 2.0, 1, 2.0), _c.setHex(tint).multiplyScalar(0.28));
        return true;
      }
      case Obj.Crystals: {
        this.crystalBase.add(compose(x, 0.04, y, rot));
        for (let i = 0; i < 5; i++) {
          const a = rot + i * 1.26;
          const lean = 0.25 + hash2(x, y, 40 + i) * 0.4;
          const s = 0.7 + hash2(x, y, 50 + i) * 0.8;
          this.crystal.add(compose(x + Math.cos(a) * 0.12, 0.02, y + Math.sin(a) * 0.12, a, s, s, s, Math.sin(a) * lean, -Math.cos(a) * lean));
        }
        this.glows.add(compose(x, 0.03, y, 0, 2.8, 1, 2.8), 0x1a4a6a);
        this.lights.push({ x, y, h: 0.9, color: 0x6ad0ff, power: 0.6 });
        return true;
      }
      case Obj.Brazier:
        this.bowl.add(compose(x, 0, y));
        for (let i = 0; i < 3; i++) {
          const a = rot + i * 2.09;
          this.legs.add(compose(x + Math.cos(a) * 0.2, 0, y + Math.sin(a) * 0.2, a, 1, 1, 1, Math.sin(a) * 0.25, -Math.cos(a) * 0.25));
        }
        this.coals.add(compose(x, 0, y));
        for (let i = 0; i < 3; i++) this.flames.add(compose(x + Math.cos(rot + i * 2.1) * 0.1, 0, y + Math.sin(rot + i * 2.1) * 0.1, 0, 1, 0.8 + hash2(x, y, 60 + i) * 0.5, 1));
        this.glows.add(compose(x, 0.03, y, 0, under ? 4.2 : 2.5, 1, under ? 4.2 : 2.5), 0x8a4a14);
        this.lights.push({ x, y, h: 1.4, color: 0xffa050, power: 1.2 });
        return true;
      case Obj.Puddle:
        this.puddles.add(compose(x, 0, y, rot, 0.8 + h * 0.5, 1, 0.7 + h * 0.4));
        this.drops.add(compose(x + (hash2(x, y, 7) - 0.5) * 0.2, 0, y + (hash2(x, y, 9) - 0.5) * 0.2));
        return true;
      case Obj.Rails: {
        const w = this.world;
        const horiz = w.getObj(x - 1, y, this.z) === Obj.Rails || w.getObj(x + 1, y, this.z) === Obj.Rails;
        const r = horiz ? 0 : Math.PI / 2;
        for (const off of [-0.25, 0.25]) this.rails.add(compose(x + (horiz ? 0 : off), 0.04, y + (horiz ? off : 0), r));
        for (const s of [-0.3, 0.05, 0.38]) this.sleepers.add(compose(x + (horiz ? s : 0), 0.02, y + (horiz ? 0 : s), r), _c.setScalar(0.8 + hash2(x, y, 70) * 0.3));
        return true;
      }
      case Obj.EggSacs:
        for (let i = 0; i < 4; i++) {
          const ox = (hash2(x, y, 80 + i) - 0.5) * 0.55, oz = (hash2(x, y, 90 + i) - 0.5) * 0.55;
          const s = 0.7 + hash2(x, y, 100 + i) * 0.6;
          this.eggs.add(compose(x + ox, 0, y + oz, rot + i, s, s, s), _c.setScalar(0.85 + hash2(x, y, 110 + i) * 0.25));
        }
        this.webs.add(compose(x, 0.05, y, rot, 0.9, 0.9, 0.9, -Math.PI / 2, 0));
        if (under) this.glows.add(compose(x, 0.03, y, 0, 1.6, 1, 1.6), 0x2a3a10);
        return true;
      default:
        return false;
    }
  }

  build(group: THREE.Group): void {
    for (const b of [this.stems, this.caps, this.crystal, this.crystalBase, this.bowl, this.legs, this.coals, this.flames, this.rails, this.sleepers, this.eggs, this.drops]) b.build(group);
    this.puddles.build(group, 1);
    this.webs.build(group, 2);
    this.glows.build(group, 3);
  }
}

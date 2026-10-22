import * as THREE from 'three';

/**
 * The one shared weather particle system: a single instanced quad drawn in
 * one call. Every particle lives entirely on the GPU — its position comes
 * from a fixed random seed, the time and the wind, wrapped inside a box that
 * follows the camera — so the CPU only sets a handful of uniforms per frame
 * and nothing is allocated after start-up.
 *
 * Layers (fixed slices of the buffer; `setCounts` says how many of each draw):
 *   0 rain streaks · 1 splashes / ripples · 2 snowflakes · 3 sand sheets and dust
 *   4 mist / snow-cloud / dust-cloud puffs · 5 blowing leaves
 */
export const LAYER_RAIN = 0;
export const LAYER_SPLASH = 1;
export const LAYER_SNOW = 2;
export const LAYER_SAND = 3;
export const LAYER_MIST = 4;
export const LAYER_LEAF = 5;
/** Buffer size of each layer (the "High" setting draws all of them at full strength). */
export const LAYER_CAP = [3000, 700, 2600, 1500, 90, 180];

const vert = /* glsl */ `
attribute vec4 aSeed;
attribute vec2 aMeta;
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uCount[6];
uniform vec2 uWind;
uniform float uGale;
uniform vec3 uCamDir;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uAlpha[6];
varying vec2 vUv;
varying float vKind;
varying float vAlpha;
varying float vTone;

float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

// wraps a coordinate into the box around the camera so particles stay put in the world
float wrapC(float v, float size, float center) {
  float lo = center - size * 0.5;
  return lo + mod(v - lo, size);
}

void main() {
  int layer = int(aMeta.x + 0.5);
  float idx = aMeta.y;
  vUv = position.xy + 0.5;
  vKind = aMeta.x;
  vTone = aSeed.w;
  vAlpha = 0.0;
  float active = 0.0;
  for (int i = 0; i < 6; i++) if (i == layer) active = step(idx + 0.5, uCount[i]) * uAlpha[i];
  if (active <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  vec3 P;
  vec2 c = position.xy;
  float W = uBox.x, H = uBox.y, D = uBox.z;
  vec3 windV = vec3(uWind.x, 0.0, uWind.y);

  if (layer == 0) {
    // rain: long thin streaks falling along the wind
    float speed = 15.0 + 5.0 * aSeed.w;
    float cyc = aSeed.z + uTime * speed / H;
    float ph = fract(cyc), id = floor(cyc);
    vec3 vel = vec3(uWind.x * 7.0, -speed, uWind.y * 7.0);
    float fall = ph * H / speed;
    vec3 base = vec3(aSeed.x * W + h1(id + aSeed.x * 97.0) * W, H * (1.0 - ph), aSeed.y * D + h1(id * 1.7 + aSeed.y * 61.0) * D);
    base.xz += vel.xz * fall;
    vec3 ctr = vec3(wrapC(base.x, W, uCenter.x), uCenter.y + base.y, wrapC(base.z, D, uCenter.z));
    vec3 A = normalize(vel);
    vec3 S = normalize(cross(A, uCamDir));
    float L = 0.5 + 0.35 * aSeed.w;
    P = ctr + S * (c.x * 0.036) + A * (c.y * L);
    vAlpha = active * (0.55 + 0.45 * aSeed.w);
  } else if (layer == 1) {
    // splashes: rings that open on the ground and on water
    float life = 0.38 + 0.2 * aSeed.w;
    float cyc = aSeed.z + uTime / life;
    float ph = fract(cyc), id = floor(cyc);
    float x = wrapC(aSeed.x * W + h1(id + aSeed.x * 13.0) * W * 3.0, W * 0.8, uCenter.x);
    float z = wrapC(aSeed.y * D + h1(id * 3.1 + aSeed.y * 7.0) * D * 3.0, D * 0.8, uCenter.z);
    float r = 0.05 + 0.2 * ph;
    P = vec3(x, uCenter.y + 0.035, z) + vec3(c.x * r * 2.0, 0.0, c.y * r * 2.0);
    vAlpha = active * (1.0 - ph) * (1.0 - ph);
  } else if (layer == 2) {
    // snow: soft flakes drifting down, swept sideways in a blizzard
    float speed = 1.0 + 0.7 * aSeed.w + uGale * 1.6;
    float cyc = aSeed.z + uTime * speed / H;
    float ph = fract(cyc), id = floor(cyc);
    float fall = ph * H / speed;
    vec3 base = vec3(aSeed.x * W + h1(id + aSeed.x * 31.0) * W, H * (1.0 - ph), aSeed.y * D + h1(id * 2.3 + aSeed.y * 17.0) * D);
    base.xz += vec2(uWind.x, uWind.y) * (1.5 + uGale * 9.0) * fall;
    base.x += sin(uTime * (0.9 + aSeed.w) + aSeed.x * 40.0) * 0.4;
    base.z += cos(uTime * (0.7 + aSeed.w) + aSeed.y * 30.0) * 0.3;
    vec3 ctr = vec3(wrapC(base.x, W, uCenter.x), uCenter.y + base.y, wrapC(base.z, D, uCenter.z));
    float s = 0.055 + 0.05 * aSeed.w;
    P = ctr + uCamRight * (c.x * s) + uCamUp * (c.y * s);
    vAlpha = active;
  } else if (layer == 3) {
    // sand: low sheets racing along the wind, fading in and out
    float speed = 6.0 + 6.0 * aSeed.w;
    float ph = fract(aSeed.z + uTime * 0.45 * (0.6 + aSeed.w));
    float id = floor(aSeed.z + uTime * 0.45 * (0.6 + aSeed.w));
    vec2 dir = length(uWind) > 0.001 ? normalize(uWind) : vec2(1.0, 0.0);
    vec2 p = vec2(aSeed.x * W + h1(id + aSeed.x * 5.0) * W, aSeed.y * D + h1(id + aSeed.y * 9.0) * D) + dir * speed * uTime;
    float y = 0.04 + aSeed.w * aSeed.w * 2.4 + sin(uTime * 2.0 + aSeed.x * 20.0) * 0.08;
    vec3 ctr = vec3(wrapC(p.x, W, uCenter.x), uCenter.y + y, wrapC(p.y, D, uCenter.z));
    vec3 A = vec3(dir.x, 0.04, dir.y);
    vec3 S = normalize(cross(A, uCamDir));
    float L = 0.5 + 1.4 * aSeed.w;
    P = ctr + S * (c.x * (0.04 + 0.05 * aSeed.y)) + A * (c.y * L);
    vAlpha = active * sin(ph * 3.14159);
  } else if (layer == 4) {
    // mist / blown cloud: big soft puffs drifting low over the ground
    float ph = fract(aSeed.z + uTime * 0.035 * (0.6 + aSeed.w));
    float id = floor(aSeed.z + uTime * 0.035 * (0.6 + aSeed.w));
    vec2 p = vec2(aSeed.x * W + h1(id + aSeed.x) * 9.0, aSeed.y * D + h1(id * 1.3 + aSeed.y) * 9.0) + uWind * (0.6 + uGale * 6.0) * uTime;
    vec3 ctr = vec3(wrapC(p.x, W, uCenter.x), uCenter.y + 0.25 + aSeed.w * 1.2, wrapC(p.y, D, uCenter.z));
    float s = 2.6 + 3.0 * aSeed.w;
    P = ctr + uCamRight * (c.x * s) + uCamUp * (c.y * s * 0.7);
    vAlpha = active * sin(ph * 3.14159);
  } else {
    // leaves: tumbling along the wind
    float speed = 2.0 + 3.0 * aSeed.w;
    float cyc = aSeed.z + uTime * 0.18 * (0.5 + aSeed.w);
    float ph = fract(cyc), id = floor(cyc);
    vec2 dir = length(uWind) > 0.001 ? normalize(uWind) : vec2(1.0, 0.0);
    vec2 p = vec2(aSeed.x * W + h1(id + aSeed.x * 3.0) * W, aSeed.y * D + h1(id + aSeed.y * 4.0) * D) + dir * speed * uTime;
    float y = 0.2 + 2.8 * (1.0 - ph) + sin(uTime * 3.0 + aSeed.x * 50.0) * 0.25;
    vec3 ctr = vec3(wrapC(p.x, W, uCenter.x), uCenter.y + y, wrapC(p.y, D, uCenter.z));
    float a = uTime * (3.0 + aSeed.w * 4.0) + aSeed.x * 20.0;
    vec2 rc = vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a) * 0.6);
    float s = 0.085;
    P = ctr + uCamRight * (rc.x * s) + uCamUp * (rc.y * s);
    vAlpha = active * min(1.0, sin(ph * 3.14159) * 3.0);
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`;

const frag = /* glsl */ `
uniform vec3 uRainColor;
uniform vec3 uSnowColor;
uniform vec3 uSandColor;
uniform vec3 uMistColor;
uniform float uLight;
varying vec2 vUv;
varying float vKind;
varying float vAlpha;
varying float vTone;

void main() {
  int k = int(vKind + 0.5);
  vec2 q = vUv * 2.0 - 1.0;
  vec3 col;
  float a;
  if (k == 0) {
    // streak: brighter head, fading tail
    col = uRainColor;
    a = (1.0 - abs(q.x)) * smoothstep(-1.0, 0.6, q.y) * 0.5;
  } else if (k == 1) {
    float d = length(q);
    col = uRainColor * 1.1;
    a = smoothstep(0.55, 0.78, d) * (1.0 - smoothstep(0.8, 1.0, d)) * 0.75;
  } else if (k == 2) {
    float d = length(q);
    col = uSnowColor;
    a = 1.0 - smoothstep(0.35, 1.0, d);
  } else if (k == 3) {
    col = uSandColor * (0.85 + 0.3 * vTone);
    a = (1.0 - abs(q.x)) * (1.0 - abs(q.y)) * 0.5;
  } else if (k == 4) {
    float d = length(q);
    col = uMistColor;
    a = (1.0 - smoothstep(0.1, 1.0, d)) * 0.16 * (0.8 + 0.2 * sin(q.x * 3.0 + q.y * 2.0 + vTone * 6.0));
  } else {
    col = mix(vec3(0.36, 0.5, 0.16), vec3(0.62, 0.42, 0.14), vTone);
    float d = abs(q.x) + abs(q.y);
    a = 1.0 - step(1.0, d);
  }
  a *= vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * uLight, a);
}`;

/** Fixed GPU buffers: one quad, one seed per particle. */
export class WeatherParticles {
  readonly mesh: THREE.Mesh;
  readonly uniforms: {
    uTime: { value: number }; uCenter: { value: THREE.Vector3 }; uBox: { value: THREE.Vector3 };
    uCount: { value: number[] }; uAlpha: { value: number[] }; uWind: { value: THREE.Vector2 }; uGale: { value: number };
    uCamDir: { value: THREE.Vector3 }; uCamRight: { value: THREE.Vector3 }; uCamUp: { value: THREE.Vector3 };
    uRainColor: { value: THREE.Color }; uSnowColor: { value: THREE.Color }; uSandColor: { value: THREE.Color }; uMistColor: { value: THREE.Color };
    uLight: { value: number };
  };

  constructor() {
    const total = LAYER_CAP.reduce((a, b) => a + b, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seed = new Float32Array(total * 4);
    const meta = new Float32Array(total * 2);
    // a fixed little generator, so every client's weather looks alike
    let s = 0x9e3779b9;
    const rnd = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let o = 0;
    LAYER_CAP.forEach((cap, layer) => {
      for (let i = 0; i < cap; i++, o++) {
        for (let j = 0; j < 4; j++) seed[o * 4 + j] = rnd();
        meta[o * 2] = layer;
        meta[o * 2 + 1] = i;
      }
    });
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.setAttribute('aMeta', new THREE.InstancedBufferAttribute(meta, 2));
    g.instanceCount = total;
    this.uniforms = {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(46, 14, 46) },
      uCount: { value: [0, 0, 0, 0, 0, 0] }, uAlpha: { value: [0, 0, 0, 0, 0, 0] }, uWind: { value: new THREE.Vector2(1, 0) }, uGale: { value: 0 },
      uCamDir: { value: new THREE.Vector3(0, -1, 0) }, uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamUp: { value: new THREE.Vector3(0, 0, -1) },
      uRainColor: { value: new THREE.Color(0xb8cce0) }, uSnowColor: { value: new THREE.Color(0xf4f8ff) }, uSandColor: { value: new THREE.Color(0xd2ad6e) },
      uMistColor: { value: new THREE.Color(0xd8e2d8) }, uLight: { value: 1 },
    };
    const m = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.name = 'weatherParticles';
  }

  /** How many of each layer to draw (clamped to the buffers) and how strongly. */
  setLayer(layer: number, count: number, alpha: number): void {
    this.uniforms.uCount.value[layer] = Math.max(0, Math.min(LAYER_CAP[layer], Math.round(count)));
    this.uniforms.uAlpha.value[layer] = Math.max(0, alpha);
  }

  get anyActive(): boolean {
    const u = this.uniforms;
    for (let i = 0; i < 6; i++) if (u.uCount.value[i] > 0 && u.uAlpha.value[i] > 0.001) return true;
    return false;
  }
}

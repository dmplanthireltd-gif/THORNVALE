import * as THREE from 'three';

/**
 * Full-screen weather haze, drawn last over the world: an even veil plus a
 * ring that thickens with distance from the player, so sandstorms (and to a
 * lesser degree blizzards and mist) close in the view. Moving streaks in the
 * veil read as blowing sand or snow. One quad, a few uniforms.
 */
const vert = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uBase;
uniform float uMax;
uniform float uR0;
uniform float uR1;
uniform vec2 uHalf;
uniform vec2 uWind;
uniform float uTime;
uniform float uStreak;
varying vec2 vNdc;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 t = vNdc * uHalf;            // tiles from the player (x east, y north)
  float d = length(t);
  float a = uBase + (uMax - uBase) * smoothstep(uR0, uR1, d);
  // gusts: noise stretched along the wind and scrolling with it
  vec2 w = length(uWind) > 0.001 ? normalize(uWind) : vec2(1.0, 0.0);
  vec2 q = vec2(dot(t, w), dot(t, vec2(-w.y, w.x)));
  float n = noise(vec2(q.x * 0.18 - uTime * 2.2, q.y * 1.1)) * 0.6 + noise(vec2(q.x * 0.5 - uTime * 4.0, q.y * 2.7)) * 0.4;
  a *= 1.0 + (n - 0.5) * uStreak;
  a = clamp(a, 0.0, 0.92);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export class WeatherHaze {
  readonly mesh: THREE.Mesh;
  readonly u = {
    uColor: { value: new THREE.Color(0xc8a060) },
    uBase: { value: 0 },
    uMax: { value: 0 },
    uR0: { value: 10 },
    uR1: { value: 14 },
    uHalf: { value: new THREE.Vector2(12, 8) },
    uWind: { value: new THREE.Vector2(1, 0) },
    uTime: { value: 0 },
    uStreak: { value: 0 },
  };

  constructor() {
    const g = new THREE.BufferGeometry();
    // one big triangle covering the screen
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.u, transparent: true, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.mesh.name = 'weatherHaze';
    this.mesh.visible = false;
  }
}

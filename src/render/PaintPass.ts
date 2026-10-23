import * as THREE from 'three';

/**
 * Painted style (render/style.ts) final pass. The scene is drawn at full screen
 * resolution into a multisampled buffer, then one full-screen quad:
 * - draws a thin dark outline around creatures, players and NPCs (their materials
 *   write a marker into the alpha channel, see markOutline), so they read like sprites;
 * - adds a soft vignette (stronger underground) and a gentle warm grade;
 * - tone maps and converts to the screen colour space.
 * One extra full-screen draw; the world's draw calls are unchanged.
 */

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const frag = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 texel;
uniform float vignette;
uniform float aspect;
uniform float lineW;
varying vec2 vUv;

// creature pixels carry alpha 0.5 (markOutline); everything else 1
float isCreature(vec2 uv) {
  return clamp((0.9 - texture2D(tColor, uv).a) * 2.5, 0.0, 1.0);
}

void main() {
  vec4 c = texture2D(tColor, vUv);
  float me = clamp((0.9 - c.a) * 2.5, 0.0, 1.0);
  vec3 col = c.rgb;
  if (me < 0.99) {
    // outside a creature: darken where a creature pixel is within the line width
    vec2 o = texel * lineW;
    vec2 h = o * 0.5;
    float near = 0.0;
    near = max(near, isCreature(vUv + vec2(o.x, 0.0)));
    near = max(near, isCreature(vUv - vec2(o.x, 0.0)));
    near = max(near, isCreature(vUv + vec2(0.0, o.y)));
    near = max(near, isCreature(vUv - vec2(0.0, o.y)));
    near = max(near, isCreature(vUv + o * 0.7));
    near = max(near, isCreature(vUv - o * 0.7));
    near = max(near, isCreature(vUv + vec2(o.x, -o.y) * 0.7));
    near = max(near, isCreature(vUv + vec2(-o.x, o.y) * 0.7));
    near = max(near, isCreature(vUv + vec2(h.x, 0.0)));
    near = max(near, isCreature(vUv - vec2(h.x, 0.0)));
    near = max(near, isCreature(vUv + vec2(0.0, h.y)));
    near = max(near, isCreature(vUv - vec2(0.0, h.y)));
    float line = near * (1.0 - me);
    col = mix(col, col * 0.08 + vec3(0.01, 0.006, 0.003), line * 0.92);
  }
  // gentle warm grade and a touch more richness
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.08);
  col *= vec3(1.03, 1.0, 0.95);
  // soft vignette
  vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
  float v = smoothstep(0.35, 1.05, length(q) * 1.15);
  col *= 1.0 - v * vignette;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class PaintPass {
  private target: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  width = 1;
  height = 1;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    this.target.texture.generateMipmaps = false;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        tColor: { value: this.target.texture },
        texel: { value: new THREE.Vector2(1, 1) },
        vignette: { value: 0.35 },
        aspect: { value: 1 },
        lineW: { value: 1.5 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  /** Buffer size in device pixels; `lineW` = outline width in device pixels. */
  setSize(w: number, h: number, lineW: number): void {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    this.material.uniforms.lineW.value = lineW;
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.target.setSize(w, h);
    this.material.uniforms.texel.value.set(1 / w, 1 / h);
    this.material.uniforms.aspect.value = w / h;
  }

  set vignette(v: number) {
    this.material.uniforms.vignette.value = v;
  }

  get renderTarget(): THREE.WebGLRenderTarget {
    return this.target;
  }

  compile(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.compile(scene, camera);
    renderer.setRenderTarget(prev);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCam);
  }
}

const marked = new WeakSet<THREE.Material>();
/**
 * Makes a creature material write the outline marker (alpha 0.5) when it is drawn
 * opaque. Opaque materials draw without blending, so the marker lands in the buffer
 * untouched; fading (transparent) materials are left alone.
 */
export function markOutline(m: THREE.Material): void {
  if (marked.has(m)) return;
  marked.add(m);
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n#ifdef OPAQUE\n  gl_FragColor.a = 0.5;\n#endif');
  };
  m.customProgramCacheKey = () => prevKey() + '|outline';
  m.needsUpdate = true;
}

/** Marks every material of a creature model (see markOutline). */
export function markOutlineTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    const ms = Array.isArray(me.material) ? me.material : [me.material];
    for (const m of ms) if (m && !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial) markOutline(m);
  });
}

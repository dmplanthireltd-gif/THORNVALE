import * as THREE from 'three';

/** Logical pixels per tile in pixel-art mode (matches the 32×32 textures). */
export const TILE_PX = 32;

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const frag = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float outline;
uniform float threshold;
varying vec2 vUv;

void main() {
  vec4 c = texture2D(tColor, vUv);
  if (outline > 0.5) {
    float d = texture2D(tDepth, vUv).x;
    float n = texture2D(tDepth, vUv + vec2(0.0, texel.y)).x;
    float s = texture2D(tDepth, vUv - vec2(0.0, texel.y)).x;
    float e = texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x;
    float w = texture2D(tDepth, vUv - vec2(texel.x, 0.0)).x;
    // outline the near side of any depth step, like the dark rim around a sprite
    float edge = max(max(n - d, s - d), max(e - d, w - d));
    if (edge > threshold) c.rgb *= 0.28;
  }
  gl_FragColor = vec4(c.rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Renders the scene into a low-resolution buffer (32 px per tile) and blows it
 * up with nearest-neighbour filtering, adding a one-pixel dark outline wherever
 * depth jumps. The result reads like classic hand-drawn 32×32 sprites while
 * every object stays real 3D geometry.
 */
export class PixelPass {
  private target: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  width = 1;
  height = 1;

  constructor() {
    this.target = this.makeTarget(1, 1);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        texel: { value: new THREE.Vector2(1, 1) },
        outline: { value: 1 },
        threshold: { value: 0.0007 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const t = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    t.texture.generateMipmaps = false;
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.FloatType;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    t.depthTexture = depth;
    return t;
  }

  setSize(w: number, h: number): void {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.target.setSize(w, h);
    this.material.uniforms.texel.value.set(1 / w, 1 / h);
  }

  /** Compiles the scene's shaders for drawing into this pass's buffer (render targets use other shader variants than the screen). */
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

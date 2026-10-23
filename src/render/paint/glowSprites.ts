import * as THREE from 'three';

/**
 * Painted style: soft halos round the world's flames and lamps (street lamps,
 * torches, altar candles, campfires, burning fields, braziers): camera-facing
 * additive quads with a smooth radial glow and a warm core. One instanced mesh
 * per map chunk; WorldView flickers the shared material with the flames.
 */
const TILT = THREE.MathUtils.degToRad(32);
const CHUNK = 32;

let tex: THREE.CanvasTexture | null = null;
export function haloTexture(): THREE.CanvasTexture {
  if (tex) return tex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.1, 'rgba(255,250,235,0.8)');
  r.addColorStop(0.3, 'rgba(255,230,190,0.32)');
  r.addColorStop(0.6, 'rgba(255,200,140,0.1)');
  r.addColorStop(1, 'rgba(255,180,120,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, S, S);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class GlowSprites {
  private chunks = new Map<number, { m: number[]; c: number[] }>();
  readonly material = new THREE.MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 });
  private geo: THREE.PlaneGeometry;
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();

  constructor() {
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.rotateX(-(Math.PI / 2 - TILT));
  }

  /** A halo at world (x, y, z) of `size` world units, coloured `color`, `k` brightness. */
  add(x: number, y: number, z: number, size: number, color: number, k = 1): void {
    const key = Math.floor(z / CHUNK) * 4096 + Math.floor(x / CHUNK);
    let ch = this.chunks.get(key);
    if (!ch) this.chunks.set(key, (ch = { m: [], c: [] }));
    // pulled a little toward the camera so walls and the flame itself do not cut it
    this.dummy.position.set(x, y + Math.cos(TILT) * 0.25, z + Math.sin(TILT) * 0.25);
    this.dummy.scale.setScalar(size);
    this.dummy.updateMatrix();
    for (const e of this.dummy.matrix.elements) ch.m.push(e);
    this.col.setHex(color).multiplyScalar(k);
    ch.c.push(this.col.r, this.col.g, this.col.b);
  }

  build(group: THREE.Group): void {
    for (const ch of this.chunks.values()) {
      const n = ch.c.length / 3;
      const im = new THREE.InstancedMesh(this.geo, this.material, n);
      im.instanceMatrix.array.set(ch.m);
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ch.c), 3);
      im.castShadow = false;
      im.receiveShadow = false;
      im.renderOrder = 4;
      im.computeBoundingSphere();
      im.name = 'halos';
      group.add(im);
    }
    this.chunks.clear();
  }
}

import * as THREE from 'three';
import type { Mat } from './models/parts';

/**
 * Bakes small static models (stairs, ladders, wells, chests, market boards,
 * furnaces…) into one merged mesh per map chunk and material look, so a town
 * full of props costs a handful of draw calls instead of one per box. The look
 * is unchanged: each part's colour becomes a vertex colour under a white copy of
 * its material (same texture, same glow), and every merged mesh still casts and
 * receives shadows and dims with its floor.
 *
 * Only plain opaque cel meshes are merged; anything else (transparent glows,
 * flickering flames, meshes that change at runtime) stays as it was.
 */
export class StaticMerger {
  private parts = new Map<string, { mat: Mat; cast: boolean; chunk: number; geos: THREE.BufferGeometry[] }>();
  private mats = new Map<string, Mat>();
  private tmp = new THREE.Matrix4();

  /**
   * `makeMat` creates a floor-owned cel material; `keep` tells which materials
   * must stay on their own meshes (animated flames); `chunkOf` maps a position to
   * its map chunk.
   */
  constructor(
    private readonly makeMat: (color: number, opts: { emissive?: number; map?: THREE.Texture | null }) => Mat,
    private readonly keep: (m: THREE.Material) => boolean,
    private readonly chunkOf: (x: number, z: number) => number,
  ) {}

  /**
   * Takes the mergeable meshes out of `root` (a model placed on the floor, not
   * yet added to it). Returns true when nothing is left in it, so the caller can
   * drop the empty group.
   */
  take(root: THREE.Object3D): boolean {
    root.updateMatrixWorld(true);
    const chunk = this.chunkOf(root.position.x, root.position.z);
    const taken: THREE.Mesh[] = [];
    root.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh || (me as THREE.InstancedMesh).isInstancedMesh || !o.visible) return;
      const m = me.material as THREE.Material;
      if (Array.isArray(me.material) || !(m as Mat).isMeshToonMaterial || m.transparent || m.side !== THREE.FrontSide || this.keep(m)) return;
      if ((m as Mat).vertexColors || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
      const g = me.geometry;
      if (!g.attributes.position || !g.attributes.normal || me.matrixWorld.determinant() < 0) return;
      taken.push(me);
    });
    for (const me of taken) {
      const m = me.material as Mat;
      const look = this.look(m);
      const key = `${chunk}|${look}|${me.castShadow ? 1 : 0}`;
      let part = this.parts.get(key);
      if (!part) this.parts.set(key, (part = { mat: this.material(look, m), cast: me.castShadow, chunk, geos: [] }));
      part.geos.push(this.bake(me, m));
      me.parent?.remove(me);
    }
    let left = 0;
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) left++; });
    return left === 0;
  }

  /** What makes two materials draw alike apart from their colour. */
  private look(m: Mat): string {
    return `${m.map ? m.map.uuid : '-'}|${m.emissive.getHexString()}|${m.emissiveIntensity}`;
  }

  private material(look: string, like: Mat): Mat {
    let mm = this.mats.get(look);
    if (!mm) {
      mm = this.makeMat(0xffffff, { map: like.map, emissive: like.emissive.getHex() });
      mm.emissiveIntensity = like.emissiveIntensity;
      mm.vertexColors = true;
      this.mats.set(look, mm);
    }
    return mm;
  }

  /** The mesh's geometry in floor space, unindexed, with its material colour as vertex colour. */
  private bake(me: THREE.Mesh, m: Mat): THREE.BufferGeometry {
    const src = me.geometry.index ? me.geometry.toNonIndexed() : me.geometry.clone();
    src.applyMatrix4(this.tmp.copy(me.matrixWorld));
    const n = src.attributes.position.count;
    const base = (m.userData.base as THREE.Color | undefined) ?? m.color;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = base.r; col[i * 3 + 1] = base.g; col[i * 3 + 2] = base.b; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', src.attributes.position);
    out.setAttribute('normal', src.attributes.normal);
    out.setAttribute('uv', src.attributes.uv ?? new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }

  /** Adds the merged meshes to the floor group. */
  build(group: THREE.Group): void {
    for (const part of this.parts.values()) {
      const geo = mergeUnindexed(part.geos);
      const me = new THREE.Mesh(geo, part.mat);
      me.castShadow = part.cast;
      me.receiveShadow = true;
      me.name = 'merged';
      group.add(me);
    }
    this.parts.clear();
  }
}

/** Concatenates unindexed geometries that share the same attributes (position, normal, uv, color). */
function mergeUnindexed(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'color'];
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize;
    let total = 0;
    for (const g of geos) total += g.attributes[name].count * size;
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of geos) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      arr.set(a.array as Float32Array, o);
      o += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

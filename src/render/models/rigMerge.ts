import * as THREE from 'three';
import type { Mat } from './parts';
import type { Rig } from './rigs';

/**
 * Fewer draw calls per character, same look. A dressed humanoid is built from
 * dozens of small boxes, spheres and cylinders (each one draw call, twice with
 * its shadow). This bakes, inside every joint group of the rig, the plain parts
 * that look alike apart from their colour into one mesh: the colours become
 * vertex colours under a white copy of the material. Groups are never touched,
 * so every joint still moves, gear still attaches and detaches, capes still
 * swing and hit flashes / see-through still reach every material.
 *
 * The head's own pieces are shown and hidden under helmets by their tag
 * (`userData.cover` / `face`, see applyGear): they only merge with pieces of the
 * same tag, and the merged mesh keeps the tag. Left alone: anything else tagged
 * in userData, anything hidden, shared dark monster geometry, glows,
 * transparent or already vertex-coloured parts.
 */
export function mergeRig(rig: Rig): void {
  const nodes: THREE.Object3D[] = [];
  rig.root.traverse((o) => { if (o.children.length > 1) nodes.push(o); });
  let merged = false;
  for (const node of nodes) {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const c of node.children) {
      const me = c as THREE.Mesh;
      if (!me.isMesh || (me as THREE.InstancedMesh).isInstancedMesh || me === rig.hitbox || c.children.length || !c.visible) continue;
      const tags = Object.keys(c.userData);
      if (tags.some((t) => t !== 'cover' && t !== 'face') || me.geometry.userData.shared || me.geometry.morphAttributes.position) continue;
      const m = me.material as Mat;
      if (Array.isArray(me.material) || !m.isMeshToonMaterial || m.transparent || m.vertexColors || m.userData.noMerge) continue;
      if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) continue;
      if (!me.geometry.attributes.position || !me.geometry.attributes.normal) continue;
      me.updateMatrix();
      if (me.matrix.determinant() <= 0) continue;
      const key = `${m.map ? m.map.uuid : '-'}|${m.emissive.getHexString()}|${m.emissiveIntensity}|${m.side}|${m.alphaTest}|${me.castShadow ? 1 : 0}|${me.receiveShadow ? 1 : 0}|${me.renderOrder}|${c.userData.cover ?? ''}|${c.userData.face ? 1 : 0}`;
      const list = groups.get(key);
      if (list) list.push(me);
      else groups.set(key, [me]);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const first = list[0];
      const src = first.material as Mat;
      const mm = src.clone();
      mm.color.setRGB(1, 1, 1);
      mm.vertexColors = true;
      mm.userData = {};
      const geo = bake(list);
      const out = new THREE.Mesh(geo, mm);
      out.castShadow = first.castShadow;
      out.receiveShadow = first.receiveShadow;
      out.renderOrder = first.renderOrder;
      out.name = 'rigMerged';
      if (first.userData.cover !== undefined) out.userData.cover = first.userData.cover;
      if (first.userData.face) out.userData.face = true;
      for (const me of list) node.remove(me);
      node.add(out);
      merged = true;
    }
  }
  if (!merged) return;
  // the merged materials replace the parts' own in the list that hit flashes and fading walk
  const set = new Set<Mat>();
  rig.root.traverse((o) => {
    const m = (o as THREE.Mesh).material as Mat | undefined;
    if (m && m.isMeshToonMaterial && o !== rig.hitbox) set.add(m);
  });
  // keep any extra materials the rig listed that are not in the graph as toon meshes (boss auras)
  for (const m of rig.materials) if (!(m as Mat).isMeshToonMaterial) set.add(m);
  rig.materials.length = 0;
  rig.materials.push(...set);
}

/** The meshes' geometries in their parent's space, unindexed, each tinted with its material colour. */
function bake(list: THREE.Mesh[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let n = 0;
  for (const me of list) {
    const g = me.geometry.index ? me.geometry.toNonIndexed() : me.geometry.clone();
    g.applyMatrix4(me.matrix);
    parts.push(g);
    n += g.attributes.position.count;
  }
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  let o = 0;
  list.forEach((me, k) => {
    const g = parts[k];
    const c = ((me.material as Mat).color);
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nrm.set(g.attributes.normal.array as Float32Array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array as Float32Array, o * 2);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += cnt;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

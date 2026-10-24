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

/** Skinned merges of dark monster kinds: same parts → same geometry for every instance. */
const SKIN_CACHE = new Map<string, THREE.BufferGeometry>();
const NO_RENDER_HOOK = THREE.Object3D.prototype.onBeforeRender;

/**
 * Painted style, one more step down in draw calls (perf pass 2026-10-24): after mergeRig a
 * character is still one mesh per joint group and look (head, torso, each arm and leg…),
 * drawn twice with its shadow. This bakes the meshes of the WHOLE rig that share a look into
 * one rigidly skinned mesh: every vertex belongs to exactly one joint group (weight 1), and
 * the joint groups themselves are the skeleton's bones, so every animation (walk, attack,
 * block, death, collapse, wings, necks, jaws) still moves exactly the same parts. Nothing
 * changes on screen: same geometry, vertex colours, materials (hit flash, fade, outline).
 *
 * Left alone (they change at runtime): the weapon and shield mounts (hidden while skilling),
 * capes (their own wind shader), hidden or transparent parts, anything with its own shader
 * hooks except the shared grim monster body, the hitbox, points and lines.
 */
export function skinRig(rig: Rig): void {
  const root = rig.root;
  root.updateMatrixWorld(true);
  const skip = new Set<THREE.Object3D>();
  const g = (rig as { gear?: { weaponMount: THREE.Object3D; shieldMount: THREE.Object3D } }).gear;
  if (g) { skip.add(g.weaponMount); skip.add(g.shieldMount); }
  const cape = (rig as { cape?: THREE.Object3D | null }).cape;
  if (cape) skip.add(cape);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  // see-through (seeThrough.ts) measures the model's reach once from its parts: do it while they are still parts
  if (root.userData.coverR === undefined) {
    const box = new THREE.Box3();
    let r = 0.4;
    root.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh || me === rig.hitbox || o.userData.noShadow) return;
      if (!me.geometry.boundingBox) me.geometry.computeBoundingBox();
      box.copy(me.geometry.boundingBox!).applyMatrix4(me.matrixWorld);
      r = Math.max(r, Math.abs(box.min.x - root.position.x), Math.abs(box.max.x - root.position.x), Math.abs(box.min.z - root.position.z), Math.abs(box.max.z - root.position.z));
    });
    root.userData.coverR = r;
  }
  const groups = new Map<string, THREE.Mesh[]>();
  const visit = (o: THREE.Object3D, hidden: boolean): void => {
    if (skip.has(o)) return;
    const h = hidden || !o.visible;
    const me = o as THREE.Mesh;
    if (me.isMesh && !h && o !== root && me !== rig.hitbox && !(me as THREE.InstancedMesh).isInstancedMesh && !(me as THREE.SkinnedMesh).isSkinnedMesh && !o.children.length) {
      const m = me.material as Mat;
      const geo = me.geometry;
      const custom = m && m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile;
      const ok = m && !Array.isArray(me.material) && m.isMeshToonMaterial && !m.transparent && !m.userData.noMerge
        && (!custom || m.customProgramCacheKey() === 'grimMonster')
        && me.onBeforeRender === NO_RENDER_HOOK && !geo.morphAttributes.position
        && geo.attributes.position && geo.attributes.normal;
      if (ok) {
        // plain looks merge by look (material colour × vertex colour becomes the vertex colour); hooked materials only with themselves
        const look = custom
          ? `id:${m.uuid}`
          : `${m.map ? m.map.uuid : '-'}|${m.emissive.getHexString()}|${m.emissiveIntensity}|${m.side}|${m.alphaTest}|${m.gradientMap ? m.gradientMap.uuid : '-'}|${m.wireframe ? 1 : 0}`;
        const key = `${look}|${me.castShadow ? 1 : 0}|${me.receiveShadow ? 1 : 0}|${me.renderOrder}|${o.userData.noShadow ? 1 : 0}|${geo.attributes.uv ? 1 : 0}`;
        const list = groups.get(key);
        if (list) list.push(me);
        else groups.set(key, [me]);
      }
    }
    for (const c of o.children) visit(c, h);
  };
  visit(root, false);
  let merged = false;
  for (const list of groups.values()) {
    const parents = new Set(list.map((me) => me.parent!));
    if (list.length < 2 || parents.size < 2) continue;
    const bones = [...parents];
    const first = list[0];
    const src = first.material as Mat;
    const shared = src.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile;
    let mm: Mat;
    if (shared) mm = src;
    else {
      mm = src.clone();
      mm.color.setRGB(1, 1, 1);
      mm.vertexColors = true;
      mm.userData = {};
    }
    // dark monsters share their limb geometry per kind: share the skinned merge too
    const allShared = list.every((me) => me.geometry.userData.shared);
    const cacheKey = allShared ? list.map((me) => `${me.geometry.uuid}@${bones.indexOf(me.parent!)}:${me.matrix.elements.map((v) => v.toFixed(4)).join(',')}`).join(';') : '';
    let geo = cacheKey ? SKIN_CACHE.get(cacheKey) : undefined;
    if (!geo) {
      geo = bakeSkinned(list, bones, !shared);
      if (cacheKey) { geo.userData.shared = true; SKIN_CACHE.set(cacheKey, geo); }
    }
    const sk = new THREE.SkinnedMesh(geo, mm);
    // the bones are the rig's own joint groups (any Object3D works: Skeleton reads matrixWorld);
    // identity inverses + bind matrix: a vertex is stored in its joint's space, so world = joint.matrixWorld × vertex
    sk.bind(new THREE.Skeleton(bones as unknown as THREE.Bone[], bones.map(() => new THREE.Matrix4())), new THREE.Matrix4());
    sk.castShadow = first.castShadow;
    sk.receiveShadow = first.receiveShadow;
    sk.renderOrder = first.renderOrder;
    if (first.userData.noShadow) sk.userData.noShadow = true;
    sk.name = 'rigSkinned';
    // frustum culling: the posed parts' bounds in the rig's space plus room for swings
    const sph = new THREE.Sphere();
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    const m4 = new THREE.Matrix4();
    for (const me of list) {
      if (!me.geometry.boundingBox) me.geometry.computeBoundingBox();
      tmp.copy(me.geometry.boundingBox!).applyMatrix4(m4.multiplyMatrices(rootInv, me.matrixWorld));
      box.union(tmp);
    }
    box.getBoundingSphere(sph);
    sph.radius = sph.radius * 1.35 + 0.3;
    sk.boundingSphere = sph;
    for (const me of list) {
      me.parent!.remove(me);
      if (!me.geometry.userData.shared) me.geometry.dispose();
    }
    root.add(sk);
    merged = true;
  }
  if (!merged) return;
  const set = new Set<Mat>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as Mat | undefined;
    if (m && m.isMeshToonMaterial && o !== rig.hitbox) set.add(m);
  });
  for (const m of rig.materials) if (!(m as Mat).isMeshToonMaterial) set.add(m);
  rig.materials.length = 0;
  rig.materials.push(...set);
}

/** The meshes in their joint's space (unindexed), with joint indices, weights and (optionally) baked colours. */
function bakeSkinned(list: THREE.Mesh[], bones: THREE.Object3D[], tint: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let n = 0;
  for (const me of list) {
    me.updateMatrix();
    const g = me.geometry.index ? me.geometry.toNonIndexed() : me.geometry.clone();
    g.applyMatrix4(me.matrix);
    if (me.matrix.determinant() < 0) {
      // a mirrored part: keep its faces turned outward
      for (const name of Object.keys(g.attributes)) {
        const a = g.attributes[name] as THREE.BufferAttribute;
        const s = a.itemSize, arr = a.array as Float32Array;
        for (let t = 0; t + 2 < a.count; t += 3) for (let k = 0; k < s; k++) { const x = arr[(t + 1) * s + k]; arr[(t + 1) * s + k] = arr[(t + 2) * s + k]; arr[(t + 2) * s + k] = x; }
      }
    }
    parts.push(g);
    n += g.attributes.position.count;
  }
  const hasUv = parts.every((g) => g.attributes.uv);
  const hasCol = tint || parts.every((g) => g.attributes.color);
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  const uv = hasUv ? new Float32Array(n * 2) : null;
  const col = hasCol ? new Float32Array(n * 3) : null;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  let o = 0;
  list.forEach((me, k) => {
    const g = parts[k];
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nrm.set(g.attributes.normal.array as Float32Array, o * 3);
    if (uv) uv.set(g.attributes.uv.array as Float32Array, o * 2);
    if (col) {
      const c = (me.material as Mat).color;
      // a material without vertex colours ignores any colour attribute: only its own colour counts
      const vc = tint && !(me.material as Mat).vertexColors ? undefined : g.attributes.color as THREE.BufferAttribute | undefined;
      for (let i = 0; i < cnt; i++) {
        const r = vc ? vc.getX(i) : 1, gg = vc ? vc.getY(i) : 1, b = vc ? vc.getZ(i) : 1;
        col[(o + i) * 3] = tint ? r * c.r : r;
        col[(o + i) * 3 + 1] = tint ? gg * c.g : gg;
        col[(o + i) * 3 + 2] = tint ? b * c.b : b;
      }
    }
    const bi = bones.indexOf(me.parent!);
    for (let i = 0; i < cnt; i++) { si[(o + i) * 4] = bi; sw[(o + i) * 4] = 1; }
    o += cnt;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  out.computeBoundingSphere();
  return out;
}

import * as THREE from 'three';

/**
 * Tiny helpers for building procedural low-poly models.
 * All materials are cel-shaded (three light bands) to read like hand-shaded
 * pixel sprites once the pixel pass draws them at 32 px per tile.
 */
export type Mat = THREE.MeshToonMaterial;

let gradient: THREE.DataTexture | null = null;
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const steps = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(steps, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function mat(color: number, opts: { emissive?: number; map?: THREE.Texture | null } = {}): Mat {
  return new THREE.MeshToonMaterial({
    color,
    emissive: opts.emissive ?? 0x000000,
    gradientMap: toonGradient(),
    map: opts.map ?? null,
  });
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = mesh(new THREE.BoxGeometry(w, h, d), m);
  me.position.set(x, y, z);
  return me;
}

export function sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 1): THREE.Mesh {
  const me = mesh(new THREE.IcosahedronGeometry(r, detail), m);
  me.position.set(x, y, z);
  me.scale.set(sx, sy, sz);
  return me;
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const me = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  me.position.set(x, y, z);
  return me;
}

export function cone(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 6): THREE.Mesh {
  const me = mesh(new THREE.ConeGeometry(r, h, seg), m);
  me.position.set(x, y, z);
  return me;
}

export function group(x = 0, y = 0, z = 0, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (const c of children) g.add(c);
  return g;
}

/** Collects every cel material in a hierarchy (deduplicated). */
export function collectMaterials(root: THREE.Object3D): Mat[] {
  const set = new Set<Mat>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m && (m as Mat).isMeshToonMaterial) set.add(m as Mat);
  });
  return [...set];
}

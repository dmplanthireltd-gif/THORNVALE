import * as THREE from 'three';

/**
 * Painted style (render/style.ts): rounder, irregular shapes for the props that
 * matter most in the view — tree crowns, pine layers, bushes, rocks, stalagmites —
 * with smooth normals, so they shade softly instead of in flat facets. Same
 * pivots and rough sizes as the classic shapes, so placement code is shared.
 */

/** Welds vertices at the same position (positions only), so normals come out smooth. */
function mergeVertices(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.attributes.position;
  const map = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let j = map.get(k);
    if (j === undefined) {
      j = pos.length / 3;
      map.set(k, j);
      pos.push(x, y, z);
    }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

/** Cheap smooth 3D wobble from a direction (deterministic, so shared vertices move together). */
function wob(x: number, y: number, z: number, seed: number): number {
  return (
    Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed * 1.3) * 0.5 +
    Math.sin(y * 4.3 + z * 1.7 + seed * 2.1) * 0.3 +
    Math.sin((x + y) * 6.1 - z * 3.3 + seed * 0.7) * 0.2
  );
}

/** Planar uv from above, so tiling textures (leaves, rock) wrap the shape without seams. */
function topUv(g: THREE.BufferGeometry, scale: number): void {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) * scale + 0.5;
    uv[i * 2 + 1] = (p.getZ(i) + p.getY(i) * 0.5) * scale + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** A lumpy sphere: icosphere pushed in and out by a smooth wobble, smooth-shaded. */
function blob(r: number, detail: number, amp: number, seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = v.clone().normalize();
    v.multiplyScalar(1 + amp * wob(d.x, d.y, d.z, seed));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** Joins indexed geometries (position + index), recomputing smooth normals and a top-down uv. */
function join(parts: THREE.BufferGeometry[], uvScale: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const g of parts) {
    const base = pos.length / 3;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  topUv(out, uvScale);
  out.computeBoundingSphere();
  return out;
}

/** A cluster of lumps (cauliflower crown): `lumps` = [x, y, z, r] relative to radius 1. */
function cluster(r: number, lumps: Array<[number, number, number, number]>, detail: number, amp: number, seed: number): THREE.BufferGeometry {
  return join(lumps.map(([x, y, z, s], i) => blob(r * s, detail, amp, seed + i * 3.7).translate(x * r, y * r, z * r)), 1 / (r * 1.4));
}

/** A pine layer: a cone with a ragged, drooping rim of needle tips. */
function pineLayer(r: number, h: number, seed: number): THREE.BufferGeometry {
  const seg = 14;
  let g: THREE.BufferGeometry = new THREE.ConeGeometry(r, h, seg, 2, false);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr < 1e-4) continue;
    const a = Math.atan2(z, x);
    const t = (h / 2 - y) / h; // 0 at the tip, 1 at the rim
    const tip = Math.round(((a + Math.PI) / (Math.PI * 2)) * seg) % 2 === 0 ? 1.12 : 0.86;
    const k = 1 + (tip - 1) * t * t + wob(Math.cos(a), y, Math.sin(a), seed) * 0.08 * t;
    p.setXYZ(i, x * k, y - t * t * 0.12 * (tip > 1 ? 1 : 0.4), z * k);
  }
  g.computeVertexNormals();
  topUv(g, 1 / (r * 1.6));
  return g;
}

export const paintedProps = {
  /** Broad-leaf crown, low part (classic: icosahedron r 0.72). */
  canopyLow: () => cluster(0.5, [[0, 0, 0, 1.15], [0.55, -0.1, 0.25, 0.8], [-0.5, -0.05, 0.3, 0.78], [0.1, 0.05, -0.55, 0.82], [-0.25, 0.45, -0.1, 0.7]], 1, 0.16, 1.3),
  /** Broad-leaf crown, top (classic: icosahedron r 0.5). */
  canopyHigh: () => cluster(0.36, [[0, 0, 0, 1.15], [0.5, -0.15, 0.2, 0.75], [-0.45, -0.1, -0.25, 0.75], [0, 0.45, 0.05, 0.7]], 1, 0.16, 4.1),
  /** Jungle crown (classic: icosahedron r 0.85). */
  jungle: () => cluster(0.6, [[0, 0, 0, 1.1], [0.6, -0.05, 0.2, 0.75], [-0.55, 0, 0.25, 0.75], [0.05, 0, -0.6, 0.75], [0, 0.4, 0, 0.7]], 1, 0.18, 7.7),
  pine: (r: number, h: number, seed: number) => pineLayer(r, h, seed),
  /** Bush (classic: icosahedron r 0.42). */
  bush: () => cluster(0.3, [[0, 0, 0, 1.1], [0.55, -0.15, 0.2, 0.75], [-0.5, -0.15, 0.2, 0.72], [0.05, -0.1, -0.5, 0.75]], 1, 0.15, 2.2),
  /** Boulder (classic: dodecahedron r 0.42). */
  rock: () => join([blob(0.42, 1, 0.22, 5.3)], 1.2),
  /** Stalagmite: a lumpy, slightly bent spike (classic: cone r 0.3, h 1.4, base at 0). */
  stalagmite: () => {
    let g: THREE.BufferGeometry = new THREE.ConeGeometry(0.3, 1.4, 10, 5, false);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = (y + 0.7) / 1.4;
      const k = 1 + wob(x * 3, y * 2, z * 3, 9.1) * 0.22;
      p.setXYZ(i, x * k + t * t * 0.08, y + 0.7, z * k);
    }
    g.computeVertexNormals();
    topUv(g, 1.5);
    return g;
  },
};

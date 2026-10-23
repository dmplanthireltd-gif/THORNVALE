import * as THREE from 'three';
import { PAINTED } from '../style';

/**
 * Tiny helpers for building procedural low-poly models.
 * All materials are cel-shaded (three light bands) to read like hand-shaded
 * pixel sprites once the pixel pass draws them at 32 px per tile.
 */
export type Mat = THREE.MeshToonMaterial;

let gradient: THREE.DataTexture | null = null;
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  if (PAINTED) {
    // painted style (style.ts): a soft, smooth light ramp instead of three hard bands
    const ramp = [78, 96, 120, 146, 172, 198, 222, 240, 252, 255];
    const d = new Uint8Array(ramp.length * 4);
    ramp.forEach((v, i) => d.set([v, v, v, 255], i * 4));
    gradient = new THREE.DataTexture(d, ramp.length, 1, THREE.RGBAFormat);
    gradient.minFilter = THREE.LinearFilter;
    gradient.magFilter = THREE.LinearFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
    return gradient;
  }
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

// ------------------------------------------------------------------ shared pieces for worn gear
// Equipment is rebuilt whenever someone changes gear, so its geometries are
// cached by size and shared by every character (never mutate them).
const geoCache = new Map<string, THREE.BufferGeometry>();
function sharedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function sbox(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = mesh(sharedGeo(`b${r3(w)},${r3(h)},${r3(d)}`, () => new THREE.BoxGeometry(r3(w), r3(h), r3(d))), m);
  me.position.set(x, y, z);
  return me;
}

export function ssphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 1): THREE.Mesh {
  const me = mesh(sharedGeo(`s${r3(r)},${detail}`, () => new THREE.IcosahedronGeometry(r3(r), detail)), m);
  me.position.set(x, y, z);
  me.scale.set(sx, sy, sz);
  return me;
}

export function scyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const me = mesh(sharedGeo(`c${r3(rt)},${r3(rb)},${r3(h)},${seg}`, () => new THREE.CylinderGeometry(r3(rt), r3(rb), r3(h), seg)), m);
  me.position.set(x, y, z);
  return me;
}

export function scone(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 6): THREE.Mesh {
  const me = mesh(sharedGeo(`k${r3(r)},${r3(h)},${seg}`, () => new THREE.ConeGeometry(r3(r), r3(h), seg)), m);
  me.position.set(x, y, z);
  return me;
}

export function storus(r: number, tube: number, m: THREE.Material, arc = Math.PI * 2, rseg = 4, tseg = 12): THREE.Mesh {
  return mesh(sharedGeo(`t${r3(r)},${r3(tube)},${r3(arc)},${rseg},${tseg}`, () => new THREE.TorusGeometry(r3(r), r3(tube), rseg, tseg, arc)), m);
}

/** Materials for one character's gear: one per colour, shared by its pieces. */
export type MatFn = (color: number, emissive?: number) => Mat;
export function matCache(): MatFn {
  const m = new Map<string, Mat>();
  return (color, emissive = 0) => {
    const k = `${color}:${emissive}`;
    let x = m.get(k);
    if (!x) {
      x = mat(color, { emissive });
      m.set(k, x);
    }
    return x;
  };
}

/**
 * A rounded, tapered body piece: a low-poly cylinder with a flat face to the front,
 * `wTop`/`wBot` wide (flat to flat) at its top and bottom, `d` deep. Torsos, limbs,
 * boots and the armour over them use it so silhouettes taper instead of reading as blocks.
 */
export function sshell(wTop: number, wBot: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const k = 1 / (2 * Math.cos(Math.PI / seg));
  const rT = r3(wTop * k), rB = r3(wBot * k), hh = r3(h);
  const me = mesh(sharedGeo(`h${rT},${rB},${hh},${seg}`, () => new THREE.CylinderGeometry(rT, rB, hh, seg).rotateY(Math.PI / seg)), m);
  me.position.set(x, y, z);
  me.scale.z = d / ((wTop + wBot) / 2);
  return me;
}

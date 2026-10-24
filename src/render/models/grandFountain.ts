import * as THREE from 'three';
import type { GrandFountain } from '../../game/world/spawnPlaza';
import { Mesher, type V3 } from './darkRigsCore';
import { PAINTED } from '../style';

/**
 * Grand Thornvale's great fountain and the Gilded Exchange on its island
 * (layout: game/world/grandCity.ts). Everything static goes into the plaza's one
 * merged mesh (`S`); the water, jets and spray share the plaza's water materials and
 * particles; the Exchange's dome is a separate mesher so it can fade like a roof while
 * you are inside.
 *
 * Coordinates: the caller pushes the fountain centre, so (0, 0, 0) is the middle of
 * the basin; angle a runs in the ground plane, x = r·cos a, z = r·sin a (east = 0,
 * south = π/2, west = π, north = −π/2).
 */
export interface GrandOut {
  /** Adds a water surface (shares the plaza's water material). */
  water(geo: THREE.BufferGeometry, x: number, y: number, z: number): void;
  /** Falling water / arcing jets (share the plaza's streak material). */
  fall: THREE.BufferGeometry[];
  /** Spray emitters (world coordinates). */
  emitters: Array<{ p: V3; v: V3; jitter: number; rate: number }>;
}

const MAR = 0xe2dccd, MAR_LT = 0xf0ebe0, MAR_DK = 0xb9b1a2, GOLD = 0xd8b04a, GREEN = 0x2f4a3e, BRONZE = 0x5f8a78, CRIMSON = 0x8a2420;
const AXES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/** A curved band of a round wall between two angles: outer and inner faces, top, ends. */
function arcBand(rIn: number, rOut: number, y0: number, y1: number, a0: number, a1: number, seg: number, faces = { inner: true, top: true, ends: true }): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  const quad = (p: V3[], n: V3 | V3[]) => {
    const ns = Array.isArray(n[0]) ? (n as V3[]) : [n as V3, n as V3, n as V3, n as V3];
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...p[k]); nor.push(...ns[k]); }
  };
  const P = (r: number, a: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];
  for (let i = 0; i < seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg, b = a0 + ((a1 - a0) * (i + 1)) / seg;
    const na: V3 = [Math.cos(a), 0, Math.sin(a)], nb: V3 = [Math.cos(b), 0, Math.sin(b)];
    quad([P(rOut, a, y0), P(rOut, a, y1), P(rOut, b, y1), P(rOut, b, y0)], [na, na, nb, nb]);
    if (faces.inner) quad([P(rIn, b, y0), P(rIn, b, y1), P(rIn, a, y1), P(rIn, a, y0)], [[-nb[0], 0, -nb[2]], [-nb[0], 0, -nb[2]], [-na[0], 0, -na[2]], [-na[0], 0, -na[2]]]);
    if (faces.top) quad([P(rIn, a, y1), P(rIn, b, y1), P(rOut, b, y1), P(rOut, a, y1)], [0, 1, 0]);
  }
  if (faces.ends) {
    const ta: V3 = [Math.sin(a0), 0, -Math.cos(a0)], tb: V3 = [-Math.sin(a1), 0, Math.cos(a1)];
    quad([P(rIn, a0, y0), P(rIn, a0, y1), P(rOut, a0, y1), P(rOut, a0, y0)], ta);
    quad([P(rOut, a1, y0), P(rOut, a1, y1), P(rIn, a1, y1), P(rIn, a1, y0)], tb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** The arcs of a ring left between the four axis openings of half-width `half` (tiles) at radius r. */
function arcsBetween(r: number, half: number): Array<[number, number]> {
  const d = Math.asin(Math.min(0.99, half / r));
  return AXES.map((a) => [a + d, a + Math.PI / 2 - d] as [number, number]);
}

/** Faces local +z towards the centre for a thing standing at angle a. */
const faceCentre = (a: number) => Math.atan2(-Math.cos(a), -Math.sin(a));

export function addGrandFountain(S: Mesher, g: GrandFountain, cx: number, cz: number, out: GrandOut): void {
  const R = g.r;
  const half = g.bridge + 0.05;
  // ------------------------------------------------ the basin's parapet, broken by the four bridges
  for (const [a0, a1] of arcsBetween(R, half)) {
    const seg = Math.max(8, Math.round((a1 - a0) * 40));
    S.add(arcBand(R - 0.48, R + 0.22, 0, 0.12, a0, a1, seg), GREEN, [0, 0, 0], { grit: 0.06 });
    S.add(arcBand(R - 0.4, R + 0.12, 0.12, 0.5, a0, a1, seg), MAR, [0, 0, 0], { grit: 0.08 });
    S.add(arcBand(R - 0.46, R + 0.18, 0.5, 0.58, a0, a1, seg), MAR_LT, [0, 0, 0], { grit: 0.05 });
    S.add(arcBand(R + 0.17, R + 0.19, 0.42, 0.45, a0, a1, seg, { inner: false, top: false, ends: false }), GOLD, [0, 0, 0], { flat: true });
    // posts with gilded finials along the parapet
    const n = Math.max(2, Math.round(((a1 - a0) * R) / 2.6));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const px = Math.cos(a) * (R - 0.14), pz = Math.sin(a) * (R - 0.14);
      const big = i === 0 || i === n;
      S.box(big ? 0.62 : 0.38, big ? 0.95 : 0.72, big ? 0.62 : 0.38, big ? MAR_DK : MAR, [px, big ? 0.47 : 0.36, pz], { r: [0, -a, 0] });
      S.sph(big ? 0.16 : 0.09, GOLD, [px, big ? 1.04 : 0.78, pz], { flat: true }, 0);
      if (big) {
        // a lantern on every pier at a bridge head
        S.cyl(0.035, 0.05, 0.62, 0x2d2d33, [px, 1.3, pz], {}, 6);
        S.box(0.2, 0.24, 0.2, 0xffd27a, [px, 1.68, pz], { glow: true });
        S.cone(0.17, 0.14, 0x2d2d33, [px, 1.87, pz], { r: [0, Math.PI / 4, 0] }, 4);
      }
    }
  }
  // the basin floor's coping where the water meets the wall (a darker band under the water's edge)
  out.water(new THREE.RingGeometry(g.island + 0.1, R - 0.42, 160, 1).rotateX(-Math.PI / 2), cx, 0.034, cz);

  // ------------------------------------------------ the island's kerb
  for (const [a0, a1] of arcsBetween(g.island, half)) {
    const seg = Math.max(6, Math.round((a1 - a0) * 24));
    S.add(arcBand(g.island - 0.18, g.island + 0.16, 0, 0.16, a0, a1, seg), MAR_DK, [0, 0, 0], { grit: 0.07 });
    S.add(arcBand(g.island + 0.14, g.island + 0.16, 0.08, 0.11, a0, a1, seg, { inner: false, top: false, ends: false }), GOLD, [0, 0, 0], { flat: true });
  }

  // ------------------------------------------------ the four bridges
  const len = R - g.island + 0.3;
  const mid = (R + g.island) / 2;
  for (const a of AXES) {
    S.push([Math.cos(a) * mid, 0, Math.sin(a) * mid], [0, -a, 0]);
    const w = g.bridge * 2 + 0.1;
    S.box(len, 0.05, w, 0xd8d0c0, [0, 0.028, 0], { grit: 0.05 });
    // crimson runner down the middle
    S.box(len - 0.4, 0.008, 1.3, CRIMSON, [0, 0.057, 0], { grit: 0.04 });
    for (const s of [-1, 1]) S.box(len - 0.4, 0.006, 0.06, GOLD, [0, 0.058, s * 0.68], { flat: true });
    for (const s of [-1, 1]) {
      const z = s * (w / 2 - 0.1);
      S.box(len, 0.16, 0.22, MAR_DK, [0, 0.08, z]);
      const nb = Math.round(len / 0.55);
      for (let i = 1; i < nb; i++) {
        const x = -len / 2 + (len * i) / nb;
        S.cyl(0.035, 0.05, 0.3, MAR, [x, 0.31, z], {}, 6);
        S.sph(0.05, MAR, [x, 0.25, z], {}, 0);
      }
      S.box(len, 0.07, 0.2, MAR_LT, [0, 0.5, z]);
      // the cutwater pier half way, standing out into the water, with a bronze lamp
      S.cyl(0.55, 0.62, 0.62, MAR_DK, [0, 0.31, z + s * 0.42], {}, 12);
      S.cyl(0.6, 0.6, 0.08, MAR_LT, [0, 0.64, z + s * 0.42], {}, 12);
      S.cyl(0.06, 0.08, 0.7, BRONZE, [0, 1.02, z + s * 0.42], {}, 6);
      S.sph(0.17, 0xffd27a, [0, 1.42, z + s * 0.42], { glow: true }, 1);
      S.cone(0.2, 0.18, BRONZE, [0, 1.62, z + s * 0.42], {}, 8);
    }
    // small piers at the island end
    for (const s of [-1, 1]) {
      S.box(0.4, 0.7, 0.4, MAR_DK, [-len / 2 + 0.2, 0.35, s * (w / 2 - 0.1)]);
      S.sph(0.11, GOLD, [-len / 2 + 0.2, 0.78, s * (w / 2 - 0.1)], { flat: true }, 0);
    }
    S.pop();
  }

  // ------------------------------------------------ statues in the water: water-bearers and leaping carp
  for (let k = 0; k < 8; k++) {
    const a = ((22.5 + 45 * k) * Math.PI) / 180;
    const r = 14.6;
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    S.push([px, 0, pz], [0, faceCentre(a), 0]);
    S.add(new THREE.CylinderGeometry(0.95, 1.05, 0.5, 8), MAR_DK, [0, 0.25, 0], { r: [0, Math.PI / 8, 0] });
    S.add(new THREE.CylinderGeometry(0.75, 0.82, 0.45, 8), MAR, [0, 0.72, 0], { r: [0, Math.PI / 8, 0] });
    S.add(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 8), MAR_LT, [0, 0.97, 0], { r: [0, Math.PI / 8, 0] });
    S.ring(0.8, 0.035, GOLD, [0, 0.98, 0], { flat: true }, Math.PI * 2, 8);
    if (k % 2 === 0) {
      // a kneeling water-bearer tipping an urn towards the island
      S.cone(0.42, 0.9, MAR_LT, [0, 1.42, 0], {}, 10);
      S.cyl(0.15, 0.2, 0.36, MAR_LT, [0, 1.98, 0.02], {}, 8);
      S.sph(0.15, MAR_LT, [0, 2.26, 0.04], {}, 1);
      S.cone(0.2, 0.32, 0xe4dfd2, [0, 2.32, 0.0], {}, 8);
      S.seg([-0.18, 1.98, 0.05], [-0.1, 1.9, 0.42], 0.06, 0.05, MAR_LT);
      S.seg([0.18, 1.98, 0.05], [0.1, 1.9, 0.42], 0.06, 0.05, MAR_LT);
      S.push([0, 1.92, 0.52], [0.9, 0, 0]);
      S.sph(0.2, BRONZE, [0, 0, 0], { s: [1, 1.2, 1] }, 1);
      S.cyl(0.07, 0.11, 0.18, BRONZE, [0, 0.26, 0], {}, 8);
      S.pop();
    } else {
      // a leaping carp, mouth to the sky
      S.curve([[0, 1.05, -0.35], [0, 1.45, -0.1], [0, 1.95, 0.12], [0, 2.4, 0.1]], [0.12, 0.3, 0.26, 0.14], BRONZE, {}, 10);
      S.poly([[0, 0], [0.32, -0.36], [-0.32, -0.36]], 0x4f7a68, [0, 1.02, -0.4], { r: [0.35, 0, 0] });
      for (const s of [-1, 1]) S.poly([[0, 0], [0.3, 0.12], [0.18, -0.16]], 0x4f7a68, [s * 0.26, 1.75, 0.08], { r: [0, s * 1.2, 0] });
      S.sph(0.05, GOLD, [0.13, 2.3, 0.2], { flat: true }, 0);
      S.sph(0.05, GOLD, [-0.13, 2.3, 0.2], { flat: true }, 0);
    }
    S.pop();
    // the water: from the urn in an arc towards the island; from the carp's mouth up and inwards
    const ix = Math.cos(a), iz = Math.sin(a);
    if (k % 2 === 0) {
      const from: V3 = [cx + px - ix * 0.75, 1.95, cz + pz - iz * 0.75];
      const to: V3 = [cx + ix * (g.island + 1.7), 0.05, cz + iz * (g.island + 1.7)];
      jet(out, from, to, 0.6, 0.07);
    } else {
      const from: V3 = [cx + px - ix * 0.12, 2.45, cz + pz - iz * 0.12];
      const to: V3 = [cx + ix * (r - 3.4), 0.05, cz + iz * (r - 3.4)];
      jet(out, from, to, 1.6, 0.06);
    }
  }
  // a ring of small jets along the parapet, arcing into the basin
  for (let k = 0; k < 32; k++) {
    const a = ((k + 0.5) / 32) * Math.PI * 2;
    if (AXES.some((x) => Math.abs(Math.atan2(Math.sin(a - x), Math.cos(a - x))) < 0.2)) continue;
    const ix = Math.cos(a), iz = Math.sin(a);
    S.cyl(0.05, 0.08, 0.12, BRONZE, [ix * (R - 0.45), 0.4, iz * (R - 0.45)], { flat: true }, 6);
    jet(out, [cx + ix * (R - 0.5), 0.42, cz + iz * (R - 0.5)], [cx + ix * (R - 2.6), 0.05, cz + iz * (R - 2.6)], 0.55, 0.035, k % 3 === 0);
  }
}

/** An arcing jet of water from a to b, peaking `lift` above the higher end; a splash where it lands. */
function jet(out: GrandOut, a: V3, b: V3, lift: number, radius: number, splash = true): void {
  const mid = new THREE.Vector3((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + lift, (a[2] + b[2]) / 2);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a), mid, new THREE.Vector3(...b));
  out.fall.push(new THREE.TubeGeometry(curve, 12, radius, 5));
  if (splash) out.emitters.push({ p: [b[0], 0.08, b[2]], v: [0, 0.9, 0], jitter: 0.6, rate: 1 });
}

/**
 * The Gilded Exchange: the round hall's wall with its four doorways (static, into `S`),
 * the centrepiece (golden scales), and — into `D` — the dome that fades while you are
 * inside (the drum's upper storey, the verdigris dome with gilded ribs, the lantern).
 */
export function addExchange(S: Mesher, D: Mesher, g: GrandFountain): void {
  const rO = g.wallOut - 0.12, rI = g.wallIn + 0.12;
  const H = 1.95;
  const doorHalf = 1.02;
  // plinth ring
  for (const [a0, a1] of arcsBetween(g.wallOut + 0.1, doorHalf)) S.add(arcBand(rI - 0.05, rO + 0.22, 0, 0.14, a0, a1, 20), MAR_DK, [0, 0, 0], { grit: 0.06 });
  // the drum: outer marble face, inner plaster with a crimson wainscot, a gold band
  for (const [a0, a1] of arcsBetween((rO + rI) / 2, doorHalf)) {
    const seg = Math.max(8, Math.round((a1 - a0) * 22));
    S.add(arcBand(rI, rO, 0.14, H, a0, a1, seg, { inner: false, top: true, ends: true }), 0xe6dfcc, [0, 0, 0], { grit: 0.07 });
    S.add(arcBand(rI, rI + 0.02, 0.14, H, a0, a1, seg, { inner: true, top: false, ends: false }), 0xd8cdb4, [0, 0, 0], { grit: 0.05 });
    S.add(arcBand(rI - 0.03, rI - 0.01, 0.14, 0.75, a0, a1, seg, { inner: true, top: false, ends: false }), CRIMSON, [0, 0, 0], { grit: 0.05 });
    S.add(arcBand(rO + 0.01, rO + 0.04, 1.18, 1.26, a0, a1, seg, { inner: false, top: false, ends: false }), GOLD, [0, 0, 0], { flat: true });
    // pilasters with gold capitals on the outer face
    const n = Math.max(2, Math.round(((a1 - a0) * rO) / 1.7));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      S.push([Math.cos(a) * (rO + 0.08), 0, Math.sin(a) * (rO + 0.08)], [0, -a, 0]);
      S.box(0.2, H - 0.2, 0.34, MAR_LT, [0, 0.14 + (H - 0.2) / 2, 0]);
      S.box(0.26, 0.12, 0.42, GOLD, [0, H - 0.04, 0], { flat: true });
      S.box(0.28, 0.1, 0.44, MAR_DK, [0, 0.2, 0]);
      S.pop();
    }
  }
  // the doorways: a lintel over each opening (so they read as doors) and a gilded arch on the outside
  for (const a of AXES) {
    const d = Math.asin(doorHalf / ((rO + rI) / 2));
    S.add(arcBand(rI, rO, 1.62, H, a - d, a + d, 6), 0xe6dfcc, [0, 0, 0], { grit: 0.07 });
    S.push([Math.cos(a) * (rO + 0.1), 0, Math.sin(a) * (rO + 0.1)], [0, -a, 0]);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t0 = Math.PI * (i / n), t1 = Math.PI * ((i + 1) / n);
      S.seg([0, 1.3 + Math.sin(t0) * 0.5, Math.cos(t0) * 1.08], [0, 1.3 + Math.sin(t1) * 0.5, Math.cos(t1) * 1.08], 0.06, 0.06, GOLD, { flat: true }, 5);
    }
    for (const s of [-1, 1]) S.box(0.18, 1.3, 0.18, MAR_LT, [0, 0.79, s * 1.1]);
    // a gilded coin plaque over the door
    S.cyl(0.2, 0.2, 0.05, GOLD, [0.03, 1.78, 0], { r: [0, 0, Math.PI / 2], flat: true }, 12);
    S.pop();
    // a low step through the doorway
    S.add(arcBand(rI - 0.1, rO + 0.3, 0, 0.05, a - d, a + d, 4), MAR_LT, [0, 0, 0], { grit: 0.04 });
  }
  // the centrepiece: a stepped plinth, a column and the great golden scales
  S.add(new THREE.CylinderGeometry(1.0, 1.05, 0.22, 16), MAR_DK, [0, 0.11, 0]);
  S.add(new THREE.CylinderGeometry(0.8, 0.85, 0.3, 16), MAR, [0, 0.37, 0]);
  S.add(new THREE.CylinderGeometry(0.84, 0.84, 0.04, 16), GOLD, [0, 0.53, 0], { flat: true });
  S.cyl(0.14, 0.2, 1.4, MAR_LT, [0, 1.25, 0], {}, 10);
  S.cyl(0.22, 0.16, 0.12, GOLD, [0, 1.98, 0], { flat: true }, 10);
  S.box(1.9, 0.07, 0.08, GOLD, [0, 2.12, 0], { flat: true });
  S.box(0.24, 0.24, 0.24, GOLD, [0, 2.38, 0], { r: [0, Math.PI / 4, Math.PI / 4], flat: true });
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) S.seg([s * 0.9, 2.1, 0], [s * 0.9 + t * 0.2, 1.62, 0], 0.012, 0.012, 0xb08a38, { flat: true }, 4);
    S.add(new THREE.CylinderGeometry(0.3, 0.16, 0.08, 14, 1, true), GOLD, [s * 0.9, 1.6, 0], { two: true, flat: true });
    S.add(new THREE.CircleGeometry(0.16, 14).rotateX(-Math.PI / 2), 0xb08a38, [s * 0.9, 1.565, 0], { flat: true });
  }
  // a coin stack in each pan
  for (let i = 0; i < 4; i++) S.cyl(0.09, 0.09, 0.03, 0xe8c26a, [-0.9 + (i % 2) * 0.02, 1.6 + i * 0.03, 0.01], { flat: true }, 8);

  // ------------------------------------------------ the dome (fades while you are inside)
  // the drum's upper storey with round windows, a gilded cornice
  const top = H;
  D.add(arcBand(rI, rO + 0.06, top, top + 0.85, 0, Math.PI * 2, 64, { inner: true, top: false, ends: false }), 0xe6dfcc, [0, 0, 0], { grit: 0.07 });
  D.add(arcBand(rO + 0.05, rO + 0.3, top + 0.85, top + 1.0, 0, Math.PI * 2, 64, { inner: false, top: true, ends: false }), GOLD, [0, 0, 0], { flat: true });
  for (let i = 0; i < 16; i++) {
    const a = ((i + 0.5) / 16) * Math.PI * 2;
    D.push([Math.cos(a) * (rO + 0.07), 0, Math.sin(a) * (rO + 0.07)], [0, -a + Math.PI / 2, 0]);
    D.cyl(0.2, 0.2, 0.03, 0x24303a, [0, top + 0.45, 0], { r: [Math.PI / 2, 0, 0], flat: true }, 10);
    D.ring(0.21, 0.03, GOLD, [0, top + 0.45, 0.01], { r: [Math.PI / 2, 0, 0], flat: true }, Math.PI * 2, 10);
    D.pop();
  }
  // the verdigris dome with sixteen gilded ribs
  const dr = rO + 0.15, dh = 0.62;
  const dome = new THREE.SphereGeometry(dr, PAINTED ? 48 : 32, PAINTED ? 14 : 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, dh, 1);
  D.add(dome, 0x4f8a7a, [0, top + 1.0, 0], { grit: 0.06 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const pts: V3[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = (k / 6) * (Math.PI / 2) * 0.9;
      const rr = Math.cos(t) * (dr + 0.04), y = Math.sin(t) * dr * dh + 0.04;
      pts.push([Math.cos(a) * rr, top + 1.0 + y, Math.sin(a) * rr]);
    }
    for (let k = 0; k < pts.length - 1; k++) D.seg(pts[k], pts[k + 1], 0.07, 0.07, GOLD, { flat: true }, 5);
  }
  // the lantern on top: a ring of little columns, a gilded cupola, a finial with the diamond crest
  const ly = top + 1.0 + dr * dh - 0.08;
  D.cyl(1.25, 1.35, 0.14, MAR_LT, [0, ly, 0], {}, 14);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    D.cyl(0.07, 0.07, 0.75, MAR_LT, [Math.cos(a) * 1.05, ly + 0.45, Math.sin(a) * 1.05], {}, 6);
  }
  D.cyl(0.95, 0.95, 0.7, 0xffd27a, [0, ly + 0.45, 0], { glow: true }, 12);
  D.cyl(1.25, 1.2, 0.12, GOLD, [0, ly + 0.86, 0], { flat: true }, 14);
  D.add(new THREE.SphereGeometry(1.05, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1), GOLD, [0, ly + 0.9, 0], { flat: true });
  D.cyl(0.06, 0.1, 0.7, GOLD, [0, ly + 2.0, 0], { flat: true }, 6);
  D.box(0.36, 0.36, 0.08, GOLD, [0, ly + 2.55, 0], { r: [0, 0, Math.PI / 4], flat: true });
  D.box(0.38, 0.38, 0.06, 0x2b2621, [0, ly + 2.55, 0.0], { r: [0, Math.PI / 2, Math.PI / 4], flat: true });
}

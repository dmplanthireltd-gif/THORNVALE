import * as THREE from 'three';
import { mat, sbox, scone, scyl, ssphere, type Mat } from './parts';

/**
 * The newer beards and the battle scars of the character designer (owner 2026-10-23: the
 * grim look for older players). Coordinates are in the player head's own space (face
 * radius 0.2, front +z, mouth at y −0.11); see playerModel.ts.
 *
 * Beard parts are tagged `cover: 'beard'` (hidden under closed helmets, humanoid.ts
 * applyGear); scars are tagged `face` (always shown). Both work in the classic and the
 * painted style.
 */

const beardTag = <T extends THREE.Object3D>(o: T): T => { o.userData.cover = 'beard'; return o; };
const faceTag = <T extends THREE.Object3D>(o: T): T => { o.userData.face = true; return o; };
const rot = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.rotation.set(x, y, z); return o; };
const blend = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

function moustache(add: (o: THREE.Object3D) => void, m: Mat, droop = 1): void {
  add(sbox(0.16, 0.035, 0.04, m, 0, -0.065, 0.195));
  for (const s of [-1, 1]) add(sbox(0.03, 0.06 * droop, 0.035, m, s * 0.08, -0.065 - 0.025 * droop, 0.185));
}

/** Chin and jaw mass shared by the fuller beards. */
function chin(add: (o: THREE.Object3D) => void, m: Mat, h = 0.15): void {
  add(sbox(0.31, h, 0.13, m, 0, -0.14 - (h - 0.15) / 2, 0.11));
  for (const s of [-1, 1]) add(sbox(0.05, 0.14, 0.1, m, s * 0.175, -0.05, 0.08)); // sideburns
}

/**
 * Builds one of the newer beards on a player head (ids from game/player/appearance.ts BEARDS).
 * Returns false for ids it does not know (the older ones are built in playerModel.ts).
 */
export function addMoreBeard(head: THREE.Group, style: string, m: Mat): boolean {
  const add = (o: THREE.Object3D) => head.add(beardTag(o));
  const dark = mat(new THREE.Color(m.color).multiplyScalar(0.72).getHex());
  switch (style) {
    case 'chinstrap':
      // a narrow strap of beard along the jaw, sideburn to sideburn, bare upper lip
      for (const s of [-1, 1]) {
        add(sbox(0.045, 0.16, 0.1, m, s * 0.18, -0.06, 0.07));
        add(rot(sbox(0.04, 0.13, 0.08, m, s * 0.13, -0.17, 0.12), 0.2, s * 0.5, s * 0.75));
      }
      add(sbox(0.15, 0.05, 0.08, m, 0, -0.215, 0.14));
      return true;
    case 'mutton':
      // heavy chops from the ears to the jaw corners, joined by the moustache; shaved chin
      moustache(add, m, 1.3);
      for (const s of [-1, 1]) {
        add(sbox(0.075, 0.2, 0.14, m, s * 0.175, -0.08, 0.08));
        add(ssphere(0.075, m, s * 0.13, -0.16, 0.12, 0.9, 1, 0.85));
      }
      return true;
    case 'handlebar':
      // a thick moustache with the ends waxed and curled up, and a small tuft under the lip
      add(sbox(0.17, 0.04, 0.045, m, 0, -0.068, 0.197));
      for (const s of [-1, 1]) {
        add(rot(scone(0.018, 0.07, m, s * 0.115, -0.07, 0.185, 5), 0, 0, -s * Math.PI / 2)); // out to the side
        add(rot(scone(0.014, 0.09, m, s * 0.155, -0.03, 0.178, 5), 0, 0, -s * 0.2)); // and curled up
      }
      add(sbox(0.035, 0.05, 0.03, m, 0, -0.15, 0.175));
      return true;
    case 'forked':
      // a full beard split into two long points
      moustache(add, m);
      chin(add, m);
      for (const s of [-1, 1]) add(rot(scone(0.07, 0.24, m, s * 0.065, -0.32, 0.13, 6), Math.PI - 0.12, 0, s * 0.18));
      return true;
    case 'braided': {
      // a full beard worked into two braids, each bound with iron rings
      moustache(add, m);
      chin(add, m);
      const ring = mat(0x7a756c);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) add(ssphere(0.042 - i * 0.004, i % 2 ? dark : m, s * 0.06, -0.24 - i * 0.065, 0.14 - i * 0.008));
        add(scyl(0.03, 0.03, 0.03, ring, s * 0.06, -0.28, 0.137, 8));
        add(scyl(0.026, 0.026, 0.03, ring, s * 0.06, -0.41, 0.13, 8));
        add(rot(scone(0.024, 0.07, m, s * 0.06, -0.49, 0.12, 5), Math.PI, 0, 0));
      }
      return true;
    }
    case 'long':
      // a long, heavy beard falling to the chest
      moustache(add, m, 1.2);
      chin(add, m, 0.2);
      add(rot(scone(0.15, 0.46, m, 0, -0.43, 0.13, 7), Math.PI - 0.1, 0, 0));
      add(sbox(0.2, 0.18, 0.1, m, 0, -0.3, 0.14));
      add(sbox(0.06, 0.24, 0.02, dark, 0, -0.36, 0.195)); // a darker parting down the middle
      return true;
    case 'wild': {
      // an unkempt, matted bush of a beard with stray tufts
      moustache(add, m, 1.2);
      chin(add, m, 0.19);
      const lumps: Array<[number, number, number, number]> = [
        [0, -0.27, 0.14, 0.11], [0.1, -0.24, 0.13, 0.085], [-0.11, -0.25, 0.12, 0.09], [0.17, -0.13, 0.08, 0.08], [-0.17, -0.14, 0.08, 0.08], [0.04, -0.34, 0.12, 0.07], [-0.06, -0.35, 0.11, 0.065],
      ];
      lumps.forEach(([x, y, z, r], i) => add(ssphere(r, i % 3 === 2 ? dark : m, x, y, z, 1, 1.1, 0.8)));
      const tufts: Array<[number, number, number]> = [[0.13, -0.3, 0.5], [-0.12, -0.31, -0.5], [0.02, -0.42, 0.1], [-0.2, -0.2, -1.0], [0.21, -0.19, 1.0]];
      for (const [x, y, a] of tufts) add(rot(scone(0.03, 0.12, m, x, y, 0.12, 4), Math.PI, 0, a * 0.5));
      return true;
    }
    default:
      return false;
  }
}

// ------------------------------------------------------------------ scars

/**
 * Height of the face's front surface (z) at a point of the head, for the player head of
 * playerModel.ts: the face sphere, the jaw and — in the painted style — the cheekbones,
 * brow ridge and nose bridge of grimFace.
 */
function faceZ(x: number, y: number, painted: boolean, female: boolean): number {
  const sx = female ? 0.94 : 1;
  const xs = x / sx;
  let z = Math.sqrt(Math.max(0, 0.04 - xs * xs - (y / 1.06) ** 2));
  const jx = x / (female ? 0.85 : 1), jy = (y + 0.1) / 0.75;
  z = Math.max(z, 0.06 + Math.sqrt(Math.max(0, 0.0144 - jx * jx - jy * jy)));
  if (painted) {
    for (const s of [-1, 1]) {
      const dx = (x - s * 0.11) / 0.054, dy = (y + 0.035) / 0.0315;
      const q = 1 - dx * dx - dy * dy;
      if (q > 0) z = Math.max(z, 0.145 + 0.036 * Math.sqrt(q));
    }
    if (!female && Math.abs(x) < 0.135 && y > 0.04 && y < 0.08) z = Math.max(z, 0.193);
  }
  return z;
}

interface ScarMats { core: Mat; edge: Mat; stitch: Mat }

/**
 * A healed cut from (x0, y0) to (x1, y1) on the face: a pale raised edge with a dark seam,
 * split into short pieces that follow the curve of the face. `stitches` adds crossing marks.
 */
function cut(head: THREE.Group, k: ScarMats, painted: boolean, female: boolean, x0: number, y0: number, x1: number, y1: number, w = 0.02, stitches = 0): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / 0.045));
  const ang = Math.atan2(y1 - y0, x1 - x0);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const ax = x0 + (x1 - x0) * t0, ay = y0 + (y1 - y0) * t0, bx = x0 + (x1 - x0) * t1, by = y0 + (y1 - y0) * t1;
    const za = faceZ(ax, ay, painted, female), zb = faceZ(bx, by, painted, female);
    const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = Math.max(za, zb, faceZ(mx, my, painted, female)) + 0.004;
    const seg = Math.hypot(bx - ax, by - ay, zb - za) + 0.006;
    const g = new THREE.Group();
    g.position.set(mx, my, mz);
    // lie on the surface: turn toward the face normal, then along the cut
    g.lookAt(mx * 2, my * 2, mz * 2);
    g.rotateZ(ang);
    g.add(faceTag(sbox(seg, w, 0.012, k.edge, 0, 0, 0)), faceTag(sbox(seg, w * 0.55, 0.012, k.core, 0, 0, 0.003)));
    g.updateMatrix();
    for (const c of [...g.children]) { c.applyMatrix4(g.matrix); head.add(c); }
  }
  for (let i = 0; i < stitches; i++) {
    const t = (i + 0.5) / stitches;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    const st = faceTag(sbox(0.008, w * 2.6, 0.01, k.stitch, x, y, faceZ(x, y, painted, female) + 0.01));
    st.rotation.set(0, Math.atan2(x, 0.2) * 0.8, ang + Math.PI / 2 + 0.3);
    head.add(st);
  }
}

/** Puts a battle scar on a player head (ids from game/player/appearance.ts SCARS). */
export function addScar(head: THREE.Group, id: string, skinHex: number, painted: boolean, female: boolean): void {
  if (!id || id === 'none') return;
  const k: ScarMats = {
    core: mat(blend(skinHex, 0x2a0604, 0.82)),
    edge: mat(blend(skinHex, 0x7a2a20, 0.42)),
    stitch: mat(0x1e140e),
  };
  const c = (x0: number, y0: number, x1: number, y1: number, w?: number, st?: number) => cut(head, k, painted, female, x0, y0, x1, y1, w, st);
  switch (id) {
    case 'brow': // through the left eyebrow, a notch in the brow
      c(0.045, 0.125, 0.105, 0.025, 0.021);
      break;
    case 'cheek': // a long slash across the right cheek, crudely stitched
      c(-0.07, 0.0, -0.165, -0.13, 0.02, 4);
      break;
    case 'eye': { // a cut from brow to cheek through the left eye, which is milky and blind
      c(0.055, 0.12, 0.09, -0.08, 0.021);
      const milky = faceTag(sbox(0.046, 0.046, 0.022, mat(0xc4c0b4), 0.07, 0.02, 0.186));
      head.add(milky);
      break;
    }
    case 'lip': // through the lips, off centre
      c(0.03, -0.075, 0.018, -0.175, 0.019);
      head.add(faceTag(sbox(0.018, 0.02, 0.01, k.core, 0.026, -0.11, Math.max(0.188, faceZ(0.026, -0.11, painted, female) + 0.01))));
      break;
    case 'jaw': // along the left jaw line
      c(0.17, -0.06, 0.06, -0.19, 0.021);
      break;
    case 'cross': // two crossed cuts on the right cheek
      c(-0.08, -0.02, -0.16, -0.12, 0.018);
      c(-0.16, -0.02, -0.08, -0.12, 0.018);
      break;
    case 'claw': // three parallel rakes across the left cheek
      for (let i = 0; i < 3; i++) c(0.06 + i * 0.03, 0.06 - i * 0.012, 0.12 + i * 0.03, -0.12 - i * 0.012, 0.017);
      break;
    case 'burn': { // a mottled burn over the right temple and cheek
      const sp: Array<[number, number, number, number]> = [[-0.13, 0.05, 0.05, 0.45], [-0.15, -0.03, 0.045, 0.3], [-0.11, -0.08, 0.035, 0.55], [-0.165, 0.09, 0.03, 0.2]];
      sp.forEach(([x, y, r, t], i) => {
        const z = faceZ(x, y, painted, female) - r * 0.12;
        const b = faceTag(ssphere(r, mat(blend(skinHex, i % 2 ? 0xd8a898 : 0x7a2a1c, t)), x, y, z, 1, 0.85, 0.28, 1));
        b.rotation.y = Math.atan2(x, z);
        head.add(b);
      });
      break;
    }
    case 'nose': { // a broken, crooked nose with a cut across the bridge
      const bump = faceTag(sbox(0.034, 0.03, 0.03, mat(blend(skinHex, 0x6a3020, 0.18)), 0.008, 0.005, 0.213));
      bump.rotation.z = 0.35;
      head.add(bump);
      head.add(faceTag(sbox(0.05, 0.012, 0.012, k.edge, 0, 0.012, painted ? 0.222 : 0.218)), faceTag(sbox(0.05, 0.005, 0.012, k.core, 0, 0.012, painted ? 0.225 : 0.221)));
      break;
    }
    default:
  }
}

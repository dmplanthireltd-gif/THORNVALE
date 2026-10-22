import * as THREE from 'three';
import type { ActivityKind } from '../../game/gathering/activity';
import { ITEMS } from '../../game/inventory/items';
import { MAT, rampOf, type Ramp } from './gearLooks';
import { group, sbox, scone, scyl, ssphere, type MatFn } from './parts';
import { makeWeapon } from './weapons';

/**
 * Tools a character holds while working a trade skill (skillAnim.ts swaps them
 * in for the weapon and shield and back). Like weapons, every tool grows along
 * +Z from the grip at the origin, and its striking side faces −Y, so a swing
 * that rotates the arm down drives the point/face into the work.
 * Geometries come from the shared cache in parts.ts; materials from the
 * character's own MatFn (hit flashes stay per creature).
 */
export interface HeldTools {
  right: THREE.Group | null;
  left: THREE.Group | null;
  /** Rod tip (fishing): where the line starts. */
  tip: THREE.Object3D | null;
  /** Point the work happens at (pick spike, hammer face, blade), for particles. */
  head: THREE.Object3D | null;
}

const X = (o: THREE.Mesh) => {
  o.rotation.x = Math.PI / 2;
  return o;
};

function rot<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.rotation.set(x, y, z);
  return o;
}

/** Metal ramp of a tiered tool from its id (bronze_pickaxe → bronze), else from its tint. */
function metalOf(id: string | null): Ramp {
  const m = id?.match(/^(bronze|iron|steel|starsteel|darkstone|silver|gold)_/);
  if (m) return MAT[m[1] as keyof typeof MAT] as Ramp;
  const tint = id ? ITEMS[id]?.tint : undefined;
  return tint ? rampOf(parseInt(tint.slice(1), 16)) : MAT.iron as Ramp;
}

function marker(z: number, y = 0): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set(0, y, z);
  return o;
}

function pickaxe(id: string | null, M: MatFn): { g: THREE.Group; head: THREE.Object3D } {
  const r = metalOf(id);
  const glow = id === 'starsteel_pickaxe' ? 0x0a1a40 : 0;
  const metal = M(r[1], glow);
  const edge = M(r[0], glow);
  const hz = 0.66;
  const g = group(0, 0, 0,
    X(scyl(0.03, 0.034, 0.86, M(MAT.wood[1]), 0, 0, 0.3, 6)),
    X(scyl(0.038, 0.038, 0.16, M(MAT.leather[2]), 0, 0, 0.0, 6)),
    sbox(0.08, 0.1, 0.1, M(r[2]), 0, 0, hz),
    // long spike down (the striking end), short blunt end up; both curve back towards the hand
    rot(scone(0.05, 0.36, metal, 0, -0.2, hz - 0.05, 4), Math.PI + 0.25, 0, 0),
    rot(scone(0.022, 0.1, edge, 0, -0.38, hz - 0.1, 4), Math.PI + 0.25, 0, 0),
    rot(scone(0.045, 0.2, metal, 0, 0.13, hz - 0.03, 4), -0.25, 0, 0),
  );
  const head = marker(hz - 0.1, -0.42);
  g.add(head);
  return { g, head };
}

function rod(M: MatFn): { g: THREE.Group; tip: THREE.Object3D } {
  const wood = M(0xa8804a);
  const g = group(0, 0, 0,
    X(scyl(0.03, 0.036, 0.26, M(0xc8a878), 0, 0, 0.02, 6)), // cork grip
    X(scyl(0.012, 0.024, 1.3, wood, 0, 0, 0.8, 5)),
    X(scyl(0.006, 0.012, 0.42, M(0x6a4a2a), 0, 0, 1.64, 4)),
    // reel under the grip
    rot(scyl(0.05, 0.05, 0.04, M(0x8a8f9a), 0, -0.06, 0.1, 8), 0, 0, Math.PI / 2),
    sbox(0.012, 0.05, 0.02, M(0x4a4e56), 0, -0.03, 0.1),
  );
  for (const z of [0.5, 0.9, 1.3]) g.add(sbox(0.012, 0.03, 0.012, M(0xd8dde6), 0, -0.025, z));
  const tip = marker(1.85);
  g.add(tip);
  return { g, tip };
}

function hammer(M: MatFn, s = 1): { g: THREE.Group; head: THREE.Object3D } {
  const iron = M(MAT.iron[1]);
  const hz = 0.36 * s;
  const g = group(0, 0, 0,
    X(scyl(0.026 * s, 0.03 * s, 0.5 * s, M(MAT.wood[1]), 0, 0, 0.12 * s, 6)),
    sbox(0.1 * s, 0.2 * s, 0.1 * s, iron, 0, -0.02 * s, hz),
    sbox(0.11 * s, 0.04 * s, 0.11 * s, M(MAT.iron[0]), 0, -0.12 * s, hz),
  );
  const head = marker(hz, -0.14 * s);
  g.add(head);
  return { g, head };
}

function tongs(M: MatFn, hot: boolean): THREE.Group {
  const iron = M(MAT.iron[2]);
  const g = group(0, 0, 0,
    rot(sbox(0.025, 0.025, 0.55, iron, 0.025, 0, 0.22), 0, -0.06, 0),
    rot(sbox(0.025, 0.025, 0.55, iron, -0.025, 0, 0.22), 0, 0.06, 0),
  );
  if (hot) g.add(sbox(0.06, 0.04, 0.14, M(0xff9040, 0xc04010), 0, 0, 0.52));
  return g;
}

function pan(M: MatFn): THREE.Group {
  const iron = M(0x3a3c42);
  return group(0, 0, 0,
    sbox(0.04, 0.03, 0.34, M(MAT.wood[2]), 0, 0, 0.1),
    scyl(0.17, 0.15, 0.05, iron, 0, 0.0, 0.42, 10),
    scyl(0.15, 0.15, 0.02, M(0x1e2024), 0, 0.022, 0.42, 10),
    // something sizzling in it
    sbox(0.12, 0.04, 0.08, M(0xb0583a), 0.02, 0.045, 0.42),
  );
}

function knife(M: MatFn): { g: THREE.Group; head: THREE.Object3D } {
  const g = group(0, 0, 0,
    X(scyl(0.025, 0.025, 0.12, M(MAT.wood[2]), 0, 0, 0.0, 6)),
    sbox(0.012, 0.05, 0.18, M(MAT.steel[1]), 0, -0.01, 0.15),
    X(scone(0.025, 0.06, M(MAT.steel[0]), 0, -0.01, 0.27, 4)),
  );
  const head = marker(0.2);
  g.add(head);
  return { g, head };
}

function needle(M: MatFn): { g: THREE.Group; head: THREE.Object3D } {
  const g = group(0, 0, 0,
    X(scyl(0.008, 0.008, 0.16, M(MAT.silver[1]), 0, 0, 0.05, 4)),
    sbox(0.006, 0.006, 0.22, M(0xe8dcc0), 0.01, 0.01, -0.1), // thread trailing back
  );
  const head = marker(0.13);
  g.add(head);
  return { g, head };
}

function workpiece(kind: ActivityKind, M: MatFn): THREE.Group {
  switch (kind) {
    case 'knife': // a log being carved into shafts
      return group(0, 0, 0, X(scyl(0.05, 0.05, 0.42, M(MAT.wood[1]), 0, 0, 0.12, 6)), X(scyl(0.035, 0.035, 0.425, M(0xd8b080), 0, 0, 0.12, 6)));
    case 'needle': // a leather piece
      return group(0, 0, 0, sbox(0.26, 0.025, 0.2, M(MAT.leather[1]), 0.06, 0, 0.1), sbox(0.2, 0.026, 0.008, M(0xe8dcc0), 0.06, 0, 0.08));
    case 'chisel': // the chisel and the gem
      return group(0, 0, 0, X(scyl(0.018, 0.022, 0.2, M(MAT.steel[1]), 0, 0, 0.12, 5)), ssphere(0.04, M(0x5ad0ff, 0x103050), 0, 0, 0.25));
    case 'tinderbox':
      return group(0, 0, 0, sbox(0.12, 0.07, 0.1, M(0xb0703a), 0, 0, 0.06), sbox(0.125, 0.02, 0.105, M(MAT.iron[1]), 0, 0.04, 0.06));
    case 'tanning':
      return group(0, 0, 0, X(scyl(0.03, 0.03, 0.14, M(MAT.wood[1]), 0, 0, 0, 6)));
    default:
      return group();
  }
}

/** Builds the tools for an activity; `toolId` is the item in hand (best axe or pickaxe, rod, hammer…). */
export function buildHeldTools(kind: ActivityKind, toolId: string | null, M: MatFn): HeldTools {
  const out: HeldTools = { right: null, left: null, tip: null, head: null };
  switch (kind) {
    case 'mine': {
      const p = pickaxe(toolId, M);
      // a touch larger than life so the pick reads from the top-down camera
      p.g.scale.setScalar(1.2);
      out.right = p.g;
      out.head = p.head;
      break;
    }
    case 'chop': {
      // the real axe model, so its tier and look are right; a hatchet if somehow none is known
      const axe = makeWeapon(toolId && ITEMS[toolId]?.weaponType === 'axe' ? toolId : 'hatchet', M) ?? group();
      out.right = group(0, 0, 0, axe);
      out.right.scale.setScalar(1.25);
      out.head = marker(0.6);
      out.right.add(out.head);
      break;
    }
    case 'fish': {
      const r = rod(M);
      out.right = r.g;
      out.tip = r.tip;
      break;
    }
    case 'anvil': {
      const h = hammer(M, 1.25);
      out.right = h.g;
      out.head = h.head;
      out.left = tongs(M, true);
      break;
    }
    case 'furnace':
      out.right = tongs(M, false);
      out.head = marker(0.5);
      out.right.add(out.head);
      break;
    case 'campfire':
    case 'stove':
      out.right = pan(M);
      out.head = marker(0.42, 0.05);
      out.right.add(out.head);
      break;
    case 'knife': {
      const k = knife(M);
      out.right = k.g;
      out.head = k.head;
      out.left = workpiece('knife', M);
      break;
    }
    case 'needle': {
      const n = needle(M);
      out.right = n.g;
      out.head = n.head;
      out.left = workpiece('needle', M);
      break;
    }
    case 'chisel': {
      const h = hammer(M, 0.55);
      out.right = h.g;
      out.head = h.head;
      out.left = workpiece('chisel', M);
      break;
    }
    case 'tinderbox':
      // flint in the right hand, the box in the left
      out.right = group(0, 0, 0, sbox(0.06, 0.05, 0.07, M(0x7a7a80), 0, 0, 0.05), sbox(0.03, 0.06, 0.02, M(MAT.steel[1]), 0, -0.02, 0.1));
      out.head = marker(0.1);
      out.right.add(out.head);
      out.left = workpiece('tinderbox', M);
      break;
    case 'tanning':
      // a two-handed scraper
      out.right = group(0, 0, 0, X(scyl(0.03, 0.03, 0.16, M(MAT.wood[1]), 0, 0, 0, 6)), sbox(0.3, 0.02, 0.08, M(MAT.steel[1]), 0.12, -0.02, 0.12));
      out.head = marker(0.12);
      out.right.add(out.head);
      out.left = workpiece('tanning', M);
      break;
  }
  return out;
}

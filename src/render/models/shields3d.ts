import * as THREE from 'three';
import type { ItemDef } from '../../game/inventory/items';
import { grimLook, MAT, matKeyOf, type GearLook, type Ramp } from './gearLooks';
import { group, sbox, scone, ssphere, type MatFn } from './parts';
import { PAINTED } from '../style';
import type { Detail } from './grimDetail';

/**
 * Worn shields (the left-hand "shield" slot), built big enough to read as a
 * shield from the tilted top-down camera: an outline per type (round, buckler,
 * kite, heater, tower, spiked, skull, book), a metal rim, a face plate, a boss,
 * rivets and an emblem on the front, and straps with a grip on the back.
 * Higher tiers add trim bands, more rivets and a gem.
 *
 * The returned group goes on the rig's `shieldMount` (left forearm). Inside it
 * the `SHIELD_HOLD` child carries the shield's orientation; the block
 * animation (render/anim/blockAnim.ts) turns that child to raise the shield.
 * The model inside the hold is built with its face toward +Z and its top
 * toward +Y.
 */
export const SHIELD_HOLD = 'shieldHold';

/** Shield outline sizes [width, height] — round ones use width as the diameter. */
export const SHIELD_SIZE: Record<GearLook['shield'], [number, number]> = {
  round: [0.84, 0.84],
  buckler: [0.52, 0.52],
  kite: [0.62, 1.02],
  heater: [0.66, 0.84],
  tower: [0.72, 1.26],
  spiked: [0.68, 0.9],
  skull: [0.64, 0.84],
  book: [0.36, 0.44],
};

/**
 * Rest orientation of the hold inside the mount: the face turned out (+X) and
 * well forward (+Z), tipped up a little, so the top-down camera sees the face
 * of the shield instead of its edge.
 */
export const SHIELD_REST = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.62, 0.28, 0.73).normalize());
/** Rest offset of the hold from the mount: a little further out so straps and rim stay off the arm and legs. */
export const SHIELD_OFFSET = new THREE.Vector3(0.05, 0, 0.03);

const THICK = 0.05;
const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true; // shared by every character: CreatureView.dispose must not free it
    geoCache.set(key, g);
  }
  return g;
}

type Outline = 'round' | 'buckler' | 'kite' | 'heater' | 'tower' | 'spiked' | 'skull';

/** 2D outline of a shield type, centred on the origin, scaled by k (k < 1 = inset face plate). */
function outline(kind: Outline, w: number, h: number, k = 1): THREE.Shape {
  const s = new THREE.Shape();
  const W = (w / 2) * k, H = (h / 2) * k;
  switch (kind) {
    case 'round':
    case 'buckler':
      s.absarc(0, 0, W, 0, Math.PI * 2, false);
      break;
    case 'kite':
      // rounded top, long tapering sides to a point
      s.moveTo(-W, H * 0.62);
      s.quadraticCurveTo(0, H * 1.12, W, H * 0.62);
      s.quadraticCurveTo(W * 1.04, -H * 0.15, 0, -H);
      s.quadraticCurveTo(-W * 1.04, -H * 0.15, -W, H * 0.62);
      break;
    case 'tower':
      // tall slab, gently arched top and bottom
      s.moveTo(-W, H * 0.9);
      s.quadraticCurveTo(0, H * 1.1, W, H * 0.9);
      s.lineTo(W, -H * 0.9);
      s.quadraticCurveTo(0, -H * 1.1, -W, -H * 0.9);
      s.closePath();
      break;
    case 'spiked':
      // heater with two horns at the top corners
      s.moveTo(-W * 1.08, H * 1.04);
      s.lineTo(-W * 0.55, H * 0.82);
      s.quadraticCurveTo(0, H * 0.92, W * 0.55, H * 0.82);
      s.lineTo(W * 1.08, H * 1.04);
      s.lineTo(W, H * 0.25);
      s.quadraticCurveTo(W, -H * 0.5, 0, -H);
      s.quadraticCurveTo(-W, -H * 0.5, -W, H * 0.25);
      s.closePath();
      break;
    case 'skull': {
      // heater with a jagged bone top
      s.moveTo(-W, H * 0.85);
      for (let i = 0; i < 5; i++) {
        const x0 = -W + (i * 2 * W) / 5;
        s.lineTo(x0 + W / 5, H * 1.04);
        s.lineTo(x0 + (2 * W) / 5, H * 0.85);
      }
      s.lineTo(W, H * 0.1);
      s.quadraticCurveTo(W, -H * 0.55, 0, -H);
      s.quadraticCurveTo(-W, -H * 0.55, -W, H * 0.1);
      s.closePath();
      break;
    }
    default:
      // heater: flat top, straight upper sides, curved to a point
      s.moveTo(-W, H);
      s.lineTo(W, H);
      s.lineTo(W, H * 0.2);
      s.quadraticCurveTo(W, -H * 0.55, 0, -H);
      s.quadraticCurveTo(-W, -H * 0.55, -W, H * 0.2);
      s.closePath();
  }
  return s;
}

/** Flat slab of an outline from z = z0 to z0 + depth. */
function slab(kind: Outline, w: number, h: number, k: number, depth: number, z0: number, m: THREE.Material): THREE.Mesh {
  const g = geo(`sh:${kind}:${w}:${h}:${k}:${depth}`, () => {
    const e = new THREE.ExtrudeGeometry(outline(kind, w, h, k), { depth, bevelEnabled: false, curveSegments: kind === 'round' || kind === 'buckler' ? 10 : 5 });
    e.computeVertexNormals();
    if (PAINTED) {
      // painted style: UVs 0..1 across the face (the extruder writes raw x/y), so the detail
      // atlas cell (grimDetail.ts) covers the whole shield face once, upright
      const uv = e.attributes.uv as THREE.BufferAttribute, pos = e.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / (w * 1.08) + 0.5, pos.getY(i) / (h * 1.08) + 0.5);
    }
    return e;
  });
  const me = new THREE.Mesh(g, m);
  me.position.z = z0;
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

/** Points along an outline (for rivets), inset by k. */
function rim(kind: Outline, w: number, h: number, k: number, n: number): THREE.Vector2[] {
  return outline(kind, w, h, k).getSpacedPoints(n).slice(0, n);
}

function rot<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.rotation.set(x, y, z);
  return o;
}

/** A raised emblem on the shield face (z = front), centred at (0, y), size u. */
function emblem(lk: GearLook, trim: THREE.Material, gemM: THREE.Material | null, y: number, u: number, z: number): THREE.Object3D[] {
  const d = 0.018;
  const at = (o: THREE.Mesh, oy = 0): THREE.Mesh => { o.position.y += y + oy; o.position.z = z; return o; };
  switch (lk.emblem) {
    case 'cross': return [at(sbox(u * 0.22, u * 1.3, d, trim)), at(sbox(u * 0.95, u * 0.22, d, trim), u * 0.25)];
    case 'bar': case 'none': return [at(sbox(u * 0.18, u * 1.5, d, trim)), at(sbox(u * 1.2, u * 0.18, d, trim))];
    case 'star': case 'sun': {
      const out: THREE.Mesh[] = [];
      const n = lk.emblem === 'sun' ? 8 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = rot(sbox(u * 0.16, u * (lk.emblem === 'sun' ? 0.5 : 0.62), d, trim), 0, 0, -a);
        r.position.set(Math.sin(a) * u * 0.38, Math.cos(a) * u * 0.38, 0);
        out.push(at(r));
      }
      out.push(at(rot(sbox(u * 0.42, u * 0.42, d * 1.4, gemM ?? trim), 0, 0, Math.PI / 4)));
      return out;
    }
    case 'moon': {
      const c = new THREE.Mesh(geo(`moon:${u}`, () => new THREE.TorusGeometry(u * 0.45, u * 0.1, 3, 10, Math.PI * 1.3)), trim);
      c.rotation.z = Math.PI * 0.85;
      return [at(c)];
    }
    case 'flake': case 'flame': {
      const out: THREE.Mesh[] = [];
      const n = lk.emblem === 'flake' ? 3 : 1;
      for (let i = 0; i < n; i++) out.push(at(rot(sbox(u * 0.14, u * 1.3, d, trim), 0, 0, (i / n) * Math.PI)));
      if (lk.emblem === 'flame') for (const s of [-1, 1]) out.push(at(rot(sbox(u * 0.13, u * 0.8, d, trim), 0, 0, s * 0.45), -u * 0.15));
      return out;
    }
    case 'eye': return [at(ssphere(u * 0.42, trim, 0, 0, 0, 1.5, 0.75, 0.3)), at(ssphere(u * 0.2, gemM ?? trim, 0, 0, 0.012, 1, 1, 0.5))];
    case 'crown': return [at(sbox(u * 1.0, u * 0.3, d, trim), -u * 0.2), ...[-1, 0, 1].map((i) => {
      const pt = at(rot(sbox(u * 0.22, u * 0.22, d, trim), 0, 0, Math.PI / 4), u * (i === 0 ? 0.2 : 0.08));
      pt.position.x = i * u * 0.4;
      return pt;
    })];
    case 'dragon': return [at(rot(sbox(u * 0.2, u * 1.2, d, trim), 0, 0, 0.5)), at(rot(sbox(u * 0.2, u * 1.2, d, trim), 0, 0, -0.5)), at(ssphere(u * 0.22, gemM ?? trim, 0, 0, 0, 1, 1, 0.5), u * 0.4)];
    case 'leaf': return [at(ssphere(u * 0.5, trim, 0, 0, 0, 0.55, 1.2, 0.2)), at(sbox(u * 0.06, u * 1.1, d * 1.3, gemM ?? trim))];
    case 'skull': return [at(ssphere(u * 0.45, trim, 0, 0, 0, 1, 1.05, 0.5)), at(sbox(u * 0.5, u * 0.2, d, trim), -u * 0.45)];
    case 'beard': return [at(scone(u * 0.4, u * 0.9, trim, 0, 0, 0, 4), -u * 0.1)];
    default: return [];
  }
}

/** The leather straps and grip on the back, so a turned-away shield still reads as one. */
function straps(back: THREE.Material, metal: THREE.Material, w: number, h: number, z: number): THREE.Object3D[] {
  const L = Math.min(w, h) * 0.62;
  return [
    rot(sbox(0.07, L, 0.022, back, 0, h * 0.12, z - 0.011), 0, 0, 0.18),
    rot(sbox(0.07, L, 0.022, back, 0, -h * 0.14, z - 0.011), 0, 0, -0.18),
    sbox(0.05, 0.16, 0.05, metal, 0.05, 0, z - 0.03), // grip bar
    sbox(0.04, 0.04, 0.05, metal, 0.05, 0.1, z - 0.01),
    sbox(0.04, 0.04, 0.05, metal, 0.05, -0.1, z - 0.01),
  ];
}

/** Builds the shield model for a look (no mount transform). */
export function buildShieldModel(d: ItemDef, lk0: GearLook, legacy: { face: number; rim: number; glow?: number } | undefined, M: MatFn): THREE.Group {
  const g = buildShieldParts(d, lk0, legacy, M);
  if (PAINTED) grimShield(d, lk0, g, M);
  return g;
}

/**
 * Painted style (owner 2026-10-23, grim look): the same shield in the grim palette with worn
 * surfaces from the detail atlas — riveted, dented plate or scales or tarnished gilt on the
 * face, pitted iron on the rim, grain and splits on wooden boards, leather on the back —
 * plus a few gouges and nail heads. Sizes and shapes are unchanged.
 */
function faceSurface(lk: GearLook): Detail {
  const k = matKeyOf(lk.m);
  if (k === 'wood') return 'wood';
  if (k === 'gold' || k === 'dwarven') return 'gilt';
  if (k === 'bone' || k === 'pearl') return 'bone';
  if (k === 'dragon' || k === 'tide' || k === 'elven') return 'scale';
  if (k === 'leather' || k === 'darkleather') return 'studded';
  if (k === 'arcane' || k === 'void' || k === 'royal' || k === 'rime') return 'leather'; // book covers
  return 'plate';
}

function grimShield(d: ItemDef, lk: GearLook, g: THREE.Group, M: MatFn): void {
  const wooden = d.id === 'wooden_shield' || lk.m === MAT.wood;
  const face = faceSurface(lk);
  const tk = matKeyOf(lk.t);
  const rimD: Detail = tk === 'gold' || tk === 'dwarven' || tk === 'bronze' ? 'gilt' : tk === 'bone' ? 'bone' : 'iron';
  // the face plate is the second child (after the rim body); the back plate the third
  g.children.forEach((c, i) => {
    const me = c as THREE.Mesh;
    if (!me.isMesh || me.userData.detail) return;
    me.userData.detail = lk.shield === 'book' ? (i === 1 ? 'plain' : i === 0 ? 'leather' : 'gilt') : i === 1 ? face : i === 2 ? (wooden ? 'wood' : 'leather') : rimD;
  });
  if (lk.shield === 'book') return;
  const [w, h] = SHIELD_SIZE[lk.shield];
  const z = THICK + 0.018;
  const dark = M(0x120d0a);
  // deep gouges across the face, and nail heads hammered through it
  const cuts: Array<[number, number, number, number]> = [[0.18, 0.12, 0.2, 0.7], [-0.12, -0.05, 0.16, -0.5], [0.05, -0.22, 0.12, 1.2]];
  for (const [x, y, l, a] of cuts) {
    if (Math.abs(x) > w * 0.38 || Math.abs(y) > h * 0.36) continue;
    const c = sbox(l * Math.min(w, h), 0.012, 0.008, dark, x * w, y * h, z);
    c.rotation.z = a;
    c.userData.detail = 'iron';
    g.add(c);
  }
  const nail = M(MAT.iron[2]);
  for (const [x, y] of [[-0.22, 0.25], [0.24, -0.1], [-0.05, -0.3], [0.1, 0.32]] as const) {
    if (lk.shield === 'buckler') break;
    const n = ssphere(0.014, nail, x * w, y * h, z - 0.004, 1, 1, 0.6, 0);
    n.userData.detail = 'iron';
    g.add(n);
  }
  if (wooden) for (let i = -1; i <= 1; i += 2) { const b = sbox(w * 0.84, 0.04, 0.012, M(MAT.iron[1]), 0, i * h * 0.28, z); b.userData.detail = 'iron'; g.add(b); }
}

function buildShieldParts(d: ItemDef, lk0: GearLook, legacy: { face: number; rim: number; glow?: number } | undefined, M: MatFn): THREE.Group {
  const lk = PAINTED ? grimLook(lk0) : lk0;
  const style: Outline | 'book' = lk.shield;
  const wooden = d.id === 'wooden_shield' || lk0.m === MAT.wood;
  const glow = PAINTED ? undefined : legacy?.glow ?? lk.glow;
  const m: Ramp = lk.m, t: Ramp = lk.t;
  const faceM = M(wooden ? MAT.wood[1] : m[1], glow);
  // (painted style: M maps MAT colours to the grim palette — weapons.ts makeShield passes grimMats)
  const hiM = M(m[0], glow);
  const rimM = M(wooden ? MAT.iron[1] : t[1]);
  const rimD = M(wooden ? MAT.iron[2] : t[2]);
  const backM = M(MAT.darkleather[1]);
  const backFace = M(wooden ? MAT.wood[2] : m[2]);
  const gemM = lk.gem !== undefined ? M(lk.gem, lk.gem) : null;
  const tier = lk.tier;
  const g = new THREE.Group();

  if (style === 'book') {
    const [w, h] = SHIELD_SIZE.book;
    g.add(
      sbox(w, h, 0.1, faceM, 0, 0, 0),
      sbox(w - 0.03, h - 0.03, 0.08, M(0xf0e8d0), 0.02, 0, 0),
      sbox(0.05, h, 0.11, rimM, -w / 2, 0, 0),
      ...[[1, 1], [1, -1]].map(([sx, sy]) => sbox(0.07, 0.07, 0.112, rimM, sx * (w / 2 - 0.03), sy * (h / 2 - 0.03), 0)),
      rot(sbox(0.12, 0.12, 0.02, rimM, 0, 0, 0.055), 0, 0, Math.PI / 4),
      sbox(0.03, h * 0.5, 0.02, rimD, 0, 0, 0.056),
      sbox(w * 0.6, 0.03, 0.02, rimD, 0, 0, 0.056),
    );
    if (gemM) g.add(ssphere(0.035, gemM, 0, 0, 0.07));
    return g;
  }

  const [w, h] = SHIELD_SIZE[style];
  const round = style === 'round' || style === 'buckler';
  const faceZ = THICK; // front of the rim body
  // rim body (trim metal) + inset face plate + back plate
  g.add(slab(style, w, h, 1, THICK, 0, rimM));
  g.add(slab(style, w, h, 0.86, 0.016, faceZ, faceM));
  g.add(slab(style, w, h, 0.94, 0.01, -0.01, backFace));
  // a highlight band across the top of the face (light catches it from above)
  if (!round && style !== 'skull') g.add(sbox(w * 0.7, h * 0.05, 0.012, hiM, 0, h * 0.3, faceZ + 0.018));

  if (wooden) {
    // planks and an iron band across
    for (let i = -2; i <= 2; i++) g.add(sbox(0.012, h * 0.8 - Math.abs(i) * 0.1, 0.008, M(MAT.wood[3]), i * w * 0.15, 0, faceZ + 0.017));
    g.add(sbox(w * 0.84, 0.05, 0.012, rimM, 0, 0, faceZ + 0.018));
  }
  if (round) {
    // concentric ring and a big domed boss
    const ring = new THREE.Mesh(geo(`ring:${w}`, () => new THREE.TorusGeometry(w * 0.3, 0.014, 3, 16)), rimD);
    ring.position.z = faceZ + 0.017;
    g.add(ring);
    const bossR = style === 'buckler' ? w * 0.22 : w * 0.17;
    g.add(ssphere(bossR, wooden ? M(MAT.iron[1]) : rimM, 0, 0, faceZ + 0.01, 1, 1, 0.6));
    if (style === 'buckler') g.add(rot(scone(bossR * 0.35, bossR * 1.1, rimD, 0, 0, faceZ + bossR * 0.9, 4), Math.PI / 2, 0, 0));
    if (lk.emblem === 'beard') g.add(...emblem(lk, rimD, gemM, h * 0.26, w * 0.16, faceZ + 0.018));
    if (gemM) g.add(ssphere(0.035, gemM, 0, 0, faceZ + bossR * 0.62));
  } else {
    // boss and emblem; tower shields get a full cross band, kites a central rib
    const ey = style === 'kite' ? h * 0.08 : style === 'tower' ? 0 : h * 0.06;
    if (style === 'tower') {
      g.add(sbox(w * 0.08, h * 0.86, 0.014, rimM, 0, 0, faceZ + 0.017), sbox(w * 0.86, w * 0.08, 0.014, rimM, 0, h * 0.1, faceZ + 0.017));
    } else if (style === 'kite' && tier >= 1) {
      g.add(sbox(0.02, h * 0.7, 0.012, rimD, 0, -h * 0.05, faceZ + 0.017));
    }
    if (style === 'skull') {
      g.add(ssphere(w * 0.22, M(MAT.bone[1]), 0, h * 0.05, faceZ + 0.02, 1, 1.1, 0.55));
      for (const s of [-1, 1]) g.add(sbox(0.06, 0.07, 0.02, M(0x140e0a), s * w * 0.09, h * 0.08, faceZ + 0.1));
      g.add(sbox(w * 0.26, 0.05, 0.02, M(MAT.bone[2]), 0, -h * 0.14, faceZ + 0.06));
    } else {
      g.add(...emblem(lk, rimM, gemM, ey, Math.min(w, h) * 0.32, faceZ + 0.018));
      if (lk.emblem === 'none' || lk.emblem === 'bar' || lk.emblem === 'cross') g.add(ssphere(w * 0.09, rimM, 0, ey + (lk.emblem === 'cross' ? h * 0.06 : 0), faceZ + 0.02, 1, 1, 0.6));
    }
    if (style === 'spiked' || lk.spikes) {
      // spikes along the edges and one through the boss
      for (const p of rim(style, w, h, 1, 10)) {
        if (p.y > h * 0.4) continue;
        const sp = scone(0.03, 0.12, rimD, p.x * 1.02, p.y * 1.02, faceZ / 2, 4);
        sp.rotation.z = Math.atan2(p.y, p.x) - Math.PI / 2;
        g.add(sp);
      }
      const c = scone(0.04, 0.16, rimD, 0, h * 0.05, faceZ + 0.08, 4);
      c.rotation.x = Math.PI / 2;
      g.add(c);
    }
    if (gemM && style !== 'skull' && lk.emblem !== 'star' && lk.emblem !== 'sun' && lk.emblem !== 'eye') g.add(ssphere(0.035, gemM, 0, h * 0.3, faceZ + 0.028));
  }
  // rivets around the rim: more on better shields
  const n = (round ? 8 : 6) + Math.min(4, tier) * 2;
  for (const p of rim(style, w, h, 0.93, n)) g.add(ssphere(0.02, tier >= 3 ? hiM : rimD, p.x, p.y, faceZ + 0.005));
  // a second inner trim line on high-tier shields
  if (tier >= 3 && !round) for (const p of rim(style, w, h, 0.78, 14)) g.add(ssphere(0.012, rimM, p.x, p.y, faceZ + 0.018));
  g.add(...straps(backM, M(MAT.iron[2]), w, h, 0));
  return g;
}

/** The whole worn shield: model inside the posable hold, ready for the shield mount. */
export function wornShield(model: THREE.Group, bookLike: boolean, wood = false): THREE.Group {
  const root = group();
  const hold = new THREE.Group();
  hold.name = SHIELD_HOLD;
  hold.position.copy(SHIELD_OFFSET);
  hold.quaternion.copy(SHIELD_REST);
  if (bookLike) {
    // a spellbook is held flatter against the forearm, a little lower
    hold.position.set(0.02, -0.06, 0.06);
  }
  hold.add(model);
  root.add(hold);
  root.userData.shield = true;
  root.userData.wood = wood;
  return root;
}

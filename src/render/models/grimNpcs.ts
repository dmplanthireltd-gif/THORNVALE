import * as THREE from 'three';
import { Rng } from '../../game/core/rng';
import type { Appearance } from '../../game/player/appearance';
import { applyGear, holdProp } from './humanoid';
import { box, collectMaterials, cone, cyl, group, mat, sphere, type Mat } from './parts';
import { buildPlayerRig } from './playerModel';
import type { BipedRig } from './rigs';
import { detail, type Detail } from './grimDetail';

/**
 * Painted style sample (owner 2026-10-23: "all models more detailed, more brutal, for older
 * players — give me a sample"): bespoke, gritty models for the five key NPCs of the
 * Thornvale temple court. Each is built on the player body (playerModel.ts, so the same
 * rig, animations and grim face) and dressed with its own worn kit; surfaces come from the
 * detail atlas (grimDetail.ts, tags via `detail`). Only used when the painted style is on
 * (rigs.ts buildNpc); the classic look keeps the old outfit NPCs.
 *
 * Silhouettes from the top-down camera: Aldric = long torn red cloak + greatsword;
 * Brunhild = bare black arms + huge hammer head + apron; Mirella = peaked hood + glowing
 * staff; Orwin = wide coat skirts + coin chest at his feet; Elias = one great pauldron +
 * round shield on his back + wooden practice blade.
 */

const d = <T extends THREE.Object3D>(o: T, k: Detail): T => detail(o, k);
const rot = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.rotation.set(x, y, z); return o; };

/** A ragged cloak hanging from the shoulders: strips of uneven length; returns the swinging pivot. */
function tornCloak(torso: THREE.Group, color: number, width: number, len: number, z: number, k: Detail, seed: number): THREE.Group {
  const r = new Rng(seed);
  const m = mat(color);
  const pivot = group(0, 0.53, z);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const l = len * (0.72 + r.next() * 0.28) * (i === 0 || i === n - 1 ? 0.85 : 1);
    const x = -width / 2 + (i + 0.5) * (width / n);
    const strip = d(box(width / n * 1.12, l, 0.03, m, x, -l / 2, -Math.abs(x) * 0.12), k);
    strip.rotation.z = (r.next() - 0.5) * 0.06;
    pivot.add(strip);
  }
  pivot.rotation.x = 0.12;
  torso.add(pivot);
  // heavy folds over the shoulders (what the camera mostly sees)
  torso.add(d(sphere(0.2, m, 0, 0.5, z + 0.08, 1.5, 0.45, 0.8, 2), k));
  return pivot;
}

/** A row of rivets along x at height y on the given face (z). */
function rivets(parent: THREE.Object3D, m: Mat, xs: number[], y: number, z: number, r = 0.016): void {
  for (const x of xs) parent.add(sphere(r, m, x, y, z, 1, 1, 0.6, 0));
}

/** Thin scar on the face (head space). */
function scar(head: THREE.Group, x: number, y: number, len: number, angle: number, color = 0xb8706a): void {
  const s = box(0.012, len, 0.012, mat(color), x, y, 0.2);
  s.rotation.z = angle;
  s.userData.face = true;
  head.add(s);
}

function pouch(parent: THREE.Object3D, leather: Mat, x: number, y: number, z: number, w = 0.09): void {
  parent.add(d(box(w, w * 1.1, 0.07, leather, x, y, z), 'leather'));
  parent.add(d(box(w * 1.05, w * 0.35, 0.075, leather, x, y + w * 0.4, z + 0.003), 'leather'));
}

function finish(rig: BipedRig, height: number): BipedRig {
  rig.prop = true;
  rig.height = height;
  rig.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== rig.hitbox) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  rig.materials.length = 0;
  rig.materials.push(...collectMaterials(rig.body));
  return rig;
}

const ap = (a: Partial<Appearance>): Appearance => ({
  body: 'male', skin: 2, hair: 'short', hairColor: 1, beard: 'none', build: 'average', eyes: 0, top: 3, bottom: 3, ...a,
} as Appearance);

/** Tags every remaining plain part of a group (sleeves, trousers) with one surface. */
function tagAll(g: THREE.Object3D, k: Detail, skip?: Mat): void {
  for (const c of g.children) if ((c as THREE.Mesh).isMesh && (c as THREE.Mesh).material !== skip) c.userData.detail = k;
}

// ------------------------------------------------------------------ Captain Aldric

function aldric(): BipedRig {
  const rig = buildPlayerRig(ap({ skin: 1, hair: 'short', hairColor: 9, beard: 'short', build: 'broad', eyes: 0, top: 3, bottom: 3 }));
  applyGear(rig, { weapon: null, shield: null, armor: 'plate_armor', head: null, legs: 'plate_legs', feet: 'steel_boots' });
  const { torso, head } = rig;
  const tab = mat(0x5a1814);
  const tabDark = mat(0x34100c);
  const leather = mat(0x3a2618);
  const iron = mat(0x4a4642);
  const brass = mat(0x8a6a34);
  // blood-stained tabard over the plate, front and back, ragged to mid-thigh
  for (const z of [0.245, -0.245]) {
    torso.add(d(box(0.3, 0.62, 0.025, tab, 0, 0.2, z), 'clothBlood'));
    torso.add(d(box(0.12, 0.14, 0.025, tab, 0.06, -0.17, z), 'clothBlood'));
    torso.add(d(box(0.1, 0.1, 0.025, tab, -0.08, -0.14, z), 'clothBlood'));
  }
  // a black iron crest (a thorned crown in a diamond) on the chest
  const crest = box(0.11, 0.11, 0.02, tabDark, 0, 0.36, 0.262);
  crest.rotation.z = Math.PI / 4;
  torso.add(d(crest, 'iron'));
  // war belt: wide, studded, two pouches and a dagger
  torso.add(d(box(0.52, 0.08, 0.53, leather, 0, 0.03, 0), 'leather'));
  torso.add(box(0.08, 0.07, 0.02, brass, 0, 0.03, 0.27));
  rivets(torso, brass, [-0.2, -0.12, 0.12, 0.2], 0.03, 0.268);
  pouch(torso, leather, 0.18, -0.05, 0.25);
  pouch(torso, leather, -0.22, -0.05, 0.2, 0.08);
  // baldric strap across the chest
  torso.add(d(rot(box(0.07, 0.75, 0.04, leather, 0, 0.3, 0.262), 0, 0, 0.75), 'leather'));
  torso.add(d(rot(box(0.07, 0.75, 0.04, leather, 0, 0.3, -0.262), 0, 0, -0.75), 'leather'));
  // gorget; rivets and a spike on the plate's own pauldrons
  torso.add(d(cyl(0.17, 0.21, 0.08, iron, 0, 0.57, 0, 10), 'iron'));
  for (const s of [-1, 1]) {
    rivets(torso, brass, [s * 0.27, s * 0.33, s * 0.39], 0.6, 0.1, 0.014);
    torso.add(d(cone(0.03, 0.11, iron, s * 0.34, 0.66, 0, 4), 'iron'));
  }
  // long torn cloak in dried-blood red
  rig.cape = tornCloak(torso, 0x4a1210, 0.6, 1.0, -0.29, 'clothBlood', 11);
  // grim old face: grey crop, scar through the left brow and cheek, a torn ear
  scar(head, 0.085, 0.02, 0.2, 0.25);
  scar(head, -0.05, -0.09, 0.07, -1.1, 0x9a5a50);
  // notched, blood-dark greatsword
  const blade = mat(0x9a9c9e);
  const grip = mat(0x2a1a10);
  const sword = group(0, 0, 0,
    d(box(0.035, 0.32, 0.035, grip, 0, 0.02, 0.04), 'leather'),
    d(sphere(0.04, iron, 0, -0.16, 0.04, 1, 1, 1, 1), 'iron'),
    d(box(0.34, 0.05, 0.06, iron, 0, 0.2, 0.04), 'iron'),
    d(box(0.11, 1.15, 0.022, blade, 0, 0.8, 0.04), 'blade'),
    d(cone(0.055, 0.14, blade, 0, 1.44, 0.04, 4), 'blade'),
  );
  sword.rotation.x = 0.12;
  holdProp(rig, sword);
  rig.restArm = -0.2;
  return finish(rig, 1.85);
}

// ------------------------------------------------------------------ Brunhild the smith

function brunhild(): BipedRig {
  const rig = buildPlayerRig(ap({ body: 'female', skin: 3, hair: 'braids', hairColor: 5, build: 'broad', eyes: 1, top: 3, bottom: 2 }));
  const { torso, head, armL, armR, legL, legR } = rig;
  const skin = rig.gear!.skin;
  const apronM = mat(0x4a3220);
  const leather = mat(0x2e2016);
  const iron = mat(0x3c3a38);
  // bare, soot-black arms: sleeves become skin, forearms and hands black with soot
  for (const a of [armL, armR]) {
    a.scale.x *= 1.18; a.scale.z *= 1.18;
    const kids = a.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    kids[0].material = skin; kids[0].userData.detail = 'skinSoot';
    kids[1].visible = false;
    for (const k of kids.slice(2)) if (k.material === skin) k.userData.detail = 'skinSoot';
    a.add(d(cyl(0.075, 0.075, 0.035, mat(0x6a4a2a), 0, -0.2, 0, 8), 'leather')); // arm ring
  }
  tagAll(torso, 'cloth', skin);
  // heavy scorched leather apron, chest to knee, with a bib strap round the neck
  torso.add(d(box(0.4, 0.92, 0.03, apronM, 0, 0.1, 0.19), 'leatherBurnt'));
  torso.add(d(box(0.42, 0.12, 0.035, apronM, 0, -0.3, 0.192), 'leatherBurnt'));
  for (const s of [-1, 1]) torso.add(d(rot(box(0.035, 0.2, 0.035, leather, s * 0.12, 0.6, 0.12), 0.6, 0, -s * 0.3), 'leather'));
  torso.add(d(box(0.5, 0.07, 0.4, leather, 0, 0.05, 0), 'leather')); // apron ties / belt
  // tool belt: tongs, a file, pouches
  pouch(torso, leather, -0.2, -0.04, 0.17);
  torso.add(d(rot(box(0.025, 0.36, 0.025, iron, 0.23, -0.12, 0.1), 0, 0, 0.12), 'iron'));
  torso.add(d(rot(box(0.025, 0.36, 0.025, iron, 0.26, -0.12, 0.1), 0, 0, 0.2), 'iron'));
  // leather gaiters over the trousers, iron-toed boots
  for (const l of [legL, legR]) {
    tagAll(l, 'leather');
    l.add(d(cyl(0.1, 0.09, 0.22, leather, 0, -0.36, 0, 8), 'leatherBurnt'));
    l.add(d(sphere(0.08, iron, 0, -0.56, 0.16, 1, 0.55, 1.05, 1), 'iron'));
  }
  // soot-smeared face with a burn scar, a leather headband
  scar(head, -0.1, -0.05, 0.1, 0.5, 0x8a3a2a);
  head.add(d(cyl(0.215, 0.215, 0.04, leather, 0, 0.1, -0.01, 12), 'leather'));
  // the huge forge hammer
  const hammer = group(0, 0, 0,
    d(cyl(0.028, 0.034, 1.0, mat(0x7a5a3a), 0, 0.32, 0.04, 6), 'wood'),
    d(box(0.065, 0.18, 0.065, leather, 0, -0.08, 0.04), 'leather'),
    d(box(0.3, 0.17, 0.17, iron, 0, 0.86, 0.04), 'iron'),
    d(box(0.05, 0.2, 0.2, mat(0x6a6866), 0.17, 0.86, 0.04), 'steel'),
    d(box(0.05, 0.2, 0.2, mat(0x6a6866), -0.17, 0.86, 0.04), 'steel'),
    d(box(0.1, 0.05, 0.2, iron, 0, 0.75, 0.04), 'iron'),
  );
  hammer.rotation.x = 0.15;
  holdProp(rig, hammer);
  rig.restArm = -0.15;
  return finish(rig, 1.8);
}

// ------------------------------------------------------------------ Mirella the hedge-witch

function mirella(): BipedRig {
  const rig = buildPlayerRig(ap({ body: 'female', skin: 0, hair: 'long', hairColor: 0, build: 'slim', eyes: 4, top: 14, bottom: 3 }));
  const { torso, head, armL, armR, legL, legR } = rig;
  const robe = mat(0x4a3448);
  const robeDark = mat(0x2a1c28);
  const bone = mat(0xcfc2a2);
  const cord = mat(0x2a1a10);
  for (const c of head.children) if (c.userData.cover) c.visible = false; // hair under the hood
  tagAll(torso, 'runeCloth');
  // floor-length robe with a rune-stitched hem and a ragged mantle
  torso.add(d(cyl(0.25, 0.4, 0.78, robe, 0, -0.3, 0, 12), 'runeCloth'));
  torso.add(d(cyl(0.2, 0.33, 0.3, robeDark, 0, 0.44, 0, 12), 'cloth'));
  torso.add(d(cyl(0.3, 0.3, 0.06, cord, 0, 0.05, 0, 12), 'leather'));
  for (const l of [legL, legR]) for (const c of l.children) c.visible = (c as THREE.Mesh).position.y < -0.5; // only the feet show
  for (const a of [armL, armR]) {
    tagAll(a, 'runeCloth', rig.gear!.skin);
    a.add(d(cyl(0.11, 0.15, 0.18, robe, 0, -0.24, 0, 8), 'runeCloth')); // wide sleeve
  }
  // bone and rune charms: a necklace of teeth with a small skull, rune tablets on the cord belt
  for (let i = 0; i < 7; i++) {
    const a = -0.6 + i * 0.2;
    const t = cone(0.018, 0.06, bone, Math.sin(a) * 0.15, 0.48 - Math.cos(a) * 0.06, 0.2, 4);
    t.rotation.x = Math.PI;
    torso.add(d(t, 'bone'));
  }
  torso.add(d(sphere(0.045, bone, 0, 0.38, 0.21, 1, 1.1, 0.8, 1), 'bone'));
  torso.add(box(0.012, 0.012, 0.01, mat(0x0a0606), 0.015, 0.39, 0.25));
  torso.add(box(0.012, 0.012, 0.01, mat(0x0a0606), -0.015, 0.39, 0.25));
  const glyph = mat(0x7affd8, { emissive: 0x1e8a6a });
  for (const [x, z] of [[0.15, 0.24], [-0.17, 0.22], [0.27, 0.05]] as const) {
    torso.add(d(box(0.06, 0.08, 0.015, mat(0x5a5048), x, -0.07, z), 'bone'));
    torso.add(box(0.012, 0.045, 0.006, glyph, x, -0.07, z + 0.011));
  }
  // deep peaked hood shadowing the face
  head.add(d(sphere(0.25, robe, 0, 0.06, -0.1, 1, 1.05, 1.0, 2), 'cloth'));
  head.add(d(rot(cone(0.16, 0.34, robe, 0, 0.24, -0.2, 8), -0.7, 0, 0), 'cloth'));
  for (const s of [-1, 1]) head.add(d(rot(box(0.05, 0.36, 0.2, robe, s * 0.2, -0.02, 0.02), 0, 0, s * 0.12), 'cloth')); // hood sides framing the face
  head.add(d(box(0.4, 0.06, 0.12, robe, 0, 0.2, 0.1), 'cloth')); // hood brim over the brow
  head.add(d(sphere(0.2, mat(0x120a10), 0, 0.03, -0.09, 1.05, 1.05, 1.0, 1), 'plain'));
  // cut and scarred hands
  scar(head, 0.06, -0.06, 0.12, -0.4, 0x8a4a4a);
  for (const a of [armL, armR]) {
    const s = box(0.012, 0.06, 0.01, mat(0x9a4a44), 0.02, -0.33, 0.062);
    s.rotation.z = 0.6;
    a.add(s);
  }
  // gnarled staff crowned by a bound, glowing skull
  const wood = mat(0x3a2a1c);
  const glow = mat(0x9affe0, { emissive: 0x3ad8a8 });
  const staff = group(0, 0, 0,
    d(rot(cyl(0.025, 0.035, 1.0, wood, 0, 0.15, 0.04, 6), 0, 0, 0.04), 'wood'),
    d(rot(cyl(0.022, 0.025, 0.5, wood, 0.03, 0.85, 0.04, 6), 0, 0, -0.18), 'wood'),
    d(rot(cyl(0.018, 0.02, 0.28, wood, -0.07, 1.12, 0.04, 5), 0, 0, 0.7), 'wood'),
    d(sphere(0.075, bone, 0.02, 1.2, 0.05, 1, 1.1, 0.95, 1), 'bone'),
    sphere(0.02, glow, 0.045, 1.21, 0.115, 1, 1, 1, 0),
    sphere(0.02, glow, -0.005, 1.21, 0.115, 1, 1, 1, 0),
    sphere(0.07, glow, 0.02, 1.38, 0.05, 1, 1, 1, 2),
    d(cyl(0.04, 0.04, 0.04, cord, 0.01, 1.08, 0.05, 6), 'leather'),
    d(rot(cone(0.012, 0.09, bone, 0.07, 1.0, 0.06, 4), Math.PI, 0, 0), 'bone'),
    d(rot(cone(0.012, 0.08, bone, -0.05, 0.98, 0.06, 4), Math.PI, 0, 0), 'bone'),
  );
  holdProp(rig, staff);
  rig.restArm = -0.12;
  return finish(rig, 1.85);
}

// ------------------------------------------------------------------ Orwin the banker

function orwin(): BipedRig {
  const rig = buildPlayerRig(ap({ skin: 2, hair: 'bald', hairColor: 9, beard: 'full', build: 'broad', eyes: 2, top: 3, bottom: 3 }));
  const { torso, head, armL, armR, body } = rig;
  const coat = mat(0x2a2620);
  const coatTrim = mat(0x1a1612);
  const fur = mat(0x5a4c3c);
  const brass = mat(0x9a7a3a);
  const leather = mat(0x3a2618);
  const iron = mat(0x3c3a38);
  tagAll(torso, 'cloth');
  // heavy long coat: body, split skirts to the knee, fur collar, brass clasps
  torso.add(d(cyl(0.27, 0.3, 0.56, coat, 0, 0.27, 0, 10), 'leather'));
  torso.add(d(cyl(0.3, 0.4, 0.52, coat, 0, -0.24, -0.02, 10), 'leather'));
  torso.add(d(box(0.05, 0.6, 0.06, coatTrim, 0, 0.0, 0.31), 'leather')); // the split, front
  torso.add(d(sphere(0.25, fur, 0, 0.55, 0, 1.15, 0.38, 1.0, 2), 'fur'));
  for (const y of [0.42, 0.3, 0.18]) torso.add(box(0.06, 0.03, 0.02, brass, 0, y, 0.285));
  torso.add(d(box(0.62, 0.07, 0.62, leather, 0, 0.04, 0), 'leather'));
  torso.add(box(0.08, 0.06, 0.02, brass, 0, 0.04, 0.315));
  // a studded cudgel on the left hip, a ring of keys on the right
  const club = group(0.3, -0.1, 0.05,
    d(cyl(0.025, 0.03, 0.42, mat(0x3a2818), 0, 0, 0, 6), 'wood'),
    d(cyl(0.06, 0.045, 0.16, mat(0x3a2818), 0, -0.22, 0, 7), 'wood'),
  );
  for (let i = 0; i < 6; i++) club.add(sphere(0.016, iron, Math.cos(i) * 0.055, -0.2 - (i % 2) * 0.06, Math.sin(i) * 0.055, 1, 1, 1, 0));
  club.rotation.z = 0.25;
  torso.add(club);
  torso.add(d(rot(cyl(0.05, 0.05, 0.012, brass, -0.3, -0.04, 0.12, 10), Math.PI / 2, 0, 0.3), 'steel'));
  for (const s of [-1, 0, 1]) torso.add(box(0.012, 0.07, 0.012, brass, -0.3 + s * 0.025, -0.1, 0.13));
  for (const a of [armL, armR]) {
    tagAll(a, 'cloth', rig.gear!.skin);
    a.add(d(cyl(0.095, 0.11, 0.3, coat, 0, -0.13, 0, 8), 'leather'));
    a.add(d(cyl(0.11, 0.11, 0.06, fur, 0, -0.27, 0, 8), 'fur'));
  }
  // heavy-lidded, broken-nosed face; an old knife cut across the bald scalp
  scar(head, 0.05, 0.13, 0.16, 1.2);
  head.add(d(sphere(0.03, mat(0x7a5a4a), 0.01, -0.03, 0.215, 1.3, 0.9, 1, 1), 'skin'));
  // iron-bound coin chest at his feet (stands on the ground, does not bob)
  const chest = group(0.42, 0, 0.32,
    d(box(0.36, 0.22, 0.24, mat(0x4a3020), 0, 0.11, 0), 'wood'),
    d(rot(cyl(0.12, 0.12, 0.36, mat(0x4a3020), 0, 0.22, 0, 8), 0, 0, Math.PI / 2), 'wood'),
    d(box(0.38, 0.03, 0.26, iron, 0, 0.1, 0), 'iron'),
    d(box(0.03, 0.36, 0.26, iron, -0.12, 0.17, 0), 'iron'),
    d(box(0.03, 0.36, 0.26, iron, 0.12, 0.17, 0), 'iron'),
    box(0.05, 0.06, 0.02, brass, 0, 0.18, 0.125),
  );
  chest.rotation.y = -0.4;
  body.add(chest);
  // the ledger, thick and worn
  const ledger = group(0, 0.02, 0.12,
    d(box(0.24, 0.07, 0.32, mat(0x4a1e14), 0, 0, 0), 'leather'),
    d(box(0.22, 0.075, 0.3, mat(0xd8cca8), 0.012, 0, 0), 'bone'),
    box(0.03, 0.08, 0.06, brass, -0.11, 0, 0.1),
    box(0.03, 0.08, 0.06, brass, -0.11, 0, -0.1),
  );
  holdProp(rig, ledger);
  rig.restArm = -1.1;
  return finish(rig, 1.8);
}

// ------------------------------------------------------------------ Master Elias, the old veteran

function elias(): BipedRig {
  const rig = buildPlayerRig(ap({ skin: 4, hair: 'buzz', hairColor: 9, beard: 'stubble', build: 'average', eyes: 0, top: 4, bottom: 2 }));
  applyGear(rig, { weapon: null, shield: null, armor: 'chain_armor', head: null, legs: 'leather_legs', feet: 'leather_boots' });
  const { torso, head, armL } = rig;
  const leather = mat(0x3a2818);
  const iron = mat(0x48443e);
  const brass = mat(0x7a5a30);
  // crossed harness straps over the mail
  torso.add(d(rot(box(0.06, 0.7, 0.03, leather, 0, 0.28, 0.25), 0, 0, 0.6), 'leather'));
  torso.add(d(rot(box(0.06, 0.7, 0.03, leather, 0, 0.28, -0.25), 0, 0, 0.6), 'leather'));
  torso.add(d(rot(box(0.06, 0.7, 0.03, leather, 0, 0.28, 0.255), 0, 0, -0.6), 'leather'));
  torso.add(sphere(0.03, brass, 0, 0.3, 0.27, 1, 1, 0.5, 1));
  torso.add(d(box(0.54, 0.08, 0.5, leather, 0, 0.03, 0), 'leather'));
  pouch(torso, leather, 0.17, -0.05, 0.23);
  // one great dented pauldron on the left (shield) shoulder, chipped at the rim
  const pauld = group(0.3, 0.54, 0,
    d(sphere(0.145, iron, 0, 0, 0, 1.15, 0.55, 1.15, 2), 'iron'),
    d(sphere(0.13, iron, 0.02, -0.06, 0, 1.2, 0.45, 1.2, 1), 'steel'),
    d(sphere(0.115, iron, 0.03, -0.11, 0, 1.2, 0.4, 1.2, 1), 'iron'),
    d(rot(box(0.04, 0.16, 0.26, leather, -0.1, -0.02, 0), 0, 0, 0.5), 'leather'),
  );
  rivets(pauld, brass, [-0.06, 0.02, 0.08], 0.07, 0.1, 0.013);
  torso.add(pauld);
  armL.add(d(cyl(0.085, 0.075, 0.14, iron, 0, -0.3, 0, 8), 'iron')); // vambrace
  // battered round practice shield on his back
  const shield = group(0, 0.32, -0.3,
    d(rot(cyl(0.3, 0.3, 0.04, mat(0x5a4028), 0, 0, 0, 14), Math.PI / 2, 0, 0), 'wood'),
    d(rot(cyl(0.31, 0.31, 0.03, iron, 0, 0, -0.005, 14), Math.PI / 2, 0, 0), 'iron'),
    d(sphere(0.07, iron, 0, 0, -0.03, 1, 1, 0.6, 1), 'steel'),
  );
  torso.add(shield);
  // eye patch with its strap, scars, a hard old face
  head.add(box(0.08, 0.075, 0.02, mat(0x141010), -0.072, 0.025, 0.2));
  head.add(rot(box(0.03, 0.02, 0.44, mat(0x141010), 0, 0.08, 0.0), 0, 0, -0.35));
  head.children[head.children.length - 1].userData.face = true;
  head.children[head.children.length - 2].userData.face = true;
  scar(head, -0.072, 0.06, 0.24, 0.15);
  scar(head, 0.1, -0.08, 0.09, -0.6);
  // wooden practice blade with an iron guard, nicked from years of drills
  const sword = group(0, 0, 0,
    d(box(0.035, 0.24, 0.035, leather, 0, 0.0, 0.04), 'leather'),
    d(sphere(0.035, iron, 0, -0.13, 0.04, 1, 1, 1, 1), 'iron'),
    d(box(0.24, 0.04, 0.05, iron, 0, 0.14, 0.04), 'iron'),
    d(box(0.085, 0.82, 0.04, mat(0x6a5038), 0, 0.57, 0.04), 'wood'),
    d(cone(0.045, 0.1, mat(0x6a5038), 0, 1.03, 0.04, 4), 'wood'),
  );
  sword.rotation.x = 0.2;
  holdProp(rig, sword);
  rig.restArm = -0.2;
  return finish(rig, 1.8);
}

/** Bespoke painted-style models by NPC key (the Thornvale temple court sample). */
export const GRIM_NPCS: Record<string, () => BipedRig> = { aldric, brunhild, mirella, orwin, elias };

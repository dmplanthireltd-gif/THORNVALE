import * as THREE from 'three';
import { Rng } from '../../game/core/rng';
import type { Appearance, BodyType, Build } from '../../game/player/appearance';
import type { NpcDef } from '../../game/npc/npcs';
import { FERRIES, TOWNS, type StaffRole } from '../../game/world/townList';
import { applyGear, holdProp } from './humanoid';
import { box, collectMaterials, cone, cyl, group, mat, sphere, type Mat } from './parts';
import { buildPlayerRig } from './playerModel';
import type { BipedRig } from './rigs';
import { detail, type Detail } from './grimDetail';

/**
 * Painted style, owner 2026-10-23 ("change everything — work on the whole game"): every
 * NPC of every town gets a grim, worn model built on the player body (playerModel.ts, so
 * the same rig, animations and grim face) from a kit per ROLE (smith, magic seller,
 * outfitter, banker, ship captain, ferryman, cart master, soldier, official, priest,
 * scholar, hunter…) dressed in its town's CULTURE (northern furs, dwarven iron, elven
 * leaves, desert wraps, jungle feathers, coastal oilskins, the crown city's dark velvet).
 * Quest givers and every NPC with a unique role get bespoke details on top.
 *
 * Read from the top-down camera first: each role has its own silhouette — smiths a huge
 * hammer and bare black arms, magic sellers a peaked hood or hat over a floor-length robe
 * and a glowing staff, outfitters a quiver bristling with fletchings and a bedroll,
 * bankers a fur-collared long coat and a strongbox at their feet, captains a wide hat,
 * ferrymen a hooded oilskin and a long oar, soldiers a cloak and a polearm.
 *
 * Surfaces come from the painted detail atlas (grimDetail.ts, tags via `detail`), so the
 * whole model still merges into one mesh per joint group (rigMerge.ts). Only used in the
 * painted style (grimNpcs.ts GRIM_NPCS → rigs.ts buildNpc); NPC keys and dialogue are
 * untouched.
 */

// ------------------------------------------------------------------ small helpers (shared with grimNpcs.ts)

export const d = <T extends THREE.Object3D>(o: T, k: Detail): T => detail(o, k);
export const rot = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.rotation.set(x, y, z); return o; };

/** A ragged cloak hanging from the shoulders: strips of uneven length; returns the swinging pivot. */
export function tornCloak(torso: THREE.Group, color: number, width: number, len: number, z: number, k: Detail, seed: number, folds = true): THREE.Group {
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
  if (folds) torso.add(d(sphere(0.2, m, 0, 0.5, z + 0.08, 1.5, 0.45, 0.8, 2), k));
  return pivot;
}

/** A row of rivets along x at height y on the given face (z). */
export function rivets(parent: THREE.Object3D, m: Mat, xs: number[], y: number, z: number, r = 0.016): void {
  for (const x of xs) parent.add(sphere(r, m, x, y, z, 1, 1, 0.6, 0));
}

/** Thin scar on the face (head space). */
export function scar(head: THREE.Group, x: number, y: number, len: number, angle: number, color = 0xb8706a): void {
  const s = box(0.014, len, 0.012, mat(color), x, y, 0.205);
  s.rotation.z = angle;
  s.userData.face = true;
  head.add(s);
}

export function pouch(parent: THREE.Object3D, leather: Mat, x: number, y: number, z: number, w = 0.09): void {
  parent.add(d(box(w, w * 1.1, 0.07, leather, x, y, z), 'leather'));
  parent.add(d(box(w * 1.05, w * 0.35, 0.075, leather, x, y + w * 0.4, z + 0.003), 'leather'));
}

export function finish(rig: BipedRig, height: number): BipedRig {
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

export const ap = (a: Partial<Appearance>): Appearance => ({
  body: 'male', skin: 2, hair: 'short', hairColor: 1, beard: 'none', build: 'average', eyes: 0, top: 3, bottom: 3, ...a,
} as Appearance);

/** Tags every remaining plain part of a group (sleeves, trousers) with one surface. */
export function tagAll(g: THREE.Object3D, k: Detail, skip?: Mat): void {
  for (const c of g.children) if ((c as THREE.Mesh).isMesh && (c as THREE.Mesh).material !== skip) c.userData.detail = k;
}

const meshes = (g: THREE.Object3D) => g.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];

// ------------------------------------------------------------------ who is who

export type Culture = 'temperate' | 'north' | 'dwarf' | 'elf' | 'desert' | 'jungle' | 'coast' | 'crown';
type Role = StaffRole | 'ferry' | 'carter' | 'special';

const TOWN_CULTURE: Record<string, Culture> = {
  thornvale: 'temperate', westmarch: 'temperate', highmoor: 'temperate', millbrook: 'temperate', briarwatch: 'temperate',
  elderglen: 'elf', stonedeep: 'dwarf', valdrheim: 'north', aurelion: 'crown', corvane: 'coast', saltmere: 'coast',
  palmreach: 'jungle', sunspire: 'desert', dunewatch: 'desert', isle: 'coast',
};

/** Town colours (dyed cloth: main, dark) — muted further by paintRig. */
const TOWN_COLOR: Record<string, [number, number]> = {
  thornvale: [0x8a2a20, 0x4a1810], westmarch: [0x3e5a80, 0x22304a], highmoor: [0x6a7a3a, 0x3a4220], millbrook: [0xa88030, 0x5a4418],
  briarwatch: [0x46703e, 0x243a20], elderglen: [0x5a8a3a, 0x30482a], stonedeep: [0xa0501e, 0x5a2a10], valdrheim: [0x5a7290, 0x2e3a4a],
  aurelion: [0x6a3a72, 0x341c3a], corvane: [0x2e7a74, 0x183e3c], saltmere: [0x5a6a7a, 0x2e3640], palmreach: [0x5a8a3a, 0x2e4a1e],
  sunspire: [0xc08a30, 0x6a4818], dunewatch: [0xa85a2a, 0x5a3016], isle: [0x6a8080, 0x384646],
};

/** Ferry boatmen (FERRIES) sail from a home town but live on their islands: their own look. */
const FERRY_CULTURE: Record<string, Culture> = {
  ferry_frostholm: 'north', ferry_jotun: 'north', ferry_dunes: 'desert', ferry_cinder: 'coast', ferry_bonecrag: 'coast', ferry_gull: 'coast',
  ferry_fernwick: 'temperate', ferry_cyclops: 'temperate',
};

const FEMALE = new Set([
  'brunhild', 'mirella', 'mara', 'zuri', 'westmarch_smith', 'westmarch_trainer', 'elderglen_mage', 'elderglen_outfit', 'stonedeep_mage',
  'highmoor_smith', 'highmoor_reeve', 'millbrook_mage', 'millbrook_bank', 'millbrook_captain', 'valdrheim_smith', 'valdrheim_outfit',
  'aurelion_bank', 'aurelion_magistrate', 'briarwatch_smith', 'briarwatch_captain', 'briarwatch_ranger', 'corvane_smith', 'corvane_mage',
  'corvane_outfit', 'corvane_reeve', 'saltmere_mage', 'saltmere_bank', 'palmreach_mage', 'sunspire_mage', 'sunspire_vizier', 'dunewatch_mage',
  'dunewatch_bank', 'dunewatch_sergeant', 'ferry_fernwick', 'isle_guide', 'pearl_diver',
]);

const OLD = new Set(['tomas', 'millbrook_elder', 'millbrook_mage', 'saltmere_abbot', 'westmarch_mage', 'aurelion_trainer', 'highmoor_reeve', 'stonedeep_bank', 'valdrheim_mage', 'ferry_cyclops', 'elderglen_bank']);

interface Who { town: string; role: Role; culture: Culture }
function whoIs(def: NpcDef): Who {
  for (const t of TOWNS) {
    for (const [role, s] of Object.entries(t.staff) as Array<[StaffRole, { key: string }]>) {
      if (s?.key !== def.key) continue;
      const r: Role = role === 'travel' && t.travel === 'cart' ? 'carter' : role;
      return { town: t.key, role: r, culture: TOWN_CULTURE[t.key] ?? 'temperate' };
    }
  }
  const f = FERRIES.find((x) => x.npc.key === def.key);
  if (f) return { town: f.home, role: 'ferry', culture: FERRY_CULTURE[def.key] ?? TOWN_CULTURE[f.home] ?? 'coast' };
  if (def.key === 'isle_captain') return { town: 'isle', role: 'travel', culture: 'coast' };
  return { town: 'isle', role: 'special', culture: 'coast' };
}

const blendHex = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
const hashKey = (k: string) => [...k].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

// ------------------------------------------------------------------ the kit

/** Materials of one NPC: their town's cloth plus worn leather, iron, fur and dulled brass. */
interface Tone {
  cloth: Mat; dark: Mat; leather: Mat; leatherDark: Mat; iron: Mat; steel: Mat; brass: Mat; fur: Mat; bone: Mat; wood: Mat; rope: Mat;
  main: number; darkHex: number;
}

export interface Kit {
  def: NpcDef; who: Who; r: Rng; rig: BipedRig; female: boolean; old: boolean;
  t: Tone; skin: Mat; skinHex: number;
  torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; body: THREE.Group;
  /** Height for the name plate (before the 1.3 NPC scale). */
  height: number;
}

const SKINS: Record<Culture, number[]> = {
  temperate: [0, 1, 2, 2, 3, 4], north: [0, 0, 1, 1], dwarf: [1, 2, 3], elf: [0, 1, 1, 2, 3], desert: [4, 5, 5, 6, 7], jungle: [5, 6, 7, 7], coast: [1, 2, 3, 4], crown: [0, 1, 2, 3, 5],
};
const HAIRC: Record<Culture, number[]> = {
  temperate: [0, 1, 2, 3, 4, 7], north: [6, 7, 8, 5, 4], dwarf: [3, 4, 5, 1, 9], elf: [6, 8, 4, 2, 0], desert: [0, 0, 1], jungle: [0, 0, 1], coast: [1, 2, 3, 7], crown: [0, 1, 6, 8, 3],
};

function looks(def: NpcDef, who: Who, r: Rng): Appearance {
  const female = FEMALE.has(def.key);
  const old = OLD.has(def.key);
  const c = who.culture;
  const hairsM = c === 'north' ? ['long', 'braids', 'topknot', 'swept'] : c === 'dwarf' ? ['bald', 'buzz', 'short', 'long'] : c === 'jungle' ? ['buzz', 'curly', 'topknot', 'bald'] : ['short', 'swept', 'buzz', 'curly', 'long', 'bald', 'ponytail'];
  const hairsF = c === 'north' || c === 'dwarf' ? ['braids', 'long', 'bun'] : c === 'jungle' ? ['curly', 'braids', 'bun'] : ['long', 'bun', 'braids', 'ponytail', 'bob', 'curly'];
  const beards = c === 'dwarf' ? ['full'] : c === 'north' ? ['full', 'short', 'full'] : ['none', 'stubble', 'short', 'full', 'moustache', 'goatee', 'stubble'];
  const builds: Build[] = c === 'dwarf' || c === 'north' ? ['broad', 'broad', 'average'] : c === 'elf' ? ['slim', 'slim', 'average'] : ['slim', 'average', 'average', 'broad'];
  return {
    body: (female ? 'female' : 'male') as BodyType,
    skin: r.pick(SKINS[c]),
    hair: female ? r.pick(hairsF) : r.pick(hairsM),
    hairColor: old ? 9 : r.pick(HAIRC[c]),
    beard: female ? 'none' : r.pick(beards),
    build: r.pick(builds),
    eyes: r.int(0, 5),
    top: 3, bottom: r.pick([2, 3, 13]),
  };
}

function tone(who: Who, r: Rng): Tone {
  const [main, dk] = TOWN_COLOR[who.town] ?? TOWN_COLOR.thornvale;
  const vary = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
  const v = 0.85 + r.next() * 0.3;
  const leatherHex = who.culture === 'desert' ? 0x8a6038 : who.culture === 'elf' ? 0x6a5230 : who.culture === 'crown' ? 0x4a3226 : 0x5e4028;
  return {
    main: vary(main, v), darkHex: vary(dk, v),
    cloth: mat(vary(main, v)), dark: mat(vary(dk, v)),
    leather: mat(leatherHex), leatherDark: mat(0x3a281a),
    iron: mat(who.culture === 'dwarf' ? 0x4a4038 : 0x44423e), steel: mat(0x6a6a68), brass: mat(0x7a6034),
    fur: mat(who.culture === 'north' ? 0x8a8070 : 0x7a6650), bone: mat(0xc4b89a), wood: mat(0x4a3420), rope: mat(0x6a5a3a),
  };
}

function startKit(def: NpcDef, apOverride?: Partial<Appearance>): Kit {
  const who = whoIs(def);
  const r = new Rng(hashKey(def.key));
  const a = { ...looks(def, who, r), ...apOverride };
  const rig = buildPlayerRig(a);
  const female = a.body === 'female';
  const k: Kit = {
    def, who, r, rig, female, old: OLD.has(def.key), t: tone(who, r), skin: rig.gear!.skin, skinHex: rig.gear!.skin.color.getHex(),
    torso: rig.torso, head: rig.head, armL: rig.armL, armR: rig.armR, legL: rig.legL, legR: rig.legR, body: rig.body, height: female ? 1.75 : 1.82,
  };
  tagAll(k.torso, 'cloth', k.skin);
  for (const a2 of [k.armL, k.armR]) tagAll(a2, 'cloth', k.skin);
  for (const l of [k.legL, k.legR]) tagAll(l, 'cloth');
  // the boots and bracers keep their leather
  for (const l of [k.legL, k.legR]) for (const m of meshes(l)) if (m.position.y < -0.4) m.userData.detail = 'leather';
  if (who.culture === 'dwarf') dwarf(k);
  if (who.culture === 'elf') elfEars(k);
  return k;
}

// ------------------------------------------------------------------ body tweaks per culture

/** Dwarves: short, wide, long beards (men) and thick braids. */
function dwarf(k: Kit): void {
  k.body.scale.set(k.body.scale.x * 1.14, k.body.scale.y * 0.8, k.body.scale.z * 1.12);
  k.head.scale.multiplyScalar(1.12);
  k.height = 1.5;
  if (!k.female) longBeard(k, k.r.chance(0.5));
}

/** A long beard down the chest, braided or forked, bound with iron rings. */
export function longBeard(k: Kit, forked: boolean, color?: number): void {
  const hair = (k.head.children.find((c) => c.userData.cover === 'beard') as THREE.Mesh | undefined)?.material as Mat | undefined;
  const m = color !== undefined ? mat(color) : hair ?? mat(0x5a3a22);
  const ring = k.t.iron;
  const add = (o: THREE.Object3D) => { o.userData.cover = 'beard'; k.head.add(d(o, 'hair')); };
  add(box(0.3, 0.2, 0.14, m, 0, -0.17, 0.11));
  if (forked) {
    for (const s of [-1, 1]) {
      add(rot(cone(0.06, 0.32, m, s * 0.06, -0.4, 0.13, 5), Math.PI, 0, -s * 0.12));
      const b = cyl(0.04, 0.04, 0.04, ring, s * 0.065, -0.36, 0.13, 6); b.userData.cover = 'beard'; k.head.add(d(b, 'iron'));
    }
  } else {
    add(rot(cone(0.11, 0.42, m, 0, -0.45, 0.13, 6), Math.PI, 0, 0));
    for (const y of [-0.34, -0.48]) { const b = cyl(0.05 - (y + 0.34) * -0.12, 0.05, 0.035, ring, 0, y, 0.13, 6); b.userData.cover = 'beard'; k.head.add(d(b, 'iron')); }
  }
}

function elfEars(k: Kit): void {
  for (const s of [-1, 1]) {
    const e = rot(cone(0.035, 0.16, k.skin, s * 0.22, 0.06, -0.02, 4), 0, 0, -s * 1.15);
    e.userData.face = true; // pointed ears show under hoods and helmets (face parts are never hidden)
    k.head.add(d(e, 'skin'));
  }
}

/** Hides hair on the crown (under hats and hoods); `all` also hides long hair at the back. */
function hideHair(k: Kit, all = false): void {
  for (const c of k.head.children) if (c.userData.cover === 'top' || (all && c.userData.cover === 'back')) c.visible = false;
}

/** Hides the legs except the feet (under robes). */
function hideLegs(k: Kit): void {
  for (const l of [k.legL, k.legR]) for (const c of l.children) c.visible = (c as THREE.Mesh).position.y < -0.5;
}

/** Bare arms: the sleeves become skin; `soot` blackens them (smiths). */
function bareArms(k: Kit, surface: Detail): void {
  for (const a of [k.armL, k.armR]) {
    const kids = meshes(a);
    kids[0].material = k.skin; kids[0].userData.detail = surface;
    kids[1].visible = false;
    for (const m of kids.slice(2)) if (m.material === k.skin) m.userData.detail = surface;
  }
}

// ------------------------------------------------------------------ clothing pieces

function robe(k: Kit, m: Mat, s: Detail, wBot = 0.4, len = 0.78): void {
  k.torso.add(d(cyl(0.25, wBot, len, m, 0, 0.09 - len / 2, 0, 12), s));
  hideLegs(k);
}

/** Coat skirts from the waist to the knees, split at the front. */
function coatSkirt(k: Kit, m: Mat, s: Detail, len = 0.46, wBot = 0.38): void {
  k.torso.add(d(cyl(0.28, wBot, len, m, 0, 0.04 - len / 2, -0.01, 10), s));
  k.torso.add(d(box(0.05, len * 0.95, 0.06, k.t.leatherDark, 0, 0.03 - len / 2, wBot * 0.82), 'leather'));
}

function sleeves(k: Kit, m: Mat, s: Detail, wide = false): void {
  for (const a of [k.armL, k.armR]) {
    tagAll(a, s, k.skin);
    a.add(d(cyl(wide ? 0.1 : 0.09, wide ? 0.15 : 0.1, wide ? 0.2 : 0.28, m, 0, wide ? -0.22 : -0.14, 0, 8), s));
  }
}

/** A collar or mantle over the shoulders (fur, cloth, leaves). */
function mantle(k: Kit, m: Mat, s: Detail, r = 0.25, y = 0.52, flat = 0.4): void {
  k.torso.add(d(sphere(r, m, 0, y, 0, 1.18, flat, 1.0, 2), s));
}

function belt(k: Kit, m: Mat = k.t.leather, y = 0.04, w = 0.5): void {
  k.torso.add(d(box(w, 0.07, 0.38, m, 0, y, 0), 'leather'));
  k.torso.add(box(0.06, 0.05, 0.02, k.t.brass, 0, y, 0.2));
}

function apron(k: Kit, m: Mat, s: Detail, len = 0.9): void {
  k.torso.add(d(box(0.4, len, 0.03, m, 0, 0.55 - len / 2, 0.18), s));
  for (const sd of [-1, 1]) k.torso.add(d(rot(box(0.035, 0.2, 0.035, k.t.leatherDark, sd * 0.12, 0.6, 0.12), 0.6, 0, -sd * 0.3), 'leather'));
}

function tabard(k: Kit, m: Mat, s: Detail, z = 0.2, len = 0.62): void {
  for (const zz of [z, -z]) k.torso.add(d(box(0.3, len, 0.025, m, 0, 0.51 - len / 2, zz), s));
}

/** The crest of the realm (a diamond) on the chest. */
function crest(k: Kit, m: Mat, z: number, y = 0.36, size = 0.1): void {
  k.torso.add(d(rot(box(size, size, 0.02, m, 0, y, z), 0, 0, Math.PI / 4), 'iron'));
}

function hood(k: Kit, m: Mat, peaked: boolean, shadow = true, s: Detail = 'cloth'): void {
  hideHair(k, true);
  k.head.add(d(sphere(0.25, m, 0, 0.06, -0.1, 1, 1.05, 1.0, 2), s));
  if (peaked) k.head.add(d(rot(cone(0.16, 0.34, m, 0, 0.24, -0.2, 8), -0.7, 0, 0), s));
  for (const sd of [-1, 1]) k.head.add(d(rot(box(0.05, 0.36, 0.2, m, sd * 0.2, -0.02, 0.02), 0, 0, sd * 0.12), s));
  k.head.add(d(box(0.4, 0.06, 0.12, m, 0, 0.2, 0.1), s));
  if (shadow) k.head.add(d(sphere(0.2, mat(0x120a10), 0, 0.03, -0.09, 1.05, 1.05, 1.0, 1), 'plain'));
}

/** A hood thrown back: a thick roll of cloth at the nape. */
function hoodDown(k: Kit, m: Mat, s: Detail): void {
  k.torso.add(d(sphere(0.17, m, 0, 0.56, -0.13, 1.2, 0.6, 0.8, 1), s));
}

function wideHat(k: Kit, m: Mat, brim = 0.3, crownH = 0.16, band?: Mat, plume?: number): void {
  hideHair(k);
  // tipped back so the face shows under the brim from the high game camera
  const h = group(0, 0.13, -0.03);
  h.rotation.x = -0.32;
  h.add(d(cyl(brim, brim, 0.025, m, 0, 0, 0, 14), 'leather'));
  h.add(d(cyl(0.17, 0.2, crownH, m, 0, crownH / 2, 0, 10), 'leather'));
  if (band) h.add(d(cyl(0.205, 0.205, 0.035, band, 0, 0.03, 0, 10), 'cloth'));
  if (plume !== undefined) {
    const f = d(sphere(0.05, mat(plume), 0.12, crownH + 0.02, -0.1, 0.6, 0.5, 3.2, 1), 'cloth');
    f.rotation.y = 0.5;
    h.add(f);
  }
  k.head.add(h);
}

function furHat(k: Kit, m: Mat): void {
  hideHair(k);
  k.head.add(d(cyl(0.24, 0.24, 0.13, m, 0, 0.17, -0.02, 10), 'fur'));
  k.head.add(d(sphere(0.2, m, 0, 0.22, -0.02, 1, 0.55, 1, 1), 'fur'));
}

function skullcap(k: Kit, m: Mat, s: Detail = 'leather'): void {
  hideHair(k);
  k.head.add(d(sphere(0.225, m, 0, 0.07, -0.02, 1, 0.82, 1.04, 2), s));
}

/** Desert head wrap with a tail down the back; `veil` covers the mouth and nose. */
function turban(k: Kit, m: Mat, veil: boolean, tall = false): void {
  hideHair(k, true);
  k.head.add(d(sphere(0.235, m, 0, 0.1, -0.02, 1.04, tall ? 1.05 : 0.8, 1.06, 2), 'cloth'));
  for (let i = 0; i < 3; i++) k.head.add(d(rot(cyl(0.235 - i * 0.03, 0.24 - i * 0.03, 0.05, m, 0, 0.12 + i * 0.06, -0.02, 10), 0.15 - i * 0.1, 0, 0), 'cloth'));
  if (tall) k.head.add(d(cyl(0.12, 0.17, 0.18, m, 0, 0.32, -0.03, 8), 'cloth'));
  k.head.add(d(box(0.12, 0.42, 0.03, m, 0.05, -0.12, -0.21), 'cloth'));
  if (veil) {
    const v = d(box(0.36, 0.17, 0.05, m, 0, -0.09, 0.19), 'cloth');
    v.userData.cover = 'beard';
    k.head.add(v);
  }
}

function sowester(k: Kit, m: Mat): void {
  hideHair(k);
  k.head.add(d(sphere(0.225, m, 0, 0.08, -0.02, 1, 0.8, 1.04, 2), 'leather'));
  const brim = d(cyl(0.3, 0.3, 0.02, m, 0, 0.1, -0.06, 14), 'leather');
  brim.rotation.x = -0.25;
  k.head.add(brim);
}

/** Layered leaves: a mantle and a hood rim of overlapping green-brown leaf blades (elves). */
function leafCloak(k: Kit, a: number, b: number, len = 0.8): THREE.Group {
  const r = new Rng(hashKey(k.def.key) + 5);
  const ma = mat(a), mb = mat(b);
  const pivot = group(0, 0.53, -0.2);
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.1 + (row % 2) * 0.05;
      const y = -0.08 - row * (len / 4.4);
      const leaf = d(sphere(0.085, (i + row) % 2 ? ma : mb, x, y, -0.02 - row * 0.012, 0.7, 1.6, 0.18, 1), 'cloth');
      leaf.rotation.z = (r.next() - 0.5) * 0.6;
      pivot.add(leaf);
    }
  }
  pivot.rotation.x = 0.12;
  k.torso.add(pivot);
  for (let i = 0; i < 9; i++) {
    const ang = -1.4 + i * 0.35;
    const leaf = d(sphere(0.075, i % 2 ? ma : mb, Math.sin(ang) * 0.26, 0.52, Math.cos(ang) * -0.12, 0.8, 0.35, 1.5, 1), 'cloth');
    leaf.rotation.y = ang;
    k.torso.add(leaf);
  }
  return pivot;
}

/** An oilskin coat: dark, slick, knee-long, with a wide collar. */
function oilskin(k: Kit, color = 0x3a3e2a): Mat {
  const m = mat(color);
  k.torso.add(d(cyl(0.27, 0.3, 0.55, m, 0, 0.27, 0, 10), 'leather'));
  coatSkirt(k, m, 'leather', 0.5, 0.4);
  sleeves(k, m, 'leather');
  mantle(k, m, 'leather', 0.23, 0.53, 0.35);
  return m;
}

function furCape(k: Kit, len = 0.8): THREE.Group {
  const pivot = tornCloak(k.torso, 0x5a5048, 0.58, len, -0.22, 'fur', hashKey(k.def.key) + 3, false);
  mantle(k, k.t.fur, 'fur', 0.26, 0.52, 0.48);
  return pivot;
}

/** A chain of office over the shoulders with a medallion on the chest. */
function chainOfOffice(k: Kit, z = 0.17): void {
  for (let i = 0; i < 11; i++) {
    const a = -1.3 + i * 0.26;
    k.torso.add(d(sphere(0.022, k.t.brass, Math.sin(a) * 0.2, 0.47 - Math.cos(a) * 0.06 + (Math.abs(a) > 0.9 ? 0.04 : 0), Math.cos(a) * z + 0.01, 1, 1, 0.7, 0), 'steel'));
  }
  k.torso.add(d(cyl(0.05, 0.05, 0.02, k.t.brass, 0, 0.36, z + 0.02, 10).rotateX(Math.PI / 2), 'steel'));
}

function armRing(a: THREE.Group, m: Mat, y = -0.2): void {
  a.add(d(cyl(0.075, 0.075, 0.035, m, 0, y, 0, 8), 'iron'));
}

function quiver(k: Kit, fletch = 0xb8b0a0): void {
  const q = group(0.08, 0.32, -0.2,
    d(cyl(0.055, 0.05, 0.46, k.t.leather, 0, 0, 0, 8), 'leather'),
    d(cyl(0.06, 0.06, 0.04, k.t.leatherDark, 0, 0.22, 0, 8), 'leather'),
  );
  const fm = mat(fletch);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    q.add(d(box(0.012, 0.12, 0.012, k.t.wood, Math.cos(a) * 0.028, 0.29, Math.sin(a) * 0.028), 'wood'));
    q.add(d(box(0.03, 0.06, 0.006, fm, Math.cos(a) * 0.028, 0.33, Math.sin(a) * 0.028), 'plain'));
  }
  q.rotation.z = -0.4;
  k.torso.add(q);
}

function bedroll(k: Kit, m: Mat): void {
  k.torso.add(d(rot(cyl(0.07, 0.07, 0.42, m, 0, 0.55, -0.2, 8), 0, 0, Math.PI / 2), 'cloth'));
  for (const s of [-1, 1]) k.torso.add(d(rot(cyl(0.074, 0.074, 0.025, k.t.leatherDark, s * 0.12, 0.55, -0.2, 8), 0, 0, Math.PI / 2), 'leather'));
}

function ropeCoil(k: Kit, side = 1): void {
  const c = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 5, 12), k.t.rope);
  c.position.set(side * 0.08, 0.32, 0.03);
  c.rotation.set(0.1, 0, side * 0.75);
  c.scale.set(1, 1.15, 1.6);
  k.torso.add(d(c, 'leather'));
}

function lantern(parent: THREE.Object3D, k: Kit, x: number, y: number, z: number, glow = 0xffb24a): void {
  const g = mat(glow, { emissive: glow });
  parent.add(group(x, y, z,
    d(box(0.08, 0.1, 0.08, k.t.iron, 0, 0, 0), 'iron'),
    sphere(0.035, g, 0, 0, 0, 1, 1.2, 1, 1),
    d(cone(0.06, 0.05, k.t.iron, 0, 0.075, 0, 4), 'iron'),
    d(box(0.01, 0.06, 0.01, k.t.iron, 0, 0.12, 0), 'iron'),
  ));
}

function strongbox(k: Kit, x: number, z: number, w = 0.32): void {
  const wood = mat(0x3e2a1a);
  const c = group(x, 0, z,
    d(box(w, 0.2, w * 0.7, wood, 0, 0.1, 0), 'wood'),
    d(box(w + 0.02, 0.06, w * 0.7 + 0.02, k.t.iron, 0, 0.22, 0), 'iron'),
    d(box(0.03, 0.22, w * 0.7 + 0.02, k.t.iron, -w * 0.33, 0.11, 0), 'iron'),
    d(box(0.03, 0.22, w * 0.7 + 0.02, k.t.iron, w * 0.33, 0.11, 0), 'iron'),
    box(0.05, 0.06, 0.02, k.t.brass, 0, 0.16, w * 0.35 + 0.01),
  );
  c.rotation.y = -0.4;
  k.body.add(c);
}

function vials(k: Kit, colors: number[]): void {
  colors.forEach((c, i) => {
    const x = -0.18 + i * 0.07;
    k.torso.add(d(box(0.035, 0.07, 0.035, mat(c, { emissive: new THREE.Color(c).multiplyScalar(0.25).getHex() }), x, -0.04, 0.2), 'plain'));
    k.torso.add(d(box(0.02, 0.02, 0.02, k.t.leatherDark, x, 0.005, 0.2), 'leather'));
  });
}

function scrollCase(k: Kit): void {
  k.torso.add(d(rot(cyl(0.035, 0.035, 0.36, k.t.leather, 0.18, 0.3, -0.18, 6), 0, 0, 0.5), 'leather'));
}

/** Teeth, claws or charms on a cord round the neck. */
function charms(k: Kit, m: Mat, n = 7, big = 0.06, z = 0.18): void {
  for (let i = 0; i < n; i++) {
    const a = -0.6 + i * (1.2 / (n - 1));
    k.torso.add(d(rot(cone(big * 0.3, big, m, Math.sin(a) * 0.15, 0.47 - Math.cos(a) * 0.06, z, 4), Math.PI, 0, 0), 'bone'));
  }
}

function feathers(k: Kit, colors: number[], y = 0.18, z = -0.12): void {
  colors.forEach((c, i) => {
    const f = d(sphere(0.04, mat(c), (i - (colors.length - 1) / 2) * 0.06, y + 0.12, z, 0.5, 2.6, 0.2, 1), 'cloth');
    f.rotation.z = (i - (colors.length - 1) / 2) * 0.3;
    k.head.add(f);
  });
}

function goggles(k: Kit): void {
  for (const s of [-1, 1]) k.head.add(d(cyl(0.045, 0.045, 0.04, k.t.brass, s * 0.075, 0.13, 0.17, 8).rotateX(1.2), 'steel'));
  k.head.add(d(cyl(0.215, 0.215, 0.03, k.t.leatherDark, 0, 0.12, -0.01, 12), 'leather'));
}

function spectacles(k: Kit): void {
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.007, 4, 10), k.t.brass);
    ring.position.set(s * 0.07, 0.025, 0.205);
    ring.userData.face = true;
    k.head.add(ring);
  }
}

function eyePatch(k: Kit, side = 1): void {
  const p = box(0.08, 0.075, 0.02, mat(0x141010), side * 0.072, 0.025, 0.205);
  p.userData.face = true;
  const st = rot(box(0.03, 0.02, 0.44, mat(0x141010), 0, 0.08, 0.0), 0, 0, -0.35 * side);
  st.userData.face = true;
  k.head.add(p, st);
}

/** Painted marks on face and arms (jungle). */
function warPaint(k: Kit, color: number): void {
  const m = mat(color);
  for (const s of [-1, 1]) {
    const b = box(0.05, 0.014, 0.012, m, s * 0.1, -0.045, 0.2);
    b.rotation.z = s * 0.4;
    b.userData.face = true;
    k.head.add(b);
    for (const a of [k.armL, k.armR]) a.add(box(0.11, 0.015, 0.11, m, 0, -0.1 - (s + 1) * 0.03, 0));
  }
}

// ------------------------------------------------------------------ props (held, built along +y)

function hammerProp(k: Kit, big = 1, rune = false): THREE.Group {
  const head = k.who.culture === 'dwarf' ? mat(0x3a3430) : k.t.iron;
  const g = group(0, 0, 0,
    d(cyl(0.026, 0.032, 0.9 * big, k.t.wood, 0, 0.3 * big, 0.04, 6), 'wood'),
    d(box(0.06, 0.16, 0.06, k.t.leatherDark, 0, -0.06, 0.04), 'leather'),
    d(box(0.27 * big, 0.15 * big, 0.15 * big, head, 0, 0.78 * big, 0.04), 'iron'),
    d(box(0.045, 0.18 * big, 0.18 * big, k.t.steel, 0.15 * big, 0.78 * big, 0.04), 'steel'),
    d(box(0.06, 0.08, 0.13 * big, k.t.steel, -0.17 * big, 0.78 * big, 0.04), 'steel'),
  );
  if (rune) g.add(box(0.12, 0.02, 0.005, mat(0xffa040, { emissive: 0xc05010 }), 0, 0.78 * big, 0.04 + 0.077 * big));
  g.rotation.x = 0.15;
  return g;
}

function staffProp(k: Kit, glow: number, top: 'orb' | 'crook' | 'antler' | 'skull' | 'sun' | 'crystal' | 'ring' = 'orb'): THREE.Group {
  const gm = mat(glow, { emissive: new THREE.Color(glow).multiplyScalar(0.55).getHex() });
  const w = k.who.culture === 'elf' ? mat(0x5a4a2a) : k.t.wood;
  const g = group(0, 0, 0,
    d(rot(cyl(0.024, 0.032, 1.3, w, 0, 0.3, 0.04, 6), 0, 0, 0.03), 'wood'),
    d(cyl(0.035, 0.035, 0.08, k.t.leatherDark, 0, 0.05, 0.04, 6), 'leather'),
  );
  if (top === 'orb') {
    for (let i = 0; i < 3; i++) g.add(d(rot(cyl(0.012, 0.016, 0.2, w, Math.cos(i * 2.1) * 0.05, 1.02, 0.04 + Math.sin(i * 2.1) * 0.05, 5), Math.sin(i * 2.1) * 0.3, 0, -Math.cos(i * 2.1) * 0.3), 'wood'));
    g.add(sphere(0.065, gm, 0, 1.08, 0.04, 1, 1, 1, 2));
  } else if (top === 'crystal') {
    g.add(d(cyl(0.05, 0.03, 0.06, k.t.brass, 0, 0.98, 0.04, 6), 'steel'));
    g.add(rot(cone(0.05, 0.22, gm, 0, 1.12, 0.04, 5), 0, 0, 0));
    g.add(rot(cone(0.05, 0.08, gm, 0, 0.99, 0.04, 5), Math.PI, 0, 0));
  } else if (top === 'antler') {
    for (const s of [-1, 1]) {
      g.add(d(rot(cyl(0.012, 0.018, 0.26, k.t.bone, s * 0.07, 1.05, 0.04, 5), 0, 0, -s * 0.5), 'bone'));
      g.add(d(rot(cyl(0.01, 0.012, 0.12, k.t.bone, s * 0.06, 1.12, 0.04, 5), 0, 0, s * 0.3), 'bone'));
    }
    g.add(sphere(0.045, gm, 0, 1.0, 0.04, 1, 1, 1, 1));
  } else if (top === 'skull') {
    g.add(d(sphere(0.07, k.t.bone, 0.01, 1.02, 0.05, 1, 1.1, 0.95, 1), 'bone'));
    g.add(sphere(0.018, gm, 0.035, 1.03, 0.11, 1, 1, 1, 0), sphere(0.018, gm, -0.01, 1.03, 0.11, 1, 1, 1, 0));
  } else if (top === 'sun') {
    g.add(d(cyl(0.12, 0.12, 0.02, k.t.brass, 0, 1.05, 0.04, 14).rotateX(Math.PI / 2), 'steel'));
    g.add(sphere(0.05, gm, 0, 1.05, 0.06, 1, 1, 0.5, 1));
    for (let i = 0; i < 8; i++) g.add(d(rot(cone(0.02, 0.07, k.t.brass, Math.cos(i * 0.785) * 0.15, 1.05 + Math.sin(i * 0.785) * 0.15, 0.04, 3), 0, 0, i * 0.785 - Math.PI / 2), 'steel'));
  } else if (top === 'ring') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 5, 14), k.t.iron);
    ring.position.set(0, 1.05, 0.04);
    g.add(d(ring, 'iron'));
    for (let i = 0; i < 3; i++) g.add(d(cyl(0.025, 0.025, 0.02, k.t.iron, Math.cos(i * 2) * 0.09, 1.05 + Math.sin(i * 2) * 0.09, 0.06, 6).rotateX(Math.PI / 2), 'iron'));
  } else {
    // crook: a shepherd's hook
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 5, 10, Math.PI * 1.3), w);
    hook.position.set(-0.08, 0.98, 0.04);
    g.add(d(hook, 'wood'));
  }
  return g;
}

function bowProp(k: Kit, recurve = false): THREE.Group {
  const w = recurve ? mat(0x3a2414) : k.t.wood;
  const g = group(0, 0.15, 0.06);
  for (const s of [-1, 1]) {
    g.add(d(rot(cyl(0.022, 0.032, 0.45, w, 0, s * 0.22, -0.06, 5), s * 0.28, 0, 0), 'wood'));
    if (recurve) g.add(d(rot(cyl(0.012, 0.016, 0.12, w, 0, s * 0.47, -0.04, 5), -s * 0.5, 0, 0), 'wood'));
  }
  g.add(d(cyl(0.028, 0.028, 0.1, k.t.leatherDark, 0, 0, 0, 6), 'leather'));
  g.add(box(0.006, 0.95, 0.006, mat(0xa09a88), 0, 0, -0.16));
  return g;
}

function ledgerProp(k: Kit, color = 0x4a1e14): THREE.Group {
  return group(0, 0.02, 0.12,
    d(box(0.24, 0.07, 0.32, mat(color), 0, 0, 0), 'leather'),
    d(box(0.22, 0.075, 0.3, mat(0xd8cca8), 0.012, 0, 0), 'bone'),
    box(0.03, 0.08, 0.06, k.t.brass, -0.11, 0, 0.1),
    box(0.03, 0.08, 0.06, k.t.brass, -0.11, 0, -0.1),
  );
}

function bookProp(k: Kit, color = 0x3a1a14): THREE.Group {
  return group(0, 0.02, 0.12,
    d(box(0.3, 0.06, 0.24, mat(color), 0, 0, 0), 'leather'),
    d(box(0.28, 0.065, 0.22, mat(0xcfc2a2), 0.008, 0, 0), 'bone'),
    d(box(0.05, 0.07, 0.05, k.t.brass, 0.13, 0, 0.1), 'steel'),
  );
}

function oarProp(k: Kit, len = 1.5): THREE.Group {
  return group(0, 0, 0,
    d(cyl(0.024, 0.024, len, k.t.wood, 0, len * 0.32, 0.04, 6), 'wood'),
    d(box(0.13, 0.42, 0.025, k.t.wood, 0, len * 0.32 + len / 2 + 0.12, 0.04), 'wood'),
    d(cyl(0.03, 0.03, 0.12, k.t.rope, 0, len * 0.6, 0.04, 6), 'leather'),
  );
}

function spyglassProp(k: Kit): THREE.Group {
  return group(0, 0.06, 0.1,
    d(rot(cyl(0.03, 0.025, 0.2, k.t.leather, 0, 0, 0.02, 8), Math.PI / 2, 0, 0), 'leather'),
    d(rot(cyl(0.036, 0.036, 0.06, k.t.brass, 0, 0, 0.13, 8), Math.PI / 2, 0, 0), 'steel'),
    d(rot(cyl(0.022, 0.022, 0.12, k.t.brass, 0, 0, -0.12, 8), Math.PI / 2, 0, 0), 'steel'),
  );
}

function polearm(k: Kit, kind: 'halberd' | 'glaive' | 'spear' | 'greataxe' | 'harpoon' | 'pick', len = 1.6): THREE.Group {
  const shaft = kind === 'pick' ? 0.75 : len;
  const g = group(0, 0, 0,
    d(cyl(0.022, 0.026, shaft, k.t.wood, 0, shaft * 0.32, 0.04, 6), 'wood'),
    d(cyl(0.03, 0.03, 0.1, k.t.leatherDark, 0, 0.0, 0.04, 6), 'leather'),
  );
  const top = shaft * 0.82;
  const blade = k.t.steel;
  if (kind === 'halberd') {
    g.add(d(box(0.24, 0.2, 0.02, blade, 0.1, top - 0.02, 0.04), 'blade'));
    g.add(d(cone(0.03, 0.26, blade, 0, top + 0.18, 0.04, 4), 'blade'));
    g.add(d(cone(0.03, 0.1, k.t.iron, -0.08, top, 0.04, 4).rotateZ(Math.PI / 2), 'iron'));
  } else if (kind === 'glaive') {
    g.add(d(rot(box(0.09, 0.42, 0.02, blade, 0.03, top + 0.16, 0.04), 0, 0, -0.12), 'blade'));
  } else if (kind === 'spear') {
    g.add(d(cone(0.045, 0.24, blade, 0, top + 0.12, 0.04, 4), 'blade'));
    g.add(d(box(0.12, 0.22, 0.01, mat(k.t.main), 0.07, top - 0.12, 0.04), 'clothBlood')); // pennant
  } else if (kind === 'greataxe') {
    for (const s of [-1, 1]) g.add(d(box(0.2, 0.3, 0.025, blade, s * 0.12, top, 0.04), 'blade'));
    g.add(d(cyl(0.04, 0.04, 0.12, k.t.iron, 0, top, 0.04, 6), 'iron'));
  } else if (kind === 'harpoon') {
    g.add(d(cone(0.035, 0.22, blade, 0, top + 0.11, 0.04, 4), 'iron'));
    for (const s of [-1, 1]) g.add(d(rot(cone(0.015, 0.09, blade, s * 0.035, top + 0.02, 0.04, 3), 0, 0, -s * 2.6), 'iron'));
    g.add(d(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10), k.t.rope).translateY(top - 0.2).translateZ(0.04), 'leather'));
  } else {
    g.add(d(rot(cone(0.025, 0.24, k.t.iron, 0.12, top + 0.02, 0.04, 4), 0, 0, -Math.PI / 2 - 0.2), 'iron'));
    g.add(d(rot(cone(0.025, 0.16, k.t.iron, -0.08, top + 0.02, 0.04, 4), 0, 0, Math.PI / 2 + 0.2), 'iron'));
  }
  return g;
}

function hold(k: Kit, prop: THREE.Object3D, restArm: number): void {
  holdProp(k.rig, prop);
  k.rig.restArm = restArm;
}

function done(k: Kit): BipedRig {
  return finish(k.rig, k.height);
}

// ------------------------------------------------------------------ roles

const GLOW: Record<Culture, number> = {
  temperate: 0x9affe0, north: 0x9ad8ff, dwarf: 0xffa040, elf: 0xb8ff7a, desert: 0xffd070, jungle: 0x7affa0, coast: 0x7ad8ff, crown: 0xd0a0ff,
};

function smith(k: Kit): BipedRig {
  const { t, who } = k;
  bareArms(k, 'skinSoot');
  for (const a of [k.armL, k.armR]) { a.scale.x *= 1.15; a.scale.z *= 1.15; }
  apron(k, mat(who.culture === 'desert' ? 0x5a3a20 : 0x4a3220), 'leatherBurnt');
  belt(k, t.leatherDark, 0.05);
  pouch(k.torso, t.leather, -0.2, -0.04, 0.17);
  k.torso.add(d(rot(box(0.025, 0.34, 0.025, t.iron, 0.23, -0.12, 0.1), 0, 0, 0.12), 'iron'));
  k.torso.add(d(rot(box(0.025, 0.34, 0.025, t.iron, 0.26, -0.12, 0.1), 0, 0, 0.2), 'iron'));
  k.armL.add(d(sbox2(0.13, 0.12, 0.13, t.leatherDark, 0, -0.33, 0.01), 'leatherBurnt')); // one heavy glove (tongs hand)
  for (const l of [k.legL, k.legR]) l.add(d(cyl(0.1, 0.09, 0.2, t.leather, 0, -0.36, 0, 8), 'leatherBurnt'));
  if (who.culture === 'north') { mantle(k, t.fur, 'fur', 0.26, 0.5, 0.4); armRing(k.armL, t.brass); armRing(k.armR, t.iron); }
  else if (who.culture === 'desert') turban(k, mat(0x8a6a44), false);
  else if (who.culture === 'dwarf') { skullcap(k, t.iron, 'iron'); rivets(k.head, t.brass, [-0.12, 0, 0.12], 0.17, 0.12, 0.018); goggles(k); }
  else if (who.culture === 'elf') { k.torso.add(d(sphere(0.2, mat(0x3e5a2a), 0, 0.5, 0, 1.2, 0.3, 1, 1), 'cloth')); }
  else if (who.culture === 'jungle') { charms(k, t.bone, 5, 0.06); warPaint(k, 0x8a2a1a); }
  else if (who.culture === 'coast') skullcap(k, mat(0x3a4048), 'cloth');
  else if (who.culture === 'crown') { skullcap(k, t.leatherDark); k.torso.add(d(box(0.42, 0.06, 0.04, t.brass, 0, 0.5, 0.18), 'steel')); }
  else k.head.add(d(cyl(0.215, 0.215, 0.04, t.leather, 0, 0.1, -0.01, 12), 'leather'));
  scar(k.head, -0.1, -0.05, 0.1, 0.5, 0x8a3a2a);
  hold(k, hammerProp(k, who.culture === 'dwarf' ? 1.15 : 1, who.culture === 'dwarf'), -0.15);
  return done(k);
}

/** sbox without the shared cache (a part with its own size). */
function sbox2(w: number, h: number, dd: number, m: Mat, x: number, y: number, z: number): THREE.Mesh {
  return box(w, h, dd, m, x, y, z);
}

function mage(k: Kit): BipedRig {
  const { t, who, r } = k;
  const robeHex = who.culture === 'desert' ? r.pick([0x2e3a5a, 0x7a3a22, 0x8a6a3a]) : who.culture === 'north' ? 0x3a4250 : who.culture === 'elf' ? 0x3a4a2a : who.culture === 'dwarf' ? 0x4a2a1a : who.culture === 'jungle' ? 0x2a4a3a : who.culture === 'crown' ? 0x3a1e44 : t.main;
  const robeM = mat(robeHex);
  const dark = mat(new THREE.Color(robeHex).multiplyScalar(0.55).getHex());
  tagAll(k.torso, 'runeCloth');
  robe(k, robeM, 'runeCloth');
  sleeves(k, robeM, 'runeCloth', true);
  mantle(k, mat(new THREE.Color(robeHex).multiplyScalar(0.8).getHex()), 'cloth', 0.22, 0.5, 0.5);
  k.torso.add(d(cyl(0.29, 0.29, 0.05, t.rope, 0, 0.05, 0, 12), 'leather'));
  vials(k, [0x6a1a1a, 0x1a3a7a, 0x2a6a2a].slice(0, 2 + r.int(0, 1)));
  scrollCase(k);
  let top: Parameters<typeof staffProp>[2] = 'orb';
  if (who.culture === 'desert') { turban(k, mat(0x6a4a2a), r.chance(0.5), true); top = 'sun'; }
  else if (who.culture === 'north') { hood(k, dark, false, false); k.head.add(d(cyl(0.26, 0.24, 0.07, t.fur, 0, 0.17, 0.02, 12), 'fur')); charms(k, t.bone, 7, 0.05); top = 'crystal'; }
  else if (who.culture === 'elf') { leafCloak(k, 0x3e5a2a, 0x5a5a2a, 0.9); hood(k, mat(0x2e4420), true, false); top = 'antler'; }
  else if (who.culture === 'dwarf') { skullcap(k, t.leatherDark); goggles(k); apron(k, t.leather, 'leatherBurnt', 0.7); top = 'crystal'; }
  else if (who.culture === 'jungle') { feathers(k, [0x2a6a5a, 0x8a3a1a, 0x2a5a2a, 0xa08a2a]); charms(k, mat(0xd0c0a0), 9, 0.04); warPaint(k, 0xd8d0b8); top = 'skull'; }
  else if (who.culture === 'crown') { k.torso.add(d(box(0.34, 0.24, 0.05, dark, 0, 0.62, -0.12), 'cloth')); chainOfOffice(k); hood(k, robeM, false, false); top = 'crystal'; }
  else if (r.chance(0.5)) {
    // a broad, peaked and battered hat
    hideHair(k);
    k.head.add(d(cyl(0.38, 0.38, 0.025, dark, 0, 0.13, -0.01, 14), 'cloth'));
    k.head.add(d(rot(cone(0.2, 0.42, dark, 0.02, 0.34, -0.04, 8), -0.18, 0, 0.12), 'cloth'));
    k.head.add(d(cyl(0.205, 0.205, 0.04, t.leatherDark, 0, 0.16, -0.01, 10), 'leather'));
  } else hood(k, dark, true);
  if (k.old && !k.female) longBeard(k, false, 0x8d8a86);
  hold(k, staffProp(k, GLOW[who.culture], top), -0.12);
  return done(k);
}

function outfitter(k: Kit): BipedRig {
  const { t, who, r } = k;
  // leather jerkin over the shirt, a hooded short cape, pouches, quiver and bedroll
  k.torso.add(d(cyl(0.26, 0.27, 0.48, t.leather, 0, 0.27, 0, 10), 'leather'));
  belt(k, t.leatherDark, 0.05);
  pouch(k.torso, t.leather, 0.17, -0.03, 0.17);
  pouch(k.torso, t.leather, -0.19, -0.03, 0.16, 0.08);
  quiver(k, who.culture === 'jungle' ? 0x8a3a1a : who.culture === 'elf' ? 0x7a8a4a : 0xb8b0a0);
  bedroll(k, mat(0x5a5040));
  ropeCoil(k, -1);
  const cape = mat(t.darkHex);
  if (who.culture === 'north') { k.rig.cape = furCape(k, 0.55); furHat(k, t.fur); }
  else if (who.culture === 'elf') { k.rig.cape = leafCloak(k, 0x3e5a2a, 0x4a4a22, 0.6); hood(k, mat(0x2e4420), false, false); }
  else if (who.culture === 'desert') { turban(k, mat(0x9a7a50), true); k.torso.add(d(box(0.5, 0.1, 0.4, mat(0x8a3a1a), 0, 0.12, 0), 'cloth')); }
  else if (who.culture === 'jungle') { bareArms(k, 'skin'); feathers(k, [0x2a6a5a, 0x8a3a1a]); charms(k, t.bone, 5, 0.05); }
  else if (who.culture === 'dwarf') { skullcap(k, t.iron, 'iron'); k.torso.add(d(box(0.3, 0.2, 0.03, t.iron, 0, 0.36, 0.17), 'iron')); }
  else if (who.culture === 'coast') sowester(k, mat(0x5a5a2a));
  else {
    k.rig.cape = tornCloak(k.torso, t.darkHex, 0.5, 0.6, -0.2, 'cloth', hashKey(k.def.key), false);
    if (r.chance(0.5)) hood(k, cape, false, false); else hoodDown(k, cape, 'cloth');
  }
  for (const a of [k.armL, k.armR]) a.add(d(cyl(0.085, 0.075, 0.13, t.leatherDark, 0, -0.3, 0, 8), 'leather'));
  hold(k, bowProp(k, who.culture === 'desert' || who.culture === 'jungle'), -0.2);
  return done(k);
}

function banker(k: Kit): BipedRig {
  const { t, who, r } = k;
  const coatHex = who.culture === 'crown' ? 0x4a2a52 : who.culture === 'desert' ? 0x8a6a40 : who.culture === 'north' ? 0x5a4a3a : blendHex(0x4a3e32, t.main, 0.3);
  const coat = mat(coatHex);
  k.torso.add(d(cyl(0.27, 0.3, 0.56, coat, 0, 0.27, 0, 10), who.culture === 'desert' ? 'cloth' : 'leather'));
  if (who.culture === 'desert') robe(k, coat, 'cloth');
  else coatSkirt(k, coat, 'leather', 0.5, 0.4);
  sleeves(k, coat, 'leather');
  for (const y of [0.42, 0.3, 0.18]) k.torso.add(box(0.06, 0.03, 0.02, t.brass, 0, y, 0.285));
  belt(k, t.leatherDark, 0.04, 0.58);
  // a ring of keys and a fat coin purse
  k.torso.add(d(rot(cyl(0.05, 0.05, 0.012, t.brass, -0.3, -0.04, 0.12, 10), Math.PI / 2, 0, 0.3), 'steel'));
  for (const s of [-1, 0, 1]) k.torso.add(box(0.012, 0.07, 0.012, t.brass, -0.3 + s * 0.025, -0.1, 0.13));
  k.torso.add(d(sphere(0.065, t.leather, 0.24, -0.08, 0.16, 1, 1.2, 0.8, 1), 'leather'));
  if (who.culture === 'desert') turban(k, mat(0x3a2a20), false, true);
  else if (who.culture === 'north') { mantle(k, t.fur, 'fur', 0.27, 0.53, 0.42); furHat(k, t.fur); }
  else if (who.culture === 'crown') {
    // a stiff high collar and dulled gold chain
    k.torso.add(d(cyl(0.2, 0.14, 0.2, coat, 0, 0.66, -0.02, 10), 'cloth'));
    chainOfOffice(k, 0.2);
    if (k.female) { hideHair(k); k.head.add(d(cyl(0.2, 0.22, 0.12, mat(0x1a1018), 0, 0.2, -0.04, 10), 'cloth')); }
  } else {
    mantle(k, who.culture === 'coast' ? mat(0x3a3a3a) : t.fur, 'fur', 0.25, 0.55, 0.38);
    hideHair(k);
    k.head.add(d(cyl(0.24, 0.22, 0.08, mat(t.darkHex), 0, 0.19, -0.02, 12), 'cloth')); // flat velvet cap
  }
  if (r.chance(0.6) || k.old) spectacles(k);
  strongbox(k, 0.42, 0.32, 0.3);
  hold(k, ledgerProp(k, r.pick([0x4a1e14, 0x1e2a3a, 0x2a3a1e])), -1.1);
  return done(k);
}

function captain(k: Kit): BipedRig {
  const { t, who, r } = k;
  const coatHex = who.culture === 'crown' ? 0x2a2e4a : who.culture === 'desert' ? 0x9a7040 : who.culture === 'north' ? 0x5a5048 : blendHex(0x3a3a44, t.main, 0.35);
  const coat = mat(coatHex);
  k.torso.add(d(cyl(0.27, 0.29, 0.54, coat, 0, 0.27, 0, 10), 'leather'));
  coatSkirt(k, coat, 'leather', 0.52, 0.4);
  sleeves(k, coat, 'leather');
  for (const y of [0.44, 0.34, 0.24, 0.14]) for (const s of [-1, 1]) k.torso.add(sphere(0.016, t.brass, s * 0.08, y, 0.27, 1, 1, 0.6, 0));
  k.torso.add(d(box(0.56, 0.09, 0.42, mat(t.main), 0, 0.06, 0), 'cloth')); // sash
  k.torso.add(d(box(0.08, 0.26, 0.03, mat(t.main), 0.12, -0.08, 0.2), 'cloth'));
  // a cutlass at the hip
  k.torso.add(group(-0.3, -0.1, 0.06,
    d(rot(box(0.05, 0.5, 0.012, t.steel, 0, -0.18, 0), 0, 0, 0.15), 'blade'),
    d(rot(box(0.12, 0.03, 0.04, t.brass, 0, 0.08, 0), 0, 0, 0.15), 'steel'),
  ));
  ropeCoil(k, 1);
  if (who.culture === 'desert') turban(k, mat(0x5a2a1a), false);
  else if (who.culture === 'north') { furHat(k, t.fur); k.rig.cape = furCape(k, 0.7); }
  else if (who.culture === 'crown') {
    // the admiral: a broad two-pointed hat and heavy epaulettes
    hideHair(k);
    k.head.add(d(rot(cyl(0.1, 0.1, 0.52, mat(0x2a2a34), 0, 0.2, -0.03, 3), 0.3, 0, Math.PI / 2), 'leather'));
    k.head.add(d(rot(cyl(0.025, 0.025, 0.54, t.brass, 0, 0.16, 0.02, 4), 0, 0, Math.PI / 2), 'steel'));
    for (const s of [-1, 1]) k.torso.add(d(cyl(0.09, 0.11, 0.05, t.brass, s * 0.26, 0.54, 0, 10), 'steel'));
    k.rig.cape = tornCloak(k.torso, 0x1e1e2a, 0.56, 0.95, -0.2, 'cloth', hashKey(k.def.key), true);
  } else wideHat(k, mat(who.culture === 'coast' ? 0x4a4a3a : 0x5a4430), 0.32, 0.14, mat(t.main), r.chance(0.6) ? t.main : 0xa09a88);
  if (r.chance(0.4)) eyePatch(k, r.chance(0.5) ? 1 : -1);
  else scar(k.head, 0.09, -0.04, 0.12, 0.3);
  hold(k, spyglassProp(k), -0.9);
  return done(k);
}

function ferryman(k: Kit): BipedRig {
  const { t, who } = k;
  if (who.culture === 'north') { k.torso.add(d(cyl(0.27, 0.3, 0.54, t.fur, 0, 0.27, 0, 10), 'fur')); furCape(k, 0.6); furHat(k, t.fur); }
  else if (who.culture === 'desert') { robe(k, mat(0x8a6a44), 'cloth', 0.36); turban(k, mat(0x3a4a6a), true); }
  else {
    const m = oilskin(k, who.culture === 'temperate' ? 0x3a3a26 : 0x2e3a30);
    hood(k, m, false, false);
  }
  belt(k, t.leatherDark, 0.04, 0.6);
  lantern(k.torso, k, 0.3, -0.06, 0.1);
  ropeCoil(k, -1);
  scar(k.head, -0.08, -0.06, 0.1, -0.5);
  // a long oar or punting pole (desert)
  hold(k, who.culture === 'desert' ? polearm(k, 'spear', 1.9) : oarProp(k, 1.6), -0.12);
  return done(k);
}

function carter(k: Kit): BipedRig {
  const { t } = k;
  k.torso.add(d(cyl(0.26, 0.27, 0.48, t.leather, 0, 0.27, 0, 10), 'leatherBurnt'));
  belt(k, t.leatherDark, 0.05);
  apron(k, t.leatherDark, 'leatherBurnt', 0.7);
  skullcap(k, t.leather);
  k.head.add(d(cyl(0.03, 0.03, 0.06, mat(0xe0d8b0), 0, 0.3, 0.06, 6), 'plain'));
  k.head.add(sphere(0.022, mat(0xffc060, { emissive: 0xff9020 }), 0, 0.35, 0.06, 1, 1.4, 1, 0)); // candle on the cap
  lantern(k.torso, k, 0.3, -0.06, 0.1);
  bareArms(k, 'skinSoot');
  hold(k, polearm(k, 'pick'), -0.2);
  return done(k);
}

// ------------------------------------------------------------------ unique people (quest givers, trainers and others)

function soldierBase(k: Kit, armor: string, legs: string, feet: string, head: string | null): void {
  applyGear(k.rig, { weapon: null, shield: null, armor, head, legs, feet });
}

const UNIQUE: Record<string, (k: Kit) => BipedRig> = {
  westmarch_marshal: (k) => {
    soldierBase(k, 'plate_armor', 'plate_legs', 'steel_boots', null);
    tabard(k, k.t.cloth, 'clothBlood', 0.245);
    crest(k, k.t.iron, 0.262);
    belt(k, k.t.leatherDark, 0.03, 0.54);
    k.torso.add(d(cyl(0.17, 0.21, 0.08, k.t.iron, 0, 0.57, 0, 10), 'iron'));
    k.rig.cape = tornCloak(k.torso, 0x1e2a3a, 0.6, 1.0, -0.29, 'cloth', 21);
    scar(k.head, -0.06, 0.03, 0.18, -0.3);
    hold(k, polearm(k, 'halberd', 1.7), -0.15);
    return done(k);
  },
  stonedeep_thane: (k) => {
    soldierBase(k, 'plate_armor', 'plate_legs', 'steel_boots', null);
    k.torso.add(d(box(0.36, 0.4, 0.025, k.t.cloth, 0, 0.3, 0.25), 'clothBlood'));
    crest(k, k.t.brass, 0.265, 0.36, 0.12);
    // a crested dwarven war helm, open-faced, and a fur cloak
    hideHair(k);
    k.head.add(d(sphere(0.23, k.t.iron, 0, 0.07, -0.02, 1, 0.85, 1.05, 2), 'iron'));
    k.head.add(d(box(0.04, 0.12, 0.38, k.t.brass, 0, 0.27, -0.02), 'steel'));
    for (const s of [-1, 1]) k.head.add(d(box(0.05, 0.16, 0.12, k.t.iron, s * 0.2, -0.04, 0.06), 'iron'));
    rivets(k.head, k.t.brass, [-0.14, -0.07, 0, 0.07, 0.14], 0.07, 0.2, 0.016);
    k.rig.cape = furCape(k, 0.65);
    hold(k, polearm(k, 'greataxe', 1.3), -0.15);
    return done(k);
  },
  valdrheim_jarl: (k) => {
    soldierBase(k, 'chain_armor', 'leather_legs', 'leather_boots', null);
    // a bear pelt: the head over his own as a hood, paws over the shoulders
    const pelt = mat(0x4a3a2c);
    k.rig.cape = tornCloak(k.torso, 0x4a3a2c, 0.66, 0.95, -0.25, 'fur', 31, false);
    mantle(k, pelt, 'fur', 0.28, 0.52, 0.5);
    hideHair(k);
    k.head.add(d(sphere(0.25, pelt, 0, 0.1, -0.04, 1.05, 0.75, 1.1, 2), 'fur'));
    k.head.add(d(sphere(0.1, pelt, 0, 0.12, 0.2, 0.9, 0.7, 1.3, 1), 'fur')); // snout over the brow
    for (const s of [-1, 1]) {
      k.head.add(d(sphere(0.05, pelt, s * 0.15, 0.25, -0.04, 1, 1, 0.6, 1), 'fur')); // ears
      k.torso.add(d(sphere(0.07, pelt, s * 0.14, 0.42, 0.2, 0.9, 1.4, 0.6, 1), 'fur')); // paws
      for (let i = 0; i < 3; i++) k.torso.add(d(rot(cone(0.012, 0.05, k.t.bone, s * 0.14 + (i - 1) * 0.025, 0.33, 0.22, 3), Math.PI, 0, 0), 'bone'));
    }
    armRing(k.armL, k.t.brass); armRing(k.armR, k.t.brass, -0.12);
    belt(k, k.t.leatherDark, 0.04, 0.56);
    if (!k.female) longBeard(k, true);
    hold(k, polearm(k, 'greataxe', 1.5), -0.15);
    return done(k);
  },
  dunewatch_sergeant: (k) => {
    soldierBase(k, 'chain_armor', 'leather_legs', 'leather_boots', null);
    k.torso.add(d(box(0.56, 0.1, 0.42, mat(0x8a3a1a), 0, 0.1, 0), 'cloth'));
    tabard(k, mat(0x9a7a50), 'clothBlood', 0.24, 0.5);
    turban(k, mat(0x9a7a50), true);
    // a round hide shield on the back
    k.torso.add(group(0, 0.3, -0.27,
      d(rot(cyl(0.27, 0.27, 0.04, mat(0x6a4a2a), 0, 0, 0, 14), Math.PI / 2, 0, 0), 'leather'),
      d(sphere(0.06, k.t.iron, 0, 0, -0.03, 1, 1, 0.6, 1), 'iron'),
    ));
    hold(k, polearm(k, 'spear', 1.8), -0.15);
    return done(k);
  },
  brann: (k) => {
    soldierBase(k, 'chain_armor', 'leather_legs', 'leather_boots', null);
    tabard(k, mat(0x3e5a2a), 'cloth', 0.245, 0.5);
    k.rig.cape = leafCloak(k, 0x2e4a22, 0x4a4a22, 0.95);
    hoodDown(k, mat(0x2e4420), 'cloth');
    belt(k, k.t.leatherDark, 0.03, 0.54);
    pouch(k.torso, k.t.leather, 0.18, -0.04, 0.24);
    k.torso.add(d(box(0.1, 0.14, 0.03, mat(0xd8cca8), -0.18, -0.02, 0.24), 'bone')); // a ledger of stores at his belt
    scar(k.head, 0.08, 0.0, 0.16, 0.2);
    hold(k, polearm(k, 'glaive', 1.6), -0.15);
    return done(k);
  },
  briarwatch_ranger: (k) => {
    outfitterBody(k);
    k.rig.cape = tornCloak(k.torso, 0x2a3a22, 0.56, 0.95, -0.21, 'cloth', 41, false);
    hood(k, mat(0x2a3a22), true, true);
    feathers(k, [0x6a5a4a], 0.12, -0.2);
    scar(k.head, 0.1, -0.06, 0.1, -0.5);
    hold(k, bowProp(k, true), -0.2);
    return done(k);
  },
  highmoor_reeve: (k) => civic(k, 0x3a3a2a, 'staff'),
  corvane_reeve: (k) => { oilskin(k, 0x24403e); chainOfOffice(k, 0.2); sowester(k, mat(0x2a3a38)); hold(k, polearm(k, 'harpoon', 1.6), -0.15); return done(k); },
  millbrook_elder: (k) => {
    // a farmer elder: smock, straw hat, shepherd's crook
    const smock = mat(0x8a7a5a);
    k.torso.add(d(cyl(0.27, 0.36, 0.86, smock, 0, 0.12, 0, 10), 'cloth'));
    sleeves(k, smock, 'cloth');
    belt(k, k.t.rope, 0.08);
    wideHat(k, mat(0xa08a50), 0.3, 0.12, mat(0x5a3a1a));
    longBeard(k, false, 0x9a9690);
    hold(k, staffProp(k, 0, 'crook'), -0.12);
    return done(k);
  },
  aurelion_magistrate: (k) => {
    const robeM = mat(0x2a1e26);
    robe(k, robeM, 'cloth', 0.42);
    sleeves(k, robeM, 'cloth', true);
    k.torso.add(d(cyl(0.21, 0.15, 0.22, robeM, 0, 0.66, -0.03, 10), 'cloth')); // high collar
    mantle(k, mat(0x5a1a20), 'cloth', 0.24, 0.5, 0.4);
    chainOfOffice(k, 0.2);
    hideHair(k);
    k.head.add(d(cyl(0.21, 0.23, 0.1, mat(0x4a1a22), 0, 0.19, -0.03, 4).rotateY(Math.PI / 4), 'cloth')); // square judge's cap
    const rod = group(0, 0, 0, d(cyl(0.022, 0.022, 0.7, robeM, 0, 0.2, 0.04, 6), 'wood'), d(cyl(0.05, 0.03, 0.08, k.t.brass, 0, 0.58, 0.04, 6), 'steel'));
    for (let i = 0; i < 5; i++) rod.add(d(cone(0.015, 0.06, k.t.brass, Math.cos(i * 1.26) * 0.04, 0.65, 0.04 + Math.sin(i * 1.26) * 0.04, 3), 'steel'));
    hold(k, rod, -0.5);
    return done(k);
  },
  sunspire_vizier: (k) => {
    const robeM = mat(0x8a6a34);
    robe(k, robeM, 'runeCloth', 0.4);
    sleeves(k, robeM, 'cloth', true);
    // a broad collar of dulled gold plates and a tall headdress
    for (let i = 0; i < 9; i++) {
      const a = -1.2 + i * 0.3;
      k.torso.add(d(rot(box(0.07, 0.09, 0.02, k.t.brass, Math.sin(a) * 0.22, 0.48 - Math.cos(a) * 0.03, Math.cos(a) * 0.18), 0, a, 0), 'steel'));
    }
    turban(k, mat(0x2a2a40), false, true);
    k.head.add(d(cone(0.05, 0.12, k.t.brass, 0, 0.47, -0.03, 4), 'steel'));
    for (const s of [-1, 1]) { const e = box(0.06, 0.012, 0.01, mat(0x0a0806), s * 0.1, 0.02, 0.2); e.userData.face = true; k.head.add(e); } // kohl lines
    hold(k, staffProp(k, 0xffd070, 'sun'), -0.12);
    return done(k);
  },
  saltmere_abbot: (k) => {
    const habit = mat(0x3a3428);
    robe(k, habit, 'cloth', 0.4);
    sleeves(k, habit, 'cloth', true);
    k.torso.add(d(cyl(0.29, 0.29, 0.04, k.t.rope, 0, 0.05, 0, 12), 'leather'));
    for (let i = 0; i < 3; i++) k.torso.add(d(box(0.025, 0.12, 0.025, k.t.rope, 0.08 + i * 0.04, -0.06 - i * 0.03, 0.27), 'leather')); // knotted cord ends
    hoodDown(k, habit, 'cloth');
    mantle(k, habit, 'cloth', 0.24, 0.5, 0.45);
    // tonsure: shaved crown, a ring of grey hair
    hideHair(k);
    k.head.add(d(cyl(0.215, 0.205, 0.08, mat(0x8d8a86), 0, 0.06, -0.02, 12), 'hair'));
    crest(k, k.t.iron, 0.2, 0.34, 0.12);
    hold(k, staffProp(k, 0, 'ring'), -0.12);
    return done(k);
  },
  tomas: (k) => {
    // the old hydra hunter: patched coat, a mantle of grey-green hydra scales, a necklace of
    // fangs, a peg leg and a harpoon for a walking stick
    const coat = mat(0x4a3a26);
    k.torso.add(d(cyl(0.27, 0.29, 0.54, coat, 0, 0.27, 0, 10), 'leatherBurnt'));
    coatSkirt(k, coat, 'leatherBurnt', 0.42, 0.38);
    sleeves(k, coat, 'leather');
    const scale = mat(0x4a5a42);
    for (let i = 0; i < 14; i++) {
      const a = -1.5 + (i % 7) * 0.5, row = Math.floor(i / 7);
      k.torso.add(d(sphere(0.07, scale, Math.sin(a) * 0.25, 0.52 - row * 0.08, Math.cos(a) * 0.15 - 0.02, 1, 0.5, 1, 1), 'iron'));
    }
    charms(k, k.t.bone, 5, 0.1);
    wideHat(k, mat(0x5a4632), 0.28, 0.12);
    eyePatch(k, -1);
    scar(k.head, 0.1, -0.02, 0.2, 0.15);
    for (const c of meshes(k.legR)) if (c.position.y < -0.25) c.visible = false;
    k.legR.add(d(cyl(0.03, 0.022, 0.36, k.t.wood, 0, -0.46, 0, 6), 'wood'));
    k.legR.add(d(cyl(0.045, 0.045, 0.05, k.t.iron, 0, -0.3, 0, 6), 'iron'));
    hold(k, polearm(k, 'harpoon', 1.5), -0.12);
    return done(k);
  },
  westmarch_trainer: (k) => {
    // Sister Ilsa: a veiled habit, an iron prayer chain, a heavy book of rites
    const habit = mat(0x22222a);
    robe(k, habit, 'cloth', 0.38);
    sleeves(k, habit, 'cloth', true);
    hideHair(k, true);
    k.head.add(d(sphere(0.25, habit, 0, 0.07, -0.08, 1, 1.04, 1.0, 2), 'cloth'));
    k.head.add(d(box(0.46, 0.5, 0.06, habit, 0, -0.06, -0.2), 'cloth'));
    k.head.add(d(box(0.4, 0.06, 0.1, mat(0xb8b0a0), 0, 0.17, 0.12), 'cloth')); // white band over the brow
    k.torso.add(d(sphere(0.2, mat(0xa8a090), 0, 0.53, 0.03, 1.15, 0.4, 1.0, 1), 'cloth')); // wimple
    for (let i = 0; i < 9; i++) k.torso.add(d(sphere(0.018, k.t.iron, Math.sin(-0.8 + i * 0.2) * 0.13, 0.42 - Math.cos(-0.8 + i * 0.2) * 0.12, 0.18, 1, 1, 1, 0), 'iron'));
    crest(k, k.t.iron, 0.2, 0.2, 0.08);
    hold(k, bookProp(k, 0x2a1a14), -1.1);
    return done(k);
  },
  aurelion_trainer: (k) => {
    // Magister Doran: scholar's robe, a square cap, spectacles, a huge open tome
    const robeM = mat(0x2a1a30);
    robe(k, robeM, 'runeCloth', 0.4);
    sleeves(k, robeM, 'runeCloth', true);
    mantle(k, mat(0x4a1a1e), 'cloth', 0.23, 0.5, 0.42);
    hideHair(k);
    k.head.add(d(sphere(0.22, robeM, 0, 0.08, -0.02, 1, 0.7, 1.04, 1), 'cloth'));
    k.head.add(d(box(0.42, 0.03, 0.42, robeM, 0, 0.2, -0.02), 'cloth'));
    k.head.add(d(box(0.04, 0.1, 0.02, k.t.brass, 0.18, 0.13, 0.19), 'steel')); // tassel
    spectacles(k);
    if (!k.female) longBeard(k, false, 0x9a9690);
    scrollCase(k);
    hold(k, bookProp(k, 0x3a1a3a), -1.1);
    return done(k);
  },
  elderglen_outfit: (k) => {
    // Thistle, outfitter and pet keeper: leaf cloak, feed satchel, a hooded owl on her shoulder
    outfitterBody(k);
    k.rig.cape = leafCloak(k, 0x3e5a2a, 0x5a5a2a, 0.8);
    hoodDown(k, mat(0x2e4420), 'cloth');
    k.torso.add(d(box(0.16, 0.16, 0.08, mat(0x6a5a3a), 0.2, -0.04, 0.12), 'cloth')); // feed satchel
    k.torso.add(d(rot(box(0.04, 0.7, 0.03, k.t.leatherDark, 0, 0.26, 0.17), 0, 0, -0.65), 'leather'));
    const owl = mat(0x6a5a44);
    k.torso.add(group(0.27, 0.62, -0.02,
      d(sphere(0.07, owl, 0, 0, 0, 1, 1.25, 0.95, 1), 'fur'),
      d(sphere(0.055, owl, 0, 0.1, 0.01, 1, 0.9, 0.95, 1), 'fur'),
      sphere(0.014, mat(0xffb030, { emissive: 0x804010 }), 0.022, 0.11, 0.05, 1, 1, 1, 0),
      sphere(0.014, mat(0xffb030, { emissive: 0x804010 }), -0.022, 0.11, 0.05, 1, 1, 1, 0),
      d(cone(0.015, 0.03, k.t.bone, 0, 0.08, 0.06, 3).rotateX(Math.PI / 2 + 0.6), 'bone'),
    ));
    hold(k, staffProp(k, 0, 'crook'), -0.12);
    return done(k);
  },
  pearl_diver: (k) => {
    // Nerissa: bare arms and shins, sea-wet wraps, a net bag of pearls, a diving knife at the calf
    bareArms(k, 'skin');
    for (const l of [k.legL, k.legR]) for (const c of meshes(l)) if (c.position.y < -0.25 && c.position.y > -0.45) c.material = k.skin;
    k.torso.add(d(box(0.42, 0.2, 0.33, mat(0x2a4a4a), 0, 0.42, 0), 'cloth'));
    k.torso.add(d(box(0.5, 0.09, 0.38, mat(0x6a5a3a), 0, 0.06, 0), 'leather'));
    const net = group(0.24, -0.12, 0.08, d(sphere(0.09, mat(0x8a7a5a), 0, 0, 0, 1, 1.3, 0.8, 1), 'chain'));
    for (let i = 0; i < 5; i++) net.add(sphere(0.022, mat(0xe8e0d0, { emissive: 0x302820 }), Math.cos(i) * 0.05, -0.04 + (i % 2) * 0.05, 0.06, 1, 1, 1, 0));
    k.torso.add(net);
    k.legR.add(d(box(0.03, 0.18, 0.05, k.t.leatherDark, 0.09, -0.32, 0.05), 'leather'));
    k.legR.add(d(box(0.02, 0.06, 0.03, k.t.steel, 0.09, -0.2, 0.05), 'steel'));
    for (const c of k.head.children) if (c.userData.cover === 'top' || c.userData.cover === 'back') { const m = (c as THREE.Mesh).material as Mat; m.color.multiplyScalar(0.7); } // wet, dark hair
    charms(k, mat(0xd8d0c0), 5, 0.035);
    hold(k, polearm(k, 'harpoon', 1.4), -0.12);
    return done(k);
  },
  isle_guide: (k) => {
    // Guide Maren: a travelling cloak, map case, a staff with a lantern hung from its crook
    k.rig.cape = tornCloak(k.torso, 0x3a3a30, 0.56, 0.95, -0.2, 'cloth', 51);
    hoodDown(k, mat(0x3a3a30), 'cloth');
    belt(k, k.t.leatherDark, 0.04);
    pouch(k.torso, k.t.leather, 0.17, -0.04, 0.17);
    scrollCase(k);
    const st = staffProp(k, 0, 'crook');
    lantern(st, k, -0.16, 0.86, 0.04);
    hold(k, st, -0.12);
    return done(k);
  },
  isle_trader: (k) => {
    apron(k, mat(0x5a4a34), 'leather', 0.8);
    belt(k, k.t.leatherDark, 0.04);
    spectacles(k);
    k.body.add(group(0.42, 0, 0.3,
      d(box(0.32, 0.26, 0.26, mat(0x5a4028), 0, 0.13, 0), 'wood'),
      d(box(0.34, 0.03, 0.28, k.t.iron, 0, 0.2, 0), 'iron'),
      d(sphere(0.06, mat(0x7a2a1a), 0.06, 0.28, 0.02, 1, 0.8, 1, 1), 'cloth'),
      d(cyl(0.04, 0.04, 0.12, mat(0x4a5a2a), -0.08, 0.3, 0, 6), 'wood'),
    ));
    hold(k, ledgerProp(k), -1.1);
    return done(k);
  },
  zuri: (k) => {
    outfitterBody(k);
    bareArms(k, 'skin');
    feathers(k, [0x2a6a5a, 0x8a3a1a, 0xa08a2a]);
    charms(k, k.t.bone, 7, 0.06);
    warPaint(k, 0xd8d0b8);
    hold(k, bowProp(k, true), -0.2);
    return done(k);
  },
};

/** The outfitter's jerkin, belt, pouches, quiver and bedroll without headgear or cloak. */
function outfitterBody(k: Kit): void {
  const { t } = k;
  k.torso.add(d(cyl(0.26, 0.27, 0.48, t.leather, 0, 0.27, 0, 10), 'leather'));
  belt(k, t.leatherDark, 0.05);
  pouch(k.torso, t.leather, 0.17, -0.03, 0.17);
  quiver(k);
  bedroll(k, mat(0x4a4436));
  for (const a of [k.armL, k.armR]) a.add(d(cyl(0.085, 0.075, 0.13, t.leatherDark, 0, -0.3, 0, 8), 'leather'));
}

/** A town official: long coat, chain of office, a tall hood or cap, a staff of office. */
function civic(k: Kit, coatHex: number, _p: string): BipedRig {
  const coat = mat(coatHex);
  k.torso.add(d(cyl(0.27, 0.3, 0.56, coat, 0, 0.27, 0, 10), 'cloth'));
  coatSkirt(k, coat, 'cloth', 0.56, 0.42);
  sleeves(k, coat, 'cloth');
  mantle(k, k.t.fur, 'fur', 0.25, 0.54, 0.4);
  chainOfOffice(k, 0.21);
  belt(k, k.t.leatherDark, 0.04, 0.58);
  hood(k, k.t.dark, false, false);
  hold(k, staffProp(k, 0, 'ring'), -0.12);
  return done(k);
}

const ROLE: Record<Role, (k: Kit) => BipedRig> = {
  smith, mage, outfit: outfitter, bank: banker, travel: captain, ferry: ferryman, carter,
  quest: (k) => civic(k, k.t.darkHex, 'staff'),
  trainer: mage,
  special: outfitter,
};

/** The grim painted-style model of any NPC (bespoke when it has a unique role). */
export function grimKitNpc(def: NpcDef): BipedRig {
  const k = startKit(def);
  const u = UNIQUE[def.key];
  return u ? u(k) : ROLE[k.who.role](k);
}

import * as THREE from 'three';
import { PALETTE, type Outfit } from '../../game/player/outfits';
import { ITEMS } from '../../game/inventory/items';
import { buildArmour, buildBoot, buildHelm, buildLegArmour } from './gear3d';
import { gearLook } from './gearLooks';
import { CLOAK_LOOK, type CloakId } from '../../game/premium/premium';
import { box, collectMaterials, cone, cyl, group, mat, matCache, sphere, type Mat } from './parts';
import type { BipedRig } from './rigs';
import { ARMOR_LOOK, makeShield, makeWeapon } from './weapons';
import { buildCape } from './capes3d';

/**
 * Chunky humanoid builder shared by NPC outfits and humanoid monsters (players: playerModel.ts).
 * applyGear dresses any biped, players included.
 * Proportions favour the top-down view: oversized head and headgear, broad
 * shoulders, and weapons that stick out past the silhouette.
 */
export type HeadStyle =
  | 'helm' | 'hood' | 'wizardHat' | 'hair' | 'featherHat' | 'hornHelm' | 'orc' | 'shaman'
  | 'warhelm' | 'elf' | 'troll' | 'ghoul' | 'demon' | 'brute'
  | 'minotaur' | 'cyclops' | 'dwarf' | 'barbarian' | 'frostkin' | 'iceWitch' | 'mummy' | 'lizard' | 'amazon' | 'valkyrie' | 'bandit'
  | 'greathelm' | 'cowl' | 'wardenHelm';
export type TorsoStyle = 'plate' | 'tunic' | 'robe' | 'coat' | 'furVest' | 'warplate' | 'vestment' | 'tabard';

export interface HumanoidSpec {
  skin: number;
  head: HeadStyle;
  torso: TorsoStyle;
  headColor: number;
  bodyColor: number;
  legsColor: number;
  feetColor: number;
  cape?: number | null;
  /** Cape length (default 0.58); long capes read as rank from above. */
  capeLength?: number;
  quiver?: boolean;
  bareArms?: boolean;
  bulk?: number;
  /** Membrane wings on the back (span). */
  wings?: number;
  /** Glowing eye colour. */
  eyeGlow?: number;
  /** Overall height multiplier of the legs (hunched or tall creatures). */
  legScale?: number;
}

export function outfitSpec(o: Outfit): HumanoidSpec {
  const c = (i: number) => PALETTE[i] ?? 0x888888;
  const base = { skin: 0xe7b48a, headColor: c(o.head), bodyColor: c(o.body), legsColor: c(o.legs), feetColor: c(o.feet) };
  switch (o.type) {
    case 'knight': return { ...base, head: 'helm', torso: 'plate', cape: c(o.legs) };
    case 'ranger': return { ...base, head: 'hood', torso: 'tunic', quiver: true };
    case 'mage': return { ...base, head: 'wizardHat', torso: 'robe' };
    case 'citizen': return { ...base, head: 'hair', torso: 'tunic' };
    case 'noble': return { ...base, head: 'featherHat', torso: 'coat', cape: c(o.legs) };
    case 'barbarian': return { ...base, head: 'hornHelm', torso: 'furVest', bareArms: true, bulk: 1.08 };
    // premium: a heavy field commander in dark iron with a spiked crown helm
    case 'warlord': return { ...base, head: 'greathelm', torso: 'warplate', cape: c(o.legs), capeLength: 0.72, bulk: 1.12 };
    // premium: a hooded seer in floor-length vestments, face lost in shadow
    case 'mystic': return { ...base, head: 'cowl', torso: 'vestment' };
    // founder: a stately guardian, crested helm and a long tabard over bright plate
    case 'warden': return { ...base, head: 'wardenHelm', torso: 'tabard', cape: c(o.legs), capeLength: 0.86, bulk: 1.05 };
  }
}

/** NPC townsfolk (player characters use playerModel.ts). */
export function buildOutfitRig(o: Outfit): BipedRig {
  return slimmer(buildHumanoid(outfitSpec(o)));
}

/**
 * Slims a chunky humanoid towards the player proportions (owner, 2026-10-21: "slimmer,
 * not like Minecraft"): narrower torso, thinner and longer limbs, a smaller head. Only
 * group scales change, so held props and any gear stay attached where they were.
 */
function slimmer(rig: BipedRig): BipedRig {
  const leg = 1.08;
  const lift = 0.62 * (leg - 1);
  rig.torso.scale.set(0.88, 1, 0.85);
  for (const l of [rig.legL, rig.legR]) {
    l.scale.set(0.84, leg, 0.84);
    l.position.x *= 0.88;
    l.position.y += lift;
  }
  for (const a of [rig.armL, rig.armR]) {
    a.scale.set(0.84, 1.04, 0.84);
    a.position.x *= 0.88;
    a.position.y += lift;
  }
  rig.torso.position.y += lift;
  rig.head.position.y += lift;
  rig.head.scale.setScalar(0.9);
  for (const m of [rig.gear?.weaponMount, rig.gear?.shieldMount]) {
    if (m) m.scale.set(1 / 0.84, 1 / 1.04, 1 / 0.84);
  }
  rig.height += lift;
  return rig;
}

export function buildHumanoid(spec: HumanoidSpec): BipedRig {
  const skin = mat(spec.skin);
  const headM = mat(spec.headColor);
  const bodyM = mat(spec.bodyColor);
  const legsM = mat(spec.legsColor);
  const feetM = mat(spec.feetColor);
  const steel = mat(0xb9c1cc);
  const dark = mat(0x2a221c);
  const belt = mat(0x4a3322);
  const eye = spec.eyeGlow ? mat(spec.eyeGlow, { emissive: spec.eyeGlow }) : mat(0x14100c);
  const bulk = spec.bulk ?? 1;

  const root = new THREE.Group();
  const body = group();
  root.add(body);

  // legs
  const robe = spec.torso === 'robe' || spec.torso === 'vestment';
  const armoured = spec.torso === 'plate' || spec.torso === 'warplate' || spec.torso === 'tabard';
  const gold = mat(0xe0b03c);
  const iron = mat(0x4f545d);
  // outermost front/back of the torso, so cloaks and clasps sit clear of tabards and armour
  let front = 0.2;
  let back = -0.2;
  const mkLeg = (x: number) => group(x, 0.62, 0,
    box(0.17 * bulk, 0.38, 0.2 * bulk, robe ? dark : legsM, 0, -0.18, 0),
    box(0.2 * bulk, 0.2, 0.3, feetM, 0, -0.52, 0.04),
  );
  const legL = mkLeg(0.13);
  const legR = mkLeg(-0.13);

  // torso
  const torso = group(0, 0.62, 0);
  const tw = 0.54 * bulk;
  switch (spec.torso) {
    case 'plate':
      torso.add(box(tw, 0.52, 0.34, steel, 0, 0.27, 0));
      torso.add(box(tw * 0.8, 0.46, 0.04, bodyM, 0, 0.24, 0.18)); // surcoat front
      torso.add(box(tw * 0.8, 0.46, 0.04, bodyM, 0, 0.24, -0.18));
      torso.add(box(tw * 0.82, 0.06, 0.36, bodyM, 0, 0.53, 0));
      break;
    case 'tunic':
      torso.add(box(tw, 0.52, 0.32, bodyM, 0, 0.27, 0));
      torso.add(box(tw * 0.5, 0.06, 0.33, mat(new THREE.Color(spec.bodyColor).multiplyScalar(0.7).getHex()), 0, 0.5, 0));
      break;
    case 'coat':
      torso.add(box(tw, 0.54, 0.34, bodyM, 0, 0.28, 0));
      torso.add(box(tw * 0.9, 0.36, 0.06, bodyM, 0, -0.08, -0.15)); // coat tails
      torso.add(box(0.08, 0.5, 0.36, mat(0xf2ecdc), 0, 0.28, 0.005)); // shirt front
      torso.add(box(0.05, 0.04, 0.37, mat(0xe0b03c), 0, 0.4, 0));
      break;
    case 'robe': {
      torso.add(box(tw * 0.95, 0.52, 0.32, bodyM, 0, 0.27, 0));
      const skirt = cyl(0.27 * bulk, 0.36 * bulk, 0.62, bodyM, 0, -0.27, 0, 8);
      torso.add(skirt);
      torso.add(box(0.1, 0.9, 0.36, legsM, 0, 0.0, 0.01)); // sash / trim
      break;
    }
    case 'furVest':
      torso.add(box(tw, 0.52, 0.32, skin, 0, 0.27, 0));
      torso.add(box(tw + 0.04, 0.4, 0.34, bodyM, 0, 0.3, -0.01));
      torso.add(box(tw * 0.3, 0.42, 0.35, skin, 0, 0.29, 0.005));
      torso.add(box(tw + 0.06, 0.26, 0.38, legsM, 0, -0.04, 0)); // kilt
      break;
    case 'warplate': {
      // dark iron cuirass; the colour lives on the sash, tassets and pauldron rims so any palette reads
      torso.add(box(tw, 0.54, 0.36, iron, 0, 0.27, 0));
      torso.add(box(tw * 0.62, 0.3, 0.04, steel, 0, 0.34, 0.185)); // raised chest plate
      torso.add(cyl(0.15, 0.19, 0.1, iron, 0, 0.56, 0, 8)); // gorget
      const sash = box(0.11, 0.66, 0.45, legsM, 0, 0.27, 0);
      sash.rotation.z = 0.62;
      torso.add(sash); // commander's sash, deep enough to stay over worn armour
      for (let i = 0; i < 2; i++) torso.add(box(tw + 0.08 - i * 0.04, 0.13, 0.4 - i * 0.02, bodyM, 0, -0.02 - i * 0.12, 0)); // tassets
      torso.add(box(tw + 0.09, 0.025, 0.41, dark, 0, -0.085, 0));
      for (const s of [-1, 1]) {
        // layered pauldrons stand out past the silhouette from above
        torso.add(box(0.24, 0.1, 0.34, iron, s * (tw / 2 + 0.06), 0.52, 0));
        torso.add(box(0.22, 0.08, 0.31, steel, s * (tw / 2 + 0.07), 0.44, 0));
        torso.add(box(0.25, 0.03, 0.35, bodyM, s * (tw / 2 + 0.06), 0.575, 0));
        torso.add(cone(0.035, 0.12, steel, s * (tw / 2 + 0.08), 0.62, 0, 4));
      }
      front = 0.23;
      back = -0.23;
      break;
    }
    case 'vestment': {
      torso.add(box(tw * 0.92, 0.52, 0.32, bodyM, 0, 0.27, 0));
      torso.add(cyl(0.26 * bulk, 0.42 * bulk, 0.74, bodyM, 0, -0.33, 0, 8)); // floor-length skirt
      torso.add(cyl(0.425 * bulk, 0.425 * bulk, 0.07, legsM, 0, -0.66, 0, 8)); // hem band
      torso.add(cyl(0.15, 0.33 * bulk, 0.3, legsM, 0, 0.44, 0, 8)); // sloped shoulder mantle: a coloured ring round the hood from above
      torso.add(cyl(0.335 * bulk, 0.335 * bulk, 0.035, feetM, 0, 0.3, 0, 8)); // mantle edge
      torso.add(cyl(0.27 * bulk, 0.29 * bulk, 0.06, feetM, 0, 0.05, 0, 8)); // cord belt
      const charmM = mat(0xcfe8ff, { emissive: 0x2a4a6a });
      torso.add(box(0.015, 0.2, 0.015, dark, 0, 0.26, 0.19)); // talisman cord
      const disc = cyl(0.075, 0.075, 0.025, feetM, 0, 0.13, 0.2, 8);
      disc.rotation.x = Math.PI / 2;
      torso.add(disc);
      torso.add(sphere(0.03, charmM, 0, 0.13, 0.215)); // glowing eye stone
      for (const s of [-1, 1]) torso.add(box(0.03, 0.22, 0.03, feetM, s * 0.1, -0.08, 0.28)); // cord tassels
      front = 0.24;
      back = -0.24;
      break;
    }
    case 'tabard': {
      // bright plate under a long tabard with a gold crest: reads as rank in any colour
      torso.add(box(tw, 0.52, 0.34, steel, 0, 0.27, 0));
      torso.add(cyl(0.16, 0.2, 0.08, gold, 0, 0.56, 0, 10)); // gold collar
      for (const z of [0.225, -0.225]) {
        const sz = Math.sign(z);
        torso.add(box(tw * 0.66, 0.84, 0.035, bodyM, 0, 0.06, z)); // tabard panel, knee length
        torso.add(box(tw * 0.66 + 0.02, 0.05, 0.04, gold, 0, -0.36, z + sz * 0.002)); // gold hem
        torso.add(box(0.07, 0.84, 0.04, legsM, 0, 0.06, z + sz * 0.004)); // centre stripe
      }
      const crest = box(0.15, 0.15, 0.03, gold, 0, 0.32, 0.25);
      crest.rotation.z = Math.PI / 4;
      torso.add(crest);
      const crestIn = box(0.07, 0.07, 0.03, feetM, 0, 0.32, 0.262);
      crestIn.rotation.z = Math.PI / 4;
      torso.add(crestIn);
      for (const s of [-1, 1]) {
        torso.add(sphere(0.15, steel, s * (tw / 2 + 0.03), 0.5, 0, 1.2, 0.72, 1.2)); // rounded pauldrons
        torso.add(cyl(0.18, 0.18, 0.03, gold, s * (tw / 2 + 0.03), 0.47, 0, 10)); // gold rims
      }
      torso.add(box(tw + 0.03, 0.07, 0.48, belt, 0, 0.04, 0)); // belt over the tabard
      torso.add(box(0.09, 0.07, 0.03, gold, 0, 0.04, 0.245));
      front = 0.25;
      back = -0.25;
      break;
    }
  }
  if (spec.torso !== 'furVest' && !robe) torso.add(box(tw + 0.03, 0.08, 0.37, belt, 0, 0.04, 0));
  if (spec.torso === 'furVest') torso.add(box(tw + 0.07, 0.07, 0.4, belt, 0, 0.09, 0));

  // shoulder plates (show the worn body armour)
  const padMat = mat(0x888888);
  const pads = group(0, 0, 0,
    sphere(0.14, padMat, 0.31 * bulk, 0.5, 0, 1.15, 0.7, 1.15),
    sphere(0.14, padMat, -0.31 * bulk, 0.5, 0, 1.15, 0.7, 1.15),
  );
  torso.add(pads);

  let cape: THREE.Object3D | null = null;
  if (spec.cape !== undefined && spec.cape !== null) {
    const len = spec.capeLength ?? 0.58;
    // heavy torsos have deeper backs; hang the cape clear of them
    cape = group(0, 0.55, back < -0.2 ? back - 0.01 : -0.18, box(0.44 * bulk, len, 0.035, mat(spec.cape), 0, -len / 2, 0));
    cape.rotation.x = 0.12;
    torso.add(cape);
  }
  // remembered so applyGear can swap a founder cloak in and give the outfit cape back later
  torso.userData.ownCape = cape;
  torso.userData.bulk = bulk;
  torso.userData.front = front;
  torso.userData.back = back;
  if (spec.quiver) {
    const q = group(0.12, 0.36, -0.2,
      cyl(0.07, 0.06, 0.48, mat(0x6a4426), 0, 0, 0, 7),
      cone(0.02, 0.1, feetM, 0.02, 0.3, 0.02, 3),
      cone(0.02, 0.1, feetM, -0.03, 0.31, -0.01, 3),
      cone(0.02, 0.1, feetM, 0.0, 0.29, -0.03, 3),
    );
    q.rotation.z = -0.35;
    q.rotation.x = 0.15;
    torso.add(q);
  }

  // head (big, readable from above)
  const head = group(0, 1.24, 0);
  const face = (r: number) => {
    const parts = [
      sphere(r, skin, 0, 0, 0, 1, 1.02, 1),
      box(0.05, 0.05, 0.03, eye, 0.075, 0.02, r * 0.93),
      box(0.05, 0.05, 0.03, eye, -0.075, 0.02, r * 0.93),
    ];
    for (const p of parts) p.userData.face = true;
    head.add(...parts);
  };
  switch (spec.head) {
    case 'helm':
      head.add(cyl(0.2, 0.21, 0.32, steel, 0, 0, 0, 10));
      head.add(sphere(0.2, steel, 0, 0.15, 0, 1, 0.65, 1));
      head.add(box(0.3, 0.04, 0.05, eye, 0, 0.03, 0.2));
      head.add(box(0.04, 0.15, 0.05, eye, 0, -0.04, 0.205));
      head.add(box(0.1, 0.16, 0.44, headM, 0, 0.33, -0.04));
      head.add(box(0.08, 0.1, 0.2, headM, 0, 0.27, -0.3));
      break;
    case 'hood':
      face(0.19);
      head.add(sphere(0.235, headM, 0, 0.04, -0.04, 1, 1, 1.05));
      head.add(cone(0.13, 0.28, headM, 0, 0.0, -0.27, 6).rotateX(-Math.PI / 2 - 0.5));
      head.add(box(0.03, 0.18, 0.03, mat(0xf0f0f0), 0.16, 0.2, -0.08)); // feather
      break;
    case 'wizardHat':
      face(0.19);
      head.add(cyl(0.36, 0.36, 0.04, headM, 0, 0.14, 0, 12));
      head.add(cone(0.2, 0.52, headM, 0, 0.42, -0.03, 8).rotateX(-0.15));
      head.add(cyl(0.205, 0.205, 0.06, mat(new THREE.Color(spec.headColor).multiplyScalar(0.6).getHex()), 0, 0.18, 0, 10));
      head.add(box(0.16, 0.16, 0.1, mat(0xdcdcdc), 0, -0.17, 0.14)); // beard
      break;
    case 'hair':
      face(0.2);
      head.add(sphere(0.215, headM, 0, 0.07, -0.03, 1, 0.78, 1.02));
      break;
    case 'featherHat':
      face(0.19);
      head.add(cyl(0.34, 0.34, 0.035, mat(0x2a2420), 0, 0.15, 0, 12));
      head.add(cyl(0.18, 0.2, 0.16, mat(0x2a2420), 0, 0.24, 0, 10));
      head.add(box(0.06, 0.06, 0.56, headM, 0.12, 0.32, -0.08).rotateY(0.3));
      break;
    case 'hornHelm':
      face(0.2);
      head.add(sphere(0.215, mat(0x7d7066), 0, 0.09, 0, 1, 0.7, 1));
      head.add(cyl(0.22, 0.22, 0.06, headM, 0, 0.05, 0, 10));
      for (const s of [-1, 1]) {
        const horn = cone(0.06, 0.32, mat(0xece2c6), s * 0.24, 0.22, 0, 6);
        horn.rotation.z = -s * 0.9;
        head.add(horn);
      }
      head.add(box(0.2, 0.12, 0.09, mat(0x8a4a24), 0, -0.15, 0.15)); // beard
      break;
    case 'orc':
      face(0.21);
      head.add(sphere(0.09, headM, 0, 0.22, -0.06)); // topknot
      head.add(cone(0.05, 0.22, headM, 0, 0.12, -0.22, 5).rotateX(-2.2)); // braid
      head.add(cone(0.035, 0.12, mat(0xf0e6c8), 0.08, -0.1, 0.18, 4));
      head.add(cone(0.035, 0.12, mat(0xf0e6c8), -0.08, -0.1, 0.18, 4));
      head.add(sphere(0.06, skin, 0.22, 0.02, 0, 0.6, 1, 1.4)); // ears
      head.add(sphere(0.06, skin, -0.22, 0.02, 0, 0.6, 1, 1.4));
      break;
    case 'warhelm': {
      face(0.21);
      const iron = mat(0x5a5f68);
      head.add(sphere(0.225, iron, 0, 0.1, -0.02, 1, 0.7, 1.02));
      head.add(box(0.46, 0.05, 0.05, iron, 0, 0.04, 0.17));
      for (let i = 0; i < 3; i++) head.add(cone(0.04, 0.16, mat(0xd8dde6), (i - 1) * 0.12, 0.3, -0.02, 4));
      head.add(cone(0.035, 0.12, mat(0xf0e6c8), 0.08, -0.1, 0.18, 4));
      head.add(cone(0.035, 0.12, mat(0xf0e6c8), -0.08, -0.1, 0.18, 4));
      head.add(box(0.06, 0.1, 0.2, headM, 0, 0.36, -0.06));
      break;
    }
    case 'elf':
      face(0.19);
      head.add(sphere(0.21, headM, 0, 0.07, -0.05, 1, 0.8, 1.05));
      head.add(box(0.3, 0.32, 0.1, headM, 0, -0.08, -0.16)); // long hair
      for (const s of [-1, 1]) {
        const ear = cone(0.04, 0.2, skin, s * 0.21, 0.04, -0.02, 4);
        ear.rotation.z = -s * 1.2;
        head.add(ear);
      }
      head.add(box(0.36, 0.035, 0.04, mat(0xe0c060), 0, 0.12, 0.16).rotateX(-0.2)); // circlet
      break;
    case 'troll':
      face(0.22);
      head.add(cone(0.06, 0.2, skin, 0, -0.02, 0.27, 5).rotateX(Math.PI / 2));
      head.add(sphere(0.1, headM, 0, 0.2, -0.04, 1.4, 0.6, 1.2));
      head.add(cone(0.03, 0.1, mat(0xf0e6c8), 0.09, -0.12, 0.19, 4).rotateX(Math.PI));
      head.add(sphere(0.07, skin, 0.24, 0.04, 0, 0.5, 1, 1.3));
      head.add(sphere(0.07, skin, -0.24, 0.04, 0, 0.5, 1, 1.3));
      break;
    case 'ghoul':
      head.add(sphere(0.2, skin, 0, 0, 0, 1, 1.05, 1));
      head.add(box(0.07, 0.07, 0.03, eye, 0.075, 0.03, 0.19));
      head.add(box(0.07, 0.07, 0.03, eye, -0.075, 0.03, 0.19));
      head.add(box(0.18, 0.05, 0.08, mat(0x3a1a14), 0, -0.12, 0.16)); // gaping mouth
      head.add(sphere(0.12, headM, 0, 0.16, -0.06, 1.3, 0.4, 1.2)); // patchy hair
      break;
    case 'demon': {
      face(0.23);
      const horn = mat(0x2a1a14);
      for (const s of [-1, 1]) {
        const h1 = cone(0.07, 0.3, horn, s * 0.18, 0.22, -0.02, 6);
        h1.rotation.z = -s * 0.6;
        h1.rotation.x = -0.3;
        head.add(h1);
        const h2 = cone(0.045, 0.22, horn, s * 0.3, 0.42, -0.1, 6);
        h2.rotation.z = s * 0.2;
        h2.rotation.x = -0.6;
        head.add(h2);
      }
      head.add(box(0.2, 0.05, 0.06, mat(0xf0e6c8), 0, -0.12, 0.2)); // fangs
      break;
    }
    case 'brute':
      face(0.24);
      head.add(box(0.36, 0.08, 0.1, skin, 0, 0.1, 0.18)); // heavy brow
      head.add(cone(0.05, 0.16, mat(0xf0e6c8), 0.12, -0.14, 0.2, 4));
      head.add(cone(0.05, 0.16, mat(0xf0e6c8), -0.12, -0.14, 0.2, 4));
      for (const s of [-1, 1]) {
        const h = cone(0.06, 0.26, mat(0xd8d0b8), s * 0.22, 0.2, -0.04, 5);
        h.rotation.z = -s * 0.9;
        head.add(h);
      }
      break;
    case 'minotaur': {
      face(0.23);
      head.add(box(0.26, 0.17, 0.2, skin, 0, -0.08, 0.2)); // muzzle
      head.add(box(0.2, 0.06, 0.04, mat(0x2a1a14), 0, -0.07, 0.305)); // nostrils
      head.add(cyl(0.05, 0.05, 0.015, mat(0xe0b03c), 0, -0.15, 0.3, 8).rotateX(Math.PI / 2)); // nose ring
      head.add(sphere(0.12, headM, 0, 0.2, -0.02, 1.4, 0.5, 1.1)); // shaggy crown
      const hornM = mat(0xece2c6);
      for (const sx of [-1, 1]) {
        const base = cone(0.07, 0.3, hornM, sx * 0.3, 0.16, 0, 6);
        base.rotation.z = -sx * 1.25;
        head.add(base);
        const tip = cone(0.04, 0.18, hornM, sx * 0.42, 0.3, 0, 6);
        tip.rotation.z = -sx * 0.25;
        head.add(tip);
        head.add(sphere(0.06, skin, sx * 0.24, 0.0, -0.02, 1.3, 0.6, 0.9)); // ear
      }
      break;
    }
    case 'cyclops': {
      head.add(sphere(0.26, skin, 0, 0, 0, 1, 1, 1));
      head.add(sphere(0.1, mat(0xf4f0e6), 0, 0.05, 0.21, 1, 1, 0.6));
      head.add(sphere(0.05, mat(spec.eyeGlow ?? 0x3a2410, spec.eyeGlow ? { emissive: spec.eyeGlow } : {}), 0, 0.05, 0.27));
      head.add(box(0.34, 0.07, 0.1, skin, 0, 0.16, 0.18)); // heavy brow
      head.add(box(0.2, 0.05, 0.06, mat(0x3a1a14), 0, -0.13, 0.22)); // mouth
      head.add(cone(0.03, 0.08, mat(0xf0e6c8), 0.06, -0.12, 0.24, 4));
      head.add(sphere(0.07, headM, 0, 0.24, -0.04, 1.6, 0.5, 1.2)); // tuft of hair
      break;
    }
    case 'dwarf': {
      face(0.19);
      head.add(sphere(0.215, steel, 0, 0.09, -0.01, 1, 0.68, 1.02)); // iron cap
      head.add(cyl(0.22, 0.22, 0.05, mat(0x6b5a3a), 0, 0.05, 0, 10));
      head.add(box(0.04, 0.12, 0.04, steel, 0, 0.0, 0.2)); // nasal
      head.add(box(0.3, 0.3, 0.12, headM, 0, -0.22, 0.12)); // big beard
      head.add(cone(0.1, 0.18, headM, 0, -0.42, 0.13, 5).rotateX(Math.PI));
      head.add(box(0.26, 0.06, 0.06, headM, 0, -0.06, 0.19)); // moustache
      break;
    }
    case 'barbarian': {
      face(0.2);
      head.add(sphere(0.225, headM, 0, 0.08, -0.05, 1.05, 0.85, 1.05)); // wild mane
      head.add(box(0.36, 0.26, 0.12, headM, 0, -0.06, -0.16));
      for (const sx of [-1, 1]) head.add(cone(0.04, 0.3, headM, sx * 0.17, -0.2, 0.02, 5).rotateX(Math.PI)); // braids
      head.add(box(0.22, 0.18, 0.1, headM, 0, -0.17, 0.15)); // beard
      head.add(cyl(0.225, 0.225, 0.05, mat(0x8a6a4a), 0, 0.1, 0, 10)); // leather band
      break;
    }
    case 'frostkin': {
      // a small furry face peering out of a thick parka hood
      head.add(sphere(0.25, headM, 0, 0.02, -0.03, 1, 1, 1));
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 5, 12), mat(0xf4f4f0));
      trim.position.set(0, 0, 0.17);
      head.add(trim); // fur trim round the hood opening
      head.add(sphere(0.15, skin, 0, -0.01, 0.15, 1, 1, 0.6));
      head.add(sphere(0.045, eye, 0.06, 0.02, 0.24));
      head.add(sphere(0.045, eye, -0.06, 0.02, 0.24));
      head.add(cone(0.04, 0.1, mat(0xe0a030), 0, -0.05, 0.27, 4).rotateX(Math.PI / 2)); // beak-like nose
      break;
    }
    case 'iceWitch': {
      face(0.19);
      head.add(sphere(0.21, headM, 0, 0.06, -0.05, 1, 0.82, 1.05)); // white hair
      head.add(box(0.32, 0.46, 0.08, headM, 0, -0.16, -0.17));
      const ice = mat(0xbff0ff, { emissive: 0x1c5a78 });
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.42;
        const c = cone(0.04, i === 2 ? 0.34 : 0.22, ice, Math.sin(a) * 0.17, 0.24, Math.cos(a) * 0.1 - 0.02, 4);
        c.rotation.z = -Math.sin(a) * 0.4;
        head.add(c);
      }
      head.add(cyl(0.2, 0.2, 0.04, ice, 0, 0.14, 0, 10));
      break;
    }
    case 'mummy': {
      head.add(sphere(0.2, skin, 0, 0, 0, 1, 1.05, 1));
      const band = mat(new THREE.Color(spec.skin).multiplyScalar(0.72).getHex());
      for (let i = 0; i < 4; i++) {
        const r = cyl(0.205, 0.205, 0.03, band, 0, -0.14 + i * 0.09, 0, 10);
        r.rotation.z = (i % 2 ? 0.15 : -0.15);
        head.add(r);
      }
      head.add(box(0.2, 0.04, 0.03, mat(spec.eyeGlow ?? 0x1a1010, spec.eyeGlow ? { emissive: spec.eyeGlow } : {}), 0, 0.03, 0.19));
      break;
    }
    case 'lizard': {
      head.add(sphere(0.19, skin, 0, 0, -0.02, 1, 0.95, 1.1));
      head.add(box(0.2, 0.13, 0.24, skin, 0, -0.05, 0.22)); // snout
      head.add(box(0.18, 0.04, 0.22, mat(new THREE.Color(spec.skin).multiplyScalar(1.25).getHex()), 0, -0.12, 0.21)); // pale jaw
      const yellow = mat(0xf0d040, { emissive: 0x403000 });
      head.add(sphere(0.045, yellow, 0.12, 0.07, 0.14));
      head.add(sphere(0.045, yellow, -0.12, 0.07, 0.14));
      for (let i = 0; i < 4; i++) head.add(cone(0.04, 0.16 - i * 0.02, headM, 0, 0.2 - i * 0.02, 0.08 - i * 0.1, 4).rotateX(-0.4)); // crest
      break;
    }
    case 'amazon': {
      face(0.19);
      head.add(sphere(0.21, headM, 0, 0.07, -0.04, 1, 0.8, 1.05));
      const tail = cone(0.07, 0.42, headM, 0, -0.06, -0.3, 6);
      tail.rotation.x = -2.6;
      head.add(tail); // ponytail
      head.add(cyl(0.215, 0.215, 0.04, mat(0xc0402a), 0, 0.08, 0, 10)); // headband
      break;
    }
    case 'valkyrie': {
      face(0.19);
      head.add(box(0.32, 0.36, 0.1, headM, 0, -0.1, -0.15)); // braided hair
      head.add(cyl(0.21, 0.22, 0.2, steel, 0, 0.1, 0, 10));
      head.add(sphere(0.21, steel, 0, 0.18, 0, 1, 0.55, 1));
      for (const sx of [-1, 1]) {
        const wing = box(0.03, 0.22, 0.26, mat(0xf4f4f0), sx * 0.24, 0.24, -0.05);
        wing.rotation.z = -sx * 0.5;
        wing.rotation.x = -0.35;
        head.add(wing);
      }
      break;
    }
    case 'bandit': {
      face(0.2);
      head.add(sphere(0.218, headM, 0, 0.08, -0.03, 1, 0.75, 1.03)); // bandana
      head.add(cone(0.06, 0.2, headM, 0, 0.0, -0.25, 4).rotateX(-2.0)); // knot tail
      head.add(box(0.36, 0.12, 0.08, mat(0x2a221c), 0, -0.1, 0.15)); // face cloth
      break;
    }
    case 'greathelm': {
      // dark iron great helm with a crown of spikes and a horsehair tail: a commander, not a footman
      head.add(cyl(0.215, 0.235, 0.34, iron, 0, 0, 0, 10));
      head.add(sphere(0.215, iron, 0, 0.16, 0, 1, 0.55, 1));
      head.add(box(0.32, 0.045, 0.05, eye, 0, 0.04, 0.215)); // eye slit
      head.add(box(0.045, 0.14, 0.05, steel, 0, -0.06, 0.225)); // nasal bar
      head.add(cyl(0.24, 0.24, 0.06, headM, 0, 0.13, 0, 10)); // coloured crown band
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.62;
        const sp = cone(0.035, 0.15, steel, Math.sin(a) * 0.2, 0.22, Math.cos(a) * 0.2 - 0.01, 4);
        sp.rotation.x = Math.cos(a) * 0.25;
        sp.rotation.z = -Math.sin(a) * 0.25;
        head.add(sp);
      }
      head.add(box(0.09, 0.08, 0.26, headM, 0, 0.27, -0.12)); // plume root
      head.add(box(0.11, 0.36, 0.06, headM, 0, 0.06, -0.27)); // horsehair tail down the back
      for (const s of [-1, 1]) head.add(box(0.05, 0.16, 0.2, iron, s * 0.225, -0.13, 0.05)); // cheek guards
      break;
    }
    case 'cowl': {
      // deep seer's cowl: the face sinks into shadow and only two pale eyes show
      face(0.18);
      const rim = mat(new THREE.Color(spec.headColor).multiplyScalar(0.7).getHex());
      head.add(sphere(0.245, headM, 0, 0.05, -0.04, 1, 1.06, 1.1));
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.045, 5, 12), rim);
      lip.position.set(0, 0.02, 0.18);
      head.add(lip); // hood opening
      head.add(box(0.24, 0.13, 0.04, mat(0x120e16), 0, 0.06, 0.19)); // shadow over the brow
      const glow = mat(0xcfe8ff, { emissive: 0x6a9ac8 });
      head.add(box(0.05, 0.03, 0.02, glow, 0.065, 0.04, 0.215));
      head.add(box(0.05, 0.03, 0.02, glow, -0.065, 0.04, 0.215));
      const peak = cone(0.15, 0.34, headM, 0, 0.32, -0.04, 6);
      peak.rotation.x = 0.55; // peak curls forward, unlike the ranger hood's tail or the mage's hat
      head.add(peak);
      head.add(box(0.38, 0.3, 0.08, headM, 0, -0.14, -0.17)); // drape over the nape
      head.add(sphere(0.035, mat(spec.feetColor, { emissive: new THREE.Color(spec.feetColor).multiplyScalar(0.3).getHex() }), 0, 0.2, 0.2)); // brow jewel
      break;
    }
    case 'wardenHelm': {
      // bright great helm with a gold T-visor, a tall crest fan and swept gold wings
      head.add(cyl(0.21, 0.22, 0.32, steel, 0, 0, 0, 10));
      head.add(sphere(0.21, steel, 0, 0.15, 0, 1, 0.62, 1));
      head.add(box(0.3, 0.04, 0.05, eye, 0, 0.03, 0.2)); // visor slit
      head.add(box(0.05, 0.17, 0.05, gold, 0, -0.04, 0.212)); // gold nasal
      head.add(cyl(0.225, 0.225, 0.05, gold, 0, 0.12, 0, 10)); // gold brow band
      head.add(box(0.06, 0.05, 0.42, gold, 0, 0.27, -0.03)); // crest ridge
      head.add(box(0.045, 0.24, 0.5, headM, 0, 0.4, -0.06)); // crest fan
      for (const s of [-1, 1]) {
        const wing = box(0.03, 0.18, 0.3, gold, s * 0.23, 0.2, -0.08);
        wing.rotation.z = -s * 0.45;
        wing.rotation.y = s * 0.25;
        wing.rotation.x = -0.35;
        head.add(wing);
      }
      break;
    }
    case 'shaman':
      face(0.21);
      head.add(cyl(0.22, 0.22, 0.07, headM, 0, 0.1, 0, 10));
      for (let i = 0; i < 5; i++) {
        const f = box(0.04, 0.3, 0.05, mat([0xd84a3a, 0xf0d050, 0x3a8ad8][i % 3]), 0, 0.28, 0);
        f.position.set(Math.cos(i * 1.25 + 2) * 0.16, 0.26, Math.sin(i * 1.25 + 2) * 0.16 - 0.04);
        f.rotation.z = Math.cos(i * 1.25 + 2) * 0.4;
        head.add(f);
      }
      head.add(cone(0.035, 0.1, mat(0xf0e6c8), 0.08, -0.1, 0.18, 4));
      head.add(cone(0.035, 0.1, mat(0xf0e6c8), -0.08, -0.1, 0.18, 4));
      break;
  }

  // arms
  const sleeve = spec.bareArms ? skin : spec.torso === 'warplate' ? iron : armoured ? steel : bodyM;
  const handM = armoured ? mat(0x5d6674) : skin;
  const mkArm = (x: number) => group(x * bulk, 1.1, 0,
    box(0.14, 0.32, 0.15, sleeve, 0, -0.16, 0),
    box(0.14, 0.14, 0.15, handM, 0, -0.38, 0),
  );
  const armL = mkArm(0.36);
  const armR = mkArm(-0.36);
  const weaponMount = group(0, -0.44, 0.04);
  armR.add(weaponMount);
  const shieldMount = group(0.13, -0.3, 0.1);
  armL.add(shieldMount);

  body.add(legL, legR, torso, head, armL, armR);
  const wings: THREE.Group[] = [];
  if (spec.wings) {
    const span = spec.wings;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(span, span * 0.5);
    shape.lineTo(span * 0.9, -span * 0.2);
    shape.lineTo(span * 0.5, -span * 0.5);
    shape.lineTo(span * 0.2, -span * 0.6);
    shape.lineTo(0, -span * 0.3);
    const memM = new THREE.MeshToonMaterial({ color: new THREE.Color(spec.bodyColor).multiplyScalar(0.55), side: THREE.DoubleSide, gradientMap: (bodyM as THREE.MeshToonMaterial).gradientMap });
    for (const s of [-1, 1]) {
      const pivot = group(s * 0.12, 1.05, -0.2);
      const mem = new THREE.Mesh(new THREE.ShapeGeometry(shape), memM);
      mem.castShadow = true;
      mem.scale.x = s;
      mem.rotation.y = s * 0.5;
      pivot.add(mem);
      wings.push(pivot);
      body.add(pivot);
    }
  }
  const ls = spec.legScale ?? 1;
  if (ls !== 1) {
    legL.scale.y = legR.scale.y = ls;
    legL.position.y = legR.position.y = 0.62 * ls;
    for (const g of [torso, head, armL, armR, ...wings]) g.position.y += 0.62 * (ls - 1);
  }
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), new THREE.MeshBasicMaterial());
  hitbox.position.y = 0.8;
  hitbox.visible = false;
  root.add(hitbox);

  const rig: BipedRig = {
    type: 'biped', root, body, torso, head, armL, armR, legL, legR, cape,
    materials: [], hitbox, height: (spec.head === 'wizardHat' ? 1.95 : spec.head === 'wardenHelm' || spec.head === 'cowl' ? 1.85 : 1.75) + 0.62 * (ls - 1), restArm: -0.55,
    gear: { weaponMount, shieldMount, pads, padMat, skin, extras: [] }, wings,
  };
  pads.visible = false;
  refreshMaterials(rig);
  return rig;
}

function refreshMaterials(rig: BipedRig): void {
  rig.materials.length = 0;
  rig.materials.push(...collectMaterials(rig.body));
}

/** Equipment shown on a character: everything except rings, amulets and ammunition. */
export interface GearLook {
  weapon: string | null;
  shield: string | null;
  armor: string | null;
  head: string | null;
  legs: string | null;
  feet: string | null;
  /** Founder cloak (CloakId); shown over any armour, even with gear hidden. */
  cloak?: string | null;
  /** Worn cape item (slot `cape`, capes3d.ts): replaces the founder cloak, an armour set's cape and the outfit cape. */
  cape?: string | null;
}

/** Helmets that cover the nape (long hair, ponytails and braids hide under them). */
const NECK_HELMS = new Set<string>(['coif', 'hood', 'great', 'skull']);
/** Closed helmets that cover the chin (beards hide under them). */
const FACE_HELMS = new Set<string>(['great', 'full', 'skull']);

/** Dresses a rig in its equipment: held items, helmet, armour plates, greaves and boots. */
export function applyGear(rig: BipedRig, eq: GearLook): void {
  if (rig.prop) return; // NPCs keep their own held prop
  const g = rig.gear;
  if (!g) return;
  g.weaponMount.clear();
  g.shieldMount.clear();
  for (const x of g.extras) x.removeFromParent();
  g.extras.length = 0;
  const attach = (parent: THREE.Object3D, o: THREE.Object3D) => {
    parent.add(o);
    g.extras.push(o);
  };

  // one material per colour for this character's gear (each character keeps its own, so hit flashes stay per creature)
  const M = matCache();
  const w = makeWeapon(eq.weapon, M);
  if (w) g.weaponMount.add(w);
  const s = makeShield(eq.shield, M);
  if (s) g.shieldMount.add(s);

  // body armour: plates, pauldrons, belt, cape, sleeves and gauntlets
  const armor = eq.armor ? ITEMS[eq.armor] : undefined;
  g.pads.visible = false;
  if (armor) {
    const lk = gearLook(armor, ARMOR_LOOK[armor.id]?.color);
    // a worn cape item takes the place of the set's own cape
    const parts = buildArmour(eq.cape ? { ...lk, cape: undefined } : lk, M);
    for (const o of parts.torso) attach(rig.torso, o);
    for (const o of parts.armL) attach(rig.armL, o);
    for (const o of parts.armR) attach(rig.armR, o);
  }

  // helmet replaces the outfit's headgear while worn; on players (playerModel.ts) hair is
  // tagged: crown hair always hides, long hair and beards only under helmets that cover them
  const helmDef = eq.head ? ITEMS[eq.head] : undefined;
  const h = helmDef ? HELMETS[helmDef.id] : undefined;
  const helmLook = helmDef ? gearLook(helmDef, h?.color, h?.trim) : undefined;
  for (const c of rig.head.children) {
    if (c.userData.face) continue;
    const cover = c.userData.cover as string | undefined;
    if (!helmLook || !cover) c.visible = !helmLook;
    else if (helmLook.helm === 'circlet') c.visible = true;
    else if (cover === 'back') c.visible = !NECK_HELMS.has(helmLook.helm);
    else if (cover === 'beard') c.visible = !FACE_HELMS.has(helmLook.helm);
    else c.visible = false;
  }
  if (helmDef && helmLook) {
    const hasFace = rig.head.children.some((c) => c.userData.face);
    const hg = buildHelm(helmLook, M);
    if (!hasFace) {
      hg.add(sphere(0.19, g.skin, 0, 0, 0, 1, 1.02, 1));
      hg.add(box(0.05, 0.05, 0.03, M(0x14100c), 0.075, 0.02, 0.18));
      hg.add(box(0.05, 0.05, 0.03, M(0x14100c), -0.075, 0.02, 0.18));
    }
    attach(rig.head, hg);
  }

  // leg armour and boots
  const legDef = eq.legs ? ITEMS[eq.legs] : undefined;
  const bootDef = eq.feet ? ITEMS[eq.feet] : undefined;
  const legLook = legDef ? gearLook(legDef, LEGS[legDef.id]) : undefined;
  const bootLook = bootDef ? gearLook(bootDef, BOOTS[bootDef.id]) : undefined;
  for (const leg of [rig.legL, rig.legR]) {
    const side = leg.position.x >= 0 ? 1 : -1;
    if (legLook) {
      const p = buildLegArmour(legLook, M, side);
      for (const o of p.leg) attach(leg, o);
      for (const o of p.torso) attach(rig.torso, o);
    }
    if (bootLook) for (const o of buildBoot(bootLook, M, side)) attach(leg, o);
  }

  // founder cloak: replaces the outfit cape while worn and takes over its sway (CreatureView animates rig.cape)
  const own = rig.torso.userData.ownCape as THREE.Object3D | null | undefined;
  const cl = !eq.cape && eq.cloak && eq.cloak in CLOAK_LOOK ? CLOAK_LOOK[eq.cloak as CloakId] : undefined;
  if (own !== undefined) {
    if (own) own.visible = !cl && !eq.cape;
    rig.cape = own;
  }
  // worn cape item: sized to the torso as dressed above, swings like any cape (rig.cape)
  // the body armour's own short cape goes under a worn cape item (no double cape poking through)
  for (const c of rig.torso.children) if (c.userData.armourCape) c.visible = !eq.cape;
  const worn = eq.cape ? buildCape(rig, eq.cape, M, own ?? null) : null;
  if (worn) {
    attach(rig.torso, worn.mantle);
    attach(rig.torso, worn.pivot);
    rig.cape = worn.pivot;
  }
  if (cl) {
    // any worn body armour now has plates, so the cloak always sits clear of it
    const cloak = buildCloak(rig, cl.main, cl.trim, !!armor);
    attach(rig.torso, cloak.mantle);
    attach(rig.torso, cloak.pivot);
    rig.cape = cloak.pivot;
  }

  rig.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== rig.hitbox) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  refreshMaterials(rig);
}

/**
 * A long founder cloak: a mantle over the shoulders (what the tilted top-down camera
 * mostly sees) plus a back panel down to the calves with a trim hem and a clasp.
 */
function buildCloak(rig: BipedRig, main: number, trim: number, breastplate: boolean): { mantle: THREE.Group; pivot: THREE.Group } {
  const bulk = (rig.torso.userData.bulk as number | undefined) ?? 1;
  // clear the deepest back surface: outfit torso, or a worn breastplate (z -0.215)
  const back = Math.min((rig.torso.userData.back as number | undefined) ?? -0.2, breastplate ? -0.22 : -0.2) - 0.02;
  const front = Math.max((rig.torso.userData.front as number | undefined) ?? 0.2, breastplate ? 0.22 : 0.2);
  const mainM = mat(main);
  const trimM = mat(trim);
  const w = 0.62 * bulk;
  const len = 1.02;
  const pivot = group(0, 0.6, back,
    box(w, len, 0.04, mainM, 0, -len / 2, 0),
    box(w + 0.02, 0.07, 0.05, trimM, 0, -len + 0.03, 0), // hem stripe
    box(0.06, len - 0.1, 0.05, trimM, w / 2 - 0.02, -len / 2 + 0.03, 0), // edge trims
    box(0.06, len - 0.1, 0.05, trimM, -w / 2 + 0.02, -len / 2 + 0.03, 0),
  );
  pivot.rotation.x = 0.12;
  // shoulder mantle over the pauldrons, open at the front, pinned by a clasp at the collar
  const mw = 0.72 * bulk;
  const depth = front - back;
  const mantle = group(0, 0, 0,
    box(mw, 0.08, depth * 0.62, mainM, 0, 0.62, back + depth * 0.31),
    box(mw + 0.02, 0.03, 0.04, trimM, 0, 0.6, back + depth * 0.62),
    box(0.06, 0.06, 0.05, trimM, 0.12, 0.6, front - 0.02), // clasp halves
    box(0.06, 0.06, 0.05, trimM, -0.12, 0.6, front - 0.02),
    box(0.26, 0.025, 0.03, trimM, 0, 0.6, front),
  );
  for (const s of [-1, 1]) mantle.add(box(0.07, 0.18, depth * 0.6, mainM, s * (mw / 2 - 0.02), 0.52, back + depth * 0.32)); // drape over each shoulder
  return { mantle, pivot };
}

export interface HelmLook {
  color: number;
  shape: 'cap' | 'coif' | 'helm' | 'horned' | 'circlet' | 'crested' | 'winged';
  trim?: number;
}

export const HELMETS: Record<string, HelmLook> = {
  leather_helmet: { color: 0x8a5a32, shape: 'cap' },
  chain_helmet: { color: 0xa9b2bf, shape: 'coif' },
  iron_helmet: { color: 0xc9d0da, shape: 'helm', trim: 0x6b7380 },
  orc_warhelm: { color: 0x5a5f68, shape: 'horned', trim: 0xd8dde6 },
  elven_circlet: { color: 0xe0c060, shape: 'circlet', trim: 0x7ad08a },
  dragon_helm: { color: 0x3f9a52, shape: 'crested', trim: 0xe0b03c },
  demon_helm: { color: 0x5a1010, shape: 'horned', trim: 0x2a1a14 },
  fur_cap: { color: 0xd8ccb4, shape: 'cap', trim: 0x8a6a4a },
  dwarven_helmet: { color: 0xb08a4a, shape: 'helm', trim: 0x5a606a },
  winged_helmet: { color: 0xd8dde6, shape: 'winged', trim: 0xf0f0f0 },
  frost_circlet: { color: 0xbfe6f5, shape: 'circlet', trim: 0x6ac8ff },
  frost_helm: { color: 0xbfe6f5, shape: 'crested', trim: 0x5a8ab0 },
  steel_helmet: { color: 0xc9d0da, shape: 'helm', trim: 0x4a4e56 },
  starsteel_helm: { color: 0x5a8ad8, shape: 'crested', trim: 0xc9d0da },
  darkstone_helm: { color: 0x4a2a5a, shape: 'horned', trim: 0x8a6aa0 },
  ironjaw_helm: { color: 0x3a3a3a, shape: 'horned', trim: 0xe0b03c },
  sandking_crown: { color: 0xffd040, shape: 'circlet', trim: 0x3a8ad0 },
};

export const LEGS: Record<string, number> = {
  fur_legs: 0xd8ccb4, dwarven_legs: 0xb08a4a, frost_legs: 0xbfe6f5,
  leather_legs: 0x8a5a32, chain_legs: 0xa9b2bf, plate_legs: 0xd4dae4, elven_leggings: 0x9ad0a0, hydra_legs: 0x2f7a5a, demon_legs: 0x7a1a1a,
  iron_legs: 0x9aa0aa, starsteel_legs: 0x5a8ad8, darkstone_legs: 0x4a2a5a,
  labyrinth_greaves: 0x6a3a1a,
};

export const BOOTS: Record<string, number> = {
  fur_boots: 0xd8ccb4, glacier_boots: 0x9fd8f0,
  leather_boots: 0x6a4426, traveler_boots: 0x8a6a3e, steel_boots: 0xc9d0da, emberwalk_boots: 0xd0501a, windstride_boots: 0x9fe8ff,
  tidecrest_boots: 0x3a6ad0,
};

// every helmet, legs and boots item has a colour entry (older code and tests read these tables)
for (const d of Object.values(ITEMS)) {
  if (d.kind === 'helmet' && !HELMETS[d.id]) HELMETS[d.id] = { color: gearLook(d).m[1], trim: gearLook(d).t[1], shape: 'helm' };
  if (d.kind === 'legs' && LEGS[d.id] === undefined) LEGS[d.id] = gearLook(d).m[1];
  if (d.kind === 'boots' && BOOTS[d.id] === undefined) BOOTS[d.id] = gearLook(d).m[1];
}

/** Attaches an arbitrary held object (an NPC's halberd, a shaman's staff). */
export function holdProp(rig: BipedRig, prop: THREE.Object3D): void {
  rig.gear?.weaponMount.clear();
  rig.gear?.weaponMount.add(prop);
  refreshMaterials(rig);
}

export type { Mat };

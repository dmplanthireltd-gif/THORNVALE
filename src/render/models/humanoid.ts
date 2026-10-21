import * as THREE from 'three';
import { PALETTE, type Outfit } from '../../game/player/outfits';
import { box, collectMaterials, cone, cyl, group, mat, sphere, type Mat } from './parts';
import type { BipedRig } from './rigs';
import { ARMOR_LOOK, makeShield, makeWeapon } from './weapons';

/**
 * Chunky humanoid builder shared by player outfits, NPCs and humanoid monsters.
 * Proportions favour the top-down view: oversized head and headgear, broad
 * shoulders, and weapons that stick out past the silhouette.
 */
export type HeadStyle =
  | 'helm' | 'hood' | 'wizardHat' | 'hair' | 'featherHat' | 'hornHelm' | 'orc' | 'shaman'
  | 'warhelm' | 'elf' | 'troll' | 'ghoul' | 'demon' | 'brute'
  | 'minotaur' | 'cyclops' | 'dwarf' | 'barbarian' | 'frostkin' | 'iceWitch' | 'mummy' | 'lizard' | 'amazon' | 'valkyrie' | 'bandit';
export type TorsoStyle = 'plate' | 'tunic' | 'robe' | 'coat' | 'furVest';

export interface HumanoidSpec {
  skin: number;
  head: HeadStyle;
  torso: TorsoStyle;
  headColor: number;
  bodyColor: number;
  legsColor: number;
  feetColor: number;
  cape?: number | null;
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
  }
}

export function buildOutfitRig(o: Outfit): BipedRig {
  return buildHumanoid(outfitSpec(o));
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
  const robe = spec.torso === 'robe';
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
  }
  if (spec.torso !== 'furVest' && spec.torso !== 'robe') torso.add(box(tw + 0.03, 0.08, 0.37, belt, 0, 0.04, 0));
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
    cape = group(0, 0.55, -0.18, box(0.44 * bulk, 0.58, 0.035, mat(spec.cape), 0, -0.29, 0));
    cape.rotation.x = 0.12;
    torso.add(cape);
  }
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
  const sleeve = spec.bareArms ? skin : spec.torso === 'plate' ? steel : bodyM;
  const handM = spec.torso === 'plate' ? mat(0x5d6674) : skin;
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
    materials: [], hitbox, height: (spec.head === 'wizardHat' ? 1.95 : 1.75) + 0.62 * (ls - 1), restArm: -0.55,
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
}

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

  const w = makeWeapon(eq.weapon);
  if (w) g.weaponMount.add(w);
  const s = makeShield(eq.shield);
  if (s) g.shieldMount.add(s);

  // body armour: shoulder plates plus a breastplate for heavy armour
  const look = eq.armor ? ARMOR_LOOK[eq.armor] : undefined;
  g.pads.visible = !!look;
  if (look) {
    g.padMat.color.setHex(look.color);
    const k = look.size / 0.14;
    g.pads.children.forEach((c) => c.scale.set(1.15 * k, 0.7 * k, 1.15 * k));
    if (look.plate) {
      const m = mat(look.color);
      attach(rig.torso, group(0, 0, 0,
        box(0.5, 0.36, 0.06, m, 0, 0.32, 0.185),
        box(0.5, 0.36, 0.06, m, 0, 0.32, -0.185),
        box(0.12, 0.06, 0.07, mat(0xe0b03c), 0, 0.42, 0.22),
      ));
    }
  }

  // helmet replaces the outfit's headgear while worn
  const helm = eq.head ? HELMETS[eq.head] : undefined;
  for (const c of rig.head.children) {
    if (!c.userData.face) c.visible = !helm;
  }
  if (helm) {
    const hasFace = rig.head.children.some((c) => c.userData.face);
    const hg = buildHelmet(helm);
    if (!hasFace) {
      hg.add(sphere(0.19, g.skin, 0, 0, 0, 1, 1.02, 1));
      hg.add(box(0.05, 0.05, 0.03, mat(0x14100c), 0.075, 0.02, 0.18));
      hg.add(box(0.05, 0.05, 0.03, mat(0x14100c), -0.075, 0.02, 0.18));
    }
    attach(rig.head, hg);
  }

  // greaves and boots
  const legLook = eq.legs ? LEGS[eq.legs] : undefined;
  const bootLook = eq.feet ? BOOTS[eq.feet] : undefined;
  for (const leg of [rig.legL, rig.legR]) {
    if (legLook) {
      const m = mat(legLook);
      attach(leg, group(0, 0, 0, box(0.19, 0.3, 0.22, m, 0, -0.17, 0), box(0.12, 0.08, 0.04, m, 0, -0.24, 0.12)));
    }
    if (bootLook) attach(leg, box(0.22, 0.22, 0.33, mat(bootLook), 0, -0.52, 0.045));
  }

  rig.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== rig.hitbox) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  refreshMaterials(rig);
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
};

export const LEGS: Record<string, number> = {
  fur_legs: 0xd8ccb4, dwarven_legs: 0xb08a4a, frost_legs: 0xbfe6f5,
  leather_legs: 0x8a5a32, chain_legs: 0xa9b2bf, plate_legs: 0xd4dae4, elven_leggings: 0x9ad0a0, hydra_legs: 0x2f7a5a, demon_legs: 0x7a1a1a,
  iron_legs: 0x9aa0aa, starsteel_legs: 0x5a8ad8, darkstone_legs: 0x4a2a5a,
};

export const BOOTS: Record<string, number> = {
  fur_boots: 0xd8ccb4, glacier_boots: 0x9fd8f0,
  leather_boots: 0x6a4426, traveler_boots: 0x8a6a3e, steel_boots: 0xc9d0da, emberwalk_boots: 0xd0501a, windstride_boots: 0x9fe8ff,
};

function buildHelmet(h: HelmLook): THREE.Group {
  const m = mat(h.color);
  const t = mat(h.trim ?? 0x3a3028);
  const g = group();
  switch (h.shape) {
    case 'cap':
      g.add(sphere(0.215, m, 0, 0.07, -0.01, 1, 0.75, 1.02));
      g.add(cyl(0.22, 0.22, 0.05, t, 0, 0.03, 0, 10));
      break;
    case 'coif':
      g.add(sphere(0.225, m, 0, 0.05, -0.03, 1, 0.85, 1.05));
      g.add(box(0.36, 0.16, 0.2, m, 0, -0.12, -0.08));
      break;
    case 'helm':
      g.add(cyl(0.21, 0.22, 0.3, m, 0, 0.02, 0, 10));
      g.add(sphere(0.21, m, 0, 0.16, 0, 1, 0.6, 1));
      g.add(box(0.04, 0.2, 0.06, t, 0, 0.0, 0.21));
      break;
    case 'horned':
      g.add(sphere(0.225, m, 0, 0.09, 0, 1, 0.75, 1));
      g.add(cyl(0.23, 0.23, 0.06, t, 0, 0.03, 0, 10));
      for (const sx of [-1, 1]) {
        const horn = cone(0.06, 0.34, t, sx * 0.25, 0.24, 0, 6);
        horn.rotation.z = -sx * 0.8;
        g.add(horn);
      }
      break;
    case 'circlet':
      g.add(cyl(0.215, 0.215, 0.05, m, 0, 0.1, 0, 12));
      g.add(sphere(0.045, t, 0, 0.12, 0.21));
      break;
    case 'winged':
      g.add(cyl(0.21, 0.22, 0.28, m, 0, 0.03, 0, 10));
      g.add(sphere(0.21, m, 0, 0.16, 0, 1, 0.6, 1));
      for (const sx of [-1, 1]) {
        const wing = box(0.03, 0.2, 0.26, t, sx * 0.23, 0.2, -0.04);
        wing.rotation.z = -sx * 0.5;
        wing.rotation.x = -0.3;
        g.add(wing);
      }
      break;
    case 'crested':
      g.add(cyl(0.21, 0.22, 0.3, m, 0, 0.02, 0, 10));
      g.add(sphere(0.21, m, 0, 0.16, 0, 1, 0.6, 1));
      g.add(box(0.06, 0.2, 0.44, t, 0, 0.3, -0.04));
      for (let i = 0; i < 3; i++) g.add(cone(0.035, 0.14, t, 0, 0.36, 0.12 - i * 0.14, 4));
      break;
  }
  return g;
}

/** Attaches an arbitrary held object (an NPC's halberd, a shaman's staff). */
export function holdProp(rig: BipedRig, prop: THREE.Object3D): void {
  rig.gear?.weaponMount.clear();
  rig.gear?.weaponMount.add(prop);
  refreshMaterials(rig);
}

export type { Mat };

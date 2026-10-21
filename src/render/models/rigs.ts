import * as THREE from 'three';
import { paletteIndex } from '../../game/player/outfits';
import type { NpcDef } from '../../game/npc/npcs';
import type { EnemyKind } from '../../game/world/WorldMap';
import { buildHumanoid, buildOutfitRig, holdProp } from './humanoid';
import { box, collectMaterials, cone, cyl, group, mat, sphere, type Mat } from './parts';
import { makeShield, makeWeapon } from './weapons';

/**
 * Animatable rigs. Every model faces +Z (local forward) and stands on y = 0.
 */
export interface BipedGear {
  weaponMount: THREE.Group;
  shieldMount: THREE.Group;
  pads: THREE.Group;
  padMat: Mat;
  skin: Mat;
  /** Helmet, breastplate, greaves and boots currently attached. */
  extras: THREE.Object3D[];
}

export interface BipedRig {
  type: 'biped';
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  cape: THREE.Object3D | null;
  materials: Mat[];
  hitbox: THREE.Mesh;
  height: number;
  restArm: number;
  gear?: BipedGear;
  wings?: THREE.Group[];
  /** Set when the rig holds a fixed prop instead of equipment. */
  prop?: boolean;
  /** Floats instead of walking (elementals). */
  hover?: boolean;
}

export interface QuadRig {
  type: 'quad';
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[]; // FL, FR, BL, BR
  tail: THREE.Group;
  wings: THREE.Group[];
  materials: Mat[];
  hitbox: THREE.Mesh;
  height: number;
}

export type Rig = BipedRig | QuadRig;

function makeHitbox(w: number, h: number, d: number): THREE.Mesh {
  const hb = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  hb.position.y = h / 2;
  hb.visible = false;
  return hb;
}

// ------------------------------------------------------------------ humanoids

// ------------------------------------------------------------------ humanoids

function finish(rig: BipedRig): BipedRig {
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

/** Arms a humanoid monster with item models. */
function armed(rig: BipedRig, weapon: string | null, shield: string | null = null, pads: number | null = null): BipedRig {
  const w = makeWeapon(weapon);
  const s = makeShield(shield);
  if (w) rig.gear!.weaponMount.add(w);
  if (s) rig.gear!.shieldMount.add(s);
  if (pads !== null) {
    rig.gear!.pads.visible = true;
    rig.gear!.padMat.color.setHex(pads);
  }
  return finish(rig);
}

function staff(top: number, glow: number, wood = 0x5a3a22): THREE.Group {
  return group(0, 0, 0,
    cyl(0.025, 0.03, 1.5, mat(wood), 0, 0.3, 0.04, 6),
    sphere(0.09, mat(0xe9e2c9), 0, 1.08, 0.04),
    sphere(0.06, mat(top, { emissive: glow }), 0, 1.2, 0.04),
  );
}

const PROPS: Record<NonNullable<NpcDef['prop']>, () => THREE.Group> = {
  halberd: () => {
    const leather = mat(0x6b4426);
    const steel = mat(0xc9d0da);
    return group(0, 0, 0,
      cyl(0.03, 0.03, 1.9, leather, 0, 0.45, 0.04, 6),
      box(0.03, 0.22, 0.22, steel, 0, 1.25, 0.12),
      cone(0.05, 0.25, steel, 0, 1.52, 0.04, 4),
    );
  },
  hammer: () => group(0, 0, 0, cyl(0.025, 0.03, 0.55, mat(0x6b4426), 0, 0.1, 0.04, 6), box(0.22, 0.12, 0.14, mat(0x5a606a), 0, 0.38, 0.04)),
  staff: () => staff(0x9fd0ff, 0x2a5a8a),
  book: () => group(0, 0.02, 0.12, box(0.26, 0.06, 0.2, mat(0x6a3a8a), 0, 0, 0), box(0.24, 0.065, 0.18, mat(0xf0e8d0), 0.01, 0, 0)),
  bow: () => {
    const b = makeWeapon('hunting_bow')!;
    return b;
  },
  oar: () => group(0, 0, 0, cyl(0.025, 0.025, 1.6, mat(0x8a6a3e), 0, 0.3, 0.04, 6), box(0.04, 0.4, 0.16, mat(0x8a6a3e), 0, -0.55, 0.04)),
  ledger: () => group(0, 0.02, 0.12, box(0.22, 0.05, 0.3, mat(0x7a3a24), 0, 0, 0), box(0.2, 0.055, 0.28, mat(0xf0e8d0), 0.01, 0, 0)),
};

export function buildNpc(def: NpcDef | undefined): BipedRig {
  const rig = buildOutfitRig(def?.look ?? {
    type: 'citizen', head: paletteIndex(2, 7), body: paletteIndex(4, 8), legs: paletteIndex(5, 13), feet: paletteIndex(5, 2),
  });
  if (def?.prop) {
    holdProp(rig, PROPS[def.prop]());
    rig.restArm = def.prop === 'book' || def.prop === 'ledger' ? -1.1 : -0.12;
  }
  rig.prop = true;
  return finish(rig);
}

type HSpec = Parameters<typeof buildHumanoid>[0];
const H = (spec: HSpec) => buildHumanoid(spec);

function orcBase(o: Partial<HSpec> = {}): BipedRig {
  return H({ skin: 0x6f9a3a, head: 'orc', torso: 'tunic', headColor: 0x2a2a20, bodyColor: 0x7a5a36, legsColor: 0x4a3a2a, feetColor: 0x3a2a1c, bulk: 1.1, ...o });
}

function elfBase(o: Partial<HSpec> = {}): BipedRig {
  return H({ skin: 0xf0d2b0, head: 'elf', torso: 'tunic', headColor: 0xf0e0a0, bodyColor: 0x3f7a3a, legsColor: 0x5a4a2a, feetColor: 0x4a3a22, ...o });
}

export function buildSkeleton(): BipedRig {
  const bone = mat(0xe8e0c6);
  const dark = mat(0x1a1612);
  const cloth = mat(0x4b3f5e);
  const root = new THREE.Group();
  const body = group();
  root.add(body);
  const mkLeg = (x: number) => group(x, 0.6, 0, cyl(0.04, 0.035, 0.32, bone, 0, -0.16, 0), cyl(0.035, 0.03, 0.26, bone, 0, -0.43, 0), box(0.1, 0.05, 0.18, bone, 0, -0.58, 0.04));
  const legL = mkLeg(0.11);
  const legR = mkLeg(-0.11);
  const torso = group(0, 0.6, 0,
    box(0.26, 0.1, 0.14, bone, 0, 0.02, 0),
    cyl(0.035, 0.035, 0.5, bone, 0, 0.27, -0.06),
    box(0.4, 0.05, 0.24, bone, 0, 0.26, 0),
    box(0.44, 0.05, 0.26, bone, 0, 0.36, 0),
    box(0.42, 0.05, 0.25, bone, 0, 0.46, 0),
    box(0.54, 0.07, 0.2, bone, 0, 0.55, 0),
    box(0.3, 0.32, 0.03, cloth, 0, 0.12, 0.11),
  );
  const head = group(0, 1.28, 0,
    sphere(0.2, bone, 0, 0.02, 0, 1, 1.05, 1.05),
    box(0.07, 0.07, 0.04, dark, 0.07, 0.03, 0.18),
    box(0.07, 0.07, 0.04, dark, -0.07, 0.03, 0.18),
    box(0.18, 0.07, 0.14, bone, 0, -0.14, 0.06),
  );
  const mkArm = (x: number) => group(x, 1.12, 0, cyl(0.035, 0.03, 0.3, bone, 0, -0.15, 0), cyl(0.03, 0.03, 0.26, bone, 0, -0.4, 0));
  const armL = mkArm(0.29);
  const armR = mkArm(-0.29);
  const rust = mat(0x8b5a3c);
  armR.add(group(0, -0.52, 0.04, box(0.18, 0.04, 0.04, rust, 0, 0, 0.04), box(0.07, 0.022, 0.62, rust, 0, 0, 0.36)));
  const buckler = group(0.08, -0.4, 0.06, cyl(0.2, 0.2, 0.05, mat(0x5a4632), 0, 0, 0, 7).rotateZ(Math.PI / 2));
  buckler.rotation.y = -0.4;
  armL.add(buckler);
  body.add(legL, legR, torso, head, armL, armR);
  const hitbox = makeHitbox(0.75, 1.55, 0.75);
  root.add(hitbox);
  return finish({ type: 'biped', root, body, torso, head, armL, armR, legL, legR, cape: null, materials: [], hitbox, height: 1.7, restArm: -0.5 });
}

function buildFireElemental(): BipedRig {
  const core = mat(0xffd23a, { emissive: 0xff8a10 });
  const outer = mat(0xff6a1a, { emissive: 0xc03000 });
  const dark = mat(0x5a1a08, { emissive: 0x401000 });
  const root = new THREE.Group();
  const body = group();
  root.add(body);
  const legL = group(0.12, 0.3, 0);
  const legR = group(-0.12, 0.3, 0);
  const torso = group(0, 0.3, 0,
    cone(0.42, 0.9, outer, 0, 0.1, 0, 7).rotateX(Math.PI),
    sphere(0.3, outer, 0, 0.5, 0, 1, 1.1, 1),
    sphere(0.2, core, 0, 0.5, 0.08),
  );
  const head = group(0, 1.18, 0,
    cone(0.24, 0.55, outer, 0, 0.1, 0, 6),
    box(0.07, 0.05, 0.03, dark, 0.08, 0, 0.2),
    box(0.07, 0.05, 0.03, dark, -0.08, 0, 0.2),
  );
  const mkArm = (x: number) => group(x, 1.0, 0, cone(0.1, 0.5, outer, 0, -0.22, 0, 5).rotateX(Math.PI), sphere(0.08, core, 0, -0.42, 0));
  const armL = mkArm(0.36);
  const armR = mkArm(-0.36);
  body.add(legL, legR, torso, head, armL, armR);
  const hitbox = makeHitbox(0.8, 1.5, 0.8);
  root.add(hitbox);
  return finish({ type: 'biped', root, body, torso, head, armL, armR, legL, legR, cape: null, materials: [], hitbox, height: 1.75, restArm: -0.3, hover: true });
}

function buildMonsterBiped(kind: EnemyKind): BipedRig | null {
  switch (kind) {
    case 'skeleton': return buildSkeleton();
    case 'orc': return armed(orcBase(), 'hatchet', 'wooden_shield');
    case 'orc_spearman': return armed(orcBase({ bodyColor: 0x8a6a40, head: 'orc' }), 'spear', null, 0x5a4030);
    case 'orc_shaman': {
      const r = orcBase({ skin: 0x7aa244, head: 'shaman', torso: 'robe', headColor: 0x8a3a2a, bodyColor: 0x5a4a6e, legsColor: 0xc9a04a, bulk: 1 });
      holdProp(r, staff(0x7affb0, 0x2a8a50));
      r.restArm = -0.12;
      return finish(r);
    }
    case 'orc_warrior': return armed(orcBase({ head: 'warhelm', torso: 'plate', headColor: 0x8a2a1a, bodyColor: 0x6a3a22 }), 'battle_axe', 'iron_shield', 0x6b7380);
    case 'orc_berserker': return armed(orcBase({ skin: 0x5f8a30, head: 'orc', torso: 'furVest', bareArms: true, bodyColor: 0x6a4a2a, legsColor: 0x7a2a1a, bulk: 1.2 }), 'double_axe');
    case 'orc_leader': return armed(orcBase({ head: 'warhelm', torso: 'plate', headColor: 0xd0a030, bodyColor: 0x8a1a1a, cape: 0x8a1a1a, bulk: 1.18 }), 'bastard_sword', 'iron_shield', 0xd0a030);
    case 'orc_warlord': return armed(orcBase({ skin: 0x5a7a2a, head: 'warhelm', torso: 'plate', headColor: 0x1a1a1a, bodyColor: 0x2a1a1a, cape: 0x1a1a1a, bulk: 1.3, eyeGlow: 0xff3a1a }), 'dragonbone_cleaver', 'tower_shield', 0x2a2a2a);
    case 'elf': return armed(elfBase(), 'iron_sword', 'wooden_shield');
    case 'elf_scout': return armed(elfBase({ bodyColor: 0x5a7a2a, headColor: 0xc08a40, quiver: true }), 'hunting_bow');
    case 'elf_arcanist': {
      const r = elfBase({ torso: 'robe', bodyColor: 0x2a6a6a, legsColor: 0xe0c060, headColor: 0xe8e8f0 });
      holdProp(r, staff(0x9affd0, 0x2a8a6a, 0xd8e8b0));
      r.restArm = -0.12;
      return finish(r);
    }
    case 'elf_warden': return armed(elfBase({ torso: 'plate', bodyColor: 0x2f6a3a, headColor: 0xf8f0c0, cape: 0x2f6a3a, quiver: true, bulk: 1.08 }), 'elven_longbow', null, 0x9ad0a0);
    case 'jungle_troll': return armed(H({ skin: 0x5f8a5a, head: 'troll', torso: 'furVest', bareArms: true, headColor: 0x2a3a1a, bodyColor: 0x7a5a2a, legsColor: 0x5a4a2a, feetColor: 0x5f8a5a, bulk: 1.15, legScale: 0.85 }), 'hatchet');
    case 'ghoul': {
      const r = H({ skin: 0x8a9a7a, head: 'ghoul', torso: 'tunic', bareArms: true, headColor: 0x3a3a2a, bodyColor: 0x4a4038, legsColor: 0x3a3028, feetColor: 0x8a9a7a, legScale: 0.85 });
      r.torso.rotation.x = 0.35; // hunched
      r.restArm = -0.9;
      return finish(r);
    }
    case 'behemoth': {
      const r = H({ skin: 0x8a7a6a, head: 'brute', torso: 'furVest', bareArms: true, headColor: 0x4a3a2a, bodyColor: 0x5a4030, legsColor: 0x4a3020, feetColor: 0x6a5a4a, bulk: 1.6, legScale: 1.15, eyeGlow: 0xffb030 });
      r.restArm = -0.3;
      return finish(r);
    }
    case 'demon': {
      const r = H({ skin: 0xb02a20, head: 'demon', torso: 'furVest', bareArms: true, headColor: 0x2a0a08, bodyColor: 0x6a1010, legsColor: 0x3a0a08, feetColor: 0x2a0a08, bulk: 1.35, legScale: 1.1, wings: 1.0, eyeGlow: 0xffd000 });
      r.restArm = -0.4;
      return finish(r);
    }
    case 'fire_elemental': return buildFireElemental();
    default: return null;
  }
}


// ------------------------------------------------------------------ quadrupeds

interface QuadOpts {
  color: number;
  belly: number;
  len: number;
  width: number;
  height: number;
  headR: number;
  snout: number;
  ears: 'round' | 'pointy' | 'horns' | 'none' | 'long' | 'antlers';
  tail: 'thin' | 'bushy' | 'dragon' | 'stinger' | 'stub';
  /** Ear colour (defaults to pink for round ears, fur otherwise). */
  earColor?: number;
  /** Colour of back spikes and horns. */
  spikeColor?: number;
  tailLen: number;
  eye: number;
  nose: number;
  wings?: number;
  spikes?: number;
  neck?: number;
  /** Leg pairs (spiders have four). */
  legPairs?: number;
  /** Splay legs sideways (spiders, crocodiles). */
  splay?: number;
  /** Number of heads (hydras). */
  heads?: number;
  /** Extra glow on the eyes. */
  glowEyes?: boolean;
}

function buildQuad(o: QuadOpts): QuadRig {
  const fur = mat(o.color);
  const belly = mat(o.belly);
  const eye = mat(o.eye, { emissive: o.glowEyes || o.eye === 0xffd23a || o.eye === 0xffb020 ? new THREE.Color(o.eye).multiplyScalar(0.5).getHex() : 0x000000 });
  const nose = mat(o.nose);
  const pink = mat(o.earColor ?? 0xd99a9a);

  const root = new THREE.Group();
  const body = group();
  root.add(body);
  body.add(sphere(0.5, fur, 0, o.height, 0, o.width, o.width * 0.9, o.len));
  body.add(sphere(0.5, belly, 0, o.height - o.width * 0.18, 0.02, o.width * 0.8, o.width * 0.6, o.len * 0.8));

  const neckLen = o.neck ?? 0;
  const head = group(0, o.height + o.width * 0.15 + neckLen * 0.6, o.len * 0.45 + neckLen * 0.5);
  if (neckLen > 0) {
    const neck = cyl(o.headR * 0.55, o.width * 0.28, neckLen * 1.2, fur, 0, o.height + o.width * 0.1 + neckLen * 0.3, o.len * 0.42 + neckLen * 0.22, 7);
    neck.rotation.x = 0.85;
    body.add(neck);
  }
  head.add(sphere(o.headR, fur, 0, 0, 0, 1, 0.85, 1.1));
  const snout = o.ears === 'horns' || o.ears === 'none'
    ? box(o.headR * 1.1, o.headR * 0.7, o.snout, fur, 0, -o.headR * 0.15, o.headR * 0.7 + o.snout / 2)
    : cone(o.headR * 0.62, o.snout, fur, 0, -o.headR * 0.15, o.headR * 0.7 + o.snout / 2, 6).rotateX(Math.PI / 2);
  head.add(snout);
  head.add(sphere(o.headR * 0.18, nose, 0, -o.headR * 0.05, o.headR * 0.7 + o.snout));
  head.add(sphere(o.headR * 0.17, eye, o.headR * 0.5, o.headR * 0.3, o.headR * 0.62));
  head.add(sphere(o.headR * 0.17, eye, -o.headR * 0.5, o.headR * 0.3, o.headR * 0.62));
  if (o.ears === 'round') {
    head.add(sphere(o.headR * 0.42, pink, o.headR * 0.6, o.headR * 0.75, -o.headR * 0.1, 1, 1, 0.4));
    head.add(sphere(o.headR * 0.42, pink, -o.headR * 0.6, o.headR * 0.75, -o.headR * 0.1, 1, 1, 0.4));
  } else if (o.ears === 'pointy') {
    head.add(cone(o.headR * 0.32, o.headR * 0.8, fur, o.headR * 0.5, o.headR * 0.95, -o.headR * 0.15, 4));
    head.add(cone(o.headR * 0.32, o.headR * 0.8, fur, -o.headR * 0.5, o.headR * 0.95, -o.headR * 0.15, 4));
  } else if (o.ears === 'long') {
    for (const s of [-1, 1]) {
      const ear = sphere(o.headR * 0.32, mat(o.earColor ?? o.color), s * o.headR * 0.42, o.headR * 1.35, -o.headR * 0.25, 0.7, 2.4, 0.45);
      ear.rotation.z = -s * 0.2;
      ear.rotation.x = -0.35;
      head.add(ear);
    }
  } else if (o.ears === 'antlers') {
    const antler = mat(o.spikeColor ?? 0xc8a878);
    for (const s of [-1, 1]) {
      const main = cyl(o.headR * 0.12, o.headR * 0.16, o.headR * 2.6, antler, s * o.headR * 0.6, o.headR * 1.5, -o.headR * 0.3, 5);
      main.rotation.z = -s * 0.45;
      main.rotation.x = -0.3;
      head.add(main);
      for (let i = 0; i < 3; i++) {
        const t = cyl(o.headR * 0.09, o.headR * 0.11, o.headR * 1.0, antler, s * o.headR * (0.75 + i * 0.25), o.headR * (1.3 + i * 0.45), -o.headR * (0.1 + i * 0.15), 4);
        t.rotation.z = s * 0.4;
        t.rotation.x = 0.4;
        head.add(t);
      }
      head.add(cone(o.headR * 0.2, o.headR * 0.45, mat(o.color), s * o.headR * 0.75, o.headR * 0.55, -o.headR * 0.1, 4).rotateZ(-s * 1.1));
    }
  } else if (o.ears === 'none') {
    head.add(box(o.headR * 1.0, o.headR * 0.25, o.snout * 0.9, belly, 0, -o.headR * 0.4, o.headR * 0.6 + o.snout / 2));
  } else {
    const hornM = mat(o.spikeColor ?? 0xece2c6);
    for (const s of [-1, 1]) {
      const h = cone(o.headR * 0.22, o.headR * 1.5, hornM, s * o.headR * 0.5, o.headR * 0.7, -o.headR * 0.55, 5);
      h.rotation.x = -1.0;
      h.rotation.z = -s * 0.35;
      head.add(h);
    }
    head.add(box(o.headR * 1.0, o.headR * 0.2, o.snout * 0.8, belly, 0, -o.headR * 0.42, o.headR * 0.6 + o.snout / 2)); // jaw
  }
  let headRoot: THREE.Group = head;
  const nHeads = o.heads ?? 1;
  if (nHeads > 1) {
    headRoot = group(head.position.x, head.position.y, head.position.z);
    head.position.set(0, 0, 0);
    for (let i = 0; i < nHeads; i++) {
      const h = i === 0 ? head : head.clone();
      const off = i - (nHeads - 1) / 2;
      h.position.set(off * o.headR * 2.2, Math.abs(off) < 0.1 ? o.headR * 0.8 : 0, -Math.abs(off) * o.headR * 0.6);
      h.rotation.y = -off * 0.35;
      const neck = cyl(o.headR * 0.4, o.headR * 0.55, o.height * 0.9, fur, h.position.x * 0.6, -o.height * 0.35 + h.position.y * 0.5, -o.headR * 0.8, 6);
      neck.rotation.x = 0.5;
      neck.rotation.z = -off * 0.4;
      headRoot.add(neck, h);
    }
  }
  body.add(headRoot);

  const legs: THREE.Group[] = [];
  const lx = o.width * 0.34;
  const lz = o.len * 0.3;
  const legTop = o.height - o.width * 0.2;
  const pairs = o.legPairs ?? 2;
  const splay = o.splay ?? 0;
  for (let i = 0; i < pairs; i++) {
    const z = pairs === 1 ? 0 : lz - (i / (pairs - 1)) * lz * 2;
    for (const x of [lx, -lx]) {
      const legLen = splay ? legTop * (1 + splay * 0.8) : legTop;
      const lg = group(x, legTop, z, cyl(o.width * 0.11 * (splay ? 0.5 : 1), o.width * 0.09 * (splay ? 0.5 : 1), legLen, fur, 0, -legLen / 2, 0, 6));
      lg.add(sphere(o.width * 0.11 * (splay ? 0.6 : 1), belly, 0, -legLen + 0.02, 0.03, 1, 0.6, 1.3));
      if (splay) lg.rotation.z = Math.sign(x) * splay;
      lg.userData.splay = lg.rotation.z;
      legs.push(lg);
      body.add(lg);
    }
  }

  const tail = group(0, o.height + o.width * 0.1, -o.len * 0.46);
  if (o.tail === 'thin') {
    tail.add(cyl(0.015, o.width * 0.05, o.tailLen, pink, 0, 0, -o.tailLen / 2, 5).rotateX(Math.PI / 2));
    tail.rotation.x = -0.25;
  } else if (o.tail === 'stub') {
    tail.add(sphere(o.width * 0.16, mat(o.belly), 0, 0, -0.02));
  } else if (o.tail === 'stinger') {
    // segmented tail arching up over the back, ending in a stinger
    let parent: THREE.Group = tail;
    const segs = 6;
    const shell = mat(o.color);
    for (let i = 0; i < segs; i++) {
      const r = o.width * 0.13 * (1 - i / (segs + 3));
      const segLen = o.tailLen / segs;
      const seg = group(0, 0, -segLen * 0.9);
      seg.add(sphere(r, shell, 0, 0, segLen / 2, 1, 0.9, 1.3));
      seg.rotation.x = 0.5;
      parent.add(seg);
      parent = seg;
    }
    parent.add(cone(o.width * 0.07, o.width * 0.32, mat(o.spikeColor ?? 0x2a1a10), 0, -o.width * 0.06, -o.width * 0.05, 5).rotateX(-2.4));
    tail.rotation.x = 0.1;
  } else if (o.tail === 'bushy') {
    tail.add(cone(o.width * 0.16, o.tailLen, fur, 0, 0, -o.tailLen / 2, 6).rotateX(-Math.PI / 2));
    tail.rotation.x = 0.45;
  } else {
    // segmented dragon tail with a barbed tip
    let parent: THREE.Group = tail;
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      const r = o.width * 0.22 * (1 - i / segs);
      const segLen = o.tailLen / segs;
      const seg = group(0, 0, -segLen);
      seg.add(cyl(r * 0.7, r, segLen, fur, 0, 0, segLen / 2, 6).rotateX(Math.PI / 2));
      parent.add(seg);
      parent = seg;
    }
    parent.add(cone(o.width * 0.12, o.width * 0.3, mat(0xece2c6), 0, 0, -o.width * 0.1, 4).rotateX(-Math.PI / 2));
    tail.position.z += o.tailLen / segs;
    tail.rotation.x = 0.15;
  }
  body.add(tail);

  // back spikes
  if (o.spikes) {
    const spikeM = o.spikeColor !== undefined ? mat(o.spikeColor, { emissive: new THREE.Color(o.spikeColor).multiplyScalar(0.25).getHex() }) : mat(0xece2c6);
    for (let i = 0; i < o.spikes; i++) {
      const z = o.len * 0.35 - (i / (o.spikes - 1)) * o.len * 0.8;
      body.add(cone(o.width * 0.07, o.width * 0.28, spikeM, 0, o.height + o.width * 0.42, z, 4));
    }
  }

  // membrane wings, folded along the back; they flap in the animation
  const wings: THREE.Group[] = [];
  if (o.wings) {
    const span = o.wings;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(span, span * 0.35);
    shape.lineTo(span * 0.95, -span * 0.25);
    shape.lineTo(span * 0.55, -span * 0.45);
    shape.lineTo(span * 0.25, -span * 0.55);
    shape.lineTo(0, -span * 0.35);
    const memM = new THREE.MeshToonMaterial({ color: o.belly, side: THREE.DoubleSide });
    const boneM = mat(o.color);
    for (const s of [-1, 1]) {
      const pivot = group(s * o.width * 0.3, o.height + o.width * 0.35, o.len * 0.1);
      const mem = new THREE.Mesh(new THREE.ShapeGeometry(shape), memM);
      mem.castShadow = true;
      mem.rotation.x = Math.PI / 2;
      mem.scale.x = s;
      pivot.add(mem);
      pivot.add(box(span * 1.05, 0.05, 0.05, boneM, s * span / 2, 0.01, span * 0.17).rotateY(s * -0.33));
      wings.push(pivot);
      body.add(pivot);
    }
  }

  const hb = makeHitbox(Math.max(0.7, o.width * 1.4), Math.max(0.7, o.height * 2.4), Math.max(0.8, o.len));
  root.add(hb);
  return { type: 'quad', root, body, head: headRoot, legs, tail, wings, materials: collectMaterials(body), hitbox: hb, height: o.height * 2 + 0.35 + (o.neck ?? 0) * 0.6 };
}

export function buildRat(): QuadRig {
  return buildQuad({
    color: 0x7a6a60, belly: 0xa79486, len: 0.62, width: 0.34, height: 0.2,
    headR: 0.12, snout: 0.12, ears: 'round', tail: 'thin', tailLen: 0.5, eye: 0x1a0a0a, nose: 0xd98c8c,
  });
}

export function buildWolf(): QuadRig {
  return buildQuad({
    color: 0x6e6f78, belly: 0xb7b4ad, len: 1.0, width: 0.44, height: 0.48,
    headR: 0.17, snout: 0.2, ears: 'pointy', tail: 'bushy', tailLen: 0.45, eye: 0xffd23a, nose: 0x161616,
  });
}

export function buildDragon(lord: boolean): QuadRig {
  return buildQuad(lord
    ? {
        color: 0xa8281f, belly: 0xe0a23a, len: 1.25, width: 0.62, height: 0.52,
        headR: 0.2, snout: 0.26, ears: 'horns', tail: 'dragon', tailLen: 1.0, eye: 0xffb020, nose: 0x2a0a08,
        wings: 0.95, spikes: 6, neck: 0.42,
      }
    : {
        color: 0x3f8a3a, belly: 0xd2c27a, len: 1.15, width: 0.56, height: 0.48,
        headR: 0.18, snout: 0.24, ears: 'horns', tail: 'dragon', tailLen: 0.9, eye: 0xffd23a, nose: 0x10200c,
        wings: 0.8, spikes: 4, neck: 0.36,
      });
}

function buildCrocodile(): QuadRig {
  return buildQuad({
    color: 0x4a6a2a, belly: 0xb8b070, len: 1.3, width: 0.5, height: 0.22,
    headR: 0.15, snout: 0.42, ears: 'none', tail: 'dragon', tailLen: 0.9, eye: 0xd8c040, nose: 0x2a3a14,
    spikes: 7, splay: 0.7,
  });
}

function buildTarantula(): QuadRig {
  return buildQuad({
    color: 0x3a2a20, belly: 0x8a4a20, len: 0.6, width: 0.62, height: 0.34,
    headR: 0.16, snout: 0.06, ears: 'none', tail: 'thin', tailLen: 0.05, eye: 0xff2a1a, nose: 0x1a0a08,
    legPairs: 4, splay: 1.0, glowEyes: true,
  });
}

function buildHydra(): QuadRig {
  return buildQuad({
    color: 0x2f7a5a, belly: 0xb0c070, len: 1.25, width: 0.72, height: 0.5,
    headR: 0.17, snout: 0.22, ears: 'pointy', tail: 'dragon', tailLen: 0.8, eye: 0xffe040, nose: 0x10200c,
    spikes: 5, neck: 0.3, heads: 3, splay: 0.25,
  });
}

// ------------------------------------------------------------------ northlands, mountains & desert

/** Adds glowing crystal spikes over a quadruped's back (crystal spiders, frost dragons). */
function crystals(rig: QuadRig, o: { n: number; len: number; y: number; w: number; color: number; size: number }): QuadRig {
  const m = mat(o.color, { emissive: new THREE.Color(o.color).multiplyScalar(0.35).getHex() });
  for (let i = 0; i < o.n; i++) {
    const a = i * 2.4;
    const c = cone(o.size * 0.35, o.size * (1 + (i % 3) * 0.35), m, Math.cos(a) * o.w * 0.3, o.y, Math.sin(a) * o.len * 0.3, 4);
    c.rotation.z = Math.cos(a) * 0.5;
    c.rotation.x = Math.sin(a) * 0.4;
    rig.body.add(c);
  }
  rig.materials = collectMaterials(rig.body);
  return rig;
}

function buildFrostDragon(): QuadRig {
  const r = buildQuad({
    color: 0xcfe6f2, belly: 0x8ac0e0, len: 1.3, width: 0.64, height: 0.52,
    headR: 0.2, snout: 0.27, ears: 'horns', tail: 'dragon', tailLen: 1.05, eye: 0x6ae0ff, nose: 0x2a4a6a,
    wings: 1.0, spikes: 6, neck: 0.42, glowEyes: true, spikeColor: 0x9fe6ff,
  });
  return crystals(r, { n: 5, len: 1.0, y: 0.52 + 0.64 * 0.35, w: 0.64, color: 0xbff4ff, size: 0.14 });
}

function buildCrystalSpider(): QuadRig {
  const r = buildQuad({
    color: 0x5a7a9a, belly: 0xa8d8f0, len: 0.7, width: 0.72, height: 0.36,
    headR: 0.18, snout: 0.06, ears: 'none', tail: 'thin', tailLen: 0.05, eye: 0x9fe6ff, nose: 0x1a2a3a,
    legPairs: 4, splay: 1.0, glowEyes: true,
  });
  return crystals(r, { n: 8, len: 0.7, y: 0.36 + 0.72 * 0.3, w: 0.72, color: 0x9ff0ff, size: 0.26 });
}

function buildScorpion(): QuadRig {
  const r = buildQuad({
    color: 0x5a3420, belly: 0x2a1a10, len: 0.85, width: 0.56, height: 0.22,
    headR: 0.15, snout: 0.05, ears: 'none', tail: 'stinger', tailLen: 0.95, eye: 0xff4a1a, nose: 0x1a0a08,
    legPairs: 4, splay: 0.9, glowEyes: true, spikeColor: 0xd04020,
  });
  // pincers reaching forward from the head
  const shell = mat(0x6a3e24);
  for (const s of [-1, 1]) {
    const arm = group(s * 0.16, -0.04, 0.05,
      cyl(0.035, 0.045, 0.32, shell, 0, 0, 0.16, 5).rotateX(Math.PI / 2),
      sphere(0.08, shell, 0, 0, 0.36, 0.8, 0.6, 1.3),
      cone(0.04, 0.16, shell, s * 0.04, 0, 0.5, 4).rotateX(Math.PI / 2),
      cone(0.03, 0.12, shell, -s * 0.04, 0, 0.48, 4).rotateX(Math.PI / 2),
    );
    arm.rotation.y = s * 0.45;
    r.head.add(arm);
  }
  r.materials = collectMaterials(r.body);
  return r;
}

function buildScarab(): QuadRig {
  const r = buildQuad({
    color: 0x1f6a5a, belly: 0x3a2a14, len: 0.85, width: 0.7, height: 0.28,
    headR: 0.14, snout: 0.05, ears: 'none', tail: 'stub', tailLen: 0.05, eye: 0xf0c040, nose: 0x1a1008,
    legPairs: 3, splay: 0.8, glowEyes: true,
  });
  const gold = mat(0xd8a830, { emissive: 0x3a2a00 });
  r.body.add(box(0.03, 0.06, 0.82, gold, 0, 0.28 + 0.7 * 0.44, 0)); // wing-case seam
  r.head.add(cone(0.05, 0.22, gold, 0, 0.1, 0.1, 4).rotateX(-0.6)); // horn
  r.materials = collectMaterials(r.body);
  return r;
}

function buildRabbit(): QuadRig {
  return buildQuad({
    color: 0xc8ccd6, belly: 0xf0f0f4, len: 0.5, width: 0.36, height: 0.2,
    headR: 0.13, snout: 0.06, ears: 'long', tail: 'stub', tailLen: 0.05, eye: 0x2a0a10, nose: 0xd98c8c, earColor: 0xe0c8cc,
  });
}

function buildDeer(): QuadRig {
  const r = buildQuad({
    color: 0x9a6a3e, belly: 0xe8d8bc, len: 0.95, width: 0.36, height: 0.62,
    headR: 0.14, snout: 0.16, ears: 'antlers', tail: 'stub', tailLen: 0.05, eye: 0x140a06, nose: 0x1a1210, neck: 0.3,
  });
  for (const l of r.legs) l.scale.set(0.7, 1, 0.7);
  return r;
}

function buildBear(polar: boolean): QuadRig {
  return buildQuad(polar
    ? { color: 0xeeeae0, belly: 0xd8d2c4, len: 1.05, width: 0.72, height: 0.5, headR: 0.22, snout: 0.16, ears: 'round', tail: 'stub', tailLen: 0.05, eye: 0x101010, nose: 0x101010, earColor: 0xd8d2c4 }
    : { color: 0x6a4a2a, belly: 0x8a6a44, len: 1.0, width: 0.68, height: 0.46, headR: 0.21, snout: 0.15, ears: 'round', tail: 'stub', tailLen: 0.05, eye: 0x101010, nose: 0x101010, earColor: 0x5a3a20 });
}

function buildWinterWolf(): QuadRig {
  return buildQuad({
    color: 0xdfe8f0, belly: 0xffffff, len: 1.0, width: 0.44, height: 0.48,
    headR: 0.17, snout: 0.2, ears: 'pointy', tail: 'bushy', tailLen: 0.5, eye: 0x6ad0ff, nose: 0x1a2a3a, glowEyes: true,
  });
}

function buildSnake(): QuadRig {
  const r = buildQuad({
    color: 0x5a8a2a, belly: 0xd8d080, len: 0.5, width: 0.26, height: 0.12,
    headR: 0.11, snout: 0.1, ears: 'none', tail: 'dragon', tailLen: 1.1, eye: 0xf0d040, nose: 0x1a2a0a, legPairs: 0, glowEyes: true,
  });
  // coils winding behind the head
  const scales = mat(0x5a8a2a);
  const band = mat(0x3a5a1a);
  for (let i = 0; i < 5; i++) r.body.add(sphere(0.12, i % 2 ? band : scales, Math.sin(i * 1.3) * 0.12, 0.1, 0.2 - i * 0.12, 1, 0.75, 1.2));
  r.head.add(box(0.02, 0.01, 0.1, mat(0xd03030), 0, -0.04, 0.24)); // tongue
  // wind the tail into an S: every segment bends the other way
  let seg: THREE.Object3D | undefined = r.tail.children.find((c) => (c as THREE.Group).isGroup);
  for (let i = 0; seg; i++) {
    seg.rotation.y = (i % 2 ? -1 : 1) * 0.7;
    seg = seg.children.find((c) => (c as THREE.Group).isGroup);
  }
  r.tail.rotation.x = 0;
  r.materials = collectMaterials(r.body);
  return r;
}

/** Upright waddling bird: body, flippers as arms, little feet. */
function buildPenguin(): BipedRig {
  const black = mat(0x1e2028);
  const white = mat(0xf4f4f0);
  const orange = mat(0xe8902a);
  const root = new THREE.Group();
  const body = group();
  root.add(body);
  const mkLeg = (x: number) => group(x, 0.12, 0, box(0.12, 0.05, 0.18, orange, 0, -0.1, 0.05));
  const legL = mkLeg(0.1);
  const legR = mkLeg(-0.1);
  const torso = group(0, 0.12, 0,
    sphere(0.3, black, 0, 0.3, 0, 1, 1.3, 0.95),
    sphere(0.24, white, 0, 0.27, 0.08, 0.95, 1.2, 0.8),
  );
  const head = group(0, 0.82, 0,
    sphere(0.19, black, 0, 0, 0),
    sphere(0.1, white, 0.08, 0.02, 0.12, 0.8, 1, 0.6),
    sphere(0.1, white, -0.08, 0.02, 0.12, 0.8, 1, 0.6),
    box(0.035, 0.035, 0.03, mat(0x101010), 0.08, 0.04, 0.18),
    box(0.035, 0.035, 0.03, mat(0x101010), -0.08, 0.04, 0.18),
    cone(0.05, 0.16, orange, 0, -0.04, 0.24, 4).rotateX(Math.PI / 2),
    box(0.3, 0.03, 0.04, mat(0xd04020), 0, 0.14, 0.04), // fierce brow
  );
  const mkArm = (x: number) => group(x, 0.62, 0, box(0.05, 0.36, 0.14, black, 0, -0.16, 0));
  const armL = mkArm(0.3);
  const armR = mkArm(-0.3);
  armL.rotation.z = 0.25;
  armR.rotation.z = -0.25;
  body.add(legL, legR, torso, head, armL, armR);
  const hitbox = makeHitbox(0.6, 1.0, 0.6);
  root.add(hitbox);
  return finish({ type: 'biped', root, body, torso, head, armL, armR, legL, legR, cape: null, materials: [], hitbox, height: 1.1, restArm: -0.2 });
}

/** Blocky ice construct with crystal growths. */
function buildIceGolem(): BipedRig {
  const ice = mat(0xbfe6f5, { emissive: 0x16384a });
  const deep = mat(0x6aa8d0, { emissive: 0x0c2a40 });
  const glowM = mat(0xe0fbff, { emissive: 0x6ad0ff });
  const root = new THREE.Group();
  const body = group();
  root.add(body);
  const mkLeg = (x: number) => group(x, 0.62, 0, box(0.26, 0.4, 0.28, deep, 0, -0.2, 0), box(0.32, 0.22, 0.38, ice, 0, -0.52, 0.04));
  const legL = mkLeg(0.2);
  const legR = mkLeg(-0.2);
  const torso = group(0, 0.62, 0,
    box(0.8, 0.62, 0.48, ice, 0, 0.34, 0),
    box(0.5, 0.3, 0.06, deep, 0, 0.3, 0.25),
    sphere(0.1, glowM, 0, 0.36, 0.27),
  );
  for (let i = 0; i < 5; i++) {
    const c = cone(0.07, 0.3 + (i % 2) * 0.15, ice, (i - 2) * 0.17, 0.72, -0.12 - Math.abs(i - 2) * 0.03, 4);
    c.rotation.z = (i - 2) * -0.25;
    torso.add(c);
  }
  const head = group(0, 1.48, 0,
    box(0.34, 0.26, 0.3, ice, 0, 0, 0),
    box(0.22, 0.05, 0.03, glowM, 0, 0.02, 0.16),
    cone(0.06, 0.2, ice, 0.1, 0.2, 0, 4),
    cone(0.05, 0.16, ice, -0.1, 0.18, 0.02, 4),
  );
  const mkArm = (x: number) => group(x, 1.28, 0,
    box(0.24, 0.42, 0.26, deep, 0, -0.2, 0),
    box(0.3, 0.3, 0.32, ice, 0, -0.52, 0.02),
    cone(0.07, 0.24, ice, x > 0 ? 0.1 : -0.1, 0.06, 0, 4).rotateZ(x > 0 ? -0.6 : 0.6),
  );
  const armL = mkArm(0.54);
  const armR = mkArm(-0.54);
  body.add(legL, legR, torso, head, armL, armR);
  const hitbox = makeHitbox(1.0, 1.8, 0.8);
  root.add(hitbox);
  return finish({ type: 'biped', root, body, torso, head, armL, armR, legL, legR, cape: null, materials: [], hitbox, height: 1.9, restArm: -0.25 });
}

/** A lizardfolk tail swinging behind the hips. */
function withTail(rig: BipedRig, color: number, len = 0.7): BipedRig {
  const m = mat(color);
  const t = group(0, 0.05, -0.16, cone(0.12, len, m, 0, 0, -len / 2, 6).rotateX(-Math.PI / 2 - 0.35));
  rig.torso.add(t);
  return rig;
}

/** Linen bands wound round a mummy's limbs and body. */
function wrapBands(rig: BipedRig, color: number): BipedRig {
  const m = mat(color);
  for (let i = 0; i < 4; i++) {
    const b = box(0.58, 0.035, 0.36, m, 0, 0.1 + i * 0.13, 0);
    b.rotation.z = i % 2 ? 0.12 : -0.12;
    rig.torso.add(b);
  }
  for (const limb of [rig.armL, rig.armR, rig.legL, rig.legR]) {
    for (let i = 0; i < 2; i++) {
      const b = box(0.18, 0.03, 0.2, m, 0, -0.1 - i * 0.16, 0);
      b.rotation.z = i ? 0.2 : -0.2;
      limb.add(b);
    }
  }
  return rig;
}

function boulder(color = 0x8a96a0): THREE.Group {
  return group(0, 0, 0.12, sphere(0.2, mat(color), 0, 0, 0.1, 1, 0.85, 1, 0));
}

function northBiped(kind: EnemyKind): BipedRig | null {
  const barb = (o: Partial<HSpec>) => H({ skin: 0xd8a47a, head: 'barbarian', torso: 'furVest', bareArms: true, headColor: 0xb0582a, bodyColor: 0xd8ccb4, legsColor: 0x6a4a2a, feetColor: 0x4a3a2a, bulk: 1.12, ...o });
  const frostkin = (o: Partial<HSpec>) => H({ skin: 0xc8b090, head: 'frostkin', torso: 'tunic', headColor: 0xe8e4dc, bodyColor: 0xd8d0c4, legsColor: 0x8a7a68, feetColor: 0x5a4a3a, bulk: 0.95, legScale: 0.62, ...o });
  const dwarf = (o: Partial<HSpec>) => H({ skin: 0xe0a880, head: 'dwarf', torso: 'tunic', headColor: 0xb0602a, bodyColor: 0x6a5a3a, legsColor: 0x4a3a2a, feetColor: 0x3a2a1c, bulk: 1.18, legScale: 0.6, ...o });
  const mino = (o: Partial<HSpec>) => H({ skin: 0x7a4a2a, head: 'minotaur', torso: 'furVest', bareArms: true, headColor: 0x3a2214, bodyColor: 0x8a6a3a, legsColor: 0x5a3a20, feetColor: 0x2a1a10, bulk: 1.22, legScale: 1.05, ...o });
  const lizard = (o: Partial<HSpec>) => H({ skin: 0x4a8a3a, head: 'lizard', torso: 'tunic', headColor: 0xc04020, bodyColor: 0x6a5a2a, legsColor: 0x4a8a3a, feetColor: 0x3a6a2a, bulk: 1.05, ...o });
  const giant = (o: Partial<HSpec>) => H({ skin: 0x9ab8d0, head: 'barbarian', torso: 'furVest', bareArms: true, headColor: 0x5a7894, bodyColor: 0x6a5440, legsColor: 0x3a4a5a, feetColor: 0x4a5a6a, bulk: 1.5, legScale: 1.25, eyeGlow: 0x9fe6ff, ...o });
  switch (kind) {
    // barbarians
    case 'barbarian_raider': return armed(barb({}), 'barbarian_axe', 'wooden_shield');
    case 'barbarian_headsplitter': return armed(barb({ headColor: 0x3a2a1a, bodyColor: 0x8a6a4a, quiver: true }), 'hatchet');
    case 'barbarian_skullhunter': {
      const r = barb({ headColor: 0x1a1612, bodyColor: 0x4a3a2a, legsColor: 0x7a2a1a, cape: 0x4a3a2a, bulk: 1.2 });
      r.torso.add(sphere(0.08, mat(0xefe6cc), 0.12, 0.08, 0.2), sphere(0.08, mat(0xefe6cc), -0.12, 0.08, 0.2)); // skull trophies
      return armed(r, 'double_axe', null, 0xefe6cc);
    }
    case 'barbarian_brutetamer': {
      const r = barb({ headColor: 0x8a8a8a, torso: 'robe', bareArms: false, bodyColor: 0xb8b0a0, legsColor: 0x6a4a2a, cape: 0xf0ece0, bulk: 1.05 });
      holdProp(r, staff(0xefe6cc, 0x404030, 0x6a4426));
      r.restArm = -0.12;
      return finish(r);
    }
    // frostkin
    case 'frostkin': return armed(frostkin({}), 'spear');
    case 'frostkin_toolshaper': return armed(frostkin({ headColor: 0xc8a878, bodyColor: 0xa88a60 }), 'tusk_club');
    case 'frostkin_windcaller': {
      const r = frostkin({ headColor: 0xa8d8f0, torso: 'robe', bodyColor: 0x6aa8d0, legsColor: 0xe8e4dc });
      holdProp(r, staff(0xbff4ff, 0x3a90c0, 0xd8d0c0));
      r.restArm = -0.12;
      return finish(r);
    }
    // dwarves
    case 'dwarf': return armed(dwarf({}), 'hatchet');
    case 'dwarf_soldier': return armed(dwarf({ headColor: 0x6a3a1a, torso: 'plate', bodyColor: 0x2a4a8a }), 'light_crossbow', null, 0x6b7380);
    case 'dwarf_guard': return armed(dwarf({ headColor: 0xd8c8b0, torso: 'plate', bodyColor: 0x8a1a1a, bulk: 1.28 }), 'dwarven_axe', 'dwarven_shield', 0xd8c080);
    // humans
    case 'bandit': return armed(H({ skin: 0xd8a47a, head: 'bandit', torso: 'tunic', headColor: 0x5a1a1a, bodyColor: 0x4a3a2a, legsColor: 0x2a2a2a, feetColor: 0x2a1a10 }), 'short_sword');
    case 'amazon': return armed(H({ skin: 0xc8946a, head: 'amazon', torso: 'furVest', bareArms: true, headColor: 0x2a1a10, bodyColor: 0x8a2a1a, legsColor: 0x6a4a2a, feetColor: 0x4a3020, bulk: 0.95 }), 'spear');
    case 'valkyrie': return armed(H({ skin: 0xe8b890, head: 'valkyrie', torso: 'plate', headColor: 0xf0d070, bodyColor: 0x2a5aa0, legsColor: 0x6b7380, feetColor: 0x4a3a2a, cape: 0x2a5aa0 }), 'royal_spear', 'wooden_shield', 0xd8dde6);
    // minotaurs and cyclopes
    case 'minotaur': return armed(mino({}), 'battle_axe');
    case 'minotaur_archer': return armed(mino({ bodyColor: 0x5a6a3a, quiver: true, bulk: 1.15 }), 'light_crossbow');
    case 'minotaur_mage': {
      const r = mino({ torso: 'robe', bareArms: false, bodyColor: 0x3a2a7a, legsColor: 0xe0b03c, bulk: 1.12 });
      holdProp(r, staff(0xc890ff, 0x6a2ab0, 0x3a2a1a));
      r.restArm = -0.12;
      return finish(r);
    }
    case 'cyclops': {
      const r = H({ skin: 0xc89a70, head: 'cyclops', torso: 'furVest', bareArms: true, headColor: 0x4a3020, bodyColor: 0x7a5a3a, legsColor: 0x5a4030, feetColor: 0xc89a70, bulk: 1.45, legScale: 1.15 });
      return armed(r, 'stone_maul');
    }
    // desert dead
    case 'mummy': {
      const r = H({ skin: 0xd8ccb0, head: 'mummy', torso: 'tunic', bareArms: true, headColor: 0xb0a488, bodyColor: 0xc8bc9c, legsColor: 0xc8bc9c, feetColor: 0xb0a488, eyeGlow: 0x6af0a0 });
      wrapBands(r, 0xa89c80);
      r.restArm = -1.35; // arms stretched forward
      r.torso.rotation.x = 0.12;
      return finish(r);
    }
    // lizardfolk
    case 'lizard_sentinel': return armed(withTail(lizard({}), 0x4a8a3a), 'spear');
    case 'lizard_templar': return armed(withTail(lizard({ skin: 0x2f6a4a, torso: 'plate', bodyColor: 0xa83a2a, headColor: 0xe0b03c, cape: 0xa83a2a, bulk: 1.18 }), 0x2f6a4a, 0.85), 'lizard_blade', 'scarab_shield', 0xe0b03c);
    // the frozen north
    case 'ice_witch': {
      const r = H({ skin: 0xd8e8f4, head: 'iceWitch', torso: 'robe', headColor: 0xf4f8ff, bodyColor: 0x3a6aa8, legsColor: 0xbff0ff, feetColor: 0x2a3a5a, eyeGlow: 0x6ae0ff, cape: 0xbfe6f5 });
      holdProp(r, staff(0xbff4ff, 0x4ab0e0, 0xdfeef8));
      r.restArm = -0.12;
      return finish(r);
    }
    case 'frost_giant': return armed(giant({}), 'glacial_cleaver', null, 0xbfe6f5);
    case 'frost_giantess': {
      const r = giant({ head: 'amazon', headColor: 0xa8c4dc, bodyColor: 0x4a6a8a, legsColor: 0x6a5440, bulk: 1.4, legScale: 1.2 });
      holdProp(r, boulder(0xbfe0f0));
      r.restArm = -0.7;
      return finish(r);
    }
    case 'ice_golem': return buildIceGolem();
    case 'dire_penguin': return buildPenguin();
    default: return null;
  }
}

// ------------------------------------------------------------------ bosses

/**
 * Bosses are an existing monster built bigger, recoloured towards their own
 * colour, with a gold crown on the head and a glowing ring at the feet.
 */
interface BossLook {
  base: EnemyKind;
  /** Colour the body is pulled towards, and how far (0–1). */
  tint: number;
  amt: number;
  crown: number;
  aura: number;
  /** Eye/skin glow added to every material. */
  glow?: number;
}

export const BOSS_LOOK: Partial<Record<EnemyKind, BossLook>> = {
  boss_ironjaw: { base: 'orc_warlord', tint: 0x6a2a10, amt: 0.3, crown: 0xe0b03c, aura: 0xff6a2a },
  boss_bonebound: { base: 'skeleton', tint: 0x6a7a9a, amt: 0.35, crown: 0xd8c060, aura: 0x8ab0ff, glow: 0x101828 },
  boss_delving_king: { base: 'dwarf_guard', tint: 0x3a2a20, amt: 0.35, crown: 0xffd040, aura: 0xff9a3a },
  boss_labyrinth_lord: { base: 'minotaur', tint: 0x2a1408, amt: 0.4, crown: 0xe0b03c, aura: 0xd04020 },
  boss_venom_oracle: { base: 'lizard_templar', tint: 0x2a8a3a, amt: 0.35, crown: 0xe0c040, aura: 0x6aff4a, glow: 0x0a2a08 },
  boss_ember_matriarch: { base: 'dragon_lord', tint: 0xff6a10, amt: 0.3, crown: 0xffe070, aura: 0xff8a20, glow: 0x3a0a00 },
  boss_sand_king: { base: 'mummy', tint: 0xd0a040, amt: 0.4, crown: 0xffd040, aura: 0xffd060, glow: 0x201400 },
  boss_mire_hydra: { base: 'hydra', tint: 0x1a4a3a, amt: 0.45, crown: 0xe0b03c, aura: 0x40c0a0 },
  boss_rime_wyrm: { base: 'frost_dragon', tint: 0x6ab0ff, amt: 0.35, crown: 0xf0f8ff, aura: 0x8ae8ff, glow: 0x0a1a30 },
  boss_ashen_sovereign: { base: 'demon', tint: 0x2a2a2a, amt: 0.55, crown: 0xffb020, aura: 0xff3a10, glow: 0x300800 },
  wb_mountain: { base: 'behemoth', tint: 0x6a6a5a, amt: 0.6, crown: 0xe0b03c, aura: 0xc0a060 },
  wb_storm_serpent: { base: 'hydra', tint: 0x3a4ad0, amt: 0.55, crown: 0xe0e8ff, aura: 0x9a8aff, glow: 0x101040 },
  wb_blight_mother: { base: 'tarantula', tint: 0x4a6a1a, amt: 0.5, crown: 0xd0e040, aura: 0x9aff3a, glow: 0x102000 },
  raid_tusk_warlord: { base: 'orc_leader', tint: 0xa02a10, amt: 0.35, crown: 0xffb020, aura: 0xff5a1a },
  raid_grave_warden: { base: 'ghoul', tint: 0x4a5a6a, amt: 0.4, crown: 0xc0c0d0, aura: 0x9ab0ff, glow: 0x0a1018 },
  raid_frost_jarl: { base: 'frost_giant', tint: 0xd0e8ff, amt: 0.35, crown: 0xf0f8ff, aura: 0x8ae8ff },
  raid_swarm_queen: { base: 'scarab', tint: 0xd0a020, amt: 0.45, crown: 0xffe070, aura: 0xffd040 },
};

function buildBoss(look: BossLook): Rig {
  const rig = buildEnemy(look.base);
  const tint = new THREE.Color(look.tint);
  for (const m of rig.materials) {
    m.color.lerp(tint, look.amt);
    if (look.glow) m.emissive.add(new THREE.Color(look.glow));
  }
  // the crown sits on top of the head, wherever this rig keeps it
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.head);
  const top = rig.head.worldToLocal(new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2));
  const w = Math.max(0.12, Math.min(0.24, (box.max.x - box.min.x) * 0.38));
  const gold = mat(look.crown, { emissive: new THREE.Color(look.crown).multiplyScalar(0.35).getHex() });
  const crown = group(top.x, top.y - 0.02, top.z, cyl(w, w * 0.92, 0.07, gold, 0, 0.035, 0, 10));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    crown.add(cone(w * 0.22, 0.11, gold, Math.sin(a) * w * 0.9, 0.12, Math.cos(a) * w * 0.9, 4));
  }
  crown.add(sphere(w * 0.2, mat(0xd02a2a, { emissive: 0x500808 }), 0, 0.06, w * 0.95));
  rig.head.add(crown);
  // a glowing ring at the feet marks a boss from afar
  const aura = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 28), mat(look.aura, { emissive: look.aura }));
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.025;
  rig.root.add(aura);
  rig.materials.push(...collectMaterials(crown), aura.material as Mat);
  return rig;
}

export function buildEnemy(kind: EnemyKind): Rig {
  const boss = BOSS_LOOK[kind];
  if (boss) return buildBoss(boss);
  switch (kind) {
    case 'rat': return buildRat();
    case 'wolf': return buildWolf();
    case 'dragon': return buildDragon(false);
    case 'dragon_lord': return buildDragon(true);
    case 'crocodile': return buildCrocodile();
    case 'tarantula': return buildTarantula();
    case 'hydra': return buildHydra();
    case 'frost_dragon': return buildFrostDragon();
    case 'crystal_spider': return buildCrystalSpider();
    case 'scorpion': return buildScorpion();
    case 'scarab': return buildScarab();
    case 'silver_rabbit': return buildRabbit();
    case 'deer': return buildDeer();
    case 'bear': return buildBear(false);
    case 'polar_bear': return buildBear(true);
    case 'winter_wolf': return buildWinterWolf();
    case 'snake': return buildSnake();
    default: return buildMonsterBiped(kind) ?? northBiped(kind) ?? buildSkeleton();
  }
}

/** On-screen size multiplier per monster. */
export const ENEMY_SCALE: Record<EnemyKind, number> = {
  rat: 1.25, wolf: 1.25, skeleton: 1.3,
  orc: 1.32, orc_spearman: 1.32, orc_shaman: 1.3, orc_warrior: 1.36, orc_berserker: 1.4, orc_leader: 1.42, orc_warlord: 1.55,
  elf: 1.3, elf_scout: 1.3, elf_arcanist: 1.3, elf_warden: 1.38,
  crocodile: 1.3, tarantula: 1.35, jungle_troll: 1.3, hydra: 1.7,
  ghoul: 1.3, fire_elemental: 1.4, behemoth: 1.6, demon: 1.75,
  dragon: 1.75, dragon_lord: 2.0,
  frost_dragon: 2.0, ice_golem: 1.55, crystal_spider: 1.5, frost_giant: 1.75, frost_giantess: 1.65, ice_witch: 1.32,
  barbarian_raider: 1.34, barbarian_skullhunter: 1.38, barbarian_brutetamer: 1.32, barbarian_headsplitter: 1.34,
  frostkin: 1.15, frostkin_toolshaper: 1.18, frostkin_windcaller: 1.15, dire_penguin: 1.1, silver_rabbit: 1.0, winter_wolf: 1.28, polar_bear: 1.5,
  scorpion: 1.35, mummy: 1.32, scarab: 1.3, minotaur: 1.4, minotaur_archer: 1.38, minotaur_mage: 1.36, cyclops: 1.6,
  dwarf: 1.25, dwarf_soldier: 1.25, dwarf_guard: 1.3, bandit: 1.3, amazon: 1.3, valkyrie: 1.32, bear: 1.4, deer: 1.3, snake: 1.25,
  lizard_sentinel: 1.34, lizard_templar: 1.42,
  // bosses: clearly bigger than their kin, world bosses colossal
  boss_ironjaw: 2.0, boss_bonebound: 1.9, boss_delving_king: 1.9, boss_labyrinth_lord: 2.1, boss_venom_oracle: 2.1,
  boss_ember_matriarch: 2.7, boss_sand_king: 2.1, boss_mire_hydra: 2.5, boss_rime_wyrm: 2.8, boss_ashen_sovereign: 2.6,
  wb_mountain: 3.6, wb_storm_serpent: 3.4, wb_blight_mother: 3.6,
  raid_tusk_warlord: 2.0, raid_grave_warden: 1.9, raid_frost_jarl: 2.4, raid_swarm_queen: 2.3,
};


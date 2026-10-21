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
  ears: 'round' | 'pointy' | 'horns' | 'none';
  tail: 'thin' | 'bushy' | 'dragon';
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
  const pink = mat(0xd99a9a);

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
  } else if (o.ears === 'none') {
    head.add(box(o.headR * 1.0, o.headR * 0.25, o.snout * 0.9, belly, 0, -o.headR * 0.4, o.headR * 0.6 + o.snout / 2));
  } else {
    const hornM = mat(0xece2c6);
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
    const spikeM = mat(0xece2c6);
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

export function buildEnemy(kind: EnemyKind): Rig {
  switch (kind) {
    case 'rat': return buildRat();
    case 'wolf': return buildWolf();
    case 'dragon': return buildDragon(false);
    case 'dragon_lord': return buildDragon(true);
    case 'crocodile': return buildCrocodile();
    case 'tarantula': return buildTarantula();
    case 'hydra': return buildHydra();
    default: return buildMonsterBiped(kind) ?? buildSkeleton();
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
};


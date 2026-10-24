/**
 * Pure combat-sound logic (no Web Audio, no DOM — tested in Node by scripts/combat-sfx-test.ts):
 * what each creature is made of when a weapon lands on it, which clips a blow layers, and how a
 * variant is picked so repeats never sound identical.
 */

/** What a weapon hits. */
export type Surface = 'flesh' | 'armour' | 'bone' | 'chitin' | 'scale' | 'stone' | 'crystal' | 'slime' | 'ethereal' | 'water';
export const SURFACES: readonly Surface[] = ['flesh', 'armour', 'bone', 'chitin', 'scale', 'stone', 'crystal', 'slime', 'ethereal', 'water'];

/** How a creature falls when it dies. */
export type FallKind = 'small' | 'medium' | 'large' | 'huge' | 'bone' | 'armour';

const F: Surface = 'flesh', A: Surface = 'armour', B: Surface = 'bone', C: Surface = 'chitin', S: Surface = 'scale';
const ST: Surface = 'stone', CR: Surface = 'crystal', SL: Surface = 'slime', E: Surface = 'ethereal', W: Surface = 'water';

/** Every monster kind in the game today (new kinds fall back by name, see surfaceOf). */
export const MONSTER_SURFACE: Record<string, Surface> = {
  rat: F, wolf: F, winter_wolf: F, bear: F, polar_bear: F, deer: F, silver_rabbit: F, dire_penguin: F,
  skeleton: B, boss_bonebound: B,
  orc: F, orc_spearman: F, orc_shaman: F, orc_berserker: F, orc_warrior: A, orc_leader: A, orc_warlord: A,
  elf: F, elf_scout: F, elf_arcanist: F, elf_warden: A,
  crocodile: S, snake: S, lizard_sentinel: S, lizard_templar: A, hydra: S, boss_mire_hydra: S, boss_venom_oracle: S,
  dragon: S, dragon_lord: S, demon: S, boss_ember_matriarch: S, boss_ashen_sovereign: S, wb_storm_serpent: S,
  frost_dragon: CR, boss_rime_wyrm: CR, ice_golem: CR, crystal_spider: CR,
  tarantula: C, scorpion: C, scarab: C, dread_weaver: C, gravesilk_colossus: C, raid_swarm_queen: C, wb_blight_mother: C, ironshell_crab: C,
  jungle_troll: F, behemoth: F, cyclops: F, frost_giant: F, frost_giantess: F, minotaur: F, minotaur_archer: F, minotaur_mage: F,
  ghoul: F, mummy: F, boss_sand_king: F, raid_grave_warden: F,
  fire_elemental: E,
  bandit: F, amazon: F, ice_witch: F, valkyrie: A,
  barbarian_raider: F, barbarian_headsplitter: F, barbarian_skullhunter: F, barbarian_brutetamer: F,
  frostkin: F, frostkin_toolshaper: F, frostkin_windcaller: F,
  dwarf: A, dwarf_soldier: A, dwarf_guard: A, boss_delving_king: A, boss_ironjaw: A, raid_tusk_warlord: A, raid_frost_jarl: A, boss_labyrinth_lord: F,
  wb_mountain: ST,
  lantern_jelly: SL, blight_jelly: SL,
  deepfin_raider: S, deepfin_harpooner: S, deepfin_tidecaller: S, gloom_eel: W, boss_drowned_tyrant: W,
  // slayer monsters (enemies/slayerDefs.ts)
  gloomcrawler: C, wailing_shade: E, cinder_wraith: E, marrow_gargoyle: ST, abyssal_horror: S,
  // festival bosses (liveops/festivals.ts)
  fest_hollow_king: B, fest_rimeclaw: F,
};

/** A creature's surface; kinds without an entry are guessed from their name. */
export function surfaceOf(kind: string): Surface {
  const s = MONSTER_SURFACE[kind];
  if (s) return s;
  if (/skelet|bone|lich/.test(kind)) return 'bone';
  if (/ghost|wraith|spirit|shade|wisp|elemental/.test(kind)) return 'ethereal';
  if (/golem|stone|gargoyle|rock|mountain/.test(kind)) return 'stone';
  if (/crystal|ice_|frost_dragon|glass/.test(kind)) return 'crystal';
  if (/jelly|slime|ooze|blob/.test(kind)) return 'slime';
  if (/eel|water|tide/.test(kind)) return 'water';
  if (/spider|beetle|scarab|scorpion|(^|_)ant(_|$)|wasp|crab|weaver|swarm/.test(kind)) return 'chitin';
  if (/dragon|wyrm|drake|serpent|snake|lizard|croc|hydra|demon/.test(kind)) return 'scale';
  if (/knight|guard|soldier|dwarf|warlord|templar|warden/.test(kind)) return 'armour';
  return 'flesh';
}

/** A player is armour when wearing metal body armour, otherwise flesh. */
export function playerSurface(armourName: string | null | undefined): Surface {
  if (!armourName) return 'flesh';
  if (/leather|robe|cloth|fur|silk|hide|studded|tunic|coat|garb|vest|wrap|weave/i.test(armourName)) return 'flesh';
  return /plate|chain|mail|scale|steel|iron|bronze|knight|dwarven|crown|golden|starsteel|darkstone|armou?r/i.test(armourName) ? 'armour' : 'flesh';
}

/** Which death fall a creature makes. */
export function fallOf(surface: Surface, size: 'small' | 'medium' | 'large' | 'huge'): FallKind {
  if (surface === 'bone') return 'bone';
  if (surface === 'armour' && (size === 'small' || size === 'medium')) return 'armour';
  return size;
}

/** What struck: melee weapon class of a player, a monster's natural attack, or a projectile. */
export type Striker = 'sword' | 'axe' | 'club' | 'fist' | 'claw' | 'big' | 'arrow' | 'bolt' | 'spear' | 'star' | 'stone';

/** One clip to play: name, gain (before distance), delay (s). */
export interface Layer { clip: string; gain: number; delay: number; pitch?: number }

/** The impact family an arrow/bolt/spear/star uses on a surface. */
export function arrowImpact(s: Surface): 'arrow_flesh' | 'arrow_armour' | 'arrow_wood' | 'arrow_stone' {
  switch (s) {
    case 'armour': case 'chitin': return 'arrow_armour';
    case 'stone': case 'crystal': return 'arrow_stone';
    case 'bone': return 'arrow_wood';
    default: return 'arrow_flesh';
  }
}

const RANGED: ReadonlySet<Striker> = new Set(['arrow', 'bolt', 'spear', 'star', 'stone']);

/**
 * The layers for a physical blow that landed: the surface's own hit, the weapon's accent
 * (a blade's slice, an axe's bite, a club's crunch) and a heavy layer for big (critical) hits.
 */
export function hitLayers(surface: Surface, striker: Striker, heavy: boolean): Layer[] {
  const out: Layer[] = [];
  if (RANGED.has(striker)) {
    const big = striker === 'bolt' || striker === 'spear' || striker === 'stone';
    out.push({ clip: arrowImpact(surface), gain: big ? 1 : 0.85, delay: 0, pitch: striker === 'spear' || striker === 'stone' ? 0.85 : striker === 'star' ? 1.25 : 1 });
    if (surface !== 'flesh') out.push({ clip: `hit_${surface}`, gain: 0.35, delay: 0 });
  } else {
    out.push({ clip: `hit_${surface}`, gain: 1, delay: 0, pitch: striker === 'big' ? 0.85 : striker === 'fist' ? 1.1 : 1 });
    const acc = striker === 'sword' ? 'acc_slash' : striker === 'axe' ? 'acc_chop' : striker === 'club' || striker === 'big' ? 'acc_crunch' : null;
    if (acc && surface !== 'ethereal') out.push({ clip: acc, gain: surface === 'armour' || surface === 'stone' ? 0.45 : 0.7, delay: 0 });
  }
  if (heavy) out.push({ clip: 'crit', gain: surface === 'ethereal' ? 0.5 : 0.9, delay: 0.004 });
  return out;
}

/** A blocked blow: a shield (wood or metal) or, without one, a parry with the weapon. */
export function blockLayers(shield: 'wood' | 'metal' | null, hasWeapon: boolean, surface: Surface): Layer[] {
  if (shield) return [{ clip: shield === 'wood' ? 'block_wood' : 'block_metal', gain: 1, delay: 0 }];
  if (hasWeapon) return [{ clip: 'parry', gain: 0.9, delay: 0 }];
  // a monster whose hide or shell turned the blow
  return [{ clip: `hit_${surface}`, gain: 0.55, delay: 0, pitch: 1.08 }];
}

/** Wooden shields knock; everything else rings. */
export function shieldMaterial(name: string): 'wood' | 'metal' {
  return /wood|bark|hide|leather|wicker|oak|yew/i.test(name) ? 'wood' : 'metal';
}

/** Projectile flight time used by the renderer (render/Effects.missile): impacts wait for it. */
export function flightTime(tiles: number, physical: boolean): number {
  return Math.max(0.12, tiles * (physical ? 0.045 : 0.055));
}

/**
 * Picks a variant index out of `count`, never the same as `last` when there is a choice.
 * `rnd` is a number in [0, 1).
 */
export function pickVariant(count: number, last: number, rnd: number): number {
  if (count <= 1) return 0;
  if (last < 0 || last >= count) return Math.min(count - 1, Math.floor(rnd * count));
  const i = Math.min(count - 2, Math.floor(rnd * (count - 1)));
  return i >= last ? i + 1 : i;
}

/** Small random pitch (playback rate) and level changes on every play: ±4 % pitch, −1.5 … 0 dB. */
export function jitter(rndA: number, rndB: number): { rate: number; gain: number } {
  return { rate: 0.96 + rndA * 0.08, gain: Math.pow(10, (-1.5 * rndB) / 20) };
}

/** Voices of the combat bank playing at once; above this the oldest is faded out. */
export const MAX_VOICES = 14;

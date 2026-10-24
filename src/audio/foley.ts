import { Ground } from '../game/world/WorldMap';

/**
 * Sound design that depends on *what* things are made of: footsteps per ground, hits per
 * material, and voices per monster family. Everything is synthesized (no sound files) in a
 * retro style that sits with the chiptune soundtrack. Sfx.ts decides when to play these.
 */

/** Building blocks Sfx hands to the functions below (bound to one output node and time). */
export interface Kit {
  t: number;
  /** Oscillator with a pitch sweep f0→f1. */
  tone(type: OscillatorType, f0: number, f1: number, at: number, dur: number, peak: number, attack?: number): void;
  /** Filtered noise with a filter sweep f0→f1. */
  noise(filter: BiquadFilterType, f0: number, f1: number, at: number, dur: number, peak: number, q?: number, attack?: number): void;
  /** Narrow pulse wave (chiptune voice) with a pitch sweep and optional tremolo. */
  pulse(duty: number, f0: number, f1: number, at: number, dur: number, peak: number, tremolo?: number): void;
  /** Oscillator through a swept filter (plucked strings, brass, creaks). */
  ftone(type: OscillatorType, f0: number, f1: number, filter: BiquadFilterType, c0: number, c1: number, at: number, dur: number, peak: number, q?: number, attack?: number): void;
  r(a: number, b: number): number;
}

// ------------------------------------------------------------------ what monsters are

export type Material = 'flesh' | 'fur' | 'scale' | 'chitin' | 'crystal' | 'bone' | 'cloth' | 'metal' | 'stone' | 'ice' | 'fire' | 'feather';
export type Family =
  | 'rodent' | 'canine' | 'bear' | 'critter' | 'bird' | 'snake' | 'reptile' | 'insect'
  | 'skeleton' | 'ghoul' | 'mummy' | 'orc' | 'troll' | 'giant' | 'man' | 'woman' | 'dwarf' | 'small' | 'elf'
  | 'bovine' | 'dragon' | 'hydra' | 'demon' | 'flame' | 'golem' | 'beast';
export type Size = 'small' | 'medium' | 'large' | 'huge';

export interface Body { family: Family; material: Material; size: Size }

const B = (family: Family, material: Material, size: Size): Body => ({ family, material, size });

/** Every monster kind; unknown kinds fall back by name (new monsters still get a sensible sound). */
const BODIES: Record<string, Body> = {
  rat: B('rodent', 'fur', 'small'),
  wolf: B('canine', 'fur', 'medium'), winter_wolf: B('canine', 'fur', 'medium'),
  skeleton: B('skeleton', 'bone', 'medium'),
  orc: B('orc', 'flesh', 'medium'), orc_spearman: B('orc', 'flesh', 'medium'), orc_shaman: B('orc', 'cloth', 'medium'),
  orc_warrior: B('orc', 'metal', 'medium'), orc_berserker: B('orc', 'flesh', 'medium'), orc_leader: B('orc', 'metal', 'large'), orc_warlord: B('orc', 'metal', 'large'),
  elf: B('elf', 'cloth', 'medium'), elf_scout: B('elf', 'cloth', 'medium'), elf_arcanist: B('elf', 'cloth', 'medium'), elf_warden: B('elf', 'metal', 'medium'),
  crocodile: B('reptile', 'scale', 'large'), tarantula: B('insect', 'chitin', 'medium'), jungle_troll: B('troll', 'flesh', 'large'),
  hydra: B('hydra', 'scale', 'huge'), ghoul: B('ghoul', 'flesh', 'medium'), fire_elemental: B('flame', 'fire', 'large'),
  behemoth: B('beast', 'flesh', 'huge'), demon: B('demon', 'scale', 'huge'),
  dragon: B('dragon', 'scale', 'huge'), dragon_lord: B('dragon', 'scale', 'huge'), frost_dragon: B('dragon', 'ice', 'huge'),
  ice_golem: B('golem', 'ice', 'huge'), crystal_spider: B('insect', 'crystal', 'large'),
  frost_giant: B('giant', 'flesh', 'huge'), frost_giantess: B('giant', 'flesh', 'huge'), ice_witch: B('woman', 'cloth', 'medium'),
  barbarian_raider: B('man', 'fur', 'medium'), barbarian_skullhunter: B('man', 'fur', 'medium'), barbarian_brutetamer: B('man', 'fur', 'medium'), barbarian_headsplitter: B('man', 'fur', 'medium'),
  frostkin: B('small', 'fur', 'small'), frostkin_toolshaper: B('small', 'fur', 'small'), frostkin_windcaller: B('small', 'fur', 'small'),
  dire_penguin: B('bird', 'feather', 'small'), silver_rabbit: B('critter', 'fur', 'small'), deer: B('critter', 'fur', 'medium'),
  polar_bear: B('bear', 'fur', 'large'), bear: B('bear', 'fur', 'large'),
  scorpion: B('insect', 'chitin', 'medium'), scarab: B('insect', 'chitin', 'medium'), mummy: B('mummy', 'cloth', 'medium'),
  minotaur: B('bovine', 'fur', 'large'), minotaur_archer: B('bovine', 'fur', 'large'), minotaur_mage: B('bovine', 'cloth', 'large'),
  cyclops: B('giant', 'flesh', 'huge'),
  dwarf: B('dwarf', 'metal', 'small'), dwarf_soldier: B('dwarf', 'metal', 'small'), dwarf_guard: B('dwarf', 'metal', 'small'),
  bandit: B('man', 'cloth', 'medium'), amazon: B('woman', 'cloth', 'medium'), valkyrie: B('woman', 'metal', 'medium'),
  snake: B('snake', 'scale', 'small'), lizard_sentinel: B('reptile', 'scale', 'medium'), lizard_templar: B('reptile', 'metal', 'medium'),
  // Gravewind Steppe, bosses and the Sunken Reach (sizes matter for death falls and footsteps)
  dread_weaver: B('insect', 'chitin', 'large'), gravesilk_colossus: B('insect', 'chitin', 'huge'),
  boss_ironjaw: B('orc', 'metal', 'large'), boss_bonebound: B('skeleton', 'bone', 'large'), boss_delving_king: B('dwarf', 'metal', 'medium'),
  boss_labyrinth_lord: B('bovine', 'fur', 'huge'), boss_venom_oracle: B('reptile', 'scale', 'large'), boss_ember_matriarch: B('dragon', 'scale', 'huge'),
  boss_sand_king: B('mummy', 'cloth', 'large'), boss_mire_hydra: B('hydra', 'scale', 'huge'), boss_rime_wyrm: B('dragon', 'ice', 'huge'),
  boss_ashen_sovereign: B('demon', 'scale', 'huge'), wb_mountain: B('golem', 'stone', 'huge'), wb_storm_serpent: B('reptile', 'scale', 'huge'),
  wb_blight_mother: B('insect', 'chitin', 'huge'), raid_tusk_warlord: B('orc', 'metal', 'large'), raid_grave_warden: B('ghoul', 'cloth', 'large'),
  raid_frost_jarl: B('giant', 'metal', 'huge'), raid_swarm_queen: B('insect', 'chitin', 'large'),
  lantern_jelly: B('critter', 'cloth', 'small'), blight_jelly: B('critter', 'cloth', 'small'), ironshell_crab: B('insect', 'chitin', 'large'),
  deepfin_raider: B('reptile', 'scale', 'medium'), deepfin_harpooner: B('reptile', 'scale', 'medium'), deepfin_tidecaller: B('reptile', 'scale', 'medium'),
  gloom_eel: B('snake', 'scale', 'large'), boss_drowned_tyrant: B('demon', 'scale', 'huge'),
  // slayer monsters (enemies/slayerDefs.ts)
  gloomcrawler: B('insect', 'chitin', 'large'), wailing_shade: B('ghoul', 'cloth', 'medium'), cinder_wraith: B('flame', 'fire', 'large'),
  marrow_gargoyle: B('golem', 'stone', 'huge'), abyssal_horror: B('demon', 'scale', 'huge'),
  // festival bosses (liveops/festivals.ts)
  fest_hollow_king: B('skeleton', 'bone', 'large'), fest_rimeclaw: B('bear', 'fur', 'huge'),
};

export function bodyOf(kind: string): Body {
  const b = BODIES[kind];
  if (b) return b;
  // a monster added later without an entry: guess from its name
  if (/dragon|wyrm|drake/.test(kind)) return B('dragon', 'scale', 'huge');
  if (/spider|beetle|scarab|scorpion|ant|wasp/.test(kind)) return B('insect', 'chitin', 'medium');
  if (/skelet|bone|lich/.test(kind)) return B('skeleton', 'bone', 'medium');
  if (/ghost|wraith|zombie|ghoul|mummy/.test(kind)) return B('ghoul', 'cloth', 'medium');
  if (/wolf|dog|hound|fox/.test(kind)) return B('canine', 'fur', 'medium');
  if (/golem|stone|gargoyle/.test(kind)) return B('golem', 'stone', 'large');
  if (/giant|cyclops|troll|ogre/.test(kind)) return B('giant', 'flesh', 'huge');
  if (/snake|serpent|lizard|croc/.test(kind)) return B('reptile', 'scale', 'medium');
  if (/demon|devil|imp/.test(kind)) return B('demon', 'scale', 'large');
  if (/witch|amazon|priestess|queen/.test(kind)) return B('woman', 'cloth', 'medium');
  return B('man', 'flesh', 'medium');
}

// ------------------------------------------------------------------ footsteps

/** One footstep on a ground type. `heavy` is a big monster's tread; `alt` alternates feet. */
export function footstep(k: Kit, g: Ground, vol: number, alt: boolean, heavy = false): void {
  const { t, r } = k;
  const p = alt ? 1.06 : 0.95;
  if (heavy) {
    k.tone('sine', 75 * p, 38, t, 0.22, 0.75 * vol);
    k.noise('lowpass', 600, 90, t, 0.2, 0.55 * vol, 0.7);
  }
  switch (g) {
    case Ground.Grass: case Ground.DarkGrass: case Ground.Crop: case Ground.Jungle:
      k.noise('bandpass', r(1100, 1500) * p, 700, t, 0.07, 0.22 * vol, 1.2, 0.01);
      break;
    case Ground.Path: case Ground.Dirt:
      k.noise('bandpass', r(700, 900) * p, 400, t, 0.05, 0.3 * vol, 1.5);
      k.noise('highpass', 3200, 2400, t + 0.025, 0.03, 0.12 * vol, 1);
      break;
    case Ground.Stone: case Ground.Marble: case Ground.Cave:
      k.tone('triangle', 190 * p, 120, t, 0.035, 0.28 * vol);
      k.noise('highpass', 4200, 3000, t, 0.025, 0.16 * vol, 1);
      break;
    case Ground.Wood:
      k.tone('triangle', 260 * p, 210, t, 0.06, 0.3 * vol);
      k.noise('bandpass', 650, 450, t, 0.05, 0.18 * vol, 2);
      break;
    case Ground.Sand:
      k.noise('highpass', 2600 * p, 1800, t, 0.09, 0.14 * vol, 0.8, 0.015);
      break;
    case Ground.Snow:
      k.noise('lowpass', 2600 * p, 500, t, 0.09, 0.32 * vol, 1, 0.01);
      k.noise('lowpass', 1800, 400, t + 0.05, 0.06, 0.18 * vol, 1);
      break;
    case Ground.Ice:
      k.tone('sine', 2500 * p, 2300, t, 0.04, 0.08 * vol);
      k.noise('highpass', 5000, 4000, t, 0.03, 0.14 * vol, 1);
      break;
    case Ground.Water: case Ground.Swamp: case Ground.DeepWater:
      k.noise('bandpass', 800 * p, 1600, t, 0.12, 0.28 * vol, 1.5, 0.01);
      k.tone('sine', 320 * p, 150, t + 0.02, 0.07, 0.14 * vol);
      break;
    case Ground.Seabed:
      // a slow, muffled push through water over soft sand
      k.noise('lowpass', 520 * p, 180, t, 0.14, 0.22 * vol, 1, 0.025);
      break;
    case Ground.Lava: case Ground.Ash:
      k.noise('lowpass', 1500 * p, 400, t, 0.07, 0.24 * vol, 1);
      k.noise('highpass', 6000, 5000, t + 0.03, 0.12, 0.05 * vol, 1);
      break;
    default:
      k.noise('bandpass', 900 * p, 500, t, 0.05, 0.2 * vol, 1.2);
  }
}

// ------------------------------------------------------------------ hits

/** A weapon landing on something made of `m`. `hard` for big hits. */
export function impact(k: Kit, m: Material, vol: number, hard: boolean): void {
  const { t, r } = k;
  const boom = hard ? 1.4 : 1;
  switch (m) {
    case 'flesh':
      k.noise('lowpass', 900, 200, t, 0.09, 0.6 * vol, 1);
      k.tone('sine', 130, 60, t, 0.09, 0.4 * vol * boom);
      break;
    case 'fur': case 'feather':
      k.noise('lowpass', 700, 180, t, 0.08, 0.45 * vol, 0.8);
      k.tone('sine', 120, 70, t, 0.07, 0.3 * vol * boom);
      break;
    case 'cloth':
      k.noise('bandpass', 600, 250, t, 0.07, 0.45 * vol, 1);
      k.tone('triangle', 150, 80, t, 0.06, 0.28 * vol);
      break;
    case 'scale':
      k.noise('bandpass', r(1400, 1800), 600, t, 0.07, 0.5 * vol, 2);
      k.tone('triangle', 220, 110, t, 0.06, 0.3 * vol * boom);
      break;
    case 'chitin':
      k.noise('highpass', 3200, 1800, t, 0.035, 0.5 * vol, 1.5);
      k.pulse(0.25, r(900, 1100), 500, t, 0.05, 0.12 * vol);
      break;
    case 'crystal': case 'ice':
      k.noise('highpass', 3500, 2000, t, 0.05, 0.45 * vol, 1.5);
      for (let i = 0; i < 3; i++) k.tone('sine', r(2200, 3600), r(2000, 3400), t + i * 0.025, 0.14, 0.09 * vol);
      if (m === 'ice') k.tone('triangle', 260, 140, t, 0.08, 0.3 * vol * boom);
      break;
    case 'bone':
      k.pulse(0.5, r(850, 950), 600, t, 0.03, 0.18 * vol);
      k.pulse(0.5, r(1250, 1400), 900, t + 0.035, 0.03, 0.14 * vol);
      k.noise('bandpass', 2200, 1200, t, 0.06, 0.3 * vol, 2);
      break;
    case 'metal':
      [r(880, 940), r(1340, 1420), r(2080, 2200)].forEach((f, i) => k.tone(i ? 'triangle' : 'square', f, f * 0.985, t, 0.22 - i * 0.04, (i ? 0.08 : 0.06) * vol));
      k.noise('bandpass', 3000, 1500, t, 0.05, 0.3 * vol, 2);
      break;
    case 'stone':
      k.noise('lowpass', 1300, 200, t, 0.11, 0.6 * vol, 1);
      k.tone('triangle', 300, 140, t, 0.08, 0.3 * vol * boom);
      break;
    case 'fire':
      k.noise('highpass', 2500, 5000, t, 0.18, 0.3 * vol, 0.8, 0.01);
      k.noise('lowpass', 500, 200, t, 0.1, 0.3 * vol, 1);
      break;
  }
  if (hard) k.tone('sine', 90, 40, t, 0.16, 0.45 * vol);
}

// ------------------------------------------------------------------ voices

export type Cry = 'attack' | 'hurt' | 'die';

/** A monster's voice. Pitch drops with size; huge monsters rumble. */
export function voice(k: Kit, b: Body, cry: Cry, vol: number): void {
  const { t, r } = k;
  const sz = b.size === 'small' ? 1.5 : b.size === 'medium' ? 1 : b.size === 'large' ? 0.75 : 0.55;
  const die = cry === 'die', hurt = cry === 'hurt';
  const len = die ? 0.7 : hurt ? 0.22 : 0.4;
  switch (b.family) {
    case 'rodent':
      k.pulse(0.25, 1900, die ? 900 : 2700, t, die ? 0.25 : 0.08, 0.14 * vol);
      if (!die) k.pulse(0.25, 2100, 2900, t + 0.1, 0.07, 0.1 * vol);
      break;
    case 'critter':
      if (cry !== 'attack') k.pulse(0.25, 1400, die ? 600 : 1800, t, die ? 0.3 : 0.1, 0.1 * vol);
      break;
    case 'bird':
      k.pulse(0.25, 700, 1100, t, 0.08, 0.16 * vol);
      k.pulse(0.25, 900, die ? 400 : 1300, t + 0.1, die ? 0.3 : 0.09, 0.14 * vol);
      break;
    case 'canine':
      if (cry === 'attack') { k.pulse(0.5, 105, 95, t, 0.35, 0.18 * vol, 28); k.noise('lowpass', 700, 300, t, 0.35, 0.18 * vol, 1); }
      else { k.pulse(0.25, die ? 1000 : 900, die ? 350 : 650, t, die ? 0.6 : 0.14, 0.13 * vol); }
      break;
    case 'bear': case 'beast':
      k.tone('sawtooth', 140 * sz, 60 * sz, t, len, 0.22 * vol);
      k.noise('lowpass', 900 * sz, 200, t, len, 0.35 * vol, 0.8, 0.05);
      if (b.family === 'beast') k.tone('sine', 55, 32, t, len, 0.4 * vol);
      break;
    case 'snake':
      k.noise('highpass', 5000, 4200, t, die ? 0.6 : 0.4, 0.22 * vol, 0.8, 0.08);
      break;
    case 'reptile':
      k.noise('highpass', 4200, 3200, t, 0.3, 0.2 * vol, 0.8, 0.05);
      k.tone('sawtooth', 160 * sz, 90 * sz, t + 0.05, len * 0.8, 0.14 * vol);
      break;
    case 'hydra':
      for (let i = 0; i < 3; i++) k.noise('highpass', r(3800, 5200), 3000, t + i * 0.09, 0.4, 0.16 * vol, 0.8, 0.05);
      k.tone('sawtooth', 120, 55, t, len + 0.2, 0.2 * vol);
      break;
    case 'insect':
      for (let i = 0; i < (die ? 10 : 6); i++) k.pulse(0.125, r(2600, 3400), r(1800, 2400), t + i * 0.035, 0.02, 0.12 * vol);
      if (b.material === 'crystal') k.tone('sine', 3000, 2600, t, 0.3, 0.06 * vol);
      break;
    case 'skeleton':
      for (let i = 0; i < (die ? 9 : 4); i++) k.noise('bandpass', r(1800, 3000), 1500, t + i * 0.045 + r(0, 0.02), 0.03, 0.25 * vol, 3);
      if (die) k.noise('lowpass', 900, 200, t + 0.42, 0.2, 0.35 * vol, 1);
      break;
    case 'ghoul': case 'mummy':
      k.pulse(0.5, 170 * sz, 120 * sz, t, len + 0.2, 0.09 * vol, 6);
      k.noise('bandpass', 700, 500, t, len + 0.2, 0.15 * vol, 3, 0.08);
      break;
    case 'orc': case 'troll': case 'giant': case 'man': case 'woman': case 'dwarf': case 'small': case 'elf': {
      const f0 = ({ orc: 105, troll: 85, giant: 62, man: 135, dwarf: 125, woman: 255, small: 330, elf: 190 } as const)[b.family];
      const f = f0 * r(0.95, 1.05);
      const end = die ? f * 0.55 : hurt ? f * 1.15 : f * 0.85;
      k.pulse(0.25, f, end, t, die ? 0.6 : 0.16, 0.16 * vol);
      k.noise('bandpass', f * 5.5, f * 4, t, die ? 0.6 : 0.16, 0.14 * vol, 2.5, 0.02);
      if (b.family === 'giant') k.tone('sine', f, f * 0.6, t, die ? 0.7 : 0.25, 0.35 * vol);
      if (die) k.noise('lowpass', 700, 150, t + 0.55, 0.18, 0.35 * vol * (b.size === 'huge' ? 1.6 : 1), 1);
      break;
    }
    case 'bovine':
      k.tone('sawtooth', 115, die ? 70 : 95, t, die ? 0.8 : 0.5, 0.16 * vol);
      k.noise('bandpass', 420, 360, t, die ? 0.8 : 0.5, 0.16 * vol, 3, 0.06);
      break;
    case 'dragon': {
      const cold = b.material === 'ice';
      k.tone('sawtooth', 170, 55, t, die ? 1.2 : 0.75, 0.24 * vol);
      k.tone('sawtooth', 177, 58, t, die ? 1.2 : 0.75, 0.16 * vol);
      k.noise('bandpass', 1200, 350, t, die ? 1.2 : 0.75, 0.4 * vol, 1.2, 0.06);
      k.tone('sine', 60, 30, t, die ? 1.2 : 0.75, 0.45 * vol);
      if (cold) for (let i = 0; i < 4; i++) k.tone('sine', r(2400, 3600), r(2200, 3400), t + i * 0.08, 0.2, 0.05 * vol);
      break;
    }
    case 'demon':
      k.tone('sawtooth', 95, 48, t, die ? 1.2 : 0.7, 0.24 * vol);
      k.tone('square', 101, 51, t, die ? 1.2 : 0.7, 0.1 * vol);
      k.noise('lowpass', 1600, 200, t, die ? 1.2 : 0.7, 0.45 * vol, 0.7, 0.04);
      k.tone('sine', 45, 28, t, die ? 1.2 : 0.7, 0.5 * vol);
      break;
    case 'flame':
      k.noise('lowpass', 300, 2400, t, len * 0.6, 0.4 * vol, 0.8, 0.05);
      k.noise('lowpass', 2400, 300, t + len * 0.6, len * 0.6, 0.3 * vol, 0.8);
      break;
    case 'golem':
      k.noise('lowpass', 500, 150, t, len + 0.2, 0.5 * vol, 1, 0.04);
      for (let i = 0; i < 5; i++) k.noise('bandpass', r(900, 1600), 600, t + i * 0.07, 0.04, 0.25 * vol, 3);
      if (b.material === 'ice') for (let i = 0; i < 3; i++) k.tone('sine', r(2000, 3200), r(1800, 3000), t + 0.1 + i * 0.07, 0.15, 0.06 * vol);
      if (die) k.noise('lowpass', 900, 100, t + 0.5, 0.5, 0.6 * vol, 0.8);
      break;
  }
}

/** A body hitting the ground. */
export function bodyFall(k: Kit, b: Body, vol: number): void {
  const big = b.size === 'huge' ? 1.6 : b.size === 'large' ? 1.25 : b.size === 'small' ? 0.6 : 1;
  const t = k.t + (b.size === 'huge' ? 0.5 : 0.3);
  if (b.material === 'bone') { for (let i = 0; i < 6; i++) k.noise('bandpass', k.r(1500, 2800), 1200, t + i * 0.04, 0.04, 0.22 * vol, 3); return; }
  if (b.material === 'metal') k.tone('triangle', 900, 850, t, 0.25, 0.06 * vol);
  k.noise('lowpass', 700 * big, 90, t, 0.25 * big, 0.5 * vol * big, 0.8);
  k.tone('sine', 85 / big, 35, t, 0.25 * big, 0.45 * vol * big);
}

// ------------------------------------------------------------------ spells by element

export type SpellElement = 'fire' | 'energy' | 'ice' | 'earth' | 'death' | 'holy';

/**
 * The body of a wave, beam or big area spell: a sweep that lasts longer for bigger shapes.
 * `size` is roughly the number of tiles covered (1 = a single tile).
 */
export function spellSweep(k: Kit, el: SpellElement, size: number, vol: number): void {
  const t = k.t, len = Math.min(0.9, 0.25 + size * 0.03), v = vol * Math.min(1, 0.55 + size * 0.03);
  switch (el) {
    case 'fire':
      k.noise('lowpass', 500, 2600, t, len, 0.5 * v, 0.9, 0.04); // roar opening up
      k.noise('bandpass', 1800, 700, t + len * 0.4, len * 0.8, 0.25 * v, 1.2); // crackling tail
      for (let i = 0; i < 4; i++) k.noise('highpass', 3000, 3000, t + k.r(0.05, len), 0.03, 0.18 * v);
      break;
    case 'energy':
      k.pulse(0.1, 180, 1400, t, len * 0.8, 0.14 * v, 33); // rising buzz
      for (let i = 0; i < 6; i++) { const at = t + k.r(0, len); k.tone('sawtooth', k.r(1500, 3500), k.r(300, 800), at, 0.04, 0.12 * v); }
      k.noise('highpass', 4000, 6000, t, len * 0.6, 0.15 * v);
      break;
    case 'ice':
      k.noise('highpass', 6000, 2500, t, len, 0.22 * v, 0.7, 0.03); // frosty hiss
      for (let i = 0; i < 6; i++) { const f = [2093, 2349, 2637, 3136, 3520, 4186][i]; k.tone('sine', f, f, t + i * len * 0.12, 0.35, 0.09 * v); }
      k.tone('triangle', 1200, 300, t, 0.12, 0.15 * v); // crack
      break;
    case 'earth':
      k.tone('sine', 70, 38, t, len + 0.2, 0.6 * v, 0.02); // rumble
      k.noise('lowpass', 400, 150, t, len + 0.15, 0.45 * v, 0.8);
      for (let i = 0; i < 5; i++) k.noise('bandpass', k.r(600, 1400), 400, t + k.r(0.05, len), 0.05, 0.25 * v, 2); // pebbles
      break;
    case 'death':
      k.tone('sawtooth', 220, 110, t, len, 0.12 * v, 0.06);
      k.tone('sawtooth', 233, 104, t, len, 0.12 * v, 0.06); // dissonant pair
      k.noise('bandpass', 900, 300, t, len, 0.28 * v, 3, 0.08); // a breath of wind
      break;
    case 'holy':
      for (const f of [523, 659, 784, 1047]) k.tone('sine', f, f * 1.003, t + 0.01, len + 0.3, 0.08 * v, 0.08); // bright chord
      k.noise('highpass', 7000, 9000, t, len, 0.1 * v, 0.7, 0.05);
      k.tone('triangle', 1568, 2093, t, len, 0.06 * v);
      break;
  }
}

/** The short sound of an elemental hit landing on a creature. */
export function elementHit(k: Kit, el: SpellElement, vol: number): void {
  const t = k.t;
  switch (el) {
    case 'fire': k.noise('bandpass', 2400, 900, t, 0.18, 0.4 * vol, 1); break; // sizzle
    case 'energy': k.pulse(0.1, 900, 200, t, 0.1, 0.16 * vol, 60); k.noise('highpass', 5000, 5000, t, 0.05, 0.2 * vol); break;
    case 'ice': k.tone('triangle', 2400, 1600, t, 0.08, 0.2 * vol); k.noise('highpass', 5000, 3000, t, 0.12, 0.2 * vol); break;
    case 'earth': k.noise('lowpass', 700, 200, t, 0.14, 0.5 * vol); k.tone('sine', 110, 60, t, 0.12, 0.35 * vol); break;
    case 'death': k.tone('sawtooth', 160, 80, t, 0.2, 0.14 * vol); k.tone('sawtooth', 170, 76, t, 0.2, 0.1 * vol); break;
    case 'holy': k.tone('sine', 1319, 1319, t, 0.25, 0.14 * vol); k.tone('sine', 1976, 1976, t + 0.03, 0.25, 0.1 * vol); break;
  }
}

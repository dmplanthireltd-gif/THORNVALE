import type { Element } from '../inventory/items';
import type { Vocation } from '../player/vocations';

/**
 * Spells are cast by saying their words (or via the hotbar / spell book).
 * Characters must learn them from a trainer first, except the basics.
 */
export type SpellId =
  | 'exura' | 'exura_gran' | 'exura_vita' | 'exura_ico' | 'exura_sio'
  | 'exori' | 'exori_gran' | 'exori_hur' | 'exori_con' | 'exori_san'
  | 'exori_vis' | 'exori_flam' | 'exori_frigo' | 'exori_tera'
  | 'exevo_gran_mas_vis' | 'exevo_gran_mas_frigo' | 'exevo_mas_san'
  | 'utani_hur' | 'utamo_vita' | 'utevo_lux';

export type SpellKind = 'heal' | 'healFriend' | 'target' | 'selfArea' | 'buff';
export type SpellGroup = 'attack' | 'heal' | 'support';

/**
 * Shared cooldowns ("exhaustion"), the classic anti-spam rule: after any attack
 * spell or attack rune you wait 2 s before the next one, healing spells and
 * runes 1 s, support spells 1 s, and every potion or food 1 s — on top of each
 * spell's own cooldown.
 */
export type CooldownGroup = SpellGroup | 'potion';
export const GROUP_COOLDOWN: Record<CooldownGroup, number> = { attack: 2, heal: 1, support: 1, potion: 1 };

export interface SpellDef {
  id: SpellId;
  name: string;
  words: string;
  kind: SpellKind;
  group: SpellGroup;
  mana: number;
  level: number;
  vocations: Vocation[];
  /** Own cooldown in seconds. */
  cooldown: number;
  element?: Element;
  /** Base damage/heal range, plus perLevel × character level, times vocation multiplier. */
  min?: number;
  max?: number;
  perLevel?: number;
  /** Damage grows with the equipped weapon's attack (knight/paladin techniques). */
  weaponScale?: number;
  range?: number;
  radius?: number;
  buff?: 'haste' | 'magicShield' | 'light';
  duration?: number;
  /** Gold to learn it from a trainer (0 = known from the start). */
  price: number;
  description: string;
}

const ALL: Vocation[] = ['knight', 'paladin', 'sorcerer', 'druid'];
const MAGES: Vocation[] = ['sorcerer', 'druid'];

export const SPELLS: Record<SpellId, SpellDef> = {
  exura: {
    id: 'exura', name: 'Light Healing', words: 'exura', kind: 'heal', group: 'heal', mana: 20, level: 1, vocations: ALL,
    cooldown: 1, min: 25, max: 45, perLevel: 2.2, price: 0, description: 'Heals a little health.',
  },
  exura_ico: {
    id: 'exura_ico', name: 'Wound Cleansing', words: 'exura ico', kind: 'heal', group: 'heal', mana: 40, level: 8, vocations: ['knight'],
    cooldown: 1, min: 70, max: 130, perLevel: 4.2, price: 400, description: "A knight's strong self-heal.",
  },
  exura_gran: {
    id: 'exura_gran', name: 'Intense Healing', words: 'exura gran', kind: 'heal', group: 'heal', mana: 70, level: 11, vocations: ['paladin', 'sorcerer', 'druid'],
    cooldown: 1, min: 60, max: 110, perLevel: 3.6, price: 600, description: 'Heals a fair amount of health.',
  },
  exura_vita: {
    id: 'exura_vita', name: 'Ultimate Healing', words: 'exura vita', kind: 'heal', group: 'heal', mana: 160, level: 30, vocations: MAGES,
    cooldown: 1, min: 200, max: 320, perLevel: 6, price: 2500, description: 'Heals a great amount of health.',
  },
  exura_sio: {
    id: 'exura_sio', name: 'Heal Friend', words: 'exura sio', kind: 'healFriend', group: 'heal', mana: 120, level: 18, vocations: ['druid'],
    cooldown: 1, min: 140, max: 230, perLevel: 5, range: 7, price: 1500,
    description: 'Heals another player: say exura sio "Name, or it heals the most wounded ally nearby.',
  },
  exori: {
    id: 'exori', name: 'Berserk', words: 'exori', kind: 'selfArea', group: 'attack', mana: 115, level: 35, vocations: ['knight'],
    cooldown: 4, element: 'physical', min: 20, max: 40, perLevel: 1.6, weaponScale: 1.4, radius: 1, price: 2500,
    description: 'Strikes every enemy around you.',
  },
  exori_gran: {
    id: 'exori_gran', name: 'Fierce Berserk', words: 'exori gran', kind: 'selfArea', group: 'attack', mana: 340, level: 70, vocations: ['knight'],
    cooldown: 6, element: 'physical', min: 50, max: 90, perLevel: 2.6, weaponScale: 2.2, radius: 1, price: 7500,
    description: 'A devastating blow against every enemy around you.',
  },
  exori_hur: {
    id: 'exori_hur', name: 'Whirlwind Throw', words: 'exori hur', kind: 'target', group: 'attack', mana: 40, level: 28, vocations: ['knight'],
    cooldown: 6, element: 'physical', min: 15, max: 35, perLevel: 1.4, weaponScale: 1.1, range: 5, price: 1500,
    description: 'Hurls your weapon at a distant target.',
  },
  exori_con: {
    id: 'exori_con', name: 'Ethereal Spear', words: 'exori con', kind: 'target', group: 'attack', mana: 25, level: 23, vocations: ['paladin'],
    cooldown: 2, element: 'physical', min: 25, max: 50, perLevel: 1.8, weaponScale: 0.6, range: 7, price: 1100,
    description: 'A spear of light that never misses.',
  },
  exori_san: {
    id: 'exori_san', name: 'Divine Missile', words: 'exori san', kind: 'target', group: 'attack', mana: 20, level: 40, vocations: ['paladin'],
    cooldown: 2, element: 'holy', min: 40, max: 70, perLevel: 2.2, range: 4, price: 1800,
    description: 'Holy damage — devastating against the undead and demons.',
  },
  exori_vis: {
    id: 'exori_vis', name: 'Energy Strike', words: 'exori vis', kind: 'target', group: 'attack', mana: 20, level: 12, vocations: MAGES,
    cooldown: 2, element: 'energy', min: 25, max: 45, perLevel: 1.7, range: 3, price: 800, description: 'Energy damage on one target.',
  },
  exori_flam: {
    id: 'exori_flam', name: 'Flame Strike', words: 'exori flam', kind: 'target', group: 'attack', mana: 20, level: 14, vocations: MAGES,
    cooldown: 2, element: 'fire', min: 25, max: 45, perLevel: 1.7, range: 3, price: 800, description: 'Fire damage on one target.',
  },
  exori_frigo: {
    id: 'exori_frigo', name: 'Ice Strike', words: 'exori frigo', kind: 'target', group: 'attack', mana: 20, level: 15, vocations: MAGES,
    cooldown: 2, element: 'ice', min: 25, max: 45, perLevel: 1.7, range: 3, price: 800, description: 'Ice damage on one target.',
  },
  exori_tera: {
    id: 'exori_tera', name: 'Terra Strike', words: 'exori tera', kind: 'target', group: 'attack', mana: 20, level: 13, vocations: MAGES,
    cooldown: 2, element: 'earth', min: 25, max: 45, perLevel: 1.7, range: 3, price: 800, description: 'Earth damage on one target.',
  },
  exevo_gran_mas_vis: {
    id: 'exevo_gran_mas_vis', name: 'Rage of the Skies', words: 'exevo gran mas vis', kind: 'selfArea', group: 'attack', mana: 600, level: 55, vocations: ['sorcerer'],
    cooldown: 8, element: 'energy', min: 80, max: 160, perLevel: 4, radius: 5, price: 6000, description: 'Lightning strikes everything around you.',
  },
  exevo_gran_mas_frigo: {
    id: 'exevo_gran_mas_frigo', name: 'Eternal Winter', words: 'exevo gran mas frigo', kind: 'selfArea', group: 'attack', mana: 900, level: 60, vocations: ['druid'],
    cooldown: 8, element: 'ice', min: 80, max: 160, perLevel: 4, radius: 5, price: 8000, description: 'A blizzard freezes everything around you.',
  },
  exevo_mas_san: {
    id: 'exevo_mas_san', name: 'Divine Caldera', words: 'exevo mas san', kind: 'selfArea', group: 'attack', mana: 160, level: 50, vocations: ['paladin'],
    cooldown: 4, element: 'holy', min: 50, max: 100, perLevel: 2.6, radius: 3, price: 3000, description: 'A ring of holy fire around you.',
  },
  utani_hur: {
    id: 'utani_hur', name: 'Haste', words: 'utani hur', kind: 'buff', group: 'support', mana: 60, level: 14, vocations: ALL,
    cooldown: 2, buff: 'haste', duration: 30, price: 600, description: 'Walk 30% faster for 30 seconds.',
  },
  utamo_vita: {
    id: 'utamo_vita', name: 'Magic Shield', words: 'utamo vita', kind: 'buff', group: 'support', mana: 50, level: 14, vocations: MAGES,
    cooldown: 2, buff: 'magicShield', duration: 200, price: 450, description: 'Damage drains your mana before your health.',
  },
  utevo_lux: {
    id: 'utevo_lux', name: 'Light', words: 'utevo lux', kind: 'buff', group: 'support', mana: 20, level: 8, vocations: ALL,
    cooldown: 2, buff: 'light', duration: 300, price: 0, description: 'Lights up dark caves around you.',
  },
};

export const SPELL_LIST: SpellDef[] = Object.values(SPELLS);

export function isSpellId(v: unknown): v is SpellId {
  return typeof v === 'string' && v in SPELLS;
}

/** Matches spoken words to a spell. Returns the spell and any quoted parameter. */
export function parseSpellWords(text: string): { spell: SpellDef; param: string | null } | null {
  const t = text.trim().toLowerCase();
  let best: SpellDef | null = null;
  for (const s of SPELL_LIST) {
    if ((t === s.words || t.startsWith(`${s.words} "`)) && (!best || s.words.length > best.words.length)) best = s;
  }
  if (!best) return null;
  const q = text.indexOf('"');
  const param = q >= 0 ? text.slice(q + 1).replace(/"/g, '').trim() || null : null;
  return { spell: best, param };
}

/** Spells every new character already knows. */
export function startingSpells(): SpellId[] {
  return SPELL_LIST.filter((s) => s.price === 0).map((s) => s.id);
}

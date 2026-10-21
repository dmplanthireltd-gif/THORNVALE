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
  | 'utani_hur' | 'utamo_vita' | 'utevo_lux'
  | 'exori_mas_grav' | 'exevo_con' | 'exevo_con_ferro' | 'exevo_con_aquila' | 'exevo_lanca'
  // spells update: the rest of the classic spell list
  | 'exori_mort' | 'exori_mas'
  | 'exevo_flam_hur' | 'exevo_frigo_hur' | 'exevo_tera_hur' | 'exevo_vis_hur' | 'exevo_vis_lux' | 'exevo_gran_vis_lux'
  | 'exevo_gran_mas_flam' | 'exevo_gran_mas_tera'
  | 'exura_gran_mas_res' | 'exura_san' | 'exana_pox'
  | 'utani_gran_hur' | 'utevo_gran_lux' | 'utevo_vis_lux' | 'utana_vid' | 'exiva' | 'exani_tera' | 'exani_hur_up' | 'exani_hur_down'
  | 'exeta_res' | 'utevo_res_ina'
  | 'exevo_pan' | 'exevo_con_flam' | 'exevo_con_pox' | 'exevo_con_mort'
  | 'adori_min_vis' | 'adori_vis' | 'adori_flam' | 'adori_mas_flam' | 'adori_frigo' | 'adori_mas_frigo' | 'adori_tera' | 'adori_mas_tera'
  | 'adori_mas_vis' | 'adori_gran_mort' | 'adori_san' | 'adevo_mas_hur' | 'adura_gran' | 'adura_vita' | 'adana_pox' | 'adana_ani'
  | 'adevo_grav_flam' | 'adevo_grav_vis' | 'adevo_grav_pox' | 'adevo_mas_flam' | 'adevo_mas_vis' | 'adevo_mas_pox'
  | 'adevo_mas_grav_flam' | 'adevo_mas_grav_vis' | 'adevo_mas_grav_pox' | 'adevo_grav_tera' | 'adito_grav';

/**
 * heal/healFriend/massHeal: healing; target: one monster; selfArea: circle around you;
 * wave: a cone in the facing direction; beam: a straight line in the facing direction;
 * buff: timed effect; conjure: makes items; cure: ends poison; find: where is a player;
 * rope: climb a rope spot; levitate: up/down a floor; challenge: monsters attack you;
 * illusion: look like a monster.
 */
export type SpellKind =
  | 'heal' | 'healFriend' | 'massHeal' | 'target' | 'selfArea' | 'wave' | 'beam' | 'buff' | 'conjure'
  | 'cure' | 'find' | 'rope' | 'levitate' | 'challenge' | 'illusion';
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
  buff?: 'haste' | 'magicShield' | 'light' | 'strongHaste' | 'greatLight' | 'ultimateLight' | 'invisible';
  duration?: number;
  /** Waves and beams: how many tiles they reach in front of you. */
  length?: number;
  /** Levitate direction. */
  dir?: 'up' | 'down';
  /** Spells that take a quoted word: what to put in the quotes (shown in the spell book). */
  param?: string;
  /** Conjuring: creates `qty` of `item` in the backpack, using up one `from` if set. */
  conjure?: { item: string; qty: number; from?: string };
  /** Gold to learn it from a trainer (0 = known from the start). */
  price: number;
  description: string;
}

const ALL: Vocation[] = ['knight', 'paladin', 'sorcerer', 'druid'];
const MAGES: Vocation[] = ['sorcerer', 'druid'];

/** The item every rune spell needs, used up on casting. */
export const BLANK_RUNE = 'blank_rune';

/** A rune spell: turns one blank rune and mana into `qty` runes of `item`. */
function rune(id: SpellId, runeName: string, words: string, item: string, qty: number, level: number, mana: number, vocations: Vocation[], price: number): SpellDef {
  return {
    id, name: `Make ${runeName}`, words, kind: 'conjure', group: 'support', mana, level, vocations, cooldown: 2,
    conjure: { item, qty, from: BLANK_RUNE }, price,
    description: `Binds magic into a blank rune: ${qty > 1 ? `${qty} ${runeName.toLowerCase()}s` : `one ${runeName.toLowerCase()}`}.`,
  };
}

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
  // --- northlands update ------------------------------------------------------------
  exori_mas_grav: {
    id: 'exori_mas_grav', name: 'Groundshaker', words: 'exori mas grav', kind: 'selfArea', group: 'attack', mana: 160, level: 33, vocations: ['knight'],
    cooldown: 8, element: 'physical', min: 18, max: 36, perLevel: 1.3, weaponScale: 0.9, radius: 3, price: 1800,
    description: 'Slams the ground: shakes every enemy within three tiles.',
  },
  exevo_con: {
    id: 'exevo_con', name: 'Conjure Arrows', words: 'exevo con', kind: 'conjure', group: 'support', mana: 70, level: 13, vocations: ['paladin'],
    cooldown: 2, conjure: { item: 'arrow', qty: 15 }, price: 450, description: 'Conjures 15 arrows into your backpack.',
  },
  exevo_con_ferro: {
    id: 'exevo_con_ferro', name: 'Conjure Piercing Bolts', words: 'exevo con ferro', kind: 'conjure', group: 'support', mana: 140, level: 25, vocations: ['paladin'],
    cooldown: 2, conjure: { item: 'piercing_bolt', qty: 10 }, price: 1500, description: 'Conjures 10 piercing bolts into your backpack.',
  },
  exevo_con_aquila: {
    id: 'exevo_con_aquila', name: 'Conjure Hawkeye Arrows', words: 'exevo con aquila', kind: 'conjure', group: 'support', mana: 160, level: 35, vocations: ['paladin'],
    cooldown: 2, conjure: { item: 'hawkeye_arrow', qty: 10 }, price: 2200, description: 'Conjures 10 hawkeye arrows into your backpack.',
  },
  exevo_lanca: {
    id: 'exevo_lanca', name: 'Runebind Spear', words: 'exevo lanca', kind: 'conjure', group: 'support', mana: 300, level: 45, vocations: ['paladin'],
    cooldown: 2, conjure: { item: 'enchanted_spear', qty: 1, from: 'spear' }, price: 2000,
    description: 'Binds runes into a spear from your backpack: a runebound spear is rarely lost when thrown.',
  },
  // --- spells update: attack ---------------------------------------------------------
  exori_mort: {
    id: 'exori_mort', name: 'Death Strike', words: 'exori mort', kind: 'target', group: 'attack', mana: 20, level: 16, vocations: ['sorcerer'],
    cooldown: 2, element: 'death', min: 25, max: 45, perLevel: 1.7, range: 3, price: 800, description: 'Death damage on one target.',
  },
  exori_mas: {
    id: 'exori_mas', name: 'Sweeping Berserk', words: 'exori mas', kind: 'selfArea', group: 'attack', mana: 220, level: 50, vocations: ['knight'],
    cooldown: 6, element: 'physical', min: 30, max: 55, perLevel: 1.9, weaponScale: 1.7, radius: 2, price: 4500,
    description: 'A wide sweep of your weapon that strikes every enemy within two tiles.',
  },
  exevo_flam_hur: {
    id: 'exevo_flam_hur', name: 'Fire Wave', words: 'exevo flam hur', kind: 'wave', group: 'attack', mana: 25, level: 18, vocations: ['sorcerer'],
    cooldown: 4, element: 'fire', min: 20, max: 40, perLevel: 1.3, length: 4, price: 850, description: 'A cone of fire rolls out in front of you.',
  },
  exevo_frigo_hur: {
    id: 'exevo_frigo_hur', name: 'Ice Wave', words: 'exevo frigo hur', kind: 'wave', group: 'attack', mana: 25, level: 18, vocations: ['druid'],
    cooldown: 4, element: 'ice', min: 20, max: 40, perLevel: 1.3, length: 4, price: 850, description: 'A cone of frost rolls out in front of you.',
  },
  exevo_tera_hur: {
    id: 'exevo_tera_hur', name: 'Terra Wave', words: 'exevo tera hur', kind: 'wave', group: 'attack', mana: 170, level: 38, vocations: ['druid'],
    cooldown: 4, element: 'earth', min: 50, max: 95, perLevel: 2.4, length: 5, price: 2500, description: 'A wide cone of thorns and stone in front of you.',
  },
  exevo_vis_hur: {
    id: 'exevo_vis_hur', name: 'Energy Wave', words: 'exevo vis hur', kind: 'wave', group: 'attack', mana: 170, level: 38, vocations: ['sorcerer'],
    cooldown: 8, element: 'energy', min: 60, max: 110, perLevel: 2.6, length: 5, price: 2500, description: 'A wide cone of lightning in front of you.',
  },
  exevo_vis_lux: {
    id: 'exevo_vis_lux', name: 'Energy Beam', words: 'exevo vis lux', kind: 'beam', group: 'attack', mana: 40, level: 23, vocations: ['sorcerer'],
    cooldown: 4, element: 'energy', min: 35, max: 65, perLevel: 1.8, length: 5, price: 1000, description: 'A straight bolt of energy hits everything in a line in front of you.',
  },
  exevo_gran_vis_lux: {
    id: 'exevo_gran_vis_lux', name: 'Great Energy Beam', words: 'exevo gran vis lux', kind: 'beam', group: 'attack', mana: 110, level: 29, vocations: ['sorcerer'],
    cooldown: 6, element: 'energy', min: 60, max: 110, perLevel: 2.4, length: 8, price: 1800, description: 'A long, searing beam of energy in front of you.',
  },
  exevo_gran_mas_flam: {
    id: 'exevo_gran_mas_flam', name: "Hell's Core", words: 'exevo gran mas flam', kind: 'selfArea', group: 'attack', mana: 1100, level: 60, vocations: ['sorcerer'],
    cooldown: 8, element: 'fire', min: 90, max: 180, perLevel: 4.2, radius: 5, price: 8000, description: 'A storm of fire engulfs everything around you.',
  },
  exevo_gran_mas_tera: {
    id: 'exevo_gran_mas_tera', name: 'Wrath of Nature', words: 'exevo gran mas tera', kind: 'selfArea', group: 'attack', mana: 700, level: 55, vocations: ['druid'],
    cooldown: 8, element: 'earth', min: 75, max: 150, perLevel: 3.8, radius: 5, price: 6000, description: 'The ground erupts in thorns all around you.',
  },
  // --- spells update: healing ----------------------------------------------------------
  exura_gran_mas_res: {
    id: 'exura_gran_mas_res', name: 'Mass Healing', words: 'exura gran mas res', kind: 'massHeal', group: 'heal', mana: 150, level: 36, vocations: ['druid'],
    cooldown: 2, min: 80, max: 140, perLevel: 3.2, radius: 4, price: 2200, description: 'Heals you and every player near you.',
  },
  exura_san: {
    id: 'exura_san', name: 'Divine Healing', words: 'exura san', kind: 'heal', group: 'heal', mana: 160, level: 35, vocations: ['paladin'],
    cooldown: 1, min: 170, max: 280, perLevel: 5.4, price: 3000, description: "A paladin's great self-heal, carried by holy light.",
  },
  exana_pox: {
    id: 'exana_pox', name: 'Cure Poison', words: 'exana pox', kind: 'cure', group: 'heal', mana: 30, level: 10, vocations: ALL,
    cooldown: 6, price: 150, description: 'Cures you of poison.',
  },
  // --- spells update: support ----------------------------------------------------------
  utani_gran_hur: {
    id: 'utani_gran_hur', name: 'Strong Haste', words: 'utani gran hur', kind: 'buff', group: 'support', mana: 100, level: 20, vocations: MAGES,
    cooldown: 2, buff: 'strongHaste', duration: 22, price: 1300, description: 'Walk 70% faster for 22 seconds.',
  },
  utevo_gran_lux: {
    id: 'utevo_gran_lux', name: 'Great Light', words: 'utevo gran lux', kind: 'buff', group: 'support', mana: 60, level: 13, vocations: ALL,
    cooldown: 2, buff: 'greatLight', duration: 600, price: 500, description: 'A brighter, longer light for dark caves.',
  },
  utevo_vis_lux: {
    id: 'utevo_vis_lux', name: 'Ultimate Light', words: 'utevo vis lux', kind: 'buff', group: 'support', mana: 140, level: 26, vocations: MAGES,
    cooldown: 2, buff: 'ultimateLight', duration: 1000, price: 1600, description: 'The brightest light, lasting a long time.',
  },
  utana_vid: {
    id: 'utana_vid', name: 'Invisible', words: 'utana vid', kind: 'buff', group: 'support', mana: 440, level: 35, vocations: MAGES,
    cooldown: 2, buff: 'invisible', duration: 120, price: 2000, description: 'Monsters cannot see you for two minutes and lose track of you.',
  },
  exiva: {
    id: 'exiva', name: 'Find Person', words: 'exiva', kind: 'find', group: 'support', mana: 20, level: 8, vocations: ALL,
    cooldown: 2, param: 'name', price: 80, description: 'Tells you in which direction and how far away a player is: say exiva "Name.',
  },
  exani_tera: {
    id: 'exani_tera', name: 'Magic Rope', words: 'exani tera', kind: 'rope', group: 'support', mana: 20, level: 9, vocations: ALL,
    cooldown: 2, price: 200, description: 'Climbs up a rope spot you stand on or next to, without a rope.',
  },
  exani_hur_up: {
    id: 'exani_hur_up', name: 'Levitate Up', words: 'exani hur up', kind: 'levitate', group: 'support', mana: 50, level: 12, vocations: ALL,
    cooldown: 2, dir: 'up', price: 250, description: 'Floats you up onto the floor above, in front of you, where there is open sky.',
  },
  exani_hur_down: {
    id: 'exani_hur_down', name: 'Levitate Down', words: 'exani hur down', kind: 'levitate', group: 'support', mana: 50, level: 12, vocations: ALL,
    cooldown: 2, dir: 'down', price: 250, description: 'Floats you down from a ledge or roof to the floor below, in front of you.',
  },
  exeta_res: {
    id: 'exeta_res', name: 'Challenge', words: 'exeta res', kind: 'challenge', group: 'support', mana: 40, level: 20, vocations: ['knight'],
    cooldown: 2, radius: 2, price: 1000, description: 'Every monster within two tiles turns on you, sparing your friends.',
  },
  utevo_res_ina: {
    id: 'utevo_res_ina', name: 'Creature Illusion', words: 'utevo res ina', kind: 'illusion', group: 'support', mana: 100, level: 23, vocations: MAGES,
    cooldown: 2, param: 'creature', duration: 180, price: 1000, description: 'Take on the look of a monster for three minutes: say utevo res ina "wolf.',
  },
  // --- spells update: conjuring ----------------------------------------------------------
  exevo_pan: {
    id: 'exevo_pan', name: 'Conjure Food', words: 'exevo pan', kind: 'conjure', group: 'support', mana: 120, level: 14, vocations: ['druid'],
    cooldown: 2, conjure: { item: 'ham', qty: 2 }, price: 300, description: 'Conjures two hams into your backpack.',
  },
  exevo_con_flam: {
    id: 'exevo_con_flam', name: 'Conjure Flaming Arrows', words: 'exevo con flam', kind: 'conjure', group: 'support', mana: 290, level: 25, vocations: ['paladin'],
    cooldown: 2, conjure: { item: 'flaming_arrow', qty: 8 }, price: 1000, description: 'Conjures 8 flaming arrows into your backpack.',
  },
  exevo_con_pox: {
    id: 'exevo_con_pox', name: 'Conjure Venom Arrows', words: 'exevo con pox', kind: 'conjure', group: 'support', mana: 130, level: 16, vocations: ['paladin'],
    cooldown: 2, conjure: { item: 'poison_arrow', qty: 10 }, price: 700, description: 'Conjures 10 venom arrows into your backpack.',
  },
  exevo_con_mort: {
    id: 'exevo_con_mort', name: 'Conjure Bolts', words: 'exevo con mort', kind: 'conjure', group: 'support', mana: 140, level: 17, vocations: ['paladin'],
    cooldown: 2, conjure: { item: 'bolt', qty: 15 }, price: 750, description: 'Conjures 15 bolts into your backpack.',
  },
  // --- spells update: rune spells (a blank rune + mana → runes) ----------------------------
  adori_min_vis: rune('adori_min_vis', 'Spark Rune', 'adori min vis', 'spark_rune', 5, 15, 120, MAGES, 300),
  adori_vis: rune('adori_vis', 'Thunderbolt Rune', 'adori vis', 'thunderbolt_rune', 4, 25, 350, MAGES, 900),
  adori_flam: rune('adori_flam', 'Ember Rune', 'adori flam', 'ember_rune', 4, 27, 460, ['sorcerer'], 1100),
  adori_mas_flam: rune('adori_mas_flam', 'Fireball Rune', 'adori mas flam', 'fireball_rune', 3, 30, 530, ['sorcerer'], 1500),
  adori_frigo: rune('adori_frigo', 'Icicle Rune', 'adori frigo', 'icicle_rune', 4, 28, 460, ['druid'], 1100),
  adori_mas_frigo: rune('adori_mas_frigo', 'Avalanche Rune', 'adori mas frigo', 'avalanche_rune', 3, 30, 530, ['druid'], 1500),
  adori_tera: rune('adori_tera', 'Rockspike Rune', 'adori tera', 'rockspike_rune', 4, 24, 350, MAGES, 900),
  adori_mas_tera: rune('adori_mas_tera', 'Stoneshower Rune', 'adori mas tera', 'stoneshower_rune', 3, 28, 430, ['druid'], 1300),
  adori_mas_vis: rune('adori_mas_vis', 'Stormcloud Rune', 'adori mas vis', 'stormcloud_rune', 3, 28, 430, ['sorcerer'], 1300),
  adori_gran_mort: rune('adori_gran_mort', 'Death Strike Rune', 'adori gran mort', 'death_rune', 2, 45, 985, ['sorcerer'], 3000),
  adori_san: rune('adori_san', 'Sunlance Rune', 'adori san', 'sunlance_rune', 3, 27, 300, ['paladin'], 1600),
  adevo_mas_hur: rune('adevo_mas_hur', 'Blast Rune', 'adevo mas hur', 'blast_rune', 3, 31, 570, MAGES, 1600),
  adura_gran: rune('adura_gran', 'Soothing Rune', 'adura gran', 'soothing_rune', 1, 15, 120, ['druid'], 600),
  adura_vita: rune('adura_vita', 'Mending Rune', 'adura vita', 'healing_rune', 1, 24, 400, ['druid'], 1500),
  adana_pox: rune('adana_pox', 'Antidote Rune', 'adana pox', 'antidote_rune', 1, 15, 200, ['druid'], 600),
  adana_ani: rune('adana_ani', 'Snare Rune', 'adana ani', 'snare_rune', 1, 54, 1400, ['druid'], 4000),
  adevo_grav_flam: rune('adevo_grav_flam', 'Flame Field Rune', 'adevo grav flam', 'flame_field_rune', 3, 15, 240, MAGES, 500),
  adevo_grav_vis: rune('adevo_grav_vis', 'Static Field Rune', 'adevo grav vis', 'static_field_rune', 3, 18, 320, MAGES, 700),
  adevo_grav_pox: rune('adevo_grav_pox', 'Venom Field Rune', 'adevo grav pox', 'venom_field_rune', 3, 14, 200, MAGES, 400),
  adevo_mas_flam: rune('adevo_mas_flam', 'Firebloom Rune', 'adevo mas flam', 'firebloom_rune', 2, 27, 600, MAGES, 1500),
  adevo_mas_vis: rune('adevo_mas_vis', 'Stormbloom Rune', 'adevo mas vis', 'stormbloom_rune', 2, 37, 880, ['sorcerer'], 2000),
  adevo_mas_pox: rune('adevo_mas_pox', 'Venombloom Rune', 'adevo mas pox', 'venombloom_rune', 2, 25, 520, MAGES, 1200),
  adevo_mas_grav_flam: rune('adevo_mas_grav_flam', 'Flame Barrier Rune', 'adevo mas grav flam', 'flame_barrier_rune', 2, 33, 780, MAGES, 1800),
  adevo_mas_grav_vis: rune('adevo_mas_grav_vis', 'Static Barrier Rune', 'adevo mas grav vis', 'static_barrier_rune', 2, 41, 1000, MAGES, 2500),
  adevo_mas_grav_pox: rune('adevo_mas_grav_pox', 'Venom Barrier Rune', 'adevo mas grav pox', 'venom_barrier_rune', 2, 29, 640, MAGES, 1500),
  adevo_grav_tera: rune('adevo_grav_tera', 'Magic Wall Rune', 'adevo grav tera', 'arcane_wall_rune', 2, 32, 750, ['sorcerer'], 2100),
  adito_grav: rune('adito_grav', 'Dispel Rune', 'adito grav', 'dispel_rune', 3, 17, 120, ['paladin', 'sorcerer', 'druid'], 500),
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

/** Cardinal direction a creature faces (waves and beams go only N/E/S/W, the classic way). */
export function facingDir(facing: number): { dx: number; dy: number } {
  const dx = Math.round(Math.sin(facing));
  const dy = Math.round(Math.cos(facing));
  return dx !== 0 ? { dx, dy: 0 } : { dx: 0, dy: dy || 1 };
}

/**
 * Tiles a wave covers, nearest first: a cone that widens by one tile on each
 * side every second step (1, 3, 3, 5, 5 …).
 */
export function waveTiles(x: number, y: number, dir: { dx: number; dy: number }, length: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const sx = -dir.dy, sy = dir.dx; // sideways
  for (let d = 1; d <= length; d++) {
    const half = Math.floor(d / 2);
    for (let w = -half; w <= half; w++) out.push([x + dir.dx * d + sx * w, y + dir.dy * d + sy * w]);
  }
  return out;
}

/** Tiles a beam covers: a straight line, nearest first. */
export function beamTiles(x: number, y: number, dir: { dx: number; dy: number }, length: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let d = 1; d <= length; d++) out.push([x + dir.dx * d, y + dir.dy * d]);
  return out;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** What Find Person tells you about someone dx/dy tiles away and dz floors up (+) or down (-). */
export function exivaText(name: string, dx: number, dy: number, dz: number): string {
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  if (dz === 0 && d <= 4) return `${name} is standing next to you.`;
  // 0 = north (−y), clockwise in eighths
  const ang = Math.atan2(dx, -dy);
  const dir = COMPASS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
  if (dz !== 0 && d <= 4) return `${name} is ${dz > 0 ? 'above' : 'below'} you.`;
  const far = d > 250 ? 'very far to the ' : d > 100 ? 'far to the ' : 'to the ';
  const level = dz > 0 ? ' on a higher level' : dz < 0 ? ' on a lower level' : '';
  return `${name} is ${far}${dir}${level}.`;
}

/** Spells every new character already knows. */
export function startingSpells(): SpellId[] {
  return SPELL_LIST.filter((s) => s.price === 0).map((s) => s.id);
}

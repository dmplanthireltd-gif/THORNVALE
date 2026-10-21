import { ITEMS } from '../inventory/items';
import type { SpellId } from '../magic/spells';
import type { Outfit } from '../player/outfits';

export interface ShopEntry {
  id: string;
  price: number;
}

export interface TravelEntry {
  /** Destination key in WorldMap.destinations. */
  key: string;
  name: string;
  price: number;
}

export interface NpcDef {
  key: string;
  name: string;
  /** Shown under the name (what they do). */
  role: string;
  greeting: string;
  look: Outfit;
  /** Held item shown on the model. */
  prop?: 'halberd' | 'hammer' | 'staff' | 'book' | 'bow' | 'oar' | 'ledger';
  sells?: ShopEntry[];
  /** Item ids this NPC buys, at the item's value. */
  buys?: string[];
  bank?: boolean;
  travel?: TravelEntry[];
  spells?: SpellId[];
  quests?: boolean;
}

const s = (id: string, price?: number): ShopEntry => ({ id, price: price ?? Math.max(1, Math.round(ITEMS[id].value * 2.5)) });
const materials = Object.values(ITEMS).filter((d) => d.kind === 'material').map((d) => d.id);
const byKind = (...kinds: string[]) => Object.values(ITEMS).filter((d) => kinds.includes(d.kind) && d.rarity !== 'legendary').map((d) => d.id);

export const NPCS: Record<string, NpcDef> = {
  aldric: {
    key: 'aldric', name: 'Captain Aldric', role: 'Captain of the Guard', quests: true, prop: 'halberd',
    greeting: 'Hail, {name}. Thornvale is glad of a sword arm. What brings you to me?',
    look: { type: 'knight', head: 45, body: 46, legs: 108, feet: 98 },
    sells: [s('health_potion', 45), s('mana_potion', 50)],
    buys: materials,
  },
  brunhild: {
    key: 'brunhild', name: 'Brunhild', role: 'Weapon & armour smith', prop: 'hammer',
    greeting: 'Steel for the bold, {name}. Buying or selling?',
    look: { type: 'barbarian', head: 61, body: 62, legs: 79, feet: 98 },
    sells: [
      s('short_sword', 30), s('iron_sword', 160), s('bastard_sword', 900), s('hatchet', 70), s('battle_axe', 450), s('iron_mace', 120),
      s('morning_star', 400), s('war_hammer', 1200), s('wooden_shield', 25), s('iron_shield', 220), s('tower_shield', 2500),
      s('leather_helmet', 12), s('chain_helmet', 70), s('iron_helmet', 260), s('leather_armor', 25), s('chain_armor', 230), s('plate_armor', 1200),
      s('leather_legs', 15), s('chain_legs', 120), s('plate_legs', 2600), s('leather_boots', 8), s('steel_boots', 4000),
    ],
    buys: byKind('weapon', 'shield', 'helmet', 'armor', 'legs', 'boots').filter((id) => !['wand', 'rod'].includes(ITEMS[id].weaponType ?? '')),
  },
  mirella: {
    key: 'mirella', name: 'Mirella', role: 'Magic, runes & potions', prop: 'staff',
    greeting: 'Welcome to my little shop of wonders, {name}.',
    look: { type: 'mage', head: 108, body: 107, legs: 31, feet: 98 },
    sells: [
      s('health_potion', 45), s('strong_health_potion', 100), s('great_health_potion', 190), s('mana_potion', 50), s('strong_mana_potion', 90), s('great_mana_potion', 120),
      s('spark_rune', 8), s('fireball_rune', 40), s('avalanche_rune', 45), s('stoneshower_rune', 45), s('death_rune', 110), s('healing_rune', 70),
      s('wand_of_sparks', 500), s('wand_of_embers', 5000), s('wand_of_storms', 10000), s('rod_of_frost', 500), s('rod_of_thorns', 5000), s('rod_of_glaciers', 10000),
      s('apprentice_book', 150), s('mage_robe', 600), s('sunstone_ring', 900),
    ],
    buys: [...byKind('rune'), 'wand_of_sparks', 'wand_of_embers', 'wand_of_storms', 'rod_of_frost', 'rod_of_thorns', 'rod_of_glaciers', 'mage_robe', 'arcane_robe', 'storm_tome', 'elven_scroll', 'orc_charm', 'fiery_heart', 'demonic_essence'],
  },
  garrick: {
    key: 'garrick', name: 'Garrick', role: 'Outfitter — bows, ammo & tools', prop: 'bow',
    greeting: 'Arrows, ropes, packs — everything an adventurer forgets, {name}.',
    look: { type: 'ranger', head: 70, body: 69, legs: 79, feet: 98 },
    sells: [
      s('rope', 50), s('shovel', 50), s('bag', 12), s('backpack', 30), s('explorer_pack', 600),
      s('hunting_bow', 120), s('composite_bow', 1500), s('light_crossbow', 400), s('heavy_crossbow', 6000),
      s('arrow', 3), s('poison_arrow', 6), s('flaming_arrow', 12), s('bolt', 4), s('piercing_bolt', 9), s('infernal_bolt', 20),
      s('spear', 10), s('throwing_star', 14), s('royal_javelin', 30), s('traveler_boots', 1200), s('meat', 6), s('ham', 12),
    ],
    buys: ['hunting_bow', 'composite_bow', 'elven_longbow', 'light_crossbow', 'heavy_crossbow', 'wolf_pelt', 'crocodile_leather', 'spider_silk', 'troll_hair', 'rat_tail', 'bone', 'orc_tooth', 'elvish_talisman'],
  },
  orwin: {
    key: 'orwin', name: 'Orwin', role: 'Banker', bank: true, prop: 'ledger',
    greeting: 'Good day, {name}. Your gold is safe with the Thornvale Bank.',
    look: { type: 'noble', head: 4, body: 125, legs: 107, feet: 99 },
    buys: ['small_ruby', 'small_sapphire', 'small_emerald', 'small_diamond', 'golden_goblet'],
  },
  elias: {
    key: 'elias', name: 'Master Elias', role: 'Spell trainer', prop: 'book',
    greeting: 'Knowledge is the sharpest blade, {name}. Which words would you learn?',
    look: { type: 'mage', head: 6, body: 106, legs: 5, feet: 100 },
    spells: [
      'exura_ico', 'exura_gran', 'exura_vita', 'exura_sio', 'exori', 'exori_gran', 'exori_hur', 'exori_con', 'exori_san',
      'exori_vis', 'exori_flam', 'exori_frigo', 'exori_tera', 'exevo_gran_mas_vis', 'exevo_gran_mas_frigo', 'exevo_mas_san', 'utani_hur', 'utamo_vita',
    ],
  },
  hask: {
    key: 'hask', name: 'Ferryman Hask', role: 'Ship to Palmreach', prop: 'oar',
    greeting: 'Sea\'s calm today, {name}. Fancy a trip south to the jungle?',
    look: { type: 'citizen', head: 3, body: 31, legs: 108, feet: 98 },
    travel: [{ key: 'palmreach', name: 'Palmreach', price: 120 }],
  },
  brann: {
    key: 'brann', name: 'Warden Brann', role: 'Watchpost quartermaster', quests: true, prop: 'halberd',
    greeting: 'Keep your voice down, {name}. The elves in Silverbough have sharp ears.',
    look: { type: 'ranger', head: 79, body: 80, legs: 80, feet: 98 },
    sells: [s('health_potion', 50), s('mana_potion', 55), s('arrow', 3), s('bolt', 4), s('rope', 55), s('shovel', 55)],
    buys: materials,
  },
  mara: {
    key: 'mara', name: 'Captain Mara', role: 'Ship to Thornvale', prop: 'oar',
    greeting: 'Ahoy, {name}! The Saltwind sails north whenever you\'re ready.',
    look: { type: 'noble', head: 1, body: 27, legs: 107, feet: 98 },
    travel: [{ key: 'thornvale', name: 'Thornvale', price: 120 }],
  },
  zuri: {
    key: 'zuri', name: 'Zuri', role: 'Jungle trader', prop: 'bow',
    greeting: 'Welcome to Palmreach, {name}. Hunters sell to me first.',
    look: { type: 'ranger', head: 84, body: 83, legs: 4, feet: 98 },
    sells: [
      s('health_potion', 50), s('strong_health_potion', 110), s('mana_potion', 55), s('strong_mana_potion', 100),
      s('arrow', 4), s('poison_arrow', 7), s('bolt', 5), s('piercing_bolt', 10), s('spear', 12), s('rope', 55), s('shovel', 55),
      s('avalanche_rune', 50), s('stoneshower_rune', 50), s('healing_rune', 75), s('jade_amulet', 2000), s('frost_pendant', 2000),
    ],
    buys: materials,
  },
  tomas: {
    key: 'tomas', name: 'Old Tomas', role: 'Retired hydra hunter', quests: true, prop: 'staff',
    greeting: 'Sit down, {name}. Let an old hunter tell you about the swamps.',
    look: { type: 'citizen', head: 0, body: 61, legs: 99, feet: 98 },
  },
  pell: {
    key: 'pell', name: 'Pell', role: 'Banker', bank: true, prop: 'ledger',
    greeting: 'The Palmreach branch of the Thornvale Bank, at your service, {name}.',
    look: { type: 'noble', head: 3, body: 22, legs: 107, feet: 99 },
  },
};

/** Gold an NPC pays for an item. */
export function buyPrice(id: string): number {
  return ITEMS[id]?.value ?? 0;
}

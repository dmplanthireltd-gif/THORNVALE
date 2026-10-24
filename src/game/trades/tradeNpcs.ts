import { ITEMS } from '../inventory/items';
import type { NpcDef, ShopEntry } from '../npc/npcs';
import type { OutfitType } from '../player/outfits';
import { CLEAN_HERBS, EMPTY_VIAL, GRIMY_HERBS, PESTLE, VIGOUR_POTION } from './herblore';
import { MARK_TIERS } from './thieving';
import { STOLEN_GOODS } from '../inventory/tradeItems';

/**
 * The people of the trade skills: one master per new skill (advice, tools, the
 * skill cape), and townsfolk whose pockets can be picked. Each stands in a town
 * (world/tradeSpots.ts finds them a free tile near the town centre, after the
 * whole world is built, so no other NPC or monster id moves). npcs.ts merges
 * these into NPCS. Keys are stable forever.
 */

export interface TradeNpc {
  def: NpcDef;
  /** Town key (world/townList.ts) whose centre they stand near. */
  town: string;
}

const price = (id: string, p?: number): ShopEntry => ({ id, price: p ?? Math.max(1, Math.round((ITEMS[id]?.value ?? 1) * 2.5)) });
const look = (type: OutfitType, head: number, body: number, legs: number): NpcDef['look'] => ({ type, head, body, legs, feet: 98 });

export const TRADE_MASTERS: TradeNpc[] = [
  {
    town: 'westmarch',
    def: {
      key: 'agility_master', name: 'Ysolt Quickstep', role: 'Agility master', prop: 'staff', look: look('ranger', 94, 21, 79),
      greeting: 'Light feet, {name}! The long way round is for people who never learned to climb.',
      advice: 'Agility is learned on the shortcuts of the realm: logs over rivers, rocks up the cliffs, a swim across a lake, a crack in a cave wall. Each one asks for a level; the map shows them all. Cross them again and again to learn. A higher agility level also lets you run for longer: switch running on under your stamina bar. A Draught of Vigour gives your breath back.',
      sells: [price(VIGOUR_POTION, 40), price('rope', 50)],
      buys: [VIGOUR_POTION],
    },
  },
  {
    town: 'corvane',
    def: {
      key: 'thief_master', name: 'Sly Morwick', role: 'Fence & thieving master', prop: 'ledger', look: look('citizen', 0, 114, 114),
      greeting: 'Keep your hands where I can see them, {name}. Mine are always busy.',
      advice: 'Start with the farmhands: their pockets are easy and their slaps are soft. Then the market stalls — but never with the keeper watching you. The strongboxes in bandit camps and old ruins need a lockpick, and their traps bite. If you are caught you are stunned for a moment, so do not try it next to anything that can hit back. And never, ever another adventurer: the realm will not allow it. I buy what you bring, no questions.',
      sells: [price('lockpick', 10)],
      buys: [...STOLEN_GOODS, 'golden_goblet', 'small_ruby', 'small_sapphire', 'small_emerald', 'small_diamond'],
    },
  },
  {
    town: 'elderglen',
    def: {
      key: 'herb_master', name: 'Mother Elsbeth', role: 'Herbalist', prop: 'staff', look: look('mystic', 22, 64, 63),
      greeting: 'Mind the drying racks, {name}. Every leaf on them is somebody\'s cure.',
      advice: 'Wild herbs grow all over the realm: marshwort in the meadows, frostmint in the snow, sunpetal in the deserts, starbloom only in the wildest places. They come up grimy; clean them with a pestle and mortar, then brew one with an empty vial. The stronger brews want a monster part as well — a bear paw, a scorpion tail. You can grow herbs in a herb patch too, once you know a little farming.',
      sells: [price(PESTLE, 30), price(EMPTY_VIAL, 4), price(VIGOUR_POTION, 40)],
      buys: [...GRIMY_HERBS, ...CLEAN_HERBS, EMPTY_VIAL, VIGOUR_POTION],
    },
  },
];

/** [town, key, name, tier, outfit type, head, body, legs] — townsfolk whose pockets can be picked. */
const MARKS: Array<[string, string, string, keyof typeof MARK_TIERS, OutfitType, number, number, number]> = [
  ['thornvale', 'mark_thornvale_wat', 'Wat the Farmhand', 'farmhand', 'citizen', 58, 77, 59],
  ['thornvale', 'mark_thornvale_pell', 'Pell the Pedlar', 'merchant', 'citizen', 2, 86, 115],
  ['westmarch', 'mark_westmarch_corwin', 'Corwin Bellweather', 'merchant', 'noble', 3, 22, 107],
  ['westmarch', 'mark_westmarch_garth', 'Watchman Garth', 'watchman', 'knight', 45, 46, 108],
  ['elderglen', 'mark_elderglen_oswin', 'Scribe Oswin', 'scholar', 'mage', 78, 82, 83],
  ['stonedeep', 'mark_stonedeep_brokk', 'Foreman Brokk', 'foreman', 'barbarian', 79, 61, 62],
  ['highmoor', 'mark_highmoor_elsie', 'Elsie the Milkmaid', 'farmhand', 'citizen', 78, 101, 81],
  ['highmoor', 'mark_highmoor_tull', 'Watchman Tull', 'watchman', 'knight', 38, 39, 115],
  ['millbrook', 'mark_millbrook_hob', 'Hob the Ploughman', 'farmhand', 'citizen', 58, 57, 76],
  ['millbrook', 'mark_millbrook_rena', 'Dockhand Rena', 'dockhand', 'citizen', 96, 86, 88],
  ['valdrheim', 'mark_valdrheim_orm', 'Huscarl Orm', 'watchman', 'barbarian', 80, 41, 115],
  ['aurelion', 'mark_aurelion_vashti', 'Lady Vashti', 'noble', 'noble', 94, 125, 119],
  ['aurelion', 'mark_aurelion_percival', 'Lord Percival', 'noble', 'noble', 4, 69, 107],
  ['aurelion', 'mark_aurelion_mabel', 'Archivist Mabel', 'scholar', 'mage', 115, 107, 31],
  ['briarwatch', 'mark_briarwatch_pike', 'Trapper Pike', 'watchman', 'ranger', 57, 76, 77],
  ['corvane', 'mark_corvane_sully', 'Dockhand Sully', 'dockhand', 'citizen', 0, 87, 88],
  ['corvane', 'mark_corvane_imra', 'Spice-trader Imra', 'merchant', 'mystic', 77, 79, 94],
  ['saltmere', 'mark_saltmere_gwen', 'Netmender Gwen', 'dockhand', 'citizen', 97, 86, 115],
  ['palmreach', 'mark_palmreach_kofi', 'Trader Kofi', 'merchant', 'citizen', 0, 63, 64],
  ['sunspire', 'mark_sunspire_hamid', 'Vizier Hamid', 'noble', 'mystic', 79, 78, 77],
  ['sunspire', 'mark_sunspire_naila', 'Silk-seller Naila', 'merchant', 'citizen', 114, 95, 96],
  ['dunewatch', 'mark_dunewatch_selim', 'Outrider Selim', 'watchman', 'ranger', 78, 77, 79],
];

const MARK_LINES: Record<string, string> = {
  farmhand: 'Busy day, {name}. The fields will not plough themselves.',
  dockhand: 'Mind the ropes, {name}. Ships to load.',
  merchant: 'Fine goods, fair prices, {name}. Well — fair for me.',
  watchman: 'Move along, {name}. Nothing to see here.',
  scholar: 'Hm? Oh. Good day, {name}. I was reading.',
  noble: 'Do not stand so close, {name}. This cloak cost more than your house.',
  foreman: 'Shift starts at the bell, {name}. Are you here to dig or to talk?',
};

export const TRADE_MARKS: TradeNpc[] = MARKS.map(([town, key, name, tier, type, head, body, legs]) => ({
  town,
  def: { key, name, role: `Townsfolk (${MARK_TIERS[tier].name})`, greeting: MARK_LINES[tier], look: look(type, head, body, legs), thieve: tier },
}));

export const TRADE_NPCS: TradeNpc[] = [...TRADE_MASTERS, ...TRADE_MARKS];

/**
 * Adds the trade-skill people to NPCS, and empty vials and pestles to every shop that sells
 * potions (magic shops and quest givers), so herblore supplies are wherever potions are.
 */
export function applyTradeNpcs(npcs: Record<string, NpcDef>): void {
  for (const n of TRADE_NPCS) if (!npcs[n.def.key]) npcs[n.def.key] = { ...n.def };
  for (const n of Object.values(npcs)) {
    if (!n.sells?.some((e) => e.id === 'mana_potion')) continue;
    if (!n.sells.some((e) => e.id === EMPTY_VIAL)) n.sells.push(price(EMPTY_VIAL, 4));
    if (!n.sells.some((e) => e.id === PESTLE)) n.sells.push(price(PESTLE, 30));
  }
}

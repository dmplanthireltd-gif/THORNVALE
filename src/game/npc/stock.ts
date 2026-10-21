import { ITEMS } from '../inventory/items';
import type { SpellId } from '../magic/spells';
import type { ShopEntry } from './npcs';

/**
 * Extra shop stock added by content updates, merged into the NPC definitions at
 * start-up: npc key → items sold / item ids bought. Lets new items reach shops
 * without editing every trader.
 */
const s = (id: string, price?: number): ShopEntry => ({ id, price: price ?? Math.max(1, Math.round((ITEMS[id]?.value ?? 1) * 2.5)) });

/** Materials added by the northlands update, bought by the general traders. */
const NEW_MATERIALS = [
  'silver_fur', 'antlers', 'snakeskin', 'penguin_feather', 'bear_paw', 'winter_wolf_fur', 'polar_bear_fur', 'iron_ore', 'frost_charm',
  'braided_cord', 'skull_trophy', 'minotaur_horn', 'minotaur_leather', 'cyclops_eye', 'scorpion_tail', 'scarab_coin', 'mummy_wrapping',
  'lizard_scale', 'giant_beard', 'crystal_shard', 'frozen_heart', 'frost_dragon_scale',
];

/** New weapons and armour the smith buys back (rares included, legendaries never exist here). */
const NEW_GEAR = [
  'lizard_blade', 'barbarian_axe', 'dwarven_axe', 'glacial_cleaver', 'tusk_club', 'stone_maul', 'dwarven_shield', 'scarab_shield', 'frostscale_shield',
  'fur_cap', 'dwarven_helmet', 'winged_helmet', 'frost_helm', 'fur_armor', 'dwarven_armor', 'frost_plate',
  'fur_legs', 'dwarven_legs', 'frost_legs', 'fur_boots', 'glacier_boots',
];

export const EXTRA_SELLS: Record<string, ShopEntry[]> = {
  brunhild: [
    s('barbarian_axe', 750), s('dwarven_axe', 1400), s('tusk_club', 240), s('dwarven_shield', 550),
    s('fur_cap', 70), s('dwarven_helmet', 900), s('fur_armor', 330), s('dwarven_armor', 2600), s('fur_legs', 110), s('dwarven_legs', 1150), s('fur_boots', 140),
  ],
  garrick: [
    s('fur_bag', 70), s('fur_backpack', 250), s('sylvan_bow', 3900),
    s('onyx_arrow', 8), s('hawkeye_arrow', 13), s('royal_spear', 16), s('enchanted_spear', 50), s('viper_star', 20), s('shadow_star', 65),
    s('fish', 5), s('mead', 15),
  ],
  mirella: [
    s('berserk_potion', 400), s('bullseye_potion', 400), s('mastermind_potion', 600), s('glacier_robe', 9500), s('frost_circlet', 6000),
  ],
  zuri: [s('bullseye_potion', 420), s('viper_star', 22), s('onyx_arrow', 9), s('fish', 5)],
  brann: [s('fur_cap', 75), s('fur_boots', 150), s('mead', 16)],
  aldric: [s('berserk_potion', 420)],
};

export const EXTRA_BUYS: Record<string, string[]> = {
  aldric: NEW_MATERIALS,
  brann: NEW_MATERIALS,
  zuri: NEW_MATERIALS,
  brunhild: [...NEW_GEAR, 'iron_ore', 'minotaur_leather', 'polar_bear_fur', 'frost_dragon_scale', 'lizard_scale'],
  garrick: ['sylvan_bow', 'frostbite_crossbow', 'fur_bag', 'fur_backpack', 'winter_wolf_fur', 'polar_bear_fur', 'snakeskin', 'antlers', 'silver_fur', 'penguin_feather', 'bear_paw'],
  mirella: ['glacier_robe', 'frost_circlet', 'frost_charm', 'crystal_shard', 'frozen_heart', 'mummy_wrapping', 'scarab_amulet'],
  orwin: ['scarab_coin', 'skull_trophy', 'cyclops_eye'],
};

/** Spells trainers teach in addition to their own list (merged in dialogue.ts). */
export const EXTRA_SPELLS: Record<string, SpellId[]> = {
  elias: ['exori_mas_grav', 'exevo_con', 'exevo_con_ferro', 'exevo_con_aquila', 'exevo_lanca'],
};

import type { Recipe } from './recipes';

/**
 * Crafting: tan hides into leather and fur at a tanning rack (every smithy has
 * one), sew leather and fur into armour, bags and backpacks with a needle and
 * thread, cut gems with a chisel, and cast rings and amulets from silver or
 * gold bars and cut gems at a furnace. Every finished piece is an item that
 * already existed (leather armour, fur coat, sapphire ring…); only the
 * materials are new.
 */
export const NEEDLE = 'needle';
export const THREAD = 'thread';
export const CHISEL = 'chisel';

/** Hides → tanned material. */
export const TANNING: Array<{ hide: string; out: string; qty: number; level: number; xp: number }> = [
  { hide: 'wolf_pelt', out: 'leather', qty: 1, level: 1, xp: 10 },
  { hide: 'bear_hide', out: 'leather', qty: 2, level: 10, xp: 22 },
  { hide: 'winter_wolf_fur', out: 'tanned_fur', qty: 1, level: 15, xp: 20 },
  { hide: 'polar_bear_fur', out: 'tanned_fur', qty: 2, level: 30, xp: 40 },
  // hunter catches (trades/hunter.ts)
  { hide: 'hare_pelt', out: 'leather', qty: 1, level: 5, xp: 12 },
  { hide: 'ferret_pelt', out: 'tanned_fur', qty: 1, level: 18, xp: 22 },
  { hide: 'skink_hide', out: 'leather', qty: 2, level: 25, xp: 28 },
  { hide: 'stoat_fur', out: 'tanned_fur', qty: 2, level: 35, xp: 45 },
  { hide: 'marten_pelt', out: 'tanned_fur', qty: 3, level: 50, xp: 70 },
];

/** Needle and thread: [output, level, xp, materials…, thread]. */
export const SEWING: Array<{ item: string; level: number; xp: number; mats: Array<[string, number]>; thread: number; group: string }> = [
  { item: 'leather_helmet', level: 1, xp: 14, mats: [['leather', 1]], thread: 1, group: 'Leather' },
  { item: 'leather_boots', level: 4, xp: 16, mats: [['leather', 1]], thread: 1, group: 'Leather' },
  { item: 'leather_legs', level: 7, xp: 25, mats: [['leather', 2]], thread: 1, group: 'Leather' },
  { item: 'leather_armor', level: 10, xp: 35, mats: [['leather', 3]], thread: 2, group: 'Leather' },
  { item: 'bag', level: 12, xp: 30, mats: [['leather', 2]], thread: 1, group: 'Leather' },
  { item: 'backpack', level: 18, xp: 50, mats: [['leather', 4]], thread: 2, group: 'Leather' },
  { item: 'fur_cap', level: 20, xp: 40, mats: [['tanned_fur', 1]], thread: 1, group: 'Fur' },
  { item: 'fur_boots', level: 23, xp: 45, mats: [['tanned_fur', 1]], thread: 1, group: 'Fur' },
  { item: 'fur_legs', level: 26, xp: 60, mats: [['tanned_fur', 2]], thread: 1, group: 'Fur' },
  { item: 'fur_armor', level: 30, xp: 80, mats: [['tanned_fur', 3]], thread: 2, group: 'Fur' },
  { item: 'fur_bag', level: 33, xp: 70, mats: [['tanned_fur', 2]], thread: 1, group: 'Fur' },
  { item: 'fur_backpack', level: 40, xp: 110, mats: [['tanned_fur', 4]], thread: 2, group: 'Fur' },
  { item: 'explorer_pack', level: 50, xp: 150, mats: [['minotaur_leather', 3], ['leather', 2]], thread: 3, group: 'Fur' },
];

/** Uncut (mined) gems → cut gems. */
export const GEM_CUTS: Array<{ gem: string; cut: string; level: number; xp: number }> = [
  { gem: 'small_sapphire', cut: 'cut_sapphire', level: 20, xp: 50 },
  { gem: 'small_emerald', cut: 'cut_emerald', level: 27, xp: 68 },
  { gem: 'small_ruby', cut: 'cut_ruby', level: 34, xp: 85 },
  { gem: 'small_diamond', cut: 'cut_diamond', level: 43, xp: 108 },
];

export const CUT_GEMS = GEM_CUTS.map((g) => g.cut);

/** Jewellery cast at a furnace (existing rings and amulets). */
export const JEWELLERY: Array<{ item: string; level: number; xp: number; mats: Array<[string, number]> }> = [
  { item: 'sunstone_ring', level: 15, xp: 40, mats: [['silver_bar', 1]] },
  { item: 'sapphire_ring', level: 25, xp: 60, mats: [['silver_bar', 1], ['cut_sapphire', 1]] },
  { item: 'frost_pendant', level: 30, xp: 70, mats: [['silver_bar', 1], ['cut_sapphire', 1]] },
  { item: 'jade_amulet', level: 35, xp: 80, mats: [['silver_bar', 1], ['cut_emerald', 1]] },
  { item: 'ring_of_vigor', level: 38, xp: 85, mats: [['silver_bar', 1], ['cut_ruby', 1]] },
  { item: 'ring_of_swiftness', level: 45, xp: 100, mats: [['gold_bar', 1], ['cut_emerald', 1]] },
  { item: 'garnet_amulet', level: 50, xp: 115, mats: [['gold_bar', 1], ['cut_ruby', 1]] },
  { item: 'amulet_of_warding', level: 55, xp: 130, mats: [['gold_bar', 1], ['cut_diamond', 1]] },
  { item: 'ring_of_might', level: 65, xp: 160, mats: [['gold_bar', 1], ['cut_diamond', 1], ['cut_ruby', 1]] },
];

const stacks = (mats: Array<[string, number]>) => mats.map(([id, qty]) => ({ id, qty }));

export const CRAFTING_RECIPES: Recipe[] = [
  ...TANNING.map((t): Recipe => ({
    id: `tan:${t.hide}`, skill: 'crafting', station: 'tanning', group: t.out === 'leather' ? 'Leather' : 'Fur', level: t.level, xp: t.xp,
    inputs: [{ id: t.hide, qty: 1 }], output: { id: t.out, qty: t.qty },
  })),
  ...SEWING.map((w): Recipe => ({
    id: `sew:${w.item}`, skill: 'crafting', station: 'needle', group: w.group, level: w.level, xp: w.xp,
    inputs: [...stacks(w.mats), { id: THREAD, qty: w.thread }], output: { id: w.item, qty: 1 }, tool: NEEDLE,
  })),
  ...GEM_CUTS.map((g): Recipe => ({
    id: `cut:${g.gem}`, skill: 'crafting', station: 'chisel', group: 'Gems', level: g.level, xp: g.xp,
    inputs: [{ id: g.gem, qty: 1 }], output: { id: g.cut, qty: 1 }, tool: CHISEL,
  })),
  ...JEWELLERY.map((j): Recipe => ({
    id: `jewel:${j.item}`, skill: 'crafting', station: 'furnace', group: 'Jewellery', level: j.level, xp: j.xp,
    inputs: stacks(j.mats), output: { id: j.item, qty: 1 },
  })),
];

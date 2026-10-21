import type { Recipe } from './recipes';

/**
 * Blacksmithing: smelt ore into bars at a furnace, then hammer bars into
 * weapons, armour, tools and arrowheads at an anvil (carrying a smith's hammer).
 * Wherever an item of the right kind and strength already existed (short sword,
 * chain mail, iron helmet…) the anvil makes that item; only the gaps were added.
 */
export const SMITHING_HAMMER = 'smithing_hammer';

export interface BarDef {
  bar: string;
  name: string;
  level: number;
  xp: number;
  ores: Array<[string, number]>;
  /** Iron is brittle: smelting can fail at low level. */
  success?: { base: number; perLevel: number };
}

/** Cheapest first. */
export const BARS: BarDef[] = [
  { bar: 'bronze_bar', name: 'Bronze', level: 1, xp: 6, ores: [['copper_ore', 1], ['tin_ore', 1]] },
  { bar: 'iron_bar', name: 'Iron', level: 15, xp: 12, ores: [['iron_ore', 1]], success: { base: 0.5, perLevel: 0.02 } },
  { bar: 'silver_bar', name: 'Silver', level: 20, xp: 14, ores: [['silver_ore', 1]] },
  { bar: 'steel_bar', name: 'Steel', level: 30, xp: 18, ores: [['iron_ore', 1], ['coal', 2]] },
  { bar: 'gold_bar', name: 'Gold', level: 40, xp: 22, ores: [['gold_ore', 1]] },
  { bar: 'starsteel_bar', name: 'Starsteel', level: 50, xp: 30, ores: [['starsteel_ore', 1], ['coal', 4]] },
  { bar: 'darkstone_bar', name: 'Darkstone', level: 80, xp: 50, ores: [['darkstone_ore', 1], ['coal', 8]] },
];

export const BAR_ITEMS = BARS.map((b) => b.bar);

/** The metals you can smith with, their level and experience per bar used. */
export const METALS: Array<{ key: string; name: string; bar: string; level: number; xpPerBar: number }> = [
  { key: 'bronze', name: 'Bronze', bar: 'bronze_bar', level: 1, xpPerBar: 12 },
  { key: 'iron', name: 'Iron', bar: 'iron_bar', level: 15, xpPerBar: 25 },
  { key: 'steel', name: 'Steel', bar: 'steel_bar', level: 30, xpPerBar: 37 },
  // silver and gold make armour only (the Moonsilver and Gilded sets)
  { key: 'silver', name: 'Silver', bar: 'silver_bar', level: 35, xpPerBar: 30 },
  { key: 'starsteel', name: 'Starsteel', bar: 'starsteel_bar', level: 50, xpPerBar: 50 },
  { key: 'gold', name: 'Gold', bar: 'gold_bar', level: 55, xpPerBar: 45 },
  { key: 'darkstone', name: 'Darkstone', bar: 'darkstone_bar', level: 80, xpPerBar: 75 },
];

export type Piece = 'dagger' | 'axe' | 'mace' | 'helmet' | 'arrowheads' | 'bolts' | 'pickaxe' | 'sword' | 'boots' | 'shield' | 'legs' | 'armour';

/** Each piece: levels above the metal's level, bars used, items made per order. */
export const PIECES: Record<Piece, { offset: number; bars: number; qty: number }> = {
  dagger: { offset: 0, bars: 1, qty: 1 },
  axe: { offset: 1, bars: 1, qty: 1 },
  mace: { offset: 2, bars: 1, qty: 1 },
  helmet: { offset: 3, bars: 1, qty: 1 },
  arrowheads: { offset: 4, bars: 1, qty: 10 },
  bolts: { offset: 5, bars: 1, qty: 10 },
  pickaxe: { offset: 5, bars: 2, qty: 1 },
  sword: { offset: 6, bars: 2, qty: 1 },
  boots: { offset: 7, bars: 2, qty: 1 },
  shield: { offset: 8, bars: 3, qty: 1 },
  legs: { offset: 11, bars: 3, qty: 1 },
  armour: { offset: 14, bars: 5, qty: 1 },
};

/**
 * What the anvil makes from each metal (existing items where one fits). A piece
 * may list several items (a bronze helm and a chain coif): each is its own
 * recipe at the same level. Recipe ids are `smith:<item>` and never change.
 */
export const SMITH_ITEMS: Record<string, Partial<Record<Piece, string | string[]>>> = {
  bronze: {
    dagger: 'bronze_dagger', axe: 'hatchet', mace: 'bronze_mace', helmet: ['bronze_helmet', 'chain_helmet'], arrowheads: 'bronze_arrowheads', bolts: 'bolt',
    pickaxe: 'bronze_pickaxe', sword: 'short_sword', boots: ['bronze_boots', 'chain_boots'], shield: 'bronze_shield', legs: ['bronze_legs', 'chain_legs'],
    armour: ['bronze_armor', 'chain_armor'],
  },
  iron: {
    dagger: 'iron_dagger', axe: 'battle_axe', mace: 'iron_mace', helmet: ['iron_helmet', 'plate_helmet'], arrowheads: 'iron_arrowheads',
    pickaxe: 'iron_pickaxe', sword: 'iron_sword', boots: ['iron_boots', 'plate_boots'], shield: 'iron_shield', legs: 'iron_legs', armour: ['iron_armor', 'plate_armor'],
  },
  steel: {
    dagger: 'steel_dagger', axe: 'barbarian_axe', mace: 'morning_star', helmet: 'steel_helmet', arrowheads: 'steel_arrowheads', bolts: 'piercing_bolt',
    pickaxe: 'steel_pickaxe', sword: 'bastard_sword', boots: 'steel_boots', shield: 'steel_shield', legs: ['steel_legs', 'plate_legs'], armour: 'steel_plate',
  },
  silver: {
    helmet: 'moonsilver_helm', boots: 'moonsilver_boots', shield: 'moonsilver_shield', legs: 'moonsilver_legs', armour: 'moonsilver_armor',
  },
  starsteel: {
    dagger: 'starsteel_dagger', axe: 'starsteel_axe', mace: 'starsteel_mace', helmet: 'starsteel_helm', arrowheads: 'starsteel_arrowheads',
    pickaxe: 'starsteel_pickaxe', sword: 'starsteel_sword', boots: 'starsteel_boots', shield: 'starsteel_shield', legs: 'starsteel_legs', armour: 'starsteel_plate',
  },
  gold: {
    helmet: 'gilded_helmet', boots: 'gilded_boots', shield: 'gilded_shield', legs: 'gilded_legs', armour: 'gilded_armor',
  },
  darkstone: {
    dagger: 'darkstone_dagger', axe: 'darkstone_axe', mace: 'darkstone_mace', helmet: 'darkstone_helm', arrowheads: 'darkstone_arrowheads',
    sword: 'darkstone_sword', boots: 'darkstone_boots', shield: 'darkstone_shield', legs: 'darkstone_legs', armour: 'darkstone_plate',
  },
};

export const SMELTING_RECIPES: Recipe[] = BARS.map((b) => ({
  id: `smelt:${b.bar}`, skill: 'smithing', station: 'furnace', group: 'Bars', level: b.level, xp: b.xp,
  inputs: b.ores.map(([id, qty]) => ({ id, qty })), output: { id: b.bar, qty: 1 }, success: b.success,
}));

export const SMITHING_RECIPES: Recipe[] = METALS.flatMap((m) =>
  (Object.keys(PIECES) as Piece[]).flatMap((piece): Recipe[] => {
    const made = SMITH_ITEMS[m.key][piece];
    if (!made) return [];
    const p = PIECES[piece];
    return (Array.isArray(made) ? made : [made]).map((item) => ({
      id: `smith:${item}`, skill: 'smithing', station: 'anvil', group: m.name, level: Math.min(99, m.level + p.offset), xp: m.xpPerBar * p.bars,
      inputs: [{ id: m.bar, qty: p.bars }], output: { id: item, qty: p.qty }, tool: SMITHING_HAMMER,
    }));
  }),
);

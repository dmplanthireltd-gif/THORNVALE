/**
 * Herblore: pick wild herbs (they come up grimy), clean them, and brew them with
 * an empty vial — and for the stronger brews a monster part — into potions with
 * a pestle and mortar. Every potion it makes is one the shops already sell (so
 * the potion economy keeps its prices and the hunts their balance); the only new
 * brew is the Draught of Vigour, which refills running stamina (trades/agility.ts).
 * Herbs also grow in herb patches (farming). Pure data: no DOM, no three.js.
 */

export interface HerbDef {
  /** Id of the clean herb; the grimy one is `grimy_<id>`, the seed `<id>_seed`. */
  id: string;
  name: string;
  /** Herblore level to pick, clean and brew it (farming level to grow it: farming.ts). */
  level: number;
  /** Experience for picking one, for cleaning one. */
  pickXp: number;
  cleanXp: number;
  /** The potion it brews and the brew's level, experience and extra ingredient. */
  potion: string;
  brewLevel: number;
  brewXp: number;
  secondary?: string;
  /** Leaf colour (icons and the plant on the map). */
  color: string;
  /** Where it grows wild (region names; world/tradeSpots.ts). */
  regions: string[];
}

export const HERBS: HerbDef[] = [
  { id: 'marshwort', name: 'Marshwort', level: 1, pickXp: 8, cleanXp: 3, potion: 'health_potion', brewLevel: 1, brewXp: 12, color: '#6a9a3a', regions: ['Thornvale Meadows', 'Bramblewood', 'Millbrook Fields', 'Eastfold', 'Westmarch Fields', 'Fernwick Isle'] },
  { id: 'mooncress', name: 'Mooncress', level: 6, pickXp: 12, cleanXp: 4, potion: 'mana_potion', brewLevel: 6, brewXp: 18, color: '#7aa0c8', regions: ['Bramblewood', 'Silverbough Woods', 'Glimmer Vale', 'Mistwood', 'Corvane Grove'] },
  { id: 'hearthroot', name: 'Hearthroot', level: 14, pickXp: 18, cleanXp: 6, potion: 'vigour_potion', brewLevel: 14, brewXp: 30, color: '#c88a3a', regions: ['Highmoor Downs', 'Westmarch Fields', 'Chapel Hill', 'Briar Hills', 'Greyspine Mountains'] },
  { id: 'bloodthistle', name: 'Bloodthistle', level: 22, pickXp: 25, cleanXp: 8, potion: 'strong_health_potion', brewLevel: 26, brewXp: 45, secondary: 'bear_paw', color: '#a8283a', regions: ['Orc Ridge', 'Cyclops Ridge', 'Sunscar Clearing', 'Bandit Hollow', 'Amazon Wilds'] },
  { id: 'frostmint', name: 'Frostmint', level: 32, pickXp: 34, cleanXp: 10, potion: 'strong_mana_potion', brewLevel: 36, brewXp: 55, secondary: 'frost_charm', color: '#9fe0f0', regions: ['Snowpine Reach', 'Frostholm Fields', 'Valdrheim Outskirts', 'Frostkin Floes'] },
  { id: 'sunpetal', name: 'Sunpetal', level: 42, pickXp: 42, cleanXp: 12, potion: 'bullseye_potion', brewLevel: 44, brewXp: 70, secondary: 'scorpion_tail', color: '#f0c040', regions: ['Northern Dunes', 'Sunspire Dunes', 'Dune Isles', 'Valley of Tombs'] },
  { id: 'duskcap', name: 'Duskcap', level: 50, pickXp: 50, cleanXp: 14, potion: 'mastermind_potion', brewLevel: 52, brewXp: 80, secondary: 'spider_silk', color: '#8a5ac0', regions: ['Palmreach Jungle', 'Mangrove Mire', 'Scalemire'] },
  { id: 'emberroot', name: 'Emberroot', level: 58, pickXp: 58, cleanXp: 16, potion: 'berserk_potion', brewLevel: 58, brewXp: 90, secondary: 'minotaur_horn', color: '#e0602a', regions: ['Ashfall Fields', 'Scorched Crags', 'Cinder Isle'] },
  { id: 'wyrmroot', name: 'Wyrmroot', level: 66, pickXp: 66, cleanXp: 18, potion: 'great_health_potion', brewLevel: 68, brewXp: 110, secondary: 'lizard_scale', color: '#4a8a5a', regions: ['Dragonspire Plateau', 'Scalemire', 'Hydra Bog'] },
  { id: 'starbloom', name: 'Starbloom', level: 76, pickXp: 76, cleanXp: 20, potion: 'great_mana_potion', brewLevel: 78, brewXp: 125, secondary: 'glowing_jelly', color: '#e8e0ff', regions: ['Gravewind Steppe', 'Jotun Isle', 'Royal Hunting Grounds'] },
];

export const HERB_BY_ID: Record<string, HerbDef> = Object.fromEntries(HERBS.map((h) => [h.id, h]));
export const GRIMY_HERBS: string[] = HERBS.map((h) => `grimy_${h.id}`);
export const CLEAN_HERBS: string[] = HERBS.map((h) => h.id);

export const EMPTY_VIAL = 'empty_vial';
export const PESTLE = 'pestle';
export const VIGOUR_POTION = 'vigour_potion';
/** Stamina a Draught of Vigour gives back. */
export const VIGOUR_STAMINA = 50;

/** Seconds between two picks at a herb patch. */
export const PICK_INTERVAL = 1.8;
/** Chance a picked tile is bare afterwards; how long it takes to grow back (s). */
export const HERB_DEPLETE = 1 / 3;
export const HERB_REGROW: [number, number] = [40, 80];

/** Chance one pick gives a herb (better with every level above the herb's). */
export function pickChance(level: number, h: HerbDef): number {
  return Math.max(0.1, Math.min(0.92, 0.55 + (level - h.level) * 0.015));
}

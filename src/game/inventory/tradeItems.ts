import type { ItemSpec } from './items';
import { HERBS } from '../trades/herblore';

/**
 * Items of the trade skills added on 2026-10-24 (agility, herblore, thieving,
 * farming, hunter, slayer, sailing): herbs, vials, seeds and produce, traps,
 * lockpicks, stolen goods, catches and boat deeds. Equippable slayer gear lives
 * in items.ts with the other gear (it needs a model). Ids are stable forever.
 *
 * Like seaItems.ts, this module only imports types from items.ts (items.ts imports it).
 */

/** [id, name, level, heal, value, tint] — vegetables and fruit from farm patches (food). */
export const CROPS: Array<[id: string, name: string, level: number, heal: number, value: number, tint: string]> = [
  ['potato', 'Potato', 1, 10, 2, '#c8a060'],
  ['onion', 'Onion', 5, 8, 2, '#e8d8a8'],
  ['cabbage', 'Cabbage', 10, 12, 3, '#7ab04a'],
  ['tomato', 'Tomato', 20, 14, 4, '#e0402a'],
  ['sweetcorn', 'Sweetcorn', 30, 18, 6, '#f0d040'],
  ['strawberry', 'Strawberry', 40, 16, 8, '#e8304a'],
  ['watermelon', 'Watermelon', 55, 40, 14, '#3a8a3a'],
];
export const CROP_IDS: string[] = CROPS.map(([id]) => id);
export const CROP_SEEDS: string[] = CROPS.map(([id]) => `${id}_seed`);
export const HERB_SEEDS: string[] = HERBS.map((h) => `${h.id}_seed`);

/** Hunter catches: pelts and plumes (materials) and the bird you can roast. */
export const HUNT_MATERIALS: Array<[id: string, name: string, value: number, tint: string, note: string]> = [
  ['hare_pelt', 'Hare Pelt', 6, '#b8a080', 'Soft grey-brown fur. Tanners turn it into leather.'],
  ['ferret_pelt', 'Ash Ferret Pelt', 18, '#6a625a', 'Smoky fur from the ash fields. Tanners pay for it.'],
  ['skink_hide', 'Sand Skink Hide', 30, '#d8b070', 'Tough, sandy scales. Tanners turn it into leather.'],
  ['stoat_fur', 'Frost Stoat Fur', 45, '#f0f0f4', 'White winter fur, warm as a hearth.'],
  ['marten_pelt', 'Ember Marten Pelt', 80, '#a8401a', 'Fur the colour of embers, warm to the touch.'],
  ['bright_plume', 'Bright Plume', 35, '#f0a020', 'A long sunbird tail feather. Fletchers and tailors love it.'],
  ['raw_bird', 'Raw Bird', 2, '#e0a090', 'Plucked and ready for the fire.'],
  ['pet_morsel', 'Pet Morsel', 20, '#c87a4a', 'A tasty bite for a pet. Use it while your pet is out: it learns a little.'],
];

export const STOLEN_GOODS = ['silk_cloth', 'spice_pouch', 'silver_trinket'];

export const TRADE_ITEM_SPECS: ItemSpec[] = [
  // --- herblore -----------------------------------------------------------------------------
  ...HERBS.map((h): ItemSpec => ({
    id: `grimy_${h.id}`, name: `Grimy ${h.name}`, kind: 'material', weight: 0.3, value: Math.max(1, Math.round(h.level * 0.8)), tint: '#6a5a3a',
    note: `Herblore ${h.level}: clean it with a pestle and mortar (or from the Herblore window) before brewing.`,
  })),
  ...HERBS.map((h): ItemSpec => ({
    id: h.id, name: h.name, kind: 'material', weight: 0.3, value: Math.max(2, Math.round(h.level * 1.2)), tint: h.color,
    note: `A clean herb. Herblore ${h.brewLevel}: brew it with an empty vial${h.secondary ? ' and one more ingredient' : ''}.`,
  })),
  { id: 'empty_vial', name: 'Empty Vial', kind: 'material', weight: 0.5, value: 1, tint: '#c8e0e8', note: 'A small glass vial for brewing potions. Magic shops sell them.' },
  { id: 'pestle', name: 'Pestle and Mortar', kind: 'tool', tool: 'pestle', weight: 6, value: 12, tint: '#a8a094', note: 'Use it to open the Herblore window: clean herbs and brew potions.' },
  { id: 'vigour_potion', name: 'Draught of Vigour', kind: 'consumable', weight: 2, value: 15, tint: '#e0a030', icon: '♥', note: 'Restores 50 running stamina.' },
  // --- thieving -----------------------------------------------------------------------------
  { id: 'lockpick', name: 'Lockpick', kind: 'tool', tool: 'lockpick', stackable: true, maxStack: 100, weight: 0.4, value: 4, tint: '#9aa0a8', note: 'Picks the lock of a strongbox. Sometimes it snaps.' },
  { id: 'silk_cloth', name: 'Silk Cloth', kind: 'material', weight: 1, value: 40, tint: '#c8507a', note: 'Fine silk from a merchant\'s stall. Traders buy it, no questions asked.' },
  { id: 'spice_pouch', name: 'Pouch of Spices', kind: 'material', weight: 0.5, value: 60, tint: '#c0601a', note: 'Saffron, pepper and cinnamon from the south. Worth a lot to the right buyer.' },
  { id: 'silver_trinket', name: 'Silver Trinket', kind: 'material', weight: 0.5, value: 90, tint: '#d8dce4', note: 'A small silver brooch. Bankers and fences buy it.' },
  { id: 'bread', name: 'Bread', kind: 'consumable', weight: 5, value: 2, heal: 20, tint: '#d8a860', icon: '◆' },
  // --- farming ------------------------------------------------------------------------------
  ...CROPS.map(([id, name, level, heal, value, tint]): ItemSpec => ({ id, name, kind: 'consumable', weight: id === 'watermelon' ? 12 : 3, value, heal, tint, icon: '◆', note: `Grown in an allotment (farming ${level}).` })),
  ...CROPS.map(([id, name, level, , value]): ItemSpec => ({
    id: `${id}_seed`, name: `${name} Seed`, kind: 'material', weight: 0.1, value: Math.max(1, Math.round(value / 2)), tint: '#a08050',
    note: `Farming ${level}: plant it in an allotment patch with a trowel.`,
  })),
  ...HERBS.map((h): ItemSpec => ({
    id: `${h.id}_seed`, name: `${h.name} Seed`, kind: 'material', weight: 0.1, value: Math.max(2, Math.round(h.level * 1.5)), tint: h.color,
    note: `Farming ${h.level}: plant it in a herb patch with a trowel.`,
  })),
  { id: 'trowel', name: 'Gardening Trowel', kind: 'tool', tool: 'trowel', weight: 4, value: 6, tint: '#8a7a5a', note: 'For planting seeds in farm patches.' },
  { id: 'compost', name: 'Bucket of Compost', kind: 'material', weight: 6, value: 4, tint: '#5a4a2a', note: 'Use it on a growing patch: it gives a bigger harvest.' },
  // --- hunter -------------------------------------------------------------------------------
  { id: 'box_trap', name: 'Box Trap', kind: 'tool', tool: 'trap', weight: 8, value: 10, tint: '#8a6a3a', note: 'Set it beside a burrow to catch the creature inside.' },
  { id: 'bird_snare', name: 'Bird Snare', kind: 'tool', tool: 'trap', weight: 2, value: 6, tint: '#c8b080', note: 'Set it in a nesting bush to catch a bird.' },
  ...HUNT_MATERIALS.map(([id, name, value, tint, note]): ItemSpec => ({ id, name, kind: 'material', weight: id === 'raw_bird' ? 6 : 1, value, tint, note })),
  { id: 'roast_bird', name: 'Roast Bird', kind: 'consumable', weight: 6, value: 4, heal: 50, tint: '#c8804a', icon: '▼' },
  // --- sailing ------------------------------------------------------------------------------
  { id: 'skiff_deed', name: 'Rowing Skiff', kind: 'tool', tool: 'boat', weight: 2, value: 200, tint: '#8a6a3a', note: 'Your own little boat (sailing 1). Use a mooring at a dock to board it.' },
  { id: 'sloop_deed', name: 'Coastal Sloop', kind: 'tool', tool: 'boat', weight: 2, value: 3000, tint: '#a8804a', note: 'A one-mast sloop, quicker than a skiff (sailing 30).', rarity: 'uncommon' },
  { id: 'cutter_deed', name: 'Swift Cutter', kind: 'tool', tool: 'boat', weight: 2, value: 15000, tint: '#d0b070', note: 'A fast two-mast cutter (sailing 60).', rarity: 'rare' },
];

import type { Recipe } from './recipes';

/**
 * Fletching: carve logs with a knife into arrow shafts, bows (a short and a
 * long one per kind of log) and crossbow stocks; fix a stock to metal for a
 * crossbow; and put shafts, feathers and smithed arrowheads together into
 * arrows. Wherever a bow, crossbow or arrow of the right strength already
 * existed the recipe makes that item; only the gaps were added.
 */
export const KNIFE = 'knife';
export const FEATHER = 'feather';
export const ARROW_SHAFT = 'arrow_shaft';

/** Logs → shafts per carve, level, xp; and the two bows each log gives. */
export const FLETCH_LOGS: Array<{ log: string; name: string; level: number; shafts: number; xp: number; bows: Array<{ item: string; level: number; logs: number; xp: number }> }> = [
  { log: 'logs', name: 'Logs', level: 1, shafts: 15, xp: 5, bows: [{ item: 'hunting_bow', level: 5, logs: 1, xp: 10 }, { item: 'longbow', level: 10, logs: 2, xp: 20 }] },
  { log: 'pine_logs', name: 'Pine', level: 15, shafts: 20, xp: 10, bows: [{ item: 'pine_shortbow', level: 20, logs: 1, xp: 33 }, { item: 'composite_bow', level: 25, logs: 3, xp: 50 }] },
  { log: 'palm_logs', name: 'Palm', level: 30, shafts: 25, xp: 15, bows: [{ item: 'palm_shortbow', level: 35, logs: 1, xp: 67 }, { item: 'sylvan_bow', level: 40, logs: 3, xp: 83 }] },
  { log: 'teak_logs', name: 'Teak', level: 45, shafts: 30, xp: 20, bows: [{ item: 'teak_shortbow', level: 50, logs: 1, xp: 100 }, { item: 'elven_longbow', level: 55, logs: 3, xp: 117 }] },
];

/** Arrowheads (from the anvil) → arrows, ten at a time. */
export const ARROWS: Array<{ heads: string; arrow: string; level: number; xp: number }> = [
  { heads: 'bronze_arrowheads', arrow: 'arrow', level: 1, xp: 13 },
  { heads: 'iron_arrowheads', arrow: 'onyx_arrow', level: 15, xp: 25 },
  { heads: 'steel_arrowheads', arrow: 'hawkeye_arrow', level: 30, xp: 50 },
  { heads: 'starsteel_arrowheads', arrow: 'starsteel_arrow', level: 50, xp: 75 },
  { heads: 'darkstone_arrowheads', arrow: 'darkstone_arrow', level: 75, xp: 125 },
];

/**
 * Bolts (added with the new trade skills, 2026-10-24): ten at a time. Plain and piercing bolts come from
 * shafts and arrowheads (the anvil still makes them too); rime and infernal bolts are piercing bolts
 * dipped in a crystal shard or a fiery heart.
 */
export const BOLTS: Array<{ bolt: string; level: number; xp: number; inputs: Array<{ id: string; qty: number }>; knife?: boolean }> = [
  { bolt: 'bolt', level: 9, xp: 15, inputs: [{ id: ARROW_SHAFT, qty: 10 }, { id: 'bronze_arrowheads', qty: 10 }] },
  { bolt: 'piercing_bolt', level: 33, xp: 45, inputs: [{ id: ARROW_SHAFT, qty: 10 }, { id: 'steel_arrowheads', qty: 10 }] },
  { bolt: 'frost_bolt', level: 52, xp: 80, inputs: [{ id: 'piercing_bolt', qty: 10 }, { id: 'crystal_shard', qty: 1 }], knife: true },
  { bolt: 'infernal_bolt', level: 64, xp: 100, inputs: [{ id: 'piercing_bolt', qty: 10 }, { id: 'fiery_heart', qty: 1 }], knife: true },
];

/** Throwing weapons (stackable): a log and metal tips make a few at a time. */
export const THROWING: Array<{ item: string; level: number; xp: number; qty: number; inputs: Array<{ id: string; qty: number }> }> = [
  { item: 'spear', level: 6, xp: 14, qty: 3, inputs: [{ id: 'logs', qty: 1 }, { id: 'iron_arrowheads', qty: 3 }] },
  { item: 'royal_spear', level: 24, xp: 40, qty: 3, inputs: [{ id: 'pine_logs', qty: 1 }, { id: 'steel_arrowheads', qty: 3 }] },
  { item: 'royal_javelin', level: 42, xp: 70, qty: 5, inputs: [{ id: 'palm_logs', qty: 1 }, { id: 'steel_arrowheads', qty: 5 }, { id: FEATHER, qty: 5 }] },
];

export const FLETCHING_RECIPES: Recipe[] = [
  ...FLETCH_LOGS.flatMap((l): Recipe[] => [
    { id: `fletch:shafts:${l.log}`, skill: 'fletching', station: 'knife', group: 'Shafts', level: l.level, xp: l.xp, inputs: [{ id: l.log, qty: 1 }], output: { id: ARROW_SHAFT, qty: l.shafts }, tool: KNIFE },
    ...l.bows.map((b): Recipe => ({
      id: `fletch:${b.item}`, skill: 'fletching', station: 'knife', group: 'Bows', level: b.level, xp: b.xp, inputs: [{ id: l.log, qty: b.logs }], output: { id: b.item, qty: 1 }, tool: KNIFE,
    })),
  ]),
  { id: 'fletch:wooden_stock', skill: 'fletching', station: 'knife', group: 'Crossbows', level: 8, xp: 12, inputs: [{ id: 'logs', qty: 2 }], output: { id: 'wooden_stock', qty: 1 }, tool: KNIFE },
  { id: 'fletch:light_crossbow', skill: 'fletching', station: 'knife', group: 'Crossbows', level: 12, xp: 25, inputs: [{ id: 'wooden_stock', qty: 1 }, { id: 'iron_bar', qty: 1 }], output: { id: 'light_crossbow', qty: 1 }, tool: KNIFE },
  { id: 'fletch:teak_stock', skill: 'fletching', station: 'knife', group: 'Crossbows', level: 46, xp: 60, inputs: [{ id: 'teak_logs', qty: 2 }], output: { id: 'teak_stock', qty: 1 }, tool: KNIFE },
  { id: 'fletch:heavy_crossbow', skill: 'fletching', station: 'knife', group: 'Crossbows', level: 48, xp: 90, inputs: [{ id: 'teak_stock', qty: 1 }, { id: 'steel_bar', qty: 2 }], output: { id: 'heavy_crossbow', qty: 1 }, tool: KNIFE },
  ...ARROWS.map((a): Recipe => ({
    id: `fletch:${a.arrow}`, skill: 'fletching', station: 'knife', group: 'Arrows', level: a.level, xp: a.xp,
    inputs: [{ id: ARROW_SHAFT, qty: 10 }, { id: FEATHER, qty: 10 }, { id: a.heads, qty: 10 }], output: { id: a.arrow, qty: 10 },
  })),
  // bolts for crossbows (short shafts, no feathers): plain and piercing from arrowheads, then elemental tips
  ...BOLTS.map((b): Recipe => ({
    id: `fletch:${b.bolt}`, skill: 'fletching', station: 'knife', group: 'Bolts', level: b.level, xp: b.xp,
    inputs: b.inputs, output: { id: b.bolt, qty: 10 }, ...(b.knife ? { tool: KNIFE } : {}),
  })),
  // throwing weapons for paladins: spears and javelins carved from logs and tipped with metal
  ...THROWING.map((t): Recipe => ({
    id: `fletch:${t.item}`, skill: 'fletching', station: 'knife', group: 'Throwing', level: t.level, xp: t.xp,
    inputs: t.inputs, output: { id: t.item, qty: t.qty }, tool: KNIFE,
  })),
];

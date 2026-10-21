import type { Recipe } from './recipes';

/**
 * Firemaking: use a tinderbox, pick the logs, and a campfire flares up on the
 * tile you stand on (open ground only, never in a protection zone); you step
 * aside and can light the next one ("Make X" lays a line of fires). A lit
 * campfire is a cooking station until it burns out. Fires are not saved.
 */
export const TINDERBOX = 'tinderbox';

export const FIRE_LOGS: Array<{ log: string; name: string; level: number; xp: number; burns: [number, number] }> = [
  { log: 'logs', name: 'Logs', level: 1, xp: 40, burns: [60, 80] },
  { log: 'pine_logs', name: 'Pine logs', level: 15, xp: 60, burns: [70, 90] },
  { log: 'palm_logs', name: 'Palm logs', level: 30, xp: 90, burns: [80, 105] },
  { log: 'teak_logs', name: 'Teak logs', level: 45, xp: 135, burns: [90, 120] },
];

export const FIREMAKING_RECIPES: Recipe[] = FIRE_LOGS.map((l): Recipe => ({
  id: `fire:${l.log}`, skill: 'firemaking', station: 'tinderbox', group: 'Logs', level: l.level, xp: l.xp,
  inputs: [{ id: l.log, qty: 1 }], output: { id: l.log, qty: 1 }, tool: TINDERBOX, fire: l.burns, label: `Light ${l.name.toLowerCase()}`,
}));

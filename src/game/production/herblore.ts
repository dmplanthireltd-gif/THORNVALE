import type { Recipe } from './recipes';
import { EMPTY_VIAL, HERBS, PESTLE } from '../trades/herblore';

/**
 * Herblore recipes for the pestle and mortar (a hand-tool station, like the
 * knife): clean grimy herbs (no tool needed), then brew a clean herb with an
 * empty vial — and an extra ingredient for the stronger brews — into a potion.
 */
export const HERBLORE_RECIPES: Recipe[] = [
  ...HERBS.map((h): Recipe => ({
    id: `herb:clean:${h.id}`, skill: 'herblore', station: 'pestle', group: 'Clean', level: h.level, xp: h.cleanXp,
    inputs: [{ id: `grimy_${h.id}`, qty: 1 }], output: { id: h.id, qty: 1 },
  })),
  ...HERBS.map((h): Recipe => ({
    id: `herb:brew:${h.potion}`, skill: 'herblore', station: 'pestle', group: 'Brew', level: h.brewLevel, xp: h.brewXp,
    inputs: [{ id: h.id, qty: 1 }, { id: EMPTY_VIAL, qty: 1 }, ...(h.secondary ? [{ id: h.secondary, qty: 1 }] : [])],
    output: { id: h.potion, qty: 1 }, tool: PESTLE,
  })),
];

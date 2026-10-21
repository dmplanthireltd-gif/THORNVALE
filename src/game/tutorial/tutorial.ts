import { Inventory } from '../inventory/Inventory';
import type { ItemStack } from '../inventory/items';
import type { Vocation } from '../player/vocations';
import {
  ISLE_CAPTAIN, ISLE_CELLAR_HOLE, ISLE_CHEST, ISLE_GUIDE, ISLE_MEADOW, ISLE_ROPE_SPOT, ISLE_SHORE, ISLE_TRADER,
} from '../world/tutorialIsle';

/**
 * The tutorial: twelve short steps on Wayfarer's Isle, each taught by doing it.
 * Pure data and helpers; Game.ts checks the steps and hands out the rewards.
 *
 *   active   on the island, working through the steps
 *   done     finished the island (counts towards the account's "may skip" flag)
 *   skipped  started straight in Thornvale (the account had finished it before)
 *
 * Saved as `tutorial` (save v9+). Characters from before the tutorial count as done.
 */
export type TutorialStatus = 'active' | 'done' | 'skipped';

export interface TutorialState {
  state: TutorialStatus;
  /** Current step, 1-based (TUTORIAL_STEPS.length once finished). */
  step: number;
  /** Parts of the current step already done (bits, step-specific). */
  flags: number;
  /** Counter for the current step (rats slain). */
  count: number;
  /** This account may skip the island (set by the server or the browser; not saved). */
  canSkip: boolean;
}

export type TutorialTarget = { npc: string } | { x: number; y: number; z: number };

export interface TutorialStep {
  id: 'walk' | 'talk' | 'chest' | 'gear' | 'rats' | 'loot' | 'spell' | 'cellar' | 'shop' | 'depot' | 'gather' | 'sail';
  title: string;
  /** The objective line (HUD). */
  hint: string;
  /** What the guide says about this step when asked. */
  guide: string;
  /** Where the objective arrow points (null = no arrow). */
  target: TutorialTarget | null;
  /** How many of something (rats). */
  need?: number;
  /** May be left out: the captain sails anyway. */
  optional?: boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'walk', title: 'Find your feet', target: { npc: ISLE_GUIDE },
    hint: 'Walk to Guide Maren beside the shrine. Use WASD or the arrow keys, or click the ground.',
    guide: 'Come closer, I do not bite.',
  },
  {
    id: 'talk', title: 'Speak to the guide', target: { npc: ISLE_GUIDE },
    hint: 'Click Guide Maren to talk to her.',
    guide: 'Good. Whenever you are unsure what to do next, ask me.',
  },
  {
    id: 'chest', title: 'Open the supply chest', target: { x: ISLE_CHEST.x, y: ISLE_CHEST.y, z: ISLE_CHEST.z },
    hint: 'Click the chest beside the shrine to take your gear.',
    guide: 'The chest by the shrine holds a weapon and armour for you. Click it.',
  },
  {
    id: 'gear', title: 'Gear up', target: null,
    hint: 'Click your weapon and armour in the backpack to put them on (or drag them onto the equipment slots).',
    guide: 'Gear in a backpack protects nobody. Put your weapon and armour on.',
  },
  {
    id: 'rats', title: 'First blood', target: { x: ISLE_MEADOW.x, y: ISLE_MEADOW.y, z: ISLE_MEADOW.z }, need: 3,
    hint: 'Go south-west to the meadow and slay 3 rats. Click a rat to attack, or press Tab to pick the next one.',
    guide: 'The meadow to the south-west is full of rats. Slay three of them. Click one to attack it.',
  },
  {
    id: 'loot', title: 'Loot and eat', target: null,
    hint: 'Walk onto a rat\'s loot bag (or click it) to pick it up, then click food in your backpack to eat it.',
    guide: 'Monsters leave loot behind. Walk onto it to pick it up. And eat when you are hurt: food heals.',
  },
  {
    id: 'spell', title: 'Words of power', target: null,
    hint: 'Press Enter, type exura and press Enter again to cast your first spell. Open Spells to put it on a hotkey (F1–F12).',
    guide: 'Every adventurer knows exura, a little healing spell. Press Enter, say the word, press Enter. It costs mana.',
  },
  {
    id: 'cellar', title: 'Into the cellar', target: { x: ISLE_CELLAR_HOLE.x, y: ISLE_CELLAR_HOLE.y, z: ISLE_CELLAR_HOLE.z },
    hint: 'Drop into the hole in the meadow, explore the old cellar, then click the rope spot to climb out with your rope.',
    guide: 'There is an old cellar under the meadow. Take this rope: without one you cannot climb out of a rope spot.',
  },
  {
    id: 'shop', title: 'Trade', target: { npc: ISLE_TRADER },
    hint: 'Visit Tobin in the trading post. Sell your loot ("Let us trade"), then buy a health potion.',
    guide: 'Tobin in the trading post buys loot and sells potions. Sell what you found and buy yourself a health potion.',
  },
  {
    id: 'depot', title: 'Store and bank', target: { npc: ISLE_TRADER },
    hint: 'Open a locker in the trading post and put an item into your depot, then ask Tobin to bank your gold.',
    guide: 'Your depot follows you to every locker in the world, and your bank account to every banker. Try both.',
  },
  {
    id: 'gather', title: 'Living off the land', target: { x: ISLE_SHORE.x, y: ISLE_SHORE.y, z: ISLE_SHORE.z }, optional: true,
    hint: 'Optional: click open water near the shore to fish with your rod. Or go straight to Captain Wren at the jetty.',
    guide: 'Here is a fishing rod. Click water close to you to cast. Fishing, woodcutting and mining are skills of their own.',
  },
  {
    id: 'sail', title: 'Set sail', target: { npc: ISLE_CAPTAIN },
    hint: 'Captain Wren waits at the jetty in the south-east. Ask her to take you to Thornvale.',
    guide: 'You are ready. Captain Wren sails from the jetty to Thornvale. Good luck out there.',
  },
];

export const TUTORIAL_LAST = TUTORIAL_STEPS.length;

/** Step number (1-based) of a step id. */
export function stepNo(id: TutorialStep['id']): number {
  return TUTORIAL_STEPS.findIndex((s) => s.id === id) + 1;
}

export function tutorialStep(n: number): TutorialStep | null {
  return TUTORIAL_STEPS[n - 1] ?? null;
}

/** Where the objective arrow points right now (the cellar step switches to the rope spot once you are down). */
export function stepTarget(t: TutorialState): TutorialTarget | null {
  if (t.state !== 'active') return null;
  const st = tutorialStep(t.step);
  if (!st) return null;
  if (st.id === 'cellar' && t.flags & 1) return { x: ISLE_ROPE_SPOT.x, y: ISLE_ROPE_SPOT.y, z: ISLE_ROPE_SPOT.z };
  return st.target;
}

export function newTutorial(): TutorialState {
  return { state: 'active', step: 1, flags: 0, count: 0, canSkip: false };
}

/** Characters from before the tutorial, bots and mirror copies: nothing to do. */
export function finishedTutorial(state: 'done' | 'skipped' = 'done'): TutorialState {
  return { state, step: TUTORIAL_LAST, flags: 0, count: 0, canSkip: false };
}

/** Reads the saved block; anything missing or broken counts as finished (never traps a character on the island). */
export function parseTutorial(raw: unknown): TutorialState {
  const t = (raw ?? {}) as Partial<TutorialState>;
  if (t.state !== 'active' && t.state !== 'skipped') return finishedTutorial('done');
  if (t.state === 'skipped') return finishedTutorial('skipped');
  const step = Math.max(1, Math.min(TUTORIAL_LAST, Math.floor(Number(t.step)) || 1));
  return { state: 'active', step, flags: Math.max(0, Math.floor(Number(t.flags)) || 0), count: Math.max(0, Math.floor(Number(t.count)) || 0), canSkip: false };
}

/** What goes into the save. */
export function saveTutorial(t: TutorialState): { state: TutorialStatus; step: number; flags?: number; count?: number } {
  return t.state === 'active' ? { state: t.state, step: t.step, flags: t.flags, count: t.count } : { state: t.state, step: TUTORIAL_LAST };
}

/** What a new character carries before opening the supply chest. */
export const TUTORIAL_START_ITEMS: ItemStack[] = [{ id: 'cheese', qty: 2 }];

/**
 * The supply chest: exactly the usual starter kit of the vocation (weapon, shield or
 * book, ammunition, leather armour, potions, gold), minus the bag the character
 * already wears. `kit` is Game's giveStarterKit, passed in to keep one source of truth.
 */
export function tutorialChestItems(voc: Vocation, kit: (inv: Inventory, voc: Vocation) => void): ItemStack[] {
  const inv = new Inventory();
  kit(inv, voc);
  const out: ItemStack[] = [];
  for (const [slot, st] of Object.entries(inv.equipment)) if (st && slot !== 'backpack') out.push({ ...st });
  for (const st of inv.slots) if (st) out.push({ ...st });
  return out;
}

/** Rewards handed out along the way: when a step is reached (`start`) or finished (`done`). */
export const STEP_GIFTS: Partial<Record<TutorialStep['id'], { start?: ItemStack[]; done?: ItemStack[] }>> = {
  loot: { done: [{ id: 'gold', qty: 25 }] },
  spell: { done: [{ id: 'mana_potion', qty: 1 }] },
  cellar: { start: [{ id: 'rope', qty: 1 }] },
  gather: { start: [{ id: 'fishing_rod', qty: 1 }] },
};

/**
 * What skipping hands out, so a skipper ends up with what a graduate walks off the
 * island with: every gift of the steps not reached yet (and the chest, if it was never
 * opened), plus the health potion graduates buy and the food they start with.
 * `fromStep` = the step the character is on (1 for a brand-new character); `fresh` = skipping at creation.
 */
export function skipGifts(fromStep: number, chestOpened: boolean, chest: ItemStack[], fresh = false): ItemStack[] {
  const out: ItemStack[] = [];
  if (!chestOpened) out.push(...chest.map((i) => ({ ...i })));
  TUTORIAL_STEPS.forEach((st, i) => {
    const n = i + 1;
    const g = STEP_GIFTS[st.id];
    if (!g) return;
    if (g.start && n > fromStep) out.push(...g.start.map((x) => ({ ...x })));
    if (g.done && n >= fromStep) out.push(...g.done.map((x) => ({ ...x })));
  });
  if (fromStep <= stepNo('shop')) out.push({ id: 'health_potion', qty: 1 });
  // a character skipping at creation never got the food the island starts you with
  if (fresh) out.push(...TUTORIAL_START_ITEMS.map((x) => ({ ...x })));
  return out;
}

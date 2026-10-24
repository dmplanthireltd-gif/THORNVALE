import type { NpcDef } from '../npc/npcs';
import type { OutfitType } from '../player/outfits';

/**
 * The task boards: one keeper per town who hands out the daily and weekly tasks,
 * runs the seal shop and, while a festival is on, trades its tokens. They stand
 * near the town centre (world/taskBoards.ts places them after the whole world is
 * built, so no other NPC or monster id moves). npcs.ts merges them into NPCS.
 * Keys are stable forever: `taskboard_<town key>`.
 */

/** [town key, keeper's name, outfit type, head, body, legs] */
const KEEPERS: Array<[string, string, OutfitType, number, number, number]> = [
  ['thornvale', 'Wenna Tallyhand', 'citizen', 78, 58, 76],
  ['westmarch', 'Osric Fairlow', 'knight', 45, 21, 79],
  ['elderglen', 'Ysmay Fernwhit', 'ranger', 22, 64, 63],
  ['stonedeep', 'Durgan Slatemark', 'barbarian', 61, 62, 79],
  ['highmoor', 'Corla Heathby', 'citizen', 94, 101, 81],
  ['millbrook', 'Tobin Sheaf', 'citizen', 58, 57, 76],
  ['valdrheim', 'Hilde Rimeward', 'barbarian', 0, 86, 88],
  ['aurelion', 'Cassian Vell', 'noble', 78, 107, 31],
  ['briarwatch', 'Maud Thistlecroft', 'ranger', 58, 46, 108],
  ['corvane', 'Pell Ravensby', 'citizen', 0, 114, 114],
  ['saltmere', 'Nessa Brine', 'citizen', 17, 86, 88],
  ['palmreach', 'Iko Fronde', 'ranger', 94, 64, 57],
  ['sunspire', 'Samira Dunecall', 'mystic', 78, 79, 76],
  ['dunewatch', 'Rashid Sandmere', 'warden', 58, 79, 101],
];

/** What a keeper says when asked how the board works. */
export const BOARD_HELP = 'Three notices a day and two a week, chosen for you: a hunt, a trade to practise, goods to bring or a place to see. Finish one, then come to any task board for your reward. One daily notice may be swapped each day. Come every day and the rewards grow. Seals buy potions, runes and capes in my shop.';

export const TASKBOARD_PREFIX = 'taskboard_';
export const taskboardKey = (town: string) => `${TASKBOARD_PREFIX}${town}`;

export interface BoardNpc {
  town: string;
  def: NpcDef;
}

export const TASKBOARD_NPCS: BoardNpc[] = KEEPERS.map(([town, name, type, head, body, legs]) => ({
  town,
  def: {
    key: taskboardKey(town), name, role: 'Task board', prop: 'ledger', tasks: true,
    look: { type, head, body, legs, feet: 98 },
    greeting: 'The board is full of notices today, {name}. Every one pays in coin and seals.',
  },
}));

/** Adds the task-board keepers to NPCS. */
export function applyLiveNpcs(npcs: Record<string, NpcDef>): void {
  for (const n of TASKBOARD_NPCS) if (!npcs[n.def.key]) npcs[n.def.key] = { ...n.def };
}

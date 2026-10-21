import { Obj } from '../world/WorldMap';

/**
 * Woodcutting, a gathering skill in the RuneScape style: levels 1–99 on the
 * classic experience curve (13 million experience for 99). Use a tree while
 * carrying an axe and you keep chopping on a timer until a log comes loose;
 * some trees fall after one log, others after a few, and grow back later.
 */
export const WC_MAX_LEVEL = 99;
/** Seconds between two chops. */
export const CHOP_INTERVAL = 2;

/** XP_TABLE[L] = total experience needed for level L (index 0 unused). */
const XP_TABLE: number[] = (() => {
  const t = [0, 0];
  let points = 0;
  for (let l = 1; l < WC_MAX_LEVEL; l++) {
    points += Math.floor(l + 300 * 2 ** (l / 7));
    t.push(Math.floor(points / 4));
  }
  return t;
})();

export function gatherXpForLevel(level: number): number {
  return XP_TABLE[Math.max(1, Math.min(WC_MAX_LEVEL, Math.floor(level)))];
}

export function gatherLevelForXp(xp: number): number {
  let l = 1;
  while (l < WC_MAX_LEVEL && xp >= XP_TABLE[l + 1]) l++;
  return l;
}

/** Progress from the current level to the next, 0–1 (1 at level 99). */
export function gatherProgress(xp: number): number {
  const l = gatherLevelForXp(xp);
  if (l >= WC_MAX_LEVEL) return 1;
  const a = XP_TABLE[l], b = XP_TABLE[l + 1];
  return Math.max(0, Math.min(1, (xp - a) / (b - a)));
}

export interface TreeDef {
  obj: Obj;
  name: string;
  /** Woodcutting level needed. */
  level: number;
  /** Item id of the log it gives. */
  log: string;
  xp: number;
  /** Base chance per chop at the required level with a plain hatchet. */
  chance: number;
  /** Chance the tree falls after giving a log (1 = always). */
  fall: number;
  /** Seconds until a stump grows back (min, max). */
  regrow: [number, number];
}

export const TREES: Partial<Record<Obj, TreeDef>> = {
  [Obj.Tree]: { obj: Obj.Tree, name: 'tree', level: 1, log: 'logs', xp: 25, chance: 0.4, fall: 1, regrow: [25, 45] },
  [Obj.Pine]: { obj: Obj.Pine, name: 'pine', level: 15, log: 'pine_logs', xp: 45, chance: 0.32, fall: 0.25, regrow: [40, 70] },
  [Obj.Palm]: { obj: Obj.Palm, name: 'palm tree', level: 25, log: 'palm_logs', xp: 70, chance: 0.28, fall: 0.2, regrow: [50, 90] },
  [Obj.JungleTree]: { obj: Obj.JungleTree, name: 'teak tree', level: 35, log: 'teak_logs', xp: 90, chance: 0.25, fall: 1 / 6, regrow: [70, 120] },
};

export function treeAt(o: Obj): TreeDef | null {
  return TREES[o] ?? null;
}

/**
 * Chance one chop gives a log: better with every level above the tree's
 * requirement and with a stronger axe (axe attack above the hatchet's 12).
 */
export function chopChance(wcLevel: number, tree: TreeDef, axeAttack: number): number {
  const c = tree.chance + (wcLevel - tree.level) * 0.008 + Math.max(0, axeAttack - 12) * 0.006;
  return Math.max(0.05, Math.min(0.9, c));
}

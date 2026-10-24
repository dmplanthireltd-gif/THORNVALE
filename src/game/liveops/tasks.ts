import type { NonCombatSkill } from '../gathering/skills';
import { gatherXpForLevel } from '../gathering/woodcutting';
import { expForLevel } from '../player/Player';
import type { EnemyKind } from '../world/WorldMap';

/**
 * Daily and weekly tasks (pure rules: no DOM, no three.js). A task board in every
 * major town (liveops/liveNpcs.ts) hands each character 3 daily and 2 weekly tasks
 * scaled to their level and skills: slay a fitting monster, train a trade skill
 * (gathering, production and the adventure skills alike), bring the board some
 * goods, or explore a place. Finished tasks pay experience, gold and task seals;
 * seals buy cosmetics and consumables at the seal shop (never anything with stats).
 *
 * The board resets every day at RESET_HOUR_UTC (UTC) and every Monday at the same
 * hour; one daily task may be rerolled per day; a login streak raises the rewards.
 * The running state lives in liveops/TaskSystem.ts and is saved per character
 * (save v18 `tasks`). Ids of seal-shop items are item ids (stable forever).
 */

/** Daily tasks reset at this hour, UTC, every day; weekly tasks on Mondays at the same hour. */
export const RESET_HOUR_UTC = 6;
export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** 1970-01-05 was a Monday: task day 4 starts the first task week. */
const FIRST_MONDAY = 4;
export const DAILY_TASKS = 3;
export const WEEKLY_TASKS = 2;
/** The most seals a character can hold (a sanity cap, far above any price). */
export const SEALS_MAX = 100_000;
/** Login streak: +5% task experience and gold per day in a row after the first, up to +30%. */
export const STREAK_STEP = 0.05;
export const STREAK_MAX_BONUS = 0.3;

export type TaskKind = 'hunt' | 'skill' | 'deliver' | 'explore';

/** One task on a character's board (compact: it is saved and sent to the own client). */
export interface TaskInst {
  /** What kind of task. */
  k: TaskKind;
  /** Target: monster kind (hunt), skill id (skill), item id (deliver), region name (explore). */
  t: string;
  /** How many are needed (kills, experience points, items, 1 visit). */
  n: number;
  /** How many so far. */
  h: number;
  /** Reward claimed. */
  c: boolean;
  /** Base rewards (the login streak adds to experience and gold when claimed). */
  x: number;
  g: number;
  s: number;
}

export interface TaskState {
  /** Task day (taskDay) the daily tasks belong to; -1 = none yet. */
  day: number;
  /** Task week (taskWeek) the weekly tasks belong to; -1 = none yet. */
  week: number;
  daily: TaskInst[];
  weekly: TaskInst[];
  /** Task day of the last reroll (one per day). */
  rr: number;
  /** Task seals: the board's tokens (also from raids, treasure caches and the festivals). */
  seals: number;
  /** Days in a row with a login, and the best run so far. */
  streak: number;
  best: number;
  /** Task day of the last login (for the streak). */
  last: number;
  /** Tasks finished and claimed, ever. */
  done: number;
}

export function emptyTaskState(): TaskState {
  return { day: -1, week: -1, daily: [], weekly: [], rr: -1, seals: 0, streak: 0, best: 0, last: -1, done: 0 };
}

/** The task day of a wall-clock time (days start at RESET_HOUR_UTC). */
export function taskDay(now: number): number {
  return Math.floor((now - RESET_HOUR_UTC * HOUR_MS) / DAY_MS);
}

/** The task week (weeks start on Monday at RESET_HOUR_UTC). */
export function taskWeek(now: number): number {
  return Math.floor((taskDay(now) - FIRST_MONDAY) / 7);
}

/** Wall clock of the next daily reset. */
export function nextDailyReset(now: number): number {
  return (taskDay(now) + 1) * DAY_MS + RESET_HOUR_UTC * HOUR_MS;
}

/** Wall clock of the next weekly reset (Monday). */
export function nextWeeklyReset(now: number): number {
  return ((taskWeek(now) + 1) * 7 + FIRST_MONDAY) * DAY_MS + RESET_HOUR_UTC * HOUR_MS;
}

/** Extra share of task experience and gold for a login streak of `streak` days. */
export function streakBonus(streak: number): number {
  return Math.min(STREAK_MAX_BONUS, Math.max(0, streak - 1) * STREAK_STEP);
}

/** Seals given for the first login of a day. */
export function loginSeals(streak: number): number {
  return streak >= 7 ? 3 : streak >= 3 ? 2 : 1;
}

/** Experience from one level to the next. */
function levelSpan(level: number): number {
  return Math.max(100, expForLevel(level + 1) - expForLevel(level));
}

/**
 * Base rewards of a task for a character of `level` (the streak bonus is added on claiming).
 * Daily: 2.5% of a level, weekly 10%; gold grows with the level; seals are fixed.
 */
export function taskRewards(level: number, weekly: boolean): { x: number; g: number; s: number } {
  const L = Math.max(1, Math.min(2000, Math.floor(level)));
  const x = Math.round(levelSpan(L) * (weekly ? 0.1 : 0.025));
  const g = Math.round((50 + 10 * L) * (weekly ? 5 : 1));
  return { x, g, s: weekly ? 8 : 2 };
}

// ------------------------------------------------------------------ what can be asked

export interface HuntOption {
  kind: EnemyKind;
  exp: number;
  hp: number;
  /** Spawns somewhere on free (not premium) land. */
  free: boolean;
  /** Materials it drops often enough to ask for: [item id, chance]. */
  drops: Array<[string, number]>;
}

export interface ExploreOption {
  name: string;
  /** Lowest recommended level (from the region's level text). */
  level: number;
  free: boolean;
}

/** Goods the board asks for, by the skill and level that gets them: [item id, skill, level, daily amount]. */
export const DELIVERIES: Array<[string, NonCombatSkill, number, number]> = [
  ['logs', 'woodcutting', 1, 20], ['pine_logs', 'woodcutting', 15, 15], ['palm_logs', 'woodcutting', 25, 12], ['teak_logs', 'woodcutting', 35, 10],
  ['raw_fish', 'fishing', 1, 15], ['raw_trout', 'fishing', 10, 12], ['raw_pike', 'fishing', 20, 10], ['raw_salmon', 'fishing', 30, 10], ['raw_ice_fish', 'fishing', 40, 8], ['raw_swordfish', 'fishing', 50, 6],
  ['copper_ore', 'mining', 1, 15], ['tin_ore', 'mining', 1, 15], ['iron_ore', 'mining', 15, 12], ['coal', 'mining', 30, 12], ['silver_ore', 'mining', 40, 8], ['gold_ore', 'mining', 50, 6],
  ['potato', 'farming', 1, 12], ['onion', 'farming', 5, 10], ['cabbage', 'farming', 10, 10], ['tomato', 'farming', 20, 8], ['sweetcorn', 'farming', 30, 8],
  ['grimy_marshwort', 'herblore', 1, 8], ['grimy_mooncress', 'herblore', 6, 8], ['grimy_hearthroot', 'herblore', 14, 6], ['grimy_bloodthistle', 'herblore', 22, 5],
  ['hare_pelt', 'hunter', 1, 6],
];

/**
 * Skills a daily "train" task may ask for. Slayer and sailing need a task or a boat first,
 * so they are only asked of characters who have started them (level 2 or more).
 */
export const TASK_SKILLS: NonCombatSkill[] = [
  'woodcutting', 'fishing', 'mining', 'smithing', 'fletching', 'crafting', 'cooking', 'firemaking',
  'agility', 'herblore', 'thieving', 'farming', 'hunter', 'slayer', 'sailing',
];
const NEEDS_START: NonCombatSkill[] = ['slayer', 'sailing'];

export interface TaskCtx {
  level: number;
  /** Premium land is open to this character (or premium is not enforced). */
  premium: boolean;
  skill: (id: NonCombatSkill) => number;
  hunts: HuntOption[];
  regions: ExploreOption[];
  /** Item ids that exist (deliveries of unknown items are never asked). */
  isItem: (id: string) => boolean;
  rng: () => number;
}

/** The monster experience that suits a level (the balance ladder: about 0.7 × level^1.5). */
export function huntTargetExp(level: number): number {
  return 0.7 * Math.pow(Math.max(1, level), 1.5);
}

/** Kills asked of a daily hunt (weekly: five times as many). */
export function huntCount(hp: number): number {
  return hp <= 60 ? 25 : hp <= 200 ? 20 : hp <= 600 ? 15 : hp <= 1500 ? 12 : hp <= 4000 ? 8 : hp <= 10000 ? 6 : 4;
}

/** Experience asked of a daily skill task: about 60% of the way to the next level (weekly: three levels' worth). */
export function skillTaskXp(level: number, weekly: boolean): number {
  const L = Math.max(1, Math.min(98, level));
  const span = gatherXpForLevel(L + 1) - gatherXpForLevel(L);
  return Math.max(weekly ? 300 : 80, Math.round(span * (weekly ? 3 : 0.6)));
}

const pick = <T>(list: T[], rng: () => number): T | null => (list.length ? list[Math.floor(rng() * list.length) % list.length] : null);

function huntsFor(ctx: TaskCtx, tougher: boolean): HuntOption[] {
  const want = huntTargetExp(ctx.level) * (tougher ? 1.6 : 1);
  const ok = ctx.hunts.filter((h) => ctx.premium || h.free);
  // the six closest to the target experience (on a log scale), so the board varies from day to day
  return [...ok].sort((a, b) => Math.abs(Math.log(a.exp / want)) - Math.abs(Math.log(b.exp / want))).slice(0, 6);
}

function huntTask(ctx: TaskCtx, weekly: boolean, avoid: Set<string>): TaskInst | null {
  const list = huntsFor(ctx, weekly).filter((h) => !avoid.has(`hunt:${h.kind}`));
  const h = pick(list, ctx.rng);
  if (!h) return null;
  return { k: 'hunt', t: h.kind, n: huntCount(h.hp) * (weekly ? 5 : 1), h: 0, c: false, ...taskRewards(ctx.level, weekly) };
}

function skillTask(ctx: TaskCtx, weekly: boolean, avoid: Set<string>): TaskInst | null {
  const open = TASK_SKILLS.filter((id) => !avoid.has(`skill:${id}`) && (!NEEDS_START.includes(id) || ctx.skill(id) >= 2));
  // trained skills are asked more often than untouched ones (but anything may come up)
  const weighted: NonCombatSkill[] = [];
  for (const id of open) {
    const lvl = ctx.skill(id);
    const w = lvl >= 20 ? 4 : lvl >= 5 ? 3 : 1;
    for (let i = 0; i < w; i++) weighted.push(id);
  }
  const id = pick(weighted, ctx.rng);
  if (!id) return null;
  return { k: 'skill', t: id, n: skillTaskXp(ctx.skill(id), weekly), h: 0, c: false, ...taskRewards(ctx.level, weekly) };
}

function deliverTask(ctx: TaskCtx, weekly: boolean, avoid: Set<string>): TaskInst | null {
  const opts: Array<[string, number]> = [];
  for (const [id, sk, lvl, qty] of DELIVERIES) {
    if (!ctx.isItem(id) || avoid.has(`deliver:${id}`) || ctx.skill(sk) < lvl) continue;
    // the best goods within reach: within 25 levels of the character's skill
    if (ctx.skill(sk) - lvl > 25 && DELIVERIES.some(([, s2, l2]) => s2 === sk && l2 > lvl && l2 <= ctx.skill(sk))) continue;
    opts.push([id, qty]);
  }
  // monster materials of a fitting hunt (a wolf's pelt, an orc's tooth…)
  for (const h of huntsFor(ctx, false)) {
    for (const [id, chance] of h.drops) {
      if (!ctx.isItem(id) || avoid.has(`deliver:${id}`) || opts.some(([o]) => o === id)) continue;
      opts.push([id, Math.max(3, Math.min(15, Math.round(2.5 / chance)))]);
    }
  }
  const o = pick(opts, ctx.rng);
  if (!o) return null;
  return { k: 'deliver', t: o[0], n: o[1] * (weekly ? 4 : 1), h: 0, c: false, ...taskRewards(ctx.level, weekly) };
}

function exploreTask(ctx: TaskCtx, avoid: Set<string>): TaskInst | null {
  const L = ctx.level;
  const ok = ctx.regions.filter((r) => (ctx.premium || r.free) && r.level <= L && r.level >= L - 60 && !avoid.has(`explore:${r.name}`));
  const r = pick(ok.length ? ok : ctx.regions.filter((x) => (ctx.premium || x.free) && x.level <= Math.max(10, L) && !avoid.has(`explore:${x.name}`)), ctx.rng);
  if (!r) return null;
  return { k: 'explore', t: r.name, n: 1, h: 0, c: false, ...taskRewards(ctx.level, false) };
}

const keyOf = (t: TaskInst) => `${t.k}:${t.t}`;

/** A fresh task for a slot of this kind, different from the ones in `others`. */
export function makeTask(ctx: TaskCtx, kind: TaskKind, weekly: boolean, others: TaskInst[]): TaskInst | null {
  const avoid = new Set(others.map(keyOf));
  switch (kind) {
    case 'hunt': return huntTask(ctx, weekly, avoid);
    case 'skill': return skillTask(ctx, weekly, avoid);
    case 'deliver': return deliverTask(ctx, weekly, avoid);
    case 'explore': return exploreTask(ctx, avoid);
  }
}

/** Three daily tasks: a hunt, a skill, and a delivery or a journey. */
export function dailyTasks(ctx: TaskCtx): TaskInst[] {
  const out: TaskInst[] = [];
  const third: TaskKind = ctx.rng() < 0.5 ? 'deliver' : 'explore';
  for (const k of ['hunt', 'skill', third, third === 'deliver' ? 'explore' : 'deliver', 'skill'] as TaskKind[]) {
    if (out.length >= DAILY_TASKS) break;
    const t = makeTask(ctx, k, false, out);
    if (t) out.push(t);
  }
  return out;
}

/** Two weekly tasks: a long hunt, and a skill or a large delivery. */
export function weeklyTasks(ctx: TaskCtx): TaskInst[] {
  const out: TaskInst[] = [];
  const second: TaskKind = ctx.rng() < 0.5 ? 'skill' : 'deliver';
  for (const k of ['hunt', second, second === 'skill' ? 'deliver' : 'skill'] as TaskKind[]) {
    if (out.length >= WEEKLY_TASKS) break;
    const t = makeTask(ctx, k, true, out);
    if (t) out.push(t);
  }
  return out;
}

export function taskDone(t: TaskInst): boolean {
  return t.h >= t.n;
}

// ------------------------------------------------------------------ seal shop

export interface ShopEntry {
  /** Item id, or 'seals' for task seals (festival trades). */
  id: string;
  qty: number;
  price: number;
}

/**
 * The seal shop at every task board: consumables and two capes that only look nice
 * (no stats). Prices keep a seal worth far less than an hour of hunting, so seals
 * never become a gold farm (checked by scripts/liveops-test.ts).
 */
export const SEAL_SHOP: ShopEntry[] = [
  { id: 'health_potion', qty: 10, price: 3 },
  { id: 'mana_potion', qty: 10, price: 3 },
  { id: 'strong_health_potion', qty: 5, price: 5 },
  { id: 'strong_mana_potion', qty: 5, price: 5 },
  { id: 'vigour_potion', qty: 5, price: 3 },
  { id: 'teleport_rune_thornvale', qty: 1, price: 4 },
  { id: 'pet_morsel', qty: 3, price: 6 },
  { id: 'taskbearer_cape', qty: 1, price: 80 },
  { id: 'wayfinder_mantle', qty: 1, price: 220 },
];

// ------------------------------------------------------------------ saves

const KINDS: TaskKind[] = ['hunt', 'skill', 'deliver', 'explore'];
const int = (v: unknown, min: number, max: number, def: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function parseTask(raw: unknown): TaskInst | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!KINDS.includes(r.k as TaskKind) || typeof r.t !== 'string' || !r.t) return null;
  const n = int(r.n, 1, 1e9, 1);
  return { k: r.k as TaskKind, t: r.t.slice(0, 64), n, h: int(r.h, 0, n, 0), c: r.c === true, x: int(r.x, 0, 1e12, 0), g: int(r.g, 0, 1e9, 0), s: int(r.s, 0, 1000, 0) };
}

/** Reads a save's `tasks` block (anything unreadable starts empty: the board simply hands out new tasks). */
export function parseTaskState(raw: unknown): TaskState {
  const e = emptyTaskState();
  if (!raw || typeof raw !== 'object') return e;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map(parseTask).filter((t): t is TaskInst => !!t).slice(0, max) : []);
  return {
    day: int(r.day, -1, 1e7, -1), week: int(r.week, -1, 1e7, -1),
    daily: list(r.daily, DAILY_TASKS), weekly: list(r.weekly, WEEKLY_TASKS),
    rr: int(r.rr, -1, 1e7, -1), seals: int(r.seals, 0, SEALS_MAX, 0),
    streak: int(r.streak, 0, 1e5, 0), best: int(r.best, 0, 1e5, 0), last: int(r.last, -1, 1e7, -1), done: int(r.done, 0, 1e9, 0),
  };
}

export function saveTaskState(t: TaskState): Record<string, unknown> {
  return JSON.parse(JSON.stringify(t)) as Record<string, unknown>;
}

/** Copies a received view onto the mirror's state (online client). */
export function applyTaskState(into: TaskState, v: TaskState): void {
  Object.assign(into, parseTaskState(v));
}

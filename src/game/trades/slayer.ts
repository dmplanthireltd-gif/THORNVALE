import type { EnemyKind } from '../world/WorldMap';

/**
 * Slayer: a slayer master gives you a task — slay so many of one kind of
 * monster — and every kill on task gives slayer experience (a tenth of its
 * health, more for the toughest). Finishing a task earns slayer points (more
 * from the harder masters, a bonus every 10th and 50th task in a row) to spend
 * on rewards. Some monsters can only be hurt by a slayer of their level, and
 * the wailing shades only by one wearing a hush cowl. Pure data and rules.
 */

/** The monsters that only slayers can hurt (enemies/slayerDefs.ts has their stats). */
export type SlayerKind = 'gloomcrawler' | 'wailing_shade' | 'cinder_wraith' | 'marrow_gargoyle' | 'abyssal_horror';
export const SLAYER_KINDS: SlayerKind[] = ['gloomcrawler', 'wailing_shade', 'cinder_wraith', 'marrow_gargoyle', 'abyssal_horror'];

/** What a slayer monster asks of anyone who wants to hurt it. */
export const SLAYER_REQ: Record<SlayerKind, { level: number; item?: string; why: string }> = {
  gloomcrawler: { level: 10, why: 'Its shell turns every blow aside. Only a slayer (level 10) knows where to strike.' },
  wailing_shade: { level: 35, item: 'hush_cowl', why: 'Its wail drowns out every blow. You need slayer level 35 and a hush cowl on your head.' },
  cinder_wraith: { level: 55, why: 'Your blows pass through its embers. Only a slayer of level 55 can bind it.' },
  marrow_gargoyle: { level: 70, why: 'Stone and bone, and no weak spot you can see. It takes slayer level 70.' },
  abyssal_horror: { level: 85, why: 'Your weapon will not touch what came out of the abyss. It takes slayer level 85.' },
};

export interface SlayerTaskDef {
  id: string;
  /** Plural name for messages ("wolves"). */
  name: string;
  kinds: EnemyKind[];
  /** Character level the task is meant for. */
  level: number;
  /** Slayer level needed to be given it (0 = any). */
  slayer: number;
  /** How many to slay (min, max). */
  count: [number, number];
}

const T = (id: string, name: string, kinds: EnemyKind[], level: number, count: [number, number], slayer = 0): SlayerTaskDef => ({ id, name, kinds, level, slayer, count });

export const SLAYER_TASKS: SlayerTaskDef[] = [
  // the beginner master
  T('rats', 'rats', ['rat'], 1, [15, 25]),
  T('snakes', 'snakes', ['snake'], 3, [15, 25]),
  T('wolves', 'wolves', ['wolf', 'winter_wolf'], 5, [15, 30]),
  T('bandits', 'bandits', ['bandit'], 8, [15, 30]),
  T('skeletons', 'skeletons', ['skeleton'], 10, [20, 35]),
  T('bears', 'bears', ['bear', 'polar_bear'], 12, [15, 25]),
  T('dwarves', 'dwarves', ['dwarf', 'dwarf_soldier', 'dwarf_guard'], 12, [20, 35]),
  T('orcs', 'orcs', ['orc', 'orc_spearman', 'orc_shaman'], 15, [20, 35]),
  T('gloomcrawlers', 'gloomcrawlers', ['gloomcrawler'], 15, [15, 30], 10),
  T('ghouls', 'ghouls', ['ghoul'], 20, [20, 35]),
  T('frostkin', 'frostkin', ['frostkin', 'frostkin_toolshaper', 'frostkin_windcaller'], 20, [20, 35]),
  // the seasoned master
  T('elves', 'elves', ['elf', 'elf_scout', 'elf_arcanist', 'elf_warden'], 25, [20, 40]),
  T('minotaurs', 'minotaurs', ['minotaur', 'minotaur_archer', 'minotaur_mage'], 25, [25, 45]),
  T('amazons', 'amazons and valkyries', ['amazon', 'valkyrie'], 25, [25, 45]),
  T('tarantulas', 'tarantulas', ['tarantula'], 25, [25, 45]),
  T('trolls', 'jungle trolls', ['jungle_troll'], 25, [20, 35]),
  T('orc_warband', 'orc warriors', ['orc_warrior', 'orc_berserker', 'orc_leader'], 30, [25, 45]),
  T('barbarians', 'barbarians', ['barbarian_raider', 'barbarian_headsplitter', 'barbarian_skullhunter', 'barbarian_brutetamer'], 30, [20, 35]),
  T('desert_crawlers', 'scorpions and scarabs', ['scorpion', 'scarab'], 30, [25, 45]),
  T('crocodiles', 'crocodiles', ['crocodile'], 35, [25, 45]),
  T('cyclopes', 'cyclopes', ['cyclops'], 40, [25, 40]),
  T('deepfins', 'deepfins', ['deepfin_raider', 'deepfin_harpooner', 'deepfin_tidecaller'], 40, [25, 45]),
  T('wailing_shades', 'wailing shades', ['wailing_shade'], 40, [20, 35], 35),
  T('mummies', 'mummies', ['mummy'], 45, [25, 45]),
  T('sea_beasts', 'ironshell crabs and gloom eels', ['ironshell_crab', 'gloom_eel'], 45, [20, 35]),
  // the veteran master
  T('lizardfolk', 'lizardfolk', ['lizard_sentinel', 'lizard_templar'], 60, [30, 50]),
  T('fire_elementals', 'fire elementals', ['fire_elemental'], 60, [30, 55]),
  T('dragons', 'dragons', ['dragon', 'dragon_lord'], 70, [25, 45]),
  T('frost_giants', 'frost giants', ['frost_giant', 'frost_giantess'], 70, [25, 45]),
  T('cinder_wraiths', 'cinder wraiths', ['cinder_wraith'], 70, [25, 45], 55),
  T('crystal_spiders', 'crystal spiders', ['crystal_spider'], 90, [25, 45]),
  T('marrow_gargoyles', 'marrow gargoyles', ['marrow_gargoyle'], 90, [25, 40], 70),
  // the master of masters
  T('ice_golems', 'ice golems', ['ice_golem'], 100, [30, 50]),
  T('dread_weavers', 'dread weavers', ['dread_weaver'], 100, [25, 40]),
  T('hydras', 'hydras', ['hydra'], 110, [30, 50]),
  T('behemoths', 'behemoths', ['behemoth'], 110, [30, 50]),
  T('frost_dragons', 'frost dragons', ['frost_dragon'], 120, [25, 40]),
  T('abyssal_horrors', 'abyssal horrors', ['abyssal_horror'], 150, [15, 25], 85),
  T('demons', 'demons', ['demon'], 200, [8, 15]),
];
export const TASK_BY_ID: Record<string, SlayerTaskDef> = Object.fromEntries(SLAYER_TASKS.map((t) => [t.id, t]));

export interface MasterDef {
  npc: string;
  tier: 1 | 2 | 3 | 4;
  /** Character and slayer level to be given tasks. */
  minLevel: number;
  minSlayer: number;
  /** Task levels this master hands out. */
  band: [number, number];
  /** Points for a finished task (before streak bonuses). */
  points: number;
}

export const SLAYER_MASTERS: MasterDef[] = [
  { npc: 'slayer_vesna', tier: 1, minLevel: 1, minSlayer: 0, band: [1, 22], points: 3 },
  { npc: 'slayer_harrow', tier: 2, minLevel: 30, minSlayer: 0, band: [20, 48], points: 6 },
  { npc: 'slayer_morwen', tier: 3, minLevel: 60, minSlayer: 30, band: [45, 95], points: 10 },
  { npc: 'slayer_kaelos', tier: 4, minLevel: 100, minSlayer: 60, band: [90, 220], points: 15 },
];
export const MASTER_BY_NPC: Record<string, MasterDef> = Object.fromEntries(SLAYER_MASTERS.map((m) => [m.npc, m]));

/** Slayer experience for one kill on task. */
export function slayerXp(maxHp: number): number {
  return Math.max(1, Math.round(maxHp * 0.12));
}

/** Points for finishing a task: every 10th task in a row ×5, every 50th ×15. */
export function taskPoints(base: number, streak: number): number {
  return streak > 0 && streak % 50 === 0 ? base * 15 : streak > 0 && streak % 10 === 0 ? base * 5 : base;
}

/** The tasks a master could give a character of this level and slayer level (only kinds that live in the world). */
export function tasksFor(m: MasterDef, level: number, slayer: number, living: (k: EnemyKind) => boolean): SlayerTaskDef[] {
  return SLAYER_TASKS.filter((t) => t.level >= m.band[0] && t.level <= m.band[1] && t.level <= Math.max(level + 10, m.band[0]) && slayer >= t.slayer && t.kinds.some(living));
}

/** A task in progress (saved as `trades.slayer`). */
export interface SlayerTask {
  task: string;
  master: string;
  left: number;
  total: number;
}

/** Rewards bought with slayer points at any master. */
export interface SlayerReward {
  id: string;
  label: string;
  cost: number;
  /** Item it gives (absent: an effect, e.g. skipping a task). */
  item?: string;
  qty?: number;
}

export const SLAYER_REWARDS: SlayerReward[] = [
  { id: 'skip', label: 'Cancel my task', cost: 30 },
  { id: 'morsels', label: 'Pet morsels (10)', cost: 20, item: 'pet_morsel', qty: 10 },
  { id: 'seeds', label: 'Herb seeds (6)', cost: 25 },
  { id: 'helm', label: 'Slayer helm', cost: 250, item: 'slayer_helm', qty: 1 },
];

/** Extra damage a worn slayer helm gives against your task's monsters. */
export const SLAYER_HELM_BONUS = 0.08;
export const SLAYER_HELM = 'slayer_helm';
export const HUSH_COWL = 'hush_cowl';

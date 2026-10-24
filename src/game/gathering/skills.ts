/**
 * Every non-combat skill in one place. Combat stays classic (fist, club, sword,
 * axe, distance, shielding, magic level: see player/skills.ts); these are the
 * RuneScape-style trade skills, all on the 1–99 experience curve in
 * woodcutting.ts (gatherLevelForXp / gatherXpForLevel).
 *
 * A skill listed here automatically gets: a save key under `gathering` (total
 * experience), a Skills panel row in its section, `/skill <id> N`, and its share
 * of the snapshot (`gx`). Adding a new skill is mostly data: add its id to
 * NonCombatSkill and a row to NONCOMBAT_SKILLS, bump SAVE_VERSION with a
 * migration that sets it to 0, then write the activity (gathering/ or production/).
 */
export type NonCombatSkill = 'woodcutting' | 'fishing' | 'mining' | 'smithing' | 'fletching' | 'crafting' | 'cooking' | 'firemaking'
  | 'agility' | 'herblore' | 'thieving' | 'slayer' | 'farming' | 'hunter';

/**
 * Skills the save already makes room for (save v16 sets them all to 0) but whose activity ships in a
 * later stage: they appear in NONCOMBAT_SKILLS as they are built. Their saved experience is kept.
 */
export const RESERVED_SKILL_IDS = ['sailing'] as const;

/**
 * Gathering skills take from the world; production skills turn materials into items at a station;
 * adventure skills are about getting around and getting away with it (agility, thieving, slayer, sailing).
 */
export type SkillKind = 'gathering' | 'production' | 'adventure';

export interface NonCombatSkillDef {
  id: NonCombatSkill;
  name: string;
  kind: SkillKind;
  /** Item id whose icon stands for the skill in the HUD. */
  icon: string;
  /** One line for tooltips: how the skill is trained. */
  hint: string;
  /** Extra names accepted by /skill. */
  aliases: string[];
}

export const NONCOMBAT_SKILLS: NonCombatSkillDef[] = [
  { id: 'woodcutting', name: 'Woodcutting', kind: 'gathering', icon: 'hatchet', hint: 'Chop trees with an axe.', aliases: ['wc', 'wood'] },
  { id: 'fishing', name: 'Fishing', kind: 'gathering', icon: 'fishing_rod', hint: 'Click water near you with a fishing rod.', aliases: ['fish'] },
  { id: 'mining', name: 'Mining', kind: 'gathering', icon: 'bronze_pickaxe', hint: 'Mine ore rocks with a pickaxe.', aliases: ['mine', 'min'] },
  { id: 'smithing', name: 'Blacksmithing', kind: 'production', icon: 'smithing_hammer', hint: 'Smelt ore into bars at a furnace, then hammer bars into gear at an anvil.', aliases: ['smith', 'blacksmithing', 'smelting'] },
  { id: 'fletching', name: 'Fletching', kind: 'production', icon: 'knife', hint: 'Use a knife to carve logs into arrow shafts, bows and crossbow stocks; add feathers and arrowheads for arrows.', aliases: ['fletch', 'fl', 'bowyer'] },
  { id: 'crafting', name: 'Crafting', kind: 'production', icon: 'needle', hint: 'Tan hides at a tanning rack, sew leather with a needle and thread, cut gems with a chisel, make jewellery at a furnace.', aliases: ['craft', 'cr', 'leatherwork', 'jewellery'] },
  { id: 'cooking', name: 'Cooking', kind: 'production', icon: 'meat', hint: 'Cook raw fish and meat on a campfire or a stove (every depot has one). Burns less as you level.', aliases: ['cook', 'ck'] },
  { id: 'firemaking', name: 'Firemaking', kind: 'production', icon: 'tinderbox', hint: 'Use a tinderbox to light logs on open ground outside towns. Better logs need a higher level.', aliases: ['fire', 'fm'] },
  { id: 'herblore', name: 'Herblore', kind: 'production', icon: 'pestle', hint: 'Pick wild herbs, clean them and brew potions with a pestle and mortar and empty vials.', aliases: ['herb', 'herbs', 'hb', 'potions'] },
  { id: 'agility', name: 'Agility', kind: 'adventure', icon: 'rope', hint: 'Cross shortcuts across the world: balance logs, climbing rocks, swims and squeezes. Agility also gives you more running stamina.', aliases: ['agi', 'ag', 'run'] },
  { id: 'farming', name: 'Farming', kind: 'gathering', icon: 'trowel', hint: 'Plant seeds in farm patches with a trowel; they grow in real time, even while you are away. Harvest vegetables and herbs.', aliases: ['farm', 'fa', 'grow'] },
  { id: 'hunter', name: 'Hunter', kind: 'gathering', icon: 'box_trap', hint: 'Set box traps by burrows and snares in nesting bushes, then collect what you catch: pelts, plumes, feathers and pet morsels.', aliases: ['hunt', 'hu', 'trap', 'traps'] },
  { id: 'slayer', name: 'Slayer', kind: 'adventure', icon: 'slayer_helm', hint: 'Take a task from a slayer master and slay that kind of monster for slayer experience and points. Some monsters only a slayer can hurt.', aliases: ['sl', 'slay', 'task'] },
  { id: 'thieving', name: 'Thieving', kind: 'adventure', icon: 'lockpick', hint: 'Pick the pockets of townsfolk, steal from market stalls and pick the locks of strongboxes. Get caught and you are stunned.', aliases: ['thief', 'th', 'steal'] },
];

export const NONCOMBAT_IDS: NonCombatSkill[] = NONCOMBAT_SKILLS.map((d) => d.id);

/** Skills the owner has asked for that are not built yet (owner decision 2026-10-21). */
export const PLANNED_SKILLS: Array<{ id: string; name: string; kind: SkillKind }> = [
  { id: 'construction', name: 'Construction', kind: 'production' },
  { id: 'alchemy', name: 'Alchemy', kind: 'production' },
];

/** Experience in one skill never goes above this (classic cap). */
export const SKILL_XP_CAP = 200_000_000;

export function skillDef(id: NonCombatSkill): NonCombatSkillDef {
  return NONCOMBAT_SKILLS.find((d) => d.id === id)!;
}

export function isNonCombatSkill(v: unknown): v is NonCombatSkill {
  return typeof v === 'string' && (NONCOMBAT_IDS as string[]).includes(v);
}

/** Finds a skill by id, name or alias ("smith", "Blacksmithing", "wc"). */
export function findNonCombatSkill(q: string): NonCombatSkill | null {
  const k = q.trim().toLowerCase();
  const d = NONCOMBAT_SKILLS.find((s) => s.id === k || s.name.toLowerCase() === k || s.aliases.includes(k));
  return d?.id ?? null;
}

/** Every skill at 0 experience (level 1). */
export function emptySkillXp(): Record<NonCombatSkill, number> {
  return Object.fromEntries(NONCOMBAT_IDS.map((id) => [id, 0])) as Record<NonCombatSkill, number>;
}

/** Reads a save's `gathering` block: unknown keys are ignored, bad numbers become 0. */
export function parseSkillXp(raw: unknown): Record<NonCombatSkill, number> {
  const out = emptySkillXp();
  if (!raw || typeof raw !== 'object') return out;
  for (const id of NONCOMBAT_IDS) {
    const v = Number((raw as Record<string, unknown>)[id]);
    out[id] = Number.isFinite(v) && v > 0 ? Math.min(SKILL_XP_CAP, v) : 0;
  }
  return out;
}

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
export type NonCombatSkill = 'woodcutting' | 'fishing' | 'mining' | 'smithing';

/** Gathering skills take from the world; production skills turn materials into items at a station. */
export type SkillKind = 'gathering' | 'production';

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
];

export const NONCOMBAT_IDS: NonCombatSkill[] = NONCOMBAT_SKILLS.map((d) => d.id);

/** Skills the owner has asked for that are not built yet (owner decision 2026-10-21). */
export const PLANNED_SKILLS: Array<{ id: string; name: string; kind: SkillKind }> = [
  { id: 'fletching', name: 'Fletching', kind: 'production' },
  { id: 'crafting', name: 'Crafting', kind: 'production' },
  { id: 'construction', name: 'Construction', kind: 'production' },
  { id: 'alchemy', name: 'Alchemy', kind: 'production' },
  { id: 'cooking', name: 'Cooking', kind: 'production' },
  { id: 'firemaking', name: 'Firemaking', kind: 'production' },
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

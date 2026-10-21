import type { WeaponType } from '../inventory/items';
import type { Vocation } from './vocations';
import { NONCOMBAT_SKILLS, type NonCombatSkill } from '../gathering/skills';

/**
 * Combat skills in the classic style: every swing trains the skill of the
 * weapon you hold, every blow you take with a shield up trains shielding, and
 * every point of mana you spend trains magic level. Each level needs more
 * tries than the last (base × growth^level), and the growth factor depends on
 * the vocation: knights learn melee quickly, paladins distance, mages magic.
 *
 * How skills change damage (see Game): a weapon skill or magic level stands in
 * for half of the character level in the damage formulas. A character whose
 * skill is "typical" for its level (typicalSkill) deals exactly what the old,
 * level-only formulas gave, so the balance stays the same; training above that
 * makes you stronger, neglecting a style makes it weaker.
 */
export type CombatSkill = 'fist' | 'club' | 'sword' | 'axe' | 'distance' | 'shielding' | 'magic';
export const COMBAT_SKILLS: CombatSkill[] = ['fist', 'club', 'sword', 'axe', 'distance', 'shielding', 'magic'];

/** Display names of every skill: combat here, non-combat from the registry in gathering/skills.ts. */
export const SKILL_NAMES: Record<CombatSkill | NonCombatSkill, string> = {
  fist: 'Fist Fighting', club: 'Club Fighting', sword: 'Sword Fighting', axe: 'Axe Fighting', distance: 'Distance Fighting',
  shielding: 'Shielding', magic: 'Magic Level',
  ...(Object.fromEntries(NONCOMBAT_SKILLS.map((d) => [d.id, d.name])) as Record<NonCombatSkill, string>),
};

export interface SkillProgress {
  level: number;
  /** Tries (magic level: mana spent) collected towards the next level. */
  tries: number;
}

export type Skills = Record<CombatSkill, SkillProgress>;

/** Weapon skills and shielding start here; magic level starts at 0. */
export const SKILL_START = 10;
export const MAGIC_START = 0;
/** Hard cap so a runaway loop can never happen. */
export const SKILL_MAX = 250;

/** Tries for the first level (magic: mana for magic level 0 → 1). */
const BASE: Record<CombatSkill, number> = { fist: 50, club: 50, sword: 50, axe: 50, distance: 30, shielding: 100, magic: 1600 };

/** How much more each level costs than the one before, per vocation (lower = learns faster). */
const GROWTH: Record<Vocation, Record<CombatSkill, number>> = {
  knight: { fist: 1.1, club: 1.1, sword: 1.1, axe: 1.1, distance: 1.4, shielding: 1.1, magic: 3.0 },
  paladin: { fist: 1.2, club: 1.2, sword: 1.2, axe: 1.2, distance: 1.1, shielding: 1.1, magic: 1.4 },
  sorcerer: { fist: 1.5, club: 2.0, sword: 2.0, axe: 2.0, distance: 2.0, shielding: 1.5, magic: 1.1 },
  druid: { fist: 1.5, club: 2.0, sword: 2.0, axe: 2.0, distance: 2.0, shielding: 1.5, magic: 1.1 },
};

/**
 * Character levels one skill point is worth in the damage formulas. A vocation
 * that trains a skill slowly gets more out of each point, so "typical" skills
 * look classic (a level-100 knight has about 72 sword, a mage about 66 magic)
 * while every vocation keeps its old damage at those values.
 */
const POWER: Record<Vocation, Record<CombatSkill, number>> = {
  knight: { fist: 0.8, club: 0.8, sword: 0.8, axe: 0.8, distance: 1.6, shielding: 0.8, magic: 5 },
  paladin: { fist: 1.2, club: 1.2, sword: 1.2, axe: 1.2, distance: 0.8, shielding: 1.2, magic: 2 },
  sorcerer: { fist: 2.5, club: 2.5, sword: 2.5, axe: 2.5, distance: 2.5, shielding: 2.5, magic: 0.75 },
  druid: { fist: 2.5, club: 2.5, sword: 2.5, axe: 2.5, distance: 2.5, shielding: 2.5, magic: 0.75 },
};

export function startSkills(): Skills {
  const s = {} as Skills;
  for (const k of COMBAT_SKILLS) s[k] = { level: k === 'magic' ? MAGIC_START : SKILL_START, tries: 0 };
  return s;
}

/** Tries (or mana) needed to go from `level` to `level + 1`. */
export function triesForNext(skill: CombatSkill, level: number, voc: Vocation): number {
  const b = GROWTH[voc][skill];
  if (skill === 'magic') return Math.max(1, Math.round(BASE.magic * b ** Math.max(0, level)));
  return Math.max(1, Math.round(BASE[skill] * b ** Math.max(0, level - SKILL_START)));
}

/** Progress towards the next level, 0–1. */
export function skillProgress(skill: CombatSkill, p: SkillProgress, voc: Vocation): number {
  return Math.max(0, Math.min(1, p.tries / triesForNext(skill, p.level, voc)));
}

/** Adds tries; returns how many levels were gained. */
export function addTries(skills: Skills, skill: CombatSkill, n: number, voc: Vocation): number {
  const p = skills[skill];
  if (!(n > 0) || p.level >= SKILL_MAX) return 0;
  p.tries += n;
  let gained = 0;
  for (let guard = 0; guard < 50 && p.level < SKILL_MAX; guard++) {
    const need = triesForNext(skill, p.level, voc);
    if (p.tries < need) break;
    p.tries -= need;
    p.level++;
    gained++;
  }
  if (p.level >= SKILL_MAX) p.tries = 0;
  return gained;
}

/** The skill a weapon trains (no weapon = fist). Wands and rods use magic level. */
export function skillForWeapon(t: WeaponType | undefined): CombatSkill {
  switch (t) {
    case 'sword': return 'sword';
    case 'axe': return 'axe';
    case 'club': return 'club';
    case 'bow': case 'crossbow': case 'throwing': return 'distance';
    case 'wand': case 'rod': return 'magic';
    default: return 'fist';
  }
}

/**
 * "Power level" used in damage and healing formulas in place of the character
 * level: half comes from the level, half from the skill. At the typical skill
 * for a level this equals the level itself.
 */
export function powerLevel(level: number, skill: CombatSkill, skillLevel: number, voc: Vocation): number {
  const start = skill === 'magic' ? MAGIC_START : SKILL_START;
  return Math.max(1, 0.5 * level + 0.5 + POWER[voc][skill] * (skillLevel - start));
}

/** The skill level at which powerLevel() equals the character level (the old balance). */
export function typicalSkill(skill: CombatSkill, level: number, voc: Vocation): number {
  const start = skill === 'magic' ? MAGIC_START : SKILL_START;
  return start + (0.5 * (Math.max(1, level) - 1)) / POWER[voc][skill];
}

/** Better weapon skill, fewer misses (melee base 8%, never below 2%). */
export function skillHitBonus(skillLevel: number): number {
  return Math.min(0.06, Math.max(0, (skillLevel - SKILL_START) * 0.0008));
}

/** Shielding makes your shield (and weapon) defence count for more: +0.6% per level above 10. */
export function shieldingFactor(skillLevel: number): number {
  return 1 + Math.max(0, skillLevel - SKILL_START) * 0.006;
}

/** Magic level adds a little to wand and rod shots: +0.3% per level. */
export function wandFactor(magicLevel: number): number {
  return 1 + Math.max(0, magicLevel) * 0.003;
}

/** Shielding of characters from before skills existed: knights learned it, mages much less. */
const SHIELD_SHARE: Record<Vocation, number> = { knight: 1, paladin: 0.8, sorcerer: 0.5, druid: 0.5 };

/**
 * Skills for a character that existed before skills did (save v4 → v5). Every
 * weapon skill and magic level is set to the value that keeps that
 * character's damage and healing exactly where they were (rounded up, so
 * nobody gets weaker); shielding depends on the vocation.
 */
export function legacySkills(voc: Vocation, level: number): Skills {
  const s = startSkills();
  for (const k of COMBAT_SKILLS) {
    if (k === 'shielding') {
      s[k].level = Math.ceil(SKILL_START + (typicalSkill(k, level, voc) - SKILL_START) * SHIELD_SHARE[voc]);
    } else {
      s[k].level = Math.ceil(typicalSkill(k, level, voc) - 1e-9);
    }
    s[k].level = Math.min(SKILL_MAX, s[k].level);
  }
  return s;
}

/** Reads skills from save data, filling gaps with starting values. */
export function parseSkills(raw: unknown): Skills {
  const s = startSkills();
  if (!raw || typeof raw !== 'object') return s;
  for (const k of COMBAT_SKILLS) {
    const v = (raw as Record<string, unknown>)[k] as Partial<SkillProgress> | undefined;
    if (!v || typeof v !== 'object') continue;
    const lvl = Math.floor(Number(v.level));
    const tries = Number(v.tries);
    if (Number.isFinite(lvl)) s[k].level = Math.max(k === 'magic' ? MAGIC_START : SKILL_START, Math.min(SKILL_MAX, lvl));
    if (Number.isFinite(tries) && tries > 0) s[k].tries = tries;
  }
  return s;
}

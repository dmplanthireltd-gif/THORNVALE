/**
 * Experience stages (server rates). Seasonal servers multiply what players earn so that a
 * typical player has the money and gear for end game after two or three weeks; classic
 * servers earn everything at ×1.
 *
 * One table drives every multiplier:
 * - character experience by the receiver's level (monster kills — alone, shared in a party,
 *   bosses, world bosses, raids — and quest rewards; `/exp` test commands stay raw),
 * - combat skill tries and magic level by the skill's current level,
 * - gathering and production skill experience by the skill's current level,
 * - gold dropped by monsters (corpse loot and world boss bags; chests and NPCs stay ×1).
 *
 * Server env: `STAGES=season|classic` picks a preset (default `season`), and `SEASON_STAGES`
 * (JSON, same shape as `ExpStages`, any part may be left out) overrides parts of it.
 * The pure Game defaults to classic when nobody passes stages (tests rely on exact numbers).
 */

/** One band of levels with the same multiplier. `to` is inclusive; leave it out for "and above". */
export interface StageBand {
  from: number;
  to?: number;
  rate: number;
}

export interface ExpStages {
  /** 'season', 'classic' or 'custom' (preset with SEASON_STAGES overrides). */
  name: string;
  /** Character experience by the character's level. */
  exp: StageBand[];
  /** Melee, distance and shielding tries by the skill's level. */
  combat: StageBand[];
  /** Magic level (mana spent) by magic level. */
  magic: StageBand[];
  /** Gathering and production skills (woodcutting … firemaking) by the skill's level. */
  gathering: StageBand[];
  /** Gold dropped by monsters. */
  gold: number;
}

export const SEASON_STAGES: ExpStages = {
  name: 'season',
  exp: [
    { from: 1, to: 50, rate: 10 },
    { from: 51, to: 100, rate: 6 },
    { from: 101, to: 150, rate: 3 },
    { from: 151, rate: 1.5 },
  ],
  combat: [{ from: 0, to: 59, rate: 5 }, { from: 60, rate: 3 }],
  magic: [{ from: 0, to: 39, rate: 5 }, { from: 40, rate: 3 }],
  gathering: [{ from: 1, to: 59, rate: 5 }, { from: 60, rate: 3 }],
  gold: 1.5,
};

export const CLASSIC_STAGES: ExpStages = {
  name: 'classic',
  exp: [{ from: 1, rate: 1 }],
  combat: [{ from: 0, rate: 1 }],
  magic: [{ from: 0, rate: 1 }],
  gathering: [{ from: 1, rate: 1 }],
  gold: 1,
};

export const STAGE_PRESETS: Record<string, ExpStages> = { season: SEASON_STAGES, classic: CLASSIC_STAGES };

/** Highest multiplier anyone may configure (guards against a typo like 1000). */
const MAX_RATE = 100;

/** The band a level falls in (the last band whose `from` is ≤ level). */
export function bandFor(bands: StageBand[], level: number): StageBand | null {
  let hit: StageBand | null = null;
  for (const b of bands) if (level >= b.from && (b.to === undefined || level <= b.to)) hit = b;
  if (hit) return hit;
  // a gap in a custom table: use the nearest band below
  for (const b of bands) if (level >= b.from) hit = b;
  return hit;
}

export function rateFor(bands: StageBand[], level: number): number {
  return bandFor(bands, level)?.rate ?? 1;
}

/** Character experience multiplier at this character level. */
export function expRate(st: ExpStages, level: number): number {
  return rateFor(st.exp, level);
}

/** Combat skill multiplier ('magic' uses its own table). */
export function combatSkillRate(st: ExpStages, skill: string, level: number): number {
  return rateFor(skill === 'magic' ? st.magic : st.combat, level);
}

/** Gathering / production skill multiplier at this skill level. */
export function gatheringRate(st: ExpStages, level: number): number {
  return rateFor(st.gathering, level);
}

/** Scales an amount, keeping the fraction as a chance so small numbers average out exactly. */
export function scaleAmount(n: number, rate: number, rnd: () => number = Math.random): number {
  if (rate === 1 || n <= 0) return n;
  const v = n * rate;
  const whole = Math.floor(v);
  return whole + (rnd() < v - whole ? 1 : 0);
}

/** Gold from one monster loot roll. */
export function stagedGold(st: ExpStages, qty: number, rnd: () => number = Math.random): number {
  return Math.max(1, scaleAmount(qty, st.gold, rnd));
}

function cleanBands(v: unknown, fallback: StageBand[]): StageBand[] {
  if (!Array.isArray(v)) return fallback;
  const out: StageBand[] = [];
  for (const b of v) {
    if (!b || typeof b !== 'object') continue;
    const r = b as Record<string, unknown>;
    const from = Number(r.from);
    const rate = Number(r.rate);
    if (!Number.isFinite(from) || !Number.isFinite(rate) || rate <= 0) continue;
    const hasTo = r.to !== undefined && r.to !== null && Number.isFinite(Number(r.to));
    out.push(hasTo ? { from: Math.floor(from), to: Math.floor(Number(r.to)), rate: Math.min(MAX_RATE, rate) } : { from: Math.floor(from), rate: Math.min(MAX_RATE, rate) });
  }
  out.sort((a, b) => a.from - b.from);
  return out.length ? out : fallback;
}

/**
 * Reads the server's stages: `STAGES` preset (season | classic, default season) and optional
 * `SEASON_STAGES` JSON overrides. Bad JSON is ignored (the preset is used) and reported in `warning`.
 */
export function stagesFromEnv(env: Record<string, string | undefined>): { stages: ExpStages; warning?: string } {
  const presetName = (env.STAGES ?? '').trim().toLowerCase() || 'season';
  const preset = STAGE_PRESETS[presetName];
  let warning: string | undefined;
  const base = preset ?? SEASON_STAGES;
  if (!preset) warning = `unknown STAGES "${presetName}", using season`;
  const raw = env.SEASON_STAGES?.trim();
  if (!raw) return { stages: base, warning };
  try {
    return { stages: parseStages(JSON.parse(raw), base), warning };
  } catch {
    return { stages: base, warning: 'SEASON_STAGES is not valid JSON, ignored' };
  }
}

/** Any object (e.g. from JSON or the network) → a valid table, missing parts taken from `base`. */
export function parseStages(v: unknown, base: ExpStages = CLASSIC_STAGES): ExpStages {
  if (!v || typeof v !== 'object') return base;
  const r = v as Record<string, unknown>;
  const gold = Number(r.gold);
  const changed = ['exp', 'combat', 'magic', 'gathering', 'gold'].some((k) => r[k] !== undefined);
  return {
    name: typeof r.name === 'string' && r.name ? r.name.slice(0, 20) : changed ? 'custom' : base.name,
    exp: cleanBands(r.exp, base.exp),
    combat: cleanBands(r.combat, base.combat),
    magic: cleanBands(r.magic, base.magic),
    gathering: cleanBands(r.gathering, base.gathering),
    gold: Number.isFinite(gold) && gold > 0 ? Math.min(MAX_RATE, gold) : base.gold,
  };
}

const fmtRate = (r: number) => `×${Math.round(r * 100) / 100}`;
const fmtBand = (b: StageBand) => (b.to === undefined ? `${b.from}+` : `${b.from}–${b.to}`);

/** True when every multiplier is 1 (nothing to show). */
export function isClassic(st: ExpStages): boolean {
  return st.gold === 1 && [st.exp, st.combat, st.magic, st.gathering].every((l) => l.every((b) => b.rate === 1));
}

/** "Exp ×10 (level 1–50)" for this character. */
export function expStageLine(st: ExpStages, level: number): string {
  const b = bandFor(st.exp, level);
  if (!b) return 'Exp ×1';
  return `Exp ${fmtRate(b.rate)} (level ${fmtBand(b)})`;
}

/** Short lines for the Skills panel / help: what this character earns right now. */
export function ratesSummary(st: ExpStages, level: number, skills?: { combat: number; magic: number; gathering: number }): string[] {
  const lines = [expStageLine(st, level)];
  const one = (label: string, bands: StageBand[], lvl?: number) => {
    if (lvl !== undefined) {
      const b = bandFor(bands, lvl);
      if (b) lines.push(`${label} ${fmtRate(b.rate)} (${fmtBand(b)})`);
      return;
    }
    lines.push(`${label} ${bands.map((b) => `${fmtRate(b.rate)} ${fmtBand(b)}`).join(', ')}`);
  };
  one('Skills', st.combat, skills?.combat);
  one('Magic', st.magic, skills?.magic);
  one('Trades', st.gathering, skills?.gathering);
  lines.push(`Gold ${fmtRate(st.gold)}`);
  return lines;
}

/** The whole table, one line per part (help window, server log). */
export function stagesTable(st: ExpStages): string[] {
  return [
    `Experience: ${st.exp.map((b) => `level ${fmtBand(b)} ${fmtRate(b.rate)}`).join(', ')}`,
    `Fighting skills: ${st.combat.map((b) => `${fmtBand(b)} ${fmtRate(b.rate)}`).join(', ')}`,
    `Magic level: ${st.magic.map((b) => `${fmtBand(b)} ${fmtRate(b.rate)}`).join(', ')}`,
    `Gathering and production: ${st.gathering.map((b) => `${fmtBand(b)} ${fmtRate(b.rate)}`).join(', ')}`,
    `Gold from monsters: ${fmtRate(st.gold)}`,
  ];
}

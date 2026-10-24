import type { ItemSpec, Rarity } from './items';
import type { CombatSkill } from '../player/skills';
import type { NonCombatSkill } from '../gathering/skills';
import type { EnemyKind } from '../world/WorldMap';

/**
 * Capes: the 11th equipment slot (`cape`, worn on the back). Thirty of them:
 * one skill cape per skill (combat skills and trade skills), the Grandmaster's
 * Mantle for mastering every trade skill, town capes, rare boss drops, two
 * deed capes and two seasonal capes.
 *
 * Pure data and rules (no DOM, no three.js). items.ts turns CAPES into item
 * definitions, npcs.ts puts them in shops (`applyCapeStock`), enemyDefs.ts adds
 * the drops (`CAPE_DROPS`), Game checks the requirements (`capeProblem`) and the
 * training bonus (`capeTrainingBonus`). Looks live in render/models/capeLooks.ts.
 * Ids are stable forever (they live in saves).
 */

export type CapeKind = 'skill' | 'mastery' | 'town' | 'boss' | 'deed' | 'season';
export type CapeSkill = CombatSkill | NonCombatSkill;

/** Deeds a deed cape asks for (tracked per character in `Session.bossKills`, save v13+). */
export type CapeDeed = 'dungeon_bosses' | 'world_bosses';

export interface CapeDef {
  id: string;
  name: string;
  kind: CapeKind;
  /** Skill capes: the skill and the level it asks for (to buy and to wear). */
  skill?: CapeSkill;
  level?: number;
  /** Deed capes: what must be done first (to buy and to wear). */
  deed?: CapeDeed;
  /** Seasonal capes: on sale from month `from` to month `to` (1–12, inclusive, may wrap the new year). */
  season?: { from: number; to: number; name: string };
  /** NPC key that sells it (also buys it back), and the price. */
  seller?: string;
  price?: number;
  /** Boss drops: which monster drops it and how often. */
  drop?: { kind: EnemyKind; chance: number };
  /** Gold an NPC pays for it. */
  value: number;
  rarity: Rarity;
  /** Colour for tints and fallbacks (the full look is in capeLooks.ts). */
  tint: string;
  note: string;
}

/** Level a combat skill cape asks for (classic skills: 80 is a seasoned fighter). */
export const COMBAT_CAPE_LEVEL = 80;
/** Magic level a magic cape asks for (magic levels rise far slower than weapon skills). */
export const MAGIC_CAPE_LEVEL = 70;
/** Level a trade skill cape asks for: the top of the 1–99 curve. */
export const TRADE_CAPE_LEVEL = 99;
/** Extra experience (trade skills) or tries (combat skills) a skill cape gives in its own skill. */
export const CAPE_TRAINING_BONUS = 0.05;
/** Price of a skill cape at its master. */
export const SKILL_CAPE_PRICE = 50_000;
export const MASTERY_CAPE_PRICE = 250_000;

const skill = (id: string, name: string, sk: CapeSkill, seller: string, tint: string, note: string): CapeDef => {
  const level = sk === 'magic' ? MAGIC_CAPE_LEVEL : isTrade(sk) ? TRADE_CAPE_LEVEL : COMBAT_CAPE_LEVEL;
  return { id, name, kind: 'skill', skill: sk, level, seller, price: SKILL_CAPE_PRICE, value: 5000, rarity: 'rare', tint, note };
};

/**
 * The eight trades the Grandmaster's Mantle asks for (unchanged when the skills of 2026-10-24 came,
 * so nobody who earned it loses the right to wear it).
 */
const TRADE: NonCombatSkill[] = ['woodcutting', 'fishing', 'mining', 'smithing', 'fletching', 'crafting', 'cooking', 'firemaking'];
const COMBAT_CAPE_SKILLS: string[] = ['fist', 'club', 'sword', 'axe', 'distance', 'shielding', 'magic'];
/** Every non-combat skill (all on the 1–99 curve: their capes ask for 99). */
function isTrade(s: CapeSkill): s is NonCombatSkill {
  return !COMBAT_CAPE_SKILLS.includes(s);
}

const town = (id: string, name: string, seller: string, tint: string, note: string): CapeDef =>
  ({ id, name, kind: 'town', seller, price: 2000, value: 200, rarity: 'common', tint, note });

export const CAPES: CapeDef[] = [
  // --- skill capes: combat (classic skills) ----------------------------------------------------
  skill('brawler_cape', "Brawler's Mantle", 'fist', 'aldric', '#8a1e1a', 'Worn by those who won their fights with bare knuckles.'),
  skill('cudgel_cape', "Cudgelmaster's Cape", 'club', 'aldric', '#a85a1e', 'Every dent in its iron studs was made by a mace.'),
  skill('bladesworn_cape', 'Bladesworn Cape', 'sword', 'aldric', '#3a5a8a', 'Granted to swordmasters who swore never to drop their blade.'),
  skill('axelord_cape', "Axe-Lord's Cape", 'axe', 'aldric', '#2f5a2a', 'Heavy wool for heavy swings.'),
  skill('farshot_cape', 'Farshot Cape', 'distance', 'garrick', '#3a6a3a', 'A marksman\'s cape, cut short so it never catches the bowstring.'),
  skill('bulwark_cape', 'Bulwark Cape', 'shielding', 'aldric', '#1e2e5a', 'For those who have stood behind a shield through a thousand blows.'),
  skill('starweave_cape', 'Starweave Cape', 'magic', 'mirella', '#2a1a5a', 'Woven with a thread of night sky. The stars on it move.'),
  // --- skill capes: trade skills (level 99) ----------------------------------------------------
  skill('timberwright_cape', "Timberwright's Cape", 'woodcutting', 'garrick', '#5a3a1e', 'Smells of pine resin, always.'),
  skill('tidecaller_cape', "Tidecaller's Cape", 'fishing', 'garrick', '#1e6a7a', 'The fish of every water know this cape.'),
  skill('deepdelver_cape', "Deepdelver's Cape", 'mining', 'brunhild', '#4a4c52', 'Glittering with ore dust that never washes out.'),
  skill('forgemaster_cape', "Forgemaster's Cape", 'smithing', 'brunhild', '#2a2420', 'Embers from a thousand bars still glow in its hem.'),
  skill('quillwright_cape', "Quillwright's Cape", 'fletching', 'garrick', '#c8b890', 'Fletched with the feathers of a hundred thousand arrows.'),
  skill('artisan_cape', "Artisan's Cape", 'crafting', 'brunhild', '#5a1e4a', 'Stitched, tanned, set and polished by the wearer\'s own hand.'),
  skill('hearthcook_cape', "Hearthcook's Cape", 'cooking', 'brann', '#e8e0d0', 'Not one burnt meal in a long, long time.'),
  skill('flamekeeper_cape', "Flamekeeper's Cape", 'firemaking', 'brann', '#7a1e08', 'Never quite stops smouldering.'),
  // the trade skills of 2026-10-24, each sold by its master (trades/tradeNpcs.ts)
  skill('windstride_cape', 'Windstride Cape', 'agility', 'agility_master', '#4a7aa8', 'Light as a breath of wind. It never snags on a branch.'),
  skill('apothecary_cape', "Apothecary's Cape", 'herblore', 'herb_master', '#3a6a3a', 'Its pockets smell of a hundred herbs at once.'),
  skill('shadowpurse_cape', 'Shadowpurse Cape', 'thieving', 'thief_master', '#2a2630', 'Somehow, nobody ever remembers seeing it.'),
  skill('tillers_cape', "Tiller's Cape", 'farming', 'farm_master', '#6a8a2a', 'There is always a little soil in its hem, and it smells of rain.'),
  skill('trappers_cape', "Trapper's Cape", 'hunter', 'hunt_master', '#7a5a32', 'Patched with the pelts of a hundred careful catches.'),
  skill('banewarden_cape', "Banewarden's Cape", 'slayer', 'slayer_vesna', '#4a1214', 'Each stitch marks a task done. There are a great many stitches.'),
  // --- mastery ---------------------------------------------------------------------------------
  {
    id: 'grandmaster_mantle', name: "Grandmaster's Mantle", kind: 'mastery', seller: 'elias', price: MASTERY_CAPE_PRICE, value: 25000, rarity: 'legendary', tint: '#e8c040',
    note: 'For true masters: every trade (woodcutting, fishing, mining, blacksmithing, fletching, crafting, cooking, firemaking) at 99, and one fighting art at cape level.',
  },
  // --- town capes (the six free towns of the heartland) ------------------------------------------
  town('thornvale_cape', 'Thornvale Cape', 'aldric', '#2a5a2a', 'Green and gold of the old village of Thornvale.'),
  town('westmarch_cape', 'Westmarch Cape', 'westmarch_marshal', '#2a4a8a', 'Blue and white of the walled city of Westmarch.'),
  town('elderglen_cape', 'Elderglen Cape', 'brann', '#4a6a2a', 'Moss and bark of Elderglen under the old trees.'),
  town('stonedeep_cape', 'Stonedeep Cape', 'stonedeep_thane', '#5a5a60', 'Granite and bronze of the dwarf-halls of Stonedeep.'),
  town('highmoor_cape', 'Highmoor Cape', 'highmoor_reeve', '#6a4a7a', 'Heather and cream of the hill town of Highmoor.'),
  town('millbrook_cape', 'Millbrook Cape', 'millbrook_elder', '#c8a040', 'Wheat and earth of the farming village of Millbrook.'),
  // --- boss drops (no stats: a trophy) ---------------------------------------------------------
  {
    id: 'ashen_sovereign_mantle', name: 'Mantle of the Ashen Sovereign', kind: 'boss', drop: { kind: 'boss_ashen_sovereign', chance: 0.04 }, value: 12000, rarity: 'legendary', tint: '#3a0a06',
    note: 'Torn from Vorthazul, the Ashen Sovereign. It still burns.',
  },
  {
    id: 'mountainborn_mantle', name: 'Mountainborn Mantle', kind: 'boss', drop: { kind: 'wb_mountain', chance: 0.05 }, value: 15000, rarity: 'legendary', tint: '#5a5a4a',
    note: 'Moss and stone from the back of Gorrumvald, the Mountain That Walks.',
  },
  {
    id: 'serpentstorm_cape', name: 'Serpentstorm Cape', kind: 'boss', drop: { kind: 'wb_storm_serpent', chance: 0.05 }, value: 15000, rarity: 'legendary', tint: '#1e5a6a',
    note: 'Shed skin of Vaelith, the Storm Serpent, crackling with her lightning.',
  },
  {
    id: 'blightsilk_shroud', name: 'Blightsilk Shroud', kind: 'boss', drop: { kind: 'wb_blight_mother', chance: 0.05 }, value: 15000, rarity: 'legendary', tint: '#2a3a1a',
    note: 'Spun by Nhalgrith, the Blight Mother. Shadows cling to it.',
  },
  // --- deeds -----------------------------------------------------------------------------------
  {
    id: 'tyrantbane_cape', name: 'Tyrantbane Cape', kind: 'deed', deed: 'dungeon_bosses', seller: 'aldric', price: 25000, value: 2500, rarity: 'rare', tint: '#7a1010',
    note: 'Only for those who have helped slay all ten dungeon bosses of the realm.',
  },
  {
    id: 'worldbreaker_mantle', name: 'Worldbreaker Mantle', kind: 'deed', deed: 'world_bosses', seller: 'aldric', price: 40000, value: 4000, rarity: 'legendary', tint: '#1a1a3a',
    note: 'Only for those who have fought and felled all three world bosses.',
  },
  // --- seasons ---------------------------------------------------------------------------------
  {
    id: 'frostfall_cape', name: 'Frostfall Cape', kind: 'season', season: { from: 12, to: 2, name: 'winter (December to February)' }, seller: 'brann', price: 5000, value: 500, rarity: 'uncommon', tint: '#9ad0f0',
    note: 'Sold only in winter, from December to February. Frost creeps over it.',
  },
  {
    id: 'harvestmoon_cape', name: 'Harvestmoon Cape', kind: 'season', season: { from: 9, to: 11, name: 'autumn (September to November)' }, seller: 'millbrook_elder', price: 5000, value: 500, rarity: 'uncommon', tint: '#c86a1a',
    note: 'Sold only in autumn, from September to November, under the harvest moon.',
  },
];

export const CAPE_BY_ID: Record<string, CapeDef> = Object.fromEntries(CAPES.map((c) => [c.id, c]));
export const CAPE_IDS: string[] = CAPES.map((c) => c.id);
/** Town capes, used to dress the test bots. */
export const TOWN_CAPES: string[] = CAPES.filter((c) => c.kind === 'town').map((c) => c.id);

export const DUNGEON_BOSS_KINDS: EnemyKind[] = [
  'boss_ironjaw', 'boss_bonebound', 'boss_delving_king', 'boss_labyrinth_lord', 'boss_venom_oracle',
  'boss_ember_matriarch', 'boss_sand_king', 'boss_mire_hydra', 'boss_rime_wyrm', 'boss_ashen_sovereign',
];
export const WORLD_BOSS_KINDS: EnemyKind[] = ['wb_mountain', 'wb_storm_serpent', 'wb_blight_mother'];

/** Item definitions for items.ts (kind 'cape', not stackable). */
export const CAPE_ITEM_SPECS: ItemSpec[] = CAPES.map((c) => ({
  id: c.id, name: c.name, kind: 'cape', weight: 8, value: c.value, rarity: c.rarity, tint: c.tint, icon: '⌂', note: c.note,
}));

/** Monster drops for enemyDefs.ts: kind → [item, chance]. */
export const CAPE_DROPS: Partial<Record<EnemyKind, Array<[string, number]>>> = {};
for (const c of CAPES) if (c.drop) (CAPE_DROPS[c.drop.kind] ??= []).push([c.id, c.drop.chance]);

/** What a character has, for the requirement checks (Game builds it from a session). */
export interface CapeContext {
  /** Level of any skill: combat skill level or trade skill level (1–99). */
  skillLevel(skill: CapeSkill): number;
  /** Boss kinds this character has helped slay. */
  bossKills: readonly string[];
  /** Wall clock, ms (seasons). */
  now: number;
}

function seasonOpen(c: CapeDef, now: number): boolean {
  if (!c.season) return true;
  const m = new Date(now).getUTCMonth() + 1;
  const { from, to } = c.season;
  return from <= to ? m >= from && m <= to : m >= from || m <= to;
}

const SKILL_LABEL: Record<CapeSkill, string> = {
  fist: 'fist fighting', club: 'club fighting', sword: 'sword fighting', axe: 'axe fighting', distance: 'distance fighting', shielding: 'shielding', magic: 'magic level',
  woodcutting: 'woodcutting', fishing: 'fishing', mining: 'mining', smithing: 'blacksmithing', fletching: 'fletching', crafting: 'crafting', cooking: 'cooking', firemaking: 'firemaking',
  agility: 'agility', herblore: 'herblore', thieving: 'thieving', slayer: 'slayer', farming: 'farming', hunter: 'hunter',
};

/**
 * Why this character may not wear (or, with `buying`, buy) this cape, or null.
 * Skill, mastery and deed capes ask for their skill levels or deeds to buy and to
 * wear; seasonal capes are only sold in their season (and can be worn all year).
 */
export function capeProblem(id: string, ctx: CapeContext, buying = false): string | null {
  const c = CAPE_BY_ID[id];
  if (!c) return null;
  if (c.kind === 'skill' && c.skill && c.level) {
    if (ctx.skillLevel(c.skill) < c.level) return c.skill === 'magic' ? `You need magic level ${c.level} for the ${c.name}.` : `You need ${SKILL_LABEL[c.skill]} level ${c.level} for the ${c.name}.`;
  }
  if (c.kind === 'mastery') {
    const short = TRADE.filter((s) => ctx.skillLevel(s) < TRADE_CAPE_LEVEL);
    if (short.length) return `The ${c.name} is only for masters of every trade. Still short of ${TRADE_CAPE_LEVEL}: ${short.map((s) => SKILL_LABEL[s]).join(', ')}.`;
    if (!hasCombatMastery(ctx)) return `The ${c.name} also asks for one fighting art at cape level: a weapon skill or shielding at ${COMBAT_CAPE_LEVEL}, or magic level ${MAGIC_CAPE_LEVEL}.`;
  }
  if (c.deed) {
    const need = c.deed === 'dungeon_bosses' ? DUNGEON_BOSS_KINDS : WORLD_BOSS_KINDS;
    const left = need.filter((k) => !ctx.bossKills.includes(k)).length;
    if (left) return `The ${c.name} is only for those who have slain all ${need.length} ${c.deed === 'dungeon_bosses' ? 'dungeon' : 'world'} bosses (${need.length - left}/${need.length} so far).`;
  }
  if (buying && c.season && !seasonOpen(c, ctx.now)) return `The ${c.name} is only sold in ${c.season.name}.`;
  return null;
}

const FIGHTING: CombatSkill[] = ['fist', 'club', 'sword', 'axe', 'distance', 'shielding'];
/** The fighting half of the Grandmaster's Mantle: any combat skill cape's threshold reached (every vocation can do it). */
function hasCombatMastery(ctx: CapeContext): boolean {
  return FIGHTING.some((s) => ctx.skillLevel(s) >= COMBAT_CAPE_LEVEL) || ctx.skillLevel('magic') >= MAGIC_CAPE_LEVEL;
}

/** Training multiplier the worn cape gives a skill (1 = none). */
export function capeTrainingBonus(capeId: string | null | undefined, sk: CapeSkill): number {
  const c = capeId ? CAPE_BY_ID[capeId] : undefined;
  if (!c) return 1;
  if (c.kind === 'skill' && c.skill === sk) return 1 + CAPE_TRAINING_BONUS;
  if (c.kind === 'mastery' && (TRADE as string[]).includes(sk)) return 1 + CAPE_TRAINING_BONUS;
  return 1;
}

/** One line for tooltips (describeItem): what the cape asks for and gives. */
export function capeSummary(id: string): string {
  const c = CAPE_BY_ID[id];
  if (!c) return '';
  const pct = Math.round(CAPE_TRAINING_BONUS * 100);
  if (c.kind === 'skill' && c.skill) return `${c.skill === 'magic' ? 'magic level' : SKILL_LABEL[c.skill]} ${c.level}+ · +${pct}% ${isTrade(c.skill) ? 'experience' : 'training'} in ${SKILL_LABEL[c.skill]}`;
  if (c.kind === 'mastery') return `every trade skill ${TRADE_CAPE_LEVEL} + one fighting art at cape level · +${pct}% experience in every trade skill`;
  if (c.deed) return c.deed === 'dungeon_bosses' ? 'slay all 10 dungeon bosses · decorative' : 'slay all 3 world bosses · decorative';
  if (c.season) return `sold in ${c.season.name} · decorative`;
  return 'decorative';
}

/** Records a boss this character helped slay (Game.killEnemy). Returns true when it was new. */
export function recordBossKill(kills: string[], kind: string): boolean {
  if (![...DUNGEON_BOSS_KINDS, ...WORLD_BOSS_KINDS].includes(kind as EnemyKind) || kills.includes(kind)) return false;
  kills.push(kind);
  return true;
}

/** Reads a save's boss kill list (unknown kinds are kept, in case they come back). */
export function parseBossKills(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((k): k is string => typeof k === 'string'))].slice(0, 64) : [];
}

interface NpcLike { sells?: Array<{ id: string; price: number }>; buys?: string[]; bank?: boolean }

/**
 * Puts the capes in the shops (npcs.ts, after the towns are generated): each seller
 * sells and buys back its capes; every banker buys every cape.
 */
export function applyCapeStock(npcs: Record<string, NpcLike>): void {
  for (const c of CAPES) {
    if (!c.seller || !c.price) continue;
    const n = npcs[c.seller];
    if (!n) continue;
    if (!(n.sells ?? []).some((e) => e.id === c.id)) n.sells = [...(n.sells ?? []), { id: c.id, price: c.price }];
    if (!(n.buys ?? []).includes(c.id)) n.buys = [...(n.buys ?? []), c.id];
  }
  for (const n of Object.values(npcs)) if (n.bank) n.buys = [...new Set([...(n.buys ?? []), ...CAPE_IDS])];
}

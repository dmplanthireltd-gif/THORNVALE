/**
 * Lists every content string the game shows players (names, notes, descriptions, quest and tutorial
 * texts, NPC greetings, region names…), grouped by kind. Used by scripts/i18n-test.ts (every one must
 * have a Polish and a Brazilian Portuguese translation) and by hand when adding content.
 *   npx tsx scripts/i18n/dump-content.ts [--json]
 */
import { ITEMS } from '../../src/game/inventory/items';
import { ENEMIES } from '../../src/game/enemies/enemyDefs';
import { SPELL_LIST } from '../../src/game/magic/spells';
import { NPCS } from '../../src/game/npc/npcs';
import { QUESTS } from '../../src/game/quests/quests';
import { TUTORIAL_STEPS } from '../../src/game/tutorial/tutorial';
import { SETS } from '../../src/game/inventory/sets';
import { CAPES } from '../../src/game/inventory/capes';
import { PET_DEFS } from '../../src/game/pets/petDefs';
import { FERRIES, TOWNS } from '../../src/game/world/townList';
import { NONCOMBAT_SKILLS, PLANNED_SKILLS } from '../../src/game/gathering/skills';
import { SKILL_NAMES } from '../../src/game/player/skills';
import { VOCATIONS } from '../../src/game/player/vocations';
import { RECIPES, STATIONS } from '../../src/game/production/recipes';
import { buildWorld } from '../../src/game/world/worldGen';

export type ContentKind = 'name' | 'text';
export interface ContentString { kind: ContentKind; group: string; text: string }

/** Every content string: `name` = a proper/common name (names dictionary), `text` = a sentence (texts). */
export function contentStrings(withWorld = true): ContentString[] {
  const out: ContentString[] = [];
  const add = (kind: ContentKind, group: string, text: string | undefined | null) => {
    if (text && /[A-Za-z]/.test(text)) out.push({ kind, group, text });
  };
  for (const d of Object.values(ITEMS)) { add('name', 'item', d.name); add('text', 'item note', d.note); }
  for (const d of Object.values(ENEMIES)) {
    add('name', 'monster', d.name);
    add('name', 'monster title', d.title);
    for (const a of d.abilities) add('name', 'ability', a.name);
    if (d.herald) { add('text', 'herald', d.herald.spawn); add('text', 'herald', d.herald.kill); }
  }
  for (const s of SPELL_LIST) { add('name', 'spell', s.name); add('text', 'spell description', s.description); }
  for (const n of Object.values(NPCS)) { add('name', 'npc', n.name); add('name', 'npc role', n.role); add('text', 'greeting', n.greeting); for (const t of n.travel ?? []) add('name', 'place', t.name); }
  for (const q of QUESTS) {
    add('name', 'quest', q.title); add('name', 'quest target', q.targetName);
    add('text', 'quest', q.offer); add('text', 'quest', q.progress); add('text', 'quest', q.complete);
  }
  for (const s of TUTORIAL_STEPS) { add('name', 'tutorial', s.title); add('text', 'tutorial', s.hint); add('text', 'tutorial', s.guide); }
  for (const s of SETS) { add('name', 'set', `${s.name} set`); add('text', 'set source', s.source); }
  for (const c of CAPES) { add('name', 'cape', c.name); add('text', 'cape note', c.note); add('name', 'season', c.season?.name); }
  for (const p of PET_DEFS) { add('name', 'pet', p.name); add('name', 'pet species', p.species); add('text', 'pet perk', p.perk); add('text', 'pet source', p.source); }
  for (const t of TOWNS) { add('name', 'town', t.name); add('text', 'town flavour', t.flavour); }
  for (const f of FERRIES) add('name', 'place', f.name);
  for (const s of NONCOMBAT_SKILLS) { add('name', 'skill', s.name); add('text', 'skill hint', s.hint); }
  for (const s of PLANNED_SKILLS) add('name', 'skill', s.name);
  for (const n of Object.values(SKILL_NAMES)) add('name', 'skill', n);
  for (const v of Object.values(VOCATIONS)) { add('name', 'vocation', v.name); add('text', 'vocation', v.blurb); }
  for (const s of Object.values(STATIONS)) { add('name', 'station', s.title); add('text', 'station note', s.note); }
  for (const r of RECIPES) { add('name', 'recipe group', r.group); add('name', 'recipe', r.label); }
  if (withWorld) {
    const w = buildWorld();
    for (const r of w.regions) add('name', 'region', r.name);
  }
  // unique per kind + text
  const seen = new Set<string>();
  return out.filter((c) => { const k = `${c.kind}|${c.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

if (process.argv[1]?.endsWith('dump-content.ts')) {
  const all = contentStrings(!process.argv.includes('--no-world'));
  if (process.argv.includes('--json')) console.log(JSON.stringify(all, null, 1));
  else for (const c of all) console.log(`${c.kind}\t${c.group}\t${c.text}`);
}

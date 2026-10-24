/**
 * Language checks (EN / PL / PT-BR), run with `npm run test:i18n` (part of test:logic):
 *   1. every UI string the client translates (`t('…')`, `k('…')` and the label helpers) has a Polish
 *      and a Brazilian Portuguese entry, and no English-looking text in the UI files was left out;
 *   2. every content string (items, monsters, spells, NPCs, quests, tutorial, regions…) has both;
 *   3. every message the game sends (Game.msg & co., extracted from src/game and server/) translates;
 *   4. placeholders match the English key, plural forms are complete (pl one|few|many, pt one|other);
 *   5. the plural rules, number formats and the text translator behave.
 *   npx tsx scripts/i18n-test.ts [--list]   (--list prints what is missing, ready to paste)
 */
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fmtNum, lookup, pluralForm, placeholders, rowOf, setLang, t, type Row } from '../src/i18n/i18n';
import { canTranslate, rowsOf, trName, trText } from '../src/i18n/gameText';
import '../src/i18n/load';
import { contentStrings } from './i18n/dump-content';
import { extract, sourceFiles } from './i18n/extract';
import { SKIP_MESSAGES } from './i18n/skip';
import { aliasKeywords } from '../src/game/npc/keywords';

let failures = 0;
const missing: Record<string, Set<string>> = { ui: new Set(), names: new Set(), texts: new Set(), messages: new Set() };
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${what}`);
  }
};
const root = process.cwd();
const LIST = process.argv.includes('--list');

// ---------------------------------------------------------------- 1. UI strings
/** Helpers that translate their string arguments themselves (`sec('Display')` → t('Display')). */
const LABEL_HELPERS = new Set(['t', 'k', 'sec', 'layBtn', 'fb', 'numRow', 'makeWin', 'slider', 'pick', 'row', 'stepper', 'swatches', 'field', 'make']);
const UI_FILES = sourceFiles(root, ['src/ui', 'src/main.ts', 'src/i18n/describe.ts', 'src/render/Overlay.ts', 'src/render/Renderer.ts', 'src/input/Input.ts']);

function uiKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of UI_FILES) {
    const src = readFileSync(file, 'utf8');
    if (!/\bt\(|\bk\(/.test(src)) continue;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
    const lits = (n: ts.Node, out: string[]) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
      else if (ts.isConditionalExpression(n)) { lits(n.whenTrue, out); lits(n.whenFalse, out); }
      else if (ts.isParenthesizedExpression(n)) lits(n.expression, out);
      else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.BarBarToken) { lits(n.left, out); lits(n.right, out); }
    };
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression;
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword ? callee.name.text : '';
        if (LABEL_HELPERS.has(name)) {
          const out: string[] = [];
          const args = name === 't' || name === 'k' ? n.arguments.slice(0, 1) : n.arguments;
          for (const a of args) lits(a, out);
          for (const s of out) if (/[A-Za-z]/.test(s) && !/^[a-z]+(-[a-z]+)*( [a-z-]+)*$/.test(s) || name === 't' || name === 'k') keys.set(s, `${file.replace(root + '/', '')}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return keys;
}

console.log('UI strings');
const ui = uiKeys();
// keys only known at run time: element names, sound groups, graphics levels, rate presets, spell parameters
// (read from the source: those modules use browser types the test's tsconfig does not have)
for (const e of ['physical', 'fire', 'energy', 'ice', 'earth', 'death', 'holy', 'poison']) ui.set(e, 'element');
for (const m of readFileSync(join(root, 'src/audio/Sfx.ts'), 'utf8').matchAll(/\{ id: '\w+', name: '([^']+)', hint: '([^']+)' \}/g)) { ui.set(m[1], 'audio/Sfx.ts'); ui.set(m[2], 'audio/Sfx.ts'); }
for (const m of (readFileSync(join(root, 'src/render/graphics.ts'), 'utf8').match(/GRAPHICS_NAMES[^=]*= \{([^}]*)\}/)?.[1] ?? '').matchAll(/'([^']+)'/g)) ui.set(m[1], 'render/graphics.ts');
for (const n of ['season', 'classic', 'name', 'creature']) ui.set(n, 'stages / spell params');
let uiOk = 0;
for (const [key, where] of ui) {
  if (!/[A-Za-z]/.test(key)) continue;
  const row = rowOf(key);
  if (!row || !row[0] || !row[1]) {
    missing.ui.add(key);
    if (!LIST) check(false, `UI string has no translation: "${key}" (${where})`);
    else failures++;
  } else uiOk++;
}
console.log(`  ${uiOk} of ${ui.size} UI strings translated`);

// ---------------------------------------------------------------- 2. content
console.log('Content strings');
const content = contentStrings(true);
let contentOk = 0;
for (const c of content) {
  const ok = c.kind === 'name' ? trName(c.text, 'pl') !== c.text || rowsOf('names').some(([k]) => k === c.text.toLowerCase()) : canTranslate(c.text, 'pl') && canTranslate(c.text, 'pt-BR');
  if (ok) contentOk++;
  else {
    missing[c.kind === 'name' ? 'names' : 'texts'].add(c.text);
    if (!LIST) check(false, `${c.group} has no translation: "${c.text}"`);
    else failures++;
  }
}
console.log(`  ${contentOk} of ${content.length} content strings translated`);

// ---------------------------------------------------------------- 3. game messages
console.log('Game messages');
const MSG_FILES = sourceFiles(root, [
  'src/game/Game.ts', 'src/game/pets/PetSystem.ts', 'src/game/exchange/ExchangeSystem.ts', 'src/game/bosses/WorldEvents.ts', 'src/game/bosses/bosses.ts', 'src/game/npc/dialogue.ts',
  'src/game/inventory/capes.ts', 'src/game/progression/stages.ts', 'src/game/net/protocol.ts', 'src/client/Controller.ts', 'server/server.ts',
  'src/game/trades',
  // world events and task boards (liveops/commands.ts holds test-command replies, which stay English)
  'src/game/liveops/tasks.ts', 'src/game/liveops/TaskSystem.ts', 'src/game/liveops/LiveEvents.ts', 'src/game/liveops/festivals.ts', 'src/game/liveops/liveNpcs.ts',
  'src/game/liveops/liveItems.ts', 'src/game/liveops/calendar.ts',
]);
const SAMPLE = 'Xq7';
let msgOk = 0, msgAll = 0;
const seen = new Set<string>();
for (const f of extract(MSG_FILES)) {
  const tx = f.text;
  if (seen.has(tx) || SKIP_MESSAGES.has(tx)) continue;
  seen.add(tx);
  // whole messages only: a capital or a placeholder first, a full stop/!/?/… or ) at the end
  if (!/^[A-Z{"]/.test(tx) || !/[.!?…)]$/.test(tx)) continue;
  msgAll++;
  const sample = tx.replace(/\{[A-Za-z0-9_]+\}/g, SAMPLE);
  if (canTranslate(sample, 'pl') && canTranslate(sample, 'pt-BR')) msgOk++;
  else {
    missing.messages.add(tx);
    if (!LIST) check(false, `message has no translation: "${tx}" (${f.file.replace(root + '/', '')}:${f.line})`);
    else failures++;
  }
}
console.log(`  ${msgOk} of ${msgAll} game messages translated`);

// ---------------------------------------------------------------- 4. table shape
console.log('Placeholders and plural forms');
const shape = (key: string, row: Row, kind: string) => {
  const want = new Set(placeholders(key));
  for (const [i, tr] of row.entries()) {
    const lang = i === 0 ? 'pl' : 'pt-BR';
    if (!tr) { check(false, `${kind} "${key}": empty ${lang}`); continue; }
    for (const p of placeholders(tr)) check(want.has(p), `${kind} "${key}": ${lang} uses {${p}} which the English text does not have`);
    const forms = tr.split('|').length;
    const en = key.replace(/\[[^\]]*\]/g, '').split('|').length;
    if (forms > 1 || en > 1) check(lang === 'pl' ? forms === 3 : forms === 2, `${kind} "${key}": ${lang} needs ${lang === 'pl' ? 'one|few|many' : 'one|other'} forms`);
  }
};
for (const [k, r] of ui) { void r; const row = rowOf(k); if (row) shape(k, row, 'ui'); }
for (const [k, r] of rowsOf('messages')) shape(k, r, 'message');
for (const [k, r] of rowsOf('texts')) shape(k, r, 'text');

// ---------------------------------------------------------------- 5. behaviour
console.log('Rules');
check(pluralForm(1, 'pl') === 'one' && pluralForm(3, 'pl') === 'few' && pluralForm(5, 'pl') === 'many' && pluralForm(12, 'pl') === 'many' && pluralForm(22, 'pl') === 'few' && pluralForm(112, 'pl') === 'many', 'Polish plural rule');
check(pluralForm(0, 'pt-BR') === 'one' && pluralForm(1, 'pt-BR') === 'one' && pluralForm(2, 'pt-BR') === 'other', 'Portuguese plural rule');
check(fmtNum(1240, 1, 'en') === '1,240' && fmtNum(1240.5, 1, 'pt-BR') === '1.240,5' && fmtNum(12400, 1, 'pl').replace(/\s/g, ' ') === '12 400', 'number formats');
setLang('pl');
check(t('{n} day|{n} days', { n: 1 }) === '1 dzień' && t('{n} day|{n} days', { n: 3 }) === '3 dni' && t('{n} day|{n} days', { n: 5 }) === '5 dni', 'Polish plural in t()');
check(trName('Plate Armour') === 'Zbroja płytowa', 'names: Plate Armour in Polish');
check(trText('Your backpack is full.') !== 'Your backpack is full.', 'messages: backpack full in Polish');
check(/szczur/i.test(trText('You see a rat.')) || /szczur/i.test(trText('Loot of a rat: 3 gold.')), 'messages: monster names inside a template');
setLang('pt-BR');
check(t('{n} day|{n} days', { n: 2 }) === '2 dias', 'Portuguese plural in t()');
check(trName('Plate Armour') === 'Armadura de Placas', 'names: Plate Armour in Portuguese');
setLang('en');
check(t('{n} day|{n} days', { n: 1 }) === '1 day' && t('{n} day|{n} days', { n: 4 }) === '4 days', 'English plural in t()');
check(trText('Your backpack is full.') === 'Your backpack is full.', 'English text is never changed');
check(lookup('Settings', 'pl') === 'Ustawienia', 'lookup');
// NPC keywords: English and translated words both work
check(aliasKeywords('handel') === 'trade' && aliasKeywords('negociar') === 'trade' && aliasKeywords('tak') === 'yes' && aliasKeywords('sim') === 'yes' && aliasKeywords('hi') === 'hi' && aliasKeywords('cześć') === 'hi' && aliasKeywords('oi') === 'hi', 'NPC keywords in three languages');

if (LIST) {
  for (const [k, set] of Object.entries(missing)) {
    if (!set.size) continue;
    console.log(`\n// ---- missing ${k} (${set.size})`);
    for (const s of set) console.log(`  ${JSON.stringify(s)}: ['', ''],`);
  }
}
console.log(failures === 0 ? '\nAll language checks passed.' : `\n${failures} language check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

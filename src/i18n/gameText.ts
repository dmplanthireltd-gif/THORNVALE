/**
 * Translates English text made by the game (server messages, NPC lines, quest and tutorial texts,
 * item/monster/place names) into the player's language on the client. The game keeps sending plain
 * English (so old clients, logs and tests are unchanged, and the network protocol did not change);
 * each client turns it into its own language, so players on one server can each use another.
 *
 * Three kinds of entries (all keyed by the exact English text):
 *   - texts     whole sentences: `registerTexts({ 'The chest is empty.': ['Skrzynia jest pusta.', 'O baú está vazio.'] })`
 *   - messages  templates with {placeholders}, `[a|an]` alternatives: 'You catch [a|an] {item}.'
 *               Each placeholder's value is translated too (names, stacks like "3 health potions", lists).
 *   - names     item, monster, NPC, place… names (`registerNames`), matched without case.
 * Anything unknown stays English. scripts/i18n-test.ts checks every game string has an entry.
 */
import { fill, fmtNum, getLang, lookup, pickForm, type Lang, type Params, type Row, type Table } from './i18n';

const texts = new Map<string, Row>();
const names = new Map<string, Row>();
interface Template { key: string; re: RegExp; params: string[]; row: Row; weight: number; letters: number }
const templates: Template[] = [];
let sorted = true;
const cache = new Map<string, string>();

export function registerTexts(t: Table): void {
  for (const [k, v] of Object.entries(t)) texts.set(k, v);
  cache.clear();
}

/** The English spelling of each name (lower-case key → original), to keep its proper words capitalised. */
const englishOf = new Map<string, string>();

export function registerNames(t: Table): void {
  for (const [k, v] of Object.entries(t)) {
    names.set(k.toLowerCase(), v);
    englishOf.set(k.toLowerCase(), k);
  }
  cache.clear();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compiles 'You catch [a|an] {item}.' into an anchored pattern. */
export function compileTemplate(key: string): { re: RegExp; params: string[]; weight: number; letters: number } {
  const params: string[] = [];
  let re = '';
  let weight = 0;
  let letters = 0;
  const parts = key.split(/(\{[A-Za-z0-9_]+\}|\[[^\]]*\|[^\]]*\])/);
  for (const part of parts) {
    if (!part) continue;
    if (/^\{[A-Za-z0-9_]+\}$/.test(part)) {
      params.push(part.slice(1, -1));
      re += '(.+?)';
    } else if (/^\[.*\|.*\]$/.test(part)) {
      const alts = part.slice(1, -1).split('|');
      re += `(?:${alts.map(escapeRe).join('|')})`;
      weight += Math.min(...alts.map((a) => a.length));
    } else {
      re += escapeRe(part);
      weight += part.length;
      letters += (part.match(/\p{L}/gu) ?? []).length;
    }
  }
  return { re: new RegExp(`^${re}$`, 's'), params, weight, letters };
}

export function registerMessages(t: Table): void {
  for (const [key, row] of Object.entries(t)) {
    const c = compileTemplate(key);
    const old = templates.findIndex((x) => x.key === key);
    const entry = { key, row, ...c };
    if (old >= 0) templates[old] = entry;
    else templates.push(entry);
  }
  sorted = false;
  cache.clear();
}

export function hasText(s: string): boolean {
  return texts.has(s);
}
export function hasName(s: string): boolean {
  return names.has(s.toLowerCase());
}
export function messageKeys(): string[] {
  return templates.map((x) => x.key);
}
export function textKeys(): string[] {
  return [...texts.keys()];
}
export function nameKeys(): string[] {
  return [...names.keys()];
}
export function rowsOf(kind: 'texts' | 'names' | 'messages'): Array<[string, Row]> {
  if (kind === 'texts') return [...texts.entries()];
  if (kind === 'names') return [...names.entries()];
  return templates.map((x) => [x.key, x.row]);
}

const pick = (row: Row, l: Lang): string => (l === 'pl' ? row[0] : row[1]);

/** A name in the language ("Plate Armor" → "Zbroja płytowa"); unknown names stay as they are. */
export function trName(name: string, l: Lang = getLang()): string {
  if (l === 'en' || !name) return name;
  const row = names.get(name.toLowerCase());
  if (!row) return name;
  let out = pick(row, l);
  // the game lower-cases names inside sentences ("You get some pine logs"): follow it unless the
  // translation starts with a proper noun
  // (only plain lower-case names: "the Mistwood" is still a place name)
  // every word is lower-cased except the proper names kept from the English ("Amulet Hearthward", "Capa de Thornvale")
  if (/^[a-z]/.test(name) && !/[A-Z]/.test(name) && /\p{Lu}/u.test(out)) {
    const en = new Set((englishOf.get(name.toLowerCase()) ?? '').split(/[\s,]+/));
    out = out.split(' ').map((w) => (en.has(w) && /^[A-Z]/.test(w) ? w : w.toLocaleLowerCase(l))).join(' ');
  }
  return out;
}

const STACK_ONE = /^(?:a|an|one|the) (.+)$/i;
const STACK_MANY = /^(\d[\d,]*) (.+)$/;
const NUMBER = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/;
const GOLD: Record<Exclude<Lang, 'en'>, string> = { pl: '{n} złota', 'pt-BR': '{n} de ouro' };
const AND: Record<Exclude<Lang, 'en'>, string> = { pl: ' i ', 'pt-BR': ' e ' };
const OR: Record<Exclude<Lang, 'en'>, string> = { pl: ' lub ', 'pt-BR': ' ou ' };

function toNumber(s: string): number | null {
  return NUMBER.test(s.trim()) ? Number(s.trim().replace(/,/g, '')) : null;
}

/** One item stack or name as the game writes it: "a health potion", "3 health potions", "12 gold". */
function trStack(s: string, l: Exclude<Lang, 'en'>): string | null {
  if (hasName(s)) return trName(s, l);
  const one = STACK_ONE.exec(s);
  if (one && hasName(one[1])) return trName(one[1], l);
  const many = STACK_MANY.exec(s);
  if (many) {
    const n = Number(many[1].replace(/,/g, ''));
    const what = many[2];
    if (what === 'gold' || what === 'gold coins') return fill(GOLD[l], { n }, l);
    const base = hasName(what) ? what : what.endsWith('s') && hasName(what.slice(0, -1)) ? what.slice(0, -1) : what.endsWith('es') && hasName(what.slice(0, -2)) ? what.slice(0, -2) : null;
    if (base) return `${fmtNum(n, 1, l)}× ${trName(base, l)}`;
  }
  return null;
}

/** "a sword, 3 arrows and 12 gold" → each part translated, joined the language's way ("or" lists too). */
function trList(s: string, l: Exclude<Lang, 'en'>, depth: number): string | null {
  const joiner = s.includes(' and ') ? ' and ' : s.includes(' or ') ? ' or ' : null;
  if (!s.includes(', ') && !joiner) return null;
  const parts = s.split(joiner ? new RegExp(`, |${joiner}`) : /, /);
  if (parts.length < 2) return null;
  const out: string[] = [];
  for (const p of parts) {
    const tr = trStack(p, l) ?? (depth < 3 ? translateIn(p, l, depth + 1, false) : null);
    if (tr === null) return null;
    out.push(tr);
  }
  if (!joiner) return out.join(', ');
  return `${out.slice(0, -1).join(', ')}${(joiner === ' and ' ? AND : OR)[l]}${out[out.length - 1]}`;
}

function ensureSorted(): void {
  if (sorted) return;
  templates.sort((a, b) => b.weight - a.weight);
  sorted = true;
}

/** A value captured by a template: numbers get the language's format, names and stacks are translated. */
function trParam(v: string, l: Exclude<Lang, 'en'>, depth: number): string | number {
  const n = toNumber(v);
  if (n !== null) return n;
  if (!v.trim()) return v;
  return translateIn(v, l, depth + 1, false) ?? v;
}

/** Code that recognises a kind of text itself (e.g. item descriptions, ui/describe.ts) → translation or null. */
const specials: Array<(s: string, l: Exclude<Lang, 'en'>) => string | null> = [];
export function registerSpecial(f: (s: string, l: Exclude<Lang, 'en'>) => string | null): void {
  specials.push(f);
  cache.clear();
}

function exact(s: string, l: Exclude<Lang, 'en'>): string | null {
  const ex = texts.get(s);
  if (ex) return pick(ex, l);
  // the same sentence may live in the client's own table (server and client share some errors)
  const ui = lookup(s, l);
  if (ui && !ui.includes('|')) return ui;
  // the game sometimes capitalises a phrase it also uses inside sentences ("The walled city of Westmarch")
  const lower = s.length > 1 ? s[0].toLowerCase() + s.slice(1) : s;
  if (lower !== s) {
    const ex2 = texts.get(lower);
    if (ex2) {
      const t = pick(ex2, l);
      return t[0].toLocaleUpperCase(l) + t.slice(1);
    }
  }
  return null;
}

/** Returns the translation, or null when nothing matched (strict) / the text itself (loose). */
function translateIn(s: string, l: Exclude<Lang, 'en'>, depth: number, loose: boolean): string | null {
  const ex = exact(s, l);
  if (ex !== null) return ex;
  const st = trStack(s, l);
  if (st !== null) return st;
  for (const f of specials) {
    const r = f(s, l);
    if (r !== null) return r;
  }
  if (depth > 4) return loose ? s : null;
  // a bare list ("level 1–50 ×10, level 51–100 ×6") is split before templates can swallow it whole
  if (s.includes(', ') && !/[.!?…]$/.test(s)) {
    const list = trList(s, l, depth);
    if (list !== null) return list;
  }
  ensureSorted();
  for (const tp of templates) {
    const m = tp.re.exec(s);
    if (!m) continue;
    const p: Params = {};
    // templates that are almost only placeholders ("{guide} ({hint})") apply only when every part translates
    const strictParams = tp.letters < 3;
    let ok = true;
    tp.params.forEach((k, i) => {
      const v = m[i + 1];
      if (strictParams && toNumber(v) === null && translateIn(v, l, depth + 1, false) === null) ok = false;
      p[k] = trParam(v, l, depth);
    });
    if (!ok) continue;
    const raw = pick(tp.row, l);
    const count = Object.values(p).find((x): x is number => typeof x === 'number');
    const pn = typeof p.n === 'number' ? p.n : count ?? 1;
    return fill(raw.includes('|') ? pickForm(raw, pn, l) : raw, p, l);
  }
  const list = trList(s, l, depth);
  if (list !== null) return list;
  // several sentences: translate each one on its own (strict: all of them must translate)
  const parts = s.split(/(?<=[.!?…])\s+(?=[A-Z"])/);
  if (parts.length > 1) {
    let any = false, all = true;
    const out = parts.map((p) => {
      const tr = translateIn(p, l, depth + 1, false);
      if (tr !== null) any = true;
      else all = false;
      return tr ?? p;
    });
    if (loose ? any : all) return out.join(' ');
  }
  return loose ? s : null;
}

/** Translates any text the game produced; unknown text is returned unchanged. */
export function trText(s: string, l: Lang = getLang()): string {
  if (l === 'en' || !s) return s;
  const k = `${l}\u0000${s}`;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  let out = translateIn(s, l, 0, true) ?? s;
  // keep a capital at the start of a line
  if (/^\p{Lu}/u.test(s) && /^\p{Ll}/u.test(out)) out = out[0].toLocaleUpperCase(l) + out.slice(1);
  if (cache.size > 4000) cache.clear();
  cache.set(k, out);
  return out;
}

/** True when the text has a translation (tests). */
export function canTranslate(s: string, l: Exclude<Lang, 'en'> = 'pl'): boolean {
  return translateIn(s, l, 0, false) !== null;
}

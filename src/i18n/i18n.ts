/**
 * Thornvale's tiny localisation core (no dependencies, no DOM: it also runs in Node for tests).
 *
 * Languages: English (`en`, the default and the fallback), Polish (`pl`) and Brazilian Portuguese
 * (`pt-BR`). Every string is keyed by its English text, so the code stays readable and English needs
 * no table:
 *
 *   t('Settings')                          → 'Ustawienia'
 *   t('Weather: {q}', { q: 'High' })      → 'Pogoda: High' (params are filled in, numbers formatted)
 *   t('{n} day|{n} days', { n: 3 })       → '3 dni' (English forms split by "|": one|other)
 *
 * Translations live in tables (`register`): `{ 'English key': ['polski', 'português'] }`. A plural
 * entry holds its forms split by "|": Polish one|few|many (1 dzień | 2 dni | 5 dni), Portuguese
 * one|other. The count is the `n` param (or the first number given). See BIBLE §11 "Languages".
 */

export type Lang = 'en' | 'pl' | 'pt-BR';
export const LANGS: Lang[] = ['en', 'pl', 'pt-BR'];
/** How each language names itself (language pickers). */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', pl: 'Polski', 'pt-BR': 'Português (Brasil)' };
/** Short labels for the language buttons. */
export const LANG_SHORT: Record<Lang, string> = { en: 'EN', pl: 'PL', 'pt-BR': 'PT-BR' };
const LOCALE: Record<Lang, string> = { en: 'en-GB', pl: 'pl-PL', 'pt-BR': 'pt-BR' };

/** One translation: plain text, or plural forms split by "|". */
export type Tr = string;
/** A table row: [Polish, Brazilian Portuguese]. */
export type Row = readonly [pl: Tr, pt: Tr];
export type Table = Record<string, Row>;
export type Params = Record<string, string | number>;

let lang: Lang = 'en';
const listeners: Array<(l: Lang) => void> = [];
const table = new Map<string, Row>();

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'pl' || v === 'pt-BR';
}

export function getLang(): Lang {
  return lang;
}

/** Switches the language for everything translated from now on (listeners redraw what is on screen). */
export function setLang(l: Lang): void {
  if (!isLang(l) || l === lang) return;
  lang = l;
  for (const f of listeners) f(l);
}

export function onLangChange(f: (l: Lang) => void): () => void {
  listeners.push(f);
  return () => {
    const i = listeners.indexOf(f);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** Adds translation rows (later tables win). */
export function register(t: Table): void {
  for (const [k, v] of Object.entries(t)) table.set(k, v);
}

/** The raw row for an English key (tests and the game-text translator). */
export function rowOf(key: string): Row | undefined {
  return table.get(key);
}

export function allKeys(): string[] {
  return [...table.keys()];
}

/** Best language for a browser's language list (first visit). */
export function detectLang(prefs: readonly string[] | undefined): Lang {
  for (const p of prefs ?? []) {
    const l = p.toLowerCase();
    if (l.startsWith('pl')) return 'pl';
    if (l.startsWith('pt')) return 'pt-BR';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

// ---------------------------------------------------------------- plurals and numbers

export type PluralForm = 'one' | 'few' | 'many' | 'other';

/** CLDR plural category of a count in a language (integers; fractions take "other"/"many"). */
export function pluralForm(n: number, l: Lang = lang): PluralForm {
  const i = Math.abs(Math.trunc(n));
  const int = Number.isInteger(n);
  if (l === 'pl') {
    if (!int) return 'other';
    if (i === 1) return 'one';
    const d = i % 10, h = i % 100;
    if (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) return 'few';
    return 'many';
  }
  if (l === 'pt-BR') return i === 0 || i === 1 ? 'one' : 'other';
  return i === 1 && int ? 'one' : 'other';
}

/** Picks one of "|"-separated forms: en/pt one|other, pl one|few|many. */
export function pickForm(forms: string, n: number, l: Lang = lang): string {
  if (!forms.includes('|')) return forms;
  const parts = forms.split('|');
  const f = pluralForm(n, l);
  if (l === 'pl') return f === 'one' ? parts[0] : f === 'few' ? parts[1] ?? parts[0] : f === 'many' ? parts[2] ?? parts[1] ?? parts[0] : parts[1] ?? parts[0];
  return f === 'one' ? parts[0] : parts[1] ?? parts[0];
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(l: Lang, decimals: number): Intl.NumberFormat {
  const k = `${l}|${decimals}`;
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE[l], { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    fmtCache.set(k, f);
  }
  return f;
}

/** A number with the language's thousands separator (1,240 · 1 240 · 1.240) and decimal mark. */
export function fmtNum(n: number, decimals = 1, l: Lang = lang): string {
  if (!Number.isFinite(n)) return String(n);
  return nf(l, decimals).format(n);
}

// ---------------------------------------------------------------- translation

const PH = /\{([A-Za-z0-9_]+)\}/g;

/** Fills {placeholders}; numbers get the language's number format. */
export function fill(s: string, p?: Params, l: Lang = lang): string {
  if (!p) return s;
  return s.replace(PH, (m, k: string) => {
    const v = p[k];
    if (v === undefined) return m;
    return typeof v === 'number' ? fmtNum(v, 1, l) : v;
  });
}

function countOf(p?: Params): number {
  if (!p) return 1;
  if (typeof p.n === 'number') return p.n;
  for (const v of Object.values(p)) if (typeof v === 'number') return v;
  return 1;
}

/** The translation of an English key in a language, or null (tests, game texts). */
export function lookup(key: string, l: Lang = lang): string | null {
  if (l === 'en') return null;
  const row = table.get(key);
  if (!row) return null;
  return l === 'pl' ? row[0] : row[1];
}

/**
 * Translates an English UI string. Unknown keys fall back to the English text, so a missing entry
 * never breaks the screen (scripts/i18n-test.ts makes sure there are none).
 */
export function t(key: string, p?: Params): string {
  return tIn(lang, key, p);
}

export function tIn(l: Lang, key: string, p?: Params): string {
  const tr = lookup(key, l) ?? key;
  const src = tr.includes('|') ? pickForm(tr, countOf(p), l === 'en' || tr === key ? 'en' : l) : tr;
  return fill(src, p, l);
}

/**
 * Marks an English string for translation without translating it yet (labels kept in tables and
 * translated where they are shown with `t(label)`). scripts/i18n-test.ts collects these.
 */
export function k<T extends string>(s: T): T {
  return s;
}

/** Every {placeholder} name in a string. */
export function placeholders(s: string): string[] {
  return [...s.matchAll(PH)].map((m) => m[1]);
}

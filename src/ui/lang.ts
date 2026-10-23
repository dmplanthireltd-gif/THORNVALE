import { allKeys, detectLang, getLang, isLang, LANG_NAMES, LANG_SHORT, LANGS, lookup, onLangChange, setLang, type Lang } from '../i18n/i18n';
import { el } from './dom';
import '../i18n/load';
import './lang.css';

/**
 * The browser side of languages: the choice is remembered in localStorage (`thornvale.lang`); on the
 * first visit the browser's language decides (Polish → PL, Portuguese → PT-BR, else English).
 */
const KEY = 'thornvale.lang';

export function initLang(): Lang {
  let l: Lang = 'en';
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) l = saved;
    else l = detectLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
  } catch {
    l = detectLang(typeof navigator !== 'undefined' ? [navigator.language] : []);
  }
  setLang(l);
  document.documentElement.lang = l;
  return l;
}

export function chooseLang(l: Lang): void {
  const old = getLang();
  try { localStorage.setItem(KEY, l); } catch { /* storage off: this visit only */ }
  document.documentElement.lang = l;
  if (old === l) return;
  setLang(l);
  relabel(document.body, old, l);
}

/**
 * Re-translates the fixed labels already on screen (built once in English keys): every text node,
 * title, placeholder and aria-label whose text is a known translation in the old language is
 * swapped for the new one. Lists and windows that redraw themselves pick the language up anyway.
 */
export function relabel(root: HTMLElement, from: Lang, to: Lang): void {
  const back = reverseMap(from);
  const tr = (s: string): string | null => {
    const key = from === 'en' ? s : back.get(s);
    if (key === undefined) return null;
    if (to === 'en') return key;
    const t = lookup(key, to);
    return t && !t.includes('|') ? t : key;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const raw = n.nodeValue ?? '';
      const s = raw.trim();
      if (!s) continue;
      const r = tr(s);
      if (r !== null && r !== s) n.nodeValue = raw.replace(s, r);
    } else if (n instanceof HTMLElement) {
      for (const a of ['title', 'placeholder', 'aria-label']) {
        const v = n.getAttribute(a);
        if (!v) continue;
        const r = tr(v);
        if (r !== null && r !== v) n.setAttribute(a, r);
      }
    }
  }
}

const reverseCache = new Map<Lang, Map<string, string>>();
function reverseMap(l: Lang): Map<string, string> {
  let m = reverseCache.get(l);
  if (m) return m;
  m = new Map();
  if (l !== 'en') {
    for (const key of allKeys()) {
      const t = lookup(key, l);
      if (t && !t.includes('|')) m.set(t, key);
    }
  }
  reverseCache.set(l, m);
  return m;
}


/** EN / PL / PT-BR buttons (title screen, Settings). `onPick` runs after the switch. */
export function langPicker(parent: HTMLElement, cls = 'lang-pick', onPick?: (l: Lang) => void): HTMLDivElement {
  const box = el('div', cls, parent);
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Language');
  const btns: Array<[HTMLButtonElement, Lang]> = [];
  const mark = () => { for (const [b, l] of btns) { b.classList.toggle('on', l === getLang()); b.setAttribute('aria-pressed', String(l === getLang())); } };
  for (const l of LANGS) {
    const b = el('button', 'lang-btn', box, LANG_SHORT[l]);
    b.type = 'button';
    b.title = LANG_NAMES[l];
    b.lang = l;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      chooseLang(l);
      onPick?.(l);
      b.blur();
    });
    btns.push([b, l]);
  }
  mark();
  onLangChange(mark);
  return box;
}

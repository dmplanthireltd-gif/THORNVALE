import { DEFAULT_OUTFIT, OUTFIT_TYPES, PALETTE, type Outfit, type OutfitType } from '../game/player/outfits';
import { VOCATIONS, VOCATION_IDS, type Vocation } from '../game/player/vocations';
import type { SaveSystem } from '../game/save/SaveSystem';
import { button, el } from './dom';
import { OutfitPreview } from './OutfitPreview';

export type StartChoice =
  | { mode: 'continue' }
  | { mode: 'new'; name: string; vocation: Vocation; outfit: Outfit }
  | { mode: 'online'; url: string; name: string; password: string; vocation: Vocation; outfit: Outfit };

const NAME_RE = /^[A-Za-z][A-Za-z '-]{1,18}[A-Za-z]$/;
const VOC_OUTFIT: Record<Vocation, OutfitType> = { knight: 'knight', paladin: 'ranger', sorcerer: 'mage', druid: 'mage' };

/** True when this page was served by a Thornvale server (so online play is the main mode). */
export function servedByServer(): boolean {
  const l = globalThis.location;
  return !!l && (l.protocol === 'http:' || l.protocol === 'https:') && !/claude|anthropic|usercontent/i.test(l.hostname) && l.port !== '5173';
}

function defaultServerUrl(): string {
  const l = globalThis.location;
  // when the game page comes from a Thornvale server (local or hosted, e.g. on Render), connect back to it
  if (l && (l.protocol === 'http:' || l.protocol === 'https:') && !/claude|anthropic|usercontent/i.test(l.hostname)) {
    return `${l.protocol === 'https:' ? 'wss' : 'ws'}://${l.host}/ws`;
  }
  return 'ws://localhost:8080/ws';
}

/**
 * Title screen: continue a saved character, create a new one, or join a
 * server. Resolves with the player's choice; `setError` reports failures
 * (for example a server that cannot be reached) without leaving the screen.
 */
export class StartScreen {
  readonly root: HTMLDivElement;
  private errorEl: HTMLDivElement;
  private busy = false;
  private preview: OutfitPreview | null = null;
  private resolve: ((c: StartChoice) => void) | null = null;
  private vocation: Vocation = 'knight';
  private outfit: Outfit = { ...DEFAULT_OUTFIT };

  constructor(parent: HTMLElement, saves: SaveSystem) {
    this.root = el('div', 'start', parent);
    const card = el('div', 'start-card', this.root);
    el('h1', 'start-title', card, 'Thornvale');
    el('div', 'start-sub', card, 'A tile-based fantasy MMORPG in 3D');

    const saved = saves.peek();
    if (saved) {
      const cont = el('div', 'start-section', card);
      el('div', 'panel-title', cont, 'Continue');
      button(cont, `Continue as ${saved.name} — level ${saved.level} ${VOCATIONS[saved.vocation as Vocation]?.name ?? ''}`, () => this.pick({ mode: 'continue' }), 'btn big');
    }

    const form = el('div', 'start-section', card);
    el('div', 'panel-title', form, saved ? 'Or create a new character' : 'Create your character');
    const row = el('div', 'start-row', form);
    const left = el('div', 'start-left', row);
    const pv = el('div', 'start-pv', row);
    this.preview = new OutfitPreview(pv);
    const name = el('input', 'text-input', left);
    name.placeholder = 'Character name';
    name.maxLength = 20;
    name.value = saved ? '' : 'Adventurer';
    const vocs = el('div', 'voc-grid', left);
    const vocBtns: HTMLButtonElement[] = [];
    for (const v of VOCATION_IDS) {
      const b = button(vocs, '', () => {
        this.vocation = v;
        this.outfit.type = VOC_OUTFIT[v];
        vocBtns.forEach((x, i) => x.classList.toggle('on', VOCATION_IDS[i] === v));
        this.preview?.set(this.outfit);
      }, `voc-card${v === this.vocation ? ' on' : ''}`);
      el('div', 'voc-name', b, VOCATIONS[v].name);
      el('div', 'voc-blurb', b, VOCATIONS[v].blurb);
      vocBtns.push(b);
    }
    const looks = el('div', 'outfit-types', left);
    for (const t of OUTFIT_TYPES) {
      button(looks, t.name, () => {
        this.outfit.type = t.id;
        this.preview?.set(this.outfit);
      }, 'btn small');
    }
    button(looks, 'Random colours', () => {
      const r = () => Math.floor(Math.random() * PALETTE.length);
      this.outfit = { ...this.outfit, head: r(), body: r(), legs: r(), feet: r() };
      this.preview?.set(this.outfit);
    }, 'btn small');
    this.preview.set(this.outfit);

    const go = el('div', 'start-actions', form);
    button(go, saved ? 'Start new character (replaces the save)' : 'Play offline', () => {
      const n = this.validName(name.value);
      if (n) this.pick({ mode: 'new', name: n, vocation: this.vocation, outfit: { ...this.outfit } });
    }, 'btn big');

    const online = el('div', 'start-section login', card);
    el('div', 'panel-title', online, 'Play online — log in');
    el('div', 'hint', online, 'Log in with your character name and password. If the name is new, the character is created with the vocation and outfit chosen below, and the password protects it from then on.');
    const lrow = el('div', 'login-grid', online);
    const lname = el('input', 'text-input', lrow);
    lname.placeholder = 'Character name';
    lname.maxLength = 20;
    lname.autocomplete = 'username';
    try {
      lname.value = globalThis.localStorage?.getItem('thornvale.lastLogin') ?? '';
    } catch {
      /* ignore */
    }
    const pass = el('input', 'text-input', lrow);
    pass.type = 'password';
    pass.placeholder = 'Password (at least 4 characters)';
    pass.maxLength = 64;
    pass.autocomplete = 'current-password';
    const url = el('input', 'text-input', lrow);
    url.value = defaultServerUrl();
    url.spellcheck = false;
    url.title = 'Server address';
    const login = () => {
      const n = this.validName(lname.value);
      if (!n) return;
      if (pass.value.length < 4) return this.setError('Choose a password of at least 4 characters.');
      try {
        globalThis.localStorage?.setItem('thornvale.lastLogin', n);
      } catch {
        /* ignore */
      }
      this.pick({ mode: 'online', url: url.value.trim(), name: n, password: pass.value, vocation: this.vocation, outfit: { ...this.outfit } });
    };
    button(lrow, 'Log in', login, 'btn');
    for (const i of [lname, pass, url]) {
      i.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') login();
      });
    }
    // on a hosted server, logging in is the main thing: show it first
    if (servedByServer()) {
      card.insertBefore(online, card.children[2] ?? null);
      url.hidden = true;
    }

    this.errorEl = el('div', 'start-error', card);
    name.addEventListener('keydown', (e) => e.stopPropagation());
  }

  private validName(raw: string): string | null {
    const n = raw.trim().replace(/\s+/g, ' ');
    if (!NAME_RE.test(n)) {
      this.setError('Names are 3–20 letters; spaces, hyphens and apostrophes are allowed inside.');
      return null;
    }
    return n;
  }

  private pick(c: StartChoice): void {
    if (this.busy || !this.resolve) return;
    this.busy = true;
    this.setError('');
    this.resolve(c);
  }

  /** Waits for the next choice. */
  choose(): Promise<StartChoice> {
    this.busy = false;
    return new Promise((r) => (this.resolve = r));
  }

  setError(text: string): void {
    this.errorEl.textContent = text;
  }

  setStatus(text: string): void {
    this.errorEl.textContent = text;
  }

  close(): void {
    this.preview?.dispose();
    this.preview = null;
    this.root.remove();
  }
}

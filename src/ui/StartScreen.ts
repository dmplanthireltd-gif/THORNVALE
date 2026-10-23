import { randomAppearance, type Appearance } from '../game/player/appearance';
import { VOCATIONS, VOCATION_IDS, type Vocation } from '../game/player/vocations';
import type { SaveSystem } from '../game/save/SaveSystem';
import { button, el } from './dom';
import { CREST_SVG, VOCATION_SVG } from './emblems';
import './gate.css';
import { OnlineLogin, type OnlinePick } from './OnlineLogin';
import { offlineTutorialDone } from '../client/Controller';
import { CharacterDesigner } from './CharacterDesigner';
import { onLangChange, t } from '../i18n/i18n';
import { trName, trText } from '../i18n/gameText';
import { langPicker } from './lang';

export type StartChoice =
  | { mode: 'continue' }
  | { mode: 'new'; name: string; vocation: Vocation; appearance: Appearance; skipTutorial?: boolean }
  | ({ mode: 'online' } & OnlinePick);

const NAME_RE = /^[A-Za-z][A-Za-z '-]{1,18}[A-Za-z]$/;
const OPENING = Date.UTC(2027, 0, 1); // midnight UK time (GMT in January)
/** News shown in the Herald strip at the bottom of the title screen. */
const HERALD = 'New: bosses, world bosses and raids have arrived. The gates open fully on 1 January 2027.';

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

/** What the "create a hero" view is for: its main button and what happens next. */
export interface CreateOptions {
  primary: string;
  /** `skipTutorial`: the "Skip the tutorial" box was ticked (only offered when `skippable`). */
  done: (name: string, skipTutorial: boolean) => void;
  back: () => void;
  /** The account (or, offline, this browser) finished the tutorial island once: offer to skip it. */
  skippable?: boolean;
}

/**
 * The title screen, "The Gatehouse" (BRAND.md §6): a darkened scene, the crest and wordmark, and one
 * central panel that holds every step — log in / create account, choose a hero, create a hero, play
 * offline. Resolves with the player's choice; `setError` reports failures without leaving the screen.
 */
export class StartScreen {
  readonly root: HTMLDivElement;
  private panel: HTMLDivElement;
  private views: HTMLDivElement;
  private msg: HTMLDivElement;
  private busy = false;
  private designer: CharacterDesigner | null = null;
  private resolve: ((c: StartChoice) => void) | null = null;
  private vocation: Vocation = 'knight';
  /** A fresh random look for every visit to the hero creator (the designer changes it). */
  private appearance: Appearance = randomAppearance();
  private createView: HTMLDivElement | null = null;
  private createName: HTMLInputElement | null = null;
  private createPrimary: HTMLButtonElement | null = null;
  private createOpts: CreateOptions | null = null;
  private createSkip: { label: HTMLLabelElement; box: HTMLInputElement } | null = null;
  private createTutNote: HTMLParagraphElement | null = null;
  private offlineView: HTMLDivElement | null = null;
  private online: OnlineLogin;

  constructor(parent: HTMLElement, private readonly saves: SaveSystem) {
    this.root = el('div', 'gate', parent);
    const bg = el('div', 'gate-bg', this.root);
    bg.style.backgroundImage = `url("${new URL('ui/gate.jpg', document.baseURI).href}")`;
    el('div', 'gate-shade', this.root);

    // title strip
    const top = el('header', 'gate-top', this.root);
    el('span', '', top).innerHTML = CREST_SVG(20);
    el('span', 'gate-name', top, 'THORNVALE');
    el('span', 'gate-sep opt', top);
    el('span', 'gate-dim opt', top, t(servedByServer() ? 'Test realm' : 'Offline preview'));
    el('span', 'gate-grow', top);
    const status = el('span', 'gate-status', top);
    el('i', '', status);
    const statusText = el('span', '', status, t('Realm…'));
    const days = Math.ceil((OPENING - Date.now()) / 86_400_000);
    if (days > 0) {
      el('span', 'gate-sep', top);
      const open = el('span', 'gate-dim', top);
      const countdown = () => {
        open.replaceChildren(t('Grand opening in') + ' ');
        el('b', '', open, t('{n} day|{n} days', { n: days }));
      };
      countdown();
      onLangChange(countdown);
    }
    el('span', 'gate-sep', top);
    langPicker(top, 'lang-pick gate-lang');
    void this.realm(status, statusText);

    // crest and wordmark
    const head = el('div', 'gate-head', this.root);
    el('span', '', head).innerHTML = CREST_SVG(74, 1.2);
    el('h1', 'gate-title', head, 'THORNVALE');
    el('p', 'gate-tag', head, t('A realm of thorn, stone and gold'));

    // the panel every step lives in
    this.panel = el('div', 'gate-panel', this.root);
    for (const c of ['tl', 'tr', 'bl', 'br']) el('span', `gate-cn ${c}`, this.panel);
    this.views = el('div', 'gate-views', this.panel);
    this.msg = el('div', 'gate-msg', this.panel);
    this.msg.setAttribute('role', 'status');
    this.msg.setAttribute('aria-live', 'polite');

    // herald strip
    const herald = el('footer', 'gate-herald', this.root);
    el('span', 'gate-label', herald, t('Herald'));
    el('span', 'gate-news', herald, t(HERALD));
    el('span', 'gate-grow', herald);
    if (servedByServer()) {
      const site = el('a', '', herald, t('Website'));
      site.href = '/';
      const guide = el('a', '', herald, t('Guide'));
      guide.href = '/guide/';
    }

    this.online = new OnlineLogin(this.views, {
      serverUrl: defaultServerUrl(),
      look: () => ({ vocation: this.vocation, appearance: { ...this.appearance } }),
      validName: (raw) => this.validName(raw),
      play: (p) => this.pick({ mode: 'online', ...p }),
      message: (t, ok) => this.setError(t, ok),
      offline: () => this.showOffline(),
      create: (o) => this.showCreate(o),
      shown: (wide) => this.show(this.online.root, wide, false),
    });
  }

  // ------------------------------------------------------------------ views

  /** Shows one view in the panel (the others stay in the page, hidden). */
  private show(view: HTMLElement, wide = false, clear = true): void {
    for (const v of Array.from(this.views.children) as HTMLElement[]) v.hidden = v !== view;
    this.panel.classList.toggle('wide', wide);
    this.root.classList.toggle('compact', wide);
    if (clear) this.setError('');
    view.querySelector<HTMLInputElement>('input.gate-input')?.focus({ preventScroll: true });
  }

  private showOffline(): void {
    const saved = this.saves.peek();
    if (!saved) {
      this.showCreate({ primary: t('Play offline'), skippable: offlineTutorialDone(), done: (n, skip) => this.pick({ mode: 'new', name: n, vocation: this.vocation, appearance: { ...this.appearance }, skipTutorial: skip }), back: () => this.online.showStart() });
      return;
    }
    if (!this.offlineView) this.offlineView = el('div', 'gate-view', this.views);
    const v = this.offlineView;
    v.replaceChildren();
    el('div', 'gate-kicker', v, t('Offline · saved in this browser'));
    el('h2', 'gate-h2', v, t('Your offline hero'));
    const voc = VOCATIONS[saved.vocation as Vocation];
    const card = button(v, '', () => this.pick({ mode: 'continue' }), 'gate-hero on');
    el('span', 'gate-badge', card).innerHTML = VOCATION_SVG(saved.vocation, 26);
    const tx = el('span', 'gate-hero-text', card);
    el('span', 'gate-hero-name', tx, saved.name);
    el('span', 'gate-hero-sub', tx, t('Level {level} {vocation}', { level: saved.level, vocation: voc ? trName(voc.name) : '' }));
    button(v, t('Continue as {name}', { name: saved.name }), () => this.pick({ mode: 'continue' }), 'gate-gold');
    button(v, t('New offline hero'), () => this.showCreate({
      primary: t('Start (replaces the offline save)'),
      skippable: offlineTutorialDone(),
      done: (n, skip) => this.pick({ mode: 'new', name: n, vocation: this.vocation, appearance: { ...this.appearance }, skipTutorial: skip }),
      back: () => this.showOffline(),
    }), 'gate-iron');
    button(v, t('Back to log in'), () => this.online.showStart(), 'gate-link quiet');
    this.show(v);
  }

  /** The hero creator: name, vocation and the character designer (turning 3D preview). Shared by online and offline. */
  showCreate(opts: CreateOptions): void {
    this.createOpts = opts;
    if (!this.createView) this.buildCreate();
    this.createPrimary!.textContent = opts.primary;
    // the tutorial island: new heroes start there unless the account finished it once and the box is ticked
    this.createSkip!.box.checked = false;
    this.createSkip!.label.hidden = !opts.skippable;
    this.createTutNote!.hidden = !!opts.skippable;
    this.show(this.createView!, true);
    this.createName!.focus({ preventScroll: true });
  }

  private buildCreate(): void {
    const v = el('div', 'gate-view', this.views);
    this.createView = v;
    el('div', 'gate-kicker', v, t('A new hero'));
    el('h2', 'gate-h2', v, t('Who will you be?'));
    const row = el('div', 'gate-create', v);
    const left = el('div', 'gate-create-left', row);

    const nf = el('div', 'gate-field', left);
    const nl = el('label', 'gate-label', nf, t('Name'));
    const name = el('input', 'gate-input', nf);
    name.id = 'gate-new-hero-name';
    nl.htmlFor = name.id;
    name.maxLength = 20;
    name.autocomplete = 'off';
    name.spellcheck = false;
    name.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') submit();
    });
    this.createName = name;

    el('span', 'gate-label', left, t('Vocation'));
    const vocs = el('div', 'gate-vocs', left);
    const vocBtns: HTMLButtonElement[] = [];
    for (const id of VOCATION_IDS) {
      const b = button(vocs, '', () => {
        this.vocation = id;
        vocBtns.forEach((x, i) => {
          x.classList.toggle('on', VOCATION_IDS[i] === id);
          x.setAttribute('aria-pressed', String(VOCATION_IDS[i] === id));
        });
      }, `gate-voc${id === this.vocation ? ' on' : ''}`);
      b.setAttribute('aria-pressed', String(id === this.vocation));
      el('span', '', b).innerHTML = VOCATION_SVG(id, 30);
      const tx = el('span', '', b);
      const vb = el('b', '', tx, trName(VOCATIONS[id].name));
      const vs = el('small', '', tx, trText(VOCATIONS[id].blurb));
      onLangChange(() => { vb.textContent = trName(VOCATIONS[id].name); vs.textContent = trText(VOCATIONS[id].blurb); });
      vocBtns.push(b);
    }

    el('span', 'gate-label', v, t('Appearance'));
    this.designer = new CharacterDesigner(v, this.appearance, (a) => (this.appearance = a));

    const skipLabel = el('label', 'gate-check', v);
    const skipBox = el('input', '', skipLabel);
    skipBox.type = 'checkbox';
    skipLabel.append(t('Skip the tutorial and start in Thornvale (same starting gear)'));
    skipLabel.title = t("You have finished Wayfarer's Isle before, so new heroes may skip it.");
    this.createSkip = { label: skipLabel, box: skipBox };
    this.createTutNote = el('p', 'gate-hint', v, t("New heroes begin on Wayfarer's Isle, a short tutorial island. Once one of your heroes has finished it, the next ones may skip it."));
    const actions = el('div', 'gate-row', v);
    const submit = () => {
      const n = this.validName(name.value);
      if (n) this.createOpts?.done(n, !!this.createOpts?.skippable && skipBox.checked);
    };
    this.createPrimary = button(actions, '', submit, 'gate-gold');
    button(actions, t('Back'), () => this.createOpts?.back(), 'gate-iron');
    el('p', 'gate-hint', v, t('Names are 3–20 letters; spaces, hyphens and apostrophes are allowed inside. Your name is yours from then on.'));
  }

  /** Live player count from the server's /status. */
  private async realm(box: HTMLElement, text: HTMLElement): Promise<void> {
    if (!servedByServer()) {
      text.textContent = t('Offline preview');
      return;
    }
    try {
      const res = await fetch(new URL('/status', location.href).href, { cache: 'no-store' });
      const d = (await res.json()) as { online?: number };
      const n = Number(d.online) || 0;
      box.classList.add('up');
      const show = () => { text.textContent = t('Realm online · {n} wanderer|Realm online · {n} wanderers', { n }); };
      show();
      onLangChange(show);
    } catch {
      text.textContent = t('Realm waking…');
    }
  }

  // ------------------------------------------------------------------ choices

  private validName(raw: string): string | null {
    const n = raw.trim().replace(/\s+/g, ' ');
    if (!NAME_RE.test(n)) {
      this.setError(t('Names are 3–20 letters; spaces, hyphens and apostrophes are allowed inside.'));
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

  setError(text: string, ok = false): void {
    // errors from the server arrive in English: translate them like any game text
    this.msg.textContent = trText(text);
    this.msg.classList.toggle('ok', ok);
  }

  setStatus(text: string): void {
    this.setError(text, true);
  }

  close(): void {
    this.designer?.dispose();
    this.designer = null;
    this.root.remove();
  }
}

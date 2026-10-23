import type { Appearance } from '../game/player/appearance';
import { VOCATIONS, type Vocation } from '../game/player/vocations';
import { button, el } from './dom';
import { VOCATION_SVG } from './emblems';
import type { CreateOptions } from './StartScreen';
import { k, onLangChange, t } from '../i18n/i18n';
import { trName, trText } from '../i18n/gameText';

/**
 * The account steps of the title screen (the Gatehouse panel).
 *
 * Servers with Supabase Auth use email accounts: log in or create an account, reset a forgotten
 * password by email, then choose or create a hero. Servers without it fall back to character
 * name + password. Only the look changed in the 2026-10-21 redesign; the login logic is the same.
 */
export interface OnlinePick {
  url: string;
  name: string;
  password?: string;
  token?: string;
  vocation: Vocation;
  appearance: Appearance;
  /** New heroes only: start in Thornvale instead of the tutorial island (accounts that finished it once). */
  skipTutorial?: boolean;
}

interface Hooks {
  serverUrl: string;
  look: () => { vocation: Vocation; appearance: Appearance };
  validName: (raw: string) => string | null;
  play: (p: OnlinePick) => void;
  message: (text: string, ok?: boolean) => void;
  /** Open the offline choices. */
  offline: () => void;
  /** Open the hero creator. */
  create: (o: CreateOptions) => void;
  /** This view became the visible one (wide for the hero list). */
  shown: (wide: boolean) => void;
}

interface AuthConfig {
  mode: 'email' | 'local';
  url?: string;
  key?: string;
  maxCharacters?: number;
}

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface Hero {
  name: string;
  level: number;
  vocation: string;
}

const STORE = 'thornvale.auth';

function store(kind: 'local' | 'session' = 'local'): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage; sessionStorage?: Storage };
    return (kind === 'local' ? g.localStorage : g.sessionStorage) ?? null;
  } catch {
    return null;
  }
}

/** http(s) address of a server from its websocket address. */
function httpBase(wsUrl: string): string {
  return wsUrl.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');
}

export class OnlineLogin {
  readonly root: HTMLDivElement;
  private config: AuthConfig | null = null;
  private session: Session | null = null;
  private email = '';
  private remember = true;
  private tab: 'login' | 'signup' = 'login';
  private selected = '';
  /** Redraws the step on screen (language change). */
  private view: (() => void) | null = null;

  constructor(parent: HTMLElement, private readonly h: Hooks) {
    this.root = el('div', 'gate-view', parent);
    el('p', 'gate-hint', this.root, t('Opening the gates…'));
    void this.init();
    // a new language: redraw the step on screen (typed email kept; passwords are typed again)
    onLangChange(() => { if (this.view) this.view(); });
  }

  /** Back to the first step (log in, or your heroes when already logged in). */
  showStart(): void {
    if (this.config?.mode === 'email') {
      if (this.session) void this.renderCharacters();
      else this.renderSignIn();
    } else this.renderLocal();
  }

  // ------------------------------------------------------------------ setup

  private async init(): Promise<void> {
    try {
      const res = await fetch(`${httpBase(this.h.serverUrl)}/api/auth-config`);
      this.config = res.ok ? ((await res.json()) as AuthConfig) : { mode: 'local' };
    } catch {
      // no server here (e.g. this page is a preview): the name + password form still lets you try a server address
      this.config = { mode: 'local' };
    }
    if (this.config.mode === 'email') {
      const fromLink = this.readRedirect();
      if (fromLink === 'recovery') return this.renderNewPassword();
      if (!this.session) this.session = this.loadSession();
      if (this.session && (await this.ensureFresh())) return this.renderCharacters();
      return this.renderSignIn();
    }
    this.renderLocal();
  }

  private auth(path: string, init: RequestInit = {}): Promise<Response> {
    const c = this.config!;
    return fetch(`${c.url}/auth/v1/${path}`, {
      ...init,
      headers: { apikey: c.key!, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  }

  private static async rawError(res: Response): Promise<string> {
    try {
      const j = (await res.clone().json()) as { msg?: string; message?: string; error_description?: string; error?: string };
      return j.msg ?? j.message ?? j.error_description ?? j.error ?? '';
    } catch {
      return '';
    }
  }

  private static async error(res: Response): Promise<string> {
    try {
      const j = (await res.json()) as { msg?: string; message?: string; error_description?: string; error?: string };
      return trText(j.msg ?? j.message ?? j.error_description ?? j.error ?? `Error ${res.status}`);
    } catch {
      return t('Error {status}', { status: String(res.status) });
    }
  }

  /** Keeps the login: across visits when "Keep me signed in" is ticked, otherwise for this tab only. */
  private keep(j: { access_token: string; refresh_token: string; expires_in?: number }): void {
    this.session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 };
    try {
      store(this.remember ? 'local' : 'session')?.setItem(STORE, JSON.stringify(this.session));
      store(this.remember ? 'session' : 'local')?.removeItem(STORE);
    } catch {
      /* not remembered */
    }
  }

  private loadSession(): Session | null {
    try {
      const raw = store('local')?.getItem(STORE) ?? store('session')?.getItem(STORE);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }

  private forget(): void {
    this.session = null;
    try {
      store('local')?.removeItem(STORE);
      store('session')?.removeItem(STORE);
    } catch {
      /* ignore */
    }
  }

  /** Refreshes the access token when it is (nearly) expired. */
  private async ensureFresh(): Promise<boolean> {
    const s = this.session;
    if (!s) return false;
    if (s.expires_at - Date.now() > 60_000) return true;
    const res = await this.auth('token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: s.refresh_token }) }).catch(() => null);
    if (!res || !res.ok) {
      this.forget();
      return false;
    }
    this.keep(await res.json());
    return true;
  }

  /** Handles the link in a confirmation or password-reset email (#access_token=…&type=…). */
  private readRedirect(): string | null {
    const hash = globalThis.location?.hash ?? '';
    if (!hash.includes('access_token=')) {
      if (hash.includes('error_description=')) {
        const p = new URLSearchParams(hash.slice(1));
        this.h.message(trText(p.get('error_description') ?? 'That link is not valid any more.'));
        history.replaceState(null, '', location.pathname + location.search);
      }
      return null;
    }
    const p = new URLSearchParams(hash.slice(1));
    const at = p.get('access_token');
    const rt = p.get('refresh_token');
    history.replaceState(null, '', location.pathname + location.search);
    if (!at || !rt) return null;
    this.keep({ access_token: at, refresh_token: rt, expires_in: Number(p.get('expires_in')) || 3600 });
    return p.get('type');
  }

  // ------------------------------------------------------------------ small builders

  private field(parent: HTMLElement, label: string, type: string, auto: string, extra?: (row: HTMLElement) => void): HTMLInputElement {
    const f = el('div', 'gate-field', parent);
    const row = el('div', 'gate-label-row', f);
    const l = el('label', 'gate-label', row, t(label));
    if (extra) extra(row);
    const i = el('input', 'gate-input', f);
    i.type = type;
    i.id = `gate-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    l.htmlFor = i.id;
    if (auto) i.autocomplete = auto as AutoFill;
    i.spellcheck = false;
    i.addEventListener('keydown', (e) => e.stopPropagation());
    return i;
  }

  private busy(btns: HTMLButtonElement[], on: boolean): void {
    for (const b of btns) b.disabled = on;
  }

  private fresh(wide = false): HTMLDivElement {
    this.root.replaceChildren();
    this.h.shown(wide);
    return this.root;
  }

  // ------------------------------------------------------------------ email accounts

  private renderSignIn(note = ''): void {
    this.view = () => this.renderSignIn(note);
    const b = this.fresh();
    const tabs = el('div', 'gate-tabs', b);
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', t('Account'));
    for (const [id, label] of [['login', k('Log in')], ['signup', k('Create account')]] as const) {
      const tb = button(tabs, t(label), () => {
        this.tab = id;
        this.h.message('');
        this.renderSignIn();
      }, `gate-tab${this.tab === id ? ' on' : ''}`);
      tb.setAttribute('role', 'tab');
      tb.setAttribute('aria-selected', String(this.tab === id));
    }
    const signup = this.tab === 'signup';
    if (note) el('p', 'gate-hint', b, note);
    const email = this.field(b, 'Email', 'email', 'email');
    email.value = this.email;
    let forgot: HTMLButtonElement | null = null;
    const pass = this.field(b, 'Password', 'password', signup ? 'new-password' : 'current-password', (row) => {
      if (!signup) forgot = button(row, t('Forgot password?'), () => void doForgot(), 'gate-link');
    });
    pass.placeholder = t('At least 6 characters');
    let pass2: HTMLInputElement | null = null;
    if (signup) pass2 = this.field(b, 'Repeat password', 'password', 'new-password');
    const keep = el('label', 'gate-check', b);
    const box = el('input', '', keep);
    box.type = 'checkbox';
    box.checked = this.remember;
    box.addEventListener('change', () => (this.remember = box.checked));
    keep.append(t('Keep me signed in on this computer'));
    const go = button(b, t(signup ? 'Create free account' : 'Enter the realm'), () => void (signup ? doSignup() : doLogin()), 'gate-gold');
    el('div', 'gate-or', b, t('or'));
    const off = button(b, t('Play offline'), () => this.h.offline(), 'gate-iron');
    el('p', 'gate-hint', b, t('Free · up to 5 heroes per account · saved on the server'));
    const all = [go, off, ...(forgot ? [forgot as HTMLButtonElement] : [])];

    const read = (needPass: boolean): { e: string; p: string } | null => {
      const e = email.value.trim();
      this.email = e;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        this.h.message(t('Enter a valid email address.'));
        return null;
      }
      if (needPass && pass.value.length < 6) {
        this.h.message(t('Passwords need at least 6 characters.'));
        return null;
      }
      if (needPass && pass2 && pass2.value !== pass.value) {
        this.h.message(t('The two passwords are different.'));
        return null;
      }
      return { e, p: pass.value };
    };
    const doLogin = async () => {
      const v = read(true);
      if (!v) return;
      this.busy(all, true);
      const res = await this.auth('token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: v.e, password: v.p }) }).catch(() => null);
      this.busy(all, false);
      if (!res) return this.h.message(t('Could not reach the login service.'));
      if (!res.ok) return this.h.message(/confirm/i.test(await OnlineLogin.rawError(res)) ? t('Please confirm your email first — check your inbox for the link.') : t('Wrong email or password.'));
      this.keep(await res.json());
      this.h.message('');
      void this.renderCharacters();
    };
    const doSignup = async () => {
      const v = read(true);
      if (!v) return;
      this.busy(all, true);
      const back = encodeURIComponent(location.origin + location.pathname);
      const res = await this.auth(`signup?redirect_to=${back}`, { method: 'POST', body: JSON.stringify({ email: v.e, password: v.p }) }).catch(() => null);
      this.busy(all, false);
      if (!res) return this.h.message(t('Could not reach the login service.'));
      if (!res.ok) return this.h.message(await OnlineLogin.error(res));
      const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
      if (j.access_token && j.refresh_token) {
        this.keep({ access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in });
        void this.renderCharacters();
        this.h.message(t('Account created.'), true);
        return;
      }
      this.tab = 'login';
      this.renderSignIn(t('Account created. We sent a confirmation link to {email} — open it, then log in here.', { email: v.e }));
    };
    const doForgot = async () => {
      const v = read(false);
      if (!v) return;
      this.busy(all, true);
      const back = encodeURIComponent(location.origin + location.pathname);
      const res = await this.auth(`recover?redirect_to=${back}`, { method: 'POST', body: JSON.stringify({ email: v.e }) }).catch(() => null);
      this.busy(all, false);
      if (!res) return this.h.message(t('Could not reach the login service.'));
      if (!res.ok) return this.h.message(await OnlineLogin.error(res));
      this.renderSignIn(t('If {email} has an account, a password reset link is on its way. Open it on this device to choose a new password.', { email: v.e }));
    };
    for (const i of [pass, pass2]) {
      i?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void (signup ? doSignup() : doLogin());
      });
    }
    if (!this.email) email.focus({ preventScroll: true });
    else pass.focus({ preventScroll: true });
  }

  private renderNewPassword(): void {
    this.view = null;
    const b = this.fresh();
    el('div', 'gate-kicker', b, t('Password reset'));
    el('h2', 'gate-h2', b, t('Choose a new password'));
    const pass = this.field(b, 'New password', 'password', 'new-password');
    pass.placeholder = t('At least 6 characters');
    const pass2 = this.field(b, 'Repeat the new password', 'password', 'new-password');
    const save = button(b, t('Save password'), () => void doSave(), 'gate-gold');
    const doSave = async () => {
      if (pass.value.length < 6) return this.h.message(t('Passwords need at least 6 characters.'));
      if (pass.value !== pass2.value) return this.h.message(t('The two passwords are different.'));
      save.disabled = true;
      const res = await this.auth('user', { method: 'PUT', headers: { Authorization: `Bearer ${this.session?.access_token}` }, body: JSON.stringify({ password: pass.value }) }).catch(() => null);
      save.disabled = false;
      if (!res || !res.ok) return this.h.message(res ? await OnlineLogin.error(res) : t('Could not reach the login service.'));
      await this.renderCharacters();
      this.h.message(t('Password changed. You are logged in.'), true);
    };
    pass2.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void doSave();
    });
  }

  private async renderCharacters(): Promise<void> {
    this.view = () => void this.renderCharacters();
    let b = this.fresh(true);
    el('p', 'gate-hint', b, t('Gathering your heroes…'));
    if (!(await this.ensureFresh())) return this.renderSignIn(t('Your login expired. Please log in again.'));
    let data: { email: string; characters: Hero[]; maxCharacters?: number; tutorialDone?: boolean };
    try {
      const res = await fetch(`${httpBase(this.h.serverUrl)}/api/characters`, { headers: { Authorization: `Bearer ${this.session!.access_token}` } });
      if (res.status === 401) {
        this.forget();
        return this.renderSignIn(t('Your login expired. Please log in again.'));
      }
      data = await res.json();
    } catch {
      b = this.fresh();
      el('p', 'gate-hint', b, t('Could not load your heroes. Is the server awake?'));
      button(b, t('Try again'), () => void this.renderCharacters(), 'gate-iron');
      return;
    }
    // founder packs add character slots to an account, so the server's per-account number wins
    const max = data.maxCharacters ?? this.config?.maxCharacters ?? 5;
    const heroes = data.characters;
    if (!heroes.some((c) => c.name === this.selected)) this.selected = heroes[0]?.name ?? '';
    b = this.fresh(true);

    el('div', 'gate-kicker', b, t('Your heroes · {count} of {max}', { count: heroes.length, max }));
    el('h2', 'gate-h2', b, t(heroes.length ? 'Who rides out today?' : 'Raise your first hero'));
    const who = el('p', 'gate-hint', b, t('Signed in as {email}', { email: data.email }) + ' · ');
    button(who, t('Log out'), () => {
      void this.auth('logout', { method: 'POST', headers: { Authorization: `Bearer ${this.session?.access_token}` } }).catch(() => null);
      this.forget();
      this.selected = '';
      this.renderSignIn();
    }, 'gate-link quiet');

    const play = (name: string, skipTutorial = false) => {
      const look = this.h.look();
      void this.ensureFresh().then((ok) => {
        if (!ok) return this.renderSignIn(t('Your login expired. Please log in again.'));
        this.h.play({ url: this.h.serverUrl, name, token: this.session!.access_token, ...look, skipTutorial });
      });
    };
    const create = () => this.h.create({
      primary: t('Create & enter'),
      skippable: data.tutorialDone === true,
      done: (name, skip) => play(name, skip),
      back: () => void this.renderCharacters(),
    });

    const list = el('div', 'gate-heroes', b);
    for (const c of heroes) {
      const voc = trName(VOCATIONS[c.vocation as Vocation]?.name ?? c.vocation);
      const on = c.name === this.selected;
      const row = button(list, '', () => {
        if (this.selected === c.name) return play(c.name);
        this.selected = c.name;
        void this.renderCharacters();
      }, `gate-hero${on ? ' on' : ''}`);
      row.setAttribute('aria-pressed', String(on));
      row.title = on ? t('Enter as {name}', { name: c.name }) : t('Choose {name}', { name: c.name });
      el('span', 'gate-badge', row).innerHTML = VOCATION_SVG(c.vocation, 26);
      const tx = el('span', 'gate-hero-text', row);
      el('span', 'gate-hero-name', tx, c.name);
      el('span', 'gate-hero-sub', tx, t('Level {level} {vocation}', { level: c.level, vocation: voc }));
    }
    for (let i = heroes.length; i < max; i++) {
      const e = button(list, '', create, 'gate-empty');
      el('span', '', e, '+');
      e.append(t('Empty slot · create a new hero'));
    }

    const chosen = heroes.find((c) => c.name === this.selected);
    const actions = el('div', 'gate-row', b);
    if (chosen) button(actions, t('Enter as {name}', { name: chosen.name }), () => play(chosen.name), 'gate-gold');
    if (heroes.length < max) button(actions, t('New hero'), create, chosen ? 'gate-iron' : 'gate-gold');
    if (chosen) {
      const confirmBox = el('div', 'gate-confirm', b);
      confirmBox.hidden = true;
      button(actions, t('Delete {name}…', { name: chosen.name }), () => {
        confirmBox.hidden = false;
        confirmBox.replaceChildren();
        el('p', '', confirmBox, t('Delete {name} for good? Their level, items and gold cannot be brought back. Type the name to confirm.', { name: chosen.name }));
        const inp = this.field(confirmBox, 'Hero name', 'text', 'off');
        const row = el('div', 'gate-row', confirmBox);
        button(row, t('Delete forever'), async () => {
          if (inp.value.trim().toLowerCase() !== chosen.name.toLowerCase()) return this.h.message(t('The name does not match.'));
          if (!(await this.ensureFresh())) return this.renderSignIn(t('Your login expired. Please log in again.'));
          const r = await fetch(`${httpBase(this.h.serverUrl)}/api/characters/delete`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.session!.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: chosen.name }),
          }).catch(() => null);
          const j = r ? await r.json().catch(() => ({})) : {};
          if (!r || !r.ok) return this.h.message(trText((j as { error?: string }).error ?? 'Could not delete the character.'));
          this.selected = '';
          await this.renderCharacters();
          this.h.message(t('{name} was deleted.', { name: chosen.name }), true);
        }, 'gate-iron gate-danger');
        button(row, t('Cancel'), () => (confirmBox.hidden = true), 'gate-iron');
        inp.focus({ preventScroll: true });
      }, 'gate-link quiet');
    }
    el('p', 'gate-hint', b, t('Each hero keeps their own level, items, bank and quests.'));
  }

  // ------------------------------------------------------------------ servers without email login

  private renderLocal(): void {
    this.view = () => this.renderLocal();
    const b = this.fresh();
    el('div', 'gate-kicker', b, t('Log in or claim a name'));
    el('p', 'gate-hint', b, t("Log in with your hero's name and password. A name nobody has yet becomes your new hero, protected by that password."));
    const name = this.field(b, 'Hero name', 'text', 'username');
    try {
      name.value = store()?.getItem('thornvale.lastLogin') ?? '';
    } catch {
      /* ignore */
    }
    const pass = this.field(b, 'Password', 'password', 'current-password');
    pass.placeholder = t('At least 4 characters');
    const url = this.field(b, 'Server address', 'text', 'off');
    url.value = this.h.serverUrl;
    const go = () => {
      const n = this.h.validName(name.value);
      if (!n) return;
      if (pass.value.length < 4) return this.h.message(t('Choose a password of at least 4 characters.'));
      try {
        store()?.setItem('thornvale.lastLogin', n);
      } catch {
        /* ignore */
      }
      this.h.play({ url: url.value.trim(), name: n, password: pass.value, ...this.h.look() });
    };
    button(b, t('Enter the realm'), go, 'gate-gold');
    el('div', 'gate-or', b, t('or'));
    button(b, t('Play offline'), () => this.h.offline(), 'gate-iron');
    pass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
  }
}

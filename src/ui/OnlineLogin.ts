import type { Outfit } from '../game/player/outfits';
import { VOCATIONS, type Vocation } from '../game/player/vocations';
import { button, el } from './dom';

/**
 * The "Play online" box on the title screen.
 *
 * Servers with Supabase Auth use email accounts: log in, create an account,
 * reset a forgotten password by email, then pick or create a character. Servers
 * without it fall back to character name + password.
 */
export interface OnlinePick {
  url: string;
  name: string;
  password?: string;
  token?: string;
  vocation: Vocation;
  outfit: Outfit;
}

interface Hooks {
  serverUrl: string;
  look: () => { vocation: Vocation; outfit: Outfit };
  validName: (raw: string) => string | null;
  play: (p: OnlinePick) => void;
  message: (text: string) => void;
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

const STORE = 'thornvale.auth';

function store(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
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
  private body: HTMLDivElement;
  private config: AuthConfig | null = null;
  private session: Session | null = null;
  private email = '';

  constructor(parent: HTMLElement, private readonly h: Hooks) {
    this.root = el('div', 'start-section login', parent);
    el('div', 'panel-title', this.root, 'Play online');
    this.body = el('div', 'login-body', this.root);
    el('div', 'hint', this.body, 'Connecting to the server…');
    void this.init();
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

  private static async error(res: Response): Promise<string> {
    try {
      const j = (await res.json()) as { msg?: string; message?: string; error_description?: string; error?: string };
      return j.msg ?? j.message ?? j.error_description ?? j.error ?? `Error ${res.status}`;
    } catch {
      return `Error ${res.status}`;
    }
  }

  private keep(j: { access_token: string; refresh_token: string; expires_in?: number }): void {
    this.session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 };
    try {
      store()?.setItem(STORE, JSON.stringify(this.session));
    } catch {
      /* not remembered */
    }
  }

  private loadSession(): Session | null {
    try {
      const raw = store()?.getItem(STORE);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }

  private forget(): void {
    this.session = null;
    try {
      store()?.removeItem(STORE);
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
        this.h.message(p.get('error_description') ?? 'That link is not valid any more.');
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

  private input(parent: HTMLElement, placeholder: string, type = 'text', auto = ''): HTMLInputElement {
    const i = el('input', 'text-input', parent);
    i.type = type;
    i.placeholder = placeholder;
    if (auto) i.autocomplete = auto as AutoFill;
    i.addEventListener('keydown', (e) => e.stopPropagation());
    return i;
  }

  private busy(btns: HTMLButtonElement[], on: boolean): void {
    for (const b of btns) b.disabled = on;
  }

  // ------------------------------------------------------------------ email accounts

  private renderSignIn(note = ''): void {
    const b = this.body;
    b.replaceChildren();
    el('div', 'hint', b, note || 'Log in with your email, or create a free account. Your characters are kept on the server and you can reset a forgotten password by email.');
    const grid = el('div', 'login-grid', b);
    const email = this.input(grid, 'Email', 'email', 'email');
    email.value = this.email;
    const pass = this.input(grid, 'Password (at least 6 characters)', 'password', 'current-password');
    const login = button(grid, 'Log in', () => void doLogin(), 'btn');
    const row = el('div', 'start-actions', b);
    const create = button(row, 'Create account', () => void doSignup(), 'btn small');
    const forgot = button(row, 'Forgot password?', () => void doForgot(), 'btn small');
    const all = [login, create, forgot];
    const read = (needPass: boolean): { e: string; p: string } | null => {
      const e = email.value.trim();
      this.email = e;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        this.h.message('Enter a valid email address.');
        return null;
      }
      if (needPass && pass.value.length < 6) {
        this.h.message('Passwords need at least 6 characters.');
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
      if (!res) return this.h.message('Could not reach the login service.');
      if (!res.ok) return this.h.message(/confirm/i.test(await OnlineLogin.error(res)) ? 'Please confirm your email first — check your inbox for the link.' : 'Wrong email or password.');
      this.keep(await res.json());
      this.h.message('');
      this.renderCharacters();
    };
    const doSignup = async () => {
      const v = read(true);
      if (!v) return;
      this.busy(all, true);
      const back = encodeURIComponent(location.origin + location.pathname);
      const res = await this.auth(`signup?redirect_to=${back}`, { method: 'POST', body: JSON.stringify({ email: v.e, password: v.p }) }).catch(() => null);
      this.busy(all, false);
      if (!res) return this.h.message('Could not reach the login service.');
      if (!res.ok) return this.h.message(await OnlineLogin.error(res));
      const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
      if (j.access_token && j.refresh_token) {
        this.keep({ access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in });
        this.h.message('Account created.');
        return this.renderCharacters();
      }
      this.renderSignIn(`Account created. We sent a confirmation link to ${v.e} — open it, then log in here.`);
    };
    const doForgot = async () => {
      const v = read(false);
      if (!v) return;
      this.busy(all, true);
      const back = encodeURIComponent(location.origin + location.pathname);
      const res = await this.auth(`recover?redirect_to=${back}`, { method: 'POST', body: JSON.stringify({ email: v.e }) }).catch(() => null);
      this.busy(all, false);
      if (!res) return this.h.message('Could not reach the login service.');
      if (!res.ok) return this.h.message(await OnlineLogin.error(res));
      this.renderSignIn(`If ${v.e} has an account, a password reset link is on its way. Open it on this device to choose a new password.`);
    };
    pass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void doLogin();
    });
  }

  private renderNewPassword(): void {
    const b = this.body;
    b.replaceChildren();
    el('div', 'hint', b, 'Choose a new password for your account.');
    const grid = el('div', 'login-grid', b);
    const pass = this.input(grid, 'New password (at least 6 characters)', 'password', 'new-password');
    const pass2 = this.input(grid, 'Repeat the new password', 'password', 'new-password');
    const save = button(grid, 'Save password', () => void doSave(), 'btn');
    const doSave = async () => {
      if (pass.value.length < 6) return this.h.message('Passwords need at least 6 characters.');
      if (pass.value !== pass2.value) return this.h.message('The two passwords are different.');
      save.disabled = true;
      const res = await this.auth('user', { method: 'PUT', headers: { Authorization: `Bearer ${this.session?.access_token}` }, body: JSON.stringify({ password: pass.value }) }).catch(() => null);
      save.disabled = false;
      if (!res || !res.ok) return this.h.message(res ? await OnlineLogin.error(res) : 'Could not reach the login service.');
      this.h.message('Password changed. You are logged in.');
      this.renderCharacters();
    };
  }

  private async renderCharacters(): Promise<void> {
    const b = this.body;
    b.replaceChildren();
    el('div', 'hint', b, 'Loading your characters…');
    if (!(await this.ensureFresh())) return this.renderSignIn('Your login expired. Please log in again.');
    let data: { email: string; characters: Array<{ name: string; level: number; vocation: string }> };
    try {
      const res = await fetch(`${httpBase(this.h.serverUrl)}/api/characters`, { headers: { Authorization: `Bearer ${this.session!.access_token}` } });
      if (res.status === 401) {
        this.forget();
        return this.renderSignIn('Your login expired. Please log in again.');
      }
      data = await res.json();
    } catch {
      b.replaceChildren();
      el('div', 'hint', b, 'Could not load your characters. Is the server running?');
      button(b, 'Try again', () => void this.renderCharacters(), 'btn small');
      return;
    }
    b.replaceChildren();
    const who = el('div', 'login-who', b);
    el('span', '', who, `Logged in as ${data.email}`);
    button(who, 'Log out', () => {
      void this.auth('logout', { method: 'POST', headers: { Authorization: `Bearer ${this.session?.access_token}` } }).catch(() => null);
      this.forget();
      this.renderSignIn();
    }, 'btn tiny');
    const play = (name: string) => {
      const look = this.h.look();
      void this.ensureFresh().then((ok) => {
        if (!ok) return this.renderSignIn('Your login expired. Please log in again.');
        this.h.play({ url: this.h.serverUrl, name, token: this.session!.access_token, ...look });
      });
    };
    if (data.characters.length) {
      const list = el('div', 'char-list', b);
      for (const c of data.characters) {
        const voc = VOCATIONS[c.vocation as Vocation]?.name ?? c.vocation;
        const row = el('div', 'char-row', list);
        button(row, `${c.name} — level ${c.level} ${voc}`, () => play(c.name), 'btn big');
        const del = button(row, 'Delete', () => {
          // confirm in the page: type the name
          row.replaceChildren();
          el('span', 'hint', row, `Delete ${c.name} for good? Type the name to confirm:`);
          const inp = this.input(row, c.name);
          button(row, 'Delete forever', async () => {
            if (inp.value.trim().toLowerCase() !== c.name.toLowerCase()) return this.h.message('The name does not match.');
            if (!(await this.ensureFresh())) return this.renderSignIn('Your login expired. Please log in again.');
            const r = await fetch(`${httpBase(this.h.serverUrl)}/api/characters/delete`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${this.session!.access_token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: c.name }),
            }).catch(() => null);
            const j = r ? await r.json().catch(() => ({})) : {};
            if (!r || !r.ok) return this.h.message((j as { error?: string }).error ?? 'Could not delete the character.');
            this.h.message(`${c.name} was deleted.`);
            void this.renderCharacters();
          }, 'btn small danger');
          button(row, 'Cancel', () => void this.renderCharacters(), 'btn small');
        }, 'btn small');
        del.title = `Delete ${c.name} to free the slot`;
      }
    } else {
      el('div', 'hint', b, 'You have no characters yet.');
    }
    const max = this.config?.maxCharacters ?? 5;
    if (data.characters.length < max) {
      const row = el('div', 'login-grid', b);
      const name = this.input(row, 'New character name');
      el('span', 'hint', row, 'Uses the vocation and look from "Create your character"');
      button(row, 'Create & play', () => {
        const n = this.h.validName(name.value);
        if (n) play(n);
      }, 'btn');
    }
  }

  // ------------------------------------------------------------------ servers without email login

  private renderLocal(): void {
    const b = this.body;
    b.replaceChildren();
    el('div', 'hint', b, 'Log in with your character name and password. A new name creates the character with the vocation and look from "Create your character"; the password protects it from then on.');
    const grid = el('div', 'login-grid', b);
    const name = this.input(grid, 'Character name', 'text', 'username');
    try {
      name.value = store()?.getItem('thornvale.lastLogin') ?? '';
    } catch {
      /* ignore */
    }
    const pass = this.input(grid, 'Password (at least 4 characters)', 'password', 'current-password');
    const url = this.input(grid, 'Server address');
    url.value = this.h.serverUrl;
    url.spellcheck = false;
    const go = () => {
      const n = this.h.validName(name.value);
      if (!n) return;
      if (pass.value.length < 4) return this.h.message('Choose a password of at least 4 characters.');
      try {
        store()?.setItem('thornvale.lastLogin', n);
      } catch {
        /* ignore */
      }
      this.h.play({ url: url.value.trim(), name: n, password: pass.value, ...this.h.look() });
    };
    button(grid, 'Log in', go, 'btn');
    pass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
  }
}

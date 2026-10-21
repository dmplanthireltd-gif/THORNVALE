/**
 * Where the server keeps accounts and characters.
 *
 *  - SupabaseStorage (when SUPABASE_URL and SUPABASE_SERVICE_KEY are set): a Postgres
 *    database that survives restarts and redeploys. Tables: supabase/schema.sql.
 *  - FileStorage (otherwise): JSON files in server/data, fine for local play.
 *
 * Both keep a backup copy of a character before an update migrates it to a new
 * save format, so a broken migration can always be rolled back.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SaveData } from '../src/game/Game';

export interface Account {
  /** Name as typed at creation (for display). */
  name: string;
  salt: string;
  hash: string;
  created: number;
}

export interface StoredCharacter {
  name: string;
  data: SaveData;
  version: number;
  updated: number;
  /** Supabase Auth user that owns it (email login), when known. */
  owner?: string | null;
}

export interface CharacterSummary {
  name: string;
  level: number;
  vocation: string;
}

export interface Storage {
  readonly kind: string;
  getAccount(key: string): Promise<Account | null>;
  createAccount(key: string, a: Account): Promise<void>;
  touchLogin(key: string): Promise<void>;
  getCharacter(key: string): Promise<StoredCharacter | null>;
  saveCharacter(key: string, name: string, data: SaveData, owner?: string | null): Promise<void>;
  /** Characters owned by an email-login user. */
  listCharacters(owner: string): Promise<CharacterSummary[]>;
  /** The highest-level characters, best first (public highscores). */
  topCharacters(limit: number): Promise<CharacterSummary[]>;
  backupCharacter(key: string, data: unknown, version: number, reason: string): Promise<void>;
  /** Every character (for export / migration scripts). */
  allCharacters(): Promise<Array<{ key: string } & StoredCharacter>>;
  flush(): Promise<void>;
}

// ------------------------------------------------------------------ files

export class FileStorage implements Storage {
  readonly kind = 'files';
  private chars: Record<string, SaveData>;
  private accounts: Record<string, Account>;
  private backups: Array<{ key: string; data: unknown; version: number; reason: string; at: number }>;
  private dirty = false;

  constructor(private readonly charFile: string, private readonly accountFile = join(dirname(charFile), 'accounts.json'), private readonly backupFile = join(dirname(charFile), 'backups.json')) {
    this.chars = FileStorage.read(charFile, {});
    this.accounts = FileStorage.read(accountFile, {});
    this.backups = FileStorage.read(backupFile, []);
  }

  private static read<T>(file: string, fallback: T): T {
    try {
      if (!existsSync(file)) return fallback;
      return JSON.parse(readFileSync(file, 'utf8')) as T;
    } catch (err) {
      console.error(`Could not read ${file}, starting empty:`, err);
      return fallback;
    }
  }

  private static write(file: string, value: unknown): void {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 1));
    renameSync(tmp, file);
  }

  async getAccount(key: string): Promise<Account | null> {
    const a = this.accounts[key] as Partial<Account> | undefined;
    return a ? { name: a.name ?? key, salt: a.salt!, hash: a.hash!, created: a.created ?? 0 } : null;
  }

  async createAccount(key: string, a: Account): Promise<void> {
    this.accounts[key] = a;
    FileStorage.write(this.accountFile, this.accounts);
  }

  async touchLogin(): Promise<void> {
    /* not tracked in files */
  }

  async getCharacter(key: string): Promise<StoredCharacter | null> {
    const d = this.chars[key];
    if (!d) return null;
    return { name: d.player?.name ?? key, data: d, version: typeof d.version === 'number' ? d.version : 1, updated: d.savedAt ?? 0, owner: this.owners[key] ?? null };
  }

  private owners: Record<string, string> = {};

  async saveCharacter(key: string, _name: string, data: SaveData, owner?: string | null): Promise<void> {
    this.chars[key] = data;
    if (owner) this.owners[key] = owner;
    this.dirty = true;
  }

  async listCharacters(owner: string): Promise<CharacterSummary[]> {
    return Object.entries(this.owners).filter(([, o]) => o === owner).map(([k]) => {
      const d = this.chars[k];
      return { name: d?.player?.name ?? k, level: d?.player?.level ?? 1, vocation: d?.player?.vocation ?? 'knight' };
    });
  }

  async topCharacters(limit: number): Promise<CharacterSummary[]> {
    return Object.entries(this.chars)
      .map(([k, d]) => ({ name: d?.player?.name ?? k, level: d?.player?.level ?? 1, vocation: d?.player?.vocation ?? 'knight' }))
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  async backupCharacter(key: string, data: unknown, version: number, reason: string): Promise<void> {
    this.backups.push({ key, data, version, reason, at: Date.now() });
    if (this.backups.length > 500) this.backups.splice(0, this.backups.length - 500);
    FileStorage.write(this.backupFile, this.backups);
  }

  async allCharacters(): Promise<Array<{ key: string } & StoredCharacter>> {
    const out: Array<{ key: string } & StoredCharacter> = [];
    for (const key of Object.keys(this.chars)) {
      const c = await this.getCharacter(key);
      if (c) out.push({ key, ...c });
    }
    return out;
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    FileStorage.write(this.charFile, this.chars);
    this.dirty = false;
  }
}

// ------------------------------------------------------------------ Supabase (Postgres via its REST API)

export class SupabaseStorage implements Storage {
  readonly kind = 'supabase';
  private readonly base: string;
  private readonly headers: Record<string, string>;

  constructor(url: string, key: string) {
    this.base = `${url.replace(/\/+$/, '')}/rest/v1`;
    this.headers = { apikey: key, 'Content-Type': 'application/json' };
    // legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys only need apikey
    if (key.startsWith('eyJ')) this.headers.Authorization = `Bearer ${key}`;
  }

  private async req(method: string, path: string, body?: unknown, prefer?: string): Promise<unknown> {
    const res = await fetch(`${this.base}/${path}`, {
      method,
      headers: prefer ? { ...this.headers, Prefer: prefer } : this.headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase ${method} ${path.split('?')[0]} failed: ${res.status} ${text.slice(0, 300)}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /** Fails fast at start-up when the tables or key are wrong. */
  async check(): Promise<void> {
    await this.req('GET', 'accounts?select=name_key&limit=1');
    await this.req('GET', 'characters?select=name_key&limit=1');
    await this.req('GET', 'character_backups?select=id&limit=1');
  }

  async getAccount(key: string): Promise<Account | null> {
    const rows = (await this.req('GET', `accounts?name_key=eq.${encodeURIComponent(key)}&select=*`)) as Array<Record<string, unknown>>;
    const r = rows?.[0];
    if (!r) return null;
    return { name: String(r.display_name), salt: String(r.salt), hash: String(r.hash), created: Date.parse(String(r.created_at)) || 0 };
  }

  async createAccount(key: string, a: Account): Promise<void> {
    await this.req('POST', 'accounts', { name_key: key, display_name: a.name, salt: a.salt, hash: a.hash }, 'return=minimal');
  }

  async touchLogin(key: string): Promise<void> {
    await this.req('PATCH', `accounts?name_key=eq.${encodeURIComponent(key)}`, { last_login: new Date().toISOString() }, 'return=minimal');
  }

  async getCharacter(key: string): Promise<StoredCharacter | null> {
    const rows = (await this.req('GET', `characters?name_key=eq.${encodeURIComponent(key)}&select=*`)) as Array<Record<string, unknown>>;
    const r = rows?.[0];
    if (!r) return null;
    return { name: String(r.display_name), data: r.data as SaveData, version: Number(r.save_version) || 1, updated: Date.parse(String(r.updated_at)) || 0, owner: (r.owner_id as string | null) ?? null };
  }

  async listCharacters(owner: string): Promise<CharacterSummary[]> {
    const rows = (await this.req('GET', `characters?owner_id=eq.${encodeURIComponent(owner)}&select=display_name,level,vocation&order=updated_at.desc`)) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ name: String(r.display_name), level: Number(r.level) || 1, vocation: String(r.vocation ?? 'knight') }));
  }

  async topCharacters(limit: number): Promise<CharacterSummary[]> {
    const n = Math.max(1, Math.min(500, Math.floor(limit)));
    const rows = (await this.req('GET', `characters?select=display_name,level,vocation&order=level.desc,updated_at.asc&limit=${n}`)) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ name: String(r.display_name), level: Number(r.level) || 1, vocation: String(r.vocation ?? 'knight') }));
  }

  async saveCharacter(key: string, name: string, data: SaveData, owner?: string | null): Promise<void> {
    await this.req('POST', 'characters?on_conflict=name_key', {
      ...(owner ? { owner_id: owner } : {}),
      name_key: key,
      display_name: name,
      data,
      save_version: data.version,
      level: data.player.level,
      vocation: data.player.vocation ?? null,
      updated_at: new Date().toISOString(),
    }, 'resolution=merge-duplicates,return=minimal');
  }

  async backupCharacter(key: string, data: unknown, version: number, reason: string): Promise<void> {
    await this.req('POST', 'character_backups', { name_key: key, data, save_version: version, reason }, 'return=minimal');
  }

  async allCharacters(): Promise<Array<{ key: string } & StoredCharacter>> {
    const out: Array<{ key: string } & StoredCharacter> = [];
    for (let from = 0; ; from += 500) {
      const rows = (await this.req('GET', `characters?select=*&order=name_key&offset=${from}&limit=500`)) as Array<Record<string, unknown>>;
      for (const r of rows) {
        out.push({ key: String(r.name_key), name: String(r.display_name), data: r.data as SaveData, version: Number(r.save_version) || 1, updated: Date.parse(String(r.updated_at)) || 0 });
      }
      if (rows.length < 500) return out;
    }
  }

  async flush(): Promise<void> {
    /* every save is written immediately */
  }
}

/** Picks Supabase when configured, files otherwise. */
export async function openStorage(dataFile: string): Promise<Storage> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (url && key) {
    const s = new SupabaseStorage(url, key);
    await s.check();
    return s;
  }
  return new FileStorage(dataFile);
}

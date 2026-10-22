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
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SaveData } from '../src/game/Game';
import { cleanDelivery, cleanOffer, type MarketDelivery, type MarketOffer } from '../src/game/market/market';
import {
  bestTier, FOUNDER_TIERS, isFounderTier, NO_PERKS, PRODUCTS, type AccountPerks, type FounderTier, type ProductId,
} from '../src/game/premium/premium';

/** A payment to record and grant (server/payments.ts). */
export interface PurchaseGrant {
  provider: string;
  /** Provider transaction id: each is granted once. */
  txn: string;
  owner: string;
  product: ProductId;
  /** When the premium days start (opening day for founder packs bought before it). */
  start: number;
  amountMinor: number | null;
  currency: string | null;
  raw?: unknown;
}

export interface Founder {
  name: string;
  tier: FounderTier;
  no: number;
}

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
  /** Removes a character (callers back it up first). */
  deleteCharacter(key: string): Promise<void>;
  /** The highest-level characters, best first (public highscores). */
  topCharacters(limit: number): Promise<CharacterSummary[]>;
  backupCharacter(key: string, data: unknown, version: number, reason: string): Promise<void>;
  /** Every character (for export / migration scripts). */
  allCharacters(): Promise<Array<{ key: string } & StoredCharacter>>;
  flush(): Promise<void>;
  /**
   * Player market: every offer and every pending delivery. Null when this
   * storage has no market tables yet (the market then stays closed).
   */
  loadMarket(): Promise<{ offers: MarketOffer[]; deliveries: MarketDelivery[] } | null>;
  /** Inserts or updates offers (by id). */
  putMarketOffers(offers: MarketOffer[]): Promise<void>;
  deleteMarketOffers(ids: string[]): Promise<void>;
  /** Inserts or updates deliveries (by id). */
  putMarketDeliveries(deliveries: MarketDelivery[]): Promise<void>;
  deleteMarketDeliveries(ids: string[]): Promise<void>;
  /**
   * Premium store (tables account_perks, purchases). False when this storage has no
   * store tables yet: the store then stays closed and nobody has premium.
   */
  storeReady(): Promise<boolean>;
  /** An account's premium time and founder pack (NO_PERKS when it never bought anything). */
  getPerks(owner: string): Promise<AccountPerks>;
  /** Records a payment and adds what it bought, in one step; the same transaction twice is ignored. */
  grantPurchase(g: PurchaseGrant): Promise<'granted' | 'duplicate'>;
  /** Takes a payment back (refund: days and tier; chargeback: days, account flagged). */
  revokePurchase(provider: string, txn: string, kind: 'refund' | 'chargeback'): Promise<'revoked' | 'already' | 'unknown'>;
  /** Name shown on the Founders page and the Founders' Stone. */
  setFounderName(owner: string, name: string): Promise<void>;
  /** Founders who picked a name, Legends first by number. */
  listFounders(): Promise<Founder[]>;
  /** Legend packs handed out so far. */
  legendCount(): Promise<number>;
  /**
   * Tutorial: has this account finished Wayfarer's Isle once? True when the account flag
   * is set, or (with an email owner) when the account owns a character that finished it
   * or was made before the tutorial existed. `account` = 'auth:<user id>' or 'name:<name_key>'.
   */
  tutorialDone(account: string, owner?: string | null): Promise<boolean>;
  /** Sets the account's tutorial flag (kept even when that character is deleted later). */
  markTutorialDone(account: string): Promise<void>;
  /** Start-up check: 'table' when the account_flags table exists, 'derived' when only character saves can tell. */
  accountFlagsMode(): Promise<'table' | 'derived'>;
  /**
   * "Tell me when the gates open": keeps an email (lower case) for launch news, once. Throws when
   * this storage has no launch_signups table yet (the form then says sign-up isn't open).
   */
  addSignup(email: string, source: string): Promise<'added' | 'already'>;
  /** Removes a sign-up by its unsubscribe token; false when the token is unknown. */
  removeSignup(token: string): Promise<boolean>;
}

/** A stored save that counts as "finished the tutorial": made before it existed (v10 and older) or done on the island. */
function savePassedTutorial(version: number, tutorial: unknown): boolean {
  if (version < 11) return true;
  return !!tutorial && typeof tutorial === 'object' && (tutorial as { state?: unknown }).state === 'done';
}

const DAY_MS = 86_400_000;

function sortFounders(rows: Founder[]): Founder[] {
  return rows.sort((a, b) => FOUNDER_TIERS[b.tier].rank - FOUNDER_TIERS[a.tier].rank || (a.no || 1e9) - (b.no || 1e9) || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ files

export class FileStorage implements Storage {
  readonly kind = 'files';
  private chars: Record<string, SaveData>;
  private accounts: Record<string, Account>;
  private backups: Array<{ key: string; data: unknown; version: number; reason: string; at: number }>;
  private market: { offers: Record<string, MarketOffer>; deliveries: Record<string, MarketDelivery> };
  private store: { perks: Record<string, AccountPerks>; purchases: Record<string, FilePurchase> };
  private flags: Record<string, { tutorialDone?: number }>;
  private dirty = false;

  constructor(
    private readonly charFile: string,
    private readonly accountFile = join(dirname(charFile), 'accounts.json'),
    private readonly backupFile = join(dirname(charFile), 'backups.json'),
    private readonly marketFile = join(dirname(charFile), 'market.json'),
    private readonly storeFile = join(dirname(charFile), 'store.json'),
    private readonly flagFile = join(dirname(charFile), 'account-flags.json'),
    private readonly signupFile = join(dirname(charFile), 'signups.json'),
  ) {
    this.flags = FileStorage.read(flagFile, {});
    this.chars = FileStorage.read(charFile, {});
    this.accounts = FileStorage.read(accountFile, {});
    this.backups = FileStorage.read(backupFile, []);
    const m = FileStorage.read<{ offers?: Record<string, MarketOffer>; deliveries?: Record<string, MarketDelivery> }>(marketFile, {});
    this.market = { offers: m.offers ?? {}, deliveries: m.deliveries ?? {} };
    const st = FileStorage.read<{ perks?: Record<string, AccountPerks>; purchases?: Record<string, FilePurchase> }>(storeFile, {});
    this.store = { perks: st.perks ?? {}, purchases: st.purchases ?? {} };
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

  async deleteCharacter(key: string): Promise<void> {
    delete this.chars[key];
    delete this.owners[key];
    this.dirty = true;
    await this.flush();
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

  // the market file is written on every change: escrowed items must never wait for a flush

  async loadMarket(): Promise<{ offers: MarketOffer[]; deliveries: MarketDelivery[] }> {
    return {
      offers: Object.values(this.market.offers).map(cleanOffer).filter((o): o is MarketOffer => !!o),
      deliveries: Object.values(this.market.deliveries).map(cleanDelivery).filter((d): d is MarketDelivery => !!d),
    };
  }

  async putMarketOffers(offers: MarketOffer[]): Promise<void> {
    for (const o of offers) this.market.offers[o.id] = { ...o };
    FileStorage.write(this.marketFile, this.market);
  }

  async deleteMarketOffers(ids: string[]): Promise<void> {
    for (const id of ids) delete this.market.offers[id];
    FileStorage.write(this.marketFile, this.market);
  }

  async putMarketDeliveries(deliveries: MarketDelivery[]): Promise<void> {
    for (const d of deliveries) this.market.deliveries[d.id] = { ...d, items: d.items.map((i) => ({ ...i })) };
    FileStorage.write(this.marketFile, this.market);
  }

  async deleteMarketDeliveries(ids: string[]): Promise<void> {
    for (const id of ids) delete this.market.deliveries[id];
    FileStorage.write(this.marketFile, this.market);
  }

  // the store file is written on every change, like the market: payments must never wait for a flush

  async storeReady(): Promise<boolean> {
    return true;
  }

  async getPerks(owner: string): Promise<AccountPerks> {
    const p = this.store.perks[owner];
    return p ? { ...NO_PERKS, ...p } : { ...NO_PERKS };
  }

  async grantPurchase(g: PurchaseGrant): Promise<'granted' | 'duplicate'> {
    const key = `${g.provider}:${g.txn}`;
    if (this.store.purchases[key]) return 'duplicate';
    const prod = PRODUCTS[g.product];
    this.store.purchases[key] = {
      owner: g.owner, product: g.product, days: prod.days, tier: prod.tier ?? null, amountMinor: g.amountMinor, currency: g.currency,
      status: 'completed', created: Date.now(),
    };
    const cur = await this.getPerks(g.owner);
    const tier = bestTier(cur.founderTier, prod.tier ?? null);
    let no = cur.founderNo;
    if (tier === 'legend' && !no) no = Math.max(0, ...Object.values(this.store.perks).map((p) => p.founderNo || 0)) + 1;
    this.store.perks[g.owner] = {
      ...cur,
      premiumUntil: Math.max(cur.premiumUntil, g.start) + prod.days * DAY_MS,
      founderTier: tier, founderNo: no, extraSlots: tier ? FOUNDER_TIERS[tier].extraSlots : 0,
    };
    FileStorage.write(this.storeFile, this.store);
    return 'granted';
  }

  async revokePurchase(provider: string, txn: string, kind: 'refund' | 'chargeback'): Promise<'revoked' | 'already' | 'unknown'> {
    const pur = this.store.purchases[`${provider}:${txn}`];
    if (!pur) return 'unknown';
    if (pur.status !== 'completed') return 'already';
    pur.status = kind === 'chargeback' ? 'chargeback' : 'refunded';
    const cur = await this.getPerks(pur.owner);
    const next: AccountPerks = { ...cur, premiumUntil: cur.premiumUntil - pur.days * DAY_MS };
    if (kind === 'chargeback') next.flagged = true;
    else {
      let tier: FounderTier | null = null;
      for (const p of Object.values(this.store.purchases)) if (p.owner === pur.owner && p.status === 'completed' && p.tier) tier = bestTier(tier, p.tier);
      next.founderTier = tier;
      next.extraSlots = tier ? FOUNDER_TIERS[tier].extraSlots : 0;
    }
    this.store.perks[pur.owner] = next;
    FileStorage.write(this.storeFile, this.store);
    return 'revoked';
  }

  async setFounderName(owner: string, name: string): Promise<void> {
    const cur = await this.getPerks(owner);
    this.store.perks[owner] = { ...cur, founderName: name };
    FileStorage.write(this.storeFile, this.store);
  }

  async listFounders(): Promise<Founder[]> {
    return sortFounders(Object.values(this.store.perks)
      .filter((p) => p.founderTier && p.founderName)
      .map((p) => ({ name: p.founderName, tier: p.founderTier!, no: p.founderTier === 'legend' ? p.founderNo : 0 })));
  }

  async legendCount(): Promise<number> {
    return Object.values(this.store.perks).filter((p) => p.founderNo > 0).length;
  }

  async tutorialDone(account: string, owner?: string | null): Promise<boolean> {
    if (this.flags[account]?.tutorialDone) return true;
    if (!owner) return false;
    return Object.entries(this.owners).some(([k, o]) => {
      const d = this.chars[k];
      return o === owner && !!d && savePassedTutorial(typeof d.version === 'number' ? d.version : 1, d.tutorial);
    });
  }

  async markTutorialDone(account: string): Promise<void> {
    if (this.flags[account]?.tutorialDone) return;
    this.flags[account] = { ...this.flags[account], tutorialDone: Date.now() };
    FileStorage.write(this.flagFile, this.flags);
  }

  async accountFlagsMode(): Promise<'table' | 'derived'> {
    return 'table';
  }

  // launch sign-ups: written on every change (a lost email can't be asked for again)
  async addSignup(email: string, source: string): Promise<'added' | 'already'> {
    const all = FileStorage.read<Record<string, { source: string; token: string; at: number }>>(this.signupFile, {});
    if (all[email]) return 'already';
    all[email] = { source, token: randomUUID(), at: Date.now() };
    FileStorage.write(this.signupFile, all);
    return 'added';
  }

  async removeSignup(token: string): Promise<boolean> {
    const all = FileStorage.read<Record<string, { source: string; token: string; at: number }>>(this.signupFile, {});
    const key = Object.keys(all).find((k) => all[k].token === token);
    if (!key) return false;
    delete all[key];
    FileStorage.write(this.signupFile, all);
    return true;
  }
}

/** A purchase in the local store file. */
interface FilePurchase {
  owner: string;
  product: ProductId;
  days: number;
  tier: FounderTier | null;
  amountMinor: number | null;
  currency: string | null;
  status: 'completed' | 'refunded' | 'chargeback';
  created: number;
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

  async deleteCharacter(key: string): Promise<void> {
    await this.req('DELETE', `characters?name_key=eq.${encodeURIComponent(key)}`, undefined, 'return=minimal');
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

  // ---------------------------------------------------------------- market (tables market_offers, market_deliveries)

  private static iso(ms: number): string {
    return new Date(Math.min(8.64e15, Math.max(0, ms))).toISOString();
  }

  private static idList(ids: string[]): string {
    return `in.(${ids.map((id) => `"${id.replace(/[^A-Za-z0-9_-]/g, '')}"`).join(',')})`;
  }

  async loadMarket(): Promise<{ offers: MarketOffer[]; deliveries: MarketDelivery[] } | null> {
    try {
      await this.req('GET', 'market_offers?select=id&limit=1');
      await this.req('GET', 'market_deliveries?select=id&limit=1');
    } catch (err) {
      console.warn(`Market tables not found (${String((err as Error).message).slice(0, 120)}). The market stays closed until the migration is applied.`);
      return null;
    }
    const all = async (table: string): Promise<Array<Record<string, unknown>>> => {
      const out: Array<Record<string, unknown>> = [];
      for (let from = 0; ; from += 1000) {
        const rows = (await this.req('GET', `${table}?select=*&order=id&offset=${from}&limit=1000`)) as Array<Record<string, unknown>>;
        out.push(...rows);
        if (rows.length < 1000) return out;
      }
    };
    const offers = (await all('market_offers')).map((r) => cleanOffer({
      id: r.id, seller: r.seller_key, sellerName: r.seller_name, item: r.item_id, qty: Number(r.qty), price: Number(r.price),
      created: Date.parse(String(r.created_at)) || 0, expires: Date.parse(String(r.expires_at)) || Number.MAX_SAFE_INTEGER,
    })).filter((o): o is MarketOffer => !!o);
    const deliveries = (await all('market_deliveries')).map((r) => cleanDelivery({
      id: r.id, to: r.name_key, gold: Number(r.gold), items: r.items, reason: r.reason, created: Date.parse(String(r.created_at)) || 0,
    } as unknown as MarketDelivery)).filter((d): d is MarketDelivery => !!d);
    return { offers, deliveries };
  }

  async putMarketOffers(offers: MarketOffer[]): Promise<void> {
    if (!offers.length) return;
    await this.req('POST', 'market_offers?on_conflict=id', offers.map((o) => ({
      id: o.id, seller_key: o.seller, seller_name: o.sellerName, item_id: o.item, qty: o.qty, price: o.price,
      created_at: SupabaseStorage.iso(o.created), expires_at: SupabaseStorage.iso(o.expires),
    })), 'resolution=merge-duplicates,return=minimal');
  }

  async deleteMarketOffers(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.req('DELETE', `market_offers?id=${encodeURIComponent(SupabaseStorage.idList(ids))}`, undefined, 'return=minimal');
  }

  async putMarketDeliveries(deliveries: MarketDelivery[]): Promise<void> {
    if (!deliveries.length) return;
    await this.req('POST', 'market_deliveries?on_conflict=id', deliveries.map((d) => ({
      id: d.id, name_key: d.to, gold: d.gold, items: d.items, reason: d.reason, created_at: SupabaseStorage.iso(d.created),
    })), 'resolution=merge-duplicates,return=minimal');
  }

  async deleteMarketDeliveries(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.req('DELETE', `market_deliveries?id=${encodeURIComponent(SupabaseStorage.idList(ids))}`, undefined, 'return=minimal');
  }

  // ---------------------------------------------------------------- premium store (account_perks, purchases)

  async storeReady(): Promise<boolean> {
    try {
      await this.req('GET', 'account_perks?select=owner_id&limit=1');
      await this.req('GET', 'purchases?select=id&limit=1');
      return true;
    } catch (err) {
      console.warn(`Store tables not found (${String((err as Error).message).slice(0, 120)}). The store stays closed until the migration is applied.`);
      return false;
    }
  }

  private static uuid(id: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('not an account id');
    return id.toLowerCase();
  }

  async getPerks(owner: string): Promise<AccountPerks> {
    const rows = (await this.req('GET', `account_perks?owner_id=eq.${SupabaseStorage.uuid(owner)}&select=*`)) as Array<Record<string, unknown>>;
    return perksFromRow(rows?.[0]);
  }

  async grantPurchase(g: PurchaseGrant): Promise<'granted' | 'duplicate'> {
    const prod = PRODUCTS[g.product];
    const r = await this.req('POST', 'rpc/thornvale_grant_purchase', {
      p_provider: g.provider, p_txn: g.txn, p_owner: SupabaseStorage.uuid(g.owner), p_product: g.product, p_days: prod.days,
      p_start: SupabaseStorage.iso(g.start), p_tier: prod.tier ?? null, p_amount_minor: g.amountMinor, p_currency: g.currency, p_raw: g.raw ?? null,
    });
    return r === 'duplicate' ? 'duplicate' : 'granted';
  }

  async revokePurchase(provider: string, txn: string, kind: 'refund' | 'chargeback'): Promise<'revoked' | 'already' | 'unknown'> {
    const r = await this.req('POST', 'rpc/thornvale_revoke_purchase', { p_provider: provider, p_txn: txn, p_kind: kind });
    return r === 'revoked' || r === 'already' ? r : 'unknown';
  }

  async setFounderName(owner: string, name: string): Promise<void> {
    await this.req('PATCH', `account_perks?owner_id=eq.${SupabaseStorage.uuid(owner)}`, { founder_name: name, updated_at: new Date().toISOString() }, 'return=minimal');
  }

  async listFounders(): Promise<Founder[]> {
    const rows = (await this.req('GET', 'account_perks?founder_tier=not.is.null&founder_name=not.is.null&select=founder_name,founder_tier,founder_no&limit=5000')) as Array<Record<string, unknown>>;
    return sortFounders(rows.filter((r) => isFounderTier(r.founder_tier) && typeof r.founder_name === 'string' && r.founder_name)
      .map((r) => ({ name: String(r.founder_name), tier: r.founder_tier as FounderTier, no: r.founder_tier === 'legend' ? Number(r.founder_no) || 0 : 0 })));
  }

  async legendCount(): Promise<number> {
    const rows = (await this.req('GET', 'account_perks?founder_no=not.is.null&select=founder_no&order=founder_no.desc&limit=1')) as Array<Record<string, unknown>>;
    return Number(rows?.[0]?.founder_no) || 0;
  }

  // ---------------------------------------------------------------- account flags (table account_flags)

  /** null = not checked yet; false = the table is missing (migration not applied): saves alone decide. */
  private flagsTable: boolean | null = null;

  async addSignup(email: string, source: string): Promise<'added' | 'already'> {
    const rows = (await this.req('POST', 'launch_signups?on_conflict=email', { email, source }, 'resolution=ignore-duplicates,return=representation')) as unknown[] | null;
    return rows && rows.length ? 'added' : 'already';
  }

  async removeSignup(token: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
    const rows = (await this.req('DELETE', `launch_signups?unsubscribe_token=eq.${token}`, undefined, 'return=representation')) as unknown[] | null;
    return !!rows && rows.length > 0;
  }

  async accountFlagsMode(): Promise<'table' | 'derived'> {
    try {
      await this.req('GET', 'account_flags?select=account_key&limit=1');
      this.flagsTable = true;
    } catch (err) {
      console.warn(`account_flags table not found (${String((err as Error).message).slice(0, 120)}). Tutorial skipping is decided from character saves until the migration is applied.`);
      this.flagsTable = false;
    }
    return this.flagsTable ? 'table' : 'derived';
  }

  async tutorialDone(account: string, owner?: string | null): Promise<boolean> {
    if (this.flagsTable !== false) {
      try {
        const rows = (await this.req('GET', `account_flags?account_key=eq.${encodeURIComponent(account)}&select=tutorial_done_at`)) as Array<Record<string, unknown>>;
        if (rows?.[0]?.tutorial_done_at) return true;
      } catch (err) {
        console.warn('Reading account flags failed:', (err as Error).message);
      }
    }
    if (!owner) return false;
    const rows = (await this.req('GET', `characters?owner_id=eq.${encodeURIComponent(owner)}&select=save_version,tutorial:data->tutorial`)) as Array<Record<string, unknown>>;
    return rows.some((r) => savePassedTutorial(Number(r.save_version) || 1, r.tutorial));
  }

  async markTutorialDone(account: string): Promise<void> {
    if (this.flagsTable === false) return;
    await this.req('POST', 'account_flags?on_conflict=account_key', { account_key: account, tutorial_done_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
  }
}

/** Turns an account_perks row into AccountPerks. */
function perksFromRow(r: Record<string, unknown> | undefined): AccountPerks {
  if (!r) return { ...NO_PERKS };
  const tier = isFounderTier(r.founder_tier) ? r.founder_tier : null;
  return {
    premiumUntil: r.premium_until ? Date.parse(String(r.premium_until)) || 0 : 0,
    founderTier: tier,
    founderNo: Number(r.founder_no) || 0,
    extraSlots: Math.max(0, Number(r.extra_slots) || 0),
    founderName: typeof r.founder_name === 'string' ? r.founder_name : '',
    flagged: r.flagged === true,
  };
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

/**
 * Thornvale multiplayer server.
 *
 *   npm run build      # builds the browser client into dist/
 *   npm run server     # serves dist/ and the game on http://localhost:8080
 *
 * Runs the same Game simulation as single-player, authoritatively, at 20 ticks
 * per second. Clients send commands; the server sends snapshots and events.
 * Accounts and characters are stored in Supabase when SUPABASE_URL and
 * SUPABASE_SERVICE_KEY are set (see supabase/schema.sql), otherwise in JSON files
 * in server/data. Old saves are migrated on login (src/game/save/migrate.ts) and
 * backed up first.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BufferedIntent, Game, type Session } from '../src/game/Game';
import type { MarketChange } from '../src/game/market/market';
import { migrateSave, SAVE_VERSION } from '../src/game/save/migrate';
import {
  buildSnapshot, eventAudience, executeCommand, PROTOCOL_VERSION, type ClientMessage, type ServerMessage,
} from '../src/game/net/protocol';
import { decodeAppearance } from '../src/game/player/appearance';
import { setLevel } from '../src/game/admin';
import { Bots } from './bots';
import { PVP_ARENA, PVP_TEAM_MAX, PvpBots } from './pvpBots';
import { isVocation } from '../src/game/player/vocations';
import { openStorage, type Storage } from './storage';
import { handlePaddleEvent, paddleConfigFromEnv, paddleReady, verifyPaddleSignature } from './payments';
import {
  FOUNDER_SALE_FROM, FOUNDER_SALE_UNTIL, LAUNCH_AT, LEGEND_CAP, NO_PERKS, PREMIUM_RESERVED_SHARE, PRODUCTS, type AccountPerks,
} from '../src/game/premium/premium';
import { WsConnection } from './ws';
import { stagesFromEnv, stagesTable } from '../src/game/progression/stages';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(HERE, '..', 'dist'));
const SITE_DIR = resolve(process.env.SITE_DIR ?? join(HERE, '..', 'site'));
const DATA_FILE = resolve(process.env.DATA_FILE ?? join(HERE, 'data', 'characters.json'));
const TICK = 1 / 20;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 50);
/** Test commands (/level, /item, …): ALLOW_ADMIN=1 for everyone, or ADMINS="Name One,Name Two". */
/**
 * Test mode: everyone gets the test commands except /god and /kill. ON by default during the testing
 * phase so it works without touching the Render dashboard; set TEST_MODE=0 to switch it off.
 */
const TEST_MODE = process.env.TEST_MODE !== '0';
/**
 * Test commands for EVERY player: off since 2026-10-21 (owner's call), only game masters (OWNER_CHARACTERS
 * + ADMINS) have commands. PUBLIC_TEST_COMMANDS=1 turns them back on for everyone. The old ALLOW_ADMIN
 * variable is ignored on purpose (it is still "1" on Render).
 */
const ALLOW_ADMIN = process.env.PUBLIC_TEST_COMMANDS === '1';
/** Test servers: every character is raised to at least this level when it logs in (1 = off). */
const START_LEVEL = Math.max(1, Math.min(1000, Math.floor(Number(process.env.START_LEVEL ?? (TEST_MODE ? 20 : 1))) || 1));
/** Computer-controlled adventurers walking around (test servers). BOTS=0 turns them off. */
const BOT_COUNT = Math.max(0, Math.min(12, Math.floor(Number(process.env.BOTS ?? (TEST_MODE ? 6 : 0))) || 0));
const BOT_LEVEL = Math.max(1, Math.min(1000, Math.floor(Number(process.env.BOT_LEVEL ?? 500)) || 500));
/** Arena bots: two teams fighting each other beside the Thornvale temple (server/pvpBots.ts); bots per team, 0 = off. */
const PVP_BOTS = Math.max(0, Math.min(PVP_TEAM_MAX, Math.floor(Number(process.env.PVP_BOTS ?? (TEST_MODE ? PVP_TEAM_MAX : 0))) || 0));
/** Email login with password recovery (Supabase Auth). Without it, players log in with name + password. */
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
const EMAIL_AUTH = !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
const MAX_CHARACTERS_PER_ACCOUNT = Number(process.env.MAX_CHARACTERS ?? 5);
/** Game masters: the owner's characters (always) plus any names in the ADMINS env var. */
const OWNER_CHARACTERS = ['ouriolis', 'dawid'];
const ADMINS = new Set([...OWNER_CHARACTERS, ...(process.env.ADMINS ?? '').split(',')].map((n) => n.trim().toLowerCase()).filter(Boolean));
/** Game masters' accounts always have premium (shown with the premium tick), whatever the store says. */
const STAFF_PREMIUM_UNTIL = Date.UTC(2100, 0, 1);
function staffPerks(name: string, perks: AccountPerks): AccountPerks {
  return ADMINS.has(name.trim().toLowerCase()) ? { ...perks, premiumUntil: Math.max(perks.premiumUntil, STAFF_PREMIUM_UNTIL) } : perks;
}

// ------------------------------------------------------------------ storage and accounts

let storage: Storage;

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString('hex');
}

/** Checks the password, or creates the account when the name is new. */
async function authenticate(name: string, password: string): Promise<'ok' | 'created' | 'wrong'> {
  const key = name.toLowerCase();
  const acc = await storage.getAccount(key);
  if (!acc) {
    const salt = randomBytes(16).toString('hex');
    await storage.createAccount(key, { name, salt, hash: hashPassword(password, salt), created: Date.now() });
    return 'created';
  }
  const a = Buffer.from(acc.hash, 'hex');
  const b = Buffer.from(hashPassword(password, acc.salt), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'wrong';
  storage.touchLogin(key).catch(() => {});
  return 'ok';
}

/** Checks a Supabase Auth access token and returns the user it belongs to. */
async function verifyToken(token: string): Promise<{ id: string; email: string; created: number } | null> {
  if (!token || token.length > 4096) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const u = (await res.json()) as { id?: string; email?: string; created_at?: string };
    return u.id ? { id: u.id, email: u.email ?? '', created: Date.parse(u.created_at ?? '') || Date.now() } : null;
  } catch {
    return null;
  }
}

/** Which Supabase Auth user owns each online session (email login). */
const sessionOwner = new Map<number, string>();
/** The account each online session belongs to (tutorial flag): 'auth:<user id>' or 'name:<name_key>'. */
const sessionAccount = new Map<number, string>();

function accountKey(owner: string | null, nameKey: string): string {
  return owner ? `auth:${owner}` : `name:${nameKey}`;
}

/** Throttles password guessing per connection address. */
const failedLogins = new Map<string, { count: number; until: number }>();
/** Names currently logging in (between the password check and joining). */
const joining = new Set<string>();
/** The last save of each character, so a quick re-login never reads stale data. */
const pendingSaves = new Map<string, Promise<void>>();

// ------------------------------------------------------------------ game + clients

/** Players may fight each other (PVP=0 turns it off). */
const PVP = process.env.PVP !== '0';
/**
 * Premium rules (premium/premium.ts): enforced unless the server is in test mode, where every
 * character gets everything. PREMIUM=1 / PREMIUM=0 forces it either way.
 */
const PREMIUM = process.env.PREMIUM === '1' || (process.env.PREMIUM !== '0' && !TEST_MODE);
/** Paddle settings (server/payments.ts); the webhook secret only ever lives in the Render dashboard. */
const PADDLE = paddleConfigFromEnv(process.env);
/** The store tables exist in storage (set at start-up). */
let storeTables = false;
/** Exp stages (progression/stages.ts): STAGES=season|classic (default season), SEASON_STAGES JSON overrides. */
const STAGES = stagesFromEnv(process.env);
const game = new Game({ pvp: PVP, testMode: TEST_MODE, premium: PREMIUM, stages: STAGES.stages });
interface Client {
  addr: string;
  loggingIn?: boolean;
  ws: WsConnection;
  session: Session | null;
  intent: BufferedIntent;
}
const clients = new Set<Client>();

function send(c: Client, m: ServerMessage): void {
  c.ws.send(JSON.stringify(m));
}

/**
 * Saves a character as it is right now; saves of the same character run one
 * after another. `after` holds the write back until something else is stored
 * first (a market change).
 */
function saveCharacter(s: Session, after?: Promise<void>): Promise<void> {
  if (s.bot) return Promise.resolve();
  const key = s.player.name.toLowerCase();
  const data = game.serialize(s.id);
  const prev = pendingSaves.get(key) ?? Promise.resolve();
  const next = Promise.all([prev, after])
    .then(() => storage.saveCharacter(key, s.player.name, data, sessionOwner.get(s.id) ?? null))
    .catch((err) => console.error(`Saving ${s.player.name} failed:`, err));
  pendingSaves.set(key, next);
  void next.then(() => {
    if (pendingSaves.get(key) === next) pendingSaves.delete(key);
  });
  return next;
}

// ------------------------------------------------------------------ market storage

/** Market changes are stored one after another, in the order they happened. */
let marketTail: Promise<void> = Promise.resolve();

async function retry(what: string, fn: () => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= 4) throw err;
      console.warn(`${what} failed (attempt ${attempt}), retrying:`, (err as Error).message);
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

/**
 * Stores a market change so that a crash can at worst hand something out twice,
 * never lose it: new offers and deliveries first, then the characters involved
 * (as they are now), then the removals.
 */
function persistMarket(c: MarketChange): void {
  const step1 = marketTail.then(async () => {
    if (c.putOffers.length) await retry('Storing market offers', () => storage.putMarketOffers(c.putOffers));
    if (c.putDeliveries.length) await retry('Storing market deliveries', () => storage.putMarketDeliveries(c.putDeliveries));
  });
  const saves = c.save.map((id) => game.sessions.get(id)).filter((s): s is Session => !!s).map((s) => saveCharacter(s, step1));
  const done = Promise.all([step1, ...saves]).then(async () => {
    if (c.shrinkOffers.length) await retry('Updating market offers', () => storage.putMarketOffers(c.shrinkOffers));
    if (c.dropOffers.length) await retry('Removing market offers', () => storage.deleteMarketOffers(c.dropOffers));
    if (c.dropDeliveries.length) await retry('Removing market deliveries', () => storage.deleteMarketDeliveries(c.dropDeliveries));
  });
  marketTail = done.catch((err) => {
    // keep what is in memory; close the market so nothing more depends on storage that fails
    console.error('MARKET STORAGE FAILED — market closed until restart:', err);
    game.market.enabled = false;
  });
}
game.marketSink = persistMarket;

// the tutorial: an island graduate sets the account flag (later characters may skip it); test servers
// raise the level now, once the character has left the island
game.events.on((e) => {
  if (e.type !== 'tutorialDone') return;
  const s = game.sessions.get(e.to);
  if (!s || s.bot) return;
  const account = sessionAccount.get(s.id);
  if (!e.skipped && account) storage.markTutorialDone(account).catch((err) => console.error('Storing the tutorial flag failed:', err));
  if (s.player.level < START_LEVEL) {
    setLevel(game, s, START_LEVEL);
    game.msg(s.id, `Test server: your character has been raised to level ${START_LEVEL}.`, 'info');
  }
  void saveCharacter(s);
});

game.events.on((e) => {
  const to = eventAudience(e);
  if (to === null) return;
  const msg = JSON.stringify({ t: 'ev', e } satisfies ServerMessage);
  for (const c of clients) {
    if (!c.session) continue;
    if (to === -1 || c.session.id === to) c.ws.send(msg);
  }
});

const NAME_RE = /^[A-Za-z][A-Za-z '-]{1,18}[A-Za-z]$/;

async function onHello(c: Client, m: Extract<ClientMessage, { t: 'hello' }>): Promise<void> {
  if (c.session || c.loggingIn) return;
  c.loggingIn = true;
  if (m.v !== PROTOCOL_VERSION) {
    send(c, { t: 'error', text: 'Your game client is out of date. Reload the page.' });
    c.ws.close(4000);
    return;
  }
  const name = String(m.name ?? '').trim().replace(/\s+/g, ' ');
  if (!NAME_RE.test(name)) {
    send(c, { t: 'error', text: 'Names are 3–20 letters (spaces, hyphens and apostrophes allowed).' });
    c.ws.close(4001);
    return;
  }
  const password = typeof m.password === 'string' ? m.password : '';
  if (EMAIL_AUTH) {
    if (typeof m.token !== 'string' || !m.token) {
      send(c, { t: 'error', text: 'Please log in with your email first.' });
      c.ws.close(4004);
      return;
    }
  } else if (password.length < 4 || password.length > 64) {
    send(c, { t: 'error', text: 'Passwords are 4–64 characters.' });
    c.ws.close(4004);
    return;
  }
  const lock = failedLogins.get(c.addr);
  if (lock && lock.until > Date.now()) {
    send(c, { t: 'error', text: 'Too many wrong passwords. Wait a minute and try again.' });
    c.ws.close(4005);
    return;
  }
  const key = name.toLowerCase();
  if (joining.has(key)) {
    send(c, { t: 'error', text: `${name} is already logging in.` });
    c.ws.close(4002);
    return;
  }
  joining.add(key);
  try {
    await finishLogin(c, m, name, password);
  } catch (err) {
    console.error(`Login of ${name} failed:`, err);
    send(c, { t: 'error', text: 'The server could not load your character right now. Try again in a moment.' });
    c.ws.close(4010);
  } finally {
    joining.delete(key);
  }
}

async function finishLogin(c: Client, m: Extract<ClientMessage, { t: 'hello' }>, name: string, password: string): Promise<void> {
  const key = name.toLowerCase();
  let owner: string | null = null;
  let perks: AccountPerks = { ...NO_PERKS };
  if (EMAIL_AUTH) {
    const user = await verifyToken(String(m.token));
    if (!user) {
      send(c, { t: 'error', text: 'Your login has expired. Please log in again.' });
      c.ws.close(4007);
      return;
    }
    owner = user.id;
    const existing = await storage.getCharacter(key);
    if (existing && existing.owner !== user.id) {
      send(c, { t: 'error', text: `The name ${name} is already taken. Pick another name.` });
      c.ws.close(4008);
      return;
    }
    perks = await perksOf(user.id);
    // Pioneer: accounts made before the grand opening keep a free title for good
    perks.pioneer = user.created < LAUNCH_AT;
    const maxChars = MAX_CHARACTERS_PER_ACCOUNT + perks.extraSlots;
    if (!existing && (await storage.listCharacters(user.id)).length >= maxChars) {
      send(c, { t: 'error', text: `An account can have at most ${maxChars} characters.` });
      c.ws.close(4009);
      return;
    }
  }
  const auth = EMAIL_AUTH ? 'ok' : await authenticate(name, password);
  if (auth === 'wrong') {
    const f = failedLogins.get(c.addr) ?? { count: 0, until: 0 };
    f.count++;
    if (f.count >= 5) {
      f.count = 0;
      f.until = Date.now() + 60_000;
    }
    failedLogins.set(c.addr, f);
    send(c, { t: 'error', text: `Wrong password for ${name}. (New here? Pick a different name.)` });
    c.ws.close(4006);
    return;
  }
  failedLogins.delete(c.addr);
  if (!EMAIL_AUTH) perks.pioneer = ((await storage.getAccount(key))?.created ?? Date.now()) < LAUNCH_AT;
  if ([...game.sessions.values()].some((s) => s.player.name.toLowerCase() === name.toLowerCase())) {
    send(c, { t: 'error', text: `${name} is already online.` });
    c.ws.close(4002);
    return;
  }
  const online = [...game.sessions.values()].filter((x) => !x.bot).length;
  // the last places are kept for premium accounts (everyone counts as premium when it is not enforced)
  const reserved = PREMIUM ? Math.ceil(MAX_PLAYERS * PREMIUM_RESERVED_SHARE) : 0;
  perks = staffPerks(name, perks);
  const premiumNow = !PREMIUM || perks.premiumUntil > Date.now();
  if (online >= MAX_PLAYERS || (!premiumNow && online >= MAX_PLAYERS - reserved)) {
    send(c, { t: 'error', text: online >= MAX_PLAYERS ? 'The world is full. Try again later.' : 'The world is full; the last places are kept for premium accounts. Try again later.' });
    c.ws.close(4003);
    return;
  }
  await pendingSaves.get(key);
  const stored = await storage.getCharacter(key);
  const account = accountKey(owner, key);
  let migratedFrom = 0;
  if (stored) {
    const mig = migrateSave(stored.data);
    if (mig === 'newer') {
      send(c, { t: 'error', text: 'Your character was saved by a newer version of the game. Please wait for the server to update.' });
      c.ws.close(4011);
      return;
    }
    if (mig === 'invalid') {
      // keep the unreadable data safe, never overwrite it silently
      await storage.backupCharacter(key, stored.data, stored.version, 'unreadable save');
      send(c, { t: 'error', text: 'Your saved character could not be read. It has been kept safe; please contact the server owner.' });
      c.ws.close(4012);
      return;
    }
    if (mig.from < SAVE_VERSION) {
      await storage.backupCharacter(key, stored.data, mig.from, `before migration v${mig.from} -> v${SAVE_VERSION}`);
      migratedFrom = mig.from;
    }
  }
  // the tutorial: may this account skip the island? (asked only when it matters: a new character, or one still on it)
  const onIsland = !stored || (stored.data as { tutorial?: { state?: string } }).tutorial?.state === 'active';
  const canSkip = onIsland ? await storage.tutorialDone(account, owner).catch((err) => {
    console.warn('Checking the tutorial flag failed:', (err as Error).message);
    return false;
  }) : false;
  if (!c.ws.isOpen) return;
  if ([...game.sessions.values()].some((s) => s.player.name.toLowerCase() === key)) {
    send(c, { t: 'error', text: `${name} is already online.` });
    c.ws.close(4002);
    return;
  }
  const s = game.addPlayer(name, { intent: c.intent, vocation: isVocation(m.vocation) ? m.vocation : 'knight' });
  c.session = s;
  if (owner) sessionOwner.set(s.id, owner);
  // premium and founder looks first (cloak, title), so the first snapshot already shows them
  game.setPerks(s.id, perks, true);
  perksSeen.set(s.id, JSON.stringify(perks));
  sessionAccount.set(s.id, account);
  s.admin = ALLOW_ADMIN || ADMINS.has(key);
  // test mode (ALLOW_ADMIN) gives every test command except god mode and /kill; names in ADMINS get everything
  s.testOnly = !ADMINS.has(key);
  const saved = !!stored;
  if (stored) {
    if (!game.applySave(s.id, stored.data)) {
      game.removePlayer(s.id);
      c.session = null;
      send(c, { t: 'error', text: 'Your saved character could not be loaded. It has been kept safe.' });
      c.ws.close(4012);
      return;
    }
    s.player.name = stored.name || name;
    if (migratedFrom) {
      console.log(`  migrated ${name} from save v${migratedFrom} to v${SAVE_VERSION}`);
      void saveCharacter(s);
    }
    s.tutorial.canSkip = canSkip;
  } else {
    const ap = decodeAppearance(m.ap);
    if (ap) game.setAppearance(s.id, ap);
    // new characters start on Wayfarer's Isle, unless the account finished it before and the player chose to skip
    s.tutorial.canSkip = canSkip;
    if (m.skipTutorial === true && canSkip) game.startSkipped(s.id);
    else game.beginTutorial(s.id);
    void saveCharacter(s);
  }
  // test servers raise levels, but not on the tutorial island (that happens when the character leaves it)
  if (s.player.level < START_LEVEL && s.tutorial.state !== 'active') {
    setLevel(game, s, START_LEVEL);
    game.msg(s.id, `Test server: your character has been raised to level ${START_LEVEL}.`, 'info');
    void saveCharacter(s);
  }
  send(c, { t: 'welcome', id: s.id, v: PROTOCOL_VERSION, players: game.sessions.size, rates: game.stages });
  game.msg(s.id, saved ? `Welcome back to Thornvale, ${name}.` : `Welcome to Thornvale, ${name}.`, 'info');
  for (const other of game.sessions.values()) {
    if (other.id !== s.id) game.msg(other.id, `${name} has entered Thornvale.`, 'info');
  }
  console.log(`+ ${name} (${game.sessions.size} online)`);
}

function onMessage(c: Client, raw: string): void {
  let m: ClientMessage;
  try {
    m = JSON.parse(raw) as ClientMessage;
  } catch {
    return;
  }
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello') {
    void onHello(c, m);
    return;
  }
  const s = c.session;
  if (!s) return;
  const dir = (v: unknown) => (typeof v === 'number' ? Math.sign(v) : 0);
  switch (m.t) {
    case 'intent':
      c.intent.dir = { dx: dir(m.dx), dy: dir(m.dy) };
      break;
    case 'tap':
      c.intent.queued = { dx: dir(m.dx), dy: dir(m.dy) };
      break;
    case 'cmd':
      executeCommand(game, s.id, m);
      break;
  }
}

function onClose(c: Client): void {
  clients.delete(c);
  const s = c.session;
  if (!s) return;
  void saveCharacter(s).then(() => {
    sessionOwner.delete(s.id);
    sessionAccount.delete(s.id);
  });
  perksSeen.delete(s.id);
  game.removePlayer(s.id);
  for (const other of game.sessions.values()) game.msg(other.id, `${s.player.name} has left.`, 'info');
  console.log(`- ${s.player.name} (${game.sessions.size} online)`);
}

// ------------------------------------------------------------------ static files

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type' });
  res.end(JSON.stringify(body));
}

/** Small JSON API used by the title screen. */
/** Public highscores for the website: top 50 by level, admins' test characters left out, cached for a minute. */
let highscoreCache: { at: number; rows: Array<{ rank: number; name: string; level: number; vocation: string }> } | null = null;
async function highscores(): Promise<{ updated: string; rows: Array<{ rank: number; name: string; level: number; vocation: string }> }> {
  if (!highscoreCache || Date.now() - highscoreCache.at > 60_000) {
    try {
      // characters in storage only update on save, so online players' live levels are merged in
      const stored = storage ? await storage.topCharacters(80) : [];
      const best = new Map<string, { name: string; level: number; vocation: string }>();
      for (const c of stored) best.set(c.name.toLowerCase(), c);
      for (const p of game.players()) {
        const prev = best.get(p.name.toLowerCase());
        if (!prev || p.level > prev.level) best.set(p.name.toLowerCase(), { name: p.name, level: p.level, vocation: p.vocation });
      }
      const rows = [...best.values()]
        .filter((c) => !ADMINS.has(c.name.toLowerCase()))
        .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
        .slice(0, 50)
        .map((c, i) => ({ rank: i + 1, ...c }));
      highscoreCache = { at: Date.now(), rows };
    } catch (err) {
      console.error('Loading highscores failed:', err);
      if (!highscoreCache) return { updated: new Date().toISOString(), rows: [] };
    }
  }
  return { updated: new Date(highscoreCache.at).toISOString(), rows: highscoreCache.rows };
}

/** An account's perks; none when the store tables are missing (the store is closed then). */
async function perksOf(owner: string): Promise<AccountPerks> {
  return storeTables ? storage.getPerks(owner) : { ...NO_PERKS };
}

/** Last perks applied to each online session, so a refresh only touches what changed. */
const perksSeen = new Map<number, string>();

/** Re-reads the perks of online accounts (all, or one after a purchase) and applies changes. */
async function refreshPerks(only?: string): Promise<void> {
  if (!storeTables) return;
  const owners = new Map<string, number[]>();
  for (const [sid, o] of sessionOwner) {
    if (only && o !== only) continue;
    if (!game.sessions.has(sid)) continue;
    owners.set(o, [...(owners.get(o) ?? []), sid]);
  }
  for (const [o, sids] of owners) {
    try {
      const stored = await storage.getPerks(o);
      for (const sid of sids) {
        const sess = game.sessions.get(sid);
        if (!sess) continue;
        const perks = staffPerks(sess.player.name, stored);
        const j = JSON.stringify(perks);
        if (perksSeen.get(sid) === j) continue;
        perksSeen.set(sid, j);
        game.setPerks(sid, perks);
      }
    } catch (err) {
      console.error('Refreshing premium failed:', err);
    }
  }
}

/** Founders who picked a name (website and Founders' Stone), cached for a minute. */
let foundersCache: { at: number; rows: Array<{ name: string; tier: string; no: number }> } | null = null;
async function founders(): Promise<Array<{ name: string; tier: string; no: number }>> {
  if (!storeTables) return [];
  if (!foundersCache || Date.now() - foundersCache.at > 60_000) {
    try {
      foundersCache = { at: Date.now(), rows: await storage.listFounders() };
    } catch (err) {
      console.error('Loading founders failed:', err);
      if (!foundersCache) return [];
    }
  }
  return foundersCache.rows;
}

/** Updates the names carved on the Founders' Stone (Legends who picked a name). */
async function carveFoundersStone(): Promise<void> {
  const rows = await founders();
  game.foundersStone = rows.filter((r) => r.tier === 'legend' && r.no > 0).map((r) => ({ no: r.no, name: r.name }));
}

/** Reads a request body up to `limit` bytes (null when it is larger). */
async function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const ch of req) {
    size += (ch as Buffer).length;
    if (size > limit) return null;
    chunks.push(ch as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ------------------------------------------------------------------ launch news sign-up (website)

/** Sign-ups per address in the last hour: a little friction against floods. */
const signupTries = new Map<string, { count: number; since: number }>();

/** POST /api/notify {email, consent}: "tell me when the gates open". */
async function notifySignup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const fwd = req.headers['x-forwarded-for'];
  const addr = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.socket.remoteAddress || '?';
  const now = Date.now();
  const t = signupTries.get(addr);
  if (t && now - t.since < 3_600_000 && t.count >= 5) return json(res, 429, { error: 'Too many sign-ups from here. Please try again later.' });
  signupTries.set(addr, t && now - t.since < 3_600_000 ? { count: t.count + 1, since: t.since } : { count: 1, since: now });
  const raw = await readBody(req, 2048);
  let body: { email?: unknown; consent?: unknown; source?: unknown } = {};
  try {
    body = JSON.parse(raw ?? '{}');
  } catch {
    /* empty */
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: 'Enter a valid email address.' });
  if (body.consent !== true) return json(res, 400, { error: 'Tick the box to say we may email you about the opening.' });
  const source = typeof body.source === 'string' && /^[a-z-]{1,24}$/.test(body.source) ? body.source : 'website';
  try {
    await storage.addSignup(email, source);
    // the same answer either way, so the form can't be used to test which emails are on the list
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('Launch sign-up failed:', String((err as Error).message).slice(0, 200));
    return json(res, 503, { error: 'Sign-up is not open yet. Please try again later.' });
  }
}

/** GET /api/notify/unsubscribe?token=…: the link in every launch email. */
async function notifyUnsubscribe(res: ServerResponse, url: URL): Promise<void> {
  const token = url.searchParams.get('token') ?? '';
  let done = false;
  try {
    done = await storage.removeSignup(token);
  } catch {
    done = false;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thornvale</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1d1915;color:#e8dfcc;font:18px/1.5 'Palatino Linotype',Palatino,Georgia,serif;text-align:center;padding:24px"><div><p style="font:700 15px Verdana,sans-serif;letter-spacing:.22em;color:#e8c26a">THORNVALE</p><p>${done ? 'You will not get any more launch emails from us.' : 'That link has already been used, or it is not valid any more.'}</p><p><a style="color:#e8c26a" href="/">Back to thornvaleonline.com</a></p></div></body>`);
}

async function handleStore(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const now = Date.now();
  if (url.pathname === '/api/store/config') {
    const open = paddleReady(PADDLE) && storeTables && EMAIL_AUTH;
    let legendLeft = LEGEND_CAP;
    try {
      if (storeTables) legendLeft = Math.max(0, LEGEND_CAP - (await storage.legendCount()));
    } catch (err) {
      console.error('Counting Legend packs failed:', err);
    }
    json(res, 200, {
      open, env: PADDLE.env, clientToken: open ? PADDLE.clientToken : '', prices: open ? PADDLE.prices : {},
      products: Object.values(PRODUCTS), now, launchAt: LAUNCH_AT,
      founderSale: { from: FOUNDER_SALE_FROM, until: FOUNDER_SALE_UNTIL, open: now >= FOUNDER_SALE_FROM && now < FOUNDER_SALE_UNTIL },
      premiumOpen: now >= LAUNCH_AT, legendLeft,
    });
    return true;
  }
  if (url.pathname === '/api/founders') {
    json(res, 200, { rows: await founders() });
    return true;
  }
  if (url.pathname === '/api/store/me' || url.pathname === '/api/store/founder-name') {
    if (!EMAIL_AUTH) return json(res, 404, { error: 'Email login is not enabled on this server.' }), true;
    const user = await verifyToken(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
    if (!user) return json(res, 401, { error: 'Not logged in.' }), true;
    try {
      const perks = await perksOf(user.id);
      const characters = await storage.listCharacters(user.id);
      if (url.pathname === '/api/store/me') {
        json(res, 200, {
          account: user.id, email: user.email, premiumUntil: perks.premiumUntil, premiumActive: perks.premiumUntil > now && now >= LAUNCH_AT,
          founderTier: perks.founderTier, founderNo: perks.founderNo, extraSlots: perks.extraSlots, founderName: perks.founderName, characters,
        });
        return true;
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' }), true;
      if (!perks.founderTier) return json(res, 403, { error: 'Only founders can choose a founder name.' }), true;
      const raw = await readBody(req, 4096);
      let name = '';
      try {
        name = String((JSON.parse(raw ?? '{}') as { name?: unknown }).name ?? '').trim();
      } catch {
        return json(res, 400, { error: 'Bad request.' }), true;
      }
      const mine = characters.find((ch) => ch.name.toLowerCase() === name.toLowerCase());
      if (!mine) return json(res, 400, { error: 'Pick one of your own characters.' }), true;
      await storage.setFounderName(user.id, mine.name);
      foundersCache = null;
      void carveFoundersStone();
      json(res, 200, { ok: true, name: mine.name });
    } catch (err) {
      console.error('Store request failed:', err);
      json(res, 500, { error: 'The store could not load your account right now.' });
    }
    return true;
  }
  if (url.pathname === '/api/pay/webhook') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' }), true;
    if (!PADDLE.webhookSecret) return json(res, 404, { error: 'Payments are not set up.' }), true;
    const raw = await readBody(req, 1_000_000);
    if (raw === null) return json(res, 413, { error: 'Too large.' }), true;
    const sig = req.headers['paddle-signature'];
    if (!verifyPaddleSignature(raw, Array.isArray(sig) ? sig[0] : sig, PADDLE.webhookSecret)) {
      console.warn('Payment webhook: bad signature, ignored.');
      return json(res, 401, { error: 'Bad signature.' }), true;
    }
    // without the tables a payment cannot be recorded: answer an error so Paddle tries again later
    if (!storeTables) return json(res, 503, { error: 'Store tables missing.' }), true;
    try {
      const r = await handlePaddleEvent(JSON.parse(raw), PADDLE, storage);
      if (r.kind === 'granted') {
        console.log(`Payment: ${r.product} for account ${r.owner.slice(0, 8)}… (${r.txn})`);
        foundersCache = null;
        void refreshPerks(r.owner).then(carveFoundersStone);
      } else if (r.kind === 'revoked') {
        console.log(`Payment ${r.how}: ${r.txn}`);
        void refreshPerks();
      } else if (r.kind === 'ignored') console.log(`Payment webhook ignored: ${r.why}`);
      json(res, 200, { ok: true });
    } catch (err) {
      console.error('Payment webhook failed (Paddle will retry):', err);
      json(res, 500, { error: 'Try again later.' });
    }
    return true;
  }
  return false;
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (req.method === 'OPTIONS') return json(res, 204, null);
  if (url.pathname.startsWith('/api/store/') || url.pathname === '/api/founders' || url.pathname === '/api/pay/webhook') {
    if (await handleStore(req, res, url)) return;
  }
  if (url.pathname === '/api/notify' && req.method === 'POST') return notifySignup(req, res);
  if (url.pathname === '/api/notify/unsubscribe') return notifyUnsubscribe(res, url);
  if (url.pathname === '/api/auth-config') {
    // the publishable key is meant for browsers; the secret key never leaves the server
    return json(res, 200, EMAIL_AUTH ? { mode: 'email', url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY, maxCharacters: MAX_CHARACTERS_PER_ACCOUNT } : { mode: 'local' });
  }
  if (url.pathname === '/api/highscores') {
    return json(res, 200, await highscores());
  }
  if (url.pathname === '/api/characters/delete' && req.method === 'POST') {
    if (!EMAIL_AUTH) return json(res, 404, { error: 'Email login is not enabled on this server.' });
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const user = await verifyToken(token);
    if (!user) return json(res, 401, { error: 'Not logged in.' });
    let body: { name?: unknown } = {};
    try {
      const chunks: Buffer[] = [];
      for await (const ch of req) { chunks.push(ch as Buffer); if (chunks.length > 64) break; }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      return json(res, 400, { error: 'Bad request.' });
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const key = name.toLowerCase();
    if (!key) return json(res, 400, { error: 'Which character?' });
    try {
      const stored = await storage.getCharacter(key);
      if (!stored || stored.owner !== user.id) return json(res, 404, { error: 'That character is not on your account.' });
      if ([...game.sessions.values()].some((s) => s.player.name.toLowerCase() === key)) return json(res, 409, { error: `${stored.name} is online. Log out first.` });
      // keep a copy, so a deleted character can still be restored by hand
      await storage.backupCharacter(key, stored.data, stored.version, `deleted by owner ${user.id}`);
      await storage.deleteCharacter(key);
      console.log(`- deleted character ${stored.name} (backup kept)`);
      return json(res, 200, { ok: true });
    } catch (err) {
      console.error('Deleting a character failed:', err);
      return json(res, 500, { error: 'Could not delete the character.' });
    }
  }
  if (url.pathname === '/api/characters') {
    if (!EMAIL_AUTH) return json(res, 404, { error: 'Email login is not enabled on this server.' });
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const user = await verifyToken(token);
    if (!user) return json(res, 401, { error: 'Not logged in.' });
    try {
      const perks = await perksOf(user.id);
      const tutorialDone = await storage.tutorialDone(accountKey(user.id, ''), user.id).catch(() => false);
      return json(res, 200, { email: user.email, characters: await storage.listCharacters(user.id), maxCharacters: MAX_CHARACTERS_PER_ACCOUNT + perks.extraSlots, tutorialDone });
    } catch (err) {
      console.error('Listing characters failed:', err);
      return json(res, 500, { error: 'Could not load your characters.' });
    }
  }
  json(res, 404, { error: 'Not found' });
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/api/')) {
    void handleApi(req, res, url);
    return;
  }
  if (url.pathname === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    // bots are not real players: left out of the public count and list
    const real = [...game.sessions.values()].filter((x) => !x.bot).map((x) => x.player);
    res.end(JSON.stringify({ online: real.length, players: real.map((p) => ({ name: p.name, level: p.level })) }));
    return;
  }
  // The game lives under /play/ (Vite base '/play/'); /play without the slash is redirected so the
  // page's relative URLs and email sign-in links (built from location.pathname) all resolve under /play/.
  if (url.pathname === '/play') {
    res.writeHead(301, { location: `/play/${url.search}` }).end();
    return;
  }
  if (url.pathname.startsWith('/play/')) {
    const file = staticFile(STATIC_DIR, url.pathname.slice('/play'.length));
    if (file === 'forbidden') return void res.writeHead(403).end();
    if (!file) {
      if (!existsSync(join(STATIC_DIR, 'index.html'))) {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Thornvale server is running, but the client is not built yet. Run "npm run build" first.');
        return;
      }
      return void res.writeHead(404).end('Not found');
    }
    return sendFile(res, file, 200);
  }
  // Everything else is the marketing website (static files in site/).
  const page = staticFile(SITE_DIR, url.pathname);
  if (page === 'forbidden') return void res.writeHead(403).end();
  if (page) return sendFile(res, page, 200, req.headers.range);
  const missing = join(SITE_DIR, '404.html');
  if (existsSync(missing)) return sendFile(res, missing, 404);
  res.writeHead(404).end('Not found');
}

/** Maps a URL path onto a file inside root: folders serve their index.html. Refuses paths that escape root. */
function staticFile(root: string, pathname: string): string | null | 'forbidden' {
  let rel: string;
  try {
    rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  } catch {
    return 'forbidden';
  }
  let file = resolve(root, rel || 'index.html');
  if (file !== root && !file.startsWith(root + sep)) return 'forbidden';
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

function sendFile(res: ServerResponse, file: string, status: number, range?: string): void {
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const size = statSync(file).size;
  // music and video files don't change under the same name between deploys: let browsers keep them a day
  const cache = /\.(m4a|mp3|mp4|webm)$/.test(file) ? 'public, max-age=86400' : 'no-cache';
  // Byte ranges let browsers (Safari in particular) stream and seek video; other files are sent whole.
  const m = status === 200 && range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'cache-control': cache });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(status, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': cache });
  createReadStream(file).pipe(res);
}

// ------------------------------------------------------------------ boot

const http = createServer(serveStatic);
http.on('upgrade', (req, socket) => {
  if (!(req.url ?? '').startsWith('/ws')) {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
  }
  const ws = WsConnection.accept(req, socket);
  if (!ws) return;
  const fwd = req.headers['x-forwarded-for'];
  const addr = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.socket.remoteAddress || '?';
  const c: Client = { addr, ws, session: null, intent: new BufferedIntent() };
  clients.add(c);
  ws.onMessage = (t) => onMessage(c, t);
  ws.onClose = () => onClose(c);
});

let last = performance.now();
let acc = 0;
let snapTick = 0;
const SNAP_EVERY = 1;
const bots = BOT_COUNT > 0 ? new Bots(game, BOT_COUNT, BOT_LEVEL) : null;
if (bots) console.log(`Bots: ${BOT_COUNT} at level ${BOT_LEVEL}`);
const pvpBots = PVP && PVP_BOTS > 0 ? new PvpBots(game, PVP_BOTS) : null;
if (pvpBots) console.log(`Arena bots: ${PVP_BOTS} vs ${PVP_BOTS} on the ${PVP_ARENA.name} (${PVP_ARENA.x0},${PVP_ARENA.y0})-(${PVP_ARENA.x1},${PVP_ARENA.y1})`);
setInterval(() => {
  const now = performance.now();
  acc += Math.min(0.5, (now - last) / 1000);
  last = now;
  while (acc >= TICK) {
    game.update(TICK);
    bots?.update(TICK);
    pvpBots?.update(TICK);
    acc -= TICK;
  }
  // one snapshot per tick (20 a second); bulky unchanged parts are left out (see protocol.ts)
  if ((snapTick = (snapTick + 1) % SNAP_EVERY) === 0) for (const c of clients) if (c.session) send(c, buildSnapshot(game, c.session));
  for (const s of game.sessions.values()) {
    if (s.wantsSave) {
      s.wantsSave = false;
      void saveCharacter(s);
    }
  }
}, TICK * 1000);

// purchases made in the browser reach characters that are already online
setInterval(() => void refreshPerks(), 60_000);
setInterval(() => void carveFoundersStone(), 5 * 60_000);

setInterval(() => {
  for (const s of game.sessions.values()) void saveCharacter(s);
  storage?.flush().catch((err) => console.error('Flushing saves failed:', err));
}, 30_000);

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log('Saving everyone before shutting down…');
  // Render and similar hosts send SIGTERM before a redeploy: make sure every save lands first
  await Promise.all([...game.sessions.values()].map((s) => saveCharacter(s)));
  await marketTail;
  await Promise.all([...pendingSaves.values()]);
  await storage.flush().catch((err) => console.error(err));
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

storage = await openStorage(DATA_FILE);
const market = await storage.loadMarket().catch((err) => {
  console.error('Loading the market failed:', err);
  return null;
});
if (market) game.market.load(market.offers, market.deliveries);
else game.market.enabled = false;
storeTables = await storage.storeReady().catch(() => false);
await carveFoundersStone();
console.log(`Login: ${EMAIL_AUTH ? 'email (Supabase Auth)' : 'character name + password'}`);
console.log(market ? `Market: open (${market.offers.length} offers, ${market.deliveries.length} deliveries waiting)` : 'Market: closed (no market tables in storage yet)');
console.log(`Saves: ${storage.kind === 'supabase' ? 'Supabase database' : `files in ${dirname(DATA_FILE)}`} (save format v${SAVE_VERSION})`);
console.log(`Tutorial flags: ${await storage.accountFlagsMode()}`);
console.log(`PvP: ${PVP ? 'on' : 'off'}`);
console.log(`Exp stages: ${STAGES.stages.name}${STAGES.warning ? ` (${STAGES.warning})` : ''} — ${stagesTable(STAGES.stages).join('; ')}`);
console.log(`Premium: ${PREMIUM ? 'enforced (free heartland, premium regions)' : 'open to everyone (test mode)'}`);
console.log(`Store: ${!storeTables ? 'closed (no store tables in storage yet)' : !EMAIL_AUTH ? 'closed (needs email login)' : paddleReady(PADDLE) ? `open (Paddle ${PADDLE.env}, ${Object.keys(PADDLE.prices).length} prices)` : 'closed (Paddle not set up yet)'}`);
if (START_LEVEL > 1) console.log(`Test server: characters start at level ${START_LEVEL}`);
console.log(`Test mode: ${TEST_MODE ? 'on' : 'off'}; test commands: ${ALLOW_ADMIN ? 'everyone (not /god or /kill)' : 'game masters only'}`);
if (storage.kind !== 'supabase' && process.env.RENDER) {
  console.warn('WARNING: running on Render without SUPABASE_URL / SUPABASE_SERVICE_KEY — characters are lost on every restart.');
}
http.listen(PORT, () => {
  console.log(`Thornvale server on http://localhost:${PORT}  (websocket: ws://localhost:${PORT}/ws)`);
  if (!existsSync(join(STATIC_DIR, 'index.html'))) console.log('Note: no client build found in dist/ — run "npm run build".');
});

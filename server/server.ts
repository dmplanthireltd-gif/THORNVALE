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
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BufferedIntent, Game, type Session } from '../src/game/Game';
import { migrateSave, SAVE_VERSION } from '../src/game/save/migrate';
import {
  buildSnapshot, eventAudience, executeCommand, PROTOCOL_VERSION, type ClientMessage, type ServerMessage,
} from '../src/game/net/protocol';
import { isOutfit } from '../src/game/player/outfits';
import { isVocation } from '../src/game/player/vocations';
import { openStorage, type Storage } from './storage';
import { WsConnection } from './ws';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(HERE, '..', 'dist'));
const DATA_FILE = resolve(process.env.DATA_FILE ?? join(HERE, 'data', 'characters.json'));
const TICK = 1 / 20;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 50);
/** Test commands (/level, /item, …): ALLOW_ADMIN=1 for everyone, or ADMINS="Name One,Name Two". */
const ALLOW_ADMIN = process.env.ALLOW_ADMIN === '1';
const ADMINS = new Set((process.env.ADMINS ?? '').split(',').map((n) => n.trim().toLowerCase()).filter(Boolean));

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

/** Throttles password guessing per connection address. */
const failedLogins = new Map<string, { count: number; until: number }>();
/** Names currently logging in (between the password check and joining). */
const joining = new Set<string>();
/** The last save of each character, so a quick re-login never reads stale data. */
const pendingSaves = new Map<string, Promise<void>>();

// ------------------------------------------------------------------ game + clients

const game = new Game();
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

/** Saves a character; saves of the same character run one after another. */
function saveCharacter(s: Session): Promise<void> {
  const key = s.player.name.toLowerCase();
  const data = game.serialize(s.id);
  const prev = pendingSaves.get(key) ?? Promise.resolve();
  const next = prev
    .then(() => storage.saveCharacter(key, s.player.name, data))
    .catch((err) => console.error(`Saving ${s.player.name} failed:`, err));
  pendingSaves.set(key, next);
  void next.then(() => {
    if (pendingSaves.get(key) === next) pendingSaves.delete(key);
  });
  return next;
}

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
  if (password.length < 4 || password.length > 64) {
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
  const auth = await authenticate(name, password);
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
  if ([...game.sessions.values()].some((s) => s.player.name.toLowerCase() === name.toLowerCase())) {
    send(c, { t: 'error', text: `${name} is already online.` });
    c.ws.close(4002);
    return;
  }
  if (game.sessions.size >= MAX_PLAYERS) {
    send(c, { t: 'error', text: 'The world is full. Try again later.' });
    c.ws.close(4003);
    return;
  }
  await pendingSaves.get(key);
  const stored = await storage.getCharacter(key);
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
  if (!c.ws.isOpen) return;
  if ([...game.sessions.values()].some((s) => s.player.name.toLowerCase() === key)) {
    send(c, { t: 'error', text: `${name} is already online.` });
    c.ws.close(4002);
    return;
  }
  const s = game.addPlayer(name, { intent: c.intent, vocation: isVocation(m.vocation) ? m.vocation : 'knight' });
  c.session = s;
  s.admin = ALLOW_ADMIN || ADMINS.has(key);
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
  } else {
    if (isOutfit(m.outfit)) game.setOutfit(s.id, m.outfit);
    void saveCharacter(s);
  }
  send(c, { t: 'welcome', id: s.id, v: PROTOCOL_VERSION, players: game.sessions.size });
  game.msg(s.id, saved ? `Welcome back to Thornvale, ${name}.` : `Welcome to Thornvale, ${name}. Captain Aldric waits on the plaza.`, 'info');
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
  void saveCharacter(s);
  game.removePlayer(s.id);
  for (const other of game.sessions.values()) game.msg(other.id, `${s.player.name} has left.`, 'info');
  console.log(`- ${s.player.name} (${game.sessions.size} online)`);
}

// ------------------------------------------------------------------ static files

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ online: game.sessions.size, players: game.players().map((p) => ({ name: p.name, level: p.level })) }));
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = resolve(STATIC_DIR, rel || 'index.html');
  if (!file.startsWith(STATIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    if (!existsSync(join(STATIC_DIR, 'index.html'))) {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Thornvale server is running, but the client is not built yet. Run "npm run build" first.');
      return;
    }
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
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
setInterval(() => {
  const now = performance.now();
  acc += Math.min(0.5, (now - last) / 1000);
  last = now;
  while (acc >= TICK) {
    game.update(TICK);
    acc -= TICK;
  }
  for (const c of clients) if (c.session) send(c, buildSnapshot(game, c.session));
  for (const s of game.sessions.values()) {
    if (s.wantsSave) {
      s.wantsSave = false;
      void saveCharacter(s);
    }
  }
}, TICK * 1000);

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
  await Promise.all([...pendingSaves.values()]);
  await storage.flush().catch((err) => console.error(err));
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

storage = await openStorage(DATA_FILE);
console.log(`Saves: ${storage.kind === 'supabase' ? 'Supabase database' : `files in ${dirname(DATA_FILE)}`} (save format v${SAVE_VERSION})`);
if (storage.kind !== 'supabase' && process.env.RENDER) {
  console.warn('WARNING: running on Render without SUPABASE_URL / SUPABASE_SERVICE_KEY — characters are lost on every restart.');
}
http.listen(PORT, () => {
  console.log(`Thornvale server on http://localhost:${PORT}  (websocket: ws://localhost:${PORT}/ws)`);
  if (!existsSync(join(STATIC_DIR, 'index.html'))) console.log('Note: no client build found in dist/ — run "npm run build".');
});

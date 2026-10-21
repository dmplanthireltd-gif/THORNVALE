/**
 * Thornvale multiplayer server.
 *
 *   npm run build      # builds the browser client into dist/
 *   npm run server     # serves dist/ and the game on http://localhost:8080
 *
 * Runs the same Game simulation as single-player, authoritatively, at 20 ticks
 * per second. Clients send commands; the server sends snapshots and events.
 * Characters are stored by name in server/data/characters.json.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BufferedIntent, Game, isSaveData, type SaveData, type Session } from '../src/game/Game';
import {
  buildSnapshot, eventAudience, executeCommand, PROTOCOL_VERSION, type ClientMessage, type ServerMessage,
} from '../src/game/net/protocol';
import { isOutfit } from '../src/game/player/outfits';
import { isVocation } from '../src/game/player/vocations';
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

// ------------------------------------------------------------------ character storage

type Store = Record<string, SaveData>;

function loadStore(): Store {
  try {
    if (!existsSync(DATA_FILE)) return {};
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Store;
    return raw && typeof raw === 'object' ? raw : {};
  } catch (err) {
    console.error('Could not read character file, starting empty:', err);
    return {};
  }
}

const store = loadStore();
let storeDirty = false;

function flushStore(): void {
  if (!storeDirty) return;
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 1));
  renameSync(tmp, DATA_FILE);
  storeDirty = false;
}

// ------------------------------------------------------------------ game + clients

const game = new Game();
interface Client {
  ws: WsConnection;
  session: Session | null;
  intent: BufferedIntent;
}
const clients = new Set<Client>();

function send(c: Client, m: ServerMessage): void {
  c.ws.send(JSON.stringify(m));
}

function saveCharacter(s: Session): void {
  store[s.player.name.toLowerCase()] = game.serialize(s.id);
  storeDirty = true;
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

function onHello(c: Client, m: Extract<ClientMessage, { t: 'hello' }>): void {
  if (c.session) return;
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
  const saved = store[name.toLowerCase()];
  const s = game.addPlayer(name, { intent: c.intent, vocation: isVocation(m.vocation) ? m.vocation : 'knight' });
  c.session = s;
  s.admin = ALLOW_ADMIN || ADMINS.has(name.toLowerCase());
  if (saved && isSaveData(saved)) {
    game.applySave(s.id, saved);
    s.player.name = name;
  } else if (isOutfit(m.outfit)) {
    game.setOutfit(s.id, m.outfit);
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
  if (m.t === 'hello') return onHello(c, m);
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
  saveCharacter(s);
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
  const c: Client = { ws, session: null, intent: new BufferedIntent() };
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
      saveCharacter(s);
      s.wantsSave = false;
    }
  }
}, TICK * 1000);

setInterval(() => {
  for (const s of game.sessions.values()) saveCharacter(s);
  flushStore();
}, 30_000);

function shutdown(): void {
  for (const s of game.sessions.values()) saveCharacter(s);
  flushStore();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

http.listen(PORT, () => {
  console.log(`Thornvale server on http://localhost:${PORT}  (websocket: ws://localhost:${PORT}/ws)`);
  if (!existsSync(join(STATIC_DIR, 'index.html'))) console.log('Note: no client build found in dist/ — run "npm run build".');
});

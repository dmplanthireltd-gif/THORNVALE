/**
 * Bunker 47 — the owner's separate zombie co-op game, hosted on the Thornvale server at an
 * unlisted address (not linked from the website, noindex). Nothing here touches Thornvale's
 * game, saves or protocol.
 *
 *   GET  <BUNKER_PATH>        the game page (games/bunker47.html)
 *   WS   /b47ws               co-op relay: every socket joins one room ("lobby" or a game code)
 *                             and shares a presence object with the others in that room.
 *
 * Relay messages (JSON text frames):
 *   client → server  {t:'hi', room}            first message: join a room
 *                    {t:'p', s}                set my presence (object, ≤ 24 KB)
 *   server → client  {t:'init', you, peers}    peers = [[id, presence|null], …]
 *                    {t:'j', id} / {t:'l', id} someone joined / left
 *                    {t:'p', id, s}            someone's presence changed
 *                    {t:'full'}                room is full (socket is closed)
 * The relay keeps nothing on disk; rooms vanish when their last player leaves.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WsConnection } from './ws';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Unlisted address of the game. BUNKER_PATH in the Render dashboard overrides it (e.g. "/my-secret-game/"). */
export const BUNKER_PATH = normalisePath(process.env.BUNKER_PATH ?? '/bunker47-563f4cb0f8/');
export const BUNKER_FILE = resolve(join(HERE, '..', 'games', 'bunker47.html'));
export const BUNKER_WS = '/b47ws';
/** The owner's songs and voice lines, served next to the page: <BUNKER_PATH>song.mp3 (radio easter egg), deadlock.mp3 (boss theme), vo-*.mp3 (voice lines). */
export const BUNKER_SONGS: Record<string, string> = {
  // gun models (Styloo Guns Asset Pack, CC0; textures recompressed to JPEG)
  'gun-ak47.glb': resolve(join(HERE, '..', 'games', 'bunker47-gun-ak47.glb')),
  'gun-awp.glb': resolve(join(HERE, '..', 'games', 'bunker47-gun-awp.glb')),
  'gun-mac10.glb': resolve(join(HERE, '..', 'games', 'bunker47-gun-mac10.glb')),
  'gun-pew.glb': resolve(join(HERE, '..', 'games', 'bunker47-gun-pew.glb')),
  'gun-rocketlaucher.glb': resolve(join(HERE, '..', 'games', 'bunker47-gun-rocketlaucher.glb')),
  'gun-shotgun.glb': resolve(join(HERE, '..', 'games', 'bunker47-gun-shotgun.glb')),
  // photo textures (CC0 Poly Haven sets, baked to 1K JPG)
  'tex-asphalt_02_diff.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-asphalt_02_diff.jpg')),
  'tex-asphalt_02_nor.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-asphalt_02_nor.jpg')),
  'tex-asphalt_02_rough.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-asphalt_02_rough.jpg')),
  'tex-concrete_wall_007_diff.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-concrete_wall_007_diff.jpg')),
  'tex-concrete_wall_007_nor.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-concrete_wall_007_nor.jpg')),
  'tex-concrete_wall_007_rough.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-concrete_wall_007_rough.jpg')),
  'tex-damaged_concrete_floor_diff.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-damaged_concrete_floor_diff.jpg')),
  'tex-damaged_concrete_floor_nor.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-damaged_concrete_floor_nor.jpg')),
  'tex-damaged_concrete_floor_rough.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-damaged_concrete_floor_rough.jpg')),
  'tex-dark_wooden_planks_diff.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-dark_wooden_planks_diff.jpg')),
  'tex-dark_wooden_planks_nor.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-dark_wooden_planks_nor.jpg')),
  'tex-dark_wooden_planks_rough.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-dark_wooden_planks_rough.jpg')),
  'tex-red_brick_diff.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-red_brick_diff.jpg')),
  'tex-red_brick_nor.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-red_brick_nor.jpg')),
  'tex-red_brick_rough.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-red_brick_rough.jpg')),
  'tex-rocky_terrain_02_diff.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-rocky_terrain_02_diff.jpg')),
  'tex-rocky_terrain_02_nor.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-rocky_terrain_02_nor.jpg')),
  'tex-rocky_terrain_02_rough.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-rocky_terrain_02_rough.jpg')),
  'tex-rusty_corrugated_iron_diff.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-rusty_corrugated_iron_diff.jpg')),
  'tex-rusty_corrugated_iron_nor.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-rusty_corrugated_iron_nor.jpg')),
  'tex-rusty_corrugated_iron_rough.jpg': resolve(join(HERE, '..', 'games', 'bunker47-tex-rusty_corrugated_iron_rough.jpg')),
  'song.mp3': resolve(join(HERE, '..', 'games', 'bunker47-song.mp3')),
  'deadlock.mp3': resolve(join(HERE, '..', 'games', 'bunker47-deadlock.mp3')),
  // voice lines
  'vo-reload-1.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-reload-1.mp3')),
  'vo-reload-2.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-reload-2.mp3')),
  'vo-down-1.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-down-1.mp3')),
  'vo-kill-1.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-kill-1.mp3')),
  'vo-kill-2.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-kill-2.mp3')),
  'vo-boss-1.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-boss-1.mp3')),
  'vo-boss-2.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-boss-2.mp3')),
  'vo-miseh.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-miseh.mp3')),
  'vo-hungry.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-hungry.mp3')),
  'vo-nuhave.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-nuhave.mp3')),
  'vo-insta.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-insta.mp3')),
  'vo-start.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-start.mp3')),
  // background music (optional: the game falls back to its built-in riddim when these are missing)
  'music-calm.mp3': resolve(join(HERE, '..', 'games', 'bunker47-music-calm.mp3')),
  'music-fight.mp3': resolve(join(HERE, '..', 'games', 'bunker47-music-fight.mp3')),
  'music-fight2.mp3': resolve(join(HERE, '..', 'games', 'bunker47-music-fight2.mp3')),
  'vo-perk-bulwark.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-bulwark.mp3')),
  'vo-perk-fleet.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-fleet.mp3')),
  'vo-perk-rapid.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-rapid.mp3')),
  'vo-perk-revive.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-revive.mp3')),
  'vo-perk-swift.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-swift.mp3')),
  'vo-perk-mule.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-mule.mp3')),
  'vo-perk-steady.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-steady.mp3')),
  'vo-perk-blast.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-blast.mp3')),
  'vo-perk-echo.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-echo.mp3')),
  'vo-perk-dropbass.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-dropbass.mp3')),
  'vo-perk-vibes.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-vibes.mp3')),
  'vo-perk-slap.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-slap.mp3')),
  'vo-perk-nuff.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-perk-nuff.mp3')),
  'vo-revive-1.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-revive-1.mp3')),
  'vo-round-1.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-round-1.mp3')),
  'vo-round-2.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-round-2.mp3')),
  'vo-mate-down.mp3': resolve(join(HERE, '..', 'games', 'bunker47-vo-mate-down.mp3')),
};

const MAX_SOCKETS = 400;
const MAX_LOBBY = 300;
const MAX_ROOM = 8;
const MAX_PRESENCE = 24 * 1024;
/** messages a socket may send per second (bursts up to 2 s worth) */
const RATE = 30;

interface Peer { id: string; ws: WsConnection; room: Room | null; presence: string | null; tokens: number; last: number }
interface Room { name: string; peers: Map<string, Peer> }

const rooms = new Map<string, Room>();
let sockets = 0;

function normalisePath(p: string): string {
  let s = p.trim();
  if (!s.startsWith('/')) s = '/' + s;
  if (!s.endsWith('/')) s += '/';
  return s;
}

export function bunkerReady(): boolean {
  return existsSync(BUNKER_FILE);
}

/** Accepts a websocket on /b47ws. */
export function acceptBunker(req: IncomingMessage, socket: Duplex): void {
  if (sockets >= MAX_SOCKETS) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    return;
  }
  const ws = WsConnection.accept(req, socket);
  if (!ws) return;
  sockets++;
  const peer: Peer = { id: randomBytes(6).toString('hex'), ws, room: null, presence: null, tokens: RATE * 2, last: Date.now() };
  ws.onMessage = (text) => onMessage(peer, text);
  ws.onClose = () => {
    sockets--;
    leave(peer);
  };
}

function onMessage(peer: Peer, text: string): void {
  const now = Date.now();
  peer.tokens = Math.min(RATE * 2, peer.tokens + ((now - peer.last) / 1000) * RATE);
  peer.last = now;
  if (peer.tokens < 1) return; // over the rate: dropped (presence is absolute state, the next one catches up)
  peer.tokens--;
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    return;
  }
  if (!m || typeof m !== 'object') return;
  const msg = m as { t?: unknown; room?: unknown; s?: unknown };
  if (msg.t === 'hi' && !peer.room) {
    const name = typeof msg.room === 'string' ? msg.room.toLowerCase() : '';
    if (!/^[a-z0-9-]{1,24}$/.test(name)) return void peer.ws.close(1008);
    joinRoom(peer, name);
  } else if (msg.t === 'p' && peer.room) {
    if (!msg.s || typeof msg.s !== 'object' || Array.isArray(msg.s)) return;
    const s = JSON.stringify(msg.s);
    if (s.length > MAX_PRESENCE) return;
    peer.presence = s;
    broadcast(peer.room, `{"t":"p","id":"${peer.id}","s":${s}}`, peer);
  }
}

function joinRoom(peer: Peer, name: string): void {
  let room = rooms.get(name);
  const cap = name === 'lobby' ? MAX_LOBBY : MAX_ROOM;
  if (room && room.peers.size >= cap) {
    peer.ws.send('{"t":"full"}');
    peer.ws.close(1008);
    return;
  }
  if (!room) {
    room = { name, peers: new Map() };
    rooms.set(name, room);
  }
  const list = [...room.peers.values()].map((p) => `["${p.id}",${p.presence ?? 'null'}]`).join(',');
  peer.ws.send(`{"t":"init","you":"${peer.id}","peers":[${list}]}`);
  broadcast(room, `{"t":"j","id":"${peer.id}"}`, peer);
  room.peers.set(peer.id, peer);
  peer.room = room;
}

function leave(peer: Peer): void {
  const room = peer.room;
  if (!room) return;
  peer.room = null;
  room.peers.delete(peer.id);
  if (room.peers.size === 0) rooms.delete(room.name);
  else broadcast(room, `{"t":"l","id":"${peer.id}"}`, null);
}

function broadcast(room: Room, text: string, except: Peer | null): void {
  for (const p of room.peers.values()) if (p !== except && p.ws.isOpen) p.ws.send(text);
}

// ------------------------------------------------------------------ leaderboard
//   GET  /api/b47/scores   top 20: best round, then most kills
//   POST /api/b47/scores   {name, round, kills, heads, points, squad} — one row per player per finished game
// Stored in the Supabase table b47_scores (supabase/migrations/20261024_bunker47_scores.sql) when the
// server has SUPABASE_URL + SUPABASE_SERVICE_KEY and the table exists; otherwise kept in memory
// (gone after a restart). Scores come from the players' browsers, so they are sanity-checked, not trusted.

interface Score { name: string; round: number; kills: number; heads: number; points: number; squad: number; at: string }
const SB_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
let tableOk: boolean | null = SB_URL && SB_KEY ? null : false;
const memory: Score[] = [];
let cache: { at: number; rows: Score[] } | null = null;
const posts = new Map<string, { count: number; since: number }>();

function sbHeaders(): Record<string, string> {
  const h: Record<string, string> = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  if (SB_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SB_KEY}`;
  return h;
}
async function sb(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`b47_scores ${method} failed: ${res.status}`);
  const text = res.status === 204 ? '' : await res.text();
  return text ? JSON.parse(text) : null;
}
function sortRows(rows: Score[]): Score[] {
  return rows.sort((a, b) => b.round - a.round || b.kills - a.kills || a.at.localeCompare(b.at)).slice(0, 20);
}
async function topScores(): Promise<Score[]> {
  if (cache && Date.now() - cache.at < 15_000) return cache.rows;
  let rows: Score[] = sortRows([...memory]);
  if (tableOk !== false) {
    try {
      const got = await sb('GET', 'b47_scores?select=name,round,kills,heads,points,squad,created_at&order=round.desc,kills.desc,created_at.asc&limit=20') as Array<Record<string, unknown>>;
      tableOk = true;
      rows = (got ?? []).map((r) => ({ name: String(r.name), round: Number(r.round), kills: Number(r.kills), heads: Number(r.heads), points: Number(r.points), squad: Number(r.squad), at: String(r.created_at) }));
    } catch (err) {
      if (tableOk === null) console.warn('Bunker 47 leaderboard: table b47_scores not reachable, keeping scores in memory.', (err as Error).message);
      tableOk = false;
    }
  }
  cache = { at: Date.now(), rows };
  return rows;
}
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readSmall(req: IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolveBody) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > limit) { req.destroy(); resolveBody(null); } else chunks.push(c); });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolveBody(null));
  });
}
const int = (v: unknown, lo: number, hi: number): number | null => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

/** Handles /api/b47/*. Returns false when the path is not ours. */
export async function handleBunkerApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (pathname !== '/api/b47/scores') return false;
  if (req.method === 'GET') { sendJson(res, 200, { rows: await topScores(), stored: tableOk ? 'database' : 'memory' }); return true; }
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return true; }
  const fwd = req.headers['x-forwarded-for'];
  const addr = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.socket.remoteAddress || '?';
  const now = Date.now(), t = posts.get(addr);
  if (t && now - t.since < 600_000 && t.count >= 8) { sendJson(res, 429, { error: 'Too many scores from here, try later.' }); return true; }
  posts.set(addr, t && now - t.since < 600_000 ? { count: t.count + 1, since: t.since } : { count: 1, since: now });
  let b: Record<string, unknown> = {};
  try { b = JSON.parse((await readSmall(req, 1024)) ?? '{}'); } catch { /* empty */ }
  const name = typeof b.name === 'string' ? b.name.replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 16) : '';
  const round = int(b.round, 1, 999), kills = int(b.kills, 0, 100_000), heads = int(b.heads, 0, 100_000), points = int(b.points, 0, 50_000_000), squad = int(b.squad, 1, 8);
  if (!name || round === null || kills === null || heads === null || points === null || squad === null || heads > kills || kills > round * 60 + 60) { sendJson(res, 400, { error: 'Score rejected.' }); return true; }
  const row: Score = { name, round, kills, heads, points, squad, at: new Date().toISOString() };
  await topScores();
  if (tableOk) {
    try { await sb('POST', 'b47_scores', { name, round, kills, heads, points, squad }); }
    catch (err) { console.error('Saving a Bunker 47 score failed:', (err as Error).message); memory.push(row); }
  } else { memory.push(row); if (memory.length > 500) { sortRows(memory); memory.length = 200; } }
  cache = null;
  const rows = await topScores();
  const rank = rows.findIndex((r) => r.name === name && r.round === round && r.kills === kills) + 1;
  sendJson(res, 200, { ok: true, rank: rank || null, rows });
  return true;
}

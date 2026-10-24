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
import type { IncomingMessage } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WsConnection } from './ws';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Unlisted address of the game. BUNKER_PATH in the Render dashboard overrides it (e.g. "/my-secret-game/"). */
export const BUNKER_PATH = normalisePath(process.env.BUNKER_PATH ?? '/bunker47-563f4cb0f8/');
export const BUNKER_FILE = resolve(join(HERE, '..', 'games', 'bunker47.html'));
export const BUNKER_WS = '/b47ws';

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

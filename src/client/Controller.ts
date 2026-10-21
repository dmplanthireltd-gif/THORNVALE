import type { GameEvent } from '../game/core/events';
import { BufferedIntent, Game, type Session, type TradeView } from '../game/Game';
import type { ItemStack } from '../game/inventory/items';
import {
  applySnapshot, executeCommand, PROTOCOL_VERSION, type ClientMessage, type Command, type MirrorExtras, type ServerMessage,
} from '../game/net/protocol';
import type { Outfit } from '../game/player/outfits';
import type { Vocation } from '../game/player/vocations';
import type { SaveSystem } from '../game/save/SaveSystem';

/**
 * Everything the renderer, HUD and input need from "the game", whether it runs
 * here (single player) or on a server (online). All actions go through
 * `send(command)`, so the UI cannot tell the difference.
 */
export interface Controller {
  readonly game: Game;
  readonly online: boolean;
  readonly pid: number;
  send(cmd: Command): void;
  /** Held movement direction from the keyboard. */
  setHeld(dx: number, dy: number): void;
  /** A single key press (queued step). */
  tap(dx: number, dy: number): void;
  depot(): (ItemStack | null)[] | null;
  trade(): TradeView | null;
  update(dt: number): void;
  /** Saves the character now; returns false when nowhere to save. */
  save(): boolean;
  /** Called when an online connection drops. */
  onDisconnect: ((why: string) => void) | null;
  /** Messages that arrived before the HUD existed; reading them empties the list. */
  takeBacklog(): GameEvent[];
}

/** Collects chat and system messages until the HUD is ready to show them. */
class Backlog {
  private list: GameEvent[] | null = [];
  constructor(game: Game) {
    const off = game.events.on((e) => {
      if (!this.list) return off();
      if (e.type === 'message' || e.type === 'chat') this.list.push(e);
    });
  }
  take(): GameEvent[] {
    const l = this.list ?? [];
    this.list = null;
    return l;
  }
}

export function sessionOf(c: Controller): Session {
  const s = c.game.session(c.pid);
  if (!s) throw new Error('Local player missing');
  return s;
}

// ------------------------------------------------------------------ single player

const AUTOSAVE_SECONDS = 30;

export class LocalController implements Controller {
  readonly online = false;
  readonly intent = new BufferedIntent();
  readonly pid: number;
  onDisconnect: ((why: string) => void) | null = null;
  private autosave = AUTOSAVE_SECONDS;
  private backlog: Backlog;

  constructor(readonly game: Game, readonly saves: SaveSystem, name: string, vocation: Vocation, opts: { load: boolean; outfit?: Outfit }) {
    this.backlog = new Backlog(game);
    const s = game.addPlayer(name, { intent: this.intent, vocation });
    this.pid = s.id;
    game.localId = s.id;
    s.admin = true; // single player: test commands are always on
    if (opts.load && saves.load(game, s.id)) {
      game.msg(s.id, `Welcome back, ${s.player.name}. Your progress was restored.`, 'info');
    } else {
      if (opts.outfit) game.setOutfit(s.id, opts.outfit);
      game.msg(s.id, `Welcome to Thornvale, ${name}. Captain Aldric waits on the temple plaza.`, 'info');
      this.save();
    }
    if (!saves.available) game.msg(s.id, 'Browser storage is unavailable here — progress cannot be saved.', 'warn');
  }

  takeBacklog(): GameEvent[] {
    return this.backlog.take();
  }

  send(cmd: Command): void {
    executeCommand(this.game, this.pid, cmd);
  }

  setHeld(dx: number, dy: number): void {
    this.intent.dir = { dx, dy };
  }

  tap(dx: number, dy: number): void {
    this.intent.queued = { dx, dy };
  }

  depot(): (ItemStack | null)[] | null {
    const s = this.game.session(this.pid);
    return s?.depotOpen ? s.depot : null;
  }

  trade(): TradeView | null {
    return this.game.tradeView(this.pid);
  }

  save(): boolean {
    const s = this.game.session(this.pid);
    if (!s || s.player.dead) return false;
    s.wantsSave = false;
    return this.saves.save(this.game, this.pid);
  }

  update(dt: number): void {
    this.game.update(dt);
    this.autosave -= dt;
    const s = this.game.session(this.pid);
    if (s && (s.wantsSave || this.autosave <= 0) && !s.player.dead) {
      this.save();
      this.autosave = AUTOSAVE_SECONDS;
    }
  }
}

// ------------------------------------------------------------------ online

export interface ConnectOptions {
  url: string;
  name: string;
  password: string;
  vocation: Vocation;
  outfit: Outfit;
  timeoutMs?: number;
}

export class NetController implements Controller {
  readonly online = true;
  readonly game: Game;
  pid = -1;
  onDisconnect: ((why: string) => void) | null = null;
  private extras: MirrorExtras = { depot: null, trade: null };
  private held = { dx: 0, dy: 0 };
  private closed = false;

  private backlog: Backlog;

  private constructor(private readonly ws: WebSocket) {
    this.game = new Game({ simulate: false });
    this.backlog = new Backlog(this.game);
  }

  takeBacklog(): GameEvent[] {
    return this.backlog.take();
  }

  /** Connects, logs in, and resolves once the first world snapshot arrived. */
  static connect(o: ConnectOptions): Promise<NetController> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(o.url);
      } catch (err) {
        reject(new Error(`Cannot open a connection to ${o.url}.`));
        return;
      }
      const nc = new NetController(ws);
      let ready = false;
      const timer = setTimeout(() => {
        if (!ready) {
          ws.close();
          reject(new Error('The server did not answer in time.'));
        }
      }, o.timeoutMs ?? 8000);
      ws.onopen = () => {
        const hello: ClientMessage = { t: 'hello', v: PROTOCOL_VERSION, name: o.name, password: o.password, vocation: o.vocation, outfit: o.outfit };
        ws.send(JSON.stringify(hello));
      };
      ws.onerror = () => {
        if (!ready) {
          clearTimeout(timer);
          reject(new Error(`Could not reach a Thornvale server at ${o.url}.`));
        }
      };
      ws.onclose = () => {
        if (!ready) {
          clearTimeout(timer);
          reject(new Error(nc.lastError ?? 'The server closed the connection.'));
          return;
        }
        if (!nc.closed) {
          nc.closed = true;
          nc.onDisconnect?.(nc.lastError ?? 'Connection to the server was lost.');
        }
      };
      ws.onmessage = (ev) => {
        let m: ServerMessage;
        try {
          m = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        nc.handle(m);
        if (!ready && m.t === 'snap' && nc.game.session(nc.pid)) {
          ready = true;
          clearTimeout(timer);
          resolve(nc);
        }
      };
    });
  }

  private lastError: string | null = null;

  private handle(m: ServerMessage): void {
    switch (m.t) {
      case 'welcome':
        this.pid = m.id;
        this.game.localId = m.id;
        break;
      case 'snap':
        applySnapshot(this.game, m, this.extras);
        this.game.time = m.time;
        break;
      case 'ev':
        this.game.events.emit(m.e);
        break;
      case 'error':
        this.lastError = m.text;
        break;
    }
  }

  private raw(m: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  send(cmd: Command): void {
    this.raw({ t: 'cmd', ...cmd });
  }

  setHeld(dx: number, dy: number): void {
    if (dx === this.held.dx && dy === this.held.dy) return;
    this.held = { dx, dy };
    this.raw({ t: 'intent', dx, dy });
  }

  tap(dx: number, dy: number): void {
    this.raw({ t: 'tap', dx, dy });
  }

  depot(): (ItemStack | null)[] | null {
    return this.extras.depot;
  }

  trade(): TradeView | null {
    return this.extras.trade;
  }

  save(): boolean {
    // the server stores characters itself
    return true;
  }

  update(dt: number): void {
    this.game.update(dt);
  }

  close(): void {
    this.closed = true;
    this.ws.close();
  }
}

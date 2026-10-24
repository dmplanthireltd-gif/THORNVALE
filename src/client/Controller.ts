import type { GameEvent } from '../game/core/events';
import { BufferedIntent, Game, type Session, type TradeView } from '../game/Game';
import type { ItemStack } from '../game/inventory/items';
import type { MarketView } from '../game/market/market';
import type { ExchangeView } from '../game/exchange/exchange';
import type { CraftView } from '../game/production/recipes';
import {
  applySnapshot, executeCommand, PROTOCOL_VERSION, type ClientMessage, type Command, type MirrorExtras, type ServerMessage,
} from '../game/net/protocol';
import { encodeAppearance, type Appearance } from '../game/player/appearance';
import type { Vocation } from '../game/player/vocations';
import type { SaveSystem } from '../game/save/SaveSystem';
import { parseStages } from '../game/progression/stages';

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
  /** The market window's contents while a market board is in use. */
  market(): MarketView | null;
  /** The Gilded Exchange window's contents while it is open at a clerk. */
  exchange(): ExchangeView | null;
  /** The station window (furnace, anvil) while one is in use. */
  craft(): CraftView | null;
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

const TUTORIAL_FLAG = 'thornvale.tutorialDone';

/** Browser storage when there is one (typed loosely so the server build, without DOM types, compiles too). */
function browserStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | undefined {
  return (globalThis as unknown as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } }).localStorage;
}

/** Offline play: has a character in this browser finished the tutorial island? */
export function offlineTutorialDone(): boolean {
  try {
    return browserStorage()?.getItem(TUTORIAL_FLAG) === '1';
  } catch {
    return false;
  }
}

function markOfflineTutorialDone(): void {
  try {
    browserStorage()?.setItem(TUTORIAL_FLAG, '1');
  } catch {
    /* storage off: nothing remembered */
  }
}

const AUTOSAVE_SECONDS = 30;

export class LocalController implements Controller {
  readonly online = false;
  readonly intent = new BufferedIntent();
  readonly pid: number;
  onDisconnect: ((why: string) => void) | null = null;
  private autosave = AUTOSAVE_SECONDS;
  private backlog: Backlog;

  constructor(readonly game: Game, readonly saves: SaveSystem, name: string, vocation: Vocation, opts: { load: boolean; appearance?: Appearance; skipTutorial?: boolean }) {
    this.backlog = new Backlog(game);
    const s = game.addPlayer(name, { intent: this.intent, vocation });
    this.pid = s.id;
    game.localId = s.id;
    s.admin = true; // single player: test commands are always on
    saves.attachMarket(game);
    // offline, "the account" is this browser: finishing the island once lets later characters skip it
    s.tutorial.canSkip = offlineTutorialDone();
    game.events.on((e) => {
      if (e.type === 'tutorialDone' && e.to === s.id && !e.skipped) markOfflineTutorialDone();
    });
    if (opts.load && saves.load(game, s.id)) {
      s.tutorial.canSkip = offlineTutorialDone();
      game.msg(s.id, `Welcome back, ${s.player.name}. Your progress was restored.`, 'info');
    } else {
      if (opts.appearance) game.setAppearance(s.id, opts.appearance);
      game.msg(s.id, `Welcome to Thornvale, ${name}.`, 'info');
      if (opts.skipTutorial && s.tutorial.canSkip) game.startSkipped(s.id);
      else game.beginTutorial(s.id);
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

  market(): MarketView | null {
    return this.game.marketView(this.pid);
  }

  exchange(): ExchangeView | null {
    return this.game.exchange.view(this.pid);
  }

  craft(): CraftView | null {
    return this.game.craftView(this.pid);
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
  password?: string;
  /** Supabase Auth access token (email login). */
  token?: string;
  vocation: Vocation;
  /** Look for a new character (ignored for an existing one). */
  appearance?: Appearance;
  /** New character only: start in Thornvale instead of the tutorial island (accounts that finished it once). */
  skipTutorial?: boolean;
  timeoutMs?: number;
}

export class NetController implements Controller {
  readonly online = true;
  readonly game: Game;
  pid = -1;
  onDisconnect: ((why: string) => void) | null = null;
  private extras: MirrorExtras = { depot: null, trade: null, market: null, craft: null };
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
        const hello: ClientMessage = { t: 'hello', v: PROTOCOL_VERSION, name: o.name, password: o.password, token: o.token, vocation: o.vocation, skipTutorial: o.skipTutorial, ...(o.appearance ? { ap: encodeAppearance(o.appearance) } : {}) };
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
        if (m.rates) this.game.stages = parseStages(m.rates);
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
    this.game.setPredictDir(dx, dy);
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

  market(): MarketView | null {
    return this.extras.market ?? null;
  }

  exchange(): ExchangeView | null {
    return this.extras.exchange ?? null;
  }

  craft(): CraftView | null {
    return this.extras.craft ?? null;
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

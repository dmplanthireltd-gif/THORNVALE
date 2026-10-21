import { chebyshev } from '../core/types';
import type { GameEvent } from '../core/events';
import { BufferedIntent, type Game, type Session, type PartyView, type TradeView } from '../Game';
import type { Inventory } from '../inventory/Inventory';
import { EQUIP_SLOTS, isItem, type EquipSlot, type ItemStack } from '../inventory/items';
import { isSpellId, type SpellId } from '../magic/spells';
import type { MarketView } from '../market/market';
import type { DialogueState } from '../npc/dialogue';
import { COMBAT_SKILLS, parseSkills } from '../player/skills';
import { isOutfit, type Outfit } from '../player/outfits';
import { emptyBuffs, FIGHT_MODE, type Buffs, type FightMode } from '../player/Player';
import { isVocation, type Vocation } from '../player/vocations';
import type { QuestLog } from '../quests/quests';

/**
 * Wire protocol (JSON over WebSocket). The server runs the real Game; clients
 * run a mirror Game in `simulate: false` mode and apply these snapshots to it,
 * so rendering and UI code is identical online and offline.
 */

export const PROTOCOL_VERSION = 12;
/** Monsters further than this from a player are not sent to them. */
export const VIEW_RADIUS = 20;

export type Command =
  | { c: 'moveTo'; x: number; y: number }
  | { c: 'attack'; id: number }
  | { c: 'clearTarget' }
  | { c: 'turn'; dx: number; dy: number }
  | { c: 'targetNext' }
  | { c: 'talk'; id: number }
  | { c: 'pickup'; id: number }
  | { c: 'useTile'; x: number; y: number }
  | { c: 'cast'; spell: SpellId; param?: string }
  | { c: 'useSlot'; slot: number }
  | { c: 'useRuneAt'; slot: number; x: number; y: number }
  /** Rune used on a creature (e.g. dropped on its battle-list row); aimed at where it stands now. */
  | { c: 'useRuneOn'; slot: number; id: number }
  | { c: 'moveBag'; id: number; x: number; y: number; qty?: number }
  | { c: 'useItem'; item: string }
  | { c: 'unequip'; slot: EquipSlot }
  | { c: 'drop'; slot: number }
  | { c: 'throw'; from: number | EquipSlot; x: number; y: number; qty?: number }
  | { c: 'moveSlot'; from: number; to: number }
  | { c: 'equipTo'; from: number; slot: EquipSlot }
  | { c: 'dialogue'; action: string }
  | { c: 'closeDialogue' }
  | { c: 'outfit'; outfit: Outfit }
  | { c: 'showGear'; on: boolean }
  /** PvP secure mode: on = never attack unmarked players. */
  | { c: 'secureMode'; on: boolean }
  | { c: 'say'; text: string }
  | { c: 'deposit'; slot: number }
  | { c: 'withdraw'; index: number }
  | { c: 'closeDepot' }
  | { c: 'tradeRequest'; id: number }
  | { c: 'tradeOffer'; slots: number[]; gold: number }
  /** Drag an item onto another player: opens the trade if needed and offers that item. */
  | { c: 'tradeItem'; id: number; slot: number }
  | { c: 'fightMode'; mode: FightMode; chase: boolean }
  | { c: 'partyInvite'; id: number }
  | { c: 'partyRevoke'; id: number }
  | { c: 'partyJoin'; id: number }
  | { c: 'partyLeave' }
  | { c: 'partyLeader'; id: number }
  | { c: 'partyShare'; on: boolean }
  | { c: 'follow'; id: number }
  | { c: 'friendRequest'; id: number }
  | { c: 'friendAccept'; id: number }
  | { c: 'friendDecline'; id: number }
  | { c: 'friendRemove'; name: string }
  | { c: 'tradeAccept' }
  | { c: 'tradeCancel' }
  /** Player market (at a market board). */
  | { c: 'marketSell'; from: 'depot' | 'inv'; index: number; qty: number; price: number }
  | { c: 'marketBuy'; id: string; qty: number }
  | { c: 'marketCancel'; id: string }
  | { c: 'marketClose' };

export type ClientMessage =
  | { t: 'hello'; v: number; name: string; password?: string; token?: string; outfit?: Outfit; vocation?: Vocation }
  | { t: 'intent'; dx: number; dy: number }
  | { t: 'tap'; dx: number; dy: number }
  | ({ t: 'cmd' } & Command);

export interface CreatureSnap {
  id: number;
  k: 'p' | 'e' | 'n';
  x: number; y: number; z: number; fx: number; fy: number;
  mt: number; md: number; f: number;
  hp: number; mhp: number; d: 0 | 1;
  ct?: number;
  name?: string;
  lvl?: number;
  voc?: Vocation;
  o?: Outfit;
  eq?: Record<string, string | null>;
  /** Shows equipment on the model. */
  sg?: 0 | 1;
  buffs?: Partial<Buffs>;
  /** PvP skull: 0 none, 1 white, 2 red (players only). */
  sk?: 0 | 1 | 2;
  /** Party relation to the receiving player: 1 member, 2 invited me, 3 I invited them. */
  pt?: 1 | 2 | 3;
  /** Creature Illusion: the monster kind this player looks like. */
  ill?: string;
}

export interface SelfSnap {
  id: number;
  voc: Vocation;
  level: number; exp: number;
  hp: number; mhp: number; mana: number; mmana: number;
  cap: number; step: number;
  target: number | null;
  cds: Record<string, number>;
  gcds: { attack: number; heal: number; support: number; potion: number };
  buffs: Buffs;
  home: string;
  inv: ReturnType<Inventory['toJSON']>;
  quests: QuestLog['state'];
  dialogue: DialogueState | null;
  bank: number;
  spells: string[];
  depot: (ItemStack | null)[] | null;
  trade: TradeView | null;
  /** PvP: server allows it, own secure mode, seconds of PZ lock left. */
  pvp: 0 | 1;
  sec: 0 | 1;
  pz: number;
  party: PartyView | null;
  /** Combat skills: [level, tries] per skill (see player/skills.ts). */
  skills: Record<string, [number, number]>;
  /** Woodcutting experience. */
  wc: number;
  /** Fishing experience. */
  fx: number;
  /** Market window contents; only sent when it changed (null = closed, absent = unchanged). */
  mk?: MarketView | null;
  friends: ReturnType<Game['friendsView']>;
}

export type ServerMessage =
  | { t: 'welcome'; id: number; v: number; players: number }
  | { t: 'snap'; time: number; c: CreatureSnap[]; b: Array<{ id: number; x: number; y: number; z: number; it?: string[] }>; holes: string[]; fields?: string[]; self: SelfSnap; st?: string[] }
  | { t: 'ev'; e: GameEvent }
  | { t: 'error'; text: string };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ------------------------------------------------------------------ server side

export function buildSnapshot(game: Game, s: Session): ServerMessage {
  const me = s.player;
  const c: CreatureSnap[] = [];
  for (const o of game.sessions.values()) {
    const p = o.player;
    const eq: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(o.inventory.equipment)) eq[k] = v?.id ?? null;
    c.push({
      id: p.id, k: 'p', x: p.x, y: p.y, z: p.z, fx: p.fromX, fy: p.fromY, mt: r3(p.moveT), md: r3(p.moveDur), f: r3(p.facing),
      hp: Math.ceil(p.hp), mhp: p.maxHp, d: p.dead ? 1 : 0, name: p.name, lvl: p.level, voc: p.vocation, o: p.outfit, eq, sg: p.showGear ? 1 : 0,
      buffs: {
        haste: p.buffs.haste > 0 || p.buffs.strongHaste > 0 ? 1 : 0, magicShield: p.buffs.magicShield > 0 ? 1 : 0, light: p.buffs.light > 0 ? 1 : 0,
        invisible: p.buffs.invisible > 0 ? 1 : 0,
      },
      ill: p.illusion ?? undefined,
      sk: game.skullOf(p),
      pt: game.partyFlag(me.id, p.id) || undefined,
    });
  }
  for (const n of game.npcs) {
    if (n.z !== me.z || chebyshev(n.x, n.y, me.x, me.y) > VIEW_RADIUS) continue;
    c.push({ id: n.id, k: 'n', x: n.x, y: n.y, z: n.z, fx: n.fromX, fy: n.fromY, mt: 1, md: 1, f: r3(n.facing), hp: n.hp, mhp: n.maxHp, d: 0 });
  }
  for (const e of game.enemies) {
    if (Math.abs(e.z - me.z) > 1 || chebyshev(e.x, e.y, me.x, me.y) > VIEW_RADIUS) continue;
    c.push({
      id: e.id, k: 'e', x: e.x, y: e.y, z: e.z, fx: e.fromX, fy: e.fromY, mt: r3(e.moveT), md: r3(e.moveDur), f: r3(e.facing),
      hp: Math.ceil(e.hp), mhp: e.maxHp, d: e.dead ? 1 : 0, ct: r3(e.corpseTimer),
    });
  }
  const self: SelfSnap = {
    id: me.id, voc: me.vocation, level: me.level, exp: me.exp,
    hp: Math.ceil(me.hp), mhp: me.maxHp, mana: Math.floor(me.mana), mmana: me.maxMana, cap: me.capacity,
    step: me.stepTime, target: me.targetId, cds: { ...me.spellCooldowns }, gcds: { ...me.groupCooldowns }, buffs: { ...me.buffs }, home: me.home,
    inv: s.inventory.toJSON(), quests: s.quests.state, dialogue: s.dialogue, bank: s.bank, spells: [...s.spells],
    depot: s.depotOpen ? s.depot : null, trade: game.tradeView(s.id),
    pvp: game.pvp ? 1 : 0, sec: me.secure ? 1 : 0, pz: Math.ceil(me.pzLock), party: game.partyView(me.id),
    skills: Object.fromEntries(COMBAT_SKILLS.map((k) => [k, [s.skills[k].level, Math.floor(s.skills[k].tries)]])), wc: Math.floor(s.woodcutting), fx: Math.floor(s.fishing), friends: game.friendsView(me.id),
  };
  // the market list is only sent when something in it (or in your depot or bank) changed
  const mkKey = s.marketOpen ? `${game.market.version}|${s.bank}|${JSON.stringify(s.depot)}` : 'closed';
  if (mkKey !== marketSent.get(s)) {
    marketSent.set(s, mkKey);
    self.mk = game.marketView(s.id);
  }
  const holes: string[] = [];
  for (const k of game.dugHoles()) holes.push(k);
  // rune fields near the player (x,y,z,obj)
  const fields = game.fieldList().filter((f) => {
    const [x, y, z] = f.split(',').map(Number);
    return Math.abs(z - me.z) <= 1 && chebyshev(x, y, me.x, me.y) <= VIEW_RADIUS + 4;
  });
  return {
    t: 'snap', time: r3(game.time), c, b: game.bags.map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z, it: b.items.slice(-3).map((i) => i.id) })), holes, fields, self,
    st: game.stumpsNear(me.x, me.y, me.z, VIEW_RADIUS + 4),
  };
}

/** What market view each session was last sent (so an unchanged market is not resent 20 times a second). */
const marketSent = new WeakMap<Session, string>();

/** Routes a simulation event: null = drop, otherwise the recipient (-1 = everyone). */
export function eventAudience(e: GameEvent): number | null {
  switch (e.type) {
    // derived by clients from snapshots
    case 'bagCreated': case 'bagRemoved': case 'playerJoined': case 'playerLeft': case 'tileChanged':
    case 'inventoryChanged': case 'questChanged': case 'dialogueOpened': case 'dialogueClosed':
    case 'gameLoaded': case 'equipmentChanged': case 'outfitChanged': case 'depotChanged': case 'tradeChanged': case 'partyChanged': case 'friendsChanged': case 'spellsChanged':
    case 'marketChanged':
      return null;
    default:
      return 'to' in e ? e.to : -1;
  }
}

/** Validates and executes a client command against the authoritative game. */
export function executeCommand(game: Game, pid: number, m: Command): void {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  switch (m.c) {
    case 'moveTo': if (num(m.x) && num(m.y)) game.commandMoveTo(pid, Math.floor(m.x), Math.floor(m.y)); break;
    case 'attack': if (num(m.id)) game.commandAttack(pid, m.id); break;
    case 'clearTarget': game.commandClearTarget(pid); break;
    case 'turn': if (num(m.dx) && num(m.dy)) game.commandTurn(pid, m.dx, m.dy); break;
    case 'targetNext': game.commandTargetNext(pid); break;
    case 'talk': if (num(m.id)) game.commandTalk(pid, m.id); break;
    case 'pickup': if (num(m.id)) game.commandPickup(pid, m.id); break;
    case 'useTile': if (num(m.x) && num(m.y)) game.commandUseTile(pid, Math.floor(m.x), Math.floor(m.y)); break;
    case 'cast': if (isSpellId(m.spell)) game.castSpell(pid, m.spell, typeof m.param === 'string' ? m.param.slice(0, 24) : null); break;
    case 'useSlot': if (num(m.slot)) game.useSlot(pid, Math.floor(m.slot)); break;
    case 'useRuneAt': if (num(m.slot) && num(m.x) && num(m.y)) game.useRune(pid, Math.floor(m.slot), { x: Math.floor(m.x), y: Math.floor(m.y) }); break;
    case 'moveBag': if (num(m.id) && num(m.x) && num(m.y)) game.moveBagItem(pid, Math.floor(m.id), Math.floor(m.x), Math.floor(m.y), num(m.qty) ? Math.floor(m.qty) : undefined); break;
    case 'useRuneOn': {
      if (!num(m.slot) || !num(m.id)) break;
      const t = game.getCreature(Math.floor(m.id));
      const me = game.getPlayer(pid);
      if (t && me && !t.dead && t.z === me.z) game.useRune(pid, Math.floor(m.slot), { x: Math.round(t.x), y: Math.round(t.y) });
      break;
    }
    case 'useItem': if (typeof m.item === 'string') { try { game.useItem(pid, m.item); } catch { /* unknown item */ } } break;
    case 'unequip': if (typeof m.slot === 'string') game.unequip(pid, m.slot); break;
    case 'drop': if (num(m.slot)) game.dropSlot(pid, Math.floor(m.slot)); break;
    case 'throw': {
      const from = num(m.from) ? Math.floor(m.from) : (EQUIP_SLOTS as readonly string[]).includes(m.from as string) ? m.from : null;
      if (from !== null && num(m.x) && num(m.y)) game.throwItem(pid, from as number | EquipSlot, Math.floor(m.x), Math.floor(m.y), num(m.qty) ? m.qty : undefined);
      break;
    }
    case 'moveSlot': if (num(m.from) && num(m.to)) game.moveSlot(pid, Math.floor(m.from), Math.floor(m.to)); break;
    case 'equipTo': if (num(m.from) && (EQUIP_SLOTS as readonly string[]).includes(m.slot)) game.equipTo(pid, Math.floor(m.from), m.slot); break;
    case 'dialogue': if (typeof m.action === 'string') game.dialogueAction(pid, m.action.slice(0, 80)); break;
    case 'closeDialogue': game.closeDialogue(pid); break;
    case 'outfit': if (isOutfit(m.outfit)) game.setOutfit(pid, m.outfit); break;
    case 'showGear': game.setShowGear(pid, m.on === true); break;
    case 'secureMode': game.setSecureMode(pid, m.on !== false); break;
    case 'say': if (typeof m.text === 'string') game.say(pid, m.text); break;
    case 'deposit': if (num(m.slot)) game.depositItem(pid, Math.floor(m.slot)); break;
    case 'withdraw': if (num(m.index)) game.withdrawItem(pid, Math.floor(m.index)); break;
    case 'closeDepot': game.closeDepot(pid); break;
    case 'tradeRequest': if (num(m.id)) game.requestTrade(pid, m.id); break;
    case 'tradeOffer': if (Array.isArray(m.slots) && num(m.gold)) game.setTradeOffer(pid, m.slots.filter(num), m.gold); break;
    case 'tradeItem': if (num(m.id) && num(m.slot)) game.offerItemTo(pid, Math.floor(m.id), Math.floor(m.slot)); break;
    case 'fightMode': if (typeof m.mode === 'string' && m.mode in FIGHT_MODE && typeof m.chase === 'boolean') game.setFightMode(pid, m.mode, m.chase); break;
    case 'partyInvite': if (num(m.id)) game.partyInvite(pid, Math.floor(m.id)); break;
    case 'partyRevoke': if (num(m.id)) game.partyRevoke(pid, Math.floor(m.id)); break;
    case 'partyJoin': if (num(m.id)) game.partyJoin(pid, Math.floor(m.id)); break;
    case 'partyLeave': game.partyLeave(pid); break;
    case 'partyLeader': if (num(m.id)) game.partyPassLeader(pid, Math.floor(m.id)); break;
    case 'partyShare': game.partyShare(pid, m.on === true); break;
    case 'follow': if (num(m.id)) game.commandFollow(pid, Math.floor(m.id)); break;
    case 'friendRequest': if (num(m.id)) game.friendRequest(pid, Math.floor(m.id)); break;
    case 'friendAccept': if (num(m.id)) game.friendAccept(pid, Math.floor(m.id)); break;
    case 'friendDecline': if (num(m.id)) game.friendDecline(pid, Math.floor(m.id)); break;
    case 'friendRemove': if (typeof m.name === 'string') game.friendRemove(pid, m.name.slice(0, 40)); break;
    case 'tradeAccept': game.acceptTrade(pid); break;
    case 'tradeCancel': game.cancelTrade(pid); break;
    case 'marketSell':
      if ((m.from === 'depot' || m.from === 'inv') && num(m.index) && num(m.qty) && num(m.price)) game.marketSell(pid, m.from, Math.floor(m.index), Math.floor(m.qty), Math.floor(m.price));
      break;
    case 'marketBuy': if (typeof m.id === 'string' && num(m.qty)) game.marketBuy(pid, m.id.slice(0, 64), Math.floor(m.qty)); break;
    case 'marketCancel': if (typeof m.id === 'string') game.marketCancel(pid, m.id.slice(0, 64)); break;
    case 'marketClose': game.closeMarket(pid); break;
  }
}

// ------------------------------------------------------------------ client side

/** Private state the client keeps for the HUD (depot, trade, market). */
export interface MirrorExtras {
  depot: (ItemStack | null)[] | null;
  trade: TradeView | null;
  market?: MarketView | null;
}

/** Applies a server snapshot to a mirror game. Emits the state-change events the server held back. */
export function applySnapshot(game: Game, snap: Extract<ServerMessage, { t: 'snap' }>, extras?: MirrorExtras): void {
  const seenPlayers = new Set<number>();
  const ev = game.events;
  for (const c of snap.c) {
    let cr = game.getCreature(c.id);
    if (c.k === 'p') {
      seenPlayers.add(c.id);
      if (!cr) cr = game.addPlayer(c.name ?? 'Adventurer', { id: c.id, starter: false, intent: new BufferedIntent(), vocation: c.voc }).player;
      const s = game.session(c.id)!;
      const p = s.player;
      if (c.name && p.name !== c.name) p.name = c.name;
      if (c.lvl) p.level = c.lvl;
      if (c.voc && isVocation(c.voc)) p.vocation = c.voc;
      if (c.o && JSON.stringify(c.o) !== JSON.stringify(p.outfit)) {
        p.outfit = { ...c.o };
        ev.emit({ type: 'outfitChanged', id: p.id });
      }
      if (c.sg !== undefined && (c.sg === 1) !== p.showGear) {
        p.showGear = c.sg === 1;
        ev.emit({ type: 'equipmentChanged', id: p.id });
      }
      p.netSkull = c.sk === 1 || c.sk === 2 ? c.sk : 0;
      if (c.pt) game.netPartyFlags.set(p.id, c.pt);
      else game.netPartyFlags.delete(p.id);
      if (c.buffs) {
        p.buffs.haste = c.buffs.haste ? Math.max(p.buffs.haste, 1) : 0;
        p.buffs.magicShield = c.buffs.magicShield ? Math.max(p.buffs.magicShield, 1) : 0;
        p.buffs.light = c.buffs.light ? Math.max(p.buffs.light, 1) : 0;
        p.buffs.invisible = c.buffs.invisible ? Math.max(p.buffs.invisible, 1) : 0;
      }
      const ill = c.ill ?? null;
      if (ill !== p.illusion) {
        p.illusion = ill;
        ev.emit({ type: 'outfitChanged', id: p.id });
      }
      if (c.eq && c.id !== game.localId) {
        const cur = JSON.stringify(Object.fromEntries(Object.entries(s.inventory.equipment).map(([k, v]) => [k, v?.id ?? null])));
        if (cur !== JSON.stringify(c.eq)) {
          for (const [k, v] of Object.entries(c.eq)) (s.inventory.equipment as Record<string, ItemStack | null>)[k] = v ? { id: v, qty: 1 } : null;
          ev.emit({ type: 'equipmentChanged', id: p.id });
        }
      }
    }
    if (!cr) continue;
    const floorChanged = cr.z !== c.z;
    if (cr.x !== c.x || cr.y !== c.y || floorChanged) {
      cr.fromX = floorChanged ? c.x : c.fx;
      cr.fromY = floorChanged ? c.y : c.fy;
      cr.x = c.x;
      cr.y = c.y;
      cr.z = c.z;
      cr.moveT = floorChanged ? 1 : Math.min(1, c.mt);
      cr.moveDur = c.md || 0.3;
      if (cr.moveT >= 1) { cr.fromX = c.x; cr.fromY = c.y; }
      if (floorChanged) ev.emit({ type: 'teleport', id: cr.id });
    }
    cr.facing = c.f;
    cr.hp = c.hp;
    cr.maxHp = c.mhp;
    cr.dead = c.d === 1;
    if (c.k === 'e' && c.ct !== undefined) {
      const e = game.getEnemy(c.id);
      if (e) e.corpseTimer = c.ct;
    }
  }
  for (const p of game.players()) if (!seenPlayers.has(p.id)) game.removePlayer(p.id);

  const want = new Map(snap.b.map((b) => [b.id, b]));
  for (let i = game.bags.length - 1; i >= 0; i--) {
    if (!want.has(game.bags[i].id)) {
      const id = game.bags[i].id;
      game.bags.splice(i, 1);
      ev.emit({ type: 'bagRemoved', bagId: id });
    }
  }
  for (const b of snap.b) {
    const shown = (b.it ?? []).filter((id) => isItem(id)).map((id) => ({ id, qty: 1 }));
    const have = game.bags.find((x) => x.id === b.id);
    if (have) {
      // the client only needs the top items to draw the pile
      if (have.items.map((i) => i.id).join() !== shown.map((i) => i.id).join()) have.items = shown;
    } else {
      game.bags.push({ id: b.id, x: b.x, y: b.y, z: b.z, items: shown, ttl: 999 });
      ev.emit({ type: 'bagCreated', bagId: b.id, x: b.x, y: b.y, z: b.z });
    }
  }
  game.syncHoles(snap.holes);
  game.syncFields(snap.fields ?? []);

  const me = snap.self;
  const s = game.session(me.id);
  if (!s) return;
  const p = s.player;
  p.vocation = me.voc;
  p.level = me.level;
  p.exp = me.exp;
  p.hp = me.hp;
  p.maxHp = me.mhp;
  p.mana = me.mana;
  p.maxMana = me.mmana;
  p.capacity = me.cap;
  p.stepTime = me.step;
  p.targetId = me.target;
  p.spellCooldowns = me.cds;
  p.groupCooldowns = { ...me.gcds, potion: me.gcds.potion ?? 0 };
  p.buffs = { ...emptyBuffs(), ...me.buffs };
  p.home = me.home;
  game.pvp = me.pvp === 1;
  p.secure = me.sec !== 0;
  p.pzLock = me.pz ?? 0;
  s.bank = me.bank;
  // the Skills panel redraws itself when these change
  if (me.skills) s.skills = parseSkills(Object.fromEntries(Object.entries(me.skills).map(([k, v]) => [k, { level: v[0], tries: v[1] }])));
  if (typeof me.wc === 'number') s.woodcutting = me.wc;
  if (typeof me.fx === 'number') s.fishing = me.fx;
  if (snap.st) game.syncStumps(snap.st, p.x, p.y, p.z, VIEW_RADIUS + 4);
  const spellsBefore = [...s.spells].sort().join();
  const spellsAfter = [...me.spells].sort().join();
  if (spellsBefore !== spellsAfter) {
    s.spells = new Set(me.spells.filter(isSpellId));
    ev.emit({ type: 'spellsChanged', to: me.id });
  }
  const invBefore = JSON.stringify(s.inventory.toJSON());
  if (invBefore !== JSON.stringify(me.inv)) {
    const eqBefore = JSON.stringify(s.inventory.equipment);
    s.inventory.load(me.inv);
    ev.emit({ type: 'inventoryChanged', to: me.id });
    if (JSON.stringify(s.inventory.equipment) !== eqBefore) ev.emit({ type: 'equipmentChanged', id: me.id });
  }
  if (JSON.stringify(s.quests.state) !== JSON.stringify(me.quests)) {
    s.quests.load(me.quests);
    ev.emit({ type: 'questChanged', to: me.id });
  }
  if (JSON.stringify(s.dialogue) !== JSON.stringify(me.dialogue)) {
    s.dialogue = me.dialogue;
    if (me.dialogue) ev.emit({ type: 'dialogueOpened', npcId: me.dialogue.npcId, to: me.id });
    else ev.emit({ type: 'dialogueClosed', to: me.id });
  }
  if (extras) {
    if (JSON.stringify(extras.depot) !== JSON.stringify(me.depot)) {
      extras.depot = me.depot;
      s.depot = me.depot ? me.depot.map((x) => (x ? { ...x } : null)) : s.depot;
      s.depotOpen = me.depot ? { x: p.x, y: p.y, z: p.z } : null;
      ev.emit({ type: 'depotChanged', to: me.id });
    }
    if (JSON.stringify(extras.trade) !== JSON.stringify(me.trade)) {
      extras.trade = me.trade;
      ev.emit({ type: 'tradeChanged', to: me.id });
    }
    if (me.friends && JSON.stringify(game.netFriends) !== JSON.stringify(me.friends)) {
      game.netFriends = me.friends;
      ev.emit({ type: 'friendsChanged', to: me.id });
    }
    if (JSON.stringify(game.netParty) !== JSON.stringify(me.party ?? null)) {
      game.netParty = me.party ?? null;
      ev.emit({ type: 'partyChanged', to: me.id });
    }
    if (me.mk !== undefined) {
      extras.market = me.mk;
      s.marketOpen = me.mk ? { x: p.x, y: p.y, z: p.z } : null;
      ev.emit({ type: 'marketChanged', to: me.id });
    }
  }
}

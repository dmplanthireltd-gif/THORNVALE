/**
 * Computer-controlled adventurers (test servers). They walk around towns and their surroundings,
 * hunt nearby monsters, heal themselves and chat now and then. They are marked as bots: never saved,
 * not counted in the public player count or highscores, and their names carry a [Bot] tag.
 */
import { BufferedIntent, type Game, type Session } from '../src/game/Game';
import { setLevel } from '../src/game/admin';
import { chebyshev } from '../src/game/core/types';
import { equipSlotFor, ITEMS, type ItemDef } from '../src/game/inventory/items';
import { executeCommand } from '../src/game/net/protocol';
import type { Vocation } from '../src/game/player/vocations';

const NAMES = ['Aldwyn', 'Brisa', 'Corvin', 'Dagny', 'Eskil', 'Fenna', 'Garreth', 'Hilde', 'Ivor', 'Jorunn', 'Kestrel', 'Lysa'];
const VOCS: Vocation[] = ['knight', 'paladin', 'sorcerer', 'druid'];
const LINES = [
  'anyone up for a hunt?', 'selling pine logs, cheap', 'where are the minotaurs again?', 'gz on the level!',
  'need a druid for the frost dragons', 'brb, depot', 'that ue was huge', 'trading a fur backpack', 'hi :)',
  'watch out, bandits north of town', 'who wants to party? shared exp on', 'afk 2 min',
];

interface BotState {
  s: Session;
  home: { x: number; y: number; z: number };
  next: number;
  talk: number;
}

/** Best equipment a level-`lvl` character of this vocation may wear, per slot. */
function bestGear(voc: Vocation, lvl: number): ItemDef[] {
  const best = new Map<string, ItemDef>();
  const score = (d: ItemDef) => (d.attack ?? 0) * 2 + (d.armor ?? 0) * 3 + (d.defense ?? 0) + (d.magicDamage ? d.magicDamage[1] : 0);
  for (const d of Object.values(ITEMS)) {
    const slot = equipSlotFor(d);
    if (!slot || slot === 'backpack' || slot === 'ammo') continue;
    if (d.level && d.level > lvl) continue;
    if (d.vocations && !d.vocations.includes(voc)) continue;
    if (slot === 'weapon') {
      const wt = d.weaponType;
      const ok = voc === 'knight' ? wt === 'sword' || wt === 'axe' || wt === 'club'
        : voc === 'paladin' ? wt === 'throwing'
        : voc === 'sorcerer' ? wt === 'wand' : wt === 'rod';
      if (!ok) continue;
    }
    if (slot === 'shield' && voc !== 'knight' && voc !== 'paladin') continue;
    const cur = best.get(slot);
    if (!cur || score(d) > score(cur)) best.set(slot, d);
  }
  return [...best.values()];
}

export class Bots {
  private bots: BotState[] = [];

  constructor(private readonly game: Game, count: number, level: number) {
    const towns = game.world.regions.filter((r) => r.temple && r.safe);
    for (let i = 0; i < Math.min(count, NAMES.length); i++) {
      const voc = VOCS[i % VOCS.length];
      const s = game.addPlayer(`${NAMES[i]} [Bot]`, { intent: new BufferedIntent(), vocation: voc });
      s.bot = true;
      setLevel(game, s, level);
      for (const d of bestGear(voc, level)) {
        const slot = equipSlotFor(d);
        if (slot) s.inventory.equipment[slot] = { id: d.id, qty: 1 };
      }
      if (voc === 'paladin') {
        const spear = Object.values(ITEMS).filter((d) => d.weaponType === 'throwing' && (!d.level || d.level <= level)).sort((a, b) => (b.attack ?? 0) - (a.attack ?? 0))[0];
        if (spear) s.inventory.equipment.weapon = { id: spear.id, qty: 50 };
      }
      game.refreshStats(s);
      s.player.hp = s.player.maxHp;
      s.player.mana = s.player.maxMana;
      // start in a town (spread over the towns)
      const t = towns[i % Math.max(1, towns.length)]?.temple ?? game.world.temple;
      game.teleport(s.player, t.x, t.y, t.z ?? 0);
      this.bots.push({ s, home: { x: t.x, y: t.y, z: t.z ?? 0 }, next: Math.random() * 3, talk: 20 + Math.random() * 60 });
    }
  }

  get ids(): Set<number> {
    return new Set(this.bots.map((b) => b.s.id));
  }

  update(dt: number): void {
    const g = this.game;
    for (const b of this.bots) {
      const p = b.s.player;
      if (!g.sessions.has(b.s.id)) continue;
      b.talk -= dt;
      if (b.talk <= 0) {
        b.talk = 45 + Math.random() * 120;
        if (g.players().some((o) => !o.dead && o.id !== p.id && !this.ids.has(o.id) && o.z === p.z && chebyshev(o.x, o.y, p.x, p.y) < 20)) {
          g.say(p.id, LINES[Math.floor(Math.random() * LINES.length)]);
        }
      }
      if (p.dead) continue;
      // keep alive: heal when hurt
      if (p.hp < p.maxHp * 0.55) {
        const heal = p.vocation === 'knight' ? 'exura_ico' : p.vocation === 'paladin' ? 'exura_gran' : 'exura_vita';
        executeCommand(g, p.id, { c: 'cast', spell: heal } as never);
        if (p.hp < p.maxHp * 0.3) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25); // a "potion"
      }
      if (p.mana < p.maxMana * 0.3) p.mana = Math.min(p.maxMana, p.mana + p.maxMana * 0.05);
      b.next -= dt;
      if (b.next > 0) continue;
      b.next = 4 + Math.random() * 5;
      if (p.targetId !== null && g.getCreature(p.targetId) && !g.getCreature(p.targetId)!.dead) continue;
      // hunt something close, otherwise wander around home
      const foe = g.enemies.find((e) => !e.dead && e.z === p.z && chebyshev(e.x, e.y, p.x, p.y) <= 7 && !g.world.isSafe(e.x, e.y, e.z));
      if (foe && Math.random() < 0.8) {
        executeCommand(g, p.id, { c: 'attack', id: foe.id });
        continue;
      }
      if (p.moving || p.path.length) continue;
      const far = chebyshev(p.x, p.y, b.home.x, b.home.y) > 28;
      for (let tries = 0; tries < 12; tries++) {
        const r = far ? 6 : 10;
        const x = (far ? b.home.x : p.x) + Math.floor((Math.random() * 2 - 1) * r);
        const y = (far ? b.home.y : p.y) + Math.floor((Math.random() * 2 - 1) * r);
        if (g.world.inBounds(x, y) && g.world.isWalkable(x, y, p.z)) {
          // short search only: a bot just picks another spot if this one is out of reach
          if (g.commandMoveTo(p.id, x, y, 700)) break;
        }
      }
    }
  }
}
